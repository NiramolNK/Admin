import React, { useState, useEffect, useMemo, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// SVCR SERVICE DESK — multi-channel inbox: TikTok video comments,
// TikTok Brand Account chat (DM), LINE Official Account, Email,
// and Amaze (Ascend Commerce / CP Group seller platform, Thailand).
// New NiRM function tab. Persists via window.storage shim → kv_state
// (keys: svcr-*), so kv_guard + kv_snapshots protection applies.
// Service hours: Mon–Fri 09:00–18:00, excl. public holidays.
//
// Channel connectivity model: each brand can wire up any channel to
// a Supabase Edge Function ("endpoint") + an account/channel ID.
// TikTok's two channels default to the already-deployed
// tiktok-proxy / tiktok-messaging functions when no endpoint is set.
// LINE OA, Email, and Amaze have no functions built yet — they stay
// in manual-logging mode until a real integration exists, exactly
// like TikTok did before it was connected.
// ═══════════════════════════════════════════════════════════════

const NAVY = "#313A7E";
const PURPLE = "#7300E6";
const TEAL = "#00B894";

// ── channel registry ──
const CHANNEL_DEFS = [
  { key: "tiktok_comment", label: "TikTok Comment", short: "Comment", kind: "public",  chipBg: "#E0F2FE", chipFg: "#075985", hasReplyWindow: false, builtIn: true },
  { key: "tiktok_dm",      label: "TikTok DM",      short: "DM",      kind: "private", chipBg: "#EDE9FE", chipFg: "#5B21B6", hasReplyWindow: true, replyWindowHours: 48, builtIn: true },
  { key: "line_oa",        label: "LINE OA",        short: "LINE",    kind: "private", chipBg: "#DCFCE7", chipFg: "#166534", hasReplyWindow: false, builtIn: false },
  { key: "email",          label: "Email",          short: "Email",   kind: "private", chipBg: "#FEF9C3", chipFg: "#854D0E", hasReplyWindow: false, builtIn: false },
  { key: "amaze",          label: "Amaze",          short: "Amaze",   kind: "private", chipBg: "#FFE4E6", chipFg: "#9F1239", hasReplyWindow: false, builtIn: false },
];
function getChannelDef(key) { return CHANNEL_DEFS.find((c) => c.key === key) || CHANNEL_DEFS[0]; }
// Back-compat: inquiries logged before this redesign used plain-string
// channel values. Map them onto the new channel keys transparently.
function migrateChannel(ch) {
  if (ch === "Video Comment") return "tiktok_comment";
  if (ch === "Brand Account Chat") return "tiktok_dm";
  return ch;
}

const TYPES = ["Product Question", "Order / Shipping", "Promo / Price", "Complaint", "Return / Refund", "Affiliate / Collab", "Spam / Troll", "Other"];
const STATUSES = ["New", "In Progress", "Replied", "Escalated", "Closed"];
const STATUS_STYLE = {
  "New":         { bg: "#FEF3C7", fg: "#92400E" },
  "In Progress": { bg: "#DBEAFE", fg: "#1E40AF" },
  "Replied":     { bg: "#D1FAE5", fg: "#065F46" },
  "Escalated":   { bg: "#FEE2E2", fg: "#991B1B" },
  "Closed":      { bg: "#E5E7EB", fg: "#374151" },
};

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isHoliday(d, holidays) { return (holidays || []).includes(toDateStr(d)); }
function isServiceOpen(d, holidays) {
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  if (isHoliday(d, holidays)) return false;
  const h = d.getHours();
  return h >= 9 && h < 18;
}
// minutes elapsed counting only service hours (Mon–Fri 09–18, excl. holidays)
function businessMinutes(start, end, holidays) {
  if (end <= start) return 0;
  let mins = 0;
  const cur = new Date(start);
  cur.setSeconds(0, 0);
  while (cur < end) {
    if (isServiceOpen(cur, holidays)) mins++;
    cur.setMinutes(cur.getMinutes() + 1);
    if (mins > 60 * 9 * 30) break; // cap ≈30 working days
  }
  return mins;
}
function fmtMins(m) {
  if (m == null) return "—";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}
function fmtDT(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// Bulk-paste parser: each non-empty line becomes one inquiry.
// Two recognized prefixes, checked in order:
//   1. "@handle message"        — TikTok comment handles always start with @
//   2. "Display Name: message"  — DMs/LINE/Email often paste as a plain name,
//      no @, usually followed by a colon or dash before the message text.
// Guarded against false-splits on timestamps ("10:32 ...") by requiring the
// name part to contain a letter and not look like a clock time.
function parseBulkLines(text) {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    let m = line.match(/^(@[\w.\-]+)[:\-]?\s+(.+)$/);
    if (m && m[2]) return { ref: m[1], message: m[2] };

    m = line.match(/^([^\n:–\-]{1,30}?)\s*[:\-–]\s+(.+)$/);
    if (m && m[2]) {
      const name = m[1].trim();
      const looksLikeTime = /^\d{1,2}[:.]\d{2}$/.test(name);
      const hasLetter = /[a-zA-Zก-๙]/.test(name);
      if (name && hasLetter && !looksLikeTime) return { ref: name, message: m[2].trim() };
    }

    return { ref: "", message: line };
  });
}

// ── storage (NiRM window.storage shim → kv_state) ──
const K = { inquiries: "svcr-inquiries", templates: "svcr-templates", notes: "svcr-daily-notes", settings: "svcr-settings" };
async function loadKey(key, fallback) {
  try { const r = await window.storage.get(key); return r && r.value ? JSON.parse(r.value) : fallback; }
  catch (e) { console.warn("[SVCR] load failed", key, e); return fallback; }
}
async function saveKey(key, val) {
  try { await window.storage.set(key, JSON.stringify(val)); }
  catch (e) { console.error("[SVCR] save failed", key, e); }
}

const DEFAULT_SETTINGS = {
  agents: [], brands: [], holidays: [], slaTarget: 60,
  tones: {}, // { brandName: tone guideline }
  defaultTone: "Friendly, polite, professional Thai e-commerce admin tone. Warm but concise, light emoji use, complaints always end with a resolution path.",
  replyLanguage: "auto", // auto | th | en
  fnBase: "",   // Supabase functions base, e.g. https://bequrilwgooesolepubv.supabase.co/functions/v1
  aiPath: "ai-draft", // edge function that proxies the AI provider
  // Per-brand, per-channel connections: { [brand]: { [channelKey]: { endpoint, accountId } } }
  // endpoint blank + channel is TikTok → defaults to the built-in tiktok-proxy /
  // tiktok-messaging functions. endpoint blank on any other channel → that
  // channel stays manual-log-only for that brand.
  channels: {},
};

const DEFAULT_TEMPLATES = [
  { id: "t1", brand: "", label: "Greeting (chat)", text: "สวัสดีค่ะ 😊 ขอบคุณที่ติดต่อเข้ามานะคะ แอดมินยินดีให้ข้อมูลค่ะ สอบถามเรื่องใดแจ้งได้เลยค่ะ" },
  { id: "t2", brand: "", label: "Order status ask", text: "รบกวนขอหมายเลขคำสั่งซื้อ (Order ID) เพื่อตรวจสอบสถานะให้นะคะ 🙏" },
  { id: "t3", brand: "", label: "Comment thank-you", text: "ขอบคุณสำหรับความคิดเห็นนะคะ 💜 ทักแชทมาได้เลยค่ะ แอดมินยินดีดูแลค่ะ" },
  { id: "t4", brand: "", label: "Out-of-hours notice", text: "ขณะนี้อยู่นอกเวลาทำการ (จ.–ศ. 09:00–18:00) แอดมินจะรีบตอบกลับในเวลาทำการนะคะ ขออภัยในความไม่สะดวกค่ะ 🙏" },
];

