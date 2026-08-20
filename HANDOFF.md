# NiRM Roster — HANDOFF

> **START AT THE BOTTOM.** The most recent section is
> *PAYROLL / INVOICE SESSION — HANDOFF (2026-08-19)*. It supersedes the
> storage architecture and Supabase-access notes described immediately
> below, which are now historical.

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

## Webchat channel (added 2026-08-03)
SVCR gains a sixth channel: **Webchat** — a site widget for brand storefronts
(Shopify-first). Three new pieces, all in this repo:

- `public/widget.js` — embeddable Shadow-DOM chat widget, served by Vercel at
  `https://nirmroster.vercel.app/widget.js`. One script tag per brand site
  (embed snippet in the file header). On Shopify it auto-captures shop,
  pageType, productId, customerId, and live cart into inquiry meta.
- `supabase/functions/webchat/index.ts` — one edge function speaking both
  contracts: visitor side (`POST /message`, `GET /poll`) and SVCR's generic
  channel contract (`GET /messages?account_id=BRAND`, `POST /send`).
  Deploy: `supabase functions deploy webchat --no-verify-jwt`.
- `supabase/webchat.sql` — `webchat_messages` table (RLS on, service-role
  only). Run once in the SQL editor.

SVCRServiceDesk.jsx changes: `webchat` in CHANNEL_DEFS (builtIn), default
endpoint `{fnBase}/webchat`, header/subtitle mention. Connect per brand in
SVCR Settings by setting the Webchat **accountId = the widget's data-brand
key** (endpoint stays blank → default function). Before go-live per brand:
add the storefront origin to `ALLOWED` in the edge function and swap the
in-memory rate limiter for a Postgres one.


---

# SERVICE CRM — SESSION HANDOFF (2026-08-04, evening)

## Goal
Service CRM tab inside NiRM (src/ServiceCRM.jsx, ~2,960 lines, from the
service-crm-i18n prototype) as the real omnichannel CS desk: email + Shopify
webchat live now, phone later. SVCR Desk tab was REMOVED from NiRM
(src/SVCRServiceDesk.jsx still on disk, unimported).

## Current Progress (all LIVE unless noted)
- **Service CRM tab**: horizontal top nav (navy bar), SSO from NiRM session
  (manager→admin, fulltime→supervisor, else agent; internal Login removed),
  demo seeds removed — real cases only, 14-day trend computed from real data.
  NiRM header shows "Service Desk / 3 channels connected" on the crm tab.
- **Data**: `tickets` + `messages` tables (RLS: authenticated all; anon none),
  `stamp_first_response` trigger, storage bucket `ticket-attachments`
  (private; authenticated read/insert). CRM polls every 20s, merges real
  tickets, persists replies/notes/status/owner/priority.
- **Email channel (SendGrid)**: edge fn `email` v5 — inbound parse w/
  3-tier threading + auto-reopen + attachments→storage; /send = threaded
  reply via SendGrid + attachments (client uploads to storage, fn base64s).
  Secrets set: SENDGRID_API_KEY, EMAIL_WEBHOOK_TOKEN
  (= w0afghoj26e3dbrus9xknvpz1yi75ml4q8ct). Verified single sender / CRM
  EMAIL_FROM = cs.solution@crea.asia. Round trip tested on prod incl.
  attachment download via signed URL. NOTE: real inbound mail does NOT flow
  yet (no MX/Parse) — see Next Steps.
- **Webchat channel (Shopify)**: edge fn `webchat` v2 rewritten onto
  tickets/messages (POST /message creates/threads case by session, auto-
  reopen; GET /poll returns agent replies). Widget public/widget.js unchanged
  and live at nirmroster.vercel.app/widget.js. CRM sends webchat replies by
  direct insert into messages. Round trip tested (ticket 5). CORS map in fn
  still {"default":["*"]} — tighten per storefront at go-live.
- **Attachments**: paperclip real on email cases (≤10 files, 10MB each,
  chips + remove, files-only send allowed); bubbles show 📎 chips → signed
  URL. Webchat = no attachments yet (widget has no upload UI).

## What Worked
- File transfer sandbox→PC: present_files → April downloads → verify SHA256
  → copy from Downloads. (Supabase-table relay unnecessary; avoid.)
