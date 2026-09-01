// ════════════════════════════════════════════════════════════════════════
// NiRM Roster — safeStorage.js  (v3.4 — per-record store + CAS backoff)
//
// v3.4 (2026-09-01, after the write-storm outage): CAS retries now back off
// with jitter instead of firing back-to-back. See `backoff` below.
//
// v2 FIX: v1 had a design flaw — the realtime handler advanced the CAS
// version, so a tab whose REACT STATE was stale could still pass the CAS
// gate and overwrite fresh data without ever triggering the merge.
//
// v2 keeps TWO maps:
//   latest — what the server has right now (updated by realtime/refetch)
//   shadow — the ancestor: what THIS tab last read or wrote. Only get()
//            and a successful set() may advance it. Realtime NEVER touches
//            it. CAS gates on shadow.version, so a save based on stale app
//            state always fails the gate → 3-way merge → nothing lost.
//
// v3 (2026-08-18, after the sign-day clobber incident): agents and invoices
// no longer live inside ONE shared kv_state array — the whole-array
// last-writer-wins failure wiped signatures, doc links and submitted
// invoices the first day ten agents saved concurrently. They now live in
// the `kv_records` table, ONE ROW PER RECORD (domain,id), each row with its
// own CAS version. Saving one agent physically cannot touch another agent's
// row. The window.storage API is UNCHANGED: set('nirm-agents', array) is
// diffed against this tab's ancestor and only the records that actually
// changed are written; records this tab never saw are untouched — a stale
// tab can no longer delete or revert what it doesn't know about.
//
// Public API unchanged:
//   get(key) | set(key, value) | delete(key) | list(prefix)
// ════════════════════════════════════════════════════════════════════════

import { supabase } from "./supabase.js";

const TABLE = "kv_state";
const RECORDS_TABLE = "kv_records";
const MAX_RETRIES = 6;

// ─── CAS retry backoff ────────────────────────────────────────────────────
// INCIDENT 2026-09-01 03:00-03:39: the retry loops below used to fire
// back-to-back with no delay at all. Two clients that collided once collided
// again immediately, and again, for all six attempts — one set() became six
// PATCHes and six GETs in the time the network took to answer, and the
// database saw 1,792 kv_state writes in an hour, a 23-second average response
// time, and a Postgres restart at 03:26.
//
// The exponential part spaces the attempts out. The JITTER is the part that
// actually matters: without it two clients back off by the same amount and
// re-collide on every single pass, in lockstep, forever. Randomising the wait
// is what lets one of them win.
//
// Worst case adds roughly 2.4s to a save that is losing every race, which is
// the correct trade — that save was never going to land quickly anyway, and
// hammering made it slower for everybody including itself.
const backoff = (attempt) => {
  const base = Math.min(50 * 2 ** (attempt - 1), 800);  // 50,100,200,400,800,800
  const wait = base * (0.5 + Math.random());            // ±50% jitter
  return new Promise((r) => setTimeout(r, wait));
};

