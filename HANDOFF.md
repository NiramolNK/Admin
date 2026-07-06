# HANDOFF — NiRM Roster (April / CREA)

> Start here in a fresh conversation. Repo: `C:\Users\April\OneDrive - Crea Co. Ltd\Documents\GitHub\Admin`
> Branch **CREA-HQ** (never main). Deploys: push in GitHub Desktop → Vercel → https://nirmroster.vercel.app (~1 min).
> Supabase project `bequrilwgooesolepubv`. Main file: `src/AllocationRoster2026.jsx` (~5,940 lines).

## Goal
One reliable roster/allocation system for April's 17 CS agents: no data loss,
Supabase and the app always in sync (two-way), every agent has a login that
lands on their personal schedule, roles/tabs per team tier.

## Current Progress (2026-07-06 evening — MAJOR session)
- **SAVE-FAILURE SAGA CLOSED (the "red banner" bug)**: every app save of the
  three mirrored keys (nirm-agents / nirm-brands / nirm-allBrandAsgn) failed
  with 400 for ALL users/tabs. Root cause: the kv→tables mirror trigger
  rebuilds tables with bare `delete from X;`. Supabase **API connections run
  safeupdate**, which blocks DELETE without WHERE — SQL editor doesn't, which
  is why every SQL-side diagnostic passed. Fix: `where true` added to every
  bare DELETE in all nirm_* functions (self-patching DO block, run by April).
  Verified 204s via REST replay as a real agent login. DB-side fix — no
  deploy needed, all tabs healed at once.
- **17 agent logins LIVE** (bulk script run): 15 created fresh; Joy
  (nattakran.k) and Aof (customerservice.extrtrf) pre-existed → passwords
  reset to sheet values. All can sign in, land on personal schedule.
  Passwords from Admin_Nirm.xlsx are TEMPORARY — team should change them.
- **profiles roles all correct + constraint widened** to
  ('viewer','fulltime','manager','t1','t2','cc','return'). Joy=t1,
  Aof=return, Marker(chakrit.s)=cc, Prim RESTORED to manager (something had
  demoted her to t1), gmail duplicate (niramol.klanklin@gmail.com) set to
  viewer (auth user still exists — delete when convenient).
- **"Disappearing brand assignments" = NOT data loss**: July 2026 simply has
  no allocations yet. nirm-allBrandAsgn holds May + June in full (5,251 June
  date entries, ~400KB, verified via REST). Personal views default to the
  current month (July) hence look empty. July needs allocating (month may be
  Locked — Unlock first).
- **T2 role shipped** (role key `fulltime`, relabeled "T2"): tabs = Roster,
  My Invoice, Allocation, Dates, Performance, Teams (NO Report, NO CS
  Analytics), canEdit:true. Manager-only powers (Reset, user mgmt, cost/day)
  stay gated by role==="manager" checks, unaffected.
- **Change-request workflow confirmed working end-to-end**: T1 clicks a date
  in personal roster → requests shift → "Pending Change Requests" panel on
  manager/T2 Roster tab → Approve applies to live roster. Nothing built —
  it already existed; verified live with Joy's requests.
- **Per-view URL hashes + tab titles** (#roster/#allocation/... +
  "Roster - NiRM Roster") — stray tabs now identify themselves.