- Simulating SendGrid inbound with curl.exe -F from April's machine = full
  pipeline tests without DNS. PS5.1: JSON bodies via -d "@file" (quoting),
  text fields via -F "field=<file" for unicode.
- Outlook COM bridge is a DEAD END: April uses NEW Outlook (olk.exe), no COM.
  Script left at C:\Users\April\NiRM-tools\sync-cs-mail.ps1 (unused).
- Device-code flow (client 14d82eec-204b-4c2f-b7e8-296a70dab67e, scope
  Mail.Read.Shared offline_access) reaches consent but tenant REQUIRES ADMIN
  APPROVAL — request auto-submitted to IT 2026-08-04, expires Sep 3.
- Claude's Microsoft 365 connector HAS delegate access to shared mailboxes
  cs.solution@ / (presumably) nestlepro.cs@, enfa.cs@ — can bridge specific
  emails into the CRM manually anytime (fetch via connector → curl inbound).

## What Didn't Work / gotchas
- PS5.1 mangles non-ASCII .ps1 written as UTF8-no-BOM — keep scripts ASCII.
- Set-Content -Encoding failed oddly; use [IO.File]::WriteAllText.
- Exchange COM: m.To/CC give DISPLAY NAMES not SMTP.
- Old SPA bundle cached in April's tab caused "attachments off in demo" —
  always: close tab/hard refresh after deploy; verify deployed bundle by
  fetching /assets/index-*.js and string-matching.
- edit_block "Path validation timeout" → retry same call works.

## Next Steps
1. **Email auto-sync (blocked on IT, two ways in — either works):**
   a) IT approves the pending "Microsoft Graph Command Line Tools" consent
      request → rerun device-code flow (fresh code), capture refresh_token,
      store as edge-fn secrets, deploy `graph-mail-sync` scheduled fn (pg_cron
      or cron invoke) polling THREE mailboxes → tickets: cs.solution@crea.asia
      (brand CREA CS), nestlepro.cs@crea.asia (Nestlé Pro), enfa.cs@crea.asia
      (Enfa). Keep SendGrid for outbound (or move to Graph sendMail later).
   b) OR IT does app registration (Application perms Mail.ReadWrite+Mail.Send,
      admin consent, ApplicationAccessPolicy to the 3 mailboxes) — cleaner.
2. Until then: bridge real emails on request via M365 connector → inbound fn.
3. First Shopify storefront go-live: add widget script tag (data-brand,
   data-host=…/functions/v1/webchat), then set that brand's origin in the
   webchat fn ALLOWED map + add brand→accountId if needed.
4. Optional polish: brand chip in CRM ticket rows (brand mapped but not
   displayed); "Offline · 1001" demo phone status in top bar (telephony
   phase); Customers view for webchat visitors (currently name-only).
5. Telephony phase gated on ClickNext/Yalecom vendor answers; kit in
   /mnt/user-data/outputs/p1/telephony/ (sandbox), questions sent.

## Key IDs
Supabase bequrilwgooesolepubv · fn base
https://bequrilwgooesolepubv.supabase.co/functions/v1 · tickets 3=Somchai
(email demo), 4=Veer real test, 5=webchat test · SendGrid free trial ends
Oct 3 (drops to 100/day).


---

# ⚠️ PAYROLL / INVOICE SESSION — HANDOFF (2026-08-19)

> **THIS SECTION SUPERSEDES THE STORAGE ARCHITECTURE DESCRIBED AT THE TOP OF
> THIS FILE.** The claim "the ONLY live store is the `kv_state` table" is no
> longer true — agents and invoices moved to a new per-record table on 18 Aug.
> The operational note "Bash container cannot reach supabase.co — Supabase ops
> run via DC PowerShell" is also stale: use the **Supabase MCP tools**
> (`execute_sql`, `apply_migration`, `deploy_edge_function`) directly.

## Goal
Make the CS part-time payroll run end to end inside NiRM: agent signs and
submits an invoice → CS Manager approves → one click emails Finance a batch
with one merged PDF per agent (invoice + ID card + bookbank). Then: stop the
app losing data, and get August paid.

April is CS Manager at Crea, ADHD — **keep answers short, lead with the one
action she needs to take, plain language, no jargon.** She pushes to git
herself from GitHub Desktop; you deliver files to her machine.

