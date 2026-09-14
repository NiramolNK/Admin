# NiRM security review — 10 September 2026

Project `bequrilwgooesolepubv` · org CREA's Org (Pro)

Everything below was verified by reading live configuration and function source.
Nothing was changed. No customer data was downloaded.

---

## Summary

The database perimeter is sound. The edge functions are not.

All 47 tables have RLS enabled and **not one policy grants `anon` or `public`** — an
outsider holding your publishable key cannot read a single row. That is the boundary
that matters most and it holds.

The problem is elsewhere: **18 of 22 edge functions run with `verify_jwt: false`**, and
most of them do no authentication of their own. Four of those can be driven by an
anonymous stranger into sending real messages to real customers as your brands. One is
an open mail relay. Separately, a Storage bucket holding national ID cards, bank books
and signed payroll PDFs is set to **public**.

Two of these need action today. Two of them are dead code and can simply be deleted.

---

## CRITICAL

### C1 — `email-proxy` is an open mail relay. Delete it today.

`supabase/functions/email-proxy/index.ts`, route `POST /send`. No authentication
appears anywhere in the file. The handler goes straight from `req.json()` to SendGrid:

```ts
const { account_id, conversation_id, user_id, text } = await req.json();
const toAddr = conversation_id || user_id;
...
personalizations: [{ to: [{ email: toAddr }] }],
from: { email: account_id },      // attacker-chosen
```

Both the sender and the recipient come raw from the request body with **no allowlist**
— unlike `invoice-notify` and `share-batch`, there is no `@crea.asia` filter here. Using
your `SENDGRID_API_KEY`, an anonymous caller can send mail:

* **to any address on the internet**, and
* **from any address on your SendGrid-authenticated domains** — including
  `finance@crea.asia`.

That is business-email-compromise as a service, on your own sender reputation and SPF
alignment. A fake "updated bank details" mail to your Finance team would pass every
authentication check a recipient could run, because it genuinely is from your domain.

`GET /messages?account_id=X` on the same function also returns 14 days of inbound
customer email — full body text — to anyone who guesses a mailbox address.

**It is not wired into the app.** `SVCRServiceDesk.jsx` keeps Email in manual-logging
mode (`defaultEndpointFor` returns `""` for it), and no brand in `svcr-settings`
references it. Deleting the function breaks nothing.

**Fix: delete the function. Then rotate `SENDGRID_API_KEY`,** because you cannot know
from here whether it has already been used.

### C2 — `payroll-docs` Storage bucket is public, with guessable filenames

| bucket | public | objects |
|---|---|---|
| `payroll-docs` | **true** | 148 |
| `brand-assets` | true | 2 |
| `web` | true | 3 |
| `ticket-attachments` | false | 862 |
| `NiRM` | false | 0 |

`payroll-docs` holds what `kv_records` points at: `idCardPhotoUrl`,
`bookbankPhotoUrl`, and invoice `pdfUrl`. In Supabase, `public: true` means those
objects are served with no authentication at all.

The two path shapes:

* `payroll-docs/bookbank_12_1787217408673.jpg` — `{type}_{agentId}_{epoch_ms}`. The
  agent id is a small integer; only the millisecond timestamp resists guessing. Anyone
  who has ever seen one of these URLs keeps access permanently.
* `invoice-pdfs/2026-08/20260809 Mr. <Full Name>.pdf` — **this one is constructible.**
  Date plus the person's name. 19 signed payroll PDFs with net amounts, tax IDs, bank
  details and signatures.

For Thai staff this is national ID card images and bank account details on an
unauthenticated URL. Treat it as a PDPA matter, not just a config error.

**Fix: set the bucket to private.** The app already signs URLs elsewhere
(`docSignedUrl` / `docSignedUrls` are imported in `AllocationRoster2026.jsx`), so the
work is pointing the payroll document reads at those. Renaming the invoice PDFs to
non-guessable names is worth doing at the same time.

