// ════════════════════════════════════════════════════════════════════════════
// NiRM Roster — Supabase client and storage shim
// Drop this file into src/supabase.js. Import { initStorage, signIn, signOut,
// signUp, getCurrentRole, supabase } from "./supabase" in your component.
// ════════════════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

// ─── Early URL hash capture ────────────────────────────────────────────────
// FIX (round-10 password reset reliability): Supabase's createClient parses
// and CLEARS the URL hash (#access_token=...&type=recovery&...) synchronously
// during init. By the time any other module runs, the hash is gone. AND in
// some session states Supabase fires SIGNED_IN (not PASSWORD_RECOVERY), so
// our onAuthStateChange listener below can miss the recovery signal entirely.
//
// Capture the raw URL hash AT MODULE LOAD, before createClient executes, so
// App.jsx can reliably check `type=recovery` no matter what events fire.
const __earlyUrlHash =
  typeof window !== "undefined" ? (window.location.hash || "") : "";
const __earlyUrlSearch =
  typeof window !== "undefined" ? (window.location.search || "") : "";
const __earlyIsRecoveryLink =
  __earlyUrlHash.includes("type=recovery") ||
  __earlyUrlHash.includes("type%3Drecovery") ||
  __earlyUrlSearch.includes("type=recovery");
export function isEarlyRecoveryLink() { return __earlyIsRecoveryLink; }
export function getEarlyUrlHash() { return __earlyUrlHash; }

// ─── Configuration ─────────────────────────────────────────────────────────
// Set these via Vite env vars in .env.local:
//   VITE_SUPABASE_URL=https://xxxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=eyJhbGc...
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error(
    "Missing Supabase env vars. Add VITE_SUPABASE_URL and " +
    "VITE_SUPABASE_ANON_KEY to .env.local"
  );
}

// ─── SANDBOX ROUTING ──────────────────────────────────────────────────────
// The live site (nirmroster.vercel.app) reads and writes the real payroll
// data in the `public` schema. Any OTHER deployment - a Vercel preview
// build from a branch, or localhost - is a sandbox and is pointed at the
// `staging` schema instead: a full copy of the same tables with a copy of
// the data. Nothing tested in a sandbox can reach real payroll, and no
// configuration is required to keep it that way - it follows the URL.
//
// Vercel preview URLs look like nirmroster-git-<branch>-<team>.vercel.app,
// so anything that is not the exact production host is treated as a test.
const PROD_HOSTS = ["nirmroster.vercel.app"];
const IS_SANDBOX = typeof window !== "undefined" &&
  !PROD_HOSTS.includes(window.location.hostname);
export const DB_SCHEMA = IS_SANDBOX ? "staging" : "public";
if (IS_SANDBOX && typeof console !== "undefined") {
  console.warn("[NiRM] SANDBOX build — using the `staging` copy of the data. Real payroll is not affected.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true },
  db: { schema: DB_SCHEMA },
});

// ─── Recovery-flow detection (module-level) ────────────────────────────────
// FIX (password reset reliability v3): Supabase JS parses the URL hash
// (#access_token=...&type=recovery) inside createClient and clears the hash
// via history.replaceState. It then fires PASSWORD_RECOVERY from a microtask
// that runs before App.jsx mounts — so the App's useEffect listener is too
// late, and window.location.hash is already empty by the time we check it.
//
// Capture the event RIGHT HERE at module load time (synchronous with the
// createClient call above) so the subscription is on the queue before
// Supabase fires the event. App.jsx checks this flag on mount.
let _recoveryFlag = false;
supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") _recoveryFlag = true;
  else if (event === "SIGNED_OUT")   _recoveryFlag = false;
});
export function consumeRecoveryFlag() {
  // One-shot read — caller is responsible for treating it as a transient
  // signal. We don't clear it here because we want App.jsx and other
  // consumers to read the same value during the same mount cycle. The flag
  // is naturally reset on SIGNED_OUT or on the next module-load.
  return _recoveryFlag;
}
export function clearRecoveryFlag() { _recoveryFlag = false; }

