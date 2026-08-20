/**
 * dailyTally.js — data layer for the Daily Count tab (tap counters).
 *
 * WHY THIS SHAPE
 * --------------
 * Counts are never stored as a number that gets overwritten. Every tap is one
 * append-only row in `daily_tally` and the count is SUM(delta). There is no
 * UPDATE and no DELETE policy on that table, so no stale tab can ever wipe a
 * shift — the failure mode behind the July allocation wipe and the 18 Aug
 * sign-day clobber cannot happen here by construction.
 *
 * A miscount is corrected by inserting delta = -1, not by editing history.
 *
 * THREE THINGS THAT MATTER, ALL LEARNED THE HARD WAY
 * --------------------------------------------------
 * 1. The buffer lives in this MODULE, not in React state. The old
 *    flush-on-tab-hide was dead code because the effect closed over a stale
 *    `storageLoaded` with `[]` deps. A module-level singleton has no closure to
 *    go stale.
 * 2. Every tap carries a client-generated `event_id`. Flushing twice (retry,
 *    double visibilitychange, replay from localStorage) is a no-op, because the
 *    insert is an upsert on event_id with ignoreDuplicates.
 * 3. Pending taps are mirrored to localStorage. If the tab crashes or the phone
 *    kills it before a flush, the taps come back on next load and replay
 *    safely. Losing an agent's afternoon is not acceptable; a duplicate row is
 *    impossible, so replay is free.
 */

import { supabase, DB_SCHEMA } from './supabase';

export { DB_SCHEMA };

/* The client from src/supabase.js is ALREADY created with
 * `db: { schema: DB_SCHEMA }`, so a plain .from() lands in `public` on the live
 * host and `staging` on every preview build and localhost. Do not re-apply
 * .schema() here — that would defeat the sandbox routing. */
const db = () => supabase;

/* The helper functions (my_agent_id, is_supervisor) live in `public` in both
 * environments, so they need an explicit schema hop on a sandbox build. */
const pub = () => supabase.schema('public');

/* ------------------------------------------------------------------ */
/* Channel vocabulary — taken from the `platforms` array already stored
 * on each brand in nirm-brands, so nothing new has to be maintained.
 * Live counts as of 20 Aug: Shopee 62, Lazada 60, Tiktok 27, Amaze 4,
 * Brand.com 3, Call CC 3, Email 2, Line MyShop 1.
 * ------------------------------------------------------------------ */

/** Volume already arrives from the Duoke import — never ask an agent to tap it. */
export const DUOKE_PLATFORMS = new Set(['Shopee', 'Lazada', 'Tiktok', 'TikTok']);

/** Counted from the Service Desk (tickets/messages) — read-only on the screen. */
export const AUTO_PLATFORMS = new Set(['Email', 'Webchat']);

/** Tap order on the agent screen. Anything unknown lands after these. */
export const TAP_ORDER = ['Amaze', 'Call CC', 'Line MyShop', 'Brand.com'];

export const PLATFORM_HELP = {
  'Amaze': 'One tap = one customer you replied to. Same person back later = tap again.',
  'Call CC': 'Calls you handled.',
  'Line MyShop': 'One tap = one customer you replied to.',
  'Brand.com': 'One tap = one customer you replied to.',
};

export function platformSource(platform) {
  if (AUTO_PLATFORMS.has(platform)) return 'auto';
  if (DUOKE_PLATFORMS.has(platform)) return 'duoke';
  return 'manual';
}

const rank = (p) => { const i = TAP_ORDER.indexOf(p); return i < 0 ? 99 : i; };

/** The rows an agent should see for a brand: manual platforms only. */
export function tappablePlatforms(brand) {
  const list = Array.isArray(brand && brand.platforms) ? brand.platforms : [];
  return list
    .filter((p) => platformSource(p) === 'manual')
    .sort((a, b) => rank(a) - rank(b) || String(a).localeCompare(String(b)));
}

/* ------------------------------------------------------------------ */
/* Dates — Bangkok, always. The DB uses bkk_today(); the client must
 * agree or the edit window silently shifts by 7 hours.
 * ------------------------------------------------------------------ */

export function bkkToday() {
  return new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
}

/** The work_date of a shift is its START date, even when E crosses midnight. */
export function shiftWorkDate(isoDate) {
  return isoDate || bkkToday();
}