// Per-tab id stamped on every write, so this tab can recognise the realtime
// echo of its OWN write and ignore it.
//
// v3.1 FIX (2026-08-19): v3 dropped the own-echo check the legacy shim had.
// Postgres echoes your own write back to you; the handler applied it to
// `latest`, broadcast it, and the app's sync handler re-applied that value
// over React state that already contained NEWER local edits — then saved the
// stale value back. Symptom: click two roster cells quickly and the second
// one disappears. Now an echo carrying our own stamp is dropped on arrival.
const CLIENT_ID =
  (globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// ─── Bulk-delete guard ────────────────────────────────────────────────────
// INCIDENT 2026-08-21 10:58: one save tombstoned all 21 agent records that
// had a login account, in a single moment. The mechanism is in
// setRecordDomain: any id the tab holds in its ancestor but which is MISSING
// from the array being saved gets deleted. That is correct for a real
// per-record delete and catastrophic for a save carrying a truncated list.
//
// kv_state already had this protection ("Refused: userAccounts shrank from 19
// to 3", July) — the per-record store never got one. This is that guard.
//
// A genuine removal is one agent at a time from the Teams tab, so anything
// past a handful is a bug, not an intention. Writes still go through; only
// the deletions are refused, and the domain is re-read from the server so the
// tab stops believing its short list.
const MAX_BULK_DELETE = 3;

// Keys stored per-record in kv_records instead of as one kv_state blob.
// Every element of these arrays MUST carry a unique `id` (they do: agents
// use pcode-style ids, invoices use `${agentId}__${period}`).
const RECORD_DOMAINS = new Set(["nirm-agents", "nirm-invoices"]);

// latest[key] = { value, version }   ← server truth (realtime-fresh)
// shadow[key] = { value, version }   ← merge ancestor (this tab's last read/write)
const latest = new Map();
const shadow = new Map();

// Per-record equivalents: Map<domain, Map<id, {value, version}>>
const recLatest = new Map();
const recShadow = new Map();
// domain -> Set of ids that have been deliberately deleted. A record here is
// NOT resurrected, however convinced a stale tab is that it still exists.
const tombstones = new Map();
const domainSet = (store, domain) => {
  if (!store.has(domain)) store.set(domain, new Set());
  return store.get(domain);
};
const domainMap = (store, domain) => {
  if (!store.has(domain)) store.set(domain, store === tombstones ? new Set() : new Map());
  return store.get(domain);
};

// ─── helpers ──────────────────────────────────────────────────────────────

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

// 3-way merge: ancestor vs local (this tab's save) vs remote (server now).
// Keep both sides' changes; same-leaf conflict → the active saver wins
// for that leaf only.
//
// v2.1 FIX (2026-08-18 clobber incident): arrays used to be unmergeable —
// any conflict on an array fell through to "local wins", so a tab holding a
// STALE copy of nirm-agents that saved ONE agent's change rewrote ALL 19
// records at once. Arrays whose elements all carry a unique `id` now merge
// PER RECORD. (v3 moves agents/invoices out of arrays entirely, but this
// merge still protects any other keyed array kept in kv_state.)
// v3.2 FIX (2026-08-19 audit): `nirm-userAccounts` is an array of
// { username, password, role } with NO id, so isKeyedArray rejected it and the
// merge fell through to "whoever saved last wins the whole list" — the exact
// failure that destroyed the roster, still live on the list that controls who
// can log in. Treating a natural unique field as the identity makes those
// arrays merge per record like everything else.
const ID_FIELDS = ["id", "username", "email", "key"];
const recId = (e) => {
  if (!isObj(e)) return null;
  for (const f of ID_FIELDS) {
    if (e[f] == null || e[f] === "") continue;
    // `id` IS the primary key of kv_records — it must be byte-identical to the
    // stored row id. Lower-casing it renamed every A-prefixed agent ("A01" →
    // "a01") through a delete-and-reinsert on the next save. Only the
    // human-entered identifiers are case-folded.
    return f === "id" ? String(e[f]) : String(e[f]).toLowerCase();
  }
  return null;
};
const isKeyedArray = (arr) =>
  Array.isArray(arr) &&
  arr.every((e) => recId(e) !== null) &&
  new Set(arr.map(recId)).size === arr.length;

function mergeKeyedArrays(baseA, localA, remoteA) {
  const bm = new Map(baseA.map((e) => [recId(e), e]));
  const lm = new Map(localA.map((e) => [recId(e), e]));
  const rm = new Map(remoteA.map((e) => [recId(e), e]));
  const ids = [...new Set([...localA.map(recId), ...remoteA.map(recId)])];
  const out = [];
  for (const id of ids) {
    const b = bm.get(id), l = lm.get(id), r = rm.get(id);
    const localDeleted = !lm.has(id) && bm.has(id);
    const remoteDeleted = !rm.has(id) && bm.has(id);
    if (localDeleted && deepEqual(r, b)) continue;
    if (remoteDeleted && deepEqual(l, b)) continue;
    const merged = threeWayMerge(b, lm.has(id) ? l : r, rm.has(id) ? r : l);
    if (merged !== undefined) out.push(merged);
  }
  return out;
}

function threeWayMerge(baseV, local, remote) {
  if (deepEqual(local, baseV)) return remote;
  if (deepEqual(remote, baseV)) return local;
  if (isKeyedArray(local) && isKeyedArray(remote) && local.length && remote.length) {
    const baseA = isKeyedArray(baseV) ? baseV : [];
    return mergeKeyedArrays(baseA, local, remote);
  }
  if (isObj(baseV) && isObj(local) && isObj(remote)) {
    const keys = new Set([
      ...Object.keys(baseV), ...Object.keys(local), ...Object.keys(remote),
    ]);
    const out = {};
    for (const k of keys) {
      const b = baseV[k], l = local[k], r = remote[k];
      const localDeleted = !(k in local) && (k in baseV);
      const remoteDeleted = !(k in remote) && (k in baseV);
      if (localDeleted && deepEqual(r, b)) continue;
      if (remoteDeleted && deepEqual(l, b)) continue;
      const merged = threeWayMerge(b, k in local ? l : r, k in remote ? r : l);
      if (merged !== undefined) out[k] = merged;
    }
    return out;
  }
  return local;
}

// Strings that are JSON get stored parsed so merging works;
// get() re-stringifies so the component sees exactly what it saved.
const toStored = (v) => (typeof v === "string" ? tryParse(v) : v);
function tryParse(s) {
  try { return { __wasString: true, v: JSON.parse(s) }; }
  catch { return { __wasString: true, raw: s }; }
}
function fromStored(v) {
  if (isObj(v) && v.__wasString) {
    return "raw" in v ? v.raw : JSON.stringify(v.v);
  }
  return v;
}
const mergeable = (v) => (isObj(v) && v.__wasString && "v" in v ? v.v : v);
const remergeable = (orig, merged) =>
  isObj(orig) && orig.__wasString && "v" in orig
    ? { __wasString: true, v: merged }
    : merged;

// ─── kv_state server ops — these touch `latest` ONLY, never `shadow` ──────

async function fetchAll() {
  const { data, error } = await supabase.from(TABLE).select("key,value,version");
  if (error) throw error;
  latest.clear();
  for (const row of data || []) {
    latest.set(row.key, { value: row.value, version: row.version });
  }
}

async function fetchOne(key) {
  const { data, error } = await supabase
    .from(TABLE).select("key,value,version").eq("key", key).maybeSingle();
  if (error) throw error;
  if (data) latest.set(key, { value: data.value, version: data.version });
  else latest.delete(key);
  return data;
}

// ─── kv_state write path — CAS gated on the ANCESTOR version ─────────────

async function casWrite(key, storedValue) {
  let anc = shadow.get(key);
  if (!anc && !latest.has(key)) await fetchOne(key);
  if (!anc && latest.has(key)) {
    // v3.1 FIX (2026-08-19): this tab has NO true ancestor for the key — it
    // never read it (the row didn't exist at load, or another component read
    // it). Arming the CAS with the server's CURRENT version made the update
    // succeed on the first try and replace the whole value, skipping the
    // merge entirely — a silent whole-key clobber by a tab that never saw
    // the data. (Almost certainly the unexplained 2026-07 allBrandAsgn wipe.)
    // Version -1 can never match, so the CAS always fails once and the
    // empty-ancestor UNION merge below runs — nothing is ever dropped.
    anc = { value: {}, version: -1 };
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Space out every attempt after the first — see `backoff` above.
    if (attempt > 0) await backoff(attempt);
    if (!anc) {
      const { data, error } = await supabase
        .from(TABLE)
        .insert({ key, value: storedValue, version: 1, updated_by: CLIENT_ID })
        .select("version")
        .maybeSingle();
      if (!error && data) {
        latest.set(key, { value: storedValue, version: data.version });
        shadow.set(key, { value: storedValue, version: data.version });
        return storedValue;
      }
      const row = await fetchOne(key);
      // version -1 can never match, so the next pass fails the gate and runs
      // the empty-ancestor UNION merge. Using row.version here (as this line
      // did) let the update succeed first try and replace the whole key with
      // no merge at all.
      if (row) anc = { value: {}, version: -1 };
      continue;
    }

    const nextVersion = anc.version + 1;
    const { data, error } = await supabase
      .from(TABLE)
      .update({ value: storedValue, version: nextVersion, updated_by: CLIENT_ID })
      .eq("key", key)
      .eq("version", anc.version)
      .select("version");
    if (error) throw error;

    if (data && data.length > 0) {
      latest.set(key, { value: storedValue, version: nextVersion });
      shadow.set(key, { value: storedValue, version: nextVersion });
      return storedValue;
    }

    const remote = await fetchOne(key);
    if (!remote) { anc = null; continue; }
    const merged = remergeable(
      storedValue,
      threeWayMerge(
        mergeable(anc.value),
        mergeable(storedValue),
        mergeable(remote.value)
      )
    );
    storedValue = merged;
    anc = { value: anc.value, version: remote.version };
  }
  throw new Error(
    `Storage conflict on "${key}" persisted after ${MAX_RETRIES} retries — ` +
    "please refresh and re-apply your last change."
  );
}

// ─── per-record store (kv_records) ────────────────────────────────────────

async function fetchDomain(domain) {
  const { data, error } = await supabase
    .from(RECORDS_TABLE)
    .select("id,value,version,deleted_at")
    .eq("domain", domain);
  if (error) throw error;
  const m = new Map();
  const dead = new Set();
  for (const row of data || []) {
    if (row.deleted_at) { dead.add(row.id); continue; }   // tombstoned — gone
    m.set(row.id, { value: row.value, version: row.version });
  }
  recLatest.set(domain, m);
  tombstones.set(domain, dead);
  return m;
}

async function fetchRecord(domain, id) {
  const { data, error } = await supabase
    .from(RECORDS_TABLE)
    .select("id,value,version,deleted_at")
    .eq("domain", domain)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  const m = domainMap(recLatest, domain);
  if (data && !data.deleted_at) {
    m.set(id, { value: data.value, version: data.version });
    domainMap(tombstones, domain).delete(id);
  } else {
    m.delete(id);
    if (data?.deleted_at) domainMap(tombstones, domain).add(id);
  }
  return data && !data.deleted_at ? data : null;
}

// Assemble the domain into the array shape the app has always used.
function assembleDomain(domain) {
  const m = recLatest.get(domain) || new Map();
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, r]) => r.value);
}