// ─── Storage shim — replaces window.storage ────────────────────────────────
// The original component calls window.storage.get/set/delete/list with string
// keys. We map all keys onto a single JSON column in app_state.data so the
// existing code keeps working with zero changes.
//
// Behavior matches the artifact API:
//   get(key)        → {key, value, shared} | null
//   set(key, value) → {key, value, shared}
//   delete(key)     → {key, deleted, shared}
//   list(prefix)    → {keys, prefix, shared}
//
// Reads come from an in-memory cache that's kept fresh via Realtime.
// Writes hit the database, then the Realtime broadcast updates other clients.

let stateCache = {};
let cacheLoaded = false;
let subscribers = new Set();
let realtimeChannel = null;

// FIX (data-loss bug #4 from senior-dev review — full version):
// Two-layer concurrency control:
//
//  1. Per-tab CLIENT_ID stamp on every write so a tab can ignore the
//     realtime echo of its own write (preserves any local edits made
//     during the save window).
//
//  2. Optimistic locking via the `updated_at` column. Every save sends a
//     conditional UPDATE that only succeeds if `updated_at` hasn't moved
//     since we last loaded. On conflict, we reload the latest server
//     state, merge our pending local writes on top, and retry (up to
//     3 times). This is what prevents a stale tab from blindly clobbering
//     newer writes from another tab.
//
//  3. `pendingWrites` tracks every set/delete made by THIS tab since our
//     last successful save. After a conflict reload, we replay these
//     on top of the new server state so our edits aren't lost.
const CLIENT_ID =
  (globalThis.crypto && globalThis.crypto.randomUUID
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36));

// Sentinel marking that a key was deleted locally (so the conflict-merge
// path can re-apply the delete onto the freshly-reloaded server state).
const TOMBSTONE = Symbol.for("nirm.tombstone.v1");

// Server's `updated_at` as we last observed it (load OR successful save OR
// realtime echo from another client). Used as the WHERE-clause version
// anchor on the next save.
let lastKnownUpdatedAt = null;

// Map of key → value (or TOMBSTONE) modified locally since the last
// successful save. Snapshot-and-clear at save start, restore on failure.
let pendingWrites = {};

let lastSentBy = null;
let saveInFlight = false;

// FIX (data-loss pass): remembered once per session — true when the v2
// merge-safe RPC isn't installed on the server yet (fallback to v1).
let patchV2Missing = false;

// FIX (review round 2): the previous load swallowed errors silently and left
// lastKnownUpdatedAt = null, which made the next save unconditionally clobber
// whatever was on the server. Now we surface the failure and refuse to save
// until a successful load lands.
let loadFailed = false;

// FIX (review round 2): if a foreign realtime update arrives WHILE we're
// mid-save, the previous code silently dropped it and left stateCache stale.
// Now we buffer the latest such payload and re-merge after our save completes.
let pendingForeignUpdate = null;

async function loadCache() {
  const { data, error } = await supabase
    .from("app_state")
    .select("data, updated_at")
    .eq("id", "main")
    .single();
  if (error) {
    console.error("Failed to load app_state:", error);
    loadFailed = true;
    return;
  }
  stateCache = data?.data || {};
  lastKnownUpdatedAt = data?.updated_at || null;
  cacheLoaded = true;
  loadFailed = false;
  subscribers.forEach((fn) => fn(stateCache));
}

// FIX (review round 3, suggestion #7): single code path that knows how
// to mutate stateCache for one (key, value-or-TOMBSTONE) pair. set/delete
// AND the conflict-resolution merge AND the realtime echo merge all go
// through this so the semantics live in exactly one place.
function _applyToCache(key, valueOrTombstone) {
  if (valueOrTombstone === TOMBSTONE) {
    if (key in stateCache) {
      const next = { ...stateCache };
      delete next[key];
      stateCache = next;
    }
  } else {
    stateCache = { ...stateCache, [key]: valueOrTombstone };
  }
}

// Apply every (key, value) entry from `writes` on top of stateCache.
// Used by the conflict-merge path and the realtime handler.
function _applyPendingWritesOnTop(writes) {
  for (const k of Object.keys(writes)) {
    _applyToCache(k, writes[k]);
  }
}

