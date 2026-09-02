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

---

# DAILY COUNT + PRESENCE SESSION - HANDOFF (2026-08-21)

## Goal
Collect daily volume from the platforms that are NEITHER in Duoke NOR already in
NiRM - Amaze, Call CC, Line MyShop, Brand.com - by having agents tap a counter
during the shift instead of recalling a number at the end. Then show who is in
NiRM live. Along the way: recover from a mass agent-delete (see INCIDENT below).

## Decisions April made (do not re-litigate)
| Decision | Chosen |
|---|---|
| What counts as 1 | One customer you replied to. Same person back later = tap again. |
| Phone | ONE counter, "calls handled". No missed-call counter. |
| Phone grain | Per brand, same as chat. |
| Signing/edit window | Today and yesterday (Bangkok). Manager can reopen one shift. |
| Presence visibility | Manager + T2 see names and current tab. Everyone else sees a count only. |
| Show tab name | Yes. |

Tap surface is small on purpose: only 8 brands carry a manual platform
(b03/b28/b32/imp...rp6c = Amaze, b78/b79/b80 = Brand.com + Call CC,
imp...wkh = Line MyShop) - about 11 brand-platform pairs for the whole team.
That is why per-brand phone costs nothing: only 3 brands have Call CC.

## DB installed (public AND staging, both live)
- `daily_tally` - APPEND-ONLY tally events. Count = `SUM(delta)`.
  **There is deliberately NO update and NO delete policy, for anyone.** A
  miscount is a `delta = -1` row. This is the one shape a stale tab cannot wipe.
  `event_id` is client-generated, so a re-flush / crash replay is a no-op.
- `shift_submission` - the "End shift" press, PK (work_date, shift, agent_id).
  Its ABSENCE is what makes a shift read Missing; a row with
  `confirmed_total = 0` is a real quiet shift. Without it you cannot tell the
  two apart.
- Views (all `security_invoker`): `v_tally_daily`, `v_tally_hourly`,
  `v_tally_brand_day`, `v_shift_status`.
- Helpers: `bkk_today()`, `my_agent_id()`, `is_supervisor()` - SECURITY DEFINER,
  pinned search_path, EXECUTE revoked from `anon`. Trigger functions have
  EXECUTE revoked from authenticated too (they were exposed as RPC endpoints).
- Trigger `daily_tally_guard` - blocks future dates, blocks shifts older than
  yesterday unless a manager reopened that exact shift, blocks writing another
  agent's row, blocks a non-manager writing `source <> 'manual'`.
- RLS: agent sees own rows; `role in ('manager','fulltime')` sees all.
- `user_id` / `submitted_by` are NULLABLE on purpose - `auth.uid()` is NULL for
  the service role, so an importer could never have written a row otherwise.
- 12 self-tests passed at install. Staging is seeded with 7 days of dummy taps
  (~2,550 rows) for previewing; production tables started empty.

## Agent <-> login mapping
`my_agent_id()` matches `auth.users.email` to the agent record's `email`.
21 of 27 agents have an auth account; the 6 A-prefixed T2 rows do not and get
null (the screen says so plainly instead of failing). If someone reports "not
linked", check their agent record's `email` equals their login email.

## Files
- `src/dailyTally.js` - data layer. Tap buffer lives in the MODULE, not React
  state (the old flush-on-hide was dead code because of a stale closure over
  `storageLoaded` with `[]` deps). Buffer mirrored to localStorage so a crash
  does not lose an agent's afternoon; replay is safe because of `event_id`.
  Uses plain `.from()` - the client in `supabase.js` is ALREADY schema-scoped,
  so re-applying `.schema()` would defeat sandbox routing. Public helpers are
  reached with `supabase.schema('public').rpc(...)`.
- `src/DailyCount.jsx` - three views: agent My Shift (tap), Shift Board, Volume.
- `src/livePresence.js` - Supabase Realtime Presence. No table, no writes.
- `src/LiveNow.jsx` - header chip + `PresenceDot` + `usePresenceTick`.
- `AllocationRoster2026.jsx` - new `daily` tab: ROLES tabs, sidebar entry+icon,
  header title, content block, `LiveNow` in the top bar, and three wiring
  helpers (`myTallyAgentId`, `tallyShiftFor`, `tallyBrandsFor`) next to
  `brandsForAgentOn`. `installTallyHooks()` runs at module load, not in an
  effect, deliberately.
- `safeStorage.js` - the bulk-delete guard (below).

Naming trap: the data layer is `dailyTally.js`, NOT `dailyCount.js`. On Windows
a case-only difference from `DailyCount.jsx` resolves to the wrong file.

## INCIDENT 2026-08-21 10:58 - all 21 agent records tombstoned in one save

