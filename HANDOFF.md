# HANDOFF — NiRM Roster (April / CREA)

> Start here in a fresh conversation. Repo: `C:\Users\April\OneDrive - Crea Co. Ltd\Documents\GitHub\Admin`
> Branch **CREA-HQ** (never main). Deploys: push → Vercel → https://nirmroster.vercel.app (~1 min).
> Supabase project `bequrilwgooesolepubv` (CREA's Org, free tier). Main file: `src/AllocationRoster2026.jsx` (~5,900 lines).

## Goal
One reliable roster/allocation system for April's 17 CS agents: no data loss,
Supabase and the app always in sync (two-way), every agent has a login that
lands on their personal schedule, team config matches April's official sheet
(`Admin_Nirm.xlsx`, uploaded in chat — PCodes 01-17 + passwords).

## Current Progress (2026-07-06)
- **Data-loss saga CLOSED**: v2 safeStorage (ancestor-tracked CAS + 3-way
  merge) deployed & validated by April's two-window test. Root cause of the
  later salary/perf/volume losses = leftover tabs running the old v1 bundle
  stomping frozen copies. Code hardening added: dirty-key saves (tabs only
  write domains their user changed) + salary field gated for non-editors +
  salary synced across tabs.
- **Two-way mirror LIVE**: `sync-mirror-tables.sql` (v3) was RUN by April.
  Tables `agents`/`brands`/`brand_assignments` ⇄ kv_state via triggers with
  echo guard + shrink guard. Editing tables in Supabase updates the app
  (refresh needed) and vice versa (instant).
- **Team migrated to official sheet**: PCodes 01-17, full names, per-person
  shifts/days/rates, emails linked (fixes "No personal schedule linked").
  Assignment keys were rewritten to new PCodes (history preserved). Demo T2
  agents (A01-A05) deleted, Ploy D... deleted? A13 set inactive via cleanup
  SQL; Prim's agent record (A16) deleted at April's request (she is Manager,
  uses full roster view; her personal-schedule view now shows "not linked" —
  expected).
- Roles: April + Prim = manager in `profiles` (profiles table is the single
  source of truth; app reads it at login). "Managers can update any profile"
  RLS policy exists → role edits in the app's Users panel persist.
- Teams cost table now sorts by PCode numerically (commit f552b17).
- Bulk-user script `scripts/create-users.ps1` accepts April's sheet format
  directly (Pdoce / Nick Name / Email / password, tab or comma; role derived:
  09→RT&RF, 15→CC, else T1; #14 forced to "Cream Chanid").

## What Worked (environment survival guide)
- Desktop Commander: ONLY `start_process` with PowerShell is reliable for
  shell work; `read_file`/`edit_block` USED TO hang (4-min timeouts) but
  edit_block/read_file worked fine late in this session after a DC restart.
  Multi-line file edits: temp .ps1 with single-quoted here-strings, or
  single-line string replaces (file is LF; CRLF patterns fail Contains()).
- git push via DC hangs; April pushes in GitHub Desktop. (One redirect-file
  trick worked once: `git push origin CREA-HQ *> f.txt` then verify.)
- Claude-in-Chrome: worked on supabase.com + app (navigate/screenshot/click/
  read console & network). javascript_tool DENIED. Connection died when
  Claude Desktop restarted — needs re-connect before browser work.
- Fastest April-executes-SQL loop: `Set-Clipboard` the SQL + `Start-Process`
  the SQL-editor URL → she pastes & runs. Used repeatedly, works great.
- kv_state JSON may be wrapped `{__wasString:true, v:...}` — always
  `coalesce(value->'v', value)` on read, preserve wrapper on write, bump
  `version`.

## What Didn't Work
- v1 CAS fix (realtime advanced the version → stale writes passed the gate).
- Assuming viewer-typed data was blocked client-side (saves have NO role
  gate; kv RLS allows all authenticated) — actual losses came from v1 tabs.
- npx/node NOT installed on this machine — no local builds; Vercel builds.
- Editing profiles/roles or running RLS SQL myself — April runs those
  (policy: account/credential/access-control steps stay with her).
- First guesses at team mapping (Gyp vs Gyb, "Mark"=Marker, Ploy D=Daran)
  were wrong — ALWAYS confirm names against her latest sheet; sheet wins.

## Next Steps
1. **Bulk user creation (17 logins)** — April: save `Admin_Nirm.xlsx` sheet
   as CSV over `users.csv` (repo root) → `powershell -ExecutionPolicy Bypass
   -File .\scripts\create-users.ps1` → paste service_role key → DELETE
   users.csv. Passwords in chat/xlsx = temporary; team should change them.
2. **Push pending commits** (GitHub Desktop → Push origin): PCode sort
   (f552b17) + script sheet-format support (1610a0c) if not yet pushed.
3. **Re-enter lost data in ONE fresh tab** (after closing ALL NiRM tabs on
   every device — kills remaining v1 zombie tabs): T2 salary months
   (Apr/May fix ฿1/Jul; June=198,765 survived), agent performance import,
   Duoke chat-volume import (`Duoke_1-25_June_2026.xlsx`).
4. Fix Prim's row in the app's User Accounts panel (shows T1; set Manager).
5. Verify open gates: Duoke import creates ~14 zero-chat brands; Marker
   (chakrit.s) sees only Shiseido-group brands + only Roster/Allocation;
   two-way brand edit (Supabase→app and back).
6. Optional cleanup: delete duplicate account niramol.klanklin@gmail.com;
   consider Supabase Pro ($25/mo) to stop free-tier auto-pause.

## Key artifacts
- `sync-mirror-tables.sql` (v3, already run; idempotent — safe to re-run)
- `scripts/create-users.ps1` (sheet-aware bulk user creation)
- `src/safeStorage.js` (v2 CAS+merge storage — do not weaken)
- April's sheet: `Admin_Nirm.xlsx` (uploaded 2026-07-06, has passwords)