// CAS write for ONE record; on conflict, 3-way merge just this record.
async function casWriteRecord(domain, id, newValue) {
  // Deleted means deleted. Without this, a tab that still had the record in
  // memory re-created it on its next save — which is exactly how nine removed
  // agents reappeared on 2026-08-19.
  if (domainMap(tombstones, domain).has(id)) {
    domainMap(recShadow, domain).delete(id);
    return;
  }
  let anc = domainMap(recShadow, domain).get(id) || null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Space out every attempt after the first — see `backoff` above.
    if (attempt > 0) await backoff(attempt);
    if (!anc) {
      const { data, error } = await supabase
        .from(RECORDS_TABLE)
        .insert({ domain, id, value: newValue, version: 1, updated_by: CLIENT_ID })
        .select("version")
        .maybeSingle();
      if (!error && data) {
        domainMap(recLatest, domain).set(id, { value: newValue, version: data.version });
        domainMap(recShadow, domain).set(id, { value: newValue, version: data.version });
        return;
      }
      // Insert raced an existing row — merge onto it with an EMPTY ancestor
      // (pure union: never drops the other side's fields).
      // v3.1 FIX: force the union-merge path rather than gating on the
      // server's current version (which would clobber the remote record).
      const row = await fetchRecord(domain, id);
      if (row) anc = { value: {}, version: -1 };
      continue;
    }

    const nextVersion = anc.version + 1;
    const { data, error } = await supabase
      .from(RECORDS_TABLE)
      .update({ value: newValue, version: nextVersion, updated_at: new Date().toISOString(), updated_by: CLIENT_ID })
      .eq("domain", domain)
      .eq("id", id)
      .eq("version", anc.version)
      .select("version");
    if (error) throw error;

    if (data && data.length > 0) {
      domainMap(recLatest, domain).set(id, { value: newValue, version: nextVersion });
      domainMap(recShadow, domain).set(id, { value: newValue, version: nextVersion });
      return;
    }

    const remote = await fetchRecord(domain, id);
    if (!remote) { anc = null; continue; }

    // v3.2 FIX (2026-08-19 audit): field-by-field merging is right for a
    // profile (name here, bank details there) but WRONG for a workflow record.
    // An invoice merged leaf-by-leaf could come out stamped "approved" by the
    // manager while carrying the amounts from the agent's simultaneous
    // resubmission — an approval for a number nobody approved. Worse, a stale
    // tab could merge "manager_approved" back over "sent_to_finance" and put
    // an already-paid invoice into the next batch.
    // If the status moved underneath us, this write is based on a world that
    // no longer exists: keep the server's version and tell the caller.
    const ancS = isObj(anc.value) ? anc.value.status : undefined;
    const remS = isObj(remote.value) ? remote.value.status : undefined;
    const newS = isObj(newValue) ? newValue.status : undefined;
    if (ancS !== undefined && remS !== ancS && newS !== remS) {
      // Do NOT touch the ancestor here. An earlier version advanced it to the
      // server's version before throwing, which disarmed the compare-and-swap:
      // the caller's retry two seconds later then matched on that version and
      // wrote the stale record straight over the newer one — silently undoing
      // an approval. Leaving the ancestor alone means every retry keeps
      // failing the gate, which is the safe direction.
      const err = new Error(
        `"${id}" was changed by someone else (${ancS} → ${remS}) while you had it open. ` +
        `Your change was not applied — reload NiRM to see its current state.`
      );
      err.conflict = true;      // callers must NOT retry this
      throw err;
    }

    newValue = threeWayMerge(anc.value, newValue, remote.value);
    anc = { value: anc.value, version: remote.version };
  }
  throw new Error(`Record conflict on ${domain}/${id} persisted after ${MAX_RETRIES} retries.`);
}