async function saveCache(updatedBy) {
  // FIX (SINGLE-LAYER, 2026-07-08 wipe root cause): once safeStorage v2
  // (kv_state, per-key CAS + 3-way merge) is installed it is THE store.
  // This legacy app_state writer must go silent — its writes made app_state
  // a stale second copy of the world, and the reconnect handler below then
  // pushed that stale copy back into React state, which autosave dutifully
  // saved over kv_state: that is exactly how July's brand allocation (and
  // an extra-hours entry) got deleted. Legacy writes now no-op.
  if (typeof window !== "undefined" && window.__nirmKvActive) {
    pendingWrites = {};
    return;
  }
  // FIX (review round 2): refuse to save if our last load failed.
  if (loadFailed) {
    const e = new Error("[supabase] Refusing to save: initial load failed, in-memory state is untrusted");
    console.error(e);
    throw e;
  }

  // Snapshot the writes we're about to flush. On error we restore them so
  // the next scheduleSave picks them up.
  const writesAtSave = { ...pendingWrites };
  pendingWrites = {};

  saveInFlight = true;
  lastSentBy = CLIENT_ID;
  const stampedUpdatedBy = updatedBy ? `${updatedBy}#${CLIENT_ID}` : `__client__#${CLIENT_ID}`;

  // FIX (per-domain split): split pending writes into per-key patches and
  // per-key deletes. We then call the `app_state_patch` RPC which uses
  // Postgres jsonb merge (`||`) to apply ONLY the affected keys. Other keys
  // in the data column are left untouched — so a concurrent client editing
  // a different key never collides with our save. Postgres row-level locks
  // serialize concurrent writes, so two clients writing different keys
  // succeed in order with no clobbering.
  //
  // This replaces the previous optimistic-lock + conflict-resolution +
  // retry path, which was needed when a save sent the WHOLE data column
  // (every key, every time). With per-key patches there's no whole-blob
  // clobber to detect — same-key concurrent writes still last-writer-wins
  // (acceptable for our use case), and the architectural fix in
  // AllocationRoster's storage subscriber keeps React state fresh.
  const updates = {};
  const deletes = [];
  for (const [k, v] of Object.entries(writesAtSave)) {
    if (v === TOMBSTONE) deletes.push(k);
    else updates[k] = v;
  }

  try {
    // FIX (data-loss pass): prefer app_state_patch_v2, which deep-merges the
    // month-keyed collaborative keys (nirm-allAsgn / nirm-allExtraHrs /
    // nirm-allBrandAsgn) ONE level down on the server. Two tabs editing
    // DIFFERENT months of the same key can no longer wipe each other.
    // Falls back to v1 (whole-key replace) until sql/app_state_patch_v2.sql
    // has been run in the Supabase SQL editor.
    let rpcName = patchV2Missing ? "app_state_patch" : "app_state_patch_v2";
    let { data, error } = await supabase.rpc(rpcName, {
      p_updates: updates,
      p_deletes: deletes.length > 0 ? deletes : null,
      p_updated_by: stampedUpdatedBy,
    });
    if (error && rpcName === "app_state_patch_v2" &&
        (error.code === "PGRST202" || error.code === "42883" ||
         /app_state_patch_v2/i.test(error.message || ""))) {
      patchV2Missing = true;
      console.warn("[supabase] app_state_patch_v2 not installed — using v1 (whole-key replace). Run sql/app_state_patch_v2.sql for merge-safe saves.");
      ({ data, error } = await supabase.rpc("app_state_patch", {
        p_updates: updates,
        p_deletes: deletes.length > 0 ? deletes : null,
        p_updated_by: stampedUpdatedBy,
      }));
    }

    if (error) {
      // Hard failure (RLS, network, auth). Merge pending writes back so
      // any sets that arrived during the save aren't lost.
      pendingWrites = { ...writesAtSave, ...pendingWrites };
      console.error("Failed to save app_state:", error);
      throw error;
    }

    // RPC returns rows of {updated_at}. Pick the first row's value.
    const newUpdatedAt = Array.isArray(data) ? data[0]?.updated_at : data?.updated_at;
    if (newUpdatedAt) lastKnownUpdatedAt = newUpdatedAt;
  } finally {
    saveInFlight = false;
    // FIX (review round 2): if a foreign update arrived while we were
    // saving (we deferred it to avoid clobbering our in-flight write),
    // apply it now — but only AFTER our pending writes so local edits
    // survive.
    if (pendingForeignUpdate) {
      const p = pendingForeignUpdate;
      pendingForeignUpdate = null;
      if (p.updated_at) lastKnownUpdatedAt = p.updated_at;
      stateCache = p.data || {};
      _applyPendingWritesOnTop(pendingWrites);
      subscribers.forEach((fn) => fn(stateCache));
    }
  }
}