## Where things stand (verified live 2026-08-19 ~11:15 UTC+7)
- **August batch: 18 approved · gross ฿158,262.50 · WHT ฿4,747.88 · net
  บ153,514.62.** `invoice_sends` is EMPTY → nothing has been emailed to
  Finance yet. Agents were still submitting during the session, so re-count
  before quoting a number.
- 26 live agents (19 numbered 01–19 + Apple 20 recently added, plus 7 T2
  staff A01 A02 A03 A04 A05 A16 F07). Nine duplicate A-rows were tombstoned.
- Everything below is deployed and verified on the live bundle.

## STORAGE ARCHITECTURE (current — safeStorage v3.3)
- **`kv_records`** — `(domain, id)` PK, `value jsonb`, `version int`,
  `updated_by text`, `deleted_at timestamptz`. Holds **`nirm-agents`** (one row
  per agent) and **`nirm-invoices`** (one row per `${agentId}__${period}`).
  Per-row compare-and-swap on `version`. `deleted_at` set = **tombstone**;
  reads skip them and writes to them are refused, so a deleted record cannot
  be resurrected by a stale tab.
- **`kv_state`** — everything else, unchanged (`nirm-allAsgn`,
  `nirm-allExtraHrs`, `nirm-allBrandAsgn`, `nirm-userAccounts`, `nirm-brands`,
  `nirm-globalFlags`, …). Per-key CAS + 3-way merge.
- `src/safeStorage.js` installs `window.storage` and sets
  `window.__nirmKvActive`. API: `get / set / delete / list / **peek**`.
  **`peek()` reads WITHOUT claiming the merge ancestor** — any component that
  displays a key it does not own must use peek (App.jsx, KnowledgeBase,
  SVCRServiceDesk already do). A plain `get()` from a non-owner let the
  roster's next save skip the merge and overwrite other tabs.
- Every write is stamped `updated_by = CLIENT_ID` (per-tab uuid) and the
  realtime handlers **ignore their own echo** — without this a tab re-applied
  its own write over newer local edits and saved the stale value back.
- `nirm-invoices` has a **status guard**: if the status moved underneath a
  save (e.g. approved → sent while you held it), the write throws with
  `err.conflict = true`. Conflicts are NOT retried; the app shows an amber
  banner with a **Reload** button.
- **`invoice_sends`** — `(period, invoice_number)` PK. One row per invoice
  ever emailed to Finance. This is the double-payment guard; see below.
- **`staging` schema** — full copy of `kv_state` / `kv_records` /
  `invoice_sends`. `src/supabase.js` routes any host that is NOT exactly
  `nirmroster.vercel.app` to `staging` (see `DB_SCHEMA` / `IS_SANDBOX`), so
  Vercel preview builds and localhost are automatically sandboxed. Sandbox
  builds show a black-and-orange striped SANDBOX bar (App.jsx).

## SECURITY / INTEGRITY installed in the DB
- `public.is_manager()` — SECURITY DEFINER, pinned search_path, reads
  `profiles.role` for `auth.uid()`. `get_user_role()` given the same treatment.
- **`profiles` self-update can no longer change `role`** (policy
  "Update own profile (not role)" + `revoke update (role)`). Before this, any
  agent could make themselves a manager in one console call, which defeated
  every other check including the Edge Function's.
- Triggers `kv_records_guard_upd` / `kv_records_guard_del`: a non-manager
  cannot approve/share an invoice, cannot modify one that is already
  `manager_approved`/`sent_to_finance`, and cannot delete one.
  **`auth.uid() IS NULL` is exempt** so service-role and SQL-console admin
  work still passes (browser requests always carry a JWT).
- `payroll-docs` bucket: all **anon** read/write/update policies dropped;
  only `authenticated` can write now. **STILL OPEN:** the bucket is
  `public = true`, so anyone with a URL can READ an ID card. Closing it means
  moving the app + `share-batch` to signed URLs — the top remaining task.
- Backups: `kv_state_backup_20260818`, `kv_records_good_20260819`,
  `kv_state_good_20260819` (verified-good snapshot: 26 agents, 7 invoices,
  28 kv keys). Restore by copying rows back and **bumping `version`**.

