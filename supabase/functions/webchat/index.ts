// ═══════════════════════════════════════════════════════════════
// webchat — site chat widget backend + SVCR channel endpoint
// Deploy:  supabase functions deploy webchat --no-verify-jwt
// Table:   webchat_messages  (see supabase/webchat.sql)
//
// Visitor side (public/widget.js):
//   POST /webchat/message   { brand, session, name, text, page, context }
//   GET  /webchat/poll?session=&after=
//
// SVCR side (generic channel contract in SVCRServiceDesk.jsx —
// accountId in Settings = the widget's data-brand key):
//   GET  /webchat/messages?account_id=BRAND   → { messages:[...] }
//   POST /webchat/send { account_id, conversation_id, user_id, text }
// ═══════════════════════════════════════════════════════════════
import { createClient } from "npm:@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// per-brand origins allowed to embed the widget ("*" while testing)
const ALLOWED: Record<string, string[]> = {
  default: ["*"],
};
function cors(origin: string | null, brand: string) {
  const list = ALLOWED[brand] ?? ALLOWED.default;
  const ok = list.includes("*") || (origin && list.includes(origin));
  return {
    "Access-Control-Allow-Origin": ok ? (origin ?? "*") : "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Content-Type": "application/json",
  };
}

// crude per-session rate limit (add a Postgres limiter before go-live)
const hits = new Map<string, number[]>();
function limited(key: string, max = 20, windowMs = 60_000) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(key, arr);
  return arr.length > max;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const origin = req.headers.get("origin");
  const path = url.pathname.split("/").pop();

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin, "default") });

  // ── visitor → inbox ─────────────────────────────────────────
  if (req.method === "POST" && path === "message") {
    const { brand = "default", session, name, text, page, context } = await req.json();
    const H = cors(origin, brand);
    if (!session || !text?.trim())
      return new Response(JSON.stringify({ error: "bad request" }), { status: 400, headers: H });
    if (limited(session))
      return new Response(JSON.stringify({ error: "slow down" }), { status: 429, headers: H });

    const { error } = await supa.from("webchat_messages").insert({
      brand, session, direction: "in",
      visitor_name: name || null, body: text.trim(),
      page: page ?? null, meta: context ?? {},
    });
    if (error)
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: H });
    return new Response(JSON.stringify({ ok: true }), { headers: H });
  }

  // ── visitor pulls the thread (agent replies included) ───────
  if (req.method === "GET" && path === "poll") {
    const session = url.searchParams.get("session") ?? "";
    const after = Number(url.searchParams.get("after") ?? 0);
    const H = cors(origin, "default");
    if (!session) return new Response(JSON.stringify({ messages: [] }), { headers: H });
    if (limited("p:" + session, 40))
      return new Response(JSON.stringify({ messages: [] }), { status: 429, headers: H });

    const { data } = await supa.from("webchat_messages")
      .select("direction,body,created_at")
      .eq("session", session)
      .gt("created_at", new Date(after || 0).toISOString())
      .order("created_at", { ascending: true })
      .limit(50);

    const messages = (data ?? []).map((m) => ({
      from: m.direction === "out" ? "agent" : "visitor",
      text: m.body,
      at: new Date(m.created_at).getTime(),
    }));
    return new Response(JSON.stringify({ messages }), { headers: H });
  }

  // ── SVCR sync: inbound messages for a brand (generic contract) ──
  if (req.method === "GET" && path === "messages") {
    const brand = url.searchParams.get("account_id") ?? "";
    const H = cors(origin, brand || "default");
    if (!brand) return new Response(JSON.stringify({ messages: [] }), { headers: H });

    const since = new Date(Date.now() - 14 * 86400_000).toISOString();
    const { data } = await supa.from("webchat_messages")
      .select("id,session,visitor_name,body,page,created_at")
      .eq("brand", brand).eq("direction", "in")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(300);

    // shape matches normalizeIncoming()'s generic branch:
    // extId ← webchat:{message_id}; conversation_id → extMeta for replies
    const messages = (data ?? []).map((m) => ({
      message_id: m.id,
      conversation_id: m.session,
      user_id: m.session,
      from_name: m.visitor_name || "Website visitor",
      text: m.page ? `${m.body}\n[page] ${m.page}` : m.body,
      time: m.created_at,
      direction: "in",
    }));
    return new Response(JSON.stringify({ messages }), { headers: H });
  }

  // ── SVCR agent reply → widget picks it up on next poll ──────
  if (req.method === "POST" && path === "send") {
    const { account_id, conversation_id, user_id, text } = await req.json();
    const H = cors(origin, account_id || "default");
    const session = conversation_id || user_id;
    if (!account_id || !session || !text?.trim())
      return new Response(JSON.stringify({ error: "bad request" }), { status: 400, headers: H });

    const { error } = await supa.from("webchat_messages").insert({
      brand: account_id, session, direction: "out", body: text.trim(),
    });
    if (error)
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: H });
    return new Response(JSON.stringify({ ok: true }), { headers: H });
  }

  return new Response(JSON.stringify({ error: "not found" }),
    { status: 404, headers: cors(origin, "default") });
});
