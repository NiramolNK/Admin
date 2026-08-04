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
