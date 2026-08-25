// ═══ email v30 — SendGrid inbound parse + threaded send ═══
// v13 shop mailboxes · v14 To-only inbox rule · v15 cid strip + Thai repair
// v16 HTML signatures · v17 loop guard · v18 per-mailbox signatures
// v19 envelope-based mailbox detection
// v20: marketplace robots stop becoming cases — archived to platform_notifications.
// v21: customer Cc memory (`pinned` on /recipients, `pinCc` on /send).
// v22: per-mailbox signature logos via cfg.logoByMailbox.
// v23: "closed" status retired — merged into "resolved".
// v24: log SendGrid rejections so a refused send leaves a reason behind.
// v25: attachments no longer overwrite each other (indexed storage paths).
// v26: no duplicate images across a thread — each attachment is SHA-256'd and
//      skipped if that content is already on the case.
// v27: STOP BURNING SEND QUOTA ON COLLEAGUES WHO ALREADY HAVE THE CRM.
//      SendGrid bills one message per recipient, so a Nestlé reply-all with
//      ~37 Cc costs ~38 sends — a handful of those exhausted the daily quota
//      and a real customer reply was refused (403 "exceeded your messaging
//      limits"). Colleagues holding a NiRM login see every case in Service
//      CRM already, so mailing them the same thread is pure duplicate spend.
//      They are now dropped from Cc — both from the chips the agent sees and
//      from the actual send. Crucially this is keyed on "has a CRM login"
//      (the staff set, built from nirm-userAccounts), NOT on the @crea.asia
//      domain: 7 of 15 internal people Cc'd recently have no CRM account and
//      would otherwise have been silently cut out of their cases. External
//      recipients are never touched.
// v28: THAI ATTACHMENT NAMES ARRIVED AS MOJIBAKE. A file called
//      "59164307 ของแถมชำรุด.docx" showed in the desk as
//      "59164307 à¸£à¸­à¸‡...docx" and no agent could tell what it was. The
//      multipart header block is read as raw bytes, and the filename was taken
//      straight out of it — so a UTF-8 name came through one byte per
//      character. Every Thai-named attachment the desk has ever received was
//      unreadable. Now the name is decoded properly: SendGrid's own
//      attachment-info JSON first (already charset-decoded), then RFC 2231
//      filename*=UTF-8''…, then RFC 2047 encoded words, then the raw bytes
//      through the same charset sniffing the message body already uses.
// v29: …and the storage KEY has to stay ASCII. Fixing the decoding immediately
//      broke the upload: Supabase Storage answers "Invalid key" for a path
//      containing Thai, so the first properly-decoded attachment failed to
//      save at all. The pretty name lives on the message; the path is only
//      required to be unique and safe, so it is flattened to ASCII. (This was
//      hidden before only because mojibake names were already being mangled
//      into underscores.)
// v30: THE REPLY COULD NOT BE ADDRESSED TO THE PERSON WE WERE TALKING TO.
//      The To was always tickets.customer_email — the sender of whichever mail
//      opened the case. When WE open a thread, that is our own mailbox, so
//      every reply went back to ourselves. On TK-E10478 (Mars, Shopee order
//      260529NX6RX08F) two replies went To: cs.solution@crea.asia with
//      contact@sea.mars.com on neither To nor Cc; Mars never got the consumer's
//      email address and asked for it again a day later. Three changes:
//        · /send accepts an optional `to` — one address or several. It is
//          validated, refused if it points at one of our own mailboxes, and
//          applies to that message ONLY. tickets.customer_email is never
//          rewritten, so nothing changes underneath the next agent.
//        · /recipients now also reports who actually wrote last (`senders`,
//          `suggestedTo`). A correspondent who only ever appears as a From was
//          previously impossible to offer, because the Cc chips are built from
//          the last inbound's To and Cc lines alone.
//        · the inbound insert tolerates the new unique index on
//          (external_id, ourBox). A conflict means a simultaneous delivery of
//          the same mail already landed — that is success, and it must not 500
//          or SendGrid will retry a message we deliberately refused.
// v31: SAME TOPIC, ONE CASE — and two desks that share a topic share the case.
//      Threading required the same sender AND the same mailbox, so one Nestlé
//      thread ("[Nestle Professional] … Omni No.58889250") became two cases:
//      one colleague forwarded it to cs.solution@crea.asia, another to
//      cs@crea.asia. Now an open case is matched on subject alone, provided
//      the subject is distinctive enough to BE a topic — a subject carrying a
//      reference number, or a reasonably long one. A bare "สอบถาม" or
//      "(no subject)" still needs the sender to agree, because merging those
//      would put one customer's mail inside another customer's case.
//      Mailboxes can also be declared as one desk (kv_state key
//      "nirm-crm-mailbox-groups"), so mail to cs.solution@crea.asia and
//      nestlepro.cs@crea.asia lands in a single inbox. Resolved and closed
//      cases are never joined — a new mail on a finished topic opens a new
//      case, exactly as before.
import { createClient } from "npm:@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const SG_KEY = Deno.env.get("SENDGRID_API_KEY") ?? "";
const HOOK_TOKEN = Deno.env.get("EMAIL_WEBHOOK_TOKEN") ?? "";
const BUCKET = "ticket-attachments";
const MAX_ATT = 10 * 1024 * 1024;
const J = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };

const norm = (s: string) => (s ?? "").replace(/^((re|fw|fwd|ตอบกลับ)\s*:\s*)+/i, "").trim().toLowerCase();
const addrOf = (s: string) => (s?.match(/<([^>]+)>/)?.[1] ?? s ?? "").trim().toLowerCase();
const nameOf = (s: string) => (s?.match(/^\s*"?([^"<]+?)"?\s*</)?.[1] ?? "").trim();
const msgids = (s: string) => [...(s ?? "").matchAll(/<[^>]+>/g)].map((m) => m[0]);
/* v29: storage keys are ASCII-only. Thai (and any other non-ASCII) is
   flattened here and here alone — the readable name is carried on the message
   metadata, never derived from the path. */
const safeName = (s: string) => {
  const clean = (s || "file").replace(/[^\w.\- ]+/g, "_");
  if (clean.length <= 120) return clean;
  const dot = clean.lastIndexOf(".");
  const ext = dot > 0 && clean.length - dot <= 12 ? clean.slice(dot) : "";
  return clean.slice(0, 120 - ext.length) + ext;
};
const sha256Hex = async (u: Uint8Array) => {
  const h = await crypto.subtle.digest("SHA-256", u);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
};
const splitAddrs = (s: string): string[] => {
  if (!s) return [];
  return s.split(/,(?![^<]*>)/).map((p) => addrOf(p.trim())).filter((a) => /@/.test(a));
};
const esc = (s: string) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const FALLBACK_BOX = "cs.solution@crea.asia";
const PARSE_BOX = /@parse\.crea\.asia$/i;
const THAI = /[฀-๿]/;
const NIRM_HDR = "X-NiRM-Ticket";
/* v30: one place that decides whether a typed address is a usable recipient. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const stripCid = (s: string) => (s ?? "")
  .replace(/\[cid:[^\]]*\]/gi, "").replace(/<cid:[^>]*>/gi, "")
  .replace(/^[ \t]*cid:\S+[ \t]*$/gim, "").replace(/\n{3,}/g, "\n\n").trim();

function repairThai(s: string): string {
  if (!s || THAI.test(s)) return s;
  if (!/[¡-ÿ]{2,}/.test(s)) return s;
  try {
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c > 0xff) return s;
      bytes[i] = c;
    }
    const thai = new TextDecoder("windows-874").decode(bytes);
    return THAI.test(thai) ? thai : s;
  } catch { return s; }
}

type Cfg = Record<string, any>;
let _cfg: { at: number; cfg: Cfg | null; staff: Set<string>; groups: string[][] } = { at: 0, cfg: null, staff: new Set(), groups: [] };

async function config(): Promise<{ cfg: Cfg | null; staff: Set<string>; groups: string[][] }> {
  if (Date.now() - _cfg.at < 60_000 && _cfg.cfg) return { cfg: _cfg.cfg, staff: _cfg.staff, groups: _cfg.groups };
  let cfg: Cfg | null = null;
  const staff = new Set<string>();
  let groups: string[][] = [];
  try {
    const { data } = await supa.from("kv_state").select("key,value").in("key", ["nirm-crm-signatures", "nirm-userAccounts", "nirm-crm-mailbox-groups"]);
    for (const row of data ?? []) {
      if (row.key === "nirm-crm-signatures") cfg = row.value as Cfg;
      /* v31: kept in its own key rather than inside the signature blob — the
         signature config is edited by hand in Settings and must not be at risk
         from an unrelated change. */
      if (row.key === "nirm-crm-mailbox-groups" && Array.isArray(row.value)) {
        groups = row.value
          .filter((g: unknown) => Array.isArray(g))
          .map((g: unknown[]) => g.map((a) => String(a).toLowerCase().trim()).filter((a) => a.includes("@")))
          .filter((g: string[]) => g.length > 1);
      }
      if (row.key === "nirm-userAccounts" && Array.isArray(row.value)) {
        for (const u of row.value) {
          const e = String(u?.username ?? "").toLowerCase().trim();
          if (e.includes("@")) staff.add(e);
        }
      }
    }
  } catch { /* keep whatever we have */ }
  _cfg = { at: Date.now(), cfg, staff, groups };
  return { cfg, staff, groups };
}

/* v31: which desk a mailbox belongs to. Mailboxes in the same declared group
   answer to one another, so a thread does not fork just because a colleague
   forwarded it to the sister address. Ungrouped mailboxes are their own desk,
   which is the behaviour everything had before. */
const deskOf = (box: string, groups: string[][]) => {
  const a = (box ?? "").toLowerCase().trim();
  for (const g of groups) if (g.includes(a)) return g[0];
  return a;
};

/* Is this subject a topic, or just a greeting? Merging on "สอบถามค่ะ" would
   drop one customer's mail into another customer's case, so an indistinct
   subject still has to agree on the sender before it joins anything. */
const GENERIC_SUBJECT = /^(\(no subject\)|test|hello|hi|help|urgent|inquiry|enquiry|question|support|follow[- ]?up|update|สอบถาม|ติดต่อ|ช่วยด้วย|ด่วน|แจ้งปัญหา|สวัสดี|ขอสอบถาม)$/i;
const distinctiveSubject = (raw: string) => {
  const n = norm(raw ?? "");
  if (!n || GENERIC_SUBJECT.test(n)) return false;
  if (/\d{5,}/.test(n)) return true;      // an order or reference number
  return n.length >= 15;
};

const baseAddr = (a: string) => a.replace(/\+[^@]*@/, "@").toLowerCase();