**Symptom.** Agents saw "No personal schedule linked ... isn't linked to an
agent yet" and the roster rendered empty. The email on the record was correct.

**What actually happened.** Every agent record that HAS a login account - 01-20
plus F07, 21 records - had `deleted_at` set within the same minute, by the same
`updated_by` client id, in a single save. No values were changed; `updated_at`
stayed at its older timestamps. The 6 survivors (A01-A05, A16) are exactly the
agents with NO auth user.

**Nothing else was lost.** `nirm-allAsgn` (12 months), `nirm-allBrandAsgn`
(6 months), `nirm-allExtraHrs`, `nirm-brands` (78), `nirm-userAccounts` (29) all
intact. Invoices intact: 19 live for 2026-08, all 19 present in `invoice_sends`.
The roster only LOOKED empty because it had no agents to draw rows for.

**Mechanism** - `safeStorage.setRecordDomain`:
```js
for (const id of shadowM.keys())
  if (!incoming.has(id)) deletes.push(casDeleteRecord(domain, id));
```
Anything the tab holds in its ancestor but which is MISSING from the array being
saved gets tombstoned. Correct for a real one-agent delete; catastrophic for a
save carrying a truncated list. `kv_state` already had a shrink guard
("Refused: userAccounts shrank from 19 to 3"); the per-record store never did.

**Recovery.** `update public.kv_records set deleted_at = null, version = version
+ 1, updated_by = 'restore-mass-delete-20260821' where domain = 'nirm-agents'
and deleted_at is not null and deleted_at >= '2026-08-21 00:00+07' and
updated_by <> 'duplicate-cleanup-20260819'` -> 21 restored, 27 live again.
The nine A-prefixed duplicates from 19 Aug stay deleted. `active` flags were
untouched, so Ploy/Nan/Apple remain deactivated as intended.
Always bump `version` - clients CAS on it. Then hard-refresh every tab.

**ROOT CAUSE NOT PROVEN.** The guard stops the damage but the line that saved
the short array was never identified. Strongest clue: the deleted set is exactly
the login-holding agents and the survivors exactly those without, which points
at whatever reconciles agent records against user accounts. If it recurs,
`window.__nirmBlockedDeletes` now records incoming/ancestor sizes and the ids.

## FIX SHIPPED - bulk-delete guard (`safeStorage.js`)
`const MAX_BULK_DELETE = 3;` plus a branch in `setRecordDomain`: if a save would
delete more than 3 records it REFUSES the deletions, still performs the writes,
logs every id with `console.error`, pushes the detail onto
`window.__nirmBlockedDeletes`, fires a `nirm-bulk-delete-refused` event, and
then re-reads the domain from the server so the tab stops acting on its short
list (without that it would retry the same bad save every autosave). Covers
`nirm-invoices` as well as `nirm-agents`. A genuine one-at-a-time delete from
Teams is unaffected.

## Bugs found and fixed in the new code
1. **Missing status was unreachable.** An agent with no taps AND no End shift has
   no row in either table, so `v_shift_status` cannot produce them - the Shift
   Board would have shown a clean board with a person absent from it. Fixed by
   merging the rostered list in on the client. Same trap as the invoice tests
   where every test row had an invoice.
2. **All 6 T2 shown as Missing on every shift** (my bug - I filtered only on
   `active === false`). T2 are salaried and do not run the part-time tally, so
   `DailyCount.jsx` now skips `team === "T2"` when seeding rostered-but-absent
   rows. A T2 who genuinely taps still appears, because view rows are seeded
   first.

## What worked
- Supabase MCP for all server work: `apply_migration`, `execute_sql`,
  `get_advisors`. No PowerShell needed.
- Desktop Commander `edit_block` for surgical edits to the 7,200-line
  `AllocationRoster2026.jsx`. Because the edits were surgical, a fix another
  session had made to `DailyCount.jsx` was NOT clobbered - check file mtimes
  before assuming your copy is current.
- **Node IS available on April's machine** at
  `C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe`
  (v24). `npm` is not, and there is no `node_modules`. Copy a `.js` to a `.mjs`
  and run `node --check` on it for a real parse check of plain-JS files.
- Reading `.git/HEAD` and `.git/logs/HEAD` with Get-Content to see branch and
  recent commits. Do NOT run git - it leaves a `.git/index.lock` the bridge
  cannot unlink and April's next commit then fails.
- Deriving the channel vocabulary from `nirm-brands[].platforms` instead of
  inventing one. The names Shopee/Lazada/Tiktok/Amaze/Brand.com/Call CC/Email/
  Line MyShop already exist there.

