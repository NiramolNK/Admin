// ════════════════════════════════════════════════════════════════════════════
// NiRM Roster — Supabase client and storage shim
// Drop this file into src/supabase.js. Import { initStorage, signIn, signOut,
// signUp, getCurrentRole, supabase } from "./supabase" in your component.
// ════════════════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

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

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true },
});

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
    const { data, error } = await supabase.rpc('app_state_patch', {
      p_updates: updates,
      p_deletes: deletes.length > 0 ? deletes : null,
      p_updated_by: stampedUpdatedBy,
    });

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
