// kb-ai-search — Supabase Edge Function
// "Ask AI" for the Knowledge Base: answers a natural-language question using
// ONLY the resource list already in the Knowledge Base (titles, categories,
// descriptions, URLs) as context. This is a text-only, metadata-only answer
// engine — it does NOT read inside PDFs/Excel/video files, does NOT search
// the public web, and does NOT do OCR or video-timestamp search. Those would
// require Vertex AI Search / Document AI / Gemini multimodal — real GCP
// infrastructure someone would need to provision separately.
//
// Contract:
//   POST /kb-ai-search  { query, resources: [{id,title,type,category,description,url}] }
//   -> { answer, sourceIds: [...], hasAnswer: boolean }

const API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

function buildPrompt(query: string, resources: any[]): string {
  const context = (resources || []).slice(0, 300).map((r) =>
    `- [${r.id}] (${r.type}${r.category ? `, ${r.category}` : ""}) "${r.title}"${r.description ? `: ${r.description}` : ""} — ${r.url}`
  ).join("\n");

  return `You are an internal "Ask AI" search assistant for a company Knowledge Base. You can ONLY see the list of resource titles/categories/descriptions/URLs below — you cannot read the actual file contents, cannot search the web, and cannot see images or video frames.

Resource list:
${context || "(no resources in the knowledge base yet)"}

Question: "${query}"

Rules:
- Answer using ONLY the resource list above. Never invent steps, numbers, or policies not implied by a resource's title/description.
- If one or more resources plausibly answer the question, name which one(s) in your answer and keep it to 2-4 sentences.
- If nothing in the list is relevant, say so plainly and suggest the closest related resource if any exists, or say none exist.
- Never claim to have read inside the actual file — you're matching based on title/description only.

Respond with a JSON object in this exact shape:
{"answer": "your answer text", "sourceIds": ["id1", "id2"], "hasAnswer": true or false}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!API_KEY) return json({ error: "OPENAI_API_KEY not configured" }, 500);

  try {
    const { query, resources } = await req.json();
    if (!query || !String(query).trim()) return json({ error: "query required" }, 400);

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: buildPrompt(query, resources) }],
      }),
    });
    const data = await r.json();
    if (data.error) return json({ error: "openai error", detail: data.error }, 502);

    const text = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(text);
    if (typeof parsed.answer !== "string") return json({ error: "bad model output", raw: text }, 502);
    return json({ answer: parsed.answer, sourceIds: Array.isArray(parsed.sourceIds) ? parsed.sourceIds : [], hasAnswer: Boolean(parsed.hasAnswer) });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