// ── channel connection helpers ──
const fnUrl = (s, path) => `${(s.fnBase || "").replace(/\/$/, "")}/${path}`;
function getChannelConn(settings, brand, key) {
  return (settings.channels && settings.channels[brand] && settings.channels[brand][key]) || { endpoint: "", accountId: "" };
}
function defaultEndpointFor(settings, key) {
  if (key === "tiktok_comment") return fnUrl(settings, "tiktok-proxy");
  if (key === "tiktok_dm") return fnUrl(settings, "tiktok-messaging");
  return ""; // LINE / Email / Amaze have no built-in function yet
}
function resolvedEndpoint(settings, brand, key) {
  const conn = getChannelConn(settings, brand, key);
  return conn.endpoint || defaultEndpointFor(settings, key);
}
function isChannelConnected(settings, brand, key) {
  if (!brand || brand === "ALL") return false;
  const conn = getChannelConn(settings, brand, key);
  return Boolean(resolvedEndpoint(settings, brand, key) && conn.accountId);
}

// ── fetch / normalize / send: one contract across all channels ──
// TikTok's two functions have their own established shapes (already live in
// production); everything else (LINE OA, Email, Amaze) uses a generic
// contract so a future edge function just needs to match it:
//   GET  {endpoint}/messages?account_id=X → { messages: [...] }
//   POST {endpoint}/send  { account_id, conversation_id, user_id, text }
async function fetchChannelRaw(endpoint, key, accountId) {
  if (key === "tiktok_comment") {
    const r = await fetch(`${endpoint}/comments?business_id=${encodeURIComponent(accountId)}`);
    if (!r.ok) throw new Error(`comments ${r.status}`);
    return (await r.json()).comments || [];
  }
  if (key === "tiktok_dm") {
    const r = await fetch(`${endpoint}/messages?business_id=${encodeURIComponent(accountId)}`);
    if (!r.ok) throw new Error(`messages ${r.status}`);
    return (await r.json()).messages || [];
  }
  const r = await fetch(`${endpoint}/messages?account_id=${encodeURIComponent(accountId)}`);
  if (!r.ok) throw new Error(`messages ${r.status}`);
  return (await r.json()).messages || [];
}