## What didn't work
- `npm run build` locally - no npm, no node_modules. Vercel is the compile check.
- The sandbox container cannot reach supabase.co (still true).
- A standalone HTML preview page was the wrong answer to "can we see it in the
  sandbox" - she meant NiRM itself. The right answer is a branch + Vercel
  preview, which routes to `staging` automatically.
- Selecting whole `nirm-agents` values in SQL - the base64 signature images
  blow up the response. Select named fields only.

## Next steps
1. **Commit and push.** Presence and the guard are uncommitted in the working
   tree on CREA-HQ (= production). Hard-refresh every device afterwards; the
   restore bumped every version so open tabs hold stale shadows.
2. **Extend the snapshot trigger to `kv_records`.** `kv_snapshots` only archives
   `kv_state`, so agent and invoice records have NO version history. Recovery
   worked this time only because the delete was soft. Fallback today is the
   `kv_records_good_20260819` table.
3. **Write the auto importer** for Email/Webchat (`source = 'auto'` from
   `tickets`/`messages`). Until it exists the Volume matrix shows tapped volume
   only - the screen says so rather than showing a fake zero.
4. Add to the 08:00 health check: shifts with taps but no submission older than
   yesterday, `v_shift_status.drifted = true`, and any `daily_tally` row on a
   Duoke platform (means double counting).
5. Only after ~2 weeks of real taps: feed actual volume into brand allocation
   (replacing the `monthChats/30/2` estimate) and into the Report tab's
   cost-per-chat. The `recalled` flag tells you whose numbers to trust first.
6. Presence payload (name, role, tab) rides a shared Realtime channel with no
   per-subscriber filtering, so the count-only view for agents is a UI rule, not
   a wire rule. A curious agent with dev tools can read the names. Gate it in an
   edge function if that matters.


# SERVICE CRM + LOADER SESSION — HANDOFF (2026-08-25)

## Goal
April's day was mostly Service CRM: a Manual tab, an editable reply recipient,
same-topic case threading, and a loading animation. One item is unfinished (the
People tab). One thing I broke and fixed — read the incident below before
touching AllocationRoster2026.jsx.

## INCIDENT — I deleted Daily Count from the Roster (fixed same day)
My sandbox copy of `src/AllocationRoster2026.jsx` was ~5 KB behind the repo. I
wrote it over hers to add two lines, and it took **Daily Count, Live Now, the
presence wiring and the tally hooks** with it (commit `a45e95a`). Restored from
`a45e95a~1`, my two lines re-applied on top, verified live.

**Rule for the next agent: never write a file you have not diffed against the
device copy in this session.** The sandbox is not authoritative. `certutil
-hashfile <file> MD5` on the device vs `md5sum` locally takes ten seconds.
`otptest.mjs` now asserts Daily Count / Live Now / presence still exist in the
Roster, so this specific loss fails a test instead of reaching production.
(Also: in `cmd`, `^` is an escape char — `git show a45e95a^:file` silently gives
you the WRONG commit. Use `a45e95a~1`.)

## Shipped and LIVE (verified in the deployed bundle 2026-08-25 ~16:30 UTC+7)
- **Manual tab** in Service CRM (`src/CrmManual.jsx`, new). How-to-use-the-CRM
  doc, all CRM roles read, Manager/T2 edit, markdown-lite renderer (no
  dangerouslySetInnerHTML). Content in new table `crm_manual`, RLS: read =
  authenticated, write = `is_manager()`. Seeded with 7 sections written from the
  real SLA/status/channel rules. Thai titles present, Thai bodies empty on
  purpose (falls back to English — the team should write their own).
- **LINE login-code card** moved to the Roster shell, **Roster tab only**, and
  removed from the CRM dashboard (it was rendering twice).
- **Editable To: on replies** — chips, add/remove any (including the last),
  paste several at once, amber chips suggest real correspondents from the case.
  Empty To disables Send rather than blocking the edit.
- **From: outbox dropdown** on replies, and the **signature re-resolves** for the
  chosen mailbox.
- **Loading cat** (`src/CuteLoader.jsx` + `src/assets/cat-idle.png`). April's own
  4-frame sprite sheet, magenta chroma-keyed with a despill pass, frames aligned
  on the feet, 30 KB, CSS `steps()`. Hooked into `window.fetch` ONCE — counts
  non-GET requests, so every save in the app shows it with no call-site changes.
  250 ms grace period; `pointer-events:none` so it can never trap a click.
  `tools/sprite.py` rebuilds the strip from any new sheet.
- **Duplicate inbound emails fixed.** SendGrid occasionally delivered the same
  message twice within a second and both passed the pre-insert dedupe check.
  Removed 5 existing copies (backed up to `messages_dupe_backup_20260825`),
  added unique index `messages_inbound_msgid_uniq (external_id, meta->>ourBox)`
  and a BEFORE INSERT trigger that silently skips a duplicate so the webhook
  answers 200 instead of 500.