// Delete ONE record, but only if it hasn't changed since this tab read it —
// a delete must never erase an update it hasn't seen.
async function casDeleteRecord(domain, id) {
  const anc = domainMap(recShadow, domain).get(id);
  if (!anc) return; // never saw it → nothing to delete safely
  const { error } = await supabase
    .from(RECORDS_TABLE)
    .update({ deleted_at: new Date().toISOString(), version: anc.version + 1, updated_by: CLIENT_ID })
    .eq("domain", domain)
    .eq("id", id)
    .eq("version", anc.version);
  if (error) throw error;
  domainMap(tombstones, domain).add(id);
  // Whether we deleted it or someone updated it first (version moved on),
  // this tab no longer owns an ancestor for it.
  domainMap(recShadow, domain).delete(id);
  const row = await fetchRecord(domain, id);
  if (!row) domainMap(recLatest, domain).delete(id);
}

// set() for a record domain: diff the incoming array against THIS TAB's
// ancestor and touch only the records that actually changed here.
async function setRecordDomain(domain, arr) {
  const shadowM = domainMap(recShadow, domain);
  const incoming = new Map(arr.map((e) => [recId(e), e]));

  const latestM = domainMap(recLatest, domain);

  const writes = [];
  for (const [id, value] of incoming) {
    const anc = shadowM.get(id);
    if (anc && deepEqual(anc.value, value)) continue; // unchanged by this tab
    // Already matches server truth (e.g. a foreign update we just applied
    // to React state) → adopt it as ancestor, write nothing. Without this,
    // every tab would echo every foreign change back as a new version.
    const cur = latestM.get(id);
    if (cur && deepEqual(cur.value, value)) {
      shadowM.set(id, { value: cur.value, version: cur.version });
      continue;
    }
    writes.push(casWriteRecord(domain, id, value));
  }
  // Deletions: only ids this tab HAS SEEN (in its ancestor) and has now
  // removed. Records the tab never loaded are physically untouchable.
  const doomed = [];
  for (const id of shadowM.keys()) {
    if (!incoming.has(id)) doomed.push(id);
  }

  // BULK-DELETE GUARD (see MAX_BULK_DELETE at the top of this file).
  // Refuse the deletions, keep the writes, then re-read the domain from the
  // server so this tab stops acting on the short list it just tried to save.
  if (doomed.length > MAX_BULK_DELETE) {
    const detail = {
      at: new Date().toISOString(),
      domain,
      wouldDelete: doomed.length,
      keptWrites: writes.length,
      incomingSize: incoming.size,
      ancestorSize: shadowM.size,
      ids: doomed.slice(0, 50),
    };
    console.error(
      `[safeStorage] REFUSED bulk delete: ${domain} save would have removed ` +
      `${doomed.length} records (incoming array had ${incoming.size}, this tab ` +
      `knew ${shadowM.size}). Deletions blocked, writes kept. ` +
      `Ids: ${doomed.join(", ")}`);
    // Kept for diagnosis; the console is gone by the time anyone asks.
    try {
      globalThis.__nirmBlockedDeletes = globalThis.__nirmBlockedDeletes || [];
      globalThis.__nirmBlockedDeletes.push(detail);
      window.dispatchEvent(new CustomEvent("nirm-bulk-delete-refused", { detail }));
    } catch (e) { /* non-browser context */ }

    await Promise.all(writes);
    // Re-read server truth and hand it to the app, so React state stops
    // holding the truncated list that triggered this.
    try { await fetchDomain(domain); broadcastSync(); } catch (e) {}
    return assembleDomain(domain);
  }

  const deletes = doomed.map((id) => casDeleteRecord(domain, id));
  await Promise.all([...writes, ...deletes]);
  return assembleDomain(domain);
}

