// tiktok-messaging — Supabase Edge Function
// Business Messaging API (DMs): webhook receiver + inbox read + send.
// Deploy later:  supabase functions deploy tiktok-messaging --no-verify-jwt
// Secrets:       TIKTOK_ACCESS_TOKEN (same as proxy)
// Uses built-in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to write tk_messages.
//
// Endpoints:
//   POST /tiktok-messaging/webhook   <- TikTok pushes incoming DMs here (register in developer portal)
//   GET  /tiktok-messaging/messages?business_id=X  -> { messages: [...] } (last 7 days, inbound)
//   POST /tiktok-messaging/send  { business_id, conversation_id, user_open_id, text }
//
// NOTE: exact Business Messaging payload/endpoint shapes require approved BM API
// access to confirm — the webhook parser below is tolerant and stores raw JSON,
// so nothing is lost even if field names differ. Verify /send path against the
// BM docs once access is granted (marked TODO below).

import { createClient } from "jsr:@supabase/supabase-js@2";

const TT_BASE = "https://business-api.tiktok.com/open_api/v1.3";
const TOKEN = Deno.env.get("TIKTOK_ACCESS_TOKEN") ?? "";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

// Tolerant extraction of message events from a webhook payload.
function extractMessages(body: Record<string, unknown>): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const candidates = [body.events, body.data, body.messages, [body]].find(Array.isArray) as Array<Record<string, unknown>> | undefined;
  for (const ev of candidates ?? []) {
    const m = (ev.message ?? ev) as Record<string, unknown>;
    const messageId = m.message_id ?? m.id ?? ev.event_id;
    if (!messageId) continue;
    out.push({
      business_id: String(m.business_id ?? ev.business_id ?? body.business_id ?? ""),
      conversation_id: String(m.conversation_id ?? ev.conversation_id ?? ""),
      message_id: String(messageId),
      direction: "in",
      user_open_id: String(m.user_open_id ?? m.from_user_id ?? m.sender_id ?? ""),
      username: String(m.username ?? m.nickname ?? ""),
      text: String(m.text ?? m.content ?? ""),
      message_time: m.create_time ? new Date(Number(m.create_time) * 1000).toISOString() : new Date().toISOString(),
      raw: ev,
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const path = url.pathname.split("/").filter(Boolean).pop();

  try {
    // ── webhook receiver (TikTok → us) ──
    if (path === "webhook") {
      // Verification handshake: echo challenge if present
      const challenge = url.searchParams.get("challenge");
      if (req.method === "GET" && challenge) return new Response(challenge, { headers: CORS });
      const body = await req.json().catch(() => ({}));
      if (body.challenge) return json({ challenge: body.challenge });

      const msgs = extractMessages(body);
      if (msgs.length) {
        const { error } = await sb.from("tk_messages").upsert(msgs, { onConflict: "message_id", ignoreDuplicates: true });
        if (error) console.error("[tk-msg] insert failed", error);
      } else {
        // store unrecognized payloads for inspection — nothing is lost
        await sb.from("tk_messages").insert({ business_id: "unparsed", message_id: crypto.randomUUID(), direction: "in", raw: body });
      }
      return json({ ok: true, stored: msgs.length });
    }

    // ── inbox read (SVCR Desk → us) ──
    if (req.method === "GET" && path === "messages") {
      const businessId = url.searchParams.get("business_id");
      if (!businessId) return json({ error: "business_id required" }, 400);
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const { data, error } = await sb.from("tk_messages")
        .select("business_id, conversation_id, message_id, direction, user_open_id, username, text, message_time")
        .eq("business_id", businessId).eq("direction", "in").gte("message_time", since)
        .order("message_time", { ascending: false }).limit(200);
      if (error) return json({ error: String(error.message) }, 500);
      return json({ messages: data ?? [] });
    }

    // ── send DM (SVCR Desk → TikTok) ──
    if (req.method === "POST" && path === "send") {
      if (!TOKEN) return json({ error: "TIKTOK_ACCESS_TOKEN not configured" }, 500);
      const { business_id, conversation_id, user_open_id, text } = await req.json();
      if (!business_id || !text || (!conversation_id && !user_open_id)) {
        return json({ error: "business_id, text, and conversation_id or user_open_id required" }, 400);
      }
      // TODO: confirm exact endpoint path + payload against Business Messaging API
      // docs once approved access is granted. This follows the v1.3 convention.
      const r = await fetch(`${TT_BASE}/business/message/send/`, {
        method: "POST",
        headers: { "Access-Token": TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({ business_id, conversation_id, user_open_id, message_type: "text", content: { text } }),
      });
      const j = await r.json();
      if (j.code !== 0) return json({ error: "send failed", detail: j }, 502);
      // record outbound for the chat-history log
      await sb.from("tk_messages").insert({
        business_id, conversation_id: conversation_id ?? "", message_id: String(j.data?.message_id ?? crypto.randomUUID()),
        direction: "out", user_open_id: user_open_id ?? "", text, message_time: new Date().toISOString(), raw: j.data ?? {},
      });
      return json({ ok: true, detail: j.data });
    }

    return json({ error: "not found — use /webhook, /messages or /send" }, 404);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
