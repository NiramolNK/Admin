// ════════════════════════════════════════════════════════════════════════
// NiRM Roster — safeStorage.js  (v2 — ancestor-tracked CAS)
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
// Public API unchanged:
//   get(key) | set(key, value) | delete(key) | list(prefix)
// ════════════════════════════════════════════════════════════════════════

import { supabase } from "./supabase.js";

const TABLE = "kv_state";
const MAX_RETRIES = 6;

// latest[key] = { value, version }   ← server truth (realtime-fresh)
// shadow[key] = { value, version }   ← merge ancestor (this tab's last read/write)
const latest = new Map();
const shadow = new Map();

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
// records at once (wiped Poi's signature, reverted the English full names,
// made Marker's docs look lost). Arrays whose elements all carry a unique
// `id` (agents, invoices, shifts…) now merge PER RECORD, recursing into each
// element, so concurrent tabs only ever conflict on the same record's same
// field. Arrays without stable ids keep the old saver-wins behaviour.
const recId = (e) => (isObj(e) && e.id != null ? String(e.id) : null);
const isKeyedArray = (arr) =>
  Array.isArray(arr) &&
  arr.every((e) => recId(e) !== null) &&
  new Set(arr.map(recId)).size === arr.length;

function mergeKeyedArrays(baseA, localA, remoteA) {
  const bm = new Map(baseA.map((e) => [recId(e), e]));
  const lm = new Map(localA.map((e) => [recId(e), e]));
  const rm = new Map(remoteA.map((e) => [recId(e), e]));
  // Local's order first (the saver's view), then remote-only records appended.
  const ids = [...new Set([...localA.map(recId), ...remoteA.map(recId)])];
  const out = [];
  for (const id of ids) {
    const b = bm.get(id), l = lm.get(id), r = rm.get(id);
    const localDeleted = !lm.has(id) && bm.has(id);
    const remoteDeleted = !rm.has(id) && bm.has(id);
    if (localDeleted && deepEqual(r, b)) continue; // deleted here, untouched there
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
    // Ancestor may be missing/{}/empty when this tab never read the key —
    // an empty base makes the merge a pure union (never drops a record).
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

// ─── server ops — these touch `latest` ONLY, never `shadow` ──────────────

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

// ─── the write path — CAS gated on the ANCESTOR version ──────────────────

async function casWrite(key, storedValue) {
  // Ancestor = what this tab last read/wrote. If this tab never read the
  // key, use an empty object so the merge UNIONS both sides (never drops).
  let anc = shadow.get(key);
  if (!anc && !latest.has(key)) await fetchOne(key);
  if (!anc && latest.has(key)) {
    anc = { value: {}, version: latest.get(key).version };
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (!anc) {
      // Key doesn't exist anywhere yet → insert; on race, refetch & retry.
      const { data, error } = await supabase
        .from(TABLE)
        .insert({ key, value: storedValue, version: 1 })
        .select("version")
        .maybeSingle();
      if (!error && data) {
        latest.set(key, { value: storedValue, version: data.version });
        shadow.set(key, { value: storedValue, version: data.version });
        return storedValue;
      }
      const row = await fetchOne(key);
      if (row) anc = { value: {}, version: row.version };
      continue;
    }

    const nextVersion = anc.version + 1;
    const { data, error } = await supabase
      .from(TABLE)
      .update({ value: storedValue, version: nextVersion })
      .eq("key", key)
      .eq("version", anc.version)   // ← gate on ANCESTOR, not realtime-fresh
      .select("version");
    if (error) throw error;

    if (data && data.length > 0) {
      latest.set(key, { value: storedValue, version: nextVersion });
      shadow.set(key, { value: storedValue, version: nextVersion });
      return storedValue;
    }

    // CAS failed: server moved past our ancestor. Merge and retry against
    // the server's CURRENT version — ancestor VALUE stays the true ancestor.
    const remote = await fetchOne(key);
    if (!remote) { anc = null; continue; } // row vanished → retry as insert
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
          latest.set(row.key, { value: row.value, version: row.version });
        }
        window.dispatchEvent(new CustomEvent("nirm-storage-sync"));
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        fetchAll().catch((e) =>
          console.error("[safeStorage] refetch after reconnect failed", e)
        );
      }
    });

  window.storage = {
    async get(key) {
      let row = latest.get(key);
      if (!row) {
        const fetched = await fetchOne(key);
        if (!fetched) return null;
        row = latest.get(key);
      }
      // Reading advances the ancestor: the app now KNOWS this value.
      shadow.set(key, { value: row.value, version: row.version });
      return { key, value: fromStored(row.value), shared: true };
    },

    async set(key, value /*, shared */) {
      const stored = await casWrite(key, toStored(value));
      return { key, value: fromStored(stored), shared: true };
    },

    async delete(key) {
      const { error } = await supabase.from(TABLE).delete().eq("key", key);
      if (error) throw error;
      latest.delete(key); shadow.delete(key);
      return { key, deleted: true, shared: true };
    },

    async list(prefix = "") {
      const keys = [...latest.keys()].filter((k) => k.startsWith(prefix));
      return { keys, prefix, shared: true };
    },
  };

  // FIX (SINGLE-LAYER): announce that kv_state is the live store. The legacy
  // supabase.js app_state shim checks this flag and goes fully silent —
  // no writes, no realtime application, no reconnect reloads. Two live
  // storage layers caused the 2026-07-08 brand-allocation wipe.
  window.__nirmKvActive = true;
  console.info("[safeStorage] v2 installed — ancestor-tracked CAS active");
}