- **prefs-quiet fix** in flushSave (the LIVE path): a failed nirm-prefs write
  logs a console.warn instead of raising the red banner. NOTE: an earlier
  version of this fix was applied to saveKey() — which is DEAD CODE and
  tree-shaken out of every bundle (see What Didn't Work).
- **Users panel: Agent column** (PCode badge + nickname, joined live from
  agents by email — cannot go stale) + modal widened to 620.
- Commits this session: 8caec87 (hashes/titles), 55a820b (dead-code fix,
  harmless), 01c9c93 + eb73e49 (T2), fa8d73b (accidental d.txt — removed in
  c8ed4eb), c8ed4eb (real prefs fix), db435e0 (Agent column).

## What Worked (environment survival guide)
- Desktop Commander `start_process` with PowerShell = reliable workhorse.
  edit_block/read_file/write_file also worked all session. git commit fine;
  `git push` fails headless ("User cancelled dialog") — April pushes in
  GitHub Desktop. `*> file.txt` redirect pattern for reading git output —
  BUT DELETE THE TEMP FILES (a leftover d.txt got committed by GitHub
  Desktop as "Create d.txt").
- **REST replay technique (the session's MVP)**: the anon/publishable key is
  extractable from the deployed bundle (`sb_publishable_...`, 46 chars — in
  older bundles a JWT `eyJ...`). Sign in via /auth/v1/token?grant_type=
  password with any agent's known password → Bearer token → replay the app's
  exact kv_state GET/PATCH from PowerShell. This is how the 400 was finally
  reproduced and its error body read. Read-only inspection of any kv value
  works the same way.
- **sb_secret keys + PowerShell**: Supabase rejects secret keys when the
  User-Agent looks like a browser ("Forbidden use of secret API key in
  browser"). Fix: $PSDefaultParameterValues['Invoke-RestMethod:UserAgent'].
  The scary "delete this key" message is boilerplate — no rotation needed.
- **Key-never-in-chat pattern**: scripts read NIRM_SERVICE_KEY env var,
  wrapper fills it from clipboard (April copies key → says "go"), clears
  clipboard after. create-users.ps1 + fix-remaining-users.ps1 support it.
- Clipboard+SQL-editor loop still the fastest April-executes-SQL path.
  Multi-statement scripts: editor shows only the LAST result set; RAISE
  NOTICE output is invisible — collect diagnostics into a temp table and
  SELECT it as the final statement (grant insert/select to authenticated
  before set_config role switch, and SELECT before ROLLBACK).
- **Impersonation in SQL editor**: set_config('role','authenticated',true) +
  set_config('request.jwt.claims','{"sub":"<uuid>",...}',true) inside a
  begin/rollback — BUT this does NOT reproduce API-only behaviors like
  safeupdate. SQL-passes-but-API-fails = suspect the API-layer guards.

## What Didn't Work / gotchas discovered
- **safeupdate on Supabase API connections**: DELETE without WHERE →
  error 21000 "DELETE requires a WHERE clause" → PostgREST 400. SQL editor
  is exempt. Any trigger/function reachable from app writes must use
  `where true` (or better) on full-table deletes. THIS was the banner bug.
- **Dead-code tree-shaking hid a fix**: saveKey() and doSaveWithRetry() in
  AllocationRoster2026.jsx are called by NOTHING (flushSave calls
  window.storage.set directly) — Vite/esbuild strips them from bundles, so
  string-markers from them never appear deployed and edits to them are
  no-ops. Cost an hour of phantom "Vercel is stuck" chasing. Candidates for
  deletion.
- Marker strings for "is commit X deployed" must be UNIQUE and verified with
  context (Substring around IndexOf), not bare .Contains — two false
  positives happened.
- nirm-agents/brands values are raw JSON ARRAYS (no __wasString wrapper);
  nirm-prefs and others are wrapped. Don't assume — check jsonb_typeof.
  NEVER round-trip kv values through PowerShell ConvertTo-Json (mangles
  structures) — PATCH the raw JSON substring instead.
- Version-number sleuthing: truncated DevTools URLs hid the real versions
  (…72 was …572). Get full URLs (Network tab → click request) before
  theorizing. Per-key versions via REST: kv_state?select=key,version.

## Next Steps
1. **July allocation** — Allocation tab, Jul 2026, Unlock if locked, then
   allocate (Auto-Allocate All available). Joy & co.'s personal brand
   assignments fill in immediately after.
2. **Re-enter lost data in ONE fresh tab**: T2 salary months (Apr/May +
   Jul; June=198,765 survived), agent performance import, Duoke chat-volume
   import (`Duoke_1-25_June_2026.xlsx`). Saves are safe now.
3. Team changes temp passwords (Account → change password).
4. Delete duplicate auth account niramol.klanklin@gmail.com (Dashboard →
   Auth → Users; its profiles role is already viewer = powerless).
5. Verify gates: Duoke import ~14 zero-chat brands; Marker sees only
   Shiseido-group brands + only Roster/Allocation; two-way brand edit.
6. Nice-to-haves: delete dead saveKey/doSaveWithRetry; personal brand-
   assignment matching uses agent NAME strings (assigned.includes(
   myAgent.name)) — fragile across renames, consider matching by agent id;
   Supabase Pro ($25/mo) to stop free-tier auto-pause.

## Key artifacts
- `scripts/create-users.ps1` (sheet-aware, env-key, script UA)
- `scripts/fix-remaining-users.ps1` (repair/upsert existing users)
- `sync-mirror-tables.sql` (v3 — NOTE: live functions now patched with
  `where true`; if this file is ever re-run, re-apply the safeupdate fix
  or update the file first!)
- `src/safeStorage.js` (v2 CAS+merge — do not weaken)
- April's sheet: `Admin_Nirm.xlsx` (has temp passwords)