- **email edge function v31 deployed** (version 34, `verify_jwt` stays FALSE —
  SendGrid cannot send a JWT). Now also in the repo at
  `supabase/functions/email/index.ts`; it previously existed ONLY on Supabase's
  servers with no history and no review path. Three changes: optional `to` on
  `/send` (validated, refuses our own mailboxes, per-message only —
  `tickets.customer_email` is never rewritten); `/recipients` returns `senders`
  and `suggestedTo`; inbound tolerates the new unique index.
- **Same-topic threading.** An open case is now matched on subject alone when the
  subject is distinctive (carries a 5+ digit reference, or is 15+ chars).
  Generic subjects ("สอบถาม", "(no subject)", "urgent") still require the same
  sender, or two customers would end up in one case. Resolved/closed never join.
  Mailbox groups live in kv_state key `nirm-crm-mailbox-groups`, currently
  `[["cs.solution@crea.asia","nestlepro.cs@crea.asia","cs@crea.asia"]]` — I added
  cs@ on my own judgement because the real Nestlé split was cs.solution vs cs@.
  April may want it removed; it is config, not code.

## The Mars case — still open, needs a human
**TK-E10478** "Mars Shopee Order : 260529NX6RX08F". The case was opened by an
email WE sent, so `tickets.customer_email` = `cs.solution@crea.asia` — our own
address. Two replies on 24 Aug went To: ourselves with `contact@sea.mars.com` on
neither To nor Cc, so Mars's case system never received the consumer's email
address and asked again on 25 Aug. The editable To: now fixes this in the UI,
but **nobody has actually sent the reply yet.**

## What Worked
- Reading the deployed JS bundle to prove what is actually live. `Invoke-WebRequest`
  the index, regex the `/assets/*.js`, `.Contains()` for marker strings. This is
  how I found the real cause of "To: still can't edit": the UI was live but the
  function was not deployed, so the server silently ignored the `to` field.
- Querying `function_edge_logs` for status codes per path. Note the field is
  `log_attributes['request.pathname']`, NOT `request.path` (that returns empty),
  and the window is capped at 24 h so a week takes seven queries.
- Extracting the real functions out of `index.ts` with regex and running them in
  Node to test threading rules against actual subjects (`threadtest.mjs`) —
  tests the shipped code, not a copy that can drift.
- Chroma-keying with a despill pass (where min(r,b) > g, pull r and b down).
  Without it every whisker keeps a pink halo.
- Asking before deploying to the live email path. April said "no deploy" once,
  then chose to deploy later. Both were the right call at the time.

## What Didn't Work / gotchas
- The Supabase CLI is NOT installed on April's machine (`supabase` and `npx` both
  unrecognised). Edge functions must be deployed via the Supabase MCP tool, which
  needs the whole file inline in the call (~11k tokens).
- PowerShell mangles Thai and em-dashes in console output — a signature that
  looked corrupted ("NestlAc Professional") was fine in the database. Verify in
  SQL before reporting data corruption.
- `Get-FileHash ... | ForEach-Object { $_.Hash }` breaks through the MCP shell
  (`$_` is eaten). Use `certutil -hashfile` via `cmd /c`.
- Failed outbound sends leave NO trace in the app — the row is only written after
  SendGrid accepts. The only record is the edge function log, which expires.
  Worth fixing if April asks about "did this send" again.

## Next steps
1. **People tab (`UsersView`) — the unfinished item.** April: "not all people
   here, should be automatic add when added, and can edit."
   Findings so far:
   - `nirm-agents` holds **23 entries, 22 active** — exactly what the tab shows.
     The CRM is NOT dropping anyone; the missing people are missing from
     `nirm-agents` itself. Confirm with April WHO is missing before writing code,
     then check whether Roster › Teams actually saved them.
   - `loadOrgPeople()` runs **once**, at mount (ServiceCRM.jsx ~line 6220). Add
     someone in Roster › Teams and Service CRM will not show them until a full
     reload. Needs a refresh — poll, or a Realtime subscription on `kv_state`.
   - The tab is **read-only**, and there is a dead `add` modal in `UsersView`
     (state and `create()` exist, no button renders it). `create()` only pushes
     into local state — it never persists. Either wire it to write `nirm-agents`
     or delete it; leaving it would let someone "add" a person who vanishes.
   - One roster entry has an **empty email**, which is why the count is 23 total
     but role/mailbox matching can miss.