// Debounced foreign-update broadcast. Realtime delivers one event PER ROW,
// so a batch save from another tab would fire dozens of React cascades;
// coalesce them and hand the app a full per-key cache snapshot (the shape
// AllocationRoster's sync handler expects).
let syncTimer = null;
function broadcastSync() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    const cache = {};
    for (const [k, r] of latest) cache[k] = fromStored(r.value);
    for (const d of RECORD_DOMAINS) {
      // Always take these from the record store. Falling through to the legacy
      // kv_state blob when the domain is momentarily empty published a stale
      // roster to the app, which autosave then wrote back — deleting the
      // records the blob did not know about.
      if ((recLatest.get(d)?.size || 0) > 0) cache[d] = assembleDomain(d);
      else delete cache[d];
    }
    window.dispatchEvent(new CustomEvent("nirm-storage-sync", { detail: cache }));
  }, 200);
}

// One-time seed: if kv_records has no rows for a domain but the legacy
// kv_state blob does, split the blob into rows. (Normally already done by
// the server-side migration; this covers fresh environments.)
async function seedRecordsIfNeeded(domain) {
  const m = await fetchDomain(domain);
  if (m.size > 0) return;
  const legacy = latest.get(domain);
  const arr = legacy ? mergeable(legacy.value) : null;
  if (!Array.isArray(arr) || arr.length === 0 || !isKeyedArray(arr)) return;
  const rows = arr.map((e) => ({ domain, id: recId(e), value: e, version: 1 }));
  const { error } = await supabase
    .from(RECORDS_TABLE)
    .upsert(rows, { onConflict: "domain,id", ignoreDuplicates: true });
  if (error) throw error;
  await fetchDomain(domain);
  console.info(`[safeStorage] seeded ${rows.length} ${domain} records from legacy blob`);
}

