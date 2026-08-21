/**
 * livePresence.js — who is in NiRM right now.
 *
 * Uses Supabase Realtime Presence, not a table. Each open tab joins one
 * channel and publishes a small object about itself; everyone subscribed gets
 * the live roster. Nothing is written to the database, nothing needs cleaning
 * up, and when a tab closes or the network drops the person disappears on
 * their own.
 *
 * ONLINE IS NOT THE SAME AS WORKING
 * ---------------------------------
 * A tab left open on a locked laptop keeps its socket, so presence alone would
 * report a full team all evening. `activeAt` is therefore only bumped by real
 * interaction (pointer, key, touch, or the tab becoming visible), and anyone
 * quiet for IDLE_MS reads as `idle` rather than `online`. Without that split
 * the number is flattering and useless.
 *
 * PRIVACY
 * -------
 * The channel carries names and the current tab for everyone on it — Realtime
 * presence has no per-subscriber filtering. Who is allowed to SEE that is
 * enforced in the UI (managers and T2 get names, agents get a count only), so
 * treat the payload as visible to any signed-in user who reads the socket. That
 * is why it carries a display name and a tab label and nothing else: no email,
 * no id card, no payroll anything.
 */

import { supabase } from './supabase';

const CHANNEL = 'nirm-presence';
const IDLE_MS = 5 * 60 * 1000;   // quiet this long => idle, not online
const BUMP_MS = 30 * 1000;       // don't re-broadcast activity more often
const TICK_MS = 30 * 1000;       // re-render cadence so idle appears on time

let channel = null;
let me = null;                   // the payload this tab publishes
let lastBump = 0;
let tickTimer = null;
const listeners = new Set();

/* ---------- state ---------- */

function rawState() {
  if (!channel) return {};
  try { return channel.presenceState() || {}; } catch (e) { return {}; }
}

/**
 * Everyone currently connected, one entry per person (not per tab — two tabs
 * from the same person collapse to their most recently active one).
 * [{ key, agentId, name, role, tab, activeAt, status: 'online' | 'idle', tabs }]
 */
export function roster() {
  const now = Date.now();
  const byPerson = new Map();
  for (const metas of Object.values(rawState())) {
    for (const m of (metas || [])) {
      const id = m.agentId || m.key || m.name || 'unknown';
      const prev = byPerson.get(id);
      if (!prev || (m.activeAt || 0) > (prev.activeAt || 0)) {
        byPerson.set(id, { ...m, tabs: (prev ? prev.tabs : 0) + 1 });
      } else {
        prev.tabs += 1;
      }
    }
  }
  return [...byPerson.values()]
    .map((m) => ({
      ...m,
      status: now - (m.activeAt || 0) < IDLE_MS ? 'online' : 'idle',
    }))
    .sort((a, b) =>
      (a.status === b.status ? 0 : a.status === 'online' ? -1 : 1) ||
      String(a.name || '').localeCompare(String(b.name || '')));
}

/** { online, idle, total } — the only thing an agent-role user should see. */
export function counts() {
  const r = roster();
  const online = r.filter((x) => x.status === 'online').length;
  return { online, idle: r.length - online, total: r.length };
}

/** Status for one agent id, or null when they are not in the app. */
export function statusOf(agentId) {
  if (!agentId) return null;
  const hit = roster().find((r) => r.agentId === agentId);
  return hit ? hit.status : null;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() { listeners.forEach((fn) => { try { fn(); } catch (e) {} }); }

/* ---------- join / leave ---------- */

async function push() {
  if (!channel || !me) return;
  try { await channel.track(me); } catch (e) { /* socket down; sync will retry */ }
}

function onActivity() {
  const now = Date.now();
  if (now - lastBump < BUMP_MS) return;   // throttle: a tap must not be a broadcast
  lastBump = now;
  if (me) { me.activeAt = now; push(); }
}

/**
 * Join the presence channel.
 *   who  { agentId, name, role }   agentId may be null for a login with no agent row
 *   tab  current tab label, e.g. "Daily Count"
 * Safe to call repeatedly — later calls just update the published payload.
 */
export function joinPresence(who, tab) {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  me = {
    agentId: who && who.agentId ? who.agentId : null,
    name: (who && who.name) || 'unknown',
    role: (who && who.role) || 'agent',
    tab: tab || '',
    activeAt: now,
    since: (me && me.since) || now,
  };

  if (channel) { push(); return; }

  channel = supabase.channel(CHANNEL, {
    config: { presence: { key: `${me.agentId || me.name}:${Math.random().toString(36).slice(2, 8)}` } },
  });

  channel
    .on('presence', { event: 'sync' }, notify)
    .on('presence', { event: 'join' }, notify)
    .on('presence', { event: 'leave' }, notify)
    .subscribe((status) => { if (status === 'SUBSCRIBED') push(); });

  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, onActivity, { passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { lastBump = 0; onActivity(); }
  });
  window.addEventListener('pagehide', leavePresence);

  /* Re-render on a timer so someone crosses into `idle` without needing an
     event from them — the whole point is that they have stopped sending any. */
  if (!tickTimer) tickTimer = setInterval(notify, TICK_MS);
}

/** Update just the tab label (call it when the user switches tabs). */
export function setPresenceTab(tab) {
  if (!me || me.tab === tab) return;
  me.tab = tab;
  me.activeAt = Date.now();
  push();
}

export function leavePresence() {
  if (!channel) return;
  try { channel.untrack(); } catch (e) {}
  try { supabase.removeChannel(channel); } catch (e) {}
  channel = null;
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  notify();
}

export default {
  joinPresence, setPresenceTab, leavePresence, roster, counts, statusOf, subscribe,
};