async function sendChannelMessage(endpoint, key, payload) {
  const path = key === "tiktok_comment" ? "/reply" : "/send";
  const r = await fetch(`${endpoint}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error(`send ${r.status}`);
  return r.json();
}

// Normalizes one raw item from any channel into a common shape, or null to skip.
function normalizeIncoming(key, raw) {
  if (key === "tiktok_comment") {
    if (raw.replied) return null;
    return {
      extId: `c:${raw.comment_id}`, meta: { commentId: raw.comment_id, videoId: raw.video_id },
      ref: raw.username ? `@${raw.username}` : String(raw.video_id || ""), text: raw.text || "",
      time: raw.create_time ? new Date(raw.create_time * 1000).toISOString() : new Date().toISOString(),
    };
  }
  if (key === "tiktok_dm") {
    if (raw.direction !== "in") return null;
    return {
      extId: `m:${raw.message_id}`, meta: { conversationId: raw.conversation_id, userOpenId: raw.user_open_id },
      ref: raw.username ? `@${raw.username}` : (raw.user_open_id || ""), text: raw.text || "",
      time: raw.message_time || new Date().toISOString(),
    };
  }
  // Generic shape for LINE OA / Email / Amaze future functions
  if (raw.direction && raw.direction !== "in") return null;
  return {
    extId: `${key}:${raw.message_id || raw.id}`, meta: { conversationId: raw.conversation_id || raw.thread_id, userId: raw.user_id || raw.from },
    ref: raw.username || raw.from_name || raw.email || raw.user_id || "", text: raw.text || raw.body || "",
    time: raw.time || raw.created_at || new Date().toISOString(),
  };
}

// Builds the outgoing payload shape each channel's /reply or /send expects.
function buildSendPayload(key, brand, accountId, i, text) {
  if (key === "tiktok_comment") return { business_id: accountId, comment_id: i.extMeta?.commentId, video_id: i.extMeta?.videoId, text };
  if (key === "tiktok_dm") return { business_id: accountId, conversation_id: i.extMeta?.conversationId, user_open_id: i.extMeta?.userOpenId, text };
  return { account_id: accountId, conversation_id: i.extMeta?.conversationId, user_id: i.extMeta?.userId, text };
}

// AI drafting goes through an edge function (holds the model API key server-side).
// Contract: POST {fnBase}/{aiPath}  body: {inquiry, toneProfile, language, templates, extraInstruction}
//           → { variants: [{style, text}, ...] }
async function aiDraftReplies(s, payload) {
  const r = await fetch(fnUrl(s, s.aiPath), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error(`ai ${r.status}`);
  const j = await r.json();
  if (!Array.isArray(j.variants)) throw new Error("bad ai shape");
  return j.variants;
}

// Reply-window: only channels flagged hasReplyWindow enforce one (currently
// just TikTok DM's 48h rule). Anchored to the *last* customer message in the
// thread, not the original inquiry time, so it resets on new follow-ups.
function lastCustomerMsgTime(i) {
  const cust = (i.history || []).filter((h) => h.author === "customer");
  return cust.length ? cust[cust.length - 1].ts : i.createdAt;
}
function replyWindow(i, now) {
  const def = getChannelDef(i.channel);
  if (!def.hasReplyWindow) return null;
  const anchor = lastCustomerMsgTime(i);
  const deadline = new Date(new Date(anchor).getTime() + (def.replyWindowHours || 48) * 3600 * 1000);
  const left = deadline - now;
  return { deadline, leftMin: Math.floor(left / 60000), expired: left <= 0 };
}

// ── styles ──
const S = {
  page: { fontFamily: "'Galano Grotesque','Segoe UI',sans-serif", background: "#F1F5F9", minHeight: "100%", padding: 0 },
  header: { background: `linear-gradient(100deg, ${NAVY} 0%, #23295C 60%, ${PURPLE} 130%)`, color: "#fff", padding: "20px 24px 16px" },
  kicker: { fontSize: 11, letterSpacing: 2, textTransform: "uppercase", opacity: 0.7, fontWeight: 600 },
  h1: { fontSize: 20, fontWeight: 700, margin: "2px 0 0" },
  sub: { fontSize: 12, opacity: 0.8, marginTop: 4 },
  pill: (on) => ({ fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 999, border: "none", cursor: "pointer", background: on ? "#fff" : "rgba(255,255,255,0.15)", color: on ? PURPLE : "#fff" }),
  kpi: { background: "rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", minWidth: 110 },
  body: { maxWidth: 1100, margin: "0 auto", padding: "0 20px 40px" },
  tabBtn: (on) => ({ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: "8px 8px 0 0", border: "1px solid " + (on ? "#CBD5E1" : "transparent"), borderBottom: "none", cursor: "pointer", background: on ? "#fff" : "rgba(148,163,184,0.15)", color: on ? "#0F172A" : "#64748B" }),
  card: { background: "#fff", border: "1px solid #CBD5E1", borderRadius: "0 12px 12px 12px", padding: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" },
  input: { border: "1px solid #CBD5E1", borderRadius: 8, padding: "6px 10px", fontSize: 13, fontFamily: "inherit", background: "#fff", color: "#1E293B", outline: "none" },
  label: { display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 600, color: "#64748B" },
  btn: (bg) => ({ background: bg, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }),
  btnGhost: { background: "#fff", color: "#475569", border: "1px solid #CBD5E1", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  chip: (bg, fg) => ({ background: bg, color: fg, padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }),
  panel: { border: "1px solid #E2E8F0", borderRadius: 12, padding: 12, background: "#F8FAFC", marginBottom: 14 },
  dot: (on) => ({ width: 8, height: 8, borderRadius: 999, background: on ? "#34D399" : "#CBD5E1", display: "inline-block", marginRight: 6 }),
};

const Field = ({ label, children, style }) => (<label style={{ ...S.label, ...style }}>{label}{children}</label>);

// ═══════════════════════ MAIN COMPONENT ═══════════════════════
export default function SVCRServiceDesk({ role, canEdit }) {
  const [pane, setPane] = useState("queue");
  const [inquiries, setInquiries] = useState([]);
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [notes, setNotes] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(new Date());
  const [toast, setToast] = useState(null);

  useEffect(() => {
    (async () => {
      const [inq, tpl, nts, stg] = await Promise.all([
        loadKey(K.inquiries, []), loadKey(K.templates, DEFAULT_TEMPLATES),
        loadKey(K.notes, {}), loadKey(K.settings, DEFAULT_SETTINGS),
      ]);
      // migrate old plain-string channels + old bizIds shape transparently
      const migratedInq = inq.map((i) => ({ ...i, channel: migrateChannel(i.channel) }));
      let mergedSettings = { ...DEFAULT_SETTINGS, ...stg };
      if (stg.bizIds && !stg.channels) {
        const channels = {};
        Object.entries(stg.bizIds).forEach(([brand, bizId]) => {
          if (!bizId) return;
          channels[brand] = { tiktok_comment: { endpoint: "", accountId: bizId }, tiktok_dm: { endpoint: "", accountId: bizId } };
        });
        mergedSettings = { ...mergedSettings, channels };
      }
      setInquiries(migratedInq); setTemplates(tpl); setNotes(nts);
      setSettings(mergedSettings);
      setLoaded(true);
    })();
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { if (loaded) saveKey(K.inquiries, inquiries); }, [inquiries, loaded]);
  useEffect(() => { if (loaded) saveKey(K.templates, templates); }, [templates, loaded]);
  useEffect(() => { if (loaded) saveKey(K.notes, notes); }, [notes, loaded]);
  useEffect(() => { if (loaded) saveKey(K.settings, settings); }, [settings, loaded]);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  const open = isServiceOpen(now, settings.holidays);
  const todayStr = toDateStr(now);
  const activeBrand = settings.activeBrand || "ALL";
  const setActiveBrand = (b) => setSettings((s) => ({ ...s, activeBrand: b }));
  const scoped = useMemo(() => (activeBrand === "ALL" ? inquiries : inquiries.filter((i) => i.brand === activeBrand)), [inquiries, activeBrand]);

  const stats = useMemo(() => {
    const today = scoped.filter((i) => (i.createdAt || "").slice(0, 10) === todayStr);
    const pending = scoped.filter((i) => ["New", "In Progress", "Escalated"].includes(i.status));
    const repliedToday = today.filter((i) => ["Replied", "Closed"].includes(i.status));
    const rts = scoped.filter((i) => i.repliedAt && i.createdAt).slice(-100)
      .map((i) => businessMinutes(new Date(i.createdAt), new Date(i.repliedAt), settings.holidays));
    const avg = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null;
    const breaches = pending.filter((i) => businessMinutes(new Date(i.createdAt), now, settings.holidays) > settings.slaTarget).length;
    return { today: today.length, pending: pending.length, repliedToday: repliedToday.length, avg, breaches };
  }, [scoped, todayStr, now, settings]);

  const addInquiry = (data) => {
    const id = uid();
    const ts = new Date().toISOString();
    setInquiries((p) => [{ id, createdAt: ts, status: "New", history: [{ id: uid(), ts, author: "customer", text: data.message || "" }], ...data }, ...p]);
    showToast("Inquiry logged");
  };
  const updateInquiry = (id, patch) => setInquiries((p) => p.map((i) => {
    if (i.id !== id) return i;
    const next = { ...i, ...patch };
    if (patch.status === "Replied" && !i.repliedAt) next.repliedAt = new Date().toISOString();
    return next;
  }));
  // Chat-history logger: every customer follow-up or agent reply gets its own
  // timestamped entry, so the full thread is preserved — not a single
  // overwritable notes field. First agent reply auto-bumps status out of
  // "New"; replyNotes stays in sync with the latest agent line for CSV export.
  const addHistoryEntry = (id, author, text) => setInquiries((p) => p.map((i) => {
    if (i.id !== id) return i;
    const entry = { id: uid(), ts: new Date().toISOString(), author, text };
    const history = [...(i.history || []), entry];
    const patch = { history };
    if (author === "agent") {
      patch.replyNotes = text;
      if (i.status === "New") patch.status = "In Progress";
    }
    return { ...i, ...patch };
  }));
  const removeInquiry = (id) => setInquiries((p) => p.filter((i) => i.id !== id));

  // Per-channel sync: pulls from whichever channel is connected for the
  // active brand. syncAllChannels runs every connected channel in one go.
  const syncChannel = async (key) => {
    if (activeBrand === "ALL") { showToast("Select a specific brand to sync"); return; }
    if (!isChannelConnected(settings, activeBrand, key)) return 0;
    const endpoint = resolvedEndpoint(settings, activeBrand, key);
    const conn = getChannelConn(settings, activeBrand, key);
    try {
      const raws = await fetchChannelRaw(endpoint, key, conn.accountId);
      const known = new Set(inquiries.map((i) => i.extId).filter(Boolean));
      const fresh = [];
      raws.forEach((raw) => {
        const n = normalizeIncoming(key, raw);
        if (!n || known.has(n.extId)) return;
        fresh.push({ id: uid(), extId: n.extId, extMeta: n.meta, createdAt: n.time, status: "New", channel: key,
          brand: activeBrand, ref: n.ref, type: "Other", agent: "", message: n.text,
          history: [{ id: uid(), ts: n.time, author: "customer", text: n.text }] });
      });
      if (fresh.length) setInquiries((p) => [...fresh, ...p]);
      return fresh.length;
    } catch (e) {
      console.warn(`[SVCR] ${key} sync failed`, e);
      return -1;
    }
  };

  const syncAllChannels = async () => {
    if (activeBrand === "ALL") { showToast("Select a specific brand to sync"); return; }
    const connected = CHANNEL_DEFS.filter((c) => isChannelConnected(settings, activeBrand, c.key));
    if (!connected.length) { showToast("No channels connected for this brand yet — set them up in Settings"); return; }
    showToast(`Syncing ${connected.map((c) => c.label).join(", ")}…`);
    let total = 0, failed = [];
    for (const c of connected) {
      const n = await syncChannel(c.key);
      if (n === -1) failed.push(c.label); else total += n;
    }
    if (failed.length) showToast(`Synced ${total} new — ${failed.join(", ")} failed`);
    else showToast(total ? `Imported ${total} new item${total > 1 ? "s" : ""}` : "No new messages");
  };

  const exportCSV = (rows, filename) => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const flattenHistory = (i) => (i.history || []).map((h) => `[${fmtDT(h.ts)} ${h.author}] ${h.text}`).join(" | ");
    const header = ["Created", "Replied", "Channel", "Brand", "Ref", "Type", "Status", "Agent", "Message", "Chat History", "Resp (biz min)"];
    const lines = rows.map((i) => [i.createdAt, i.repliedAt || "", getChannelDef(i.channel).label, i.brand, i.ref, i.type, i.status, i.agent, i.message, flattenHistory(i),
      i.repliedAt ? businessMinutes(new Date(i.createdAt), new Date(i.repliedAt), settings.holidays) : ""].map(esc).join(","));
    const blob = new Blob(["\uFEFF" + [header.map(esc).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!loaded) return <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: "#94A3B8", fontSize: 13 }}>Loading SVCR workspace…</div>;

  const connectedChannels = CHANNEL_DEFS.filter((c) => isChannelConnected(settings, activeBrand, c.key));
  const ctx = { settings, setSettings, templates, setTemplates, inquiries: scoped, allInquiries: inquiries, notes, setNotes,
    now, activeBrand, canEdit, updateInquiry, removeInquiry, addInquiry, addHistoryEntry, showToast, exportCSV,
    syncChannel, syncAllChannels, connectedChannels, todayStr };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={S.kicker}>CREA · CX Operations</div>
            <div style={S.h1}>SVCR Service Desk</div>
            <div style={S.sub}>TikTok comments &amp; DM · LINE OA · Email · Amaze · Daily operation log</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 16px" }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: open ? "#34D399" : "#FB7185", boxShadow: open ? "0 0 8px #34D399" : "none" }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{open ? "Service OPEN" : "Service CLOSED"}</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>Mon–Fri 09:00–18:00 · now {now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14, alignItems: "center" }}>
          <span style={{ ...S.kicker, marginRight: 4 }}>Brand</span>
          <button style={S.pill(activeBrand === "ALL")} onClick={() => setActiveBrand("ALL")}>All brands</button>
          {settings.brands.map((b) => (
            <button key={b} style={S.pill(activeBrand === b)} onClick={() => setActiveBrand(b)}>{b}</button>
          ))}
          {canEdit && <button style={{ ...S.pill(false), background: "transparent", border: "1px solid rgba(255,255,255,0.35)", opacity: 0.8 }} onClick={() => setPane("settings")}>+ Add brand</button>}
        </div>

        {activeBrand !== "ALL" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10, alignItems: "center" }}>
            {CHANNEL_DEFS.map((c) => (
              <span key={c.key} style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", display: "flex", alignItems: "center" }}>
                <span style={S.dot(isChannelConnected(settings, activeBrand, c.key))} />{c.short}
              </span>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {[["Today's inquiries", stats.today], ["Pending queue", stats.pending], ["Replied today", stats.repliedToday],
            ["Avg response", fmtMins(stats.avg)], [`SLA breach (>${fmtMins(settings.slaTarget)})`, stats.breaches]].map(([l, v], i) => (
            <div key={i} style={S.kpi}>
              <div style={{ fontSize: 18, fontWeight: 700, color: String(l).startsWith("SLA") && v > 0 ? "#FCA5A5" : "#fff" }}>{v}</div>
              <div style={{ fontSize: 11, opacity: 0.75 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={S.body}>
        <div style={{ display: "flex", gap: 4, marginTop: 14, flexWrap: "wrap" }}>
          {[["queue", "Inquiry Queue"], ["templates", "Reply Templates"], ["log", "Daily Log"], ...(canEdit ? [["settings", "Settings"]] : [])].map(([id, l]) => (
            <button key={id} style={S.tabBtn(pane === id)} onClick={() => setPane(id)}>{l}</button>
          ))}
        </div>
        <div style={S.card}>
          {pane === "queue" && <QueuePane {...ctx} />}
          {pane === "templates" && <TemplatesPane {...ctx} />}
          {pane === "log" && <DailyLogPane {...ctx} />}
          {pane === "settings" && canEdit && <SettingsPane {...ctx} />}
        </div>
      </div>
      {toast && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#0F172A", color: "#fff", fontSize: 13, padding: "8px 18px", borderRadius: 999, zIndex: 9999 }}>{toast}</div>}
    </div>
  );
}

// ═══════════════════════ QUEUE (inbox layout: list · conversation · details) ═══════════════════════
function QueuePane(ctx) {
  const { inquiries, settings, activeBrand, addInquiry, exportCSV, syncAllChannels, connectedChannels, todayStr, showToast, now } = ctx;
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [fStatus, setFStatus] = useState("Active");
  const [fChannel, setFChannel] = useState("All");
  const [fBrand, setFBrand] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({ channel: CHANNEL_DEFS[0].key, brand: "", ref: "", type: TYPES[0], agent: "", message: "" });
  const messageRef = useRef(null);

  useEffect(() => { if (activeBrand !== "ALL") setForm((f) => ({ ...f, brand: activeBrand })); }, [activeBrand]);

  const filtered = inquiries.filter((i) => {
    if (fStatus === "Active" && i.status === "Closed") return false;
    if (fStatus !== "All" && fStatus !== "Active" && i.status !== fStatus) return false;
    if (fChannel !== "All" && i.channel !== fChannel) return false;
    if (fBrand !== "All" && i.brand !== fBrand) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${i.brand} ${i.ref} ${i.message} ${i.agent} ${i.replyNotes || ""}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Keep a valid selection: if the selected ticket falls out of the current
  // filter (or nothing is selected yet), fall back to the first row shown.
  useEffect(() => {
    if (!filtered.some((i) => i.id === selectedId)) setSelectedId(filtered[0]?.id || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.map((i) => i.id).join(",")]);
  const selected = filtered.find((i) => i.id === selectedId) || null;

  const submit = () => {
    if (!form.message.trim() && !form.ref.trim()) return;
    addInquiry({ ...form });
    setForm((f) => ({ ...f, ref: "", message: "" }));
    messageRef.current?.focus();
  };

  const bulkRows = useMemo(() => parseBulkLines(bulkText), [bulkText]);
  const submitBulk = () => {
    if (!bulkRows.length) return;
    bulkRows.forEach((r) => addInquiry({ channel: form.channel, brand: form.brand, ref: r.ref, type: form.type, agent: form.agent, message: r.message }));
    showToast(`Logged ${bulkRows.length} inquir${bulkRows.length > 1 ? "ies" : "y"}`);
    setBulkText("");
  };


  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <button style={S.btn(PURPLE)} onClick={() => { setShowForm((s) => !s); setShowBulk(false); }}>{showForm ? "Close" : "+ Log inquiry"}</button>
        <button style={S.btnGhost} onClick={() => { setShowBulk((s) => !s); setShowForm(false); }}>{showBulk ? "Close" : "📋 Bulk paste"}</button>
        <button style={{ ...S.btnGhost, opacity: connectedChannels.length ? 1 : 0.5 }} onClick={syncAllChannels}
          title={connectedChannels.length ? `Pull from ${connectedChannels.map((c) => c.label).join(", ")}` : "Connect a channel in Settings first"}>⟳ Sync ({connectedChannels.length || 0})</button>
        <select style={S.input} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option>Active</option><option>All</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select style={S.input} value={fChannel} onChange={(e) => setFChannel(e.target.value)}>
          <option value="All">All channels</option>{CHANNEL_DEFS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        {activeBrand === "ALL" && (
          <select style={S.input} value={fBrand} onChange={(e) => setFBrand(e.target.value)}>
            <option value="All">All brands</option>{settings.brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
        <input style={{ ...S.input, flex: 1, minWidth: 160 }} placeholder="Search brand / handle / message…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button style={S.btnGhost} onClick={() => exportCSV(inquiries, `SVCR_${activeBrand === "ALL" ? "all" : activeBrand.replace(/\s+/g, "-")}_${todayStr}.csv`)}>Export CSV</button>
      </div>

      {showForm && (
        <div style={S.panel}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
            <Field label="Channel">
              <select style={S.input} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                {CHANNEL_DEFS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </Field>
            <Field label={activeBrand !== "ALL" ? "Brand (workspace)" : "Brand / Shop"}>
              <input style={{ ...S.input, ...(activeBrand !== "ALL" ? { background: "#F1F5F9", color: "#64748B" } : {}) }} value={form.brand} readOnly={activeBrand !== "ALL"} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="brand / shop name" />
            </Field>
            <Field label="Customer handle / ref"><input style={S.input} value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} placeholder="@user, name, or email" /></Field>
            <Field label="Inquiry type"><select style={S.input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Agent"><select style={S.input} value={form.agent} onChange={(e) => setForm({ ...form, agent: e.target.value })}><option value=""></option>{settings.agents.map((a) => <option key={a}>{a}</option>)}</select></Field>
            <Field label="Message summary">
              <input ref={messageRef} style={S.input} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="What did the customer ask?" />
            </Field>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <button style={S.btn(TEAL)} onClick={submit}>Save &amp; add next</button>
            <span style={{ fontSize: 11, color: "#94A3B8" }}>Channel / brand / type / agent stay set — press Enter in the message field to keep logging fast.</span>
          </div>
        </div>
      )}

      {showBulk && (
        <div style={S.panel}>
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>
            Paste one message per line — copy straight from the platform. Use <code>@handle message</code> or <code>Name: message</code> to auto-split the sender; otherwise the whole line becomes the message.
            All rows use the Channel / Brand / Type / Agent below.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 10 }}>
            <Field label="Channel">
              <select style={S.input} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                {CHANNEL_DEFS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </Field>
            <Field label={activeBrand !== "ALL" ? "Brand (workspace)" : "Brand / Shop"}>
              <input style={{ ...S.input, ...(activeBrand !== "ALL" ? { background: "#F1F5F9", color: "#64748B" } : {}) }} value={form.brand} readOnly={activeBrand !== "ALL"} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            </Field>
            <Field label="Inquiry type"><select style={S.input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Agent"><select style={S.input} value={form.agent} onChange={(e) => setForm({ ...form, agent: e.target.value })}><option value=""></option>{settings.agents.map((a) => <option key={a}>{a}</option>)}</select></Field>
          </div>
          <textarea
            style={{ ...S.input, minHeight: 110, resize: "vertical", width: "100%", fontFamily: "monospace", fontSize: 12 }}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={"@fahsai_c ผลิตภัณฑ์นี้ใช้ได้กับผิวแพ้ง่ายไหมคะ\nNattaya Srisuk: สินค้าชิ้นนี้มีของแถมไหมคะ\nจัดส่งช้ามากค่ะ รอมา 5 วันแล้ว"}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <button style={S.btn(PURPLE)} onClick={submitBulk} disabled={!bulkRows.length}>Log {bulkRows.length || ""} inquir{bulkRows.length === 1 ? "y" : "ies"}</button>
            {bulkRows.length > 0 && <span style={{ fontSize: 11, color: "#94A3B8" }}>{bulkRows.filter((r) => r.ref).length} handle{bulkRows.filter((r) => r.ref).length === 1 ? "" : "s"} auto-detected</span>}
          </div>
        </div>
      )}

      {/* ── inbox: ticket list · conversation · details ── */}
      <div style={{ display: "flex", border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden", minHeight: 480 }}>
        <div style={{ width: 280, flexShrink: 0, borderRight: "1px solid #E2E8F0", overflowY: "auto", maxHeight: 640, background: "#fff" }}>
          {filtered.length === 0
            ? <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 12, padding: "30px 12px" }}>No inquiries here. Log the first one, paste a batch, or ⟳ Sync once a channel is connected.</div>
            : filtered.map((i) => <TicketRow key={i.id} i={i} now={now} settings={settings} selected={i.id === selectedId} onClick={() => setSelectedId(i.id)} />)}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "#F8FAFC" }}>
          {selected
            ? <ConversationPane i={selected} ctx={ctx} />
            : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8", fontSize: 13 }}>Select a ticket to view the conversation.</div>}
        </div>
        {selected && (
          <div style={{ width: 260, flexShrink: 0, borderLeft: "1px solid #E2E8F0", padding: 14, overflowY: "auto", maxHeight: 640, background: "#fff" }}>
            <DetailsSidebar i={selected} ctx={ctx} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── ticket list row (left pane) ──
function TicketRow({ i, now, settings, selected, onClick }) {
  const def = getChannelDef(i.channel);
  const isPending = ["New", "In Progress", "Escalated"].includes(i.status);
  const age = isPending ? businessMinutes(new Date(i.createdAt), now, settings.holidays) : null;
  const breach = isPending && age > settings.slaTarget;
  const st = STATUS_STYLE[i.status] || STATUS_STYLE.New;

  return (
    <div onClick={onClick} style={{
      padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid #F1F5F9", borderLeft: "3px solid " + (selected ? PURPLE : "transparent"),
      background: selected ? "#F5F3FF" : breach ? "#FFF1F2" : "#fff",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 26, height: 26, borderRadius: 999, background: def.chipBg, color: def.chipFg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
          {def.short.slice(0, 2).toUpperCase()}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1E293B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.ref || i.brand || "Unknown"}</span>
            <span style={{ fontSize: 10, color: "#94A3B8", flexShrink: 0 }}>{fmtDT(i.createdAt)}</span>
          </div>
          <div style={{ fontSize: 12, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.message}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 6, marginLeft: 34, alignItems: "center" }}>
        <span style={S.chip(st.bg, st.fg)}>{i.status}</span>
        {breach && <span style={{ fontSize: 10, fontWeight: 700, color: "#E11D48" }}>⏱ SLA</span>}
      </div>
    </div>
  );
}

// ── conversation pane (center) ──
function ConversationPane({ i, ctx }) {
  const { settings, now } = ctx;
  const def = getChannelDef(i.channel);
  const win = replyWindow(i, now);
  const aiReady = Boolean(settings.fnBase && settings.aiPath);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 480 }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #E2E8F0", background: "#fff", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#1E293B" }}>{i.ref || "Customer"}</span>
        <span style={S.chip(def.chipBg, def.chipFg)}>{def.label}</span>
        {i.brand && <span style={{ fontSize: 12, color: "#64748B" }}>{i.brand}</span>}
        <div style={{ flex: 1 }} />
        {win && (
          <span style={{ fontSize: 11, fontWeight: 700, color: win.expired ? "#E11D48" : win.leftMin < 360 ? "#D97706" : "#64748B" }}>
            {win.expired ? "✖ reply window expired" : `⏱ ${fmtMins(win.leftMin)} left to reply`}
          </span>
        )}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
        <ChatThread i={i} />
      </div>
      {aiReady && <div style={{ padding: "0 14px 10px" }}><AIDraft i={i} ctx={ctx} win={win} /></div>}
      <ChatComposer i={i} ctx={ctx} />
    </div>
  );
}

// ── chat thread (read-only bubble list) ──
function ChatThread({ i }) {
  const history = i.history && i.history.length ? i.history : (i.message ? [{ id: "legacy-msg", ts: i.createdAt, author: "customer", text: i.message }] : []);
  const legacyReply = (!i.history || !i.history.some((h) => h.author === "agent")) && i.replyNotes
    ? [{ id: "legacy-reply", ts: i.repliedAt || i.createdAt, author: "agent", text: i.replyNotes }] : [];
  const thread = [...history, ...legacyReply].sort((a, b) => new Date(a.ts) - new Date(b.ts));

  if (thread.length === 0) return <div style={{ fontSize: 12, color: "#94A3B8" }}>No messages logged yet.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {thread.map((h) => (
        h.author === "system" ? (
          <div key={h.id} style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ maxWidth: "85%", background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A", borderRadius: 999, padding: "5px 14px", fontSize: 12, textAlign: "center" }}>
              📋 <b>Logged to Daily Log</b> · {fmtDT(h.ts)} — {h.text}
            </div>
          </div>
        ) : (
          <div key={h.id} style={{ display: "flex", justifyContent: h.author === "agent" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "72%", borderRadius: 12, padding: "8px 12px", fontSize: 13, whiteSpace: "pre-wrap",
              background: h.author === "agent" ? PURPLE : "#fff",
              color: h.author === "agent" ? "#fff" : "#1E293B",
              border: h.author === "agent" ? "none" : "1px solid #E2E8F0",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.75, marginBottom: 2, textTransform: "uppercase" }}>
                {h.author === "agent" ? "Agent" : "Customer"} · {fmtDT(h.ts)}
              </div>
              {h.text}
            </div>
          </div>
        )
      ))}
    </div>
  );
}

// ── composer (bottom of conversation pane) — "type of log" = Reply vs Note ──
function ChatComposer({ i, ctx }) {
  const { addHistoryEntry } = ctx;
  const [draft, setDraft] = useState("");
  const [author, setAuthor] = useState("agent");

  const log = () => {
    if (!draft.trim()) return;
    addHistoryEntry(i.id, author, draft.trim());
    setDraft("");
  };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: 12, borderTop: "1px solid #E2E8F0", background: "#fff" }}>
      <select style={{ ...S.input, width: 118 }} value={author} onChange={(e) => setAuthor(e.target.value)} title="Log type">
        <option value="agent">Reply (Agent)</option>
        <option value="customer">Note (Customer)</option>
      </select>
      <textarea
        style={{ ...S.input, flex: 1, minHeight: 40, resize: "vertical" }}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); log(); } }}
        placeholder={author === "agent" ? "Log the reply that was sent…" : "Log a customer follow-up message…"}
      />
      <button style={S.btn(author === "agent" ? PURPLE : NAVY)} onClick={log}>Log</button>
    </div>
  );
}

// ── details sidebar (right) — status/agent/type + "log for report" quick action ──
function DetailsSidebar({ i, ctx }) {
  const { settings, updateInquiry, removeInquiry, canEdit, notes, setNotes, activeBrand, todayStr, showToast, addHistoryEntry } = ctx;
  const [noteDraft, setNoteDraft] = useState("");
  const st = STATUS_STYLE[i.status] || STATUS_STYLE.New;

  // Logs to two places at once: the Daily Log's shift notes (for the report)
  // AND the ticket's own thread (as a "system" entry), so anyone opening this
  // ticket later can see a report note was logged without checking Daily Log.
  const addToShiftNotes = () => {
    if (!noteDraft.trim()) return;
    const noteKey = activeBrand === "ALL" ? todayStr : `${todayStr}::${activeBrand}`;
    const stamp = `[${fmtDT(new Date().toISOString())}] ${i.ref || i.brand || "Case"}: ${noteDraft.trim()}`;
    setNotes((p) => ({ ...p, [noteKey]: p[noteKey] ? `${p[noteKey]}\n${stamp}` : stamp }));
    addHistoryEntry(i.id, "system", noteDraft.trim());
    showToast("Added to today's Daily Log — and shown on this ticket");
    setNoteDraft("");
  };

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#94A3B8", marginBottom: 8 }}>Details</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Field label="Status"><div style={{ marginTop: 2 }}><span style={S.chip(st.bg, st.fg)}>{i.status}</span></div></Field>
        <Field label="Agent">
          <select style={S.input} value={i.agent || ""} onChange={(e) => updateInquiry(i.id, { agent: e.target.value })}>
            <option value="">Unassigned</option>{settings.agents.map((a) => <option key={a}>{a}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select style={S.input} value={i.type} onChange={(e) => updateInquiry(i.id, { type: e.target.value })}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Brand"><div style={{ fontSize: 13, color: "#334155" }}>{i.brand || "—"}</div></Field>
        <Field label="Created"><div style={{ fontSize: 12, color: "#64748B" }}>{fmtDT(i.createdAt)}</div></Field>
        {i.repliedAt && <Field label="Replied"><div style={{ fontSize: 12, color: "#059669" }}>{fmtDT(i.repliedAt)}</div></Field>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
        {!["Replied", "Closed"].includes(i.status) && <button style={S.btn(TEAL)} onClick={() => updateInquiry(i.id, { status: "Replied" })}>Mark replied</button>}
        {i.status !== "Escalated" && i.status !== "Closed" && <button style={S.btnGhost} onClick={() => updateInquiry(i.id, { status: "Escalated" })}>Escalate</button>}
        {i.status !== "Closed" && <button style={S.btnGhost} onClick={() => updateInquiry(i.id, { status: "Closed" })}>Close ticket</button>}
        {canEdit && <button style={{ ...S.btnGhost, color: "#E11D48", borderColor: "#FCA5A5" }} onClick={() => window.confirm("Delete this inquiry?") && removeInquiry(i.id)}>Delete</button>}
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #F1F5F9" }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#94A3B8", marginBottom: 6 }}>Log for report</div>
        <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>
          Adds a note to today's Daily Log shift notes for {activeBrand === "ALL" ? "all brands" : activeBrand}.
        </div>
        <textarea style={{ ...S.input, minHeight: 50, resize: "vertical", width: "100%" }} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="e.g. Escalated to warehouse team" />
        <button style={{ ...S.btn(NAVY), marginTop: 6, width: "100%" }} onClick={addToShiftNotes}>+ Add to Daily Log</button>
      </div>
    </div>
  );
}
// ═══════════════════════ AI DRAFT ═══════════════════════
function AIDraft({ i, ctx, win }) {
  const { settings, templates, updateInquiry, addHistoryEntry, showToast } = ctx;
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState(null);
  const [error, setError] = useState(null);
  const [instruction, setInstruction] = useState("");
  const [sending, setSending] = useState(false);

  const def = getChannelDef(i.channel);
  const aiReady = Boolean(settings.fnBase && settings.aiPath);
  const connected = isChannelConnected(settings, i.brand, i.channel);
  const canSend = Boolean(connected && i.extId && (!win || !win.expired));

  const generate = async () => {
    if (!aiReady) return;
    if (!i.message?.trim()) { setError("Add a customer message summary first."); return; }
    setLoading(true); setError(null);
    try {
      const v = await aiDraftReplies(settings, {
        inquiry: { channel: def.label, channelKind: def.kind, brand: i.brand, type: i.type, message: i.message },
        toneProfile: (i.brand && settings.tones?.[i.brand]) || settings.defaultTone,
        language: settings.replyLanguage || "auto",
        templates: templates.filter((t) => !t.brand || t.brand === i.brand).slice(0, 6),
        extraInstruction: instruction.trim(),
      });
      setVariants(v);
    } catch (e) { console.warn(e); setError("AI drafting failed — is the ai-draft function deployed?"); }
    finally { setLoading(false); }
  };

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); showToast(`Copied — paste into ${def.label}`); }
    catch { showToast("Copy failed — select manually"); }
  };
  const useAsReply = (text) => { addHistoryEntry(i.id, "agent", text); showToast("Added to chat history"); };
  const sendViaChannel = async (text) => {
    if (!canSend || sending) return;
    if (!window.confirm(`Send this reply on ${def.label} for ${i.brand}?\n\n"${text}"`)) return;
    setSending(true);
    try {
      const endpoint = resolvedEndpoint(settings, i.brand, i.channel);
      const conn = getChannelConn(settings, i.brand, i.channel);
      await sendChannelMessage(endpoint, i.channel, buildSendPayload(i.channel, i.brand, conn.accountId, i, text));
      addHistoryEntry(i.id, "agent", text);
      updateInquiry(i.id, { status: "Replied" });
      showToast(`Sent via ${def.label} ✓`);
    } catch (e) { console.warn(e); showToast(`Send failed — reply manually in ${def.label}`); }
    finally { setSending(false); }
  };

  return (
    <div style={{ borderRadius: 12, padding: 12, background: "linear-gradient(120deg,#F6F1FF,#F0FBF8)", border: "1px solid #E4DAF6" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: PURPLE }}>✨ AI reply draft</span>
        {!aiReady && <span style={{ fontSize: 11, color: "#94A3B8" }}>configure Endpoints in Settings to enable</span>}
        {aiReady && <>
          <input style={{ ...S.input, flex: 1, minWidth: 160, fontSize: 12 }} value={instruction} onChange={(e) => setInstruction(e.target.value)}
            placeholder="Optional instruction, e.g. 'offer voucher [CODE]' or 'firmer tone'" onKeyDown={(e) => e.key === "Enter" && !loading && generate()} />
          <button style={{ ...S.btn(loading ? "#A78BDA" : PURPLE), padding: "7px 14px", fontSize: 12 }} disabled={loading} onClick={generate}>
            {loading ? "Drafting…" : variants ? "Regenerate" : "Draft replies"}
          </button>
        </>}
      </div>
      {error && <div style={{ fontSize: 12, color: "#E11D48", marginTop: 6 }}>{error}</div>}

      {variants && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8, marginTop: 10 }}>
          {variants.map((v, idx) => (
            <div key={idx} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: NAVY, marginBottom: 4 }}>{v.style}</div>
              <div style={{ fontSize: 13, color: "#334155", whiteSpace: "pre-wrap", flex: 1 }}>{v.text}</div>
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: TEAL, padding: 0 }} onClick={() => copy(v.text)}>Copy</button>
                <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: PURPLE, padding: 0 }} onClick={() => useAsReply(v.text)}>Use as notes</button>
                {canSend && <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#0F172A", padding: 0 }} disabled={sending} onClick={() => sendViaChannel(v.text)}>{sending ? "Sending…" : `Send on ${def.short} ↗`}</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {variants && (
        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>
          Drafts follow the {i.brand && settings.tones?.[i.brand] ? `${i.brand} tone profile` : "default tone"} — review before sending. Fill any [PLACEHOLDER] with real data.
          {win && !win.expired && ` Reply window closes ${win.deadline.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}.`}
          {win && win.expired && " Reply window expired — API send disabled; contact must message again first."}
          {!connected && i.extId && ` ${def.label} isn't connected for direct send — copy and reply manually.`}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════ TEMPLATES ═══════════════════════
function TemplatesPane({ templates, setTemplates, settings, activeBrand, showToast, canEdit }) {
  const [form, setForm] = useState({ brand: activeBrand !== "ALL" ? activeBrand : "", label: "", text: "" });
  const [fBrand, setFBrand] = useState(activeBrand !== "ALL" ? activeBrand : "All");
  useEffect(() => {
    setFBrand(activeBrand !== "ALL" ? activeBrand : "All");
    setForm((f) => ({ ...f, brand: activeBrand !== "ALL" ? activeBrand : f.brand }));
  }, [activeBrand]);

  const add = () => {
    if (!form.text.trim() || !form.label.trim()) return;
    setTemplates((p) => [{ id: uid(), ...form }, ...p]);
    setForm({ ...form, label: "", text: "" });
  };
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); showToast("Copied"); } catch { showToast("Copy failed"); } };
  const shown = templates.filter((t) => fBrand === "All" || (fBrand === "General" ? !t.brand : t.brand === fBrand));
  const opts = Array.from(new Set([...(settings.brands || []), ...templates.map((t) => t.brand).filter(Boolean)]));

  return (
    <div>
      <div style={{ fontSize: 13, color: "#64748B", marginBottom: 10 }}>Brand-tone reply snippets — one tap to copy, paste into any channel. These also feed the AI drafts as tone reference.</div>
      {canEdit && (
        <div style={{ ...S.panel, display: "grid", gridTemplateColumns: "1fr 1fr 2fr auto", gap: 10, alignItems: "end" }}>
          <Field label="Brand (blank = general)"><input style={S.input} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
          <Field label="Label"><input style={S.input} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Refund process" /></Field>
          <Field label="Template text"><textarea style={{ ...S.input, minHeight: 36, resize: "vertical" }} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></Field>
          <button style={S.btn(PURPLE)} onClick={add}>Add</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <select style={S.input} value={fBrand} onChange={(e) => setFBrand(e.target.value)}>
          <option>All</option><option>General</option>{opts.map((b) => <option key={b}>{b}</option>)}
        </select>
        <span style={{ fontSize: 12, color: "#94A3B8" }}>{shown.length} templates</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 8 }}>
        {shown.map((t) => (
          <div key={t.id} style={{ border: "1px solid #E2E8F0", borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1E293B" }}>{t.label}</span>
              <span style={t.brand ? S.chip("#EDE9FE", "#5B21B6") : S.chip("#F1F5F9", "#64748B")}>{t.brand || "General"}</span>
              <div style={{ flex: 1 }} />
              <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: TEAL }} onClick={() => copy(t.text)}>Copy</button>
              {canEdit && <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#94A3B8" }} onClick={() => setTemplates((p) => p.filter((x) => x.id !== t.id))}>✕</button>}
            </div>
            <div style={{ fontSize: 13, color: "#475569", whiteSpace: "pre-wrap" }}>{t.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════ DAILY LOG ═══════════════════════
function DailyLogPane({ inquiries, activeBrand, notes, setNotes, settings, exportCSV }) {
  const [day, setDay] = useState(toDateStr(new Date()));
  const noteKey = activeBrand === "ALL" ? day : `${day}::${activeBrand}`;
  const rows = inquiries.filter((i) => (i.createdAt || "").slice(0, 10) === day);
  const replied = rows.filter((i) => ["Replied", "Closed"].includes(i.status));
  const escalated = rows.filter((i) => i.status === "Escalated");
  const rts = rows.filter((i) => i.repliedAt).map((i) => businessMinutes(new Date(i.createdAt), new Date(i.repliedAt), settings.holidays));
  const avg = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null;

  const agg = (fn) => rows.reduce((o, i) => { const k = fn(i); if (k) o[k] = (o[k] || 0) + 1; return o; }, {});
  const byChannel = agg((i) => getChannelDef(i.channel).label), byType = agg((i) => i.type), byAgent = agg((i) => i.agent), byBrand = agg((i) => i.brand || "(no brand)");

  const CountList = ({ title, data }) => (
    <div style={{ border: "1px solid #E2E8F0", borderRadius: 12, padding: 12, flex: 1, minWidth: 180 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#94A3B8", marginBottom: 8 }}>{title}</div>
      {Object.keys(data).length === 0 ? <div style={{ fontSize: 12, color: "#94A3B8" }}>—</div> :
        Object.entries(data).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "2px 0" }}>
            <span style={{ color: "#475569" }}>{k}</span><span style={{ fontWeight: 700, color: NAVY }}>{v}</span>
          </div>
        ))}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 14 }}>
        <input type="date" style={S.input} value={day} onChange={(e) => setDay(e.target.value)} />
        <button style={S.btnGhost} onClick={() => exportCSV(rows, `SVCR_daily_${activeBrand === "ALL" ? "all" : activeBrand.replace(/\s+/g, "-")}_${day}.csv`)} disabled={!rows.length}>Export day CSV</button>
        <span style={{ fontSize: 12, color: "#94A3B8" }}>{rows.length} inquiries on {day}{activeBrand !== "ALL" ? ` · ${activeBrand}` : " · all brands"}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {[["Received", rows.length], ["Replied/Closed", replied.length], ["Escalated", escalated.length], ["Avg response", fmtMins(avg)]].map(([l, v], idx) => (
          <div key={idx} style={{ flex: 1, minWidth: 130, borderRadius: 12, padding: 12, textAlign: "center", background: "#F4F4FB", border: "1px solid #E2E2F2" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: NAVY }}>{v}</div>
            <div style={{ fontSize: 11, color: "#64748B" }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        {activeBrand === "ALL" && <CountList title="By brand" data={byBrand} />}
        <CountList title="By channel" data={byChannel} />
        <CountList title="By inquiry type" data={byType} />
        <CountList title="By agent" data={byAgent} />
      </div>
      <Field label={`Shift notes — ${day}${activeBrand !== "ALL" ? ` · ${activeBrand}` : ""}`}>
        <textarea style={{ ...S.input, minHeight: 100, resize: "vertical" }} value={notes[noteKey] || ""} onChange={(e) => setNotes((p) => ({ ...p, [noteKey]: e.target.value }))}
          placeholder="Handover notes, recurring issues, anything the next shift or the weekly report needs…" />
      </Field>
    </div>
  );
}

// ═══════════════════════ SETTINGS ═══════════════════════
function SettingsPane({ settings, setSettings }) {
  const [inp, setInp] = useState({ agent: "", brand: "", holiday: "" });
  const setI = (k, v) => setInp((p) => ({ ...p, [k]: v }));

  const ListEditor = ({ title, items, k, placeholder, type = "text", onAdd, onRemove }) => (
    <div style={{ border: "1px solid #E2E8F0", borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#94A3B8", marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input type={type} style={{ ...S.input, flex: 1 }} value={inp[k]} placeholder={placeholder} onChange={(e) => setI(k, e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && inp[k].trim()) { onAdd(inp[k].trim()); setI(k, ""); } }} />
        <button style={S.btn(NAVY)} onClick={() => { if (inp[k].trim()) { onAdd(inp[k].trim()); setI(k, ""); } }}>Add</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {items.map((it) => (
          <span key={it} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#F1F5F9", color: "#334155", fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 999 }}>
            {it}<button style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }} onClick={() => onRemove(it)}>✕</button>
          </span>
        ))}
        {items.length === 0 && <span style={{ fontSize: 12, color: "#94A3B8" }}>None yet</span>}
      </div>
    </div>
  );

  const setChannelField = (brand, key, field, value) => setSettings((s) => ({
    ...s,
    channels: {
      ...s.channels,
      [brand]: {
        ...(s.channels?.[brand] || {}),
        [key]: { ...((s.channels?.[brand] || {})[key] || {}), [field]: value },
      },
    },
  }));

  const CHANNEL_HINTS = {
    tiktok_comment: "Leave Endpoint blank to use the built-in tiktok-proxy function.",
    tiktok_dm: "Leave Endpoint blank to use the built-in tiktok-messaging function.",
    line_oa: "Needs a LINE Messaging API channel + a line-oa-proxy edge function (not built yet) — stays manual until connected.",
    email: "Needs an inbound-email webhook + an email-proxy edge function (not built yet) — stays manual until connected.",
    amaze: "No public Amaze (Ascend Commerce) seller API found yet — stays manual-log-only.",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 14 }}>
      <ListEditor title="Agents" items={settings.agents} k="agent" placeholder="Agent name"
        onAdd={(v) => setSettings((s) => ({ ...s, agents: Array.from(new Set([...s.agents, v])) }))}
        onRemove={(v) => setSettings((s) => ({ ...s, agents: s.agents.filter((a) => a !== v) }))} />
      <ListEditor title="Brands / Shops" items={settings.brands} k="brand" placeholder="Brand or shop name"
        onAdd={(v) => setSettings((s) => ({ ...s, brands: Array.from(new Set([...s.brands, v])) }))}
        onRemove={(v) => setSettings((s) => ({ ...s, brands: s.brands.filter((b) => b !== v), activeBrand: s.activeBrand === v ? "ALL" : s.activeBrand }))} />
      <ListEditor title="Public holidays (service closed)" items={settings.holidays} k="holiday" placeholder="YYYY-MM-DD" type="date"
        onAdd={(v) => setSettings((s) => ({ ...s, holidays: Array.from(new Set([...s.holidays, v])).sort() }))}
        onRemove={(v) => setSettings((s) => ({ ...s, holidays: s.holidays.filter((h) => h !== v) }))} />
      <div style={{ border: "1px solid #E2E8F0", borderRadius: 12, padding: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#94A3B8", marginBottom: 8 }}>SLA target — first reply (business minutes)</div>
        <input type="number" min="5" step="5" style={{ ...S.input, width: 110 }} value={settings.slaTarget}
          onChange={(e) => setSettings((s) => ({ ...s, slaTarget: Math.max(5, Number(e.target.value) || 60) }))} />
        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>
          Response times count only Mon–Fri 09:00–18:00, skipping weekends and listed public holidays. Fri 17:50 → Mon 09:15 = 25 business minutes.
        </div>
      </div>

      <div style={{ border: "1px solid #E2E8F0", borderRadius: 12, padding: 12, gridColumn: "1 / -1" }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#0F172A", marginBottom: 8 }}>⟳ Functions base URL</div>
        <Field label="Supabase Edge Functions base (used for TikTok defaults + AI drafting)">
          <input style={S.input} value={settings.fnBase || ""} placeholder="https://bequrilwgooesolepubv.supabase.co/functions/v1"
            onChange={(e) => setSettings((s) => ({ ...s, fnBase: e.target.value.trim() }))} />
        </Field>
        <Field label="AI draft function name" style={{ marginTop: 10, maxWidth: 220 }}>
          <input style={S.input} value={settings.aiPath || ""} onChange={(e) => setSettings((s) => ({ ...s, aiPath: e.target.value.trim() }))} />
        </Field>
      </div>

      <div style={{ border: "1px solid #E2E8F0", borderRadius: 12, padding: 12, gridColumn: "1 / -1" }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#0F172A", marginBottom: 4 }}>⟳ Channel Connections</div>
        <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 10 }}>
          One row per channel per brand. Endpoint blank on TikTok channels uses the built-in functions above. Access tokens live server-side in the edge functions — never in this app.
        </div>
        {settings.brands.length === 0 ? <div style={{ fontSize: 12, color: "#94A3B8" }}>Add a brand above first.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {settings.brands.map((b) => (
              <div key={b} style={{ border: "1px solid #F1F5F9", borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 8 }}>{b}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {CHANNEL_DEFS.map((c) => {
                    const conn = getChannelConn(settings, b, c.key);
                    const connected = isChannelConnected(settings, b, c.key);
                    return (
                      <div key={c.key} style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}><span style={S.dot(connected)} />{c.label}</span>
                        <input style={S.input} value={conn.accountId || ""} placeholder="Account / Channel ID"
                          onChange={(e) => setChannelField(b, c.key, "accountId", e.target.value.trim())} />
                        <input style={S.input} value={conn.endpoint || ""} placeholder={c.builtIn ? "(default) leave blank" : "Endpoint URL — not built yet"}
                          onChange={(e) => setChannelField(b, c.key, "endpoint", e.target.value.trim())} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 10, display: "flex", flexDirection: "column", gap: 2 }}>
          {CHANNEL_DEFS.map((c) => <span key={c.key}><b>{c.label}:</b> {CHANNEL_HINTS[c.key]}</span>)}
        </div>
      </div>

      <div style={{ border: "1px solid #E2E8F0", borderRadius: 12, padding: 12, gridColumn: "1 / -1" }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: PURPLE, marginBottom: 8 }}>✨ AI reply settings</div>
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 10 }}>
          <Field label="Reply language">
            <select style={S.input} value={settings.replyLanguage || "auto"} onChange={(e) => setSettings((s) => ({ ...s, replyLanguage: e.target.value }))}>
              <option value="auto">Auto (match customer)</option>
              <option value="th">Thai always</option>
              <option value="en">English always</option>
            </select>
          </Field>
          <Field label="Default brand tone (used when a brand has no profile)">
            <textarea style={{ ...S.input, minHeight: 56, resize: "vertical" }} value={settings.defaultTone || ""} onChange={(e) => setSettings((s) => ({ ...s, defaultTone: e.target.value }))} />
          </Field>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#94A3B8", margin: "12px 0 8px" }}>Per-brand tone profiles</div>
        {settings.brands.length === 0 ? <div style={{ fontSize: 12, color: "#94A3B8" }}>Add brands first — each brand can get its own tone guideline for AI drafts.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {settings.brands.map((b) => (
              <Field key={b} label={b}>
                <textarea style={{ ...S.input, minHeight: 44, resize: "vertical" }} value={settings.tones?.[b] || ""}
                  placeholder="e.g. Playful Gen-Z Thai, heavy emoji — or — formal, no emoji, medical-grade brand"
                  onChange={(e) => setSettings((s) => ({ ...s, tones: { ...(s.tones || {}), [b]: e.target.value } }))} />
              </Field>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