/* v27: does this person read the case in Service CRM? If so, Cc'ing them the
   same thread spends a SendGrid message for nothing. Membership of the staff
   set == holds a NiRM login, so colleagues WITHOUT an account keep getting
   mailed exactly as before. */
const hasCrmLogin = (a: string, staff: Set<string>) =>
  staff.has((a ?? "").toLowerCase()) || staff.has(baseAddr(a ?? ""));

function isShopBox(addr: string, cfg: Cfg | null, staff: Set<string>): boolean {
  const a = (addr ?? "").toLowerCase().trim();
  if (!a.endsWith("@crea.asia")) return PARSE_BOX.test(a);
  if (staff.has(a) || staff.has(baseAddr(a))) return false;
  const known: string[] = cfg?.shopMailboxes ?? [];
  if (known.includes(a) || known.includes(baseAddr(a))) return true;
  const lp = a.split("@")[0].split("+")[0];
  return !/^[a-z]+\.[a-z]$/.test(lp);
}
function pickShopBox(line: string, cfg: Cfg | null, staff: Set<string>): string | null {
  for (const a of splitAddrs(line)) if (isShopBox(a, cfg, staff) && !PARSE_BOX.test(a)) return baseAddr(a);
  return null;
}

function boxFromEnvelope(raw: string): string | null {
  if (!raw) return null;
  let to: unknown;
  try { to = JSON.parse(raw)?.to; } catch { return null; }
  const list = Array.isArray(to) ? to : (typeof to === "string" ? [to] : []);
  for (const entry of list) {
    const a = addrOf(String(entry ?? ""));
    if (!PARSE_BOX.test(a)) continue;
    const lp = a.split("@")[0].split("+")[0].trim();
    if (lp) return `${lp.toLowerCase()}@crea.asia`;
  }
  return null;
}

function platformOf(sender: string, subject: string): string {
  const s = `${sender} ${subject}`.toLowerCase();
  if (/shopee/.test(s)) return "shopee";
  if (/lazada|lazmall/.test(s)) return "lazada";
  if (/tiktok/.test(s)) return "tiktok";
  if (/line/.test(s)) return "line";
  return "other";
}

function agentOf(cfg: Cfg | null, agentKey: string, agentName: string) {
  const agents = cfg?.byAgent ?? {};
  return agents[(agentKey ?? "").toLowerCase()] ?? agents[agentName] ?? {};
}

function detailsFor(cfg: Cfg | null, box: string, agentKey: string, agentName: string) {
  const base = agentOf(cfg, agentKey, agentName) ?? {};
  const over = (base.boxes ?? {})[box] ?? (base.boxes ?? {})[baseAddr(box)] ?? {};
  const me: Record<string, any> = { ...base, ...over };
  delete me.boxes;
  return me;
}