2. **Ask April about `cs@crea.asia`** in the mailbox group (see above).
3. **Send the Mars reply** on TK-E10478 — or tell April it is still waiting.
4. Optional, offered and not yet taken: **log failed sends** so a failure leaves a
   visible record on the case instead of only a red toast.
5. The threading change only affects mail arriving from now on. The two split
   Nestlé cases (9458, 9825) from 8 Aug stay separate; merge by hand if wanted.

## Files touched today
```
src/CrmManual.jsx            new — Manual tab
src/CuteLoader.jsx           new — loading cat
src/assets/cat-idle.png      new — 4-frame sprite strip, 30 KB
tools/sprite.py              new — rebuilds the strip from a sheet
src/ServiceCRM.jsx           Manual tab, To: chips, From: dropdown, dup card removed
src/AllocationRoster2026.jsx LINE card Roster-only, CuteLoader mounted (SEE INCIDENT)
supabase/functions/email/index.ts  v31 — now in the repo for the first time
```
Test files in the sandbox (not in the repo): cutetest, otptest, manualtest,
totest, threadtest, plus the earlier suites. All green at end of session.

---
---

# WRITE-STORM OUTAGE + DATA SAFETY SESSION — HANDOFF (2026-09-02)

**This is the newest section. It supersedes everything above where they conflict.**

## Goal
Two things, in order: (1) find out why NiRM was unusable on the morning of
2026-09-01 and stop it recurring, (2) answer April's follow-up — *"I want the
data we have now safe and maintained good in the future"* — with real
protection, not advice.

## The outage — 2026-09-01, 03:00–03:39 UTC (10:00–10:40 Bangkok)
Measured from `edge_logs`, not guessed:

| | Normal | Peak of the incident |
|---|---|---|
| Avg response | ~400 ms | **23,120 ms** |
| p95 | ~850 ms | **98,246 ms** |
| Max single request | ~3 s | **163,363 ms** |
| kv_state PATCHes / hour | ~150 | **1,792** |

**Postgres restarted itself at 03:26:37 UTC** (confirmed via
`pg_postmaster_start_time()`; 267 × 5xx in that window). The restart was a
*symptom* — degradation started ~02:50, half an hour earlier.

### Root cause: two tabs writing each other's changes back, forever
`AllocationRoster2026.jsx` keeps `lastSavedJson` (a ref) to answer "did this key
change since I last saved it?". It was written in exactly four places: declared,
read by the dirty check, read by the wipe guard, written after a successful
save. **Nothing updated it when another client's change arrived over realtime.**

So: you edit → your tab saves → their tab receives it, applies it to React
state, compares against *their* last save, sees a difference, and writes it
straight back → your tab receives that, same logic, writes back → forever.
Neither tab is wrong. Neither ever stops.

Evidence that nails it — the same version retried against an unchanged row:

```
?key=eq.nirm-allBrandAsgn&version=eq.4861   × 31 attempts, avg  89,097 ms
?key=eq.nirm-allBrandAsgn&version=eq.4860   × 19 attempts, avg 122,082 ms
```

And `nirm-prefs` was at version **20,332**, `nirm-role` at **12,373**. Those are
not edits anyone made — they are ping-pong laps.

Two things turned waste into an outage: `nirm-allBrandAsgn` is a **2.09 MB**
row whose every write fires five triggers (one rebuilds `brand_assignments`),
and `safeStorage.js` had `MAX_RETRIES = 6` with **no backoff and no jitter**, so
one `set()` became six PATCHes and six GETs as fast as the network allowed.

### On who caused it — the logs cannot tell you, and that is the honest answer
Traffic came from one Bangkok IP (`171.102.152.235`) running **three browsers**
at once (Chrome 151, Chrome 152, Edge 152) — 62% of all requests that hour.
`edge_logs` carries IP, browser and city and **no user identity**;
`auth.audit_log_entries` is pruned and empty for the window; `kv_state.updated_by`
holds a random per-tab UUID by design. One sign-in happened in the window
(prim.v@crea.asia, 09:49 Bangkok) — that is a coincidence that fits, not
evidence, because everyone else was already signed in. **Do not name anyone.**
Three browsers is not misuse; two would have started the same loop. The code was
the defect.

## Shipped and VERIFIED LIVE in the deployed bundle (2026-09-02 ~12:40 UTC+7)
Bundle `/assets/index-DRDg1w3q.js`, marker string `"v3.5 installed"` present.

1. **Ping-pong fix** — `AllocationRoster2026.jsx`, in the realtime sync handler.
   After applying a remote value, record it as this tab's save baseline:
   ```js
   if (d[stateKey] != null) {
     setter(d[stateKey]);
     try { lastSavedJson.current[storageKey] = JSON.stringify(d[stateKey] ?? null); }
     catch (_) { delete lastSavedJson.current[storageKey]; }
   }
   ```
   Only keys actually applied are rebased, so a genuine unsaved local edit still
   saves. **This one line would have prevented the outage.**