### C3 — Anyone can post publicly as your brands on TikTok

`tiktok-crm` route `POST /reply` has no auth check; it reads `ticketId` and `body` from
the request and posts to TikTok with the brand's stored token, via
`business/comment/reply/create/` for comments and `business/message/send/` for DMs.

`ticketId` is a **sequential integer**. An anonymous script can walk 1..N and publish
arbitrary text as the brand under every open TikTok case.

`tiktok-proxy` route `POST /reply` is worse in one respect: it takes `comment_id` and
`video_id` directly, and those are publicly visible on TikTok — no enumeration needed.

These two are **in use** (they are the built-in defaults in `defaultEndpointFor`), so
they cannot be deleted. They need the auth block that `admin-users` already uses.

### C4 — `line-oa-proxy`: anonymous LINE messages as your Official Account

No auth anywhere. `POST /send` pushes a message to any LINE user id using
`LINE_CHANNEL_ACCESS_TOKEN`, with no check that the recipient belongs to a known
conversation. `GET /messages` returns up to 200 inbound customer messages from the last
7 days. `POST /webhook` does not validate `X-Line-Signature`, so fabricated customer
messages can be injected for your agents to act on.

**Like `email-proxy`, this is not wired into the app** — LINE OA is in manual-logging
mode and no brand references it. **Delete it, then rotate the LINE channel access token.**

### C5 — `tiktok-messaging`: anonymous brand DMs, and a dump of private customer DMs

`POST /send` sends a DM as the brand to any `user_open_id` with no check.
`GET /messages?business_id=X` returns 200 inbound customer DMs — private
conversations, not public comments.

Its `/webhook` route is the only one in the whole set that guards itself, but only
conditionally:

```ts
if (HOOK_TOKEN && url.searchParams.get("token") !== HOOK_TOKEN) { ... 403 }
```

`HOOK_TOKEN` defaults to `""`, and `HOOK_TOKEN &&` short-circuits — **if
`TIKTOK_WEBHOOK_TOKEN` is not set, the guard does nothing.** Confirm that secret exists.

---

## HIGH

### H1 — Every signed-in user can read every colleague's ID card number and bank account

`kv_records` carries SELECT, UPDATE and DELETE policies that are all `using (true)` for
`authenticated`. The `nirm-agents` domain holds, for 27 people:

`idCard`, `idCardAddress`, `idCardPhotoUrl`, `taxId`, `bankAccount`, `bankAccountName`,
`bankName`, `bookbankPhotoUrl`, `phone`, `docDeliveryAddress`, `costDay` (pay rate),
`signatures`

and `nirm-invoices` holds 19 payroll records with `netAmount`, `withholding`,
`signatureDataUrl` and `pdfUrl`.

A T1 agent or a Viewer — the lowest roles in the app — can read all of it, and can
write and delete it too. The UI hides these screens by role; the database does not.

This is a design decision rather than a bug, and fixing it properly means role-aware
RLS keyed off `profiles.role` rather than `using (true)`. `is_manager()` already exists
as a helper.

### H2 — `ai-draft` and `kb-ai-search`: unmetered spend on your OpenAI key

Neither performs any auth check. Both go from `req.json()` straight to
`api.openai.com/v1/chat/completions` with your key. Prompt fields are interpolated raw,
so the "customer service" framing is trivially overridden — these are usable as a free
public ChatGPT relay billed to CREA, with no rate limit and no per-caller accounting.
`kb-ai-search` accepts up to 300 caller-supplied `resources` entries, so the input cost
per call is attacker-controlled too.

Both **are** referenced in `svcr-settings`, so they are live and need auth added rather
than deletion.

### H3 — `twilio`: no signature validation on the webhook routes

`/voice` and `/status` never read `X-Twilio-Signature` and have no token. An anonymous
caller can insert `call_events` rows with arbitrary `from_number`, `to_number` and
`agent_ext`, and can **update `recording_url` on existing rows** — pointing your agents
at an attacker-hosted audio file they will click.

