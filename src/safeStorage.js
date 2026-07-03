// ════════════════════════════════════════════════════════════════════════
// NiRM Roster — safeStorage.js
// Fixes the last-write-wins data-loss bug.
//
// What it does:
//   • Stores each storage key as its own row in kv_state (not one big blob),
//     so people editing different things can never overwrite each other.
//   • Every write is a compare-and-swap on a version number. If someone
//     else saved first, the write is NOT applied blindly — we refetch,
//     3-way-merge (their changes + your changes), and retry.
//   • On realtime reconnect (sleeping tab, dropped wifi, resumed project)
//     the whole cache is refetched, so a stale tab can never clobber data.
//   • One-time automatic migration: if kv_state is empty, the old
//     app_state.data blob is split into per-key rows.
//
// Public API is identical to the old shim / artifact storage:
//   get(key)        → {key, value, shared} | null
//   set(key, value) → {key, value, shared}
//   delete(key)     → {key, deleted: true, shared}
//   list(prefix)    → {keys, prefix, shared}
// ════════════════════════════════════════════════════════════════════════

import { supabase } from "./supabase.js";

const TABLE = "kv_state";
const MAX_RETRIES = 5;

// cache[key] = { value, version }
// base[key]  = last value we KNOW the server had (merge ancestor)
const cache = new Map();
const base = new Map();

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

// 3-way merge: base = common ancestor, local = what THIS user wants to save,
// remote = what the server has now (someone else's save).
// Rule: keep both sides' changes; if both changed the same leaf, the person
// actively saving (local) wins — but only for that leaf, nothing else is lost.
function threeWayMerge(baseV, local, remote) {
  if (deepEqual(local, baseV)) return remote;  // we didn't change it → theirs
  if (deepEqual(remote, baseV)) return local;  // they didn't change it → ours
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
  return local; // conflicting scalar/array edit → saver wins for this leaf only
}

// The component sometimes calls set(key, JSON.stringify(obj)). Store the
// parsed object so merging works; get() re-stringifies for compatibility.
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

// ─── core ops ─────────────────────────────────────────────────────────────

async function fetchAll() {
  const { data, error } = await supabase.from(TABLE).select("key,value,version");
  if (error) throw error;
  cache.clear(); base.clear();
  for (const row of data || []) {
    cache.set(row.key, { value: row.value, version: row.version });
    base.set(row.key, row.value);
  }
}

async function fetchOne(key) {
  const { data, error } = await supabase
    .from(TABLE).select("key,value,version").eq("key", key).maybeSingle();
  if (error) throw error;
  if (data) {
    cache.set(key, { value: data.value, version: data.version });
    base.set(key, data.value);
  } else {
    cache.delete(key); base.delete(key);
  }
  return data;
}

async function casWrite(key, storedValue) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const cached = cache.get(key);

    if (!cached) {
      // New key → insert; if someone raced us, fall through to CAS update.
      const { data, error } = await supabase
        .from(TABLE)
        .insert({ key, value: storedValue, version: 1 })
        .select("version")
        .maybeSingle();
      if (!error && data) {
        cache.set(key, { value: storedValue, version: data.version });
        base.set(key, storedValue);
        return storedValue;
      }
      await fetchOne(key); // key exists now — retry as update
      continue;
    }

    const nextVersion = cached.version + 1;
    const { data, error } = await supabase
      .from(TABLE)
      .update({ value: storedValue, version: nextVersion })
      .eq("key", key)
      .eq("version", cached.version)   // ← compare-and-swap gate
      .select("version");
    if (error) throw error;

    if (data && data.length > 0) {
      cache.set(key, { value: storedValue, version: nextVersion });
      base.set(key, storedValue);
      return storedValue;
    }

    // CAS failed: someone else saved since we last read. Merge, retry.
    const baseV = base.get(key);
    const remote = await fetchOne(key);
    if (!remote) continue; // row deleted concurrently → retry as insert
    const merged = remergeable(
      storedValue,
      threeWayMerge(mergeable(baseV), mergeable(storedValue), mergeable(remote.value))
    );
    storedValue = merged;
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
  if ((count ?? 0) > 0) return; // already migrated

  const { data: old } = await supabase
    .from("app_state").select("data").maybeSingle();
  const blob = old?.data;
  if (!blob || !isObj(blob)) return;

  const rows = Object.entries(blob).map(([key, value]) => ({
    key, value: toStored(value), version: 1,
  }));
  if (rows.length === 0) return;
  // upsert-ignore so two tabs migrating at once can't duplicate
  await supabase.from(TABLE).upsert(rows, { onConflict: "key", ignoreDuplicates: true });
  console.info(`[safeStorage] migrated ${rows.length} keys from app_state blob`);
}

// ─── public install ───────────────────────────────────────────────────────

export async function installSafeStorage() {
  await migrateFromBlobIfNeeded();
  await fetchAll();

  // Realtime: keep every open tab's cache fresh…
  supabase
    .channel("kv_state_sync")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLE },
      (payload) => {
        if (payload.eventType === "DELETE") {
          const k = payload.old?.key;
          if (k) { cache.delete(k); base.delete(k); }
        } else {
          const row = payload.new;
          cache.set(row.key, { value: row.value, version: row.version });
          base.set(row.key, row.value);
        }
        window.dispatchEvent(new CustomEvent("nirm-storage-sync"));
      }
    )
    // …and on ANY reconnect, refetch everything so a stale tab can never
    // save from an outdated cache (the original data-loss hole).
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        fetchAll().catch((e) =>
          console.error("[safeStorage] refetch after reconnect failed", e)
        );
      }
    });

  // Replace window.storage — identical API to the old shim.
  window.storage = {
    async get(key) {
      const c = cache.get(key);
      if (c) return { key, value: fromStored(c.value), shared: true };
      const row = await fetchOne(key);
      return row ? { key, value: fromStored(row.value), shared: true } : null;
    },

    async set(key, value /*, shared */) {
      const stored = await casWrite(key, toStored(value));
      return { key, value: fromStored(stored), shared: true };
    },

    async delete(key) {
      const { error } = await supabase.from(TABLE).delete().eq("key", key);
      if (error) throw error;
      cache.delete(key); base.delete(key);
      return { key, deleted: true, shared: true };
    },

    async list(prefix = "") {
      const keys = [...cache.keys()].filter((k) => k.startsWith(prefix));
      return { keys, prefix, shared: true };
    },
  };

  console.info("[safeStorage] installed — per-key CAS storage active");
}