// Subscribe to remote changes — when Prim writes, Vee's cache updates.
function subscribeRealtime() {
  if (realtimeChannel) return;
  realtimeChannel = supabase
    .channel("app_state_changes")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "app_state", filter: "id=eq.main" },
      (payload) => {
        // FIX (SINGLE-LAYER): with safeStorage v2 active, app_state is a
        // legacy artifact — NEVER apply its (stale) snapshots to live state.
        if (typeof window !== "undefined" && window.__nirmKvActive) return;
        const updatedBy = payload?.new?.updated_by;
        const newUpdatedAt = payload?.new?.updated_at;

        // Own echo — we already updated lastKnownUpdatedAt from the save
        // response. Ignore the payload so it can't clobber any newer
        // in-memory mutations that haven't flushed yet.
        if (typeof updatedBy === "string" && updatedBy.endsWith(`#${CLIENT_ID}`)) {
          return;
        }
        // FIX (review round 3, suggestion #6): a payload arriving without
        // a string updated_by means either a legacy row, a server-side
        // admin update (SQL console), or a buggy client that didn't stamp.
        // We DO still apply it — preserving the operator's ability to fix
        // things via SQL — but log so an unexpected source is visible in
        // the console.
        if (typeof updatedBy !== "string" || updatedBy === "") {
          console.warn("[supabase] Realtime payload has no client stamp on updated_by — applying anyway. Source:", updatedBy);
        }
        // FIX (review round 2): mid-save, BUFFER the foreign payload
        // instead of dropping it. The save's finally{} block will
        // replay it after our write completes, preserving any local
        // pending writes on top.
        if (saveInFlight) {
          pendingForeignUpdate = payload?.new || null;
          return;
        }

        // Another client wrote. Track their new version so OUR next save's
        // WHERE clause is up to date (else we'd needlessly conflict).
        if (newUpdatedAt) lastKnownUpdatedAt = newUpdatedAt;
        stateCache = payload.new.data || {};

        // FIX (review round 2): if THIS tab has unsaved local writes in
        // pendingWrites, re-apply them on top of the foreign update.
        // Without this, a foreign update silently wipes our unflushed
        // local edits.
        _applyPendingWritesOnTop(pendingWrites);

        subscribers.forEach((fn) => fn(stateCache));
      }
    )
    .subscribe((status) => {
      // FIX (round 6): handle realtime reconnect. supabase-js does NOT replay
      // missed events after a channel drop, so a tab that went offline (sleep,
      // network blip, suspended background tab) wakes up with a STALE
      // stateCache. The very next save would clobber any changes made by
      // other clients while we were offline. By reloading on every successful
      // SUBSCRIBED transition, we resync before any save fires.
      if (status === "SUBSCRIBED" && cacheLoaded) {
        // FIX (SINGLE-LAYER): with safeStorage v2 active this reload is the
        // exact mechanism that wiped data on 2026-07-08 — it pulled STALE
        // app_state into stateCache, notified subscribers, React state took
        // the stale view, and autosave saved it over kv_state. Never reload
        // the legacy layer once kv is live.
        if (typeof window !== "undefined" && window.__nirmKvActive) return;
        // Skip the very first subscribe (loadCache already ran in initStorage).
        // We track this by checking if the channel has connected before.
        if (realtimeHasConnectedOnce) {
          console.warn("[supabase] Realtime resubscribed after disconnect — reloading state to avoid clobbering newer writes.");
          loadCache();
        }
        realtimeHasConnectedOnce = true;
      }
    });
}

// Tracks whether the realtime channel has connected at least once. A second
// SUBSCRIBED event means we reconnected after a drop, and any missed events
// during the gap mean our stateCache may be stale.
let realtimeHasConnectedOnce = false;

