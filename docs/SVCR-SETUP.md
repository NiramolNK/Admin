# SVCR Service Desk — Setup & Go-Live Guide

New NiRM tab for the **Short Video Comment & Reply (incl. Brand account chat)** service.
Scope: reply to TikTok video comments + brand account chat in brand tone, record
chat history, daily operation logs. Service hours Mon–Fri 09:00–18:00 (excl. TH
public holidays) — built into all SLA/response-time math.

## What's in this change (nothing deployed yet)

| File | What it is |
|---|---|
| `src/SVCRServiceDesk.jsx` | The SVCR tab (queue, AI drafts, templates, daily log, settings) |
| `src/AllocationRoster2026.jsx` | +import, +`svcr` in manager & T2 role tabs, +sidebar item, +render block |
| `supabase/functions/tiktok-proxy/` | Comments: sync + reply (TikTok Business API v1.3) |
| `supabase/functions/tiktok-messaging/` | DMs: webhook receiver + inbox + send |
| `supabase/functions/ai-draft/` | OpenAI (ChatGPT) proxy for AI reply drafting |
| `supabase/migrations/svcr_tk_messages.sql` | DM inbox table (RLS locked) |

Data persists via the existing `window.storage` shim into `kv_state` under
`svcr-*` keys — covered by `kv_guard` and `kv_snapshots` automatically.
Works fully in **manual-logging mode** with zero deployment; API/AI features
stay hidden until endpoints are configured in the tab's Settings pane.

## Go-live steps (when ready)

1. **Push via GitHub Desktop** → Vercel builds → SVCR Desk appears for
   manager + T2 roles. Manual logging works immediately.
2. **AI drafting** (already deployed as of this change): set the secret
   `supabase secrets set OPENAI_API_KEY=sk-...` (get a key at
   platform.openai.com → API Keys; separate account/billing from ChatGPT).
   Optional: `OPENAI_MODEL` secret to override the default `gpt-4o`.
   In SVCR Settings set Functions base URL:
   `https://bequrilwgooesolepubv.supabase.co/functions/v1`
3. **TikTok comments**: register app on TikTok for Business developer portal →
   apply for Business Account API → brand authorizes via OAuth → deploy
   `tiktok-proxy`, set `TIKTOK_ACCESS_TOKEN` secret → put the brand's
   `business_id` in SVCR Settings.
4. **TikTok DMs**: separate Business Messaging API access application.
   Requirements: brand account linked to TT4B/Business Center (Advanced
   Access), DM setting = accept from Everyone. Run
   `svcr_tk_messages.sql`, deploy `tiktok-messaging`, register the webhook URL
   (`.../functions/v1/tiktok-messaging/webhook`) in the developer portal.
   ⚠️ Verify the `/send` endpoint path against BM docs once access is granted
   (marked TODO in code).
5. **48h rule**: TikTok only allows API DM replies within 48h of the customer's
   last message — the tab shows a live countdown and disables send after expiry.
   Fri-evening DMs must be answered by Sun evening (flag in brand SOP/contract).

## Security notes
- No tokens in the frontend — all secrets live in edge function env.
- Tighten `Access-Control-Allow-Origin` in all three functions to
  `https://nirmroster.vercel.app` before production.
- `tk_messages` has RLS on with no policies: only service-role (edge
  functions) can read/write.