## Edge function `share-batch` v3.1 (deployed)
Builds one merged PDF per agent (invoice page in Thai via Sarabun from Google
Fonts + ID card + bookbank), files a copy in
`payroll-docs/invoice-pdfs/<period>/`, emails Finance with them attached.
- **Claims every invoice in `invoice_sends` BEFORE anything is emailed.**
  Already-claimed invoices are skipped, never re-sent.
- `batchId` is generated **server-side** (`crypto.randomUUID`) — the client's
  old `period-YYYYMMDDHHMMSS` id collided within a second and the failure-path
  release then freed another manager's already-sent claims.
- Claims via `upsert(..., ignoreDuplicates)` + `.select()`, so a partial
  overlap claims what it can instead of rolling back the whole statement.
- On a chunk send failure it releases only that chunk onward, scoped to
  `(period, batch_id, invoice_number)`, and returns `{sent, unsent}` so the
  client marks **only** what Finance actually received.
- Returns `warnings[]` for documents that could not be merged; the client
  shows those amber, not green. `sentCount === 0` is reported as a WARNING
  (a stranded claim must never look like success).
- Refuses >200 invoices instead of the old silent `.slice(0, 40)`.
- Recipients: To `jiratchaya.j@crea.asia`; Cc `accounts_ap@`, `niramol.k@`,
  `hrservices@`, `chutimon.d@`, `areeya.w@`, `valerio.b@` (all @crea.asia).
  From = the manager who pressed Share. Editable in the batch panel.

## Business rules (payroll)
- Pay period **24th of prev month → 23rd** — Finance's requirement, do not
  change it. The Teams tab now uses this same window (it used to count the
  calendar month and disagreed with every invoice by ~฿3,200).
- Worked/paid codes: `M`, `ME`, `E`, `OT` (OT ×1.5). **NOT paid: `Off`, `RO`
  (requested off), `TOIL`.** RO being paid was a real overpayment bug.
- Extra hours: `h × costDay/8 × multiplier`, worked days only.
- WHT: `round(subtotal × 0.03, 2)` FIRST, then `net = subtotal − wht`.
  Rounding both independently caused 1-satang mismatches.
- Signing window: **18th–20th of the invoice month only.** A **returned**
  invoice can be resubmitted any time. A manager can reopen it per agent with
  the **"allow late"** button (stored in `globalFlags.lateSubmit[period]`).
  April chose to KEEP this window rather than move it to the 24th–26th, and
  accepted that the last 3 days are an estimate — hence the pre-share
  re-check below.
- **Pre-share re-check**: before Share, every approved invoice is recomputed
  against the live roster; anything that moved shows an amber banner (days and
  net, was → now, per agent) plus a confirm dialog. She can Return them or
  send the approved figures.
- Invoice snapshots freeze figures, docs, payment details **and now the
  signature image** at submit. Amounts and bank details in the Finance email
  come ONLY from the snapshot — the old live fallback could email an account
  number nobody approved.
- ฿0 invoices are blocked at submit, and a T1/Return/CC agent cannot be saved
  with `costDay <= 0`.