Separately, `/token` requires only *any* signed-in user, takes `identity` from the query
string, and issues a grant including `outgoing`. Any account, not just an agent, can
mint a Voice token and place PSTN calls billed to your Twilio account.

### H4 — `share-batch` has a hardcoded bypass key

`share-batch` is otherwise correctly protected by the manager check. But it also
accepts an `x-nirm-ops` header compared against `NIRM_OPS_KEY`, **which falls back to a
literal string committed in the function source** if the secret is unset. That path is
narrowed — the invoices must already exist — but it still lets a caller re-send a
payroll batch to Finance with an attacker-chosen subject and body.

**Confirm `NIRM_OPS_KEY` is set to a random value, or remove the path.**

---

## MEDIUM

* **`telephony`** guards itself with a token that is a literal in the source rather than
  an env secret. It cannot be rotated without a redeploy, and it leaks with the repo.
  Impact if leaked is limited to junk `call_events` rows.
* **`nirm`** does an unauthenticated service-role write of a fixed file into the public
  `web` bucket on every request. Superseded prototype — delete it.
* **`nirm-test`** returns static HTML. Harmless, but delete as dead code.
* **Leaked-password protection is off** in Supabase Auth. Free toggle, checks new
  passwords against HaveIBeenPwned.
* **`app_state_patch` and `app_state_patch_v2`** remain `SECURITY DEFINER` and executable
  by `authenticated`, so any signed-in user can still patch arbitrary legacy app state.
  Revoke `EXECUTE` — nothing in the current app calls them.
* **14 tables have RLS on but no policy** — mostly the dated rescue and backup tables.
  They are deny-all, so this is safe, but they are clutter worth dropping.
* **Two parallel auth systems** still coexist. Supabase Auth is the real one; the
  `nirm-userAccounts` list is a role directory whose password field holds only the
  `__supabase__` sentinel. The unpushed `safeStorage.js` v3.6 fix closes the boot-time
  window where the legacy writer was still live.

---

## What is actually done well

* RLS is on for **all 47 tables**, and **zero** policies grant `anon` or `public`.
* `ticket-attachments` (862 objects) is correctly private.
* `admin-users` is a model of how to do this: verify the JWT in the body, look up
  `profiles.role`, require `manager`, restrict emails to `@crea.asia`, restrict roles to
  a known set, never log passwords, and roll back the auth account if the profile write
  fails. **Copy this block into the unprotected functions.**
* `share-batch` uses the same pattern (aside from H4).
* `doc-compress`, `dc-env`, `resend-batch` and `final-batch-email` correctly run with
  `verify_jwt: true`.

---

## Suggested order

| # | Action | Effort | Breaks anything? |
|---|---|---|---|
| 1 | Delete `email-proxy`, rotate `SENDGRID_API_KEY` | minutes | No — unused |
| 2 | Delete `line-oa-proxy`, rotate LINE token | minutes | No — unused |
| 3 | Set `payroll-docs` bucket to private | minutes | Yes — payroll doc links must move to signed URLs |
| 4 | Add the `admin-users` auth block to `tiktok-crm`, `tiktok-proxy`, `tiktok-messaging` | hours | No, if done carefully |
| 5 | Add auth to `ai-draft`, `kb-ai-search` | ~1 hour | No |
| 6 | Verify `NIRM_OPS_KEY` and `TIKTOK_WEBHOOK_TOKEN` are set | minutes | No |
| 7 | Twilio signature validation on `/voice`, `/status` | ~1 hour | No |
| 8 | Delete `nirm`, `nirm-test`; revoke `app_state_patch*`; enable leaked-password protection | minutes | No |
| 9 | Role-aware RLS on `kv_records` | days — needs design | Potentially, needs care |

Items 1, 2 and 3 remove the two worst exposures and cost almost nothing. Item 3 is the
one that needs an app change alongside it.
