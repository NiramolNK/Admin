# NiRM Roster — HANDOFF

Updated: 2026-07-08 (evening). Previous version: 2026-07-06.

## What this is
React/Vite SPA (repo branch **CREA-HQ**) deployed on Vercel at
https://nirmroster.vercel.app, data in Supabase project `bequrilwgooesolepubv`.
Main file `src/AllocationRoster2026.jsx` (~6.4k lines). Team roster, brand
allocation, payroll (pay period = 24th → 23rd), extra-hours pay, reports.

## STORAGE ARCHITECTURE — READ THIS FIRST (single layer!)
- **The ONLY live store is the `kv_state` table** — one row per domain key
  (`nirm-allAsgn`, `nirm-allBrandAsgn`, `nirm-allExtraHrs`, `nirm-agents`, …)
  with a `version` column. Client layer: `src/safeStorage.js` ("safeStorage
  v2") — per-key CAS on `version` + ancestor-tracked 3-way merge + realtime
  channel. It installs as `window.storage` at boot and sets
  `window.__nirmKvActive = true`.
- **`app_state` (single-row blob) is LEGACY / DEAD.** `src/supabase.js`
  still contains the old shim, but every dangerous part (saveCache, realtime
  apply, reconnect reload) is gated on `window.__nirmKvActive` and no-ops.
  Do NOT resurrect it. Do NOT run `sql/sync-mirror-tables.sql` (known
  DELETE bug).
- Server SQL installed (Supabase SQL editor, both DONE):
  - `sql/app_state_patch_v2.sql` — month-level merge RPC (legacy path only,
    now mostly moot but harmless).
  - `sql/kv_snapshots.sql` — **automatic version history**: a trigger on
    `kv_state` archives the previous value of every key on change (newest
    50 per key; prefs/role/nirm-all excluded). RLS: API can only SELECT.

## INCIDENT LOG — 2026-07-08 data wipe (root-caused & fixed)
- Symptom: ALL brand-allocation months emptied (`nirm-allBrandAsgn = {}`),
  plus one extra-hours entry lost. Roster/agents survived.
- Root cause: **two live storage layers**. The legacy `app_state` shim's
  reconnect handler pushed its STALE snapshot into React state after a
  network blip; autosave then saved that stale view through safeStorage,
  whose 3-way merge honored the "deletions". Burst write at 11:14:35 UTC.
- Recovery: May+June allocations restored from `app_state`'s copy
  (5,518 + 5,251 keys). July had no backup → rebuilt via Auto-Allocate.
- Fixes shipped: single-layer gating (`window.__nirmKvActive`), load-failure
  now BLOCKS the app (3 retries → reload screen, autosave disabled),
  flush-on-tab-hide, confirm dialogs on all destructive buttons, agent
  removal preserves payroll history, Fill All preserves inactive agents'
  cells, and `kv_snapshots` so nothing is ever unrecoverable again.
- Related earlier near-miss same day: `[save] Refused: userAccounts shrank
  from 19 to 3` — shrink guard blocked a defaults-over-real-data save after
  a failed load (that load path is now blocking).

## DATA RECOVERY RUNBOOK
1. List history: `select id, key, version, saved_at from kv_snapshots
   where key = 'nirm-<key>' order by saved_at desc;`
2. Inspect a candidate: `select value from kv_snapshots where id = <ID>;`
3. Restore: `update kv_state set value = (select value from kv_snapshots
   where id = <ID>), version = version + 1 where key = 'nirm-<key>';`
   **Always bump `version`** — clients CAS on it; a value change without a
   version bump poisons tabs' shadows (they'll think their stale copy is
   current).
4. Tabs pick the change up via realtime; have users hard-refresh if unsure.
5. REST replay path (when doing this for the user via PowerShell): extract
   `sb_publishable_…` key from the deployed bundle JS, login
   `POST /auth/v1/token?grant_type=password` (Joy's account), then
   GET/PATCH `rest/v1/kv_state?key=eq.<key>`. PATCH body must include BOTH
   `value` and `version` (current+1).

## OPERATIONAL RULES (hard-won)
- Desktop Commander: PowerShell `start_process` only; unique temp filename
  per git redirect; DC occasionally hangs 4-min — restart Claude Desktop.
  `git push` works when Windows creds cached; otherwise GitHub Desktop.
- Bash container cannot reach supabase.co — Supabase ops run via DC
  PowerShell on April's machine; heavy parsing (Excel) in bash container,
  JSON handed over via DC write_file.
- Deploy verification: fetch site HTML → regex `/assets/index-*.js` →
  substring-search for unique string literals (comments get minified away).
- PS 5.1: no `-AsHashtable`; use PSObject.Properties; `ConvertTo-Json
  -Depth 10 -Compress`.
- After ANY deploy: **close all old NiRM tabs on all devices** — old
  bundles keep old bugs (this is how the wipe happened while fixes were
  already committed).

## BUSINESS RULES IMPLEMENTED (allocation & roster)
- Extra hours: per-entry stepper 0–8h ×1x/1.5x, pays only on WORKED days,
  flows to invoice/summary/report/exports; agents see amber `+Nh` badges
  and an Extra Hours card in My Schedule.
- Auto-fill: stub weeks (<4 available days) don't consume weekly day off;
  quota top-ups respect chat caps; Pass-2 rotation respects burnout rule.
- Brand allocation: offboarded brands excluded; **<20 chats/shift/day → 1
  agent** (per-shift = monthChats/30/2, same as UI pills); **Call CC brands
  → CC-team agents only, M shift only, all their platforms** (Shiseido);
  Auto-Allocate All preserves manual non-T1 assignments (Marker etc.).
- Roster: CC team always M unless manually overridden (manual survives
  Fill Empty for all fixed-schedule teams); **agent Start Date field** →
  M-shift-only first 28 days, blank before start date.
- Agent removal keeps roster history + payroll profile; only login revoked
  (deactivating via "Active" is the recommended departure flow).
- Pay month follows roster month navigation.

## DATA STATE (live, verified 2026-07-08 evening)
- `nirm-allAsgn`: real imported roster Jan–Jul 2026 (from April's Excel,
  1,844 + 513 cells verified) + August auto-fill (re-run after stub-week
  fix if not already).
- `nirm-allBrandAsgn`: 2026-05 + 2026-06 restored; **2026-07 must be
  rebuilt via Auto-Allocate All** (new rules apply; re-add manual slots).
- `nirm-allExtraHrs`: Gyb (11) 2026-07-10 +4h@1x (฿200). Ploy 18 Jul entry
  was lost in the wipe — re-add manually if it was real.

## OPEN ITEMS
- **Report tab cost/chat window mismatch**: top cards use pay period
  (24th–23rd), Total Cost/cost-per-chat use the picked date range → numbers
  differ (387,065 vs 380,665 for Sep). NEEDS APRIL'S DECISION: calendar
  month or pay period as the basis; then align/label both.
- Re-run Auto-fill "Fill All T1" for August; import August Excel when it
  exists ("send file + say import").
- Re-import June Duoke volume (ONE fresh tab); T2 salaries Apr/May/Jul;
  agent performance data.
- Team temp-password changes; delete duplicate auth account
  niramol.klanklin@gmail.com (Supabase Dashboard → Auth).
- Undecided offers: ME cross-shift load balancing; brand-allocation load
  keyed by agent id instead of name; Leave/SL codes in-app; extraHrs-aware
  ~/day divisor.
- Suggested: move User Password sheets out of the shared Excel workbook
  (plaintext platform passwords).