2. **safeStorage v3.4 — CAS backoff with jitter.** `backoff(attempt)`:
   `min(50 * 2^(attempt-1), 800)` ms × `(0.5 + random())`, called at the top of
   both retry loops (`casWrite`, `casWriteRecord`). The jitter matters more than
   the exponent — without it two clients back off identically and re-collide in
   lockstep forever.

3. **safeStorage v3.5 — `LAZY_KEYS`.** `fetchAll()` used to `select *` from
   `kv_state` on every app load: **3.4 MB of JSON**, one unfiltered query
   averaging 1.7 s (max 7 s) even on an idle database. Now excludes five
   screen-specific/dead keys, fetched on demand by `get()`/`peek()`:
   `cs-analytics-monday` (754 KB), `nirm-all` (262 KB, dead since 6 Jul),
   `nirm-agents` (107 KB, superseded by `kv_records`),
   `kb-brand-pics-backup-2026-08-21` (31 KB, nothing reads it),
   `cs-analytics-cusp` (17 KB). **3,493 KB → 2,350 KB, a third off every load.**
   Two callers assumed everything was preloaded and were fixed:
   `seedRecordsIfNeeded` now fetches the legacy blob itself; `list()` still
   reports lazy keys. Already-fetched lazy keys survive a realtime reconnect.

### Result — measured the next morning, same 10am rush, MORE users online
| | Storm (1 Sep 02:40–03:45) | After (1 Sep 05:36–06:36) |
|---|---|---|
| kv_state PATCHes | 1,792 | **157** |
| Clients | 8 IPs, one with 3 browsers | 7 IPs, one browser each |
| Same version retried | up to **31×** | up to **2×** |
| Avg response | 18,940 ms | **~250 ms** |
| 5xx | 267 | 2 |

The retry column is the proof the *code* fixed it — fewer browsers explains some
of the volume drop, but not 31 → 2. There are now also 5-minute windows with
**zero** kv_state writes; during the storm there was never a quiet minute.

## Why NiRM is slow at 10am EVERY day (April's question — answered, part-fixed)
Not a scheduled job — `pg_cron` and `pg_net` are **not installed**. 10am is
simply the busiest hour of every day (shift start):

| Day | Requests in the 03:00 UTC hour | Rank in that day |
|---|---|---|
| Fri 28 Aug | 7,393 | biggest by far (next 3,300) |
| Mon 31 Aug | 3,813 | biggest morning hour |
| Tue 1 Sep | 5,360 | the one that broke |

~300 app loads land in that hour, and each was paying 3.4 MB + a 1.7 s query.
v3.5 removes a third of that. **The remaining 58% is `nirm-allBrandAsgn`
(2.09 MB)** — the whole year of brand allocations in one row. The roster needs
it at startup so it cannot simply be made lazy; it needs a **month split**,
which touches the trigger, the merge and the roster together. That is the single
biggest remaining win and it deserves its own session.

## Data safety audit + two DB migrations APPLIED TO PRODUCTION
Full report (living page, update rather than replace):
https://claude.ai/code/artifact/879f8fec-5ef4-4b06-96d7-597b172548a7

**Good news first:** RLS is on *with policies* on all 13 core tables, and the
app's guards (bulk-delete cap of 3, shrink guard, wipe tripwire, CAS + 3-way
merge, tombstones, server `kv_guard`) are genuinely thorough.

**The gap was time.** `kv_snapshot_on_change` kept `keep := 50` — fifty
*versions*, not fifty days — so history length was inversely proportional to how
much a key was used. Measured on the live DB, before the fix:

```
kv_records         (agents, payroll, bank, signatures)   NO HISTORY AT ALL
nirm-userAccounts  (who can log in)                      1h 19m
nirm-allAsgn       (the roster)                          6d 17h
nirm-allBrandAsgn  (brand allocations)                   6d 18h
nirm-monthlyVol    (barely edited)                       28d 00h
```

Note the shape of that: the key nobody touches had a month, the key controlling
logins had eighty minutes. **And the write storm ate the safety net** — it wrote
`nirm-userAccounts` 50 times in 79 minutes and pushed every older snapshot out.
A bug that caused damage also erased the record of what came before it.

