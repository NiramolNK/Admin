// ai-draft — Supabase Edge Function
// Server-side OpenAI (ChatGPT) proxy for SVCR AI reply drafting.
// Deploy later:  supabase functions deploy ai-draft --no-verify-jwt
// Secret:        supabase secrets set OPENAI_API_KEY=sk-...
//
// Contract with SVCR Desk (unchanged):
//   POST /ai-draft  { inquiry:{channel,brand,type,message}, toneProfile, language, templates:[{label,text}], extraInstruction }
//   ->   { variants: [{style, text}, {style, text}, {style, text}] }

const API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o";

const CORS = {
  "Access-Control-Allow-Origin": "*", // tighten to https://nirmroster.vercel.app in production
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

function buildPrompt(p: Record<string, any>): string {
  const i = p.inquiry ?? {};
  const isPublic = i.channelKind === "public"; // TikTok video comments are public; everything else (DM, LINE, Email, Amaze) is private 1:1
  const tone = p.toneProfile || "Friendly, polite, professional Thai e-commerce admin tone with light emoji use.";
  const langRule = p.language === "th" ? "Reply in Thai."
    : p.language === "en" ? "Reply in English."
    : "Reply in the same language as the customer's message (default to Thai if unclear).";
  const tpl = Array.isArray(p.templates) && p.templates.length
    ? `Example approved templates for tone reference:\n${p.templates.map((t: any) => `- [${t.label}] ${t.text}`).join("\n")}` : "";

  return `You are a customer service agent for an e-commerce brand replying to a customer inquiry.

Context:
- Channel: ${i.channel} (${isPublic
    ? "public comment under a short video — keep it short, friendly, invite to chat/DM for details, never share personal or order data publicly"
    : "private 1:1 message — can be more detailed and handle the case directly"})
- Brand: ${i.brand || "(not specified)"}
- Brand tone guideline: ${tone}
- Inquiry type: ${i.type}
- Customer message: "${i.message}"
${p.extraInstruction ? `- Agent's extra instruction for this reply: ${p.extraInstruction}` : ""}
${tpl}

Rules:
- ${langRule}
- Stay strictly in brand tone. Do not invent promotions, prices, stock levels, or policies — if the answer needs data the agent must fill in, use a [PLACEHOLDER] like [ORDER STATUS] or [PROMO DETAIL].
- For complaints: acknowledge, apologize once sincerely, move to resolution, never argue.
- For spam/troll on public comments: give one neutral, de-escalating option only.

Respond with a JSON object in this exact shape:
{"variants":[{"style":"short label e.g. Warm & brief","text":"reply text"},{"style":"...","text":"..."},{"style":"...","text":"..."}]}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!API_KEY) return json({ error: "OPENAI_API_KEY not configured" }, 500);

  try {
    const payload = await req.json();
    if (!payload?.inquiry?.message) return json({ error: "inquiry.message required" }, 400);

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        response_format: { type: "json_object" }, // guarantees valid JSON — no markdown-fence stripping needed
        messages: [{ role: "user", content: buildPrompt(payload) }],
      }),
    });
    const data = await r.json();
    if (data.error) return json({ error: "openai error", detail: data.error }, 502);

    const text = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.variants)) return json({ error: "bad model output", raw: text }, 502);
    return json({ variants: parsed.variants });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
