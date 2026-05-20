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

async function loadCache() {
  const { data, error } = await supabase
    .from("app_state")
    .select("data")
    .eq("id", "main")
    .single();
  if (error) {
    console.error("Failed to load app_state:", error);
    return;
  }
  stateCache = data?.data || {};
  cacheLoaded = true;
  subscribers.forEach((fn) => fn(stateCache));
}

async function saveCache(updatedBy) {
  const { error } = await supabase
    .from("app_state")
    .update({ data: stateCache, updated_by: updatedBy || null })
    .eq("id", "main");
  if (error) console.error("Failed to save app_state:", error);
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
  const scheduleSave = (updatedBy) => {
    if (pendingSave) clearTimeout(pendingSave);
    pendingSave = setTimeout(() => {
      pendingSave = null;
      saveCache(updatedBy);
    }, 250);
  };

  window.storage = {
    async get(key) {
      if (!cacheLoaded) await loadCache();
      return key in stateCache
        ? { key, value: stateCache[key], shared: true }
        : null;
    },

    async set(key, value) {
      stateCache = { ...stateCache, [key]: value };
      const user = (await supabase.auth.getUser()).data.user;
      scheduleSave(user?.email || null);
      return { key, value, shared: true };
    },

    async delete(key) {
      const next = { ...stateCache };
      delete next[key];
      stateCache = next;
      const user = (await supabase.auth.getUser()).data.user;
      scheduleSave(user?.email || null);
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