### Migrations applied (via Supabase MCP `apply_migration`)
1. **`add_kv_records_version_history`** — new table `kv_record_snapshots`
   (`domain, record_id, value, version, deleted_at, op, saved_at`), index on
   `(domain, record_id, saved_at desc)`, RLS on, SELECT-only for `authenticated`
   mirroring `kv_snapshots`. Trigger `kv_record_snapshot_trigger`
   **AFTER UPDATE OR DELETE** (after, so the existing guards run first). Covers
   hard deletes deliberately — `window.storage.delete(domain)` wipes a whole
   domain in one statement and must not be the one call leaving no trace.
2. **`kv_snapshots_time_based_retention`** — retention is now newest 50 **plus**
   the last snapshot of each **Bangkok** day for 90 days, on both tables. Keeps a
   strict superset of the old rule, so nothing recoverable became unrecoverable.
3. **`lock_down_kv_record_snapshot_function`** — see "What Didn't Work" below.

### Verified, not assumed
Real round trip on a scratch record in domain `zz-selftest` (invisible to the
app; `RECORD_DOMAINS` only knows `nirm-agents`/`nirm-invoices`) — insert,
overwrite, hard delete, then read the original back:
```
op       version  value
UPDATE   1        {"name":"Original","payRate":1450,"bank":"kbank-1234"}
DELETE   2        {"name":"CLOBBERED","payRate":0}
```
The first row is what would have been lost forever the day before. Scratch rows
deleted afterwards (`scratch_rows_left = 0`); no real record was touched.

Retention simulated read-only on `nirm-monthlyVol` with the recent window
narrowed to 5 so the daily half had work to do: old rule kept 5 snapshots all
within minutes of each other, new rule kept **7 spanning 4 separate days**,
oldest 2026-08-04 — a month further back.

## What Worked
- **Reading the live database instead of the code's claims about itself.**
  `pg_trigger`, `pg_policies`, `pg_proc`, `kv_snapshots` grouped by key. The
  "1h 19m of login history" finding is invisible from the source — the rule
  looks fine until you measure what it produces under real write rates.
- **Reading the deployed bundle to prove what is live** (technique inherited
  from the previous handoff, and it paid off again — see the gotcha below).
- **Log fingerprints beat inference.** Counting *repeat attempts against the
  same version number* (31 → 2) separated the code fix from the confounder
  (a user closing two browsers). Volume alone would not have.
- **Proving a fix with a real round trip**, on a scratch domain, then cleaning
  up — rather than asserting the trigger "should" work.
- **Running the advisors again after the migration.** That is how the mistake
  below was caught, in the same session, rather than months later.
- Saying plainly that the logs cannot identify a person, instead of offering a
  name that happened to fit the timestamp.

## What Didn't Work / gotchas
- **I introduced a security regression and the advisor caught it.** The new
  trigger function inherited default grants and was briefly callable at
  `/rest/v1/rpc/kv_record_snapshot_on_change` by `anon` and `authenticated`.
  Fixed by migration 3. **Any new `SECURITY DEFINER` function in this project
  needs an explicit `revoke all ... from public, anon, authenticated`** — match
  `kv_snapshot_on_change`, which is `postgres` + `service_role` only.
- **Minified bundles eat identifiers.** Checking the deployed JS for
  `LAZY_KEYS`, `lastSavedJson`, `MIN_SHOW_MS` or `await backoff(attempt)` gives
  false negatives — the minifier renames them all. **Only string literals
  survive.** Use the `console.info` version banner (`"v3.5 installed"`) as the
  deploy marker. I briefly told April the deploy had not landed because of this.
- **`edge_logs` has no user identity.** Field list is IP / UA / Cloudflare geo
  only. Don't plan attribution work around it (see next steps item 8).
- **Node is not installed on April's machine** for development — only Adobe's
  bundled copy at
  `C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe`, with
  no npm. So **no local build/lint is possible**; Vercel builds on push. Usable
  for one-off scripts via a `.ps1`/`.js` file (inline `-e` gets mangled).
- **The MCP shell eats `$`.** PowerShell one-liners with variables silently
  break. Write a `.ps1` or `.js` file to temp and run that.
- **`formatDateTime(..., '%F %H:%M')` in ClickHouse gives the MONTH, not
  minutes.** Use `toString(toStartOfFiveMinute(timestamp))`.
- `query_logs` is capped at a 24 h window — a week takes seven calls.
- **`.github/**` is refused by `device_commit_files`** ("protected file"). Those
  files still have to be saved by hand (carried over from the previous session).

## Standing constraints — DO NOT BREAK
- **Never run `git` on April's machine.** She pushes herself, every time.
  (`push-result.txt` in the repo root is an old failed-auth artifact — a git
  credential dialog cannot be answered through the MCP shell.)
- **Test emails go only to `niramol.k@crea.asia`** — never the Finance list,
  never an external recipient, without explicit approval.
- Ask before deploying anything on the live email path.

## Next steps

