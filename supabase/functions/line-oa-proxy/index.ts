// line-oa-proxy — Supabase Edge Function
// LINE Official Account (Messaging API): webhook receiver + inbox read + send.
// Deploy later:  supabase functions deploy line-oa-proxy --no-verify-jwt
// Secret:        supabase secrets set LINE_CHANNEL_ACCESS_TOKEN=<from LINE Developers Console>
// Optional:      LINE_CHANNEL_SECRET (for webhook signature verification — not yet enforced below)
// Uses built-in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to write channel_messages.
//
// Setup on LINE's side:
//   1. Create a Messaging API channel in the LINE Developers Console.
//   2. Copy the Channel access token (long-lived) → LINE_CHANNEL_ACCESS_TOKEN secret.
//   3. Set the webhook URL to: {this function's URL}/webhook
//   4. Enable "Use webhook" in the channel's Messaging API settings.
//
// Endpoints for SVCR Desk (generic contract):
//   POST /line-oa-proxy/webhook   <- LINE pushes events here
//   GET  /line-oa-proxy/messages?account_id=X  -> { messages: [...] }
//   POST /line-oa-proxy/send  { account_id, conversation_id, user_id, text }

import { createClient } from "jsr:@supabase/supabase-js@2";

const LINE_API = "https://api.line.me/v2/bot";
const TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const path = url.pathname.split("/").filter(Boolean).pop();

  try {
    // ── webhook receiver (LINE → us) ──
    if (path === "webhook") {
      const body = await req.json().catch(() => ({}));
      const destination = body.destination as string | undefined; // LINE channel/bot id — used as account_id
      const events = Array.isArray(body.events) ? body.events : [];
      const rows: Array<Record<string, unknown>> = [];
      for (const ev of events) {
        if (ev.type !== "message" || ev.message?.type !== "text") continue; // text-only for now
        rows.push({
          channel_key: "line_oa",
          account_id: destination ?? "unknown",
          conversation_id: ev.source?.userId ?? "",
          message_id: ev.message.id,
          direction: "in",
          user_ref: ev.source?.userId ?? "",
          text: ev.message.text ?? "",
          message_time: ev.timestamp ? new Date(Number(ev.timestamp)).toISOString() : new Date().toISOString(),
          raw: ev,
        });
      }
      if (rows.length) {
        const { error } = await sb.from("channel_messages").upsert(rows, { onConflict: "channel_key,message_id", ignoreDuplicates: true });
        if (error) console.error("[line-oa] insert failed", error);
      }
      return json({ ok: true, stored: rows.length });
    }

    // ── inbox read (SVCR Desk → us) ──
    if (req.method === "GET" && path === "messages") {
      const accountId = url.searchParams.get("account_id");
      if (!accountId) return json({ error: "account_id required" }, 400);
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const { data, error } = await sb.from("channel_messages")
        .select("account_id, conversation_id, message_id, direction, user_ref, text, message_time")
        .eq("channel_key", "line_oa").eq("account_id", accountId).eq("direction", "in").gte("message_time", since)
        .order("message_time", { ascending: false }).limit(200);
      if (error) return json({ error: String(error.message) }, 500);
      // shape expected by the generic normalizer in SVCR Desk
      const messages = (data ?? []).map((m) => ({
        message_id: m.message_id, conversation_id: m.conversation_id, direction: m.direction,
        user_id: m.conversation_id, username: m.user_ref, text: m.text, time: m.message_time,
      }));
      return json({ messages });
    }

    // ── send DM (SVCR Desk → LINE) ──
    if (req.method === "POST" && path === "send") {
      if (!TOKEN) return json({ error: "LINE_CHANNEL_ACCESS_TOKEN not configured" }, 500);
      const { conversation_id, user_id, text } = await req.json();
      const to = conversation_id || user_id;
      if (!to || !text) return json({ error: "conversation_id (or user_id) and text required" }, 400);
      const r = await fetch(`${LINE_API}/message/push`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
      });
      if (!r.ok) {
        const detail = await r.text();
        return json({ error: "line push failed", detail }, 502);
      }
      await sb.from("channel_messages").insert({
        channel_key: "line_oa", account_id: "sent", conversation_id: to,
        message_id: crypto.randomUUID(), direction: "out", user_ref: to, text, message_time: new Date().toISOString(),
      });
      return json({ ok: true });
    }

    return json({ error: "not found — use /webhook, /messages or /send" }, 404);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