export function withinEditWindow(isoDate) {
  const today = bkkToday();
  const yday = new Date(Date.parse(today + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
  return isoDate === today || isoDate === yday;
}

/* ------------------------------------------------------------------ */
/* The tap buffer                                                      */
/* ------------------------------------------------------------------ */

const LS_KEY = 'nirm-tallyBuffer-v1';
const FLUSH_MS = 15000;

/** Array of pending event rows, oldest first. Module-level on purpose. */
let pending = [];
let flushTimer = null;
let flushing = false;
const listeners = new Set();

function loadPending() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) pending = JSON.parse(raw) || [];
  } catch (e) { pending = []; }
}

function savePending() {
  try {
    if (pending.length) localStorage.setItem(LS_KEY, JSON.stringify(pending));
    else localStorage.removeItem(LS_KEY);
  } catch (e) { /* private mode — the in-memory buffer still flushes */ }
}

function notify() { listeners.forEach((fn) => { try { fn(); } catch (e) {} }); }

/** Subscribe to buffer changes (for optimistic counts). Returns unsubscribe. */
export function onBufferChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function rowKey(r) {
  return [r.work_date, r.shift, r.agent_id, r.brand_id, r.platform].join('|');
}

/** Net pending delta for one row — what to add to the server count on screen. */
export function pendingFor(key) {
  let n = 0;
  for (const e of pending) if (rowKey(e) === key) n += e.delta;
  return n;
}

export function pendingCount() { return pending.length; }

function newId() {
  try { return crypto.randomUUID(); }
  catch (e) {
    return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () =>
      Math.floor(Math.random() * 16).toString(16));
  }
}

let _clientId = null;
export function clientId() {
  if (_clientId) return _clientId;
  try {
    _clientId = localStorage.getItem('nirm-clientId');
    if (!_clientId) { _clientId = newId(); localStorage.setItem('nirm-clientId', _clientId); }
  } catch (e) { _clientId = newId(); }
  return _clientId;
}

/**
 * Record one tap (delta +1) or one correction (delta -1).
 * Returns immediately — the screen updates from the buffer, not the server.
 */
export function tap(o) {
  const delta = o.delta === undefined ? 1 : o.delta;
  if (!o.agent_id || !o.brand_id || !o.platform || !o.shift) {
    throw new Error('tap() needs agent_id, brand_id, platform and shift');
  }
  if (delta !== 1 && delta !== -1) throw new Error('a tap is +1 or -1');
  pending.push({
    event_id: newId(),
    work_date: shiftWorkDate(o.work_date),
    shift: o.shift,
    agent_id: o.agent_id,
    brand_id: o.brand_id,
    platform: o.platform,
    delta,
    kind: delta > 0 ? 'tap' : 'correction',
    source: 'manual',
    tapped_at: new Date().toISOString(),
    client_id: o.client_id || clientId(),
  });
  savePending();
  notify();
  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => { flushTimer = null; flush(); }, FLUSH_MS);
}

/**
 * Push pending taps. Safe to call at any time, from anywhere, concurrently.
 * Rows are only dropped from the buffer once the server has accepted them.
 */
export async function flush() {
  if (flushing || !pending.length) return { sent: 0 };
  flushing = true;
  const batch = pending.slice(0, 500);
  try {
    const { error } = await db()
      .from('daily_tally')
      .upsert(batch, { onConflict: 'event_id', ignoreDuplicates: true });
    if (error) throw error;
    const sentIds = new Set(batch.map((r) => r.event_id));
    pending = pending.filter((r) => !sentIds.has(r.event_id));
    savePending();
    notify();
    return { sent: batch.length };
  } catch (err) {
    /* Keep the buffer. A closed shift or a rejected row would fail forever, so
     * surface it rather than retrying silently for the rest of the session. */
    console.warn('[dailyTally] flush failed, taps kept locally:', (err && err.message) || err);
    return { sent: 0, error: err };
  } finally {
    flushing = false;
    if (pending.length) scheduleFlush();
  }
}

let installed = false;
/** Call once at app boot. Replays anything a crash left behind. */
export function installFlushHooks() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  loadPending();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', () => flush());
  window.addEventListener('online', () => flush());
  if (pending.length) flush();
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/** The nirm-agents id for the signed-in user, or null when not linked. */
export async function myAgentId() {
  const { data, error } = await pub().rpc('my_agent_id');
  if (error) return null;
  return data || null;
}

/** Server-side counts for one agent's shift, keyed by rowKey(). */
export async function fetchShiftCounts(q) {
  const { data, error } = await db()
    .from('v_tally_daily')
    .select('work_date,shift,agent_id,brand_id,platform,source,cnt')
    .eq('work_date', q.work_date).eq('shift', q.shift).eq('agent_id', q.agent_id);
  if (error) throw error;
  const out = {};
  for (const r of data || []) out[rowKey(r)] = (out[rowKey(r)] || 0) + Number(r.cnt || 0);
  return out;
}