### Blocked on April — do this first, it outranks everything below
1. **Confirm Supabase backups + point-in-time recovery are ON.**
   Dashboard → Database → Backups. Not visible through the API, so nobody else
   can check it. Every guard in this system is a *second* line of defence; if
   PITR is off there is no first. Get the retention window in days.

### High value, ready to start
2. **Split `nirm-allBrandAsgn` by month.** 2.09 MB in one row = 58% of what is
   left of the startup payload, AND the reason each of its writes took 90–120 s
   under load. Touches `nirm_kv_to_tables` (it already diffs by month — start
   there), the 3-way merge, and the roster's load path. Biggest remaining win.
3. **Weekly export April holds herself.** Scheduled job writing roster, agents,
   brands, allocations to a dated file in OneDrive. Supabase backups protect
   against Supabase failing; this protects against losing the account.
4. **Test one real restore.** Pick an agent record, restore it from
   `kv_record_snapshots` into a scratch table, confirm it comes back intact.
   An untested backup is a belief.
5. **Drop the dead weight — export first.** `app_state_history` is **273 MB**,
   54% of the 504 MB database, belonging to the storage layer retired in July.
   Plus nine dated rescue tables (~25 MB): `kv_state_backup_20260818`,
   `kv_state_good_20260819`, `kv_records_good_20260819`,
   `kv_records_deleted_20260819`, `kv_allasgn_rescue_20260826`,
   `messages_robot_backup_20260808`, `tickets_robot_backup_20260808`,
   `messages_attname_backup_20260824`, `messages_dupe_backup_20260825`.

### Resilience — offered, not yet built
6. **Tab leader election** (~30 lines, BroadcastChannel). One writer per browser;
   extra tabs become read-only followers. April asked whether making NiRM a
   desktop app would fix this — **no**: same JS, same requests, same shared rows;
   it would only prevent the three-browsers-on-one-machine case, at the cost of
   packaging, signing and 27 people on 27 versions. This is the cheap version of
   the same benefit.
7. **Split `nirm-prefs` and `nirm-role` per user.** Single shared rows that all
   27 people write — the reason they reached versions 20,332 and 12,373. This is
   the one that matters *because* many people use the tool.
8. **Stamp `updated_by` with the user id** instead of a random UUID, so a future
   runaway write is attributable from the database. April explicitly asked "who
   made it happen" and the answer today is "unknowable". This fixes that.
9. **Server-side circuit breaker** — reject writes when one client hits the same
   key more than N times a minute. Then no client-side bug can take the DB down.
10. **An alert**, so the next incident is noticed at 09:50 by a monitor, not at
    10:30 by agents.

### Small, still open
11. Enable **leaked-password protection** (Supabase Auth, free toggle) — April.
12. **Revoke `EXECUTE`** on `app_state_patch` and `app_state_patch_v2` — retired
    storage layer, any signed-in user can currently patch arbitrary state.
13. **`TEL_TOKEN`** in `src/ServiceCRM.jsx` ships in the client bundle; it is the
    same token 3CX uses, so anyone can forge a call event. Move it server-side.
14. **`xlsx@0.18.5`** — CVE-2023-30533, npm `latest` is stuck at 0.18.5
    (verified against the registry). Fix is the SheetJS CDN tarball; needs real
    testing of the XLSX export paths. See `SECURITY.md`.
15. **Three `.github/` files** (`dependabot.yml`, `workflows/security.yml`,
    `workflows/codeql.yml`) still need saving by hand — the bridge refuses them.
16. Five GitHub settings clicks: Dependabot alerts, Dependabot security updates,
    a ruleset on `CREA-HQ`, Actions read-only permissions, 2FA required.

### Carried over, still unfinished from earlier sessions
17. **Brand tagging** — 41 of 75 cases have no `brand_id` (all arriving via the
    shared `cs@crea.asia`). Flagged, not started.
18. **Amaze**: April to check Seller Center for a chat/message notification
    toggle; the `email` edge function then needs an Amaze classification so chat
    notifications become tickets instead of being archived as robot mail. The
    CP/Ascend chat-API request letter is drafted and needs shop IDs + contacts.
19. **TK-E10515** (Nestlé) draft reply still needs April's two decisions: whether
    point 3 (redelivery/refund) is hers to promise, and a real deadline date.
20. Run the Fix buttons for July/August/September/November allocation drift.

## Files touched this session
```
src/AllocationRoster2026.jsx   ping-pong fix in the realtime sync handler
src/safeStorage.js             v3.3 -> v3.5: backoff() + LAZY_KEYS + the two
                               callers that assumed a full preload
HANDOFF.md                     this section
```
Database: three migrations listed above. Nothing else in production was modified.
