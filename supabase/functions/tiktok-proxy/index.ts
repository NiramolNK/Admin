// tiktok-proxy — Supabase Edge Function
// Wraps TikTok Business API v1.3 Business Account COMMENT endpoints.
// Deploy later:  supabase functions deploy tiktok-proxy --no-verify-jwt
// Secret:        supabase secrets set TIKTOK_ACCESS_TOKEN=<token from OAuth>
//
// Endpoints for SVCR Desk:
//   GET  /tiktok-proxy/comments?business_id=X  -> { comments: [...] }
//   POST /tiktok-proxy/reply  { business_id, comment_id, video_id, text }

const TT_BASE = "https://business-api.tiktok.com/open_api/v1.3";
const TOKEN = Deno.env.get("TIKTOK_ACCESS_TOKEN") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*", // tighten to https://nirmroster.vercel.app in production
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!TOKEN) return json({ error: "TIKTOK_ACCESS_TOKEN not configured" }, 500);

  const url = new URL(req.url);
  const path = url.pathname.split("/").filter(Boolean).pop();

  try {
    if (req.method === "GET" && path === "comments") {
      const businessId = url.searchParams.get("business_id");
      if (!businessId) return json({ error: "business_id required" }, 400);

      const videosRes = await fetch(
        `${TT_BASE}/business/video/list/?business_id=${encodeURIComponent(businessId)}&fields=["item_id","create_time"]&max_count=10`,
        { headers: { "Access-Token": TOKEN } },
      );
      const videosJson = await videosRes.json();
      if (videosJson.code !== 0) return json({ error: "video list failed", detail: videosJson }, 502);
      const videos: Array<{ item_id: string }> = videosJson.data?.videos ?? [];

      const comments: Array<Record<string, unknown>> = [];
      for (const v of videos) {
        const cRes = await fetch(
          `${TT_BASE}/business/comment/list/?business_id=${encodeURIComponent(businessId)}&video_id=${encodeURIComponent(v.item_id)}&max_count=30&sort_field=create_time&sort_order=desc`,
          { headers: { "Access-Token": TOKEN } },
        );
        const cJson = await cRes.json();
        if (cJson.code === 0) {
          for (const c of cJson.data?.comments ?? []) {
            comments.push({
              comment_id: c.comment_id, video_id: v.item_id, text: c.text,
              username: c.username ?? c.user_name ?? "", create_time: c.create_time,
              likes: c.likes, replied: c.owner_replied ?? false,
            });
          }
        }
      }
      comments.sort((a, b) => Number(b.create_time) - Number(a.create_time));
      return json({ comments: comments.filter((c) => !c.replied) });
    }

    if (req.method === "POST" && path === "reply") {
      const { business_id, comment_id, video_id, text } = await req.json();
      if (!business_id || !comment_id || !video_id || !text) return json({ error: "business_id, comment_id, video_id, text required" }, 400);
      const r = await fetch(`${TT_BASE}/business/comment/reply/create/`, {
        method: "POST",
        headers: { "Access-Token": TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({ business_id, comment_id, video_id, text }),
      });
      const j = await r.json();
      if (j.code !== 0) return json({ error: "reply failed", detail: j }, 502);
      return json({ ok: true, detail: j.data });
    }

    return json({ error: "not found — use /comments or /reply" }, 404);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