function resolveSig(cfg: Cfg | null, mailbox: string, agentKey: string, agentName: string): string {
  if (!cfg || cfg.enabled === false) return "";
  const box = baseAddr(mailbox || FALLBACK_BOX);
  const me = detailsFor(cfg, box, agentKey, agentName);
  let shell = "";
  if (me.mode === "custom" && me.custom) shell = String(me.custom);
  else {
    const templates: any[] = Array.isArray(cfg.templates) ? cfg.templates : [];
    const wanted = me.templateId || cfg.defaultTemplate;
    shell = String(templates.find((x) => x.id === wanted)?.body ?? templates[0]?.body ?? cfg.default ?? "");
  }
  if (!shell) return "";
  const brand = cfg.brandByMailbox?.[box] ?? "CREA Customer Care";
  const name = me.name || agentName || "Customer Care";
  return shell
    .replace(/\{\{\s*(name|agent)\s*\}\}/gi, name)
    .replace(/\{\{\s*role\s*\}\}/gi, me.role || "Customer Care")
    .replace(/\{\{\s*phone\s*\}\}/gi, me.phone || "")
    .replace(/\{\{\s*mailbox\s*\}\}/gi, box)
    .replace(/\{\{\s*brand\s*\}\}/gi, brand)
    .split("\n").map((l) => l.replace(/\s*·\s*$/, "").replace(/^\s*·\s*/, "").trimEnd())
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function sigHtml(cfg: Cfg | null, sigText: string, box = ""): string {
  if (!sigText) return "";
  const lines = sigText.split("\n").filter((l) => l.trim() !== "" && !/^-{2,}$/.test(l.trim()));
  if (!lines.length) return "";
  const lg = (cfg?.logoByMailbox ?? {})[baseAddr(box || "")] ?? {};
  const lgUrl = lg.url ?? cfg?.logoUrl;
  const lgW = Number(lg.width) || Number(cfg?.logoWidth) || 150;
  const body = lines.map((l, i) => {
    const safe = esc(l).replace(/(https?:\/\/\S+|www\.\S+)/gi,
      (u) => `<a href="${u.startsWith("http") ? u : "https://" + u}" style="color:#0D9488;text-decoration:none">${u}</a>`);
    if (i === 0) return `<div style="font-size:15px;font-weight:700;color:#0F172A;padding-bottom:2px">${safe}</div>`;
    if (i === 1) return `<div style="font-size:12px;font-weight:600;color:#0F172A;padding-bottom:4px">${safe}</div>`;
    return `<div style="font-size:12px;color:#475569;line-height:1.5">${safe}</div>`;
  }).join("");

  const logo = lgUrl
    ? `<td style="padding-right:14px;vertical-align:top"><img src="${esc(String(lgUrl))}" width="${lgW}" alt="" style="display:block;border:0;max-width:${lgW}px"></td>`
    : "";
  const border = logo ? "border-left:2px solid #0D9488;padding-left:14px;" : "";
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;font-family:Arial,Helvetica,sans-serif">`
    + `<tr>${logo}<td style="${border}vertical-align:top">${body}</td></tr></table>`;
}

const bodyHtml = (text: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0F172A;line-height:1.6;white-space:pre-wrap">${
    esc(text ?? "").replace(/\n/g, "<br>")}</div>`;

function withSignature(body: string, sig: string): string {
  if (!sig) return body;
  const b = (body ?? "").replace(/\s+$/, "");
  if (b.replace(/\s+/g, " ").endsWith(sig.replace(/\s+/g, " "))) return b;
  return `${b}\n\n${sig}`;
}

const AUTO_SENDER = /(^|[.@_-])(no-?reply|do-?not-?reply|noreply|mailer-daemon|postmaster|notification|notifications|alert|alerts|info|newsletter|marketing|system|auto|robot|bot)([.@_-]|$)|@(.*\.)?(shopee|lazada|tiktok|shope{2}mail|lazmall|linecorp|line\.me|facebookmail|tracking\.|mailer\.)/i;
const isAutomated = (sender: string, headersRaw: string) =>
  AUTO_SENDER.test(sender) ||
  /^(Auto-Submitted:\s*auto-|X-Auto-Response-Suppress:|Precedence:\s*(bulk|list|junk))/im.test(headersRaw ?? "") ||
  /^List-Unsubscribe:/im.test(headersRaw ?? "");

const bytesToBin = (u: Uint8Array) => {
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < u.length; i += CH) s += String.fromCharCode(...u.subarray(i, i + CH));
  return s;
};
const binToBytes = (s: string) => {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
};

/* v28: the filename, decoded properly. Three shapes turn up in real mail:
     filename*=UTF-8''%E0%B8%82%E0%B8%AD%E2%80%A6   (RFC 2231)
     filename="=?UTF-8?B?4Lia4Li04Lil?="           (RFC 2047 encoded word)
     filename="<raw UTF-8 bytes>"                  (what SendGrid mostly sends)
   The last one is what was breaking: the header block is a byte string, so the
   name arrived one byte per character. */
function decodeWord(s: string): string {
  return (s ?? "").replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (whole, cs, enc, txt) => {
    try {
      const bin = String(enc).toUpperCase() === "B"
        ? atob(String(txt).replace(/\s+/g, ""))
        : String(txt).replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
      return new TextDecoder(String(cs).toLowerCase()).decode(binToBytes(bin));
    } catch { return whole; }
  });
}
function fileNameFrom(head: string): string {
  const ext = head.match(/filename\*\s*=\s*([^\r\n;]+)/i)?.[1]?.trim();
  if (ext) {
    const m = ext.replace(/^"|"$/g, "").match(/^([\w.-]*)'([\w-]*)'(.*)$/);
    if (m) { try { return decodeURIComponent(m[3]); } catch { /* fall through */ } }
  }
  const raw = head.match(/filename="([^"]*)"/i)?.[1] ?? head.match(/filename=([^\r\n;]+)/i)?.[1] ?? "";
  return decodeWord(decodeSmart(raw, "utf-8")).trim();
}

function parseMultipart(bin: string, boundary: string) {
  const fields: Record<string, string> = {};
  const files: { field: string; name: string; type: string; data: Uint8Array }[] = [];
  for (const part of bin.split("--" + boundary)) {
    const hEnd = part.indexOf("\r\n\r\n");
    if (hEnd < 0) continue;
    const head = part.slice(0, hEnd);
    let body = part.slice(hEnd + 4);
    if (body.endsWith("\r\n")) body = body.slice(0, -2);
    const nameM = head.match(/name="([^"]*)"/i);
    if (!nameM) continue;
    const fileM = head.match(/filename\*?=/i);
    if (fileM) {
      const typeM = head.match(/Content-Type:\s*([^\r\n;]+)/i);
      files.push({ field: nameM[1], name: fileNameFrom(head), type: (typeM?.[1] ?? "").trim(), data: binToBytes(body) });
    } else fields[nameM[1]] = body;
  }
  return { fields, files };
}
const badScore = (s: string) => {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c === 0xfffd) n += 3;
    else if (c < 32 && c !== 9 && c !== 10 && c !== 13) n += 2;
  }
  return n;
};
function decodeSmart(raw: string | undefined, declared: string) {
  if (raw == null) return "";
  const bytes = binToBytes(raw);
  const tryCs = (cs: string) => { try { return new TextDecoder(cs).decode(bytes); } catch { return null; } };
  const cands: string[] = [];
  const d = tryCs((declared || "utf-8").toLowerCase());
  if (d != null) cands.push(d);
  if ((declared || "utf-8").toLowerCase() !== "utf-8") { const u = tryCs("utf-8"); if (u != null) cands.push(u); }
  const th = tryCs("windows-874");
  if (th != null) cands.push(th);
  if (!cands.length) return raw;
  cands.sort((a, b) => badScore(a) - badScore(b));
  return cands[0];
}
const htmlToText = (h: string) => h
  .replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
  .replace(/<img[^>]*>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();
  if (req.method === "OPTIONS") return new Response("ok", { headers: J });

  if (req.method === "POST" && path === "inbound") {
    if (!HOOK_TOKEN || url.searchParams.get("token") !== HOOK_TOKEN)
      return new Response("forbidden", { status: 403 });

    const boundary = (req.headers.get("content-type") ?? "").match(/boundary="?([^";]+)"?/)?.[1];
    if (!boundary) return new Response(JSON.stringify({ error: "not multipart" }), { status: 400, headers: J });
    const bin = bytesToBin(new Uint8Array(await req.arrayBuffer()));
    const { fields, files } = parseMultipart(bin, boundary);

    let charsets: Record<string, string> = {};
    try { charsets = JSON.parse(decodeSmart(fields["charsets"], "utf-8") || "{}"); } catch { /* ignore */ }
    const F = (k: string) => decodeSmart(fields[k], charsets[k] ?? "utf-8");

    /* v28: SendGrid also sends attachment-info as JSON, and that field goes
       through the same charset decoding as the body — so when it carries a
       filename it is the most trustworthy source of all. */
    let attInfo: Record<string, { filename?: string }> = {};
    try { attInfo = JSON.parse(F("attachment-info") || "{}"); } catch { /* ignore */ }

    const from = F("from");
    const to = F("to");
    const envelopeRaw = F("envelope");
    const subject = repairThai(F("subject"));
    const text = stripCid(repairThai(F("text") || htmlToText(F("html"))));
    const headersRaw = F("headers");
    const ccField = F("cc") || headersRaw.match(/^Cc:\s*([\s\S]*?)(?=^\S|$)/im)?.[1] || "";

    const msgId = headersRaw.match(/^Message-ID:\s*(<[^>]+>)/im)?.[1] ?? null;
    const refs = [
      ...msgids(headersRaw.match(/^In-Reply-To:\s*(.+)$/im)?.[1] ?? ""),
      ...msgids(headersRaw.match(/^References:\s*([\s\S]*?)(?=^\S|$)/im)?.[1] ?? ""),
    ];
    const sender = addrOf(from);
    const senderName = repairThai(nameOf(from)) || sender;

    const { cfg, staff, groups } = await config();
    const envBox = boxFromEnvelope(envelopeRaw);
    const toBox = pickShopBox(to, cfg, staff);
    const ccBox = pickShopBox(ccField, cfg, staff);
    const ourBox = envBox ?? toBox ?? ccBox ?? FALLBACK_BOX;

    const echoed = new RegExp(`^${NIRM_HDR}:`, "im").test(headersRaw ?? "");
    const selfAddressed = !!sender && sender === ourBox;
    if (echoed || selfAddressed) {
      return new Response(JSON.stringify({
        ok: true, skipped: echoed ? "own-outbound" : "self-addressed", ourBox, sender,
      }), { headers: J });
    }

    if (msgId) {
      const { data: dupe } = await supa.from("messages")
        .select("id, ticket_id").eq("external_id", msgId).eq("direction", "in")
        .eq("meta->>ourBox", ourBox).limit(1).maybeSingle();
      if (dupe) {
        return new Response(JSON.stringify({ ok: true, skipped: "duplicate", ticket: dupe.ticket_id, ourBox }), { headers: J });
      }
    }

    const brand = cfg?.brandByMailbox?.[ourBox] ?? "CREA";
    const automated = isAutomated(sender, headersRaw);
    const inTo = envBox ? splitAddrs(to).map(baseAddr).includes(envBox) : !!toBox;
    const inCc = envBox ? splitAddrs(ccField).map(baseAddr).includes(envBox) : !!ccBox;
    const ccOnly = (cfg?.requireToMatch !== false) && !inTo && inCc;

    let ticketId: number | null = null;
    if (refs.length) {
      const { data: refMsgs } = await supa.from("messages")
        .select("ticket_id, tickets!inner(meta)").in("external_id", refs).limit(10);
      for (const r of refMsgs ?? []) {
        const tBox = (r as any)?.tickets?.meta?.ourBox ?? null;
        if (!tBox || deskOf(tBox, groups) === deskOf(ourBox, groups)) { ticketId = (r as any).ticket_id; break; }
      }
    }
    if (!ticketId) {
      /* v31: the topic carries the case. The sender is no longer required to
         match — a colleague forwarding the same thread, or the brand replying
         from a different address, belongs on the case that already exists.
         Two things still hold it back: the case must be open (a resolved topic
         starts fresh, as it always did), and an indistinct subject must still
         agree on the sender, so unrelated customers cannot collide. */
      const distinct = distinctiveSubject(subject);
      const wanted = norm(subject);
      const mine = deskOf(ourBox, groups);
      const { data } = await supa.from("tickets")
        .select("id,subject,meta,customer_email").eq("channel", "email")
        .in("status", ["new", "open", "pending", "waiting_brand", "waiting_internal", "escalated"])
        .order("created_at", { ascending: false }).limit(300);
      ticketId = (data ?? []).find((t) => {
        if (norm(t.subject ?? "") !== wanted) return false;
        const tBox = (t as any)?.meta?.ourBox ?? null;
        if (tBox && deskOf(tBox, groups) !== mine) return false;
        if (!distinct) return String((t as any).customer_email ?? "").toLowerCase() === sender;
        return true;
      })?.id ?? null;
    }
    const existing = !!ticketId;

    if (automated && !existing) {
      await supa.from("platform_notifications").insert({
        our_box: ourBox, sender, sender_name: senderName,
        subject: subject || "(no subject)", body: text, external_id: msgId,
        platform: platformOf(sender, subject),
        meta: { to, ...(ccField ? { cc: ccField.trim() } : {}), ...(envBox ? { viaEnvelope: true } : {}) },
      });
      return new Response(JSON.stringify({
        ok: true, skipped: "platform-notification", ourBox, platform: platformOf(sender, subject),
      }), { headers: J });
    }

    const quiet = ccOnly && !existing;

    let reopened = false;
    if (!ticketId) {
      const ins = await supa.from("tickets").insert({
        brand, channel: "email",
        customer_name: senderName, customer_email: sender,
        subject: subject || "(no subject)",
        email_root_msgid: msgId,
        meta: { ourBox },
        ...(quiet ? { status: "resolved", resolved_at: new Date().toISOString() } : {}),
      }).select("id").single();
      ticketId = ins.data!.id;
    } else if (!quiet) {
      const { data: t } = await supa.from("tickets").select("status").eq("id", ticketId).single();
      if (["resolved", "closed"].includes(t!.status)) reopened = true;
      await supa.from("tickets").update({
        status: "open", ...(reopened ? { reopened: true, resolved_at: null, closed_at: null } : {}),
      }).eq("id", ticketId);
    }

    const seen = new Set<string>();
    if (existing) {
      const { data: prior } = await supa.from("messages")
        .select("meta").eq("ticket_id", ticketId).limit(500);
      for (const row of prior ?? []) {
        for (const a of ((row as any)?.meta?.attachments ?? [])) {
          if (a?.sha) seen.add("sha:" + a.sha);
          if (a?.name != null && a?.size != null) seen.add(`ns:${a.name}:${a.size}`);
        }
      }
    }

    const atts: { name: string; path: string; size: number; type: string; sha: string }[] = [];
    const stamp = Date.now();
    let attIdx = 0;
    let skippedDupes = 0;
    for (const f of files) {
      if (!/^attachment\d+$/.test(f.field)) continue;
      if (f.data.byteLength === 0 || f.data.byteLength > MAX_ATT) continue;
      // v28: attachment-info wins when it has a name; the header fallback is
      // already decoded by fileNameFrom()
      const shownName = (attInfo[f.field]?.filename ?? "").trim() || f.name || "file";
      const sha = await sha256Hex(f.data);
      const nsKey = `ns:${shownName}:${f.data.byteLength}`;
      if (seen.has("sha:" + sha) || seen.has(nsKey)) { skippedDupes++; continue; }
      seen.add("sha:" + sha); seen.add(nsKey);
      attIdx++;
      const p = `${ticketId}/in-${stamp}/${attIdx}-${safeName(shownName)}`;
      const up = await supa.storage.from(BUCKET).upload(p, new Blob([f.data]), { contentType: f.type || "application/octet-stream", upsert: true });
      if (!up.error) atts.push({ name: shownName, path: p, size: f.data.byteLength, type: f.type || "", sha });
      else console.error(`attachment upload failed: ticket=${ticketId} path=${p} err=${up.error.message}`);
    }

    const insMsg = await supa.from("messages").insert({
      ticket_id: ticketId, direction: "in", channel: "email",
      body: text, external_id: msgId,
      meta: { from, to, subject, charsets, ourBox, ...(envBox ? { viaEnvelope: true } : {}),
              ...(ccField ? { cc: ccField.trim() } : {}),
              ...(ccOnly ? { ccOnly: true } : {}), ...(automated ? { automated: true } : {}),
              ...(atts.length ? { attachments: atts } : {}) },
    });
    /* v30: the select above cannot stop two simultaneous deliveries of the same
       mail — both look unique, both insert, and the customer's email shows
       twice on the case. The unique index on (external_id, ourBox) is what
       actually stops it. Losing that race is success, not an error: answering
       500 here would only make SendGrid retry a message we are refusing on
       purpose. */
    if (insMsg.error) {
      if ((insMsg.error as any).code === "23505")
        return new Response(JSON.stringify({ ok: true, skipped: "duplicate-race", ticket: ticketId, ourBox }), { headers: J });
      console.error(`inbound insert failed: ticket=${ticketId} box=${ourBox} err=${insMsg.error.message}`);
      return new Response(JSON.stringify({ error: "insert", detail: insMsg.error.message }), { status: 500, headers: J });
    }
    return new Response(JSON.stringify({ ok: true, ticket: ticketId, ourBox, envBox, brand, reopened, automated, ccOnly, quiet, attachments: atts.length, skippedDuplicateAttachments: skippedDupes }), { headers: J });
  }

  if (req.method === "GET" && path === "recipients") {
    const ticketId = Number(url.searchParams.get("ticketId"));
    if (!ticketId) return new Response(JSON.stringify({ error: "ticketId required" }), { status: 400, headers: J });
    const { cfg, staff } = await config();
    const { data: tk } = await supa.from("tickets").select("customer_email, meta").eq("id", ticketId).single();
    const { data: lastIn } = await supa.from("messages")
      .select("meta").eq("ticket_id", ticketId).eq("direction", "in")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const to = (tk?.customer_email ?? "").toLowerCase();
    const line = `${lastIn?.meta?.to ?? ""} , ${lastIn?.meta?.cc ?? ""}`;
    /* v27: colleagues with a CRM login are not offered as Cc chips — they read
       the case in Service CRM, so mailing them only spends send quota. */
    const cc = [...new Set(splitAddrs(line))]
      .filter((a) => a !== to && !isShopBox(a, cfg, staff) && !hasCrmLogin(a, staff));
    let pinned: string[] = [];
    if (to) {
      const { data: pin } = await supa.from("customer_cc").select("cc").eq("email", to).maybeSingle();
      pinned = (Array.isArray(pin?.cc) ? pin!.cc : [])
        .map((a: unknown) => String(a).toLowerCase().trim())
        .filter((a: string) => /@/.test(a) && a !== to && !isShopBox(a, cfg, staff) && !hasCrmLogin(a, staff));
    }
    const mailbox = (tk as any)?.meta?.ourBox ?? lastIn?.meta?.ourBox ?? pickShopBox(line, cfg, staff) ?? FALLBACK_BOX;

    /* v30: who actually wrote on this case. The Cc chips are built from the
       last inbound's To and Cc lines, so a correspondent who only ever appears
       as a From — Mars's contact@sea.mars.com, for one — could not be offered
       at all, and the reply-to stayed whatever opened the case. */
    const { data: inbounds } = await supa.from("messages")
      .select("meta").eq("ticket_id", ticketId).eq("direction", "in")
      .order("created_at", { ascending: false }).limit(30);
    const senders = [...new Set((inbounds ?? [])
      .map((r) => addrOf(String((r as any)?.meta?.from ?? "")))
      .filter((a) => EMAIL_RE.test(a)))]
      .filter((a) => !isShopBox(a, cfg, staff) && !hasCrmLogin(a, staff));
    const suggestedTo = senders.find((a) => a !== to) ?? "";

    return new Response(JSON.stringify({ to, cc, pinned, mailbox, senders, suggestedTo }), { headers: J });
  }

  if (req.method === "GET" && path === "signature") {
    const { cfg } = await config();
    const mailbox = url.searchParams.get("mailbox") ?? "";
    const agent = url.searchParams.get("agent") ?? "";
    const key = url.searchParams.get("agentKey") ?? agent;
    const sig = resolveSig(cfg, mailbox, key, agent);
    return new Response(JSON.stringify({ signature: sig, html: sigHtml(cfg, sig, mailbox), logoUrl: ((cfg?.logoByMailbox ?? {})[baseAddr(mailbox)]?.url ?? cfg?.logoUrl) ?? "" }), { headers: J });
  }

  if (req.method === "GET" && path === "sig-config") {
    const { cfg } = await config();
    return new Response(JSON.stringify(cfg ?? {}), { headers: J });
  }

  if (req.method === "POST" && path === "send") {
    const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const { data: who } = await supa.auth.getUser(jwt);
    if (!who?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: J });
    if (!SG_KEY) return new Response(JSON.stringify({ error: "SENDGRID_API_KEY not set" }), { status: 503, headers: J });

    const { ticketId, body, fromAddress, fromName, agentName, agentKey, attachments, replyAll, cc: ccIn, pinCc, noSignature, to: toIn } = await req.json();
    const { cfg, staff } = await config();

    const { data: tk } = await supa.from("tickets")
      .select("id,customer_email,subject,email_root_msgid,meta").eq("id", ticketId).single();
    if (!tk?.customer_email) return new Response(JSON.stringify({ error: "no recipient on ticket" }), { status: 400, headers: J });

    const { data: lastIn } = await supa.from("messages")
      .select("external_id, meta").eq("ticket_id", ticketId).eq("direction", "in")
      .not("external_id", "is", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    /* v30: the To for THIS message. Accepts one address or several. It is not
       written back to the ticket on purpose — an agent correcting a recipient
       for one reply should not silently redirect everyone else's replies, and
       a case whose stored address is genuinely wrong is a separate decision.
       A refusal is explicit: an unusable address comes back as 400 with the
       reason, rather than quietly falling back to the old recipient and
       looking like it worked. */
    const toRaw = Array.isArray(toIn) ? toIn : (toIn ? String(toIn).split(/[,;]/) : []);
    const toWanted = [...new Set(toRaw.map((a: unknown) => String(a).toLowerCase().trim()).filter(Boolean))];
    let toList: string[] = [tk.customer_email.toLowerCase()];
    if (toWanted.length) {
      const bad = toWanted.filter((a) => !EMAIL_RE.test(a));
      if (bad.length)
        return new Response(JSON.stringify({ error: "bad-to", detail: `not a valid email address: ${bad.join(", ")}` }), { status: 400, headers: J });
      const ours = toWanted.filter((a) => isShopBox(a, cfg, staff) || PARSE_BOX.test(a));
      if (ours.length)
        return new Response(JSON.stringify({ error: "bad-to", detail: `${ours.join(", ")} — that is one of our own mailboxes, the reply would come straight back to us` }), { status: 400, headers: J });
      toList = toWanted.slice(0, 20);
    }
    const toAddr = toList[0];
    const toSet = new Set(toList);
    const overridden = toWanted.length > 0 && (toList.length !== 1 || toAddr !== tk.customer_email.toLowerCase());

    let ccList: string[] = [];
    if (Array.isArray(ccIn) && ccIn.length) ccList = ccIn.map((a: string) => String(a).toLowerCase().trim());
    else if (replyAll) ccList = splitAddrs(`${lastIn?.meta?.to ?? ""} , ${lastIn?.meta?.cc ?? ""}`);
    /* v27: drop CRM-login colleagues here too, so an older browser tab that
       still sends their chips cannot spend quota on them. */
    const ccBefore = new Set(ccList).size;
    ccList = [...new Set(ccList)]
      .filter((a) => /@/.test(a) && !toSet.has(a) && !isShopBox(a, cfg, staff) && !hasCrmLogin(a, staff))
      .slice(0, 50);
    const ccSavedByCrm = Math.max(0, ccBefore - ccList.length);

    const hinted = String(fromAddress ?? "").toLowerCase();
    const fromBox = (hinted.endsWith("@crea.asia") && !PARSE_BOX.test(hinted) && isShopBox(hinted, cfg, staff))
      ? baseAddr(hinted)
      : ((tk as any)?.meta?.ourBox ?? lastIn?.meta?.ourBox ?? pickShopBox(`${lastIn?.meta?.to ?? ""} , ${lastIn?.meta?.cc ?? ""}`, cfg, staff) ?? FALLBACK_BOX);

    const sig = noSignature ? "" : resolveSig(cfg, fromBox, agentKey ?? who.user.email ?? "", agentName ?? "");
    const bodyOut = withSignature(body ?? "", sig);
    const brandName = cfg?.brandByMailbox?.[fromBox];

    const headers: Record<string, string> = { [NIRM_HDR]: String(ticketId) };
    if (lastIn?.external_id) {
      headers["In-Reply-To"] = lastIn.external_id;
      headers["References"] = [tk.email_root_msgid, lastIn.external_id].filter(Boolean).join(" ");
    }

    const sgAtts: { content: string; filename: string; type?: string; disposition: string }[] = [];
    const recAtts: { name: string; path: string; size: number; type: string }[] = [];
    const attErrors: string[] = [];
    for (const a of (attachments ?? []).slice(0, 10)) {
      const dl = await supa.storage.from(BUCKET).download(a.path);
      if (dl.error || !dl.data) { attErrors.push(`${a.path}: ${dl.error?.message ?? "no data"}`); continue; }
      const buf = new Uint8Array(await dl.data.arrayBuffer());
      if (buf.byteLength > MAX_ATT) { attErrors.push(`${a.path}: too large`); continue; }
      sgAtts.push({ content: btoa(bytesToBin(buf)), filename: a.name, type: a.type || undefined, disposition: "attachment" });
      recAtts.push({ name: a.name, path: a.path, size: buf.byteLength, type: a.type || "" });
    }

    const subjOut = lastIn?.external_id
      ? (/^re:/i.test(tk.subject ?? "") ? tk.subject : `Re: ${tk.subject}`)
      : (tk.subject ?? "");

    const wantHtml = cfg?.html !== false;
    const content: { type: string; value: string }[] = [{ type: "text/plain", value: bodyOut }];
    if (wantHtml) content.push({ type: "text/html", value: `${bodyHtml(body ?? "")}${sigHtml(cfg, sig, fromBox)}` });

    const sg = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${SG_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{
          to: toList.map((email) => ({ email })),
          ...(ccList.length ? { cc: ccList.map((email) => ({ email })) } : {}),
        }],
        from: { email: fromBox, name: brandName ? `${brandName} Customer Care` : (fromName ?? "CREA Customer Care") },
        subject: subjOut,
        content,
        headers,
        ...(sgAtts.length ? { attachments: sgAtts } : {}),
      }),
    });
    if (!sg.ok) {
      const err = await sg.text();
      console.error(`sendgrid rejected /send: ticket=${ticketId} from=${fromBox} to=${toList.join(",")} recipients=${toList.length + ccList.length} status=${sg.status} detail=${err.slice(0, 400)}`);
      return new Response(JSON.stringify({ error: "sendgrid", detail: err.slice(0, 400) }), { status: 502, headers: J });
    }
    console.log(`sent ticket=${ticketId} recipients=${toList.length + ccList.length} toOverride=${overridden} ccDroppedCrmUsers=${ccSavedByCrm}`);

    if (Array.isArray(pinCc)) {
      const clean = [...new Set(pinCc.map((a: string) => String(a).toLowerCase().trim()))]
        .filter((a) => EMAIL_RE.test(a) && !toSet.has(a) && !isShopBox(a, cfg, staff) && !hasCrmLogin(a, staff))
        .slice(0, 20);
      if (clean.length) await supa.from("customer_cc").upsert({ email: tk.customer_email.toLowerCase(), cc: clean, updated_at: new Date().toISOString() });
      else await supa.from("customer_cc").delete().eq("email", tk.customer_email.toLowerCase());
    }

    await supa.from("messages").insert({
      ticket_id: ticketId, direction: "out", channel: "email",
      author: agentName ?? who.user.email, body: bodyOut,
      external_id: `<svcr-${ticketId}-${Date.now()}@crea.local>`,
      meta: {
        to: toList.join(", "), from: fromBox,
        ...(overridden ? { toOverride: true } : {}),
        ...(ccList.length ? { cc: ccList.join(", ") } : {}),
        ...(sig ? { signed: true } : {}),
        ...(wantHtml ? { html: true } : {}),
        ...(recAtts.length ? { attachments: recAtts } : {}),
        ...(attErrors.length ? { att_errors: attErrors } : {}),
      },
    });
    await supa.from("tickets").update({ status: "pending" }).eq("id", ticketId);
    return new Response(JSON.stringify({ ok: true, from: fromBox, to: toList, cc: ccList, toOverride: overridden, signed: !!sig, html: wantHtml, attachments: recAtts.length, ccDroppedCrmUsers: ccSavedByCrm, ...(attErrors.length ? { att_errors: attErrors } : {}) }), { headers: J });
  }

  return new Response(JSON.stringify({ error: "not found" }), { headers: J, status: 404 });
});