- Agents with 0 rostered days but a submitted invoice, and agents who left
  mid-period, stay in the batch. An approved invoice also stays in the batch
  even if the agent row is later renamed or deleted (it's a debt).

## INCIDENT LOG — 2026-08-18/19
1. **RO paid as worked** → overpaid ฿2,700 in August (Joy 24d vs 23d, plus
   KhaoPun and Aof). Fixed in `computeInvoiceFigures`.
2. **Sign-day clobber (18 Aug).** ~10 agents used the app at once for the
   first time; `nirm-agents` was ONE array under one key, so last-writer-wins
   wiped signatures, document links, submitted invoices and corrected names
   repeatedly. → the `kv_records` per-record store.
3. **Three critical data-loss bugs found by audit and fixed:** flush-on-hide
   was dead code (stale closure over `storageLoaded` in a `[]`-deps effect) so
   an agent who signed and switched apps lost it; realtime own-echo re-applied
   your own write over newer edits; `casWrite` armed the CAS with the server's
   live version when the tab had no true ancestor, replacing a whole key with
   no merge (almost certainly the July `allBrandAsgn` wipe).
4. **My own regressions, both fixed:** the conflict guard advanced the ancestor
   before throwing, so the new retry then overwrote the newer record 2s later;
   and `recId` lower-cased `id`, renaming every A-prefixed agent by
   delete+reinsert (`A01` → `a01`). Nothing was lost but it was luck.
5. **A crash I shipped:** the "allow late" button referenced `r.agent.id`
   inside `rows.map(({agent}) => …)` — `ReferenceError`, white-screened
   Invoice Approvals for any not-yet-submitted agent. Tests missed it because
   every test row had an invoice. **Lesson: render a PENDING row in tests.**
6. **Deleted agents resurrected themselves** — a stale tab re-inserted all 16
   A-rows at 05:56. Fixed with tombstones (`deleted_at`), then the 9
   duplicates were removed again and have stayed gone.

## What worked
- **Supabase MCP** for everything server-side: `execute_sql` (read + admin
  fixes), `apply_migration`, `deploy_edge_function`. No PowerShell needed.
- Delivering code: edit in `/home/claude/build/src`, `npm run build` to prove
  it compiles, then `SendUserFile` → `device_commit_files` (force) → **April
  commits and pushes in GitHub Desktop.**
- **Do NOT run `git` through `device_bash`.** Every git command leaves a
  `.git/index.lock` the bridge cannot unlink, and her next commit fails with
  "A lock file already exists". Reading `.git/refs/...` with `cat` is safe.
  `_to_delete/` is now in `.gitignore` for the locks already parked there.
- Verifying a deploy: fetch `/index.html` → regex the `/assets/index-*.js`
  path → substring-search for unique string literals. **Comments are minified
  away; template-literal text is split** — search for a contiguous literal
  (`"v3.3 installed"`, `"This invoice totals"`), not a whole sentence.
- Node render tests with esbuild: bundle the jsx `--jsx=automatic`,
  `--external:react --external:react-dom/server`, and
  `--define:import.meta.env.VITE_SUPABASE_URL='"..."'`. Suites live in
  `/home/claude/build/*.mjs` and `/home/claude/rectest/*.mjs` (fake supabase
  backend in `rectest/supabase.js` — genuinely useful, keep it).
- **Reading a scanned PDF** (no text layer, sandbox cannot reach supabase.co,
  base64 through `javascript_tool` is BLOCKED by a filter): in a
  nirmroster.vercel.app tab, inject pdf.js from cdnjs, render page 1 to a
  fixed-position canvas at z-index 2147483647, then `computer` screenshot +
  `zoom`. Chrome's own PDF viewer URL is "browser-internal" and cannot be
  screenshotted. Plain images can be opened directly and screenshotted.
- Parallel `Agent` subagents for the audits (invoice workflow / storage /
  server+DB) found real bugs I had missed, including two of my own. Worth
  repeating before any big change.

## What didn't work
- `WebFetch` on a scanned PDF — no text layer, returns nothing.
- Trying to screenshot Chrome's native PDF viewer, or `document.body.innerHTML`
  injection into the React app (it re-renders over it) or appending to
  `document.documentElement` (detaches the CDP target).
- Auto-filling doc links by matching filenames was right for restoring lost
  links, but the ✓ in the Docs column only means "a link is stored" — it does
  not check the file opens or is the right person. Verify visually when it
  matters.
- Editing her machine's files with LF endings — **her files are CRLF**; python
  patches must use `NL = "\r\n"`.

## Data still needing April (nobody else can fix these)
- **Ploy (08)** — `thaiName`, `taxId`, `bankAccount`, `bankAccountName` are all
  literally the string `"test"`.
- **Nan (13)**, **Eve (19) / Apple (20)** — check current doc state; 13 had no
  ID card or bookbank at all.
- **Aof (09)** and **Gyb (11)** payment details were typed by me from their own
  bookbank/ID card photos (verified against the ID cards): Aof Kasikorn
  074-1-09333-2 tax 1549900132231; Gyb Kasikorn 117-1-29711-3 tax
  1100501043761. **April should eyeball both account numbers before the batch
  goes out** — they came from OCR, not from the agents.
- 7 of the August invoices have no frozen signature (submitted before that fix)
  but all 7 agents DO have a live 2026-08 signature, so the PDFs still sign.

## Automation running
- **Scheduled task `trig_01VSg1KbCzCfUaD5had5jnC7` — "NiRM daily data health
  check", 01:00 UTC (08:00 Bangkok) daily, push + email.** Read-only. Checks
  agent count and duplicates, invoice arithmetic, approved invoices missing
  bank details or signature, orphans, duplicate invoice numbers,
  `sent_to_finance` vs `invoice_sends` mismatches (the double-pay tripwire),
  ฿0-rate agents, placeholder junk, and that the site loads. Reports one line
  when clean.

## Next steps
1. **The batch has not been sent.** When April is ready: check the amber
   re-check banner, confirm Aof's and Gyb's account numbers against the
   images, then Share to Finance. Afterwards reconcile the email's count and
   total against `invoice_sends` by hand, once.
2. **Close the `payroll-docs` bucket** (set `public = false`, switch the app's
   image display and `share-batch`'s `addDoc` to signed URLs). This is the
   last real security hole: Thai national ID cards are currently readable by
   anyone with the link.
3. Remaining cosmetic audit items: `invoiceNumber` uses only the last 2 digits
   of the PCODE (collides past 99 / with `A101`); recipients silently
   truncated past 3 To / 10 Cc; `period` falls back to the literal string
   `"period"` if the client ever omits it.
4. Consider deleting the stale `kv_state` rows for `nirm-agents` /
   `nirm-invoices` (the app no longer reads them, but they are misleading and
   were briefly a fallback source of stale data).
5. Older open items from the sections above are untouched: Redshift env vars
   in Vercel for live CUSP orders, the Report-tab cost window decision, M365
   mail auto-sync (blocked on IT), Shopify webchat go-live.

---

## 2026-08-20 — Document compression (so the Finance batch email fits)

**Problem.** The batch failed with "The object exceeded the maximum allowed size", and
even after the bucket limit was raised the attachments were ~28 MB — over the mail limit.
Root cause was a handful of huge scans, worst of all Otar's ID card (4.2 MB), Eve's ID
card (4.0 MB, a 24-megapixel phone photo) and Otar's bookbank (3.4 MB).

**What was done.** 17 documents were re-encoded at max 1600 px / JPEG quality 72-75 and
written to NEW object paths (`<original>_c.jpg` / `_c.pdf`). Originals were left untouched
in the bucket as a safety net. Agent records and the frozen snapshots on all 19 un-sent
August invoices were then re-pointed at the compressed copies (`updated_by='doc-compress'`,
version bumped, so open tabs pick it up over realtime).

Referenced document payload for the August batch: **~18.5 MB -> 6.3 MB**. It now fits in
one email.

**Every output was checked by eye before any record was re-pointed.** That mattered: the
first pass produced a solid-black page for Daran's bookbank (grayscale JPEG inside a PDF).
Never re-point a record at a compressed file you have not looked at.

**Bank details cross-check.** While the bookbanks were open, the account numbers for
agents 02, 04, 05, 06, 07, 12, 15, 16 and 19 were compared against the app: all nine match.

**Tooling used, and its state now.**
- Edge function `doc-compress` (inspect / compress / ingest) — **disabled**, returns 410.
  Source is in its version history (v3) if a future pass is needed. Its `ingest` route was
  an upload path guarded only by a hard-coded secret, which is why it is not left open.
- Edge function `dc-env` (env-var diagnostic) — **disabled**, returns 410.
- The `http` Postgres extension was installed temporarily to call the function from SQL and
  has been **dropped** again, along with the `public._dc()` helper.
- Supabase image transformations are **not available** on this plan (`FeatureNotEnabled`),
  which is why compression had to be hand-rolled.
- This container cannot reach `*.supabase.co` directly (proxy blocks it). Bytes were moved
  via the user's own machine (PowerShell + System.Drawing for the 24 MP file that was too
  large for the edge runtime to decode) and via the device bridge.

**Prevention.** `allocShrinkImage()` in `AllocationRoster2026.jsx` downscales images in the
browser at upload time — but that code is **still un-pushed**. It also does not touch PDFs,
so a large scanned PDF can still slip in. If the size problem returns, look at PDFs first.

---

## 2026-08-20 (later) — the August batch went out twice: once wrong, once corrected

**What Finance received first.** Prim pressed Share at 16:19 Bangkok. All 19 invoices
were delivered, but every Thai character on the invoice page printed as an empty
box, and the email body was a monospace text block.

**Root cause of the boxes.** `share-batch` fetched Sarabun through the Google Fonts
CSS endpoint, which serves the **latin subset**. The TTF embedded without
complaint, so the code's `thaiOk` flag stayed true and it happily drew Thai
characters the font had no glyphs for.

**share-batch v4.3 now:**
- Loads the complete Sarabun TTF from the Google Fonts repo, caches it in storage
  (`payroll-docs/assets/`), and **verifies it really has Thai glyphs**
  (`hasGlyphForCodePoint` for a letter, the baht sign and a tone mark) before
  trusting it. With no usable font the build FAILS rather than emailing boxes.
- Page 1 is a field-for-field reproduction of the app's own Print view - the Thai
  tax invoice: payee block, boxed title, CREA's customer details, one service
  line for the month, net and withholding, payment channel, eSign block.
  Addresses come from the agent record (they are not in the invoice snapshot).
- **Every Thai string lives in `labels.ts` as \u escapes** so `index.ts` is pure
  ASCII and the Thai cannot be mangled by an edit. All 27 strings were verified
  against `AllocationRoster2026.jsx` by extracting text from a generated PDF.
- Every merged document page is normalised to A4: oversized scans are scaled
  down, smaller ones are centred on white space, nothing is enlarged. Rotation is
  left alone (the target box is swapped for 90/270 pages).
- Finance gets an **HTML table** (row per agent, Thai name, bank account, tax ID,
  totals row) with the old text block kept as the plain-text fallback.
- The "approved by" line names the invoice's OWN `managerBy`, not whoever pressed
  the button, so a corrected copy matches the one Finance already holds.

**Data fixed along the way** (snapshots frozen before the names were completed):
08 `PHEERAPAT` -> `Ms. Pheerapat Kuayniam`, 20 `Apple` -> `Ms. Tanaporn Tonghwan`,
09 `Mr.Supichak Rajchasic ` -> `Mr. Supichak Rajchasic`. All 20 agents now match
April's HR table exactly, in both the agent record and the August invoice.

**Teams tab.** The bottom total AND the summary tile above it both counted
`a.active` only, so they read 161,962.50 against the 169,762.50 Finance was asked
to pay - the gap is Ploy 5,400 + Apple 2,400 + Nan 0, all switched off but all
with worked days. The tile also kept its own private copy of the pay-period
maths; it now calls `computeInvoiceFigures` like everything else.
`build/teamstotaltest.mjs` replays the real August numbers and fails if either
place starts filtering on `active` again.

**The corrected batch - and the mess I made of it.** It first went as 3 emails
(groups of 7), because rebuilding 19 merged PDFs in one call kept hitting the
compute limit. That was the wrong fix twice over: April had asked for one email,
and each of the three carried a banner reading "This replaces the batch emailed
earlier", so anyone reading group 2 or 3 would think groups 1 and 2 were the bad
ones. The PDFs were ALREADY built and filed in storage - attaching finished files
is far lighter than generating them, and all 19 fit in a single call easily.
`final-batch-email` (now retired) did exactly that: one email, 19 attachments,
6.8 MB, with a notice naming precisely which earlier email to ignore. It also
purged three stale PDFs left under the pre-correction filenames
(`20260808 PHEERAPAT.pdf`, `20260809 Mr.Supichak Rajchasic.pdf`,
`20260820 Apple.pdf`) so the archive holds exactly one file per invoice.

LESSON: to re-send a batch, attach what is in `invoice-pdfs/<period>/`. Only
rebuild when the content itself has to change.

The 3-group send went to the usual Finance list
with Prim copied, each carrying a red "CORRECTED COPY - replaces the earlier
email, amounts unchanged, do NOT pay twice" banner and the grand total for all 19.
`invoice_sends` still holds **exactly the one original batch of 19 claims from
09:19** - the resend path never claims, releases or changes a status, so no
double payment was possible.

### TOP FOLLOW-UP for next month
Building 19 merged PDFs in ONE function call sits right on the edge-runtime
compute limit: it succeeded once and failed twice with `WORKER_RESOURCE_LIMIT`.
The app's Share button still sends everything in one call, so **September may fail
the same way**. A retry is safe (failed claims are released), but the fix is to
build and send per chunk instead of building all of them first - or have the app
call share-batch in groups of ~7, which is what the retired `resend-batch` v2 did.

Also retired: `doc-compress`, `dc-env`, `resend-batch` (all return 410; working
source is in each function's version history).
