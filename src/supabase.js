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

async function loadCache() {
  const { data, error } = await supabase
    .from("app_state")
    .select("data, updated_at")
    .eq("id", "main")
    .single();
  if (error) {
    console.error("Failed to load app_state:", error);
    return;
  }
  stateCache = data?.data || {};
  lastKnownUpdatedAt = data?.updated_at || null;
  cacheLoaded = true;
  subscribers.forEach((fn) => fn(stateCache));
}

async function saveCache(updatedBy, retryDepth = 0) {
  // Snapshot the writes we're about to flush. On conflict / error we
  // restore these so the next scheduleSave picks them up.
  const writesAtSave = { ...pendingWrites };
  pendingWrites = {};

  saveInFlight = true;
  lastSentBy = CLIENT_ID;
  const stampedUpdatedBy = updatedBy ? `${updatedBy}#${CLIENT_ID}` : `__client__#${CLIENT_ID}`;

  try {
    let q = supabase
      .from("app_state")
      .update({ data: stateCache, updated_by: stampedUpdatedBy })
      .eq("id", "main");
    if (lastKnownUpdatedAt !== null) {
      // Conditional update: only succeed if NOBODY ELSE has written since
      // we last saw the row. Zero rows affected ⇒ someone else got there
      // first ⇒ conflict-resolution branch below.
      q = q.eq("updated_at", lastKnownUpdatedAt);
    }
    const { data, error } = await q.select("updated_at").maybeSingle();

    if (error) {
      // Hard failure (RLS, network, auth). Restore pending writes so the
      // caller's retry can flush them again.
      pendingWrites = { ...writesAtSave, ...pendingWrites };
      console.error("Failed to save app_state:", error);
      throw error;
    }

    if (!data) {
      // Optimistic-lock conflict: another client updated the row.
      if (retryDepth >= 3) {
        pendingWrites = { ...writesAtSave, ...pendingWrites };
        const e = new Error("[supabase] Save conflict not resolved after 3 attempts — refusing to clobber");
        console.error(e);
        throw e;
      }
      console.warn(`[supabase] Save conflict detected (attempt ${retryDepth + 1}). Reloading latest and merging local changes.`);

      // Pull the newest server state.
      const reload = await supabase
        .from("app_state")
        .select("data, updated_at")
        .eq("id", "main")
        .single();
      if (reload.error) {
        pendingWrites = { ...writesAtSave, ...pendingWrites };
        throw reload.error;
      }
      stateCache = reload.data?.data || {};
      lastKnownUpdatedAt = reload.data?.updated_at || null;

      // Re-apply OUR pending writes on top of the freshly-reloaded state.
      for (const k of Object.keys(writesAtSave)) {
        const v = writesAtSave[k];
        if (v === TOMBSTONE) delete stateCache[k];
        else stateCache[k] = v;
      }
      // Tell React/subscribers about the merged state so their in-memory
      // copy doesn't go stale.
      subscribers.forEach((fn) => fn(stateCache));

      // Restore pendingWrites so the recursive retry's snapshot picks them up.
      pendingWrites = { ...writesAtSave };

      saveInFlight = false;
      return saveCache(updatedBy, retryDepth + 1);
    }

    // Success — record the server's new version for the next conditional save.
    lastKnownUpdatedAt = data.updated_at;
  } finally {
    saveInFlight = false;
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
        // Mid-save defense: drop any payload that arrives while WE'RE
        // currently writing. Our optimistic-lock retry will handle the
        // actual merge.
        if (saveInFlight) return;

        // Another client wrote. Track their new version so OUR next save's
        // WHERE clause is up to date (else we'd needlessly conflict).
        if (newUpdatedAt) lastKnownUpdatedAt = newUpdatedAt;
        stateCache = payload.new.data || {};
        subscribers.forEach((fn) => fn(stateCache));
      }
    )
    .subscribe();
}

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
  const scheduleSave = (updatedBy) =>
    new Promise((resolve, reject) => {
      pendingResolves.push(resolve);
      pendingRejects.push(reject);
      if (pendingSave) clearTimeout(pendingSave);
      pendingSave = setTimeout(async () => {
        pendingSave = null;
        const resolves = pendingResolves; pendingResolves = [];
        const rejects = pendingRejects;   pendingRejects = [];
        try {
          await saveCache(updatedBy);
          resolves.forEach((r) => r());
        } catch (e) {
          rejects.forEach((r) => r(e));
        }
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
      stateCache = { ...stateCache, [key]: value };
      // Track this write so the conflict-resolution merge can re-apply it
      // after a reload.
      pendingWrites[key] = value;
      const user = (await supabase.auth.getUser()).data.user;
      // Await the debounced save so failures propagate to the caller's catch.
      await scheduleSave(user?.email || null);
      return { key, value, shared: true };
    },

    async delete(key) {
      const next = { ...stateCache };
      delete next[key];
      stateCache = next;
      // Track the delete with a TOMBSTONE so the conflict-resolution merge
      // can re-apply it after a reload (otherwise the reload would
      // resurrect the key).
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
  // Note: this deletes the profile row. Auth user deletion requires a
  // service-role key and must run server-side; for now this just orphans
  // the auth record (the user can no longer sign in via the app because
  // role lookup returns null).
  const { error } = await supabase.from("profiles").delete().eq("id", id);
  return { error };
}