/** Supervisor board: one row per agent who has taps or a submission. */
export async function fetchShiftBoard(q) {
  let sel = db().from('v_shift_status')
    .select('work_date,shift,agent_id,tapped_total,event_count,last_tap_at,confirmed_total,method,submitted_at,reopened_at,status,drifted')
    .eq('work_date', q.work_date);
  if (q.shift) sel = sel.eq('shift', q.shift);
  const { data, error } = await sel;
  if (error) throw error;
  return data || [];
}

export async function fetchBrandDay(q) {
  const { data, error } = await db().from('v_tally_brand_day')
    .select('work_date,brand_id,platform,source,cnt').eq('work_date', q.work_date);
  if (error) throw error;
  return data || [];
}

export async function fetchHourly(q) {
  const { data, error } = await db().from('v_tally_hourly')
    .select('work_date,hour_bkk,brand_id,platform,source,cnt').eq('work_date', q.work_date);
  if (error) throw error;
  return data || [];
}

/** An agent's own recent daily totals, for the 7-day strip. */
export async function fetchMyRecent(q) {
  const { data, error } = await db().from('v_tally_daily')
    .select('work_date,cnt').eq('agent_id', q.agent_id)
    .gte('work_date', q.from).lte('work_date', q.to);
  if (error) throw error;
  const byDay = {};
  for (const r of data || []) byDay[r.work_date] = (byDay[r.work_date] || 0) + Number(r.cnt || 0);
  return byDay;
}

/* ------------------------------------------------------------------ */
/* Writes other than taps                                             */
/* ------------------------------------------------------------------ */

/**
 * End shift. Flushes first so the confirmed total is the real one, then writes
 * the submission row. The row's existence is what separates "quiet shift" from
 * "forgot" on the supervisor board — a confirmed 0 is a real answer.
 */
export async function endShift(o) {
  const f = await flush();
  if (f.error) throw f.error;
  const counts = await fetchShiftCounts(o);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const { error } = await db().from('shift_submission').upsert(
    {
      work_date: o.work_date, shift: o.shift, agent_id: o.agent_id,
      confirmed_total: total, method: o.method || 'tapped', note: o.note,
    },
    { onConflict: 'work_date,shift,agent_id' },
  );
  if (error) throw error;
  return total;
}

/**
 * "I forgot to tap" — one adjustment row per line, flagged `recalled` so the
 * data tells you whose numbers were counted and whose were remembered.
 * `entries`: [{ brand_id, platform, count }]
 */
export async function recallShift(o) {
  const existing = await fetchShiftCounts(o);
  const rows = [];
  for (const e of o.entries || []) {
    const target = Math.max(0, Math.round(Number(e.count) || 0));
    const key = rowKey({
      work_date: o.work_date, shift: o.shift, agent_id: o.agent_id,
      brand_id: e.brand_id, platform: e.platform,
    });
    const delta = target - (existing[key] || 0);
    if (!delta) continue;
    rows.push({
      event_id: newId(), work_date: o.work_date, shift: o.shift, agent_id: o.agent_id,
      brand_id: e.brand_id, platform: e.platform,
      delta, kind: 'recalled', source: 'manual',
      tapped_at: new Date().toISOString(), client_id: clientId(),
    });
  }
  if (!rows.length) return 0;
  const { error } = await db().from('daily_tally')
    .upsert(rows, { onConflict: 'event_id', ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}

/** Manager only: let an agent fix a shift that is already outside the window. */
export async function reopenShift(o) {
  const { error } = await db().from('shift_submission').upsert(
    {
      work_date: o.work_date, shift: o.shift, agent_id: o.agent_id,
      reopened_at: new Date().toISOString(),
      note: o.note || 'reopened by manager',
    },
    { onConflict: 'work_date,shift,agent_id' },
  );
  if (error) throw error;
}

export default {
  DB_SCHEMA, bkkToday, withinEditWindow, tappablePlatforms, platformSource, myAgentId,
  PLATFORM_HELP, TAP_ORDER, tap, flush, installFlushHooks, onBufferChange,
  pendingFor, pendingCount, rowKey, fetchShiftCounts, fetchShiftBoard,
  fetchBrandDay, fetchHourly, fetchMyRecent, endShift, recallShift, reopenShift,
};