// Public API — call once on app startup, before mounting the component.
export async function initStorage() {
  await loadCache();
  subscribeRealtime();

  // Track recent writes to debounce — multiple set() calls in the same tick
  // batch into one network round-trip.
  let pendingSave = null;
  // FIX (data-loss bug #5): expose save errors to callers so the AllocationPanel
  // retry loop and banner can react. The most recent set() returns a promise
  // resolved only AFTER the debounced save round-trips successfully.
  let pendingResolves = [];
  let pendingRejects = [];
  // FIX (round 5): serialize saves. The previous code cleared `pendingSave`
  // BEFORE awaiting `saveCache`, so a second debounce timer could fire and
  // call saveCache CONCURRENTLY while the first save was still in flight.
  // Two concurrent UPDATEs racing on `updated_at` produced spurious conflicts
  // that exhausted the 3-retry budget and showed the "Couldn't save" banner.
  // We now chain saves through a single promise so at most one saveCache
  // runs at any time.
  let inFlightChain = Promise.resolve();
  const scheduleSave = (updatedBy) =>
    new Promise((resolve, reject) => {
      pendingResolves.push(resolve);
      pendingRejects.push(reject);
      if (pendingSave) clearTimeout(pendingSave);
      pendingSave = setTimeout(() => {
        pendingSave = null;
        const resolves = pendingResolves; pendingResolves = [];
        const rejects = pendingRejects;   pendingRejects = [];
        // Chain this save to run AFTER any in-flight one. The `.catch`
        // swallows the prior save's error so a single failure doesn't
        // permanently break the chain (each save's own error still
        // rejects its own caller via `rejects` above).
        inFlightChain = inFlightChain.catch(() => {}).then(async () => {
          try {
            await saveCache(updatedBy);
            resolves.forEach((r) => r());
          } catch (e) {
            rejects.forEach((r) => r(e));
          }
        });
      }, 250);
    });

  window.storage = {
    async get(key) {
      if (!cacheLoaded) await loadCache();
      return key in stateCache
        ? { key, value: stateCache[key], shared: true }
        : null;
    },

    async set(key, value) {
      // FIX (review round 3, suggestion #7): mutate via _applyToCache so
      // the stateCache update logic lives in ONE place shared with
      // conflict-resolution and realtime merge.
      _applyToCache(key, value);
      pendingWrites[key] = value;
      const user = (await supabase.auth.getUser()).data.user;
      await scheduleSave(user?.email || null);
      return { key, value, shared: true };
    },

    async delete(key) {
      _applyToCache(key, TOMBSTONE);
      pendingWrites[key] = TOMBSTONE;
      const user = (await supabase.auth.getUser()).data.user;
      await scheduleSave(user?.email || null);
      return { key, deleted: true, shared: true };
    },

    async list(prefix = "") {
      if (!cacheLoaded) await loadCache();
      const keys = Object.keys(stateCache).filter((k) => k.startsWith(prefix));
      return { keys, prefix, shared: true };
    },
  };
}

// React hook for components that want to react to remote state changes.
// Useful if you want to add a "user X is editing" indicator later.
export function onStateChange(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

// ─── Auth helpers ──────────────────────────────────────────────────────────

export async function signUp(email, password, username, role = "viewer") {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error };

  // Create profile row
  const { error: profErr } = await supabase.from("profiles").insert({
    id: data.user.id,
    username,
    role,
    display_name: username,
  });
  if (profErr) return { error: profErr };

  return { user: data.user };
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) return { error };
  return { user: data.user };
}

export async function signOut() {
  // FIX (review round 4): clear all module-level concurrency state so the
  // next signed-in user can't accidentally flush a prior user's pending
  // writes or load with a stale lastKnownUpdatedAt.
  pendingWrites = {};
  lastKnownUpdatedAt = null;
  stateCache = {};
  cacheLoaded = false;
  loadFailed = false;
  pendingForeignUpdate = null;
  saveInFlight = false;
  await supabase.auth.signOut();
}

// Resolve the current user's role from the profiles table.
// Returns null if not signed in or no profile.
export async function getCurrentRole() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("username, role, display_name")
    .eq("id", user.id)
    .single();
  if (error || !profile) return null;

  return {
    userId: user.id,
    email: user.email,
    username: profile.username,
    role: profile.role,
    displayName: profile.display_name || profile.username,
  };
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

// List all profiles (for the user management UI in the manager view).
export async function listProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, role, display_name");
  if (error) return [];
  return data;
}

export async function updateProfile(id, updates) {
  const { error } = await supabase.from("profiles").update(updates).eq("id", id);
  return { error };
}

export async function deleteProfile(id) {
  const { error } = await supabase.from("profiles").delete().eq("id", id);
  return { error };
}