// ─── one-time migration from the old single-blob table ───────────────────

async function migrateFromBlobIfNeeded() {
  const { count, error } = await supabase
    .from(TABLE).select("key", { count: "exact", head: true });
  if (error) throw error;
  if ((count ?? 0) > 0) return;

  const { data: old } = await supabase
    .from("app_state").select("data").maybeSingle();
  const blob = old?.data;
  if (!blob || !isObj(blob)) return;

  const rows = Object.entries(blob).map(([key, value]) => ({
    key, value: toStored(value), version: 1,
  }));
  if (rows.length === 0) return;
  await supabase.from(TABLE).upsert(rows, { onConflict: "key", ignoreDuplicates: true });
  console.info(`[safeStorage] migrated ${rows.length} keys from app_state blob`);
}

// ─── public install ───────────────────────────────────────────────────────

export async function installSafeStorage() {
  await migrateFromBlobIfNeeded();
  await fetchAll();
  for (const domain of RECORD_DOMAINS) await seedRecordsIfNeeded(domain);

  supabase
    .channel("kv_state_sync")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLE },
      (payload) => {
        // Realtime updates `latest` ONLY. It must NEVER advance `shadow`
        // (the ancestor) — that was the v1 bug that let stale tabs
        // slip past the CAS gate and wipe fresh data.
        if (payload.eventType === "DELETE") {
          const k = payload.old?.key;
          if (k) latest.delete(k);
        } else {
          const row = payload.new;
          // Our own write coming back. casWrite already updated `latest`;
          // re-applying it would push a now-stale value over newer local edits.
          if (row.updated_by === CLIENT_ID) return;
          latest.set(row.key, { value: row.value, version: row.version });
        }
        broadcastSync();
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // After a socket drop (laptop sleep, wifi change, phone lock) the
        // caches are refreshed here — but nothing told the app, so React state
        // stayed at whatever the tab had before the gap and the next save was
        // based on a stale world. Broadcast the refreshed state.
        fetchAll().then(broadcastSync).catch((e) =>
          console.error("[safeStorage] refetch after reconnect failed", e)
        );
      }
    });

  supabase
    .channel("kv_records_sync")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: RECORDS_TABLE },
      (payload) => {
        // Same discipline: realtime advances recLatest ONLY, never recShadow.
        if (payload.eventType === "DELETE") {
          const { domain, id } = payload.old || {};
          if (domain && id) domainMap(recLatest, domain).delete(id);
        } else {
          const row = payload.new;
          if (row.updated_by === CLIENT_ID) return;   // own echo — see CLIENT_ID
          if (row.deleted_at) {
            domainMap(recLatest, row.domain).delete(row.id);
            domainMap(tombstones, row.domain).add(row.id);
          } else {
            domainMap(tombstones, row.domain).delete(row.id);
            domainMap(recLatest, row.domain).set(row.id, { value: row.value, version: row.version });
          }
        }
        broadcastSync();
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        Promise.all([...RECORD_DOMAINS].map(fetchDomain)).then(broadcastSync).catch((e) =>
          console.error("[safeStorage] records refetch after reconnect failed", e)
        );
      }
    });

  window.storage = {
    async get(key) {
      if (RECORD_DOMAINS.has(key)) {
        if (!recLatest.has(key)) await fetchDomain(key);
        // Empty domain reads as null — same contract as a missing kv key,
        // so fresh environments still fall back to the app's defaults.
        if ((recLatest.get(key) || new Map()).size === 0) return null;
        // Reading advances the per-record ancestors: this tab now KNOWS
        // these exact record values.
        const shadowM = domainMap(recShadow, key);
        shadowM.clear();
        for (const [id, r] of recLatest.get(key) || []) {
          shadowM.set(id, { value: r.value, version: r.version });
        }
        return { key, value: assembleDomain(key), shared: true };
      }
      let row = latest.get(key);
      if (!row) {
        const fetched = await fetchOne(key);
        if (!fetched) return null;
        row = latest.get(key);
      }
      shadow.set(key, { value: row.value, version: row.version });
      return { key, value: fromStored(row.value), shared: true };
    },

    async set(key, value /*, shared */) {
      if (RECORD_DOMAINS.has(key)) {
        const arr = typeof value === "string" ? JSON.parse(value) : value;
        // Refuse a mass wipe: saving [] over a populated domain is always a
        // bug (transient init state), never intent. Explicit clears go
        // through delete(key).
        if (Array.isArray(arr) && arr.length === 0 && (recLatest.get(key)?.size || 0) > 0) {
          console.warn(`[safeStorage] ${key}: ignored save of empty array over ${recLatest.get(key).size} records`);
          return { key, value: assembleDomain(key), shared: true };
        }
        if (isKeyedArray(arr)) {
          const result = await setRecordDomain(key, arr);
          return { key, value: result, shared: true };
        }
        console.warn(`[safeStorage] ${key}: value is not a keyed array — falling back to blob save`);
      }
      const stored = await casWrite(key, toStored(value));
      return { key, value: fromStored(stored), shared: true };
    },

    async delete(key) {
      if (RECORD_DOMAINS.has(key)) {
        const { error } = await supabase.from(RECORDS_TABLE).delete().eq("domain", key);
        if (error) throw error;
        recLatest.delete(key); recShadow.delete(key);
        return { key, deleted: true, shared: true };
      }
      const { error } = await supabase.from(TABLE).delete().eq("key", key);
      if (error) throw error;
      latest.delete(key); shadow.delete(key);
      return { key, deleted: true, shared: true };
    },

    // v3.2 FIX (2026-08-19 audit): get() advances the merge ancestor, which is
    // only correct for the component that will also SAVE that key. Other
    // screens read shared keys just to display them (App.jsx re-reads accounts
    // on every token refresh; the Service Desk and Knowledge Base read brands),
    // and each of those reads silently re-anchored the ancestor — so the next
    // save from the roster passed the version check with no merge and
    // overwrote whatever another tab had done in between. peek() reads without
    // touching the ancestor; use it anywhere you are not the owner of the key.
    async peek(key) {
      if (RECORD_DOMAINS.has(key)) {
        if (!recLatest.has(key)) await fetchDomain(key);
        if ((recLatest.get(key) || new Map()).size === 0) return null;
        return { key, value: assembleDomain(key), shared: true };
      }
      let row = latest.get(key);
      if (!row) {
        const fetched = await fetchOne(key);
        if (!fetched) return null;
        row = latest.get(key);
      }
      return { key, value: fromStored(row.value), shared: true };
    },

    async list(prefix = "") {
      const keys = new Set([...latest.keys(), ...RECORD_DOMAINS]);
      return { keys: [...keys].filter((k) => k.startsWith(prefix)), prefix, shared: true };
    },
  };

  // FIX (SINGLE-LAYER): announce that kv_state is the live store. The legacy
  // supabase.js app_state shim checks this flag and goes fully silent —
  // no writes, no realtime application, no reconnect reloads. Two live
  // storage layers caused the 2026-07-08 brand-allocation wipe.
  window.__nirmKvActive = true;
  console.info("[safeStorage] v3.4 installed — per-record store active for", [...RECORD_DOMAINS].join(", "));
}
