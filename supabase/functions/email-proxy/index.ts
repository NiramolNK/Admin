// email-proxy — Supabase Edge Function
// Inbound email via SendGrid Inbound Parse; outbound via SendGrid Mail Send API.
// Deploy later:  supabase functions deploy email-proxy --no-verify-jwt
// Secret:        supabase secrets set SENDGRID_API_KEY=SG....
// Uses built-in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to write channel_messages.
//
// Setup on SendGrid's side:
//   1. Add an MX record for the receiving subdomain (e.g. support.yourbrand.com)
//      pointing to mx.sendgrid.net, per SendGrid's Inbound Parse instructions.
//   2. In SendGrid → Settings → Inbound Parse, add that hostname with
//      Destination URL = {this function's URL}/webhook
//   3. Get a SendGrid API key with Mail Send scope → SENDGRID_API_KEY secret.
//   4. account_id in SVCR Settings = the receiving mailbox address
//      (e.g. support@support.yourbrand.com) — lets one brand run multiple inboxes.
//
// Endpoints for SVCR Desk (generic contract):
//   POST /email-proxy/webhook   <- SendGrid Inbound Parse posts multipart form data here
//   GET  /email-proxy/messages?account_id=X  -> { messages: [...] }
//   POST /email-proxy/send  { account_id, conversation_id, user_id, text }

import { createClient } from "jsr:@supabase/supabase-js@2";

const SENDGRID_KEY = Deno.env.get("SENDGRID_API_KEY") ?? "";
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
    // ── webhook receiver (SendGrid Inbound Parse → us) ──
    // SendGrid posts multipart/form-data with fields: to, from, subject, text, html, envelope, etc.
    if (req.method === "POST" && path === "webhook") {
      const form = await req.formData();
      const to = String(form.get("to") ?? "");
      const from = String(form.get("from") ?? "");
      const subject = String(form.get("subject") ?? "");
      const text = String(form.get("text") ?? form.get("html") ?? "");
      // Extract just the mailbox address from "Name <addr@domain>" formats
      const mailbox = (to.match(/<([^>]+)>/)?.[1] || to).trim().toLowerCase();
      const fromAddr = (from.match(/<([^>]+)>/)?.[1] || from).trim().toLowerCase();

      const row = {
        channel_key: "email", account_id: mailbox, conversation_id: fromAddr,
        message_id: crypto.randomUUID(), direction: "in", user_ref: from,
        text: subject ? `[${subject}] ${text}` : text, message_time: new Date().toISOString(),
        raw: { to, from, subject },
      };
      const { error } = await sb.from("channel_messages").insert(row);
      if (error) console.error("[email-proxy] insert failed", error);
      return json({ ok: true });
    }

    // ── inbox read (SVCR Desk → us) ──
    if (req.method === "GET" && path === "messages") {
      const accountId = url.searchParams.get("account_id");
      if (!accountId) return json({ error: "account_id required" }, 400);
      const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(); // email threads run longer than chat
      const { data, error } = await sb.from("channel_messages")
        .select("account_id, conversation_id, message_id, direction, user_ref, text, message_time")
        .eq("channel_key", "email").eq("account_id", accountId.toLowerCase()).eq("direction", "in").gte("message_time", since)
        .order("message_time", { ascending: false }).limit(200);
      if (error) return json({ error: String(error.message) }, 500);
      const messages = (data ?? []).map((m) => ({
        message_id: m.message_id, conversation_id: m.conversation_id, direction: m.direction,
        from: m.conversation_id, email: m.conversation_id, username: m.user_ref, text: m.text, time: m.message_time,
      }));
      return json({ messages });
    }

    // ── send reply (SVCR Desk → customer's inbox, via SendGrid) ──
    if (req.method === "POST" && path === "send") {
      if (!SENDGRID_KEY) return json({ error: "SENDGRID_API_KEY not configured" }, 500);
      const { account_id, conversation_id, user_id, text } = await req.json();
      const toAddr = conversation_id || user_id;
      if (!account_id || !toAddr || !text) return json({ error: "account_id, conversation_id (or user_id), and text required" }, 400);

      const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { "Authorization": `Bearer ${SENDGRID_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: toAddr }] }],
          from: { email: account_id },
          subject: "Re: your inquiry",
          content: [{ type: "text/plain", value: text }],
        }),
      });
      if (!r.ok) {
        const detail = await r.text();
        return json({ error: "sendgrid send failed", detail }, 502);
      }
      await sb.from("channel_messages").insert({
        channel_key: "email", account_id, conversation_id: toAddr,
        message_id: crypto.randomUUID(), direction: "out", user_ref: toAddr, text, message_time: new Date().toISOString(),
      });
      return json({ ok: true });
    }

    return json({ error: "not found — use /webhook, /messages or /send" }, 404);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
