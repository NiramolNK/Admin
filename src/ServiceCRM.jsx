import React, { useState, useEffect, useMemo, useRef, useContext, createContext } from "react";
import {
  LayoutDashboard, Inbox, Ticket, Users, BookOpen, BarChart3, UserCog, Settings,
  Bell, Search, Plus, Download, LogOut, Phone, X, Clock, CheckCircle2, AlertTriangle,
  Send, StickyNote, Star, ChevronRight, Save, UserPlus, Zap, Timer, Languages,
  MessageSquare, Mail, ShoppingBag, Smartphone, Tag, ArrowUpRight, Copy, Edit3,
  ShieldCheck, Repeat, ThumbsUp, Paperclip, Globe,
  PhoneCall, PhoneOff, PhoneIncoming, PhoneOutgoing, PhoneMissed, Mic, MicOff,
  Pause, Play, Delete, Grid3x3, Radio, Server, Headphones, Link2,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar, Legend, AreaChart, Area,
} from "recharts";
import * as XLSX from "xlsx";
import { supabase } from "./supabase.js";

/* ── live-channel wiring (P1: email) ─────────────────────────────
   Real cases live in Supabase (tickets + messages, fed by the
   `email` edge function). They merge in front of the demo seeds,
   refresh every 20s, and replies go out through /email/send.     */
const FN_BASE = "https://bequrilwgooesolepubv.supabase.co/functions/v1";
const EMAIL_FROM = "cs.solution@crea.asia";        // SendGrid-verified single sender
const EMAIL_FROM_NAME = "CREA Customer Care";
const biText = (s) => ({ en: s ?? "", th: s ?? "" });
const ATT_BUCKET = "ticket-attachments";
// our own support mailboxes — used to pick the right From address and signature
// out of a To/Cc line that may also list a dozen colleagues
const SUPPORT_MAILBOXES = ["cs.solution@crea.asia", "enfa.cs@crea.asia", "nestlepro.cs@crea.asia"];

/* ── attachment renderer: images show inline as thumbnails, other files as chips ── */
function AttThumb({ a, onOpen }) {
  const [url, setUrl] = useState(null);
  const isImg = /^image\//i.test(a.type || "") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.name || "");
  useEffect(() => {
    let live = true;
    if (isImg && a.path) supabase.storage.from(ATT_BUCKET).createSignedUrl(a.path, 3600)
      .then(({ data }) => { if (live && data?.signedUrl) setUrl(data.signedUrl); }).catch(() => {});
    return () => { live = false; };
  }, [a.path]);
  if (isImg && url) return (
    <img src={url} alt={a.name} title={a.name} onClick={onOpen} loading="lazy"
         style={{ maxWidth: 240, maxHeight: 180, borderRadius: 10, cursor: "pointer", display: "block", border: "1px solid rgba(127,127,127,.25)" }} />
  );
  return (
    <button onClick={onOpen} className="flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-lg" style={{ background: "rgba(127,127,127,.14)", cursor: "pointer" }}>
      <Paperclip size={10} />{a.name}
    </button>
  );
}

/* ── new-message chime (WebAudio, no asset needed) ── */
let _chimeCtx;
function playChime() {
  try {
    _chimeCtx = _chimeCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (_chimeCtx.state === "suspended") _chimeCtx.resume();
    const t0 = _chimeCtx.currentTime;
    [[880, 0], [1318.5, 0.12]].forEach(([f, d]) => {
      const o = _chimeCtx.createOscillator(), g = _chimeCtx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.5);
      o.connect(g); g.connect(_chimeCtx.destination);
      o.start(t0 + d); o.stop(t0 + d + 0.55);
    });
  } catch (e) { /* audio blocked — badge + toast still show */ }
}

/* ── native browser notification (shows even when the tab is in background) ── */
function notifyDesktop(title, body) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const n = new Notification(title, { body, icon: "/favicon.ico", tag: "crm-inbox" });
    n.onclick = () => { window.focus(); n.close(); };
  } catch (e) { /* ignore */ }
}

/* ══════════ 3CX telephony bridge ══════════
   The `telephony` edge function receives call events from 3CX and stores them in
   public.call_events. The CRM polls that table every 3s and pops the incoming-call
   card. Until the 3CX PRO licence is active you can drive it with the
   "Simulate incoming call" button in the Calls tab. */
const TEL_BASE = FN_BASE + "/telephony";
const TEL_TOKEN = "nirm3cx_7fk2p9qzx4m8vc1ade6b";

/* 0922634562 / +66922634562 / 66-92-263-4562 all compare equal */
const phoneKey = (v) => {
  if (!v) return "";
  let n = String(v).replace(/[^0-9+]/g, "").replace(/^\+/, "");
  if (n.startsWith("66") && n.length >= 11) n = "0" + n.slice(2);
  return n;
};

/* soft two-tone ring, repeats while the card is up */
function ringTone() {
  try {
    _chimeCtx = _chimeCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = _chimeCtx.currentTime;
    [0, 0.42].forEach((d) => {
      const o = _chimeCtx.createOscillator(), g = _chimeCtx.createGain();
      o.type = "sine"; o.frequency.value = 620;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + d + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.34);
      o.connect(g); g.connect(_chimeCtx.destination);
      o.start(t0 + d); o.stop(t0 + d + 0.36);
    });
  } catch (e) { /* autoplay blocked — the card still shows */ }
}

/* ══════════ collision prevention ══════════
   Every agent with a case open heartbeats into public.case_viewers every 10s and
   flips to "typing" while the reply box has text. Rows self-expire after 45s, so
   a closed laptop clears itself. Returns the OTHER people in this case. */
function useCaseViewers(ticketKey, me, typing) {
  const [others, setOthers] = useState([]);

  useEffect(() => {
    if (!ticketKey || !me) return;
    let dead = false;

    const beat = async () => {
      if (dead) return;
      try {
        await supabase.rpc("touch_case_viewer", {
          p_ticket: String(ticketKey), p_agent: String(me.id),
          p_name: tv(me.n), p_action: typing ? "typing" : "viewing",
        });
      } catch (e) { /* offline — next beat retries */ }
    };
    const read = async () => {
      if (dead) return;
      try {
        const cutoff = new Date(Date.now() - 45000).toISOString();
        const { data } = await supabase.from("case_viewers")
          .select("*").eq("ticket_key", String(ticketKey)).gte("updated_at", cutoff);
        if (!dead) setOthers((data || []).filter((v) => String(v.agent_id) !== String(me.id)));
      } catch (e) { /* ignore */ }
    };

    beat(); read();
    const bIv = setInterval(beat, 10000);
    const rIv = setInterval(read, 5000);

    // live push so the banner appears the moment someone else opens the case
    const ch = supabase.channel(`viewers:${ticketKey}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "case_viewers", filter: `ticket_key=eq.${ticketKey}` }, read)
      .subscribe();

    const leave = () => { supabase.rpc("clear_case_viewer", { p_ticket: String(ticketKey), p_agent: String(me.id) }); };
    window.addEventListener("beforeunload", leave);

    return () => {
      dead = true;
      clearInterval(bIv); clearInterval(rIv);
      window.removeEventListener("beforeunload", leave);
      supabase.removeChannel(ch);
      leave();
    };
  }, [ticketKey, me && me.id, typing]);

  return others;
}

/* ══════════ Twilio softphone ══════════
   Real calls, no PBX. The `twilio` edge function issues the access token and
   serves the TwiML; this hook owns the browser Device. The SDK is imported
   lazily so NiRM still builds and runs normally when Twilio isn't set up. */
const TW_BASE = FN_BASE + "/twilio";

function useSoftphone(toast) {
  const [state, setState] = useState("off");     // off | connecting | ready | oncall | error
  const [conn, setConn] = useState(null);        // active Twilio Call
  const [muted, setMuted] = useState(false);
  const [problem, setProblem] = useState("");
  const devRef = useRef(null);

  const goOnline = async () => {
    if (devRef.current) return;
    setState("connecting"); setProblem("");
    try {
      const health = await fetch(`${TW_BASE}/health`).then((r) => r.json());
      if (!health.ready) { setState("error"); setProblem(t("sfNotSetup")); return; }

      // mic permission first — the SDK fails opaquely without it
      try { await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch { setState("error"); setProblem(t("sfMicNeeded")); return; }

      const { data: s } = await supabase.auth.getSession();
      const r = await fetch(`${TW_BASE}/token`, {
        headers: { Authorization: `Bearer ${s?.session?.access_token ?? ""}` },
      });
      const j = await r.json();
      if (!r.ok || !j.token) { setState("error"); setProblem(j.error || "token failed"); return; }

      const { Device } = await import("@twilio/voice-sdk");
      const dev = new Device(j.token, { codecPreferences: ["opus", "pcmu"], logLevel: "error" });

      dev.on("registered", () => setState("ready"));
      dev.on("error", (e) => { setState("error"); setProblem(e?.message || "device error"); });
      dev.on("incoming", (call) => {
        // the screen-pop card drives accept/reject, so just hold the call here
        setConn(call);
        call.on("disconnect", () => { setConn(null); setState("ready"); setMuted(false); });
        call.on("cancel", () => { setConn(null); setState("ready"); });
        call.on("accept", () => setState("oncall"));
      });
      dev.on("tokenWillExpire", async () => {
        const { data: s2 } = await supabase.auth.getSession();
        const rr = await fetch(`${TW_BASE}/token`, { headers: { Authorization: `Bearer ${s2?.session?.access_token ?? ""}` } });
        const jj = await rr.json();
        if (jj.token) dev.updateToken(jj.token);
      });

      await dev.register();
      devRef.current = dev;
    } catch (e) {
      setState("error"); setProblem(String(e?.message || e));
    }
  };

  const goOffline = () => {
    try { devRef.current?.destroy(); } catch (e) { /* already gone */ }
    devRef.current = null; setConn(null); setMuted(false); setState("off");
  };

  const accept = () => { conn?.accept(); setState("oncall"); };
  const reject = () => { try { conn?.reject(); } catch (e) { /* ignore */ } setConn(null); setState("ready"); };
  const hangup = () => { try { conn ? conn.disconnect() : devRef.current?.disconnectAll(); } catch (e) { /* ignore */ } };
  const toggleMute = () => { if (!conn) return; const m = !muted; conn.mute(m); setMuted(m); };

  const dial = async (number) => {
    if (!devRef.current) { toast(t("sfOff"), "error"); return; }
    try {
      const call = await devRef.current.connect({ params: { To: number } });
      setConn(call); setState("oncall");
      call.on("disconnect", () => { setConn(null); setState("ready"); setMuted(false); });
      toast(t("sfDialing", number));
    } catch (e) { toast(String(e?.message || e), "error"); }
  };

  useEffect(() => () => { try { devRef.current?.destroy(); } catch (e) { /* unmount */ } }, []);

  return { state, problem, conn, muted, goOnline, goOffline, accept, reject, hangup, toggleMute, dial };
}

/* Bottom-left status pill + in-call controls */
function SoftphoneBar({ sf }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (sf.state !== "oncall") { setSecs(0); return; }
    const iv = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [sf.state]);

  const tint = sf.state === "oncall" ? "var(--green)" : sf.state === "ready" ? "var(--blue)"
    : sf.state === "error" ? "var(--red)" : "var(--muted)";
  const label = sf.state === "oncall" ? `${t("sfOnCall")} · ${mmss(secs)}`
    : sf.state === "ready" ? t("sfReady")
    : sf.state === "connecting" ? t("sfConnecting")
    : sf.state === "error" ? (sf.problem || t("sfOff")) : t("sfOff");

  return (
    <div className="fixed z-[70]" style={{ left: 18, bottom: 18 }}>
      <div className="card flex items-center gap-2.5 px-3 py-2.5" style={{ maxWidth: 330 }}>
        <span className="dot" style={{ background: tint }} />
        <span className="text-[12.5px] font-semibold truncate" style={{ color: tint }}>{label}</span>
        {sf.state === "oncall" ? (
          <>
            <button className="btn btn-g" style={{ padding: "4px 9px", fontSize: 12 }} onClick={sf.toggleMute}>
              {sf.muted ? t("sfUnmute") : t("sfMute")}
            </button>
            <button className="btn" style={{ padding: "4px 9px", fontSize: 12, background: "var(--red)", color: "#fff" }} onClick={sf.hangup}>
              {t("sfHangup")}
            </button>
          </>
        ) : (
          <button className="btn btn-g ml-1" style={{ padding: "4px 10px", fontSize: 12 }}
                  onClick={sf.state === "off" || sf.state === "error" ? sf.goOnline : sf.goOffline}>
            {sf.state === "off" || sf.state === "error" ? t("sfStart") : t("sfStop")}
          </button>
        )}
      </div>
    </div>
  );
}

/* Supervisor live monitor — every agent currently inside a case, pushed live. */
function LiveMonitor({ tickets, open }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let dead = false;
    const read = async () => {
      if (dead) return;
      try {
        const cutoff = new Date(Date.now() - 45000).toISOString();
        const { data } = await supabase.from("case_viewers")
          .select("*").gte("updated_at", cutoff).order("updated_at", { ascending: false });
        if (!dead) setRows(data || []);
      } catch (e) { /* ignore */ }
    };
    read();
    const iv = setInterval(read, 5000);
    const ch = supabase.channel("live-monitor")
      .on("postgres_changes", { event: "*", schema: "public", table: "case_viewers" }, read)
      .subscribe();
    return () => { dead = true; clearInterval(iv); supabase.removeChannel(ch); };
  }, []);

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--line)" }}>
        <div>
          <h3 className="font-bold text-[15px]">{t("liveNow")}</h3>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--muted)" }}>{t("liveSub")}</p>
        </div>
        <span className="pill" style={{ background: "var(--green-bg)", color: "var(--green)" }}>
          <span className="dot live" style={{ background: "var(--green)" }} />{t("liveOn")}
        </span>
      </div>
      {rows.length === 0
        ? <p className="text-[13px] text-center py-7" style={{ color: "var(--muted)" }}>{t("liveNobody")}</p>
        : (
          <div className="max-h-64 overflow-auto scroll">
            {rows.map((r) => {
              const tk = tickets.find((x) => x.id === r.ticket_key);
              const typing = r.action === "typing";
              return (
                <button key={r.ticket_key + r.agent_id} onClick={() => tk && open(tk)}
                        className="w-full text-left px-5 py-3 border-b hover:bg-slate-50 flex items-center gap-3" style={{ borderColor: "var(--line)" }}>
                  <span className="rounded-full grid place-items-center flex-none font-bold text-[11px]"
                        style={{ width: 28, height: 28, background: typing ? "var(--red-bg)" : "var(--sky)", color: typing ? "var(--red)" : "var(--blue)" }}>
                    {(r.agent_name || "?").charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold truncate">{r.agent_name || r.agent_id}</span>
                    <span className="block text-[11.5px] truncate" style={{ color: "var(--muted)" }}>
                      {r.ticket_key}{tk ? ` — ${subjectOf(tk)}` : ""}
                    </span>
                  </span>
                  <span className="pill flex-none" style={{ background: typing ? "var(--red-bg)" : "var(--slate-bg)", color: typing ? "var(--red)" : "var(--muted)" }}>
                    {typing ? t("colTyping", "").replace("%s", "").trim() || "typing" : "viewing"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
    </div>
  );
}

/* amber strip above the reply box — who else is in here right now */
function CollisionBar({ others }) {
  if (!others.length) return null;
  const typer = others.find((o) => o.action === "typing");
  const msg = typer ? t("colTyping", typer.agent_name || "—")
    : others.length === 1 ? t("colViewing", others[0].agent_name || "—")
    : t("colBoth", others.length);
  return (
    <div className="flex items-center gap-2 px-4 py-2 text-[12.5px] font-semibold"
         style={{ background: typer ? "var(--red-bg)" : "var(--amber-bg)", color: typer ? "var(--red)" : "var(--amber)", borderTop: "1px solid var(--line)" }}>
      <span className="dot" style={{ background: "currentColor" }} />
      {msg}
    </div>
  );
}

/* Incoming-call screen-pop. Mirrors the 3CX client card but adds the CRM context
   3CX can't know: who the caller is and what they already have open with us. */
function IncomingCall({ ev, match, onAnswer, onDecline }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    ringTone();
    const tick = setInterval(() => setSecs((s) => s + 1), 1000);
    const ring = setInterval(ringTone, 3000);
    return () => { clearInterval(tick); clearInterval(ring); };
  }, [ev.id]);

  const name = match.customer ? tv(match.customer) : (ev.caller_name || t("incUnknown"));
  return (
    <div className="fixed z-[95]" style={{ right: 22, bottom: 22, width: 340 }}>
      <div className="card overflow-hidden" style={{ borderColor: "var(--blue)", boxShadow: "0 18px 48px -12px rgba(15,23,42,.45)" }}>
        <div className="px-4 py-3 flex items-center gap-3" style={{ background: "var(--navy)" }}>
          <span className="rounded-full grid place-items-center flex-none ringing" style={{ width: 38, height: 38, background: "rgba(255,255,255,.16)" }}>
            <Phone size={17} color="#fff" />
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-white leading-tight">{t("incCall")}</div>
            <div className="text-[11px]" style={{ color: "#99F6E4" }}>{t("incVia", ev.to_number || "—")} · {mmss(secs)}</div>
          </div>
        </div>

        <div className="px-4 py-3.5">
          <div className="text-[15px] font-bold truncate">{name}</div>
          <div className="text-[12.5px] mt-0.5" style={{ color: "var(--muted)" }}>{ev.from_number || "—"}</div>
          <div className="text-[12px] mt-2 pill" style={{ background: match.open.length ? "var(--amber-bg)" : "var(--sky)", color: match.open.length ? "var(--amber)" : "var(--blue)" }}>
            {match.open.length ? t("incHasCase", match.open.length) : t("incNewCust")}
          </div>
          {match.open.slice(0, 2).map((x) => (
            <p key={x.id} className="text-[11.5px] mt-1.5 truncate" style={{ color: "var(--muted)" }}>• {x.id} — {subjectOf(x)}</p>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 px-4 pb-4">
          <button className="btn btn-d justify-center" onClick={onAnswer}><Phone size={15} />{t("incAnswer")}</button>
          <button className="btn justify-center" style={{ background: "var(--red)", color: "#fff" }} onClick={onDecline}><X size={15} />{t("incDecline")}</button>
        </div>
      </div>
    </div>
  );
}
const safeAttName = (s) => (s || "file").replace(/[^\w.\-\u0E00-\u0E7F ]+/g, "_").slice(0, 120);

function mapDbTicket(t, msgs) {
  return {
    id: "TK-E" + t.id, dbId: t.id,
    catKey: t.category || "inquiry", product: null,
    subject: t.subject || null,
    customer: biText(t.customer_name || t.customer_email || "Customer"),
    phone: t.customer_phone || "", email: t.customer_email || "",
    order: (t.meta && t.meta.order) || null,
    channel: t.channel, priority: t.priority, status: t.status,
    owner: t.owner || null,
    createdAt: new Date(t.created_at).getTime(),
    firstResponseMin: t.first_response_at ? Math.max(1, Math.round((new Date(t.first_response_at) - new Date(t.created_at)) / 60000)) : null,
    resolveMin: t.resolved_at ? Math.max(1, Math.round((new Date(t.resolved_at) - new Date(t.created_at)) / 60000)) : null,
    csat: t.csat ?? null, reopened: !!t.reopened, tags: [],
    // Which of OUR support addresses the customer wrote to. Big Nestlé/Enfa
    // threads list a dozen colleagues in To/Cc, so we can't just take the first
    // address — scan the whole line for a known mailbox instead.
    emailTo: (() => {
      const m = (msgs || []).find((x) => x.direction === "in" && x.meta && (x.meta.ourBox || x.meta.to));
      // the edge function records the resolved shop mailbox on new mail
      if (m?.meta?.ourBox) return String(m.meta.ourBox).toLowerCase();
      // older messages: find the first @crea.asia address that isn't a colleague
      const line = `${m?.meta?.to || ""} , ${m?.meta?.cc || ""}`.toLowerCase();
      const hit = (line.match(/[a-z0-9._%+-]+@crea\.asia/g) || [])
        .map((a) => a.replace(/\+[^@]*@/, "@"))
        .find((a) => !/^[a-z]+\.[a-z]{1,2}@/.test(a) || ["cs.solution@crea.asia", "enfa.cs@crea.asia", "nestlepro.cs@crea.asia"].includes(a));
      if (hit) return hit;
      const to = m?.meta?.to || "";
      return (to.match(/<([^>]+)>/)?.[1] ?? to).trim().toLowerCase() || null;
    })(),
    messages: (msgs || []).map((m) => ({
      from: m.direction === "in" ? "customer" : m.direction === "note" ? "note" : "agent",
      at: new Date(m.created_at).getTime(),
      text: biText(m.body || ""),
      by: m.author || undefined,
      att: (m.meta && m.meta.attachments) || undefined,
    })),
  };
}

async function fetchRealTickets() {
  const { data: tks, error } = await supabase.from("tickets").select("*")
    .in("channel", ["email", "webchat"]).order("created_at", { ascending: false }).limit(200);
  if (error || !tks || !tks.length) return [];
  const ids = tks.map((t) => t.id);
  const { data: msgs } = await supabase.from("messages").select("*")
    .in("ticket_id", ids).order("created_at", { ascending: true });
  const by = {};
  (msgs || []).forEach((m) => { (by[m.ticket_id] = by[m.ticket_id] || []).push(m); });
  return tks.map((t) => mapDbTicket(t, by[t.id]));
}

/* ═══════════════════════ i18n ═══════════════════════ */
/* Dictionary format:  key: ["English", "ไทย"]  — index 0 = en, 1 = th */

const D = {
  /* login */
  brand: ["Service Desk", "Service Desk"],
  loginBadge: ["All-in-one customer service", "ศูนย์บริการลูกค้าครบวงจร"],
  loginH1: ["Service Desk\n& CRM", "ระบบ Service Desk\n& CRM"],
  loginSub: ["Take every request, reply on any channel, hit your SLA, measure satisfaction.", "รับเรื่อง ตอบทุกช่องทาง คุม SLA วัดความพึงพอใจ"],
  f1t: ["Unified inbox", "กล่องข้อความรวม"], f1d: ["LINE, Facebook, TikTok, Shopee, Lazada, email", "LINE, Facebook, TikTok, Shopee, Lazada, อีเมล"],
  f2t: ["Automatic SLA clock", "คุม SLA อัตโนมัติ"], f2d: ["Tracks response and resolution time per case", "นับเวลาตอบกลับและเวลาปิดงานรายเคส"],
  f3t: ["Knowledge base", "คลังความรู้"], f3d: ["Articles and canned replies ready to use", "บทความและข้อความสำเร็จรูปพร้อมใช้"],
  f4t: ["CSAT scoring", "วัด CSAT"], f4d: ["Satisfaction ratings per case and per agent", "คะแนนความพึงพอใจรายเคสและรายพนักงาน"],
  signIn: ["Sign in", "เข้าสู่ระบบ"],
  signInSub: ["Use your work email to start taking cases", "ใช้อีเมลบริษัทของคุณเพื่อเริ่มรับเคส"],
  email: ["Email", "อีเมล"], password: ["Password", "รหัสผ่าน"],
  demoAccounts: ["Demo accounts — click to switch role", "บัญชีตัวอย่าง — คลิกเพื่อสลับสิทธิ์"],
  errNoAccount: ["No account found. Try one of the demo accounts below.", "ไม่พบบัญชีนี้ในระบบ ลองเลือกจากบัญชีตัวอย่างด้านล่าง"],
  errDisabled: ["This account is disabled. Contact your administrator.", "บัญชีนี้ถูกปิดใช้งาน ติดต่อผู้ดูแลระบบ"],
  errPw: ["Password must be at least 4 characters.", "รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร"],

  /* roles */
  rAdmin: ["Admin", "Admin"], rSup: ["Supervisor", "Supervisor"], rAgent: ["Agent", "Agent"],
  rAdminFull: ["Administrator", "ผู้ดูแลระบบ"], rSupFull: ["Team supervisor", "หัวหน้าทีม"], rAgentFull: ["Support agent", "เจ้าหน้าที่บริการลูกค้า"],
  rAdminDesc: ["Full control of the system", "จัดการทุกอย่างในระบบ"],
  rSupDesc: ["See every case and assign work", "ดูทุกเคสและมอบหมายงาน"],
  rAgentDesc: ["Only sees their own cases", "ดูเฉพาะเคสของตัวเอง"],

  /* nav */
  navDash: ["Overview", "ภาพรวม"], navInbox: ["Inbox", "กล่องข้อความ"], navTickets: ["All cases", "เคสทั้งหมด"],
  navCustomers: ["Customers", "ลูกค้า"], navKb: ["Knowledge", "คลังความรู้"], navReports: ["Reports", "รายงาน"],
  navUsers: ["People", "ผู้ใช้งาน"], navSettings: ["Settings", "ตั้งค่า"],

  /* shell */
  chansConnected: ["%s channels connected", "%s ช่องทางเชื่อมต่อ"],
  slaRisk: ["%s cases near SLA breach", "%s เคสเสี่ยงเกิน SLA"],
  allWithin: ["All cases within SLA", "ทุกเคสอยู่ในกรอบเวลา"],
  yourOpen: ["%s open cases assigned to you", "งานค้างของคุณ %s เคส"],
  notifTitle: ["Needs attention now", "เคสที่ต้องรีบดู"],
  notifEmpty: ["Nothing near SLA breach", "ไม่มีเคสเสี่ยงเกิน SLA"],
  items: ["%s items", "%s รายการ"],
  notifications: ["Notifications", "การแจ้งเตือน"],
  logout: ["Sign out", "ออกจากระบบ"],
  langLabel: ["Language", "ภาษา"],

  /* dashboard */
  kToday: ["Cases opened today", "เคสเข้าวันนี้"], kTodaySub: ["%s already closed", "ปิดไปแล้ว %s เคส"],
  kBacklog: ["Open backlog", "งานค้างในระบบ"], kBacklogSub: ["%s still unassigned", "ยังไม่มีผู้รับผิดชอบ %s เคส"],
  kSla: ["Replied within SLA", "ตอบกลับทัน SLA"], kSlaSub: ["Average %s", "เฉลี่ย %s"],
  kCsat: ["Satisfaction score", "คะแนนความพึงพอใจ"], kCsatSub: ["From %s responses", "จาก %s คำตอบ"],
  chVolume: ["Daily case volume", "ปริมาณเคสรายวัน"], last14: ["Last 14 days", "14 วันล่าสุด"],
  chChannel: ["Cases by channel", "เคสแยกตามช่องทาง"], totalCases: ["%s cases in total", "ทั้งหมด %s เคส"],
  sNew: ["New", "เข้าใหม่"], sClosed: ["Closed", "ปิดงาน"],
  needAtt: ["Cases to reply first", "เคสที่ต้องรีบตอบ"],
  needAttSub: ["Sorted by least SLA time remaining", "เรียงตามเวลา SLA ที่เหลือน้อยที่สุด"],
  viewAll: ["View all", "ดูทั้งหมด"],
  noRisk: ["No case is near breach", "ไม่มีเคสเสี่ยงเกิน SLA"], noRiskSub: ["Every open case is still inside its response window", "ทุกเคสยังอยู่ในกรอบเวลาตอบกลับ"],
  topCats: ["Most common request types", "ประเภทเรื่องที่พบบ่อย"],
  teamLoad: ["Team workload right now", "ภาระงานของทีมตอนนี้"],
  openCase: ["Open case", "เปิดเคส"],

  /* columns */
  cCase: ["Case", "เคส"], cSubject: ["Subject", "เรื่อง"], cChannel: ["Channel", "ช่องทาง"],
  cCategory: ["Type", "ประเภท"], cPriority: ["Priority", "ความเร่งด่วน"], cStatus: ["Status", "สถานะ"],
  cSla: ["SLA", "SLA"], cSlaFirst: ["First-reply SLA", "SLA ตอบกลับ"], cOwner: ["Assigned to", "ผู้รับผิดชอบ"],
  cCreated: ["Received", "เข้าเมื่อ"], cTeam: ["Team", "ทีม"], cOpen: ["Open", "งานค้าง"],
  cBreach: ["Breached", "เกิน SLA"], cCsat: ["CSAT", "CSAT"], cLoad: ["Load", "ภาระงาน"],
  cAgent: ["Agent", "พนักงาน"], cCustomer: ["Customer", "ลูกค้า"], cPhone: ["Phone", "เบอร์โทร"],
  cName: ["Name", "ชื่อ"], cEmail: ["Email", "อีเมล"], cRole: ["Role", "สิทธิ์การใช้งาน"],
  cTotal: ["Total cases", "เคสทั้งหมด"], cLast: ["Last contact", "ติดต่อล่าสุด"],

  /* ticket list */
  searchCases: ["Search case ID, customer, or order number", "ค้นหารหัสเคส ชื่อลูกค้า เลขคำสั่งซื้อ"],
  fOpenOnly: ["Open cases only", "เฉพาะงานค้าง"], fAllStatus: ["All statuses", "ทุกสถานะ"],
  fAllPri: ["All priorities", "ทุกความเร่งด่วน"], fAllChan: ["All channels", "ทุกช่องทาง"],
  fAllOwner: ["All assignees", "ผู้รับผิดชอบทั้งหมด"], unassigned: ["Unassigned", "ยังไม่มอบหมาย"],
  exportBtn: ["Export", "ส่งออก"], newCase: ["New case", "เปิดเคสใหม่"],
  selectedN: ["%s cases selected", "เลือกไว้ %s เคส"],
  takeSelf: ["Assign to me", "รับเคสเอง"], assignTo: ["Assign to…", "มอบหมายให้…"],
  setPri: ["Change priority…", "ปรับความเร่งด่วน…"], closeCases: ["Close cases", "ปิดงาน"],
  clearSel: ["Clear selection", "ยกเลิกการเลือก"],
  showingOf: ["Showing %s of %s cases", "แสดง %s จาก %s เคส"],
  breachedN: ["%s past SLA", "เกิน SLA %s เคส"],
  noCases: ["No cases match these filters", "ไม่พบเคสตามเงื่อนไข"],
  noCasesSub: ["Try clearing the filters or searching for something else", "ลองล้างตัวกรอง หรือเปลี่ยนคำค้นหา"],
  clearFilters: ["Clear filters", "ล้างตัวกรอง"],
  reopenedTag: ["Reopened", "เปิดซ้ำ"],
  tookSelf: ["Assigned to you —", "รับเคสเอง"], assignedTo: ["Assigned to %s —", "มอบหมายให้ %s"],
  priChanged: ["Priority changed —", "ปรับความเร่งด่วน"], closedN: ["Closed", "ปิดงาน"],
  nCases: ["%s cases", "%s เคส"],

  /* new ticket */
  ntTitle: ["Open a new case", "เปิดเคสใหม่"],
  ntSub: ["Log what the customer reported to start the SLA clock", "บันทึกเรื่องที่ลูกค้าแจ้งเข้ามา เพื่อเริ่มจับเวลา SLA"],
  fName: ["Customer name", "ชื่อลูกค้า"], fPhone: ["Contact number", "เบอร์ติดต่อ"],
  fOrder: ["Order number", "เลขที่คำสั่งซื้อ"], fChanIn: ["Channel it came in on", "ช่องทางที่ติดต่อเข้ามา"],
  fCat: ["Request type", "ประเภทเรื่อง"], fPri: ["Priority", "ความเร่งด่วน"],
  fCustEmail: ["Customer email", "อีเมลลูกค้า"], fFromBox: ["Send from mailbox", "ส่งจากอีเมล"],
  errCustEmail: ["Enter a valid customer email address", "กรอกอีเมลลูกค้าให้ถูกต้อง"],
  errSubjReq: ["Subject is required for an email case", "ต้องระบุหัวข้ออีเมล"],
  createSend: ["Create & send email", "สร้างเคสและส่งอีเมล"],
  fSubject: ["Subject", "หัวเรื่อง"], fSubjectPh: ["Leave blank and we'll write one", "เว้นว่างไว้ ระบบจะตั้งให้อัตโนมัติ"],
  fDetail: ["What the customer said", "รายละเอียดที่ลูกค้าแจ้ง"],
  fDetailPh: ["Capture it in the customer's own words as much as possible", "สรุปสิ่งที่ลูกค้าบอก ตามคำพูดของลูกค้าให้มากที่สุด"],
  respondIn: ["reply within %s", "ตอบใน %s"],
  errName: ["Enter the customer's name", "กรอกชื่อลูกค้า"],
  errDetail: ["Describe what the customer reported", "กรอกรายละเอียดเรื่องที่ลูกค้าแจ้ง"],
  cancel: ["Cancel", "ยกเลิก"], create: ["Open case", "เปิดเคส"], save: ["Save", "บันทึก"],
  caseOpened: ["Case %s is open", "เปิดเคส %s แล้ว"],
  viaChannel: ["reported via %s", "แจ้งผ่าน %s"],

  /* inbox */
  searchInbox: ["Search the inbox", "ค้นหาในกล่องงาน"],
  inboxCount: ["%s open · sorted by SLA remaining", "งานค้าง %s เคส · เรียงตาม SLA ที่เหลือ"],
  inboxEmpty: ["Inbox is clear", "กล่องงานว่าง"], inboxEmptySub: ["Nothing waiting on you right now", "ไม่มีเคสค้างในตอนนี้"],
  pickCase: ["Pick a case from the left", "เลือกเคสจากรายการด้านซ้าย"],
  pickCaseSub: ["Messages and customer history appear here", "ข้อความและประวัติลูกค้าจะแสดงที่นี่"],
  youPrefix: ["You: ", "คุณ: "],
  receivedAgo: ["received %s", "เข้าเมื่อ %s"],
  noteBanner: ["Internal note — the customer cannot see this", "โน้ตภายใน — ลูกค้าไม่เห็นข้อความนี้"],
  supportTeam: ["Support team", "ทีมบริการ"],
  cannedBtn: ["Canned replies", "ข้อความสำเร็จรูป"],
  noteBtn: ["Internal note", "โน้ตภายใน"], noteBtnOn: ["Writing an internal note", "กำลังเขียนโน้ตภายใน"],
  replyPh: ["Reply to %s on %s…", "ตอบกลับ %s ผ่าน %s…"],
  notePh: ["Write a note for the team. The customer will not see it.", "เขียนโน้ตให้ทีมอ่าน ลูกค้าจะไม่เห็นข้อความนี้"],
  ctrlEnter: ["Press Ctrl + Enter to send", "กด Ctrl + Enter เพื่อส่ง"],
  sendBtn: ["Send reply", "ส่งข้อความ"], saveNote: ["Save note", "บันทึกโน้ต"],
  attachOff: ["Attachments are off in this demo", "แนบไฟล์ยังไม่เปิดใช้งานในเดโม"],
  attTooBig: ["Some files were skipped — max 10 MB per file for email", "บางไฟล์ถูกข้าม — อีเมลแนบได้สูงสุด 10 MB ต่อไฟล์"],
  callBack: ["Call back", "โทรกลับ"], calling: ["Calling %s", "กำลังต่อสายหา %s"],
  copied: ["Number copied", "คัดลอกเบอร์แล้ว"], copiedText: ["Copied to clipboard", "คัดลอกเนื้อหาแล้ว"],
  firstReplyIn: ["First reply in", "ตอบครั้งแรกใน"],
  custHistory: ["This customer's history", "ประวัติเคสของลูกค้ารายนี้"],
  caseActions: ["Case actions", "การจัดการเคส"],
  delCase: ["Delete case", "ลบเคส"],
  delConfirm: ["Delete case %s permanently? All messages and history will be removed. This cannot be undone.", "ลบเคส %s ถาวร? ข้อความและประวัติทั้งหมดจะถูกลบ ไม่สามารถกู้คืนได้"],
  delDone: ["Case deleted", "ลบเคสแล้ว"],
  escalate: ["Escalate to another team", "ส่งต่อทีมอื่น"],
  waitCust: ["Waiting on customer", "รอลูกค้าตอบกลับ"],
  resolveClose: ["Resolve and close", "แก้ไขเสร็จ ปิดเคส"],
  msgSent: ["Reply sent to the customer", "ส่งข้อความถึงลูกค้าแล้ว"],
  noteSaved: ["Internal note saved", "บันทึกโน้ตภายในแล้ว"],
  statusTo: ["Status changed to \"%s\"", "เปลี่ยนสถานะเป็น \"%s\""],
  priSaved: ["Priority updated", "ปรับความเร่งด่วนแล้ว"],
  ownerSaved: ["Case assigned", "มอบหมายเคสแล้ว"],
  escalated: ["Escalated to another team", "ส่งต่อทีมอื่นแล้ว"],
  pendingSet: ["Marked as waiting on customer", "ตั้งเป็นรอลูกค้าตอบ"],
  resolvedMsg: ["Case resolved. Satisfaction survey sent.", "ปิดเคสเรียบร้อย ส่งแบบสอบถาม CSAT แล้ว"],

  /* customers */
  searchCust: ["Search by name or phone number", "ค้นหาชื่อลูกค้าหรือเบอร์โทร"],
  custCount: ["%s customers · %s contacted more than once", "%s ราย · ติดต่อซ้ำ %s ราย"],
  channelsUsed: ["Channels used", "ช่องทางที่ใช้"],
  viewHistory: ["View history", "ดูประวัติ"],
  custModalSub: ["%s · %s contacts in total", "%s · ติดต่อเข้ามาทั้งหมด %s ครั้ง"],
  mTotal: ["Total cases", "เคสทั้งหมด"], mOpen: ["Open now", "งานค้าง"], mCsat: ["Average CSAT", "CSAT เฉลี่ย"],
  timeline: ["Contact timeline", "ไทม์ไลน์การติดต่อ"],

  /* knowledge */
  tabArticles: ["Articles", "บทความคู่มือ"], tabCanned: ["Canned replies", "ข้อความสำเร็จรูป"],
  searchKb: ["Search the knowledge base", "ค้นหาในคลังความรู้"],
  addArticle: ["New article", "เพิ่มบทความ"], addCanned: ["New reply", "เพิ่มข้อความ"],
  viewsN: ["Opened %s times", "เปิดอ่าน %s ครั้ง"],
  copyBtn: ["Copy", "คัดลอก"], editBtn: ["Edit", "แก้ไข"],
  kbEmpty: ["No articles found", "ไม่พบบทความ"], kbEmptySub: ["Try a different search term", "ลองค้นด้วยคำอื่น"],
  cannedEmpty: ["No canned replies found", "ไม่พบข้อความสำเร็จรูป"],
  cTitle2: ["Title", "ชื่อข้อความ"], cContent: ["Content", "เนื้อหา"], cCat2: ["Category", "หมวด"],
  mTitleLbl: ["Title", "ชื่อเรื่อง"], mCatLbl: ["Category", "หมวด"], mBodyLbl: ["Content", "เนื้อหา"],
  savedOk: ["Saved", "บันทึกแล้ว"],
  editItem: ["Edit", "แก้ไข"],

  /* reports */
  daily: ["Daily", "รายวัน"], monthly: ["Monthly", "รายเดือน"],
  rangeIs: ["Range: %s", "ช่วงข้อมูล: %s"],
  thisMonth: ["current month", "เดือนปัจจุบัน"],
  exportExcel: ["Export to Excel", "ส่งออก Excel"],
  rTotal: ["Total cases", "เคสทั้งหมด"], rFirstAvg: ["Average first reply", "เวลาตอบแรกเฉลี่ย"],
  rResAvg: ["Average time to close", "เวลาปิดงานเฉลี่ย"], rReopen: ["Reopen rate", "อัตราเปิดเคสซ้ำ"],
  csatTrend: ["Satisfaction trend", "แนวโน้มคะแนนความพึงพอใจ"],
  csatDist: ["Rating distribution", "การกระจายคะแนน"],
  csatFoot: ["%s of %s closed cases were rated", "ตอบแบบสอบถาม %s จาก %s เคสที่ปิดแล้ว"],
  agentPerf: ["Agent performance", "รายงานประสิทธิภาพพนักงาน"],
  agentPerfSub: ["Ranked by satisfaction score", "เรียงตามคะแนนความพึงพอใจ"],
  cClosedN: ["Closed", "ปิดงาน"], cFirstAvg: ["Avg first reply", "ตอบแรกเฉลี่ย"],
  cResAvg: ["Avg to close", "ปิดงานเฉลี่ย"], cSlaMet: ["SLA met", "ทัน SLA"], cReopen: ["Reopened", "เปิดซ้ำ"],
  byCategory: ["Breakdown by request type", "สรุปตามประเภทเรื่อง"],
  cCount: ["Cases", "จำนวนเคส"], cShare: ["Share", "สัดส่วน"], cAvgRes: ["Avg time to close", "เวลาปิดเฉลี่ย"],
  reportExported: ["Report exported to Excel", "ส่งออกรายงานเป็นไฟล์ Excel แล้ว"],
  casesExported: ["Exported %s cases to Excel", "ส่งออก %s เคสเป็นไฟล์ Excel แล้ว"],
  /* new outbound message */
  nmNew: ["New message", "เขียนอีเมลใหม่"],
  nmTitle: ["New email", "อีเมลใหม่"],
  nmSub: ["Starts a new case and sends it straight away", "เปิดเคสใหม่และส่งอีเมลทันที"],
  nmFrom: ["From", "ส่งจาก"],
  nmTo: ["To", "ถึง"],
  nmCc: ["Cc", "สำเนาถึง"],
  nmCcAdd: ["Add Cc", "เพิ่มสำเนาถึง"],
  nmSubject: ["Subject", "หัวข้อ"],
  nmBody: ["Message", "ข้อความ"],
  nmCustomer: ["Customer name", "ชื่อลูกค้า"],
  nmSend: ["Send email", "ส่งอีเมล"],
  nmSending: ["Sending…", "กำลังส่ง…"],
  nmSent: ["Email sent · case %s opened", "ส่งอีเมลแล้ว · เปิดเคส %s"],
  nmErrTo: ["Enter a valid recipient email", "กรอกอีเมลผู้รับให้ถูกต้อง"],
  nmErrSubj: ["Enter a subject", "กรอกหัวข้อ"],
  nmErrBody: ["Write a message", "เขียนข้อความ"],
  nmErrCc: ["%s is not a valid email", "%s ไม่ใช่อีเมลที่ถูกต้อง"],
  nmSearchBox: ["Search mailbox…", "ค้นหากล่องอีเมล…"],
  /* email signature */
  sigTitle: ["Email signature", "ลายเซ็นอีเมล"],
  sigSub: ["Added to the end of every reply sent from that mailbox", "ระบบจะต่อท้ายอีเมลทุกฉบับที่ส่งจากกล่องนั้น"],
  sigOn: ["Signatures on", "เปิดใช้ลายเซ็น"],
  sigVars: ["Use {{agent}} for the sender's name", "ใช้ {{agent}} แทนชื่อผู้ส่ง"],
  sigSaved: ["Signature saved", "บันทึกลายเซ็นแล้ว"],
  sigSave: ["Save signature", "บันทึกลายเซ็น"],
  sigMine: ["My signature", "ลายเซ็นของฉัน"],
  sigMineSub: ["Your details, used in every email you send", "ข้อมูลของคุณ ใช้กับอีเมลทุกฉบับที่คุณส่ง"],
  sigTemplate: ["Template", "รูปแบบ"],
  sigCustom: ["Write my own", "เขียนเอง"],
  sigName: ["Display name", "ชื่อที่แสดง"],
  sigRole: ["Role", "ตำแหน่ง"],
  sigPhone: ["Phone (optional)", "เบอร์โทร (ถ้ามี)"],
  sigPreviewAs: ["Preview as %s", "ตัวอย่างจาก %s"],
  sigWillAdd: ["Signature will be added", "จะต่อท้ายด้วยลายเซ็น"],
  sigSkip: ["Don't sign this one", "ไม่ต้องใส่ลายเซ็นฉบับนี้"],
  sigShow: ["Preview", "ดูตัวอย่าง"],
  sigHide: ["Hide", "ซ่อน"],
  /* Twilio softphone */
  sfTitle: ["Softphone", "โทรศัพท์ในระบบ"],
  sfReady: ["Ready for calls", "พร้อมรับสาย"],
  sfOff: ["Softphone off", "ปิดอยู่"],
  sfConnecting: ["Connecting…", "กำลังเชื่อมต่อ…"],
  sfNotSetup: ["Twilio not configured yet", "ยังไม่ได้ตั้งค่า Twilio"],
  sfStart: ["Go online", "เปิดรับสาย"],
  sfStop: ["Go offline", "ปิดรับสาย"],
  sfMicNeeded: ["Allow microphone access to take calls", "อนุญาตใช้ไมโครโฟนเพื่อรับสาย"],
  sfOnCall: ["On call", "กำลังสนทนา"],
  sfMute: ["Mute", "ปิดไมค์"],
  sfUnmute: ["Unmute", "เปิดไมค์"],
  sfHangup: ["Hang up", "วางสาย"],
  sfCallEnded: ["Call ended · %s", "จบสาย · %s"],
  sfDialing: ["Calling %s…", "กำลังโทรหา %s…"],
  sfCallBtn: ["Call", "โทร"],
  /* reply all */
  replyAllOn: ["Reply all", "ตอบกลับทุกคน"],
  replyAllTo: ["To", "ถึง"],
  replyAllCc: ["Cc", "สำเนาถึง"],
  replyAllNone: ["No one else on this thread", "ไม่มีผู้รับอื่นในอีเมลนี้"],
  replyAllSent: ["Replied to %s people", "ตอบกลับ %s คนแล้ว"],
  /* collision prevention + live monitor */
  colViewing: ["%s is viewing this case", "%s กำลังดูเคสนี้อยู่"],
  colTyping: ["%s is replying now", "%s กำลังพิมพ์ตอบอยู่"],
  colBoth: ["%s others are in this case", "มีอีก %s คนอยู่ในเคสนี้"],
  colWarnTitle: ["Someone else is replying", "มีคนอื่นกำลังตอบอยู่"],
  colWarnBody: ["%s is typing a reply to this case. Send anyway?", "%s กำลังพิมพ์ตอบเคสนี้อยู่ ต้องการส่งเลยหรือไม่?"],
  colSendAnyway: ["Send anyway", "ยืนยันส่ง"],
  liveNow: ["Live now", "กำลังทำงานอยู่"],
  liveNobody: ["No one is in a case right now", "ยังไม่มีใครเปิดเคสอยู่"],
  liveSub: ["Who is in which case, updated live", "ใครอยู่เคสไหน อัปเดตแบบเรียลไทม์"],
  liveOn: ["Live", "เรียลไทม์"],
  /* incoming call screen-pop (3CX) */
  incCall: ["Incoming call", "สายเรียกเข้า"],
  incAnswer: ["Answer", "รับสาย"],
  incDecline: ["Decline", "ปฏิเสธ"],
  incUnknown: ["Unknown caller", "ไม่ทราบผู้โทร"],
  incNewCust: ["New customer — no case yet", "ลูกค้าใหม่ — ยังไม่มีเคส"],
  incHasCase: ["%s open case(s)", "มีเคสค้าง %s เคส"],
  incVia: ["via 3CX · to %s", "ผ่าน 3CX · เข้า %s"],
  incAnswered: ["Call answered — case opened", "รับสายแล้ว — เปิดเคสให้แล้ว"],
  incDeclined: ["Call declined", "ปฏิเสธสายแล้ว"],
  simCall: ["Simulate incoming call", "ทดสอบสายเรียกเข้า"],
  simSent: ["Test call sent — ringing shortly", "ส่งสายทดสอบแล้ว — จะดังในอีกสักครู่"],
  demoData: ["Demo data", "ข้อมูลตัวอย่าง"],
  last30: ["last 30 days", "30 วันล่าสุด"],
  byChannel2: ["Breakdown by channel", "สรุปตามช่องทาง"],
  cChannel2: ["Channel", "ช่องทาง"],
  demoDataNote: ["Showing sample data for demo — real cases are not affected", "กำลังแสดงข้อมูลตัวอย่างสำหรับเดโม — ไม่กระทบเคสจริง"],

  /* users */
  usersTitle: ["People in your organisation", "ผู้ใช้งานในองค์กร"],
  usersSub: ["%s active · %s total", "%s คนใช้งานอยู่ · ทั้งหมด %s คน"],
  addUser: ["Add person", "เพิ่มผู้ใช้งาน"],
  addUserSub: ["We'll email them a link to set their password", "ระบบจะส่งอีเมลตั้งรหัสผ่านให้ผู้ใช้งานใหม่"],
  activeSt: ["Active", "ใช้งานอยู่"], inactiveSt: ["Disabled", "ปิดใช้งาน"],
  disable: ["Disable", "ปิดใช้งาน"], enable: ["Enable", "เปิดใช้งาน"],
  youTag: ["You", "คุณ"],
  errUserName: ["Enter a name", "กรอกชื่อผู้ใช้งาน"], errEmail: ["That email address isn't valid", "อีเมลไม่ถูกต้อง"],
  errDup: ["That email is already in use", "อีเมลนี้ถูกใช้งานแล้ว"],
  userAdded: ["Person added", "เพิ่มผู้ใช้งานแล้ว"],
  roleUpdated: ["Updated %s's role", "ปรับสิทธิ์ %s แล้ว"],
  userDisabled: ["Disabled %s", "ปิดใช้งาน %s"], userEnabled: ["Enabled %s", "เปิดใช้งาน %s"],

  /* settings */
  chansTitle: ["Connected channels", "ช่องทางที่เชื่อมต่อ"],
  chansSub: ["Turn on the channels that should feed the inbox", "เปิดช่องทางที่ต้องการให้เคสไหลเข้ากล่องงาน"],
  chanOn: ["Connected · cases arrive automatically", "เชื่อมต่อแล้ว · รับเคสอัตโนมัติ"],
  chanOff: ["Not connected", "ยังไม่เปิดใช้งาน"],
  chanTurnedOn: ["Now receiving cases from %s", "เปิดรับเคสจาก %s"],
  chanTurnedOff: ["Stopped receiving cases from %s", "ปิดรับเคสจาก %s"],
  autoAssign: ["Automatic assignment", "การมอบหมายงานอัตโนมัติ"],
  autoAssignSub: ["How new cases get handed to the team", "ระบบจะกระจายเคสใหม่ให้ทีมตามกติกานี้"],
  asRound: ["Round robin", "วนตามลำดับ"], asRoundD: ["Split evenly in queue order", "แบ่งเท่ากันเรียงคิว"],
  asLoad: ["By workload", "ตามภาระงาน"], asLoadD: ["Goes to whoever has fewest open", "ให้คนที่งานค้างน้อยสุด"],
  asManual: ["Assign manually", "มอบหมายเอง"], asManualD: ["A supervisor picks every time", "หัวหน้าเลือกเองทุกเคส"],
  ruleChanged: ["Assignment rule set to \"%s\"", "เปลี่ยนกติกาเป็น \"%s\""],
  slaTitle: ["Service level agreement", "ข้อตกลงระดับบริการ (SLA)"],
  slaSub: ["Reply and resolution targets by priority", "กรอบเวลาตอบกลับและปิดงานตามความเร่งด่วน"],
  cFirstIn: ["First reply within", "ตอบครั้งแรกภายใน"], cCloseIn: ["Close within", "ปิดงานภายใน"],
  slaNote: ["The clock only runs during business hours, 09:00–19:00. Cases that arrive after hours start counting when you open the next day.", "นับเฉพาะเวลาทำการ 09:00–19:00 น. เคสที่เข้ามานอกเวลาจะเริ่มนับตอนเปิดทำการวันถัดไป"],
  notifSettings: ["Notifications", "การแจ้งเตือน"],
  notifSettingsSub: ["Choose what the system should alert you about", "เลือกสิ่งที่อยากให้ระบบเตือน"],
  nRisk: ["Warn before SLA breach", "เตือนก่อนเกิน SLA"], nRiskD: ["Alerts when under 30% of the reply window is left", "แจ้งเมื่อเหลือเวลาตอบไม่ถึง 30%"],
  nUnassigned: ["Unassigned cases", "เคสยังไม่มีคนรับ"], nUnassignedD: ["Tells a supervisor after 10 minutes", "แจ้งหัวหน้าเมื่อค้างเกิน 10 นาที"],
  nDaily: ["Daily summary", "สรุปรายวัน"], nDailyD: ["Sends a performance recap at 09:00", "ส่งสรุปผลงานทุกเช้า 09:00 น."],
  nLowCsat: ["Ratings under 3 stars", "คะแนนต่ำกว่า 3 ดาว"], nLowCsatD: ["Alerts the moment a low score lands", "แจ้งทันทีเมื่อได้รับคะแนนต่ำ"],
  bizHours: ["Business hours", "เวลาทำการ"], openAt: ["Opens", "เปิด"], closeAt: ["Closes", "ปิด"],

  /* calls */
  navCalls: ["Calls", "การโทร"],
  dialpad: ["Dial pad", "แป้นโทรออก"],
  sipOn: ["%s ready", "%s พร้อมใช้งาน"], sipOff: ["Phone line not connected", "ยังไม่ได้เชื่อมต่อสาย"],
  numberPh: ["0X-XXXX-XXXX", "0X-XXXX-XXXX"],
  callBtn: ["Call", "โทรออก"],
  matchingCust: ["Customers on this number", "ลูกค้าที่ตรงกับเบอร์นี้"],
  simInbound: ["Simulate an incoming call", "จำลองสายเรียกเข้า"],
  openCasesN: ["%s open cases", "งานค้าง %s เคส"],
  callLog: ["Call history", "ประวัติการโทร"],
  callLogEmpty: ["No calls yet", "ยังไม่มีประวัติการโทร"],
  callLogEmptySub: ["Start from the dial pad, or hit call back on any case", "เริ่มโทรจากแป้นด้านซ้าย หรือกดโทรกลับจากเคสใดก็ได้"],
  cTime: ["Time", "เวลา"], cDirection: ["Direction", "ทิศทาง"], cDuration: ["Talk time", "ระยะเวลา"],
  cOutcome: ["Outcome", "ผลการโทร"], cLinked: ["Linked case", "เคสที่เกี่ยวข้อง"], cNotes: ["Notes", "โน้ต"],
  dirOut: ["Outbound", "โทรออก"], dirIn: ["Inbound", "สายเข้า"], dirMissed: ["Missed", "สายไม่ได้รับ"],
  kCallsToday: ["Calls today", "สายวันนี้"], kTalkTime: ["Average talk time", "เวลาคุยเฉลี่ย"],
  kInbound: ["Inbound share", "สัดส่วนสายเข้า"], kMissed: ["Missed calls", "สายไม่ได้รับ"],
  uCalls: ["calls", "สาย"],
  incoming: ["Incoming call", "สายเรียกเข้า"],
  ringing: ["Ringing…", "กำลังต่อสาย…"],
  accept: ["Answer", "รับสาย"], decline: ["Decline", "ปฏิเสธ"],
  unknownCaller: ["Unknown number", "เบอร์ที่ไม่รู้จัก"],
  manualDial: ["Manual dial", "เบอร์โทรออกเอง"],
  hasOpenCase: ["Has an open case", "มีเคสค้างอยู่"],
  muteOn: ["Unmute", "เปิดไมค์"], muteOff: ["Mute", "ปิดไมค์"],
  holdOn: ["Resume", "ต่อสาย"], holdOff: ["Hold", "พักสาย"],
  onHold: ["On hold", "พักสาย"],
  recOn: ["Recording", "กำลังบันทึกเสียง"], recOff: ["Not recording", "ไม่บันทึกเสียง"],
  recStop: ["Stop rec.", "หยุดอัด"], recStart: ["Record", "อัดเสียง"],
  keypadBtn: ["Keypad", "แป้นกด"], transferBtn: ["Transfer", "โอนสาย"],
  transferTo: ["Transfer this call to", "โอนสายให้"],
  transferred: ["Call transferred to %s", "โอนสายให้ %s แล้ว"],
  hangUp: ["End call", "วางสาย"],
  callEnded: ["Call ended · talked for %s", "วางสายแล้ว · คุยไป %s"],
  wrapTitle: ["Wrap up the call", "สรุปผลการโทร"],
  outcomeLbl: ["How did it end?", "ผลการโทร"],
  oResolved: ["Issue resolved", "แก้ไขจบในสาย"], oFollowup: ["Needs follow-up", "ต้องติดตามต่อ"],
  oCallback: ["Call back later", "นัดโทรกลับ"], oNoAnswer: ["No answer", "ไม่รับสาย"],
  oWrong: ["Wrong number", "เบอร์ผิด"],
  linkCase: ["Attach to a case", "ผูกกับเคส"],
  noCase: ["Don't attach", "ไม่ผูกกับเคส"],
  newCaseFromCall: ["Open a new case from this call", "เปิดเคสใหม่จากสายนี้"],
  callNotes: ["Call notes", "โน้ตการสนทนา"],
  callNotesPh: ["What was discussed and what happens next", "สรุปสิ่งที่คุยและขั้นตอนถัดไป"],
  saveCall: ["Save call record", "บันทึกผลการโทร"],
  callSaved: ["Call logged · %s", "บันทึกผลการโทรแล้ว · %s"],
  callEntry: ["%s call · %s · %s", "%s · %s · %s"],
  recAvailable: ["Recording saved", "มีไฟล์บันทึกเสียง"],
  /* presence + queue routing */
  myStatus: ["My status", "สถานะของฉัน"],
  pAvailable: ["Available", "พร้อมรับสาย"], pRinging: ["Ringing", "สายกำลังเรียก"],
  pOnCall: ["On a call", "กำลังคุยสาย"], pBreak: ["On break", "พักเบรก"], pOffline: ["Offline", "ออฟไลน์"],
  statusSet: ["Status set to %s", "เปลี่ยนสถานะเป็น %s"],
  availToTake: ["Incoming calls will be offered to you", "ระบบจะส่งสายเรียกเข้าให้คุณ"],
  notTakingCalls: ["You won't be offered calls", "ระบบจะไม่ส่งสายให้คุณ"],
  agentBoard: ["Who's on the phones", "สถานะทีมรับสาย"],
  idleFor: ["Free for %s", "ว่างมา %s"],
  lastCallWas: ["Last call %s", "สายล่าสุด %s"],
  noCallsYet: ["No calls yet today", "ยังไม่มีสายวันนี้"],
  liveQueue: ["Calls waiting", "สายที่รออยู่"],
  queueEmpty: ["Nobody is waiting", "ไม่มีสายรออยู่"],
  queueEmptySub: ["Incoming calls appear here and route to whoever is free", "สายเรียกเข้าจะแสดงที่นี่ และส่งให้คนที่ว่างอัตโนมัติ"],
  waitedFor: ["Waiting %s", "รอมา %s"],
  posInQueue: ["Position %s", "คิวที่ %s"],
  ringingAt: ["Ringing %s", "กำลังเรียก %s"],
  lookingForAgent: ["Looking for a free agent", "กำลังหาพนักงานที่ว่าง"],
  pullNext: ["Take next call", "รับสายถัดไป"],
  takeThis: ["Take it", "รับสายนี้"],
  routedToYou: ["Call routed to you", "ส่งสายมาที่คุณ"],
  answeredByX: ["%s answered the call from %s", "%s รับสายจาก %s"],
  noAgentFree: ["No agent free — the call is queued", "ไม่มีพนักงานว่าง สายเข้าคิวรอ"],
  abandonedMsg: ["Caller hung up after waiting %s", "ผู้โทรวางสายหลังรอ %s"],
  cbAlert: ["Abandoned call added to the call-back list", "สายหลุดถูกเพิ่มในรายการโทรกลับ"],
  cbTitle: ["Call back", "รายการโทรกลับ"],
  cbSub: ["Abandoned callers waiting for a return call", "ลูกค้าที่สายหลุด รอการโทรกลับ"],
  cbEmpty: ["No callbacks owed", "ไม่มีสายค้างโทรกลับ"],
  cbEmptySub: ["Every abandoned caller has been called back", "โทรกลับลูกค้าสายหลุดครบทุกรายแล้ว"],
  cbWaited: ["waited %s", "รอไป %s"],
  cbCall: ["Call back", "โทรกลับ"],
  cbDone: ["Callback completed · %s", "โทรกลับสำเร็จ · %s"],
  cbDismiss: ["Dismissed from call-back list", "นำออกจากรายการโทรกลับแล้ว"],
  rerouted: ["No answer — passing to the next agent", "ไม่รับสาย ส่งต่อให้คนถัดไป"],
  answerIn: ["Answer within %ss", "รับสายภายใน %s วิ"],
  kAvgWait: ["Average wait", "เวลารอเฉลี่ย"], kAbandoned: ["Abandoned", "สายหลุดคิว"],
  cWaited: ["Queue wait", "รอคิว"], cHandledBy: ["Handled by", "ผู้รับสาย"],
  routingTitle: ["Call routing", "การกระจายสายเรียกเข้า"],
  routingSub: ["How a waiting call picks an agent", "ระบบเลือกพนักงานรับสายอย่างไร"],
  rIdle: ["Longest idle", "ว่างนานสุด"], rIdleD: ["Goes to whoever has been free longest", "ให้คนที่ว่างมานานที่สุด"],
  rLoad2: ["Fewest open cases", "งานค้างน้อยสุด"], rLoadD2: ["Balances the case backlog", "ถ่วงดุลปริมาณงานค้าง"],
  rRound2: ["Round robin", "วนตามลำดับ"], rRoundD2: ["Straight rotation through the team", "วนคิวเรียงตามลำดับ"],
  rManual2: ["Agents pull", "ให้พนักงานกดรับเอง"], rManualD2: ["Nothing rings until someone takes it", "สายรอจนกว่าจะมีคนกดรับ"],
  ringFor: ["Ring each agent for", "เรียกแต่ละคนนาน"],
  maxWaitLbl: ["Give up after", "ยกเลิกสายหลังรอเกิน"],
  secs: ["seconds", "วินาที"],

  /* recording player */
  playRec: ["Play recording", "ฟังบันทึกเสียง"],
  recOf: ["Recording · %s", "บันทึกเสียง · %s"],
  transcript: ["Transcript", "ถอดเสียงสนทนา"],
  transcriptNote: ["Auto-transcribed — may contain errors", "ถอดเสียงอัตโนมัติ อาจมีข้อผิดพลาด"],
  speedLbl: ["Speed", "ความเร็ว"],
  closePlayer: ["Close player", "ปิดเครื่องเล่น"],
  demoAudio: ["Demo tone — real audio arrives with the 3CX integration", "เสียงตัวอย่าง — เสียงจริงจะมาพร้อมการเชื่อมต่อ 3CX"],
  playbackLogged: ["Playback is logged for audit", "ระบบบันทึกทุกการเปิดฟังเพื่อการตรวจสอบ"],

  /* telephony settings */
  telTitle: ["Phone system", "ระบบโทรศัพท์"],
  telSub: ["Connect your PBX so agents can call from the browser", "เชื่อมต่อระบบโทรศัพท์ เพื่อให้โทรออกจากหน้าเว็บได้"],
  telConnected: ["Connected", "เชื่อมต่อแล้ว"], telPending: ["Not connected", "รอเชื่อมต่อ"],
  provider: ["Provider", "ผู้ให้บริการ"],
  sipServer: ["SIP server", "SIP Server"], sipPort: ["Port", "พอร์ต"], sipProto: ["Protocol", "โปรโตคอล"],
  sipExt: ["Your extension", "คู่สายของคุณ"], sipSecret: ["SIP password", "รหัสผ่าน SIP"],
  callerId: ["Number shown to customers", "เบอร์ที่แสดงปลายทาง"],
  recNote: ["Every call is recorded automatically and kept for 90 days under company policy.", "บันทึกเสียงสนทนาอัตโนมัติทุกสาย และเก็บไฟล์ไว้ 90 วันตามนโยบายองค์กร"],
  testSave: ["Test and save", "ทดสอบและบันทึก"], disconnect: ["Disconnect", "ตัดการเชื่อมต่อ"],
  sipNeedHost: ["Enter a SIP server before testing", "กรอก SIP Server ก่อนทดสอบการเชื่อมต่อ"],
  sipConnected: ["Connected to %s at %s", "เชื่อมต่อ %s ที่ %s สำเร็จ"],
  sipDropped: ["Phone line disconnected", "ตัดการเชื่อมต่อแล้ว"],
  lineReady: ["Line ready", "สายพร้อมใช้งาน"], lineDown: ["Line unavailable", "สายไม่พร้อม"],

  /* time */
  justNow: ["just now", "เมื่อครู่"],
  minAgo: ["%s min ago", "%s นาทีที่แล้ว"], hrAgo: ["%s hr ago", "%s ชม.ที่แล้ว"], dayAgo: ["%s d ago", "%s วันที่แล้ว"],
  uMin: ["%s min", "%s นาที"], uHr: ["%s hr", "%s ชม."], uDay: ["%s d", "%s วัน"],
  slaMet: ["Replied in time", "ตอบทันเวลา"], slaMissed: ["Replied late", "ตอบช้ากว่ากำหนด"],
  slaOver: ["%s over SLA", "เกิน SLA %s"], slaLeft: ["%s left", "เหลือ %s"],

  /* misc units */
  uCases: ["cases", "เคส"], uOf5: ["/ 5", "/ 5"], uPct: ["%", "%"],
};

const LANG = { cur: "en" };
const idx = () => (LANG.cur === "th" ? 1 : 0);
const t = (k, ...a) => {
  const s = D[k] ? D[k][idx()] : k;
  return a.reduce((acc, v) => acc.replace("%s", v), s);
};
const tv = (o) => (o && typeof o === "object" ? o[LANG.cur] ?? o.en : o);
const locale = () => (LANG.cur === "th" ? "th-TH" : "en-GB");

/* ═══════════════════════ TOKENS ═══════════════════════ */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');

.svc, .svc * { box-sizing:border-box; font-family:'Galano Grotesque','IBM Plex Sans','IBM Plex Sans Thai',system-ui,-apple-system,sans-serif; }
.svc {
  /* NiRM palette — teal #0D9488 primary, slate neutrals */
  --navy:#0F766E; --navy-2:#115E59; --blue:#0D9488; --blue-2:#14B8A6;
  --sky:#F0FDFA; --ink:#0F172A; --muted:#64748B; --line:#E2E8F0; --bg:#F8FAFC;
  --green:#12A150; --green-bg:#E4F7EC; --amber:#D97706; --amber-bg:#FEF3C7;
  --red:#B91C1C; --red-bg:#FEE2E2; --cyan:#0891B2; --cyan-bg:#E0F4F8;
  --violet:#4F46E5; --violet-bg:#EEF2FF; --slate-bg:#F1F5F9;
  --shadow:0 1px 2px rgba(15,23,42,.06), 0 8px 24px -12px rgba(15,23,42,.16);
  background:var(--bg); color:var(--ink); min-height:100vh; -webkit-font-smoothing:antialiased;
}
.svc.th, .svc.th * { font-family:'IBM Plex Sans Thai','Galano Grotesque','IBM Plex Sans',system-ui,sans-serif; }
.svc button { font-family:inherit; cursor:pointer; border:none; background:none; color:inherit; }
.svc input, .svc select, .svc textarea { font-family:inherit; font-size:14px; color:var(--ink); }
.svc :focus-visible { outline:2px solid var(--blue); outline-offset:2px; border-radius:6px; }
@media (prefers-reduced-motion:reduce){ .svc *{ animation:none!important; transition:none!important; } }

.card { background:#fff; border:1px solid var(--line); border-radius:14px; box-shadow:var(--shadow); }
.fld { width:100%; padding:9px 12px; border:1px solid var(--line); border-radius:9px; background:#fff; outline:none; transition:.15s; }
.fld:focus { border-color:var(--blue); box-shadow:0 0 0 3px rgba(13,148,136,.14); }
.lbl { display:block; font-size:12px; font-weight:600; color:var(--muted); margin-bottom:5px; }

.btn { display:inline-flex; align-items:center; gap:7px; padding:9px 15px; border-radius:9px; font-size:13.5px; font-weight:600; transition:.15s; white-space:nowrap; }
.btn-p { background:var(--blue); color:#fff; } .btn-p:hover { background:#0F766E; }
.btn-g { background:#fff; color:var(--ink); border:1px solid var(--line); } .btn-g:hover { background:var(--sky); border-color:var(--blue-2); }
.btn-d { background:var(--green); color:#fff; } .btn-d:hover { background:#0E8642; }
.btn:disabled { opacity:.45; cursor:not-allowed; }

.pill { display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:999px; font-size:11.5px; font-weight:600; white-space:nowrap; }
.dot { width:6px; height:6px; border-radius:50%; flex:none; }

table.tbl { width:100%; border-collapse:collapse; }
.tbl th { text-align:left; font-size:11.5px; font-weight:700; color:var(--muted); padding:11px 14px; border-bottom:1px solid var(--line); background:#FBFAFD; white-space:nowrap; }
.tbl td { padding:12px 14px; border-bottom:1px solid #E2E8F0; font-size:13.5px; vertical-align:middle; }
.tbl tbody tr:hover { background:#F8FAFC; }
.tbl tbody tr:last-child td { border-bottom:none; }

.nav-i { display:flex; align-items:center; gap:11px; padding:10px 13px; border-radius:10px; font-size:14px; font-weight:500; color:#E2E8F0; width:100%; text-align:left; transition:.15s; }
.nav-i:hover { background:rgba(255,255,255,.08); color:#fff; }
.nav-i.on { background:var(--blue); color:#fff; font-weight:600; box-shadow:0 4px 14px -4px rgba(13,148,136,.65); }

.kpi-ic { width:46px; height:46px; border-radius:12px; display:grid; place-items:center; flex:none; }
.ovl { position:fixed; inset:0; background:rgba(30,26,46,.55); backdrop-filter:blur(3px); z-index:60; display:flex; align-items:center; justify-content:center; padding:18px; }
.sheet { background:#fff; border-radius:16px; width:100%; max-height:90vh; overflow:auto; box-shadow:0 24px 64px -12px rgba(15,23,42,.4); }

.conv { width:100%; text-align:left; padding:12px 14px; border-bottom:1px solid #E2E8F0; transition:.12s; border-left:3px solid transparent; }
.conv:hover { background:#F8FAFC; }
.conv.on { background:var(--sky); border-left-color:var(--blue); }

.bub { max-width:74%; padding:10px 13px; border-radius:14px; font-size:13.5px; line-height:1.55; white-space:pre-wrap; }
.bub-c { background:#fff; border:1px solid var(--line); border-bottom-left-radius:4px; }
.bub-a { background:var(--blue); color:#fff; border-bottom-right-radius:4px; }
.bub-n { background:var(--amber-bg); border:1px dashed #E9C384; color:#7A5410; border-radius:10px; }
.bub-call { background:#F1F5F9; border:1px solid var(--line); color:#3D5675; border-radius:10px; font-size:12.5px; }

.kp { height:46px; border-radius:10px; border:1px solid var(--line); background:#fff; font-size:17px; font-weight:600; display:grid; place-items:center; transition:.1s; }
.kp:hover { background:var(--sky); border-color:var(--blue-2); }
.kp:active { transform:scale(.95); }
.kp small { display:block; font-size:8.5px; letter-spacing:.08em; color:var(--muted); font-weight:600; }

@keyframes ringPulse { 0%,100%{ box-shadow:0 0 0 0 rgba(18,161,80,.5);} 50%{ box-shadow:0 0 0 9px rgba(18,161,80,0);} }
.live { animation:ringPulse 1.6s infinite; }
@keyframes ringRed { 0%,100%{ box-shadow:0 0 0 0 rgba(220,53,69,.55);} 50%{ box-shadow:0 0 0 10px rgba(220,53,69,0);} }
.ringing { animation:ringRed 1.1s infinite; }
@keyframes barBounce { 0%,100%{ transform:scaleY(.25);} 50%{ transform:scaleY(1);} }
.wv span { display:block; width:3px; height:20px; border-radius:2px; background:#7EE2AC; transform-origin:center; animation:barBounce .9s ease-in-out infinite; }

.lang { display:inline-flex; padding:2px; border-radius:9px; background:#F1F5F9; }
.lang button { padding:5px 11px; border-radius:7px; font-size:12px; font-weight:700; color:var(--muted); transition:.15s; }
.lang button.on { background:#fff; color:var(--blue); box-shadow:0 1px 3px rgba(15,23,42,.12); }

.scroll::-webkit-scrollbar { width:8px; height:8px; }
.scroll::-webkit-scrollbar-thumb { background:#CFCBE3; border-radius:8px; }
.scroll::-webkit-scrollbar-track { background:transparent; }

@keyframes pulseRed { 0%,100%{ opacity:1 } 50%{ opacity:.4 } }
.breach { animation:pulseRed 1.8s infinite; }
`;

/* ═══════════════════════ DOMAIN ═══════════════════════ */

const CH = {
  webchat:{ n: { en: "Webchat", th: "เว็บแชท" },       c: "#6366F1", bg: "#EDEDFC", ic: Globe },
  line:   { n: { en: "LINE OA", th: "LINE OA" },      c: "#06C755", bg: "#E3F9EC", ic: MessageSquare },
  fb:     { n: { en: "Facebook", th: "Facebook" },    c: "#1877F2", bg: "#E7F0FE", ic: MessageSquare },
  tiktok: { n: { en: "TikTok Shop", th: "TikTok Shop" }, c: "#111827", bg: "#EEF0F3", ic: Smartphone },
  shopee: { n: { en: "Shopee", th: "Shopee" },        c: "#EE4D2D", bg: "#FDECE8", ic: ShoppingBag },
  lazada: { n: { en: "Lazada", th: "Lazada" },        c: "#7C4DBF", bg: "#F1EAFB", ic: ShoppingBag },
  email:  { n: { en: "Email", th: "อีเมล" },           c: "#0891B2", bg: "#E0F4F8", ic: Mail },
  phone:  { n: { en: "Phone", th: "โทรศัพท์" },        c: "#0F172A", bg: "#F1F5F9", ic: Phone },
};
const CH_KEYS = ["email", "webchat", "phone", "line", "fb", "tiktok", "shopee", "lazada"];
const P1_CHANNELS = ["email", "webchat", "phone"]; // Phase 1 scope

const ST = {
  new:       { n: { en: "New", th: "งานใหม่" },                 c: "var(--blue)",   bg: "var(--sky)" },
  open:      { n: { en: "In progress", th: "กำลังดำเนินการ" },   c: "var(--cyan)",   bg: "var(--cyan-bg)" },
  pending:   { n: { en: "Waiting on customer", th: "รอลูกค้าตอบ" }, c: "var(--amber)", bg: "var(--amber-bg)" },
  escalated: { n: { en: "Escalated", th: "ส่งต่อทีมอื่น" },       c: "var(--violet)", bg: "var(--violet-bg)" },
  resolved:  { n: { en: "Resolved", th: "แก้ไขแล้ว" },           c: "var(--green)",  bg: "var(--green-bg)" },
  closed:    { n: { en: "Closed", th: "ปิดงาน" },                c: "var(--muted)",  bg: "var(--slate-bg)" },
};
const ST_KEYS = Object.keys(ST);
const OPEN_ST = ["new", "open", "pending", "escalated"];

const PRI = {
  urgent: { n: { en: "Urgent", th: "ด่วนมาก" }, c: "var(--red)",   bg: "var(--red-bg)",   fr: 15,  res: 120 },
  high:   { n: { en: "High", th: "สูง" },       c: "var(--amber)", bg: "var(--amber-bg)", fr: 30,  res: 240 },
  normal: { n: { en: "Normal", th: "ปกติ" },    c: "var(--blue)",  bg: "var(--sky)",      fr: 60,  res: 1440 },
  low:    { n: { en: "Low", th: "ต่ำ" },        c: "var(--muted)", bg: "var(--slate-bg)", fr: 240, res: 4320 },
};
const PRI_KEYS = ["urgent", "high", "normal", "low"];

const CAT = {
  delay:     { en: "Delivery delay", th: "จัดส่งล่าช้า" },
  damaged:   { en: "Damaged on arrival", th: "สินค้าชำรุด/เสียหาย" },
  refund:    { en: "Refund request", th: "ขอคืนเงิน" },
  inquiry:   { en: "Product question", th: "สอบถามสินค้า" },
  exchange:  { en: "Return or exchange", th: "เปลี่ยน/คืนสินค้า" },
  payment:   { en: "Payment problem", th: "ปัญหาการชำระเงิน" },
  complaint: { en: "Service complaint", th: "ร้องเรียนบริการ" },
  tracking:  { en: "Parcel tracking", th: "ติดตามพัสดุ" },
};
const CAT_KEYS = Object.keys(CAT);

const PRODUCTS = [
  { en: "Facial moisturiser 50ml", th: "ครีมบำรุงผิว 50ml" },
  { en: "Vitamin C serum", th: "เซรั่มวิตามินซี" },
  { en: "Formula 3 milk powder 1.2kg", th: "นมผงสูตร 3 ขนาด 1.2kg" },
  { en: "Coffee capsules, 30 pack", th: "กาแฟแคปซูล 30 แคปซูล" },
  { en: "Coffee machine model S", th: "เครื่องชงกาแฟรุ่น S" },
  { en: "Cat food 3kg", th: "อาหารแมว 3kg" },
  { en: "Multivitamin, 60 tablets", th: "วิตามินรวม 60 เม็ด" },
  { en: "Wireless earbuds", th: "หูฟังไร้สาย" },
];

const OPENING = {
  delay: [
    { en: "I ordered on the 12th and still haven't received anything. Could you check for me?", th: "สั่งของไปตั้งแต่วันที่ 12 ตอนนี้ยังไม่ได้เลยค่ะ เช็คให้หน่อยได้ไหมคะ" },
    { en: "The parcel has been sitting at the sorting centre for four days. Please chase it up.", th: "พัสดุค้างที่ศูนย์คัดแยกมา 4 วันแล้วครับ ช่วยตามให้หน่อย" }],
  damaged: [
    { en: "It arrived but the box was crushed and the contents are broken. Can I get a replacement?", th: "ของมาถึงแล้วแต่กล่องบุบ ข้างในแตกเลยค่ะ ขอเปลี่ยนได้ไหม" },
    { en: "The cap was loose and it leaked all over the inside of the box.", th: "ฝาขวดหลวม น้ำหกเลอะทั้งกล่องครับ" }],
  refund: [
    { en: "I cancelled the order a week ago and still have no refund.", th: "ยกเลิกออเดอร์ไปแล้วแต่ยังไม่ได้เงินคืนเลยค่ะ ผ่านมา 7 วันแล้ว" },
    { en: "I was charged twice. Please refund the duplicate payment.", th: "โอนซ้ำ 2 รอบ ขอคืนรอบที่เกินด้วยครับ" }],
  inquiry: [
    { en: "Is this suitable for sensitive skin?", th: "สินค้าตัวนี้ใช้กับผิวแพ้ง่ายได้ไหมคะ" },
    { en: "Do you have a larger size, and what's the difference?", th: "มีขนาดใหญ่กว่านี้ไหมครับ แล้วต่างกันยังไง" }],
  exchange: [
    { en: "I ordered the wrong colour. Can I exchange it? It's still sealed.", th: "สั่งผิดสี ขอเปลี่ยนเป็นสีอื่นได้ไหมคะ ยังไม่ได้แกะ" },
    { en: "I'd like to return this. It doesn't match the description.", th: "ขอคืนสินค้าครับ ไม่ตรงกับที่อธิบายไว้" }],
  payment: [
    { en: "My card was charged but the order still shows as unpaid.", th: "จ่ายผ่านบัตรแล้วเงินตัดแต่ออเดอร์ขึ้นว่ายังไม่จ่ายค่ะ" },
    { en: "I entered the discount code but the price didn't change.", th: "ใส่โค้ดส่วนลดแล้วระบบไม่ลดราคาให้ครับ" }],
  complaint: [
    { en: "I messaged yesterday and nobody has replied. I've been waiting a long time.", th: "ทักไปเมื่อวานยังไม่มีใครตอบเลยค่ะ รอนานมาก" },
    { en: "The agent was very curt with me. I'm not happy about it.", th: "แอดมินตอบห้วนมาก รู้สึกไม่โอเคครับ" }],
  tracking: [
    { en: "Could I get the tracking number? Nothing has arrived.", th: "ขอเลขพัสดุหน่อยค่ะ ยังไม่ได้รับเลย" },
    { en: "The tracking number you gave me doesn't come up anywhere.", th: "เลขแทร็คที่ให้มาเช็กไม่เจอครับ" }],
};

const TEAMS = {
  cx: { en: "CX leadership", th: "หัวหน้าฝ่าย CX" },
  a:  { en: "Support team A", th: "ทีม Support A" },
  b:  { en: "Support team B", th: "ทีม Support B" },
};

const USERS = [
  { id: "u1", n: { en: "Niramol K.", th: "ณิรมล ก." },   role: "admin",   team: "cx", email: "niramol@company.co.th", active: true },
  { id: "u2", n: { en: "Prim S.", th: "ปริม ส." },        role: "manager", team: "a",  email: "prim@company.co.th",    active: true },
  { id: "u3", n: { en: "Vee T.", th: "วี ธ." },           role: "manager", team: "b",  email: "vee@company.co.th",     active: true },
  { id: "u4", n: { en: "Gyb W.", th: "กิ๊บ ว." },          role: "agent",   team: "a",  email: "gyb@company.co.th",     active: true },
  { id: "u5", n: { en: "Ohm P.", th: "โอม ป." },          role: "agent",   team: "a",  email: "ohm@company.co.th",     active: true },
  { id: "u6", n: { en: "Cream T.", th: "ครีม ธ." },       role: "agent",   team: "a",  email: "cream@company.co.th",   active: true },
  { id: "u7", n: { en: "Ploy M.", th: "พลอย ม." },        role: "agent",   team: "b",  email: "ploy@company.co.th",    active: true },
  { id: "u8", n: { en: "Marker R.", th: "มาร์คเกอร์ ร." }, role: "agent",  team: "b",  email: "marker@company.co.th",  active: false },
];
const AGENTS = USERS.filter((u) => u.role === "agent");

const FIRST = [["Somying","สมหญิง"],["Wirat","วิรัตน์"],["Nuttapon","ณัฐพล"],["Piyada","ปิยะดา"],["Chalida","ชลิดา"],["Teeradech","ธีรเดช"],["Kamonchanok","กมลชนก"],["Suriya","สุริยา"],["Pattra","ภัทรา"],["Anucha","อนุชา"],["Jiraporn","จิราพร"],["Sirichai","ศิริชัย"],["Benjamas","เบญจมาศ"],["Todsapon","ทศพล"],["Napatsorn","นภัสสร"],["Worawut","วรวุฒิ"],["Preeya","ปรียา"],["Kittipong","กิตติพงศ์"],["Orathai","อรทัย"],["Chanathip","ชนาธิป"]];
const LAST = [["Thongdee","ทองดี"],["Sangthong","แสงทอง"],["Wattanakul","วัฒนกุล"],["Srisuk","ศรีสุข"],["Phandee","พันธุ์ดี"],["Insee","อินทรีย์"],["Boonma","บุญมา"],["Rattanachot","รัตนโชติ"],["Charoensuk","เจริญสุข"],["Maneewong","มณีวงศ์"],["Sakulthong","สกุลทอง"],["Pinkaew","ปิ่นแก้ว"],["Thanakit","ธนกิจ"],["Wongsawang","วงศ์สว่าง"],["Areerak","อารีรักษ์"]];

const TAGS = [{ en: "VIP", th: "VIP" }, { en: "Repeat buyer", th: "ซื้อซ้ำ" }, { en: "Escalation risk", th: "เสี่ยงร้องเรียน" }, { en: "Under warranty", th: "ประกันสินค้า" }];

const now = Date.now();
const MIN = 60000;
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const ri = (n) => Math.floor(Math.random() * n);

function seedTickets() {
  const out = [];
  for (let i = 0; i < 54; i++) {
    const catK = rnd(CAT_KEYS);
    const pri = ["urgent", "high", "normal", "normal", "normal", "low"][ri(6)];
    const created = now - ri(6000) * MIN;
    const closedish = Math.random() < 0.52;
    const status = closedish ? (Math.random() < 0.55 ? "closed" : "resolved") : rnd(["new", "open", "open", "pending", "escalated"]);
    const responded = status !== "new" && Math.random() < 0.92;
    const frMin = responded ? Math.round(PRI[pri].fr * (0.25 + Math.random() * 1.9)) : null;
    const resMin = ["resolved", "closed"].includes(status) ? Math.round(PRI[pri].res * (0.2 + Math.random() * 1.6)) : null;
    const f = rnd(FIRST), l = rnd(LAST);
    const product = rnd(PRODUCTS);
    const msgs = [{ from: "customer", text: rnd(OPENING[catK]), at: created }];
    if (responded) msgs.push({ from: "agent", at: created + frMin * MIN, text: { en: "Hello, thank you for getting in touch. Could you share your order number so I can look into this right away?", th: "สวัสดีค่ะ ขอบคุณที่แจ้งเข้ามานะคะ ขอรบกวนเลขที่คำสั่งซื้อเพื่อตรวจสอบให้ทันทีค่ะ" } });
    if (responded && Math.random() < 0.6) {
      const so = `SO${240000 + ri(9999)}`;
      msgs.push({ from: "customer", at: created + (frMin + 5 + ri(40)) * MIN, text: { en: `It's ${so}.`, th: `เลขออเดอร์ ${so} ค่ะ` } });
    }
    out.push({
      id: "TK-" + String(4200 + i),
      catKey: catK, product,
      customer: { en: `${f[0]} ${l[0]}`, th: `${f[1]} ${l[1]}` },
      phone: `08${ri(10)}-${1000 + ri(9000)}-${1000 + ri(9000)}`,
      email: `cust${1000 + i}@mail.com`,
      order: Math.random() < 0.78 ? `SO${240000 + ri(9999)}` : null,
      channel: rnd(P1_CHANNELS), priority: pri, status,
      owner: status === "new" && Math.random() < 0.5 ? null : rnd(AGENTS).id,
      createdAt: created, firstResponseMin: frMin, resolveMin: resMin,
      csat: ["resolved", "closed"].includes(status) && Math.random() < 0.62 ? [5, 5, 5, 4, 4, 3, 2, 1][ri(8)] : null,
      reopened: Math.random() < 0.07,
      tags: Math.random() < 0.3 ? [rnd(TAGS)] : [],
      messages: msgs,
    });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

/* Richer demo dataset for the Reports tab only — never written to Supabase.
   Spreads cases over `days` days with a weekday/weekend rhythm and a light
   month-end spike so the charts look like a real service desk. */
function seedDemoTickets(count = 420, days = 90) {
  const out = [];
  const day0 = new Date(); day0.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    const catK = rnd(CAT_KEYS);
    const pri = ["urgent", "high", "normal", "normal", "normal", "normal", "low"][ri(7)];
    // pick a day, weighted: weekends quieter, days 25-31 busier
    let back = ri(days);
    const d = new Date(day0.getTime() - back * 86400000);
    const wd = d.getDay();
    if ((wd === 0 || wd === 6) && Math.random() < 0.45) back = ri(days);
    const dd = new Date(day0.getTime() - back * 86400000);
    const created = dd.getTime() + (8 + ri(11)) * 60 * MIN + ri(60) * MIN;
    const age = (Date.now() - created) / 86400000;
    // older cases are almost always finished; recent ones are still moving
    const closedish = age > 5 ? Math.random() < 0.94 : Math.random() < 0.45;
    const status = closedish ? (Math.random() < 0.62 ? "closed" : "resolved")
      : rnd(["new", "open", "open", "pending", "escalated"]);
    const responded = status !== "new" && Math.random() < 0.95;
    // SLA attainment ~86%
    const frMin = responded
      ? Math.round(PRI[pri].fr * (Math.random() < 0.86 ? (0.15 + Math.random() * 0.8) : (1.05 + Math.random() * 1.4)))
      : null;
    const resMin = ["resolved", "closed"].includes(status) ? Math.round(PRI[pri].res * (0.2 + Math.random() * 1.5)) : null;
    const f = rnd(FIRST), l = rnd(LAST);
    const msgs = [{ from: "customer", text: rnd(OPENING[catK]), at: created }];
    if (responded) msgs.push({ from: "agent", at: created + frMin * MIN, text: { en: "Thank you for getting in touch — checking this for you now.", th: "ขอบคุณที่แจ้งเข้ามานะคะ กำลังตรวจสอบให้ค่ะ" } });
    out.push({
      id: "DEMO-" + String(1000 + i),
      demo: true,
      catKey: catK, product: rnd(PRODUCTS),
      customer: { en: `${f[0]} ${l[0]}`, th: `${f[1]} ${l[1]}` },
      phone: `08${ri(10)}-${1000 + ri(9000)}-${1000 + ri(9000)}`,
      email: `demo${1000 + i}@mail.com`,
      order: Math.random() < 0.8 ? `SO${240000 + ri(9999)}` : null,
      channel: ["email", "email", "email", "webchat", "webchat", "phone", "line", "shopee", "lazada", "tiktok"][ri(10)],
      priority: pri, status,
      owner: status === "new" && Math.random() < 0.35 ? null : rnd(AGENTS).id,
      createdAt: created, firstResponseMin: frMin, resolveMin: resMin,
      csat: ["resolved", "closed"].includes(status) && Math.random() < 0.68 ? [5, 5, 5, 5, 4, 4, 4, 3, 2, 1][ri(10)] : null,
      reopened: Math.random() < 0.06,
      tags: Math.random() < 0.3 ? [rnd(TAGS)] : [],
      messages: msgs,
    });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

function computeTrend(tickets, days = 14) {
  // real volume from actual cases (replaces the demo seedTrend)
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const day0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const day1 = day0 + 86400000;
    const opened = tickets.filter((x) => x.createdAt >= day0 && x.createdAt < day1);
    const closed = tickets.filter((x) => ["resolved", "closed"].includes(x.status) && x.resolveMin != null
      && (x.createdAt + x.resolveMin * MIN) >= day0 && (x.createdAt + x.resolveMin * MIN) < day1);
    const rated = closed.filter((x) => x.csat);
    out.push({
      day: `${d.getDate()}/${d.getMonth() + 1}`,
      opened: opened.length, closed: closed.length,
      csat: rated.length ? +(rated.reduce((s, x) => s + x.csat, 0) / rated.length).toFixed(2) : null,
    });
  }
  return out;
}

function seedTrend() {
  const out = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const inn = 70 + ri(70);
    out.push({ day: `${d.getDate()}/${d.getMonth() + 1}`, opened: inn, closed: inn - 14 + ri(28), csat: +(3.9 + Math.random() * 0.95).toFixed(2) });
  }
  return out;
}

const CANNED_SEED = [
  { id: "c1", cat: { en: "General", th: "ทั่วไป" }, title: { en: "Opening greeting", th: "ทักทายเปิดเคส" },
    body: { en: "Hello, thanks for reaching out. 🙏\nCould you send me your order number and a contact number so I can look into this straight away?", th: "สวัสดีค่ะ ขอบคุณที่ติดต่อเข้ามานะคะ 🙏\nรบกวนขอเลขที่คำสั่งซื้อและเบอร์ติดต่อกลับ เพื่อให้เราตรวจสอบให้ทันทีค่ะ" } },
  { id: "c2", cat: { en: "Delivery", th: "จัดส่ง" }, title: { en: "Chasing a late parcel", th: "ตามพัสดุล่าช้า" },
    body: { en: "I've checked with the courier. Your parcel is out for delivery and should arrive within 1–2 working days.\nIf it hasn't reached you by then, message me back and I'll open a trace immediately.", th: "เราตรวจสอบกับขนส่งให้แล้วนะคะ พัสดุอยู่ระหว่างนำจ่าย คาดว่าจะถึงภายใน 1–2 วันทำการค่ะ\nหากเลยกำหนดนี้ รบกวนแจ้งกลับมาได้เลย เราจะเปิดเรื่องตามให้ทันทีค่ะ" } },
  { id: "c3", cat: { en: "Product", th: "สินค้า" }, title: { en: "Damaged item — request photos", th: "สินค้าชำรุด ขอรูป" },
    body: { en: "I'm really sorry this happened. 🙏\nCould you send three photos — the outer box, the inside, and the damage itself? I'll open a claim as soon as they come through.", th: "ต้องขออภัยอย่างสูงกับสิ่งที่เกิดขึ้นค่ะ 🙏\nรบกวนขอรูปสินค้าและกล่องพัสดุ 3 รูป (ด้านนอก ด้านใน และจุดที่เสียหาย) เพื่อเปิดเคสเคลมให้ทันทีค่ะ" } },
  { id: "c4", cat: { en: "Finance", th: "การเงิน" }, title: { en: "Refund confirmation", th: "แจ้งผลคืนเงิน" },
    body: { en: "Your refund has been processed. ✅\nIt should reach your account within 3–7 working days, depending on your bank's cycle.", th: "ดำเนินการคืนเงินเรียบร้อยแล้วค่ะ ✅\nยอดจะเข้าบัญชีภายใน 3–7 วันทำการ ขึ้นอยู่กับรอบของธนาคารนะคะ" } },
  { id: "c5", cat: { en: "General", th: "ทั่วไป" }, title: { en: "Closing thank-you", th: "ปิดเคส ขอบคุณ" },
    body: { en: "Thank you for letting us help. 🙏\nMessage us any time if anything else comes up. If you have a moment, a quick rating helps us improve.", th: "ขอบคุณที่ให้เราได้ดูแลนะคะ 🙏\nหากมีข้อสงสัยเพิ่มเติมทักกลับมาได้ตลอดเลยค่ะ รบกวนให้คะแนนความพึงพอใจเพื่อพัฒนาบริการด้วยนะคะ" } },
];

const KB_SEED = [
  { id: "k1", views: 412, cat: { en: "Product", th: "สินค้า" }, title: { en: "Claiming transit damage", th: "ขั้นตอนเคลมสินค้าชำรุดจากการขนส่ง" },
    body: { en: "1. Ask for three photos within 7 days of delivery\n2. Check the tracking number against the courier's record\n3. Open a claim in the system and attach the photos\n4. Tell the customer within 24 hours whether the claim passed\n5. If it passed, ship the replacement within 3 working days", th: "1. ขอรูปถ่าย 3 มุม ภายใน 7 วันนับจากวันรับของ\n2. ตรวจสอบเลขพัสดุกับระบบขนส่ง\n3. เปิดเคสเคลมในระบบ พร้อมแนบรูป\n4. แจ้งลูกค้าภายใน 24 ชม. ว่าเคลมผ่านหรือไม่\n5. หากผ่าน ส่งของทดแทนภายใน 3 วันทำการ" } },
  { id: "k2", views: 388, cat: { en: "Finance", th: "การเงิน" }, title: { en: "Refund policy and timing", th: "นโยบายคืนเงินและระยะเวลา" },
    body: { en: "Refunds always go back to the original payment method.\n• Credit card — 7 to 14 working days\n• PromptPay or bank transfer — 3 to 5 working days\n• Platform wallet — within 24 hours\nWe must receive the item back first, unless it never reached the customer.", th: "คืนเงินเข้าช่องทางเดิมเสมอ\n• บัตรเครดิต 7–14 วันทำการ\n• พร้อมเพย์/โอน 3–5 วันทำการ\n• กระเป๋าเงินแพลตฟอร์ม ภายใน 24 ชม.\nต้องได้รับสินค้าคืนก่อน ยกเว้นกรณีของไม่ถึงมือลูกค้า" } },
  { id: "k3", views: 265, cat: { en: "General", th: "ทั่วไป" }, title: { en: "How to set case priority", th: "เกณฑ์จัดระดับความเร่งด่วนของเคส" },
    body: { en: "Urgent — the customer is out of pocket, or there's a real risk of a public complaint\nHigh — wrong or broken item that needs reshipping\nNormal — general questions, parcel tracking\nLow — suggestions and feedback", th: "ด่วนมาก — ลูกค้าเสียหายทางการเงิน หรือมีความเสี่ยงถูกร้องเรียนสาธารณะ\nสูง — ของชำรุด/ผิดรุ่น ที่ต้องส่งใหม่\nปกติ — สอบถามทั่วไป ติดตามพัสดุ\nต่ำ — ข้อเสนอแนะ ความคิดเห็น" } },
  { id: "k4", views: 501, cat: { en: "Skills", th: "ทักษะ" }, title: { en: "Handling an angry customer", th: "วิธีรับมือลูกค้าที่ไม่พอใจ" },
    body: { en: "1. Let them finish. Don't cut in.\n2. Apologise for the experience, not for fault you haven't established.\n3. Repeat the problem back in your own words and let them confirm it.\n4. Offer something you can actually deliver, with a date.\n5. Follow up yourself. Don't hand the case off.", th: "1. รับฟังจนจบ อย่าตัดบท\n2. ขอโทษต่อ 'ประสบการณ์' ไม่ใช่ยอมรับความผิดทันที\n3. ทวนปัญหาด้วยคำของเราเอง ให้ลูกค้ายืนยัน\n4. เสนอทางออกที่ทำได้จริง พร้อมกรอบเวลา\n5. ติดตามผลกลับด้วยตัวเอง อย่าโยนเคส" } },
];

/* helpers */
const days0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const ago = (ms) => {
  const m = Math.floor((Date.now() - ms) / MIN);
  if (m < 1) return t("justNow");
  if (m < 60) return t("minAgo", m);
  if (m < 1440) return t("hrAgo", Math.floor(m / 60));
  return t("dayAgo", Math.floor(m / 1440));
};
const clock = (ms) => new Date(ms).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
const dur = (m) => m == null ? "—" : m < 60 ? t("uMin", m) : m < 1440 ? t("uHr", (m / 60).toFixed(1)) : t("uDay", (m / 1440).toFixed(1));
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const fmt = (n) => new Intl.NumberFormat(locale()).format(n);
const user = (id) => USERS.find((u) => u.id === id);
const uname = (id) => (user(id) ? tv(user(id).n) : t("unassigned"));
const subjectOf = (tk) => tk.subject ? tv(tk.subject) : `${tv(CAT[tk.catKey])} · ${tv(tk.product)}`;

function sla(tk) {
  const target = PRI[tk.priority].fr;
  if (tk.firstResponseMin != null) {
    const ok = tk.firstResponseMin <= target;
    return { state: ok ? "met" : "missed", label: ok ? t("slaMet") : t("slaMissed"), left: null };
  }
  const left = target - Math.floor((Date.now() - tk.createdAt) / MIN);
  if (left < 0) return { state: "breach", label: t("slaOver", dur(-left)), left };
  if (left <= target * 0.3) return { state: "risk", label: t("slaLeft", dur(left)), left };
  return { state: "ok", label: t("slaLeft", dur(left)), left };
}
const SLA_C = { met: "var(--green)", missed: "var(--red)", breach: "var(--red)", risk: "var(--amber)", ok: "var(--muted)" };
const SLA_BG = { met: "var(--green-bg)", missed: "var(--red-bg)", breach: "var(--red-bg)", risk: "var(--amber-bg)", ok: "var(--slate-bg)" };

/* ═══════════════════════ ATOMS ═══════════════════════ */

const Chip = ({ map, k }) => <span className="pill" style={{ background: map[k].bg, color: map[k].c }}><span className="dot" style={{ background: map[k].c }} />{tv(map[k].n)}</span>;
const ChanChip = ({ k }) => { const c = CH[k]; const I = c.ic; return <span className="pill" style={{ background: c.bg, color: c.c }}><I size={11} />{tv(c.n)}</span>; };
const SlaChip = ({ t: tk }) => { const s = sla(tk); return <span className={`pill ${s.state === "breach" ? "breach" : ""}`} style={{ background: SLA_BG[s.state], color: SLA_C[s.state] }}><Timer size={11} />{s.label}</span>; };

const Stars = ({ n, size = 13 }) => (
  <span className="inline-flex gap-0.5">{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} fill={i <= n ? "#E8940C" : "none"} style={{ color: i <= n ? "#E8940C" : "#CBD5E1" }} />)}</span>
);

const LangToggle = ({ lang, setLang }) => (
  <div className="lang" role="group" aria-label={t("langLabel")}>
    <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
    <button className={lang === "th" ? "on" : ""} onClick={() => setLang("th")}>ไทย</button>
  </div>
);

const Empty = ({ icon: Ic, title, sub, action }) => (
  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
    <div className="kpi-ic mb-3" style={{ background: "var(--sky)" }}><Ic size={22} style={{ color: "var(--blue)" }} /></div>
    <p className="font-semibold text-[15px]">{title}</p>
    <p className="text-[13px] mt-1" style={{ color: "var(--muted)" }}>{sub}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);

function Modal({ title, sub, onClose, children, w = 580 }) {
  useEffect(() => { const h = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  return (
    <div className="ovl" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet scroll" style={{ maxWidth: w }}>
        <div className="flex items-start justify-between px-6 py-5 border-b" style={{ borderColor: "var(--line)" }}>
          <div><h3 className="text-[17px] font-bold">{title}</h3>{sub && <p className="text-[12.5px] mt-0.5" style={{ color: "var(--muted)" }}>{sub}</p>}</div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

const Kpi = ({ icon: Ic, label, value, unit, sub, tint, bg }) => (
  <div className="card p-5 flex items-center gap-4">
    <div className="kpi-ic" style={{ background: bg }}><Ic size={21} style={{ color: tint }} /></div>
    <div className="min-w-0">
      <p className="text-[12.5px] font-medium" style={{ color: "var(--muted)" }}>{label}</p>
      <p className="text-[26px] font-bold leading-tight tracking-tight">{value}{unit && <span className="text-[13px] font-semibold ml-1" style={{ color: "var(--muted)" }}>{unit}</span>}</p>
      {sub && <p className="text-[11.5px] mt-0.5" style={{ color: "var(--muted)" }}>{sub}</p>}
    </div>
  </div>
);

/* ═══════════════════════ LOGIN ═══════════════════════ */

function Login({ onLogin, lang, setLang }) {
  const [email, setEmail] = useState("niramol@company.co.th");
  const [pw, setPw] = useState("demo1234");
  const [err, setErr] = useState("");
  const go = () => {
    const u = USERS.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!u) return setErr(t("errNoAccount"));
    if (!u.active) return setErr(t("errDisabled"));
    if (pw.length < 4) return setErr(t("errPw"));
    onLogin(u);
  };
  const roleLbl = { admin: t("rAdmin"), manager: t("rSup"), agent: t("rAgent") };
  return (
    <div className={`svc ${lang}`} style={{ display: "grid", placeItems: "center", padding: 20 }}>
      <style>{CSS}</style>
      <div className="w-full grid gap-5" style={{ maxWidth: 940, gridTemplateColumns: "1.05fr .95fr" }}>
        <div className="card p-9 hidden md:flex flex-col justify-between" style={{ background: "linear-gradient(150deg,var(--navy),var(--navy-2) 55%,var(--blue))", border: "none", color: "#fff" }}>
          <div>
            <span className="pill" style={{ background: "rgba(255,255,255,.16)", color: "#fff" }}><Zap size={12} />{t("loginBadge")}</span>
            <h1 className="text-[34px] font-bold leading-tight mt-5 whitespace-pre-line">{t("loginH1")}</h1>
            <p className="text-[14px] mt-2" style={{ color: "#CCFBF1" }}>{t("loginSub")}</p>
          </div>
          <ul className="space-y-3 mt-8">
            {[[Inbox, "f1t", "f1d"], [Timer, "f2t", "f2d"], [BookOpen, "f3t", "f3d"], [ThumbsUp, "f4t", "f4d"]].map(([Ic, a, b]) => (
              <li key={a} className="flex gap-3 items-start">
                <span className="rounded-lg p-2 flex-none" style={{ background: "rgba(255,255,255,.12)" }}><Ic size={16} /></span>
                <span><b className="text-[14px]">{t(a)}</b><br /><span className="text-[12.5px]" style={{ color: "#99F6E4" }}>{t(b)}</span></span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 mt-8">
            {CH_KEYS.map((k) => <span key={k} className="pill" style={{ background: "rgba(255,255,255,.14)", color: "#fff" }}>{tv(CH[k].n)}</span>)}
          </div>
        </div>

        <div className="card p-8">
          <div className="flex items-start justify-between">
            <div><h2 className="text-[21px] font-bold">{t("signIn")}</h2>
              <p className="text-[13px] mt-1" style={{ color: "var(--muted)" }}>{t("signInSub")}</p></div>
            <LangToggle lang={lang} setLang={setLang} />
          </div>
          <label className="lbl mt-6">{t("email")}</label>
          <input className="fld" value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && go()} />
          <label className="lbl mt-4">{t("password")}</label>
          <input className="fld" type="password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && go()} />
          {err && <div className="flex gap-2 items-start mt-4 p-3 rounded-lg text-[12.5px]" style={{ background: "var(--red-bg)", color: "var(--red)" }}><AlertTriangle size={15} className="flex-none mt-px" />{err}</div>}
          <button className="btn btn-p w-full justify-center mt-5" style={{ padding: 11 }} onClick={go}>{t("signIn")}</button>
          <p className="lbl mt-7 mb-2">{t("demoAccounts")}</p>
          <div className="space-y-1.5">
            {[USERS[0], USERS[1], USERS[3]].map((u) => (
              <button key={u.id} onClick={() => { setEmail(u.email); setErr(""); }} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left"
                      style={{ borderColor: email === u.email ? "var(--blue)" : "var(--line)", background: email === u.email ? "var(--sky)" : "#fff" }}>
                <span className="text-[13px] font-semibold">{tv(u.n)}</span>
                <span className="pill" style={{ background: "var(--sky)", color: "var(--blue)" }}>{roleLbl[u.role]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ DASHBOARD ═══════════════════════ */

function Dashboard({ tickets, trend, scope, go, open, me }) {
  const rows = scope(tickets);
  const todayIn = rows.filter((x) => x.createdAt >= days0());
  const backlog = rows.filter((x) => OPEN_ST.includes(x.status));
  const answered = rows.filter((x) => x.firstResponseMin != null);
  const met = answered.filter((x) => x.firstResponseMin <= PRI[x.priority].fr);
  const slaPct = answered.length ? Math.round((met.length / answered.length) * 100) : 0;
  const rated = rows.filter((x) => x.csat);
  const csat = rated.length ? (rated.reduce((s, x) => s + x.csat, 0) / rated.length).toFixed(2) : "—";
  const atRisk = backlog.filter((x) => ["breach", "risk"].includes(sla(x).state)).sort((a, b) => sla(a).left - sla(b).left);

  const byChan = CH_KEYS.map((k) => ({ name: tv(CH[k].n), value: rows.filter((x) => x.channel === k).length, c: CH[k].c })).filter((d) => d.value);
  const byCat = CAT_KEYS.map((k) => ({ name: tv(CAT[k]), v: rows.filter((x) => x.catKey === k).length })).sort((a, b) => b.v - a.v);
  const load = AGENTS.map((a) => {
    const ts = tickets.filter((x) => x.owner === a.id);
    const opn = ts.filter((x) => OPEN_ST.includes(x.status));
    const r = ts.filter((x) => x.csat);
    return { id: a.id, name: tv(a.n), team: tv(TEAMS[a.team]), open: opn.length,
             breach: opn.filter((x) => sla(x).state === "breach").length,
             csat: r.length ? (r.reduce((s, x) => s + x.csat, 0) / r.length).toFixed(1) : "—" };
  }).sort((a, b) => b.open - a.open);

  return (
    <div className="space-y-5">
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(215px,1fr))" }}>
        <Kpi icon={Inbox} label={t("kToday")} value={todayIn.length} unit={t("uCases")} sub={t("kTodaySub", todayIn.filter((x) => ["resolved", "closed"].includes(x.status)).length)} tint="var(--blue)" bg="var(--sky)" />
        <Kpi icon={Ticket} label={t("kBacklog")} value={backlog.length} unit={t("uCases")} sub={t("kBacklogSub", backlog.filter((x) => !x.owner).length)} tint="var(--cyan)" bg="var(--cyan-bg)" />
        <Kpi icon={Timer} label={t("kSla")} value={slaPct} unit="%" sub={t("kSlaSub", dur(Math.round(answered.reduce((s, x) => s + x.firstResponseMin, 0) / (answered.length || 1))))} tint={slaPct >= 85 ? "var(--green)" : "var(--amber)"} bg={slaPct >= 85 ? "var(--green-bg)" : "var(--amber-bg)"} />
        <Kpi icon={ThumbsUp} label={t("kCsat")} value={csat} unit={t("uOf5")} sub={t("kCsatSub", rated.length)} tint="var(--amber)" bg="var(--amber-bg)" />
      </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--line)" }}>
            <div><h3 className="font-bold text-[15px]">{t("needAtt")}</h3>
              <p className="text-[12px] mt-0.5" style={{ color: "var(--muted)" }}>{t("needAttSub")}</p></div>
            <button className="btn btn-g" style={{ padding: "6px 12px" }} onClick={() => go("tickets")}>{t("viewAll")} <ChevronRight size={14} /></button>
          </div>
          {atRisk.length === 0 ? <Empty icon={CheckCircle2} title={t("noRisk")} sub={t("noRiskSub")} /> : (
            <table className="tbl">
              <thead><tr><th>{t("cCase")}</th><th>{t("cChannel")}</th><th>{t("cPriority")}</th><th>{t("cSla")}</th><th>{t("cOwner")}</th><th></th></tr></thead>
              <tbody>
                {atRisk.slice(0, 6).map((x) => (
                  <tr key={x.id}>
                    <td><div className="font-semibold truncate" style={{ maxWidth: 460 }}>{subjectOf(x)}</div>
                        <div className="text-[11.5px]" style={{ color: "var(--muted)" }}>{x.id} · {tv(x.customer)}</div></td>
                    <td><ChanChip k={x.channel} /></td>
                    <td><Chip map={PRI} k={x.priority} /></td>
                    <td><SlaChip t={x} /></td>
                    <td style={{ color: x.owner ? "var(--ink)" : "var(--amber)" }}>{uname(x.owner)}</td>
                    <td><button className="btn btn-p" style={{ padding: "6px 12px" }} onClick={() => open(x)}>{t("openCase")}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "1.55fr 1fr" }}>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-[15px]">{t("chVolume")}</h3>
            <span className="text-[12px]" style={{ color: "var(--muted)" }}>{t("last14")}</span>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={trend} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
              <defs><linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0D9488" stopOpacity={.28} /><stop offset="100%" stopColor="#0D9488" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 4" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 12.5 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={7} />
              <Area type="monotone" dataKey="opened" name={t("sNew")} stroke="#0D9488" strokeWidth={2.4} fill="url(#gIn)" />
              <Line type="monotone" dataKey="closed" name={t("sClosed")} stroke="#12A150" strokeWidth={2.2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="font-bold text-[15px] mb-1">{t("chChannel")}</h3>
          <p className="text-[12px] mb-1" style={{ color: "var(--muted)" }}>{t("totalCases", rows.length)}</p>
          <ResponsiveContainer width="100%" height={190}>
            <PieChart>
              <Pie data={byChan} dataKey="value" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="none">
                {byChan.map((d) => <Cell key={d.name} fill={d.c} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 12.5 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-1">
            {byChan.map((d) => (
              <div key={d.name} className="flex items-center gap-2 text-[12px]">
                <span className="dot" style={{ background: d.c }} /><span className="truncate" style={{ color: "var(--muted)" }}>{d.name}</span><b className="ml-auto">{d.value}</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      {me && ["admin", "manager"].includes(me.role) && <LiveMonitor tickets={tickets} open={open} />}

      <div className="grid gap-4" style={{ gridTemplateColumns: "1.55fr 1fr" }}>
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--line)" }}><h3 className="font-bold text-[15px]">{t("teamLoad")}</h3></div>
        <table className="tbl">
          <thead><tr><th>{t("cAgent")}</th><th>{t("cTeam")}</th><th className="text-right">{t("cOpen")}</th><th className="text-right">{t("cBreach")}</th><th className="text-right">{t("cCsat")}</th><th style={{ width: 190 }}>{t("cLoad")}</th></tr></thead>
          <tbody>
            {load.map((a) => (
              <tr key={a.id}>
                <td className="font-semibold">{a.name}</td>
                <td style={{ color: "var(--muted)" }}>{a.team}</td>
                <td className="text-right font-semibold">{a.open}</td>
                <td className="text-right">{a.breach > 0 ? <span className="pill" style={{ background: "var(--red-bg)", color: "var(--red)" }}>{a.breach}</span> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                <td className="text-right">{a.csat}</td>
                <td><div className="rounded-full overflow-hidden" style={{ height: 6, background: "#E2E8F0" }}>
                  <div style={{ width: `${Math.min(100, a.open * 9)}%`, height: "100%", background: a.open > 9 ? "var(--red)" : a.open > 5 ? "var(--amber)" : "var(--green)" }} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

        <div className="card p-5">
          <h3 className="font-bold text-[15px] mb-3">{t("topCats")}</h3>
          <ResponsiveContainer width="100%" height={252}>
            <BarChart data={byCat} layout="vertical" margin={{ left: 14, right: 12 }}>
              <CartesianGrid strokeDasharray="3 4" stroke="#E2E8F0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={104} tick={{ fontSize: 10.5, fill: "#5D6188" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 12.5 }} cursor={{ fill: "#F5F3FA" }} />
              <Bar dataKey="v" name={t("cCount")} fill="#0D9488" radius={[0, 4, 4, 0]} barSize={11} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ TICKETS ═══════════════════════ */

function Tickets({ tickets, setTickets, me, scope, open, toast }) {
  const [q, setQ] = useState("");
  const [fs, setFs] = useState("open");
  const [fp, setFp] = useState("all");
  const [fc, setFc] = useState("all");
  const [fo, setFo] = useState("all");
  const [sel, setSel] = useState([]);
  const [nw, setNw] = useState(false);
  const canAssign = me.role !== "agent";

  const rows = useMemo(() => scope(tickets).filter((x) => {
    const s = q.trim().toLowerCase();
    if (s && !`${subjectOf(x)} ${tv(x.customer)} ${x.id} ${x.order || ""} ${x.phone}`.toLowerCase().includes(s)) return false;
    if (fs === "open" ? !OPEN_ST.includes(x.status) : fs !== "all" && x.status !== fs) return false;
    if (fp !== "all" && x.priority !== fp) return false;
    if (fc !== "all" && x.channel !== fc) return false;
    if (fo !== "all" && (fo === "none" ? x.owner : x.owner !== fo)) return false;
    return true;
  }), [tickets, q, fs, fp, fc, fo, me]);

  const bulk = (patch, msg) => { setTickets((p) => p.map((x) => sel.includes(x.id) ? { ...x, ...patch } : x)); toast(`${msg} ${t("nCases", sel.length)}`); setSel([]); };

  const exportX = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map((x) => ({
      [t("cCase")]: x.id, [t("cSubject")]: subjectOf(x), [t("cCustomer")]: tv(x.customer), [t("cPhone")]: x.phone,
      [t("fOrder")]: x.order || "", [t("cChannel")]: tv(CH[x.channel].n), [t("cCategory")]: tv(CAT[x.catKey]),
      [t("cPriority")]: tv(PRI[x.priority].n), [t("cStatus")]: tv(ST[x.status].n), [t("cOwner")]: uname(x.owner),
      [t("cFirstAvg")]: x.firstResponseMin ?? "", [t("cResAvg")]: x.resolveMin ?? "", CSAT: x.csat ?? "",
      [t("cReopen")]: x.reopened ? "Y" : "N",
    }))), "Cases");
    XLSX.writeFile(wb, `cases-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast(t("casesExported", rows.length));
  };

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap gap-2.5 items-center">
        <div className="relative flex-1" style={{ minWidth: 220 }}>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
          <input className="fld pl-9" placeholder={t("searchCases")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="fld" style={{ width: 168 }} value={fs} onChange={(e) => setFs(e.target.value)}>
          <option value="open">{t("fOpenOnly")}</option><option value="all">{t("fAllStatus")}</option>
          {ST_KEYS.map((k) => <option key={k} value={k}>{tv(ST[k].n)}</option>)}
        </select>
        <select className="fld" style={{ width: 142 }} value={fp} onChange={(e) => setFp(e.target.value)}>
          <option value="all">{t("fAllPri")}</option>{PRI_KEYS.map((k) => <option key={k} value={k}>{tv(PRI[k].n)}</option>)}
        </select>
        <select className="fld" style={{ width: 142 }} value={fc} onChange={(e) => setFc(e.target.value)}>
          <option value="all">{t("fAllChan")}</option>{CH_KEYS.map((k) => <option key={k} value={k}>{tv(CH[k].n)}</option>)}
        </select>
        {canAssign && (
          <select className="fld" style={{ width: 168 }} value={fo} onChange={(e) => setFo(e.target.value)}>
            <option value="all">{t("fAllOwner")}</option><option value="none">{t("unassigned")}</option>
            {AGENTS.map((a) => <option key={a.id} value={a.id}>{tv(a.n)}</option>)}
          </select>
        )}
        <button className="btn btn-g" onClick={exportX}><Download size={15} />{t("exportBtn")}</button>
        <button className="btn btn-p" onClick={() => setNw(true)}><Plus size={15} />{t("newCase")}</button>
      </div>

      {sel.length > 0 && (
        <div className="card px-4 py-3 flex flex-wrap items-center gap-2.5" style={{ borderColor: "var(--blue)", background: "var(--sky)" }}>
          <b className="text-[13.5px]">{t("selectedN", sel.length)}</b>
          <button className="btn btn-g" style={{ padding: "7px 13px" }} onClick={() => bulk({ owner: me.id, status: "open" }, t("tookSelf"))}>{t("takeSelf")}</button>
          {canAssign && (
            <select className="fld" style={{ width: 186, padding: "7px 11px" }} defaultValue=""
                    onChange={(e) => e.target.value && bulk({ owner: e.target.value, status: "open" }, t("assignedTo", uname(e.target.value)))}>
              <option value="">{t("assignTo")}</option>{AGENTS.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{tv(a.n)}</option>)}
            </select>
          )}
          <select className="fld" style={{ width: 176, padding: "7px 11px" }} defaultValue=""
                  onChange={(e) => e.target.value && bulk({ priority: e.target.value }, t("priChanged"))}>
            <option value="">{t("setPri")}</option>{PRI_KEYS.map((k) => <option key={k} value={k}>{tv(PRI[k].n)}</option>)}
          </select>
          <button className="btn btn-d" style={{ padding: "7px 13px" }} onClick={() => bulk({ status: "closed" }, t("closedN"))}>{t("closeCases")}</button>
          <button className="btn btn-g" style={{ padding: "7px 13px" }} onClick={() => setSel([])}>{t("clearSel")}</button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto scroll">
          {rows.length === 0
            ? <Empty icon={Inbox} title={t("noCases")} sub={t("noCasesSub")}
                     action={<button className="btn btn-g" onClick={() => { setQ(""); setFs("all"); setFp("all"); setFc("all"); setFo("all"); }}>{t("clearFilters")}</button>} />
            : (
              <table className="tbl">
                <thead><tr>
                  <th style={{ width: 40 }}><input type="checkbox" checked={sel.length === rows.length && rows.length > 0} onChange={(e) => setSel(e.target.checked ? rows.map((r) => r.id) : [])} /></th>
                  <th>{t("cSubject")}</th><th>{t("cChannel")}</th><th>{t("cCategory")}</th><th>{t("cPriority")}</th>
                  <th>{t("cStatus")}</th><th>{t("cSlaFirst")}</th><th>{t("cOwner")}</th><th style={{ width: 92 }}></th>
                </tr></thead>
                <tbody>
                  {rows.map((x) => (
                    <tr key={x.id}>
                      <td><input type="checkbox" checked={sel.includes(x.id)} onChange={(e) => setSel((p) => e.target.checked ? [...p, x.id] : p.filter((y) => y !== x.id))} /></td>
                      <td>
                        <div className="font-semibold truncate" style={{ maxWidth: 280 }}>{subjectOf(x)}</div>
                        <div className="text-[11.5px] flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
                          {x.id} · {tv(x.customer)}{x.order && ` · ${x.order}`} · {ago(x.createdAt)}
                          {x.reopened && <span className="pill" style={{ background: "var(--red-bg)", color: "var(--red)", padding: "1px 7px" }}><Repeat size={9} />{t("reopenedTag")}</span>}
                          {x.tags.map((g, i) => <span key={i} className="pill" style={{ background: "var(--slate-bg)", color: "var(--muted)", padding: "1px 7px" }}>{tv(g)}</span>)}
                        </div>
                      </td>
                      <td><ChanChip k={x.channel} /></td>
                      <td style={{ color: "var(--muted)" }}>{tv(CAT[x.catKey])}</td>
                      <td><Chip map={PRI} k={x.priority} /></td>
                      <td><Chip map={ST} k={x.status} /></td>
                      <td><SlaChip t={x} /></td>
                      <td style={{ color: x.owner ? "var(--ink)" : "var(--amber)" }}>{uname(x.owner)}</td>
                      <td><button className="btn btn-g" style={{ padding: "6px 12px" }} onClick={() => open(x)}>{t("openCase")}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
        {rows.length > 0 && (
          <div className="px-5 py-3 text-[12.5px] border-t flex justify-between" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
            <span>{t("showingOf", rows.length, scope(tickets).length)}</span>
            <span>{t("breachedN", rows.filter((x) => sla(x).state === "breach").length)}</span>
          </div>
        )}
      </div>

      {nw && <NewTicket me={me} onClose={() => setNw(false)} onSave={(x) => { setTickets((p) => [x, ...p]); setNw(false); toast(t("caseOpened", x.id)); }} />}
    </div>
  );
}

const OUTBOUND_MAILBOXES = ["cs.solution@crea.asia", "enfa.cs@crea.asia", "nestlepro.cs@crea.asia"];
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());

/* ══════════ New outbound email ══════════
   A proper compose window: pick which brand mailbox it comes from, To + Cc,
   subject, body, attachments. Creates the case and sends in one step; the
   signature is appended server-side exactly as it is on a reply. */
function NewMessage({ me, onClose, onSent, toast }) {
  const [boxes, setBoxes] = useState({});            // mailbox -> brand name
  const [f, setF] = useState({ from: OUTBOUND_MAILBOXES[0], to: "", cc: "", customer: "", subject: "", body: "" });
  const [showCc, setShowCc] = useState(false);
  const [files, setFiles] = useState([]);
  const [sig, setSig] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const set = (k, v) => { setF((p) => ({ ...p, [k]: v })); setErr(""); };

  // all brand mailboxes, so a JDE mail can go out from jde@
  useEffect(() => {
    fetch(`${FN_BASE}/email/sig-config`).then((r) => r.json())
      .then((c) => { if (c?.brandByMailbox) setBoxes(c.brandByMailbox); })
      .catch(() => {});
  }, []);

  // preview the signature for the chosen mailbox
  useEffect(() => {
    let dead = false;
    fetch(`${FN_BASE}/email/signature?mailbox=${encodeURIComponent(f.from)}&agent=${encodeURIComponent(tv(me.n))}&agentKey=${encodeURIComponent((me.email || me.id || "").toLowerCase())}`)
      .then((r) => r.json()).then((d) => { if (!dead) setSig(d.signature || ""); }).catch(() => {});
    return () => { dead = true; };
  }, [f.from]);

  const ccList = f.cc.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);

  const send = async () => {
    if (!isEmail(f.to)) return setErr(t("nmErrTo"));
    const bad = ccList.find((a) => !isEmail(a));
    if (bad) return setErr(t("nmErrCc", bad));
    if (!f.subject.trim()) return setErr(t("nmErrSubj"));
    if (!f.body.trim()) return setErr(t("nmErrBody"));
    setBusy(true);
    try {
      const { data: tkRow, error } = await supabase.from("tickets").insert({
        brand: boxes[f.from] || "CREA", channel: "email",
        customer_name: f.customer.trim() || f.to.trim(),
        customer_email: f.to.trim().toLowerCase(),
        subject: f.subject.trim(),
      }).select("id").single();
      if (error) { setBusy(false); return setErr(error.message); }

      // upload attachments first so the send function can pull them
      const at = Date.now();
      const atts = files.map((x) => ({ name: x.name, path: `${tkRow.id}/out-${at}/${safeAttName(x.name)}`, size: x.size, type: x.type || "" }));
      for (let i = 0; i < files.length; i++) {
        const up = await supabase.storage.from(ATT_BUCKET).upload(atts[i].path, files[i], { contentType: atts[i].type || "application/octet-stream", upsert: true });
        if (up.error) { setBusy(false); return setErr("✉ " + up.error.message); }
      }

      const { data: s } = await supabase.auth.getSession();
      const r = await fetch(`${FN_BASE}/email/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s?.session?.access_token ?? ""}` },
        body: JSON.stringify({
          ticketId: tkRow.id, body: f.body, fromAddress: f.from,
          fromName: (boxes[f.from] || "CREA") + " Customer Care",
          agentName: tv(me.n), agentKey: (me.email || me.id || "").toLowerCase(),
          cc: ccList, attachments: atts,
        }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setBusy(false); return setErr("✉ " + (j.error || `send failed (${r.status})`)); }

      onSent({
        id: "TK-E" + tkRow.id, dbId: tkRow.id,
        subject: biText(f.subject.trim()), catKey: "inquiry", product: null,
        customer: biText(f.customer.trim() || f.to.trim()),
        phone: "", email: f.to.trim(), order: null,
        channel: "email", priority: "normal", status: "pending", emailTo: f.from,
        owner: me.id, createdAt: Date.now(),
        firstResponseMin: null, resolveMin: null, csat: null, reopened: false, tags: [],
        messages: [{ from: "agent", text: biText(f.body), at: Date.now(), by: tv(me.n) }],
      });
      toast(t("nmSent", "TK-E" + tkRow.id));
    } catch (e) { setBusy(false); setErr("✉ " + String(e.message || e)); }
  };

  const boxKeys = Object.keys(boxes).length ? Object.keys(boxes).sort() : OUTBOUND_MAILBOXES;

  return (
    <div className="ovl" onClick={onClose}>
      <div className="sheet" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--line)" }}>
          <div>
            <h3 className="font-bold text-[16px]">{t("nmTitle")}</h3>
            <p className="text-[12.5px] mt-0.5" style={{ color: "var(--muted)" }}>{t("nmSub")}</p>
          </div>
          <button onClick={onClose} className="p-2"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-3">
          <div>
            <label className="lbl">{t("nmFrom")}</label>
            <select className="fld" value={f.from} onChange={(e) => set("from", e.target.value)}>
              {boxKeys.map((m) => <option key={m} value={m}>{(boxes[m] || m.split("@")[0])} — {m}</option>)}
            </select>
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: "1.3fr 1fr" }}>
            <div>
              <label className="lbl">{t("nmTo")}</label>
              <input className="fld" value={f.to} onChange={(e) => set("to", e.target.value)} placeholder="customer@example.com" />
            </div>
            <div>
              <label className="lbl">{t("nmCustomer")}</label>
              <input className="fld" value={f.customer} onChange={(e) => set("customer", e.target.value)} />
            </div>
          </div>

          {showCc ? (
            <div>
              <label className="lbl">{t("nmCc")}</label>
              <input className="fld" value={f.cc} onChange={(e) => set("cc", e.target.value)} placeholder="a@x.com, b@y.com" />
            </div>
          ) : (
            <button className="text-[12.5px] font-semibold" style={{ color: "var(--blue)" }} onClick={() => setShowCc(true)}>+ {t("nmCcAdd")}</button>
          )}

          <div>
            <label className="lbl">{t("nmSubject")}</label>
            <input className="fld" value={f.subject} onChange={(e) => set("subject", e.target.value)} />
          </div>

          <div>
            <label className="lbl">{t("nmBody")}</label>
            <textarea className="fld" rows={7} value={f.body} onChange={(e) => set("body", e.target.value)} />
          </div>

          {sig && (
            <pre className="px-3 py-2 rounded-lg whitespace-pre-wrap"
                 style={{ background: "var(--slate-bg)", color: "var(--muted)", fontFamily: "inherit", fontSize: 11.5 }}>{sig}</pre>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={(e) => {
              const picked = Array.from(e.target.files || []);
              const ok = picked.filter((x) => x.size <= 10 * 1024 * 1024);
              if (ok.length < picked.length) toast("✉ " + t("attTooBig"), "error");
              setFiles((p) => [...p, ...ok].slice(0, 10)); e.target.value = "";
            }} />
            <button className="btn btn-g" style={{ padding: "5px 11px", fontSize: 12.5 }} onClick={() => fileRef.current?.click()}>
              <Paperclip size={13} />{files.length > 0 && <b className="ml-1">{files.length}</b>}
            </button>
            {files.map((x, i) => (
              <span key={i} className="flex items-center gap-1.5 text-[11.5px] px-2 py-1 rounded-lg" style={{ background: "var(--sky)", color: "var(--blue)", fontWeight: 600 }}>
                <Paperclip size={10} />{x.name}
                <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} style={{ display: "flex" }}><X size={11} /></button>
              </span>
            ))}
          </div>

          {err && <p className="text-[12.5px]" style={{ color: "var(--red)" }}>{err}</p>}
        </div>

        <div className="px-6 py-4 border-t flex gap-2 justify-end" style={{ borderColor: "var(--line)" }}>
          <button className="btn btn-g" onClick={onClose}>{t("cancel")}</button>
          <button className="btn btn-p" disabled={busy} onClick={send}><Mail size={15} />{busy ? t("nmSending") : t("nmSend")}</button>
        </div>
      </div>
    </div>
  );
}

function NewTicket({ me, onClose, onSave }) {
  const [f, setF] = useState({ customer: "", phone: "", order: "", channel: "line", catKey: CAT_KEYS[0], priority: "normal", subject: "", detail: "", email: "", fromBox: OUTBOUND_MAILBOXES[0] });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => { setF((p) => ({ ...p, [k]: v })); setErr(""); };
  const submit = async () => {
    if (!f.customer.trim()) return setErr(t("errName"));
    if (!f.detail.trim()) return setErr(t("errDetail"));
    // ── outbound-first EMAIL case: create a real DB case and actually send the email ──
    if (f.channel === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return setErr(t("errCustEmail"));
      if (!f.subject.trim()) return setErr(t("errSubjReq"));
      setBusy(true);
      try {
        const { data: tkRow, error } = await supabase.from("tickets").insert({
          brand: "CREA", channel: "email",
          customer_name: f.customer.trim(), customer_email: f.email.trim().toLowerCase(),
          subject: f.subject.trim(),
          ...(f.order ? { meta: { order: f.order } } : {}),
        }).select("id").single();
        if (error) { setBusy(false); return setErr(error.message); }
        const { data: s } = await supabase.auth.getSession();
        const r = await fetch(`${FN_BASE}/email/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${s?.session?.access_token ?? ""}` },
          // agentKey → the sender's own signature, same as a reply
          body: JSON.stringify({ ticketId: tkRow.id, body: f.detail, fromAddress: f.fromBox, fromName: EMAIL_FROM_NAME, agentName: tv(me.n), agentKey: (me.email || me.id || "").toLowerCase() }),
        });
        if (!r.ok) { const j = await r.json().catch(() => ({})); setBusy(false); return setErr("✉ " + (j.error || `send failed (${r.status})`)); }
        onSave({
          id: "TK-E" + tkRow.id, dbId: tkRow.id,
          subject: { en: f.subject.trim(), th: f.subject.trim() },
          catKey: f.catKey, product: null,
          customer: { en: f.customer, th: f.customer }, phone: f.phone || "-", email: f.email.trim(), order: f.order || null,
          channel: "email", priority: f.priority, status: "pending", emailTo: f.fromBox,
          owner: me.id, createdAt: Date.now(),
          firstResponseMin: null, resolveMin: null, csat: null, reopened: false, tags: [],
          messages: [{ from: "agent", text: biText(f.detail), at: Date.now(), by: tv(me.n) }],
        });
      } catch (e) { setBusy(false); return setErr("✉ network error"); }
      return;
    }
    const sub = f.subject.trim();
    onSave({
      id: "TK-" + Date.now().toString().slice(-4),
      subject: sub ? { en: sub, th: sub } : null,
      catKey: f.catKey, product: { en: t("viaChannel", tv(CH[f.channel].n)), th: t("viaChannel", tv(CH[f.channel].n)) },
      customer: { en: f.customer, th: f.customer }, phone: f.phone || "-", email: "-", order: f.order || null,
      channel: f.channel, priority: f.priority, status: "new",
      owner: me.role === "agent" ? me.id : null, createdAt: Date.now(),
      firstResponseMin: null, resolveMin: null, csat: null, reopened: false, tags: [],
      messages: [{ from: "customer", text: f.detail, at: Date.now() }],
    });
  };
  return (
    <Modal title={t("ntTitle")} sub={t("ntSub")} onClose={onClose}>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="lbl">{t("fName")} *</label><input className="fld" value={f.customer} onChange={(e) => set("customer", e.target.value)} /></div>
        <div><label className="lbl">{t("fPhone")}</label><input className="fld" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="081-234-5678" /></div>
        <div><label className="lbl">{t("fOrder")}</label><input className="fld" value={f.order} onChange={(e) => set("order", e.target.value)} placeholder="SO240123" /></div>
        <div><label className="lbl">{t("fChanIn")}</label>
          <select className="fld" value={f.channel} onChange={(e) => set("channel", e.target.value)}>{CH_KEYS.map((k) => <option key={k} value={k}>{tv(CH[k].n)}</option>)}</select></div>
        {f.channel === "email" && (
          <>
            <div><label className="lbl">{t("fCustEmail")} *</label><input className="fld" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="customer@example.com" /></div>
            <div><label className="lbl">{t("fFromBox")}</label>
              <select className="fld" value={f.fromBox} onChange={(e) => set("fromBox", e.target.value)}>{OUTBOUND_MAILBOXES.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
          </>
        )}
        <div><label className="lbl">{t("fCat")}</label>
          <select className="fld" value={f.catKey} onChange={(e) => set("catKey", e.target.value)}>{CAT_KEYS.map((k) => <option key={k} value={k}>{tv(CAT[k])}</option>)}</select></div>
        <div><label className="lbl">{t("fPri")}</label>
          <select className="fld" value={f.priority} onChange={(e) => set("priority", e.target.value)}>
            {PRI_KEYS.map((k) => <option key={k} value={k}>{tv(PRI[k].n)} · {t("respondIn", dur(PRI[k].fr))}</option>)}
          </select></div>
        <div className="col-span-2"><label className="lbl">{t("fSubject")}</label><input className="fld" value={f.subject} onChange={(e) => set("subject", e.target.value)} placeholder={t("fSubjectPh")} /></div>
        <div className="col-span-2"><label className="lbl">{t("fDetail")} *</label>
          <textarea className="fld" rows={4} value={f.detail} onChange={(e) => set("detail", e.target.value)} placeholder={t("fDetailPh")} /></div>
      </div>
      {err && <p className="text-[12.5px] mt-3 font-medium" style={{ color: "var(--red)" }}>{err}</p>}
      <div className="flex gap-2 justify-end mt-6">
        <button className="btn btn-g" onClick={onClose}>{t("cancel")}</button>
        <button className="btn btn-p" disabled={busy} onClick={submit}>{f.channel === "email" ? <Send size={15} /> : <Save size={15} />}{busy ? "…" : f.channel === "email" ? t("createSend") : t("create")}</button>
      </div>
    </Modal>
  );
}

/* ═══════════════════════ INBOX ═══════════════════════ */

function InboxView({ tickets, setTickets, me, scope, canned, toast, focus, clearFocus, startCall, unread = {}, markRead = () => {} }) {
  const rows = scope(tickets).filter((x) => OPEN_ST.includes(x.status)).sort((a, b) => sla(a).left - sla(b).left);
  const [sel, setSel] = useState(focus?.id || rows[0]?.id || null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);          // pending attachments (real email cases)
  const fileRef = useRef(null);
  const [isNote, setIsNote] = useState(false);
  const [showCanned, setShowCanned] = useState(false);
  const [q, setQ] = useState("");
  const endRef = useRef(null);

  useEffect(() => { if (focus) { setSel(focus.id); clearFocus(); } }, [focus]);
  useEffect(() => { setFiles([]); if (sel) markRead(sel); }, [sel]);   // switching cases drops pending attachments + clears unread
  useEffect(() => { if (sel && unread[sel]) markRead(sel); }, [unread]); // new msg lands in the open case → already reading it
  const tk = tickets.find((x) => x.id === sel);
  // scroll ONLY the thread pane to the newest message — scrollIntoView scrolls
  // the whole page (the "jumping" bug), so set scrollTop on the pane directly
  useEffect(() => {
    const pane = endRef.current?.parentElement;
    if (pane) pane.scrollTop = pane.scrollHeight;
  }, [sel, tk?.messages.length]);

  const list = rows.filter((x) => !q.trim() || `${subjectOf(x)} ${tv(x.customer)} ${x.id}`.toLowerCase().includes(q.toLowerCase()));

  /* collision prevention — who else has this case open, and are they typing? */
  const others = useCaseViewers(sel, me, text.trim().length > 0);
  const otherTyping = others.find((o) => o.action === "typing");

  /* reply-all: who else is on this email thread (To + Cc of the last inbound),
     minus the customer and our own support mailboxes — computed server-side */
  const [replyAll, setReplyAll] = useState(true);
  const [rcpt, setRcpt] = useState({ to: "", cc: [] });
  const [dropCc, setDropCc] = useState([]);        // chips the agent removed
  useEffect(() => {
    setDropCc([]);
    const tkNow = tickets.find((x) => x.id === sel);
    if (!tkNow?.dbId || tkNow.channel !== "email") { setRcpt({ to: "", cc: [] }); return; }
    let dead = false;
    fetch(`${FN_BASE}/email/recipients?ticketId=${tkNow.dbId}`)
      .then((r) => r.json())
      .then((d) => { if (!dead) setRcpt({ to: d.to || "", cc: d.cc || [] }); })
      .catch(() => {});
    return () => { dead = true; };
  }, [sel]);
  const ccFinal = rcpt.cc.filter((a) => !dropCc.includes(a));

  /* signature — resolved server-side so the preview matches what actually sends */
  const [sig, setSig] = useState("");
  const [noSig, setNoSig] = useState(false);
  const [showSig, setShowSig] = useState(false);
  useEffect(() => {
    setNoSig(false); setShowSig(false);
    const tkNow = tickets.find((x) => x.id === sel);
    if (!tkNow?.dbId || tkNow.channel !== "email") { setSig(""); return; }
    const box = (tkNow.emailTo && !tkNow.emailTo.includes("@parse.")) ? tkNow.emailTo : EMAIL_FROM;
    let dead = false;
    fetch(`${FN_BASE}/email/signature?mailbox=${encodeURIComponent(box)}&agent=${encodeURIComponent(tv(me.n))}&agentKey=${encodeURIComponent((me.email || me.id || "").toLowerCase())}`)
      .then((r) => r.json())
      .then((d) => { if (!dead) setSig(d.signature || ""); })
      .catch(() => {});
    return () => { dead = true; };
  }, [sel]);

  const [preview, setPreview] = useState(null); // { url, name, kind: "img" | "pdf" }
  const openAtt = async (a) => {
    if (!a.path) return;
    const { data } = await supabase.storage.from(ATT_BUCKET).createSignedUrl(a.path, 3600);
    if (!data?.signedUrl) return;
    const isImg = /^image\//i.test(a.type || "") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.name || "");
    const isPdf = /pdf/i.test(a.type || "") || /\.pdf$/i.test(a.name || "");
    const isVid = /^video\//i.test(a.type || "") || /\.(mp4|webm|mov|m4v)$/i.test(a.name || "");
    if (isImg || isPdf || isVid) setPreview({ url: data.signedUrl, name: a.name, kind: isImg ? "img" : isPdf ? "pdf" : "vid" });
    else window.open(data.signedUrl, "_blank"); // other file types → download
  };

  const [compose, setCompose] = useState(false);  // New message window
  const [collide, setCollide] = useState(null);   // { name } — confirm before double-replying

  const send = (force) => {
    if ((!text.trim() && !files.length) || !tk) return;
    // someone else is mid-reply on this same case — make the agent confirm
    if (!force && !isNote && otherTyping) { setCollide({ name: otherTyping.agent_name || "—" }); return; }
    const msgText = text.trim() || "(attachment)";
    const at = Date.now();
    const canAttach = tk.dbId && tk.channel === "email" && !isNote;
    const atts = canAttach ? files.map((f) => ({ name: f.name, path: `${tk.dbId}/out-${at}/${safeAttName(f.name)}`, size: f.size, type: f.type || "" })) : [];
    const fileObjs = canAttach ? [...files] : [];
    setTickets((p) => p.map((x) => {
      if (x.id !== tk.id) return x;
      const msgs = [...x.messages, { from: isNote ? "note" : "agent", text: msgText, at, by: tv(me.n), ...(atts.length ? { att: atts } : {}) }];
      const first = !isNote && x.firstResponseMin == null ? Math.max(1, Math.round((at - x.createdAt) / MIN)) : x.firstResponseMin;
      return { ...x, messages: msgs, firstResponseMin: first, status: isNote ? x.status : "pending", owner: x.owner || me.id };
    }));
    // real case → deliver through the channel backend
    if (tk.dbId) {
      if (isNote) {
        supabase.from("messages").insert({ ticket_id: tk.dbId, direction: "note", channel: tk.channel, author: tv(me.n), body: msgText }).then(() => {});
      } else if (tk.channel === "webchat") {
        // agent reply → messages table; the storefront widget picks it up on its next poll
        (async () => {
          const { error } = await supabase.from("messages").insert({ ticket_id: tk.dbId, direction: "out", channel: "webchat", author: tv(me.n), body: msgText });
          if (error) toast("💬 chat send failed — " + error.message);
          else supabase.from("tickets").update({ status: "pending" }).eq("id", tk.dbId).then(() => {});
        })();
      } else if (tk.channel === "email") {
        (async () => {
          try {
            for (let i = 0; i < fileObjs.length; i++) {
              const up = await supabase.storage.from(ATT_BUCKET).upload(atts[i].path, fileObjs[i], { contentType: atts[i].type || "application/octet-stream", upsert: true });
              if (up.error) { toast("✉ attachment upload failed: " + atts[i].name); return; }
            }
            const { data: s } = await supabase.auth.getSession();
            const r = await fetch(`${FN_BASE}/email/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${s?.session?.access_token ?? ""}` },
              body: JSON.stringify({ ticketId: tk.dbId, body: msgText, fromAddress: (tk.emailTo && !tk.emailTo.includes("@parse.")) ? tk.emailTo : EMAIL_FROM, fromName: EMAIL_FROM_NAME, agentName: tv(me.n), agentKey: (me.email || me.id || "").toLowerCase(), attachments: atts, replyAll, cc: replyAll ? ccFinal : [], noSignature: noSig }),
            });
            if (!r.ok) { const j = await r.json().catch(() => ({})); toast("✉ " + (j.error || `email send failed (${r.status})`)); }
          } catch (e) { toast("✉ email send failed — network"); }
        })();
      }
    }
    setText(""); setIsNote(false); setFiles([]);
    toast(isNote ? t("noteSaved") : t("msgSent"));
  };
  const patch = (p, msg) => {
    setTickets((q2) => q2.map((x) => x.id === tk.id ? { ...x, ...p } : x)); toast(msg);
    if (tk?.dbId) {
      const upd = {};
      if (p.status) { upd.status = p.status;
        if (p.status === "resolved") upd.resolved_at = new Date().toISOString();
        if (p.status === "closed") upd.closed_at = new Date().toISOString(); }
      if ("owner" in p) upd.owner = p.owner;
      if (p.priority) upd.priority = p.priority;
      if (Object.keys(upd).length) supabase.from("tickets").update(upd).eq("id", tk.dbId).then(() => {});
    }
  };

  return (
    <div className="card overflow-hidden flex" style={{ height: "calc(100vh - 132px)" }}>
      <div className="flex-none flex flex-col border-r" style={{ width: 308, borderColor: "var(--line)" }}>
        <div className="p-3 border-b" style={{ borderColor: "var(--line)" }}>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
            <input className="fld" style={{ padding: "8px 12px 8px 32px", fontSize: 13 }} placeholder={t("searchInbox")} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="btn btn-p w-full justify-center mt-2" style={{ padding: "7px 12px", fontSize: 13 }} onClick={() => setCompose(true)}>
            <Mail size={14} />{t("nmNew")}
          </button>
          <p className="text-[11.5px] mt-2" style={{ color: "var(--muted)" }}>{t("inboxCount", list.length)}</p>
        </div>
        <div className="flex-1 overflow-auto scroll">
          {list.length === 0 && <Empty icon={CheckCircle2} title={t("inboxEmpty")} sub={t("inboxEmptySub")} />}
          {list.map((x) => {
            const s = sla(x); const last = x.messages[x.messages.length - 1];
            return (
              <button key={x.id} className={`conv ${sel === x.id ? "on" : ""}`} onClick={() => setSel(x.id)}>
                <div className="flex items-center gap-2 mb-1">
                  <ChanChip k={x.channel} />
                  {x.emailTo && <span className="text-[10.5px] truncate" style={{ color: "var(--muted)", maxWidth: 140 }} title={`Sent to ${x.emailTo}`}>→ {x.emailTo}</span>}
                  <span className="ml-auto text-[10.5px]" style={{ color: SLA_C[s.state], fontWeight: 600 }}>{s.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="font-semibold text-[13px] truncate">{tv(x.customer)}</div>
                  {unread[x.id] > 0 && <span className="ml-auto flex-none rounded-full text-[10px] font-bold grid place-items-center" style={{ minWidth: 17, height: 17, padding: "0 5px", background: "var(--amber)", color: "#0F172A" }}>{unread[x.id]}</span>}
                </div>
                <div className="text-[12px] truncate mt-0.5" style={{ color: "var(--muted)", fontWeight: unread[x.id] ? 700 : 400 }}>
                  {last.from === "customer" ? "" : t("youPrefix")}{tv(last.text)}
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="dot" style={{ background: PRI[x.priority].c }} />
                  <span className="text-[10.5px]" style={{ color: "var(--muted)" }}>{x.id} · {ago(x.createdAt)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {!tk ? <div className="flex-1"><Empty icon={Inbox} title={t("pickCase")} sub={t("pickCaseSub")} /></div> : (
        <>
          <div className="flex-1 min-w-0 flex flex-col" style={{ background: "#F8F6FB" }}>
            <div className="px-5 py-3 bg-white border-b flex items-center gap-3" style={{ borderColor: "var(--line)" }}>
              <div className="min-w-0">
                <div className="font-bold text-[14.5px] truncate">{subjectOf(tk)}</div>
                <div className="text-[11.5px]" style={{ color: "var(--muted)" }}>{tk.id} · {tv(tk.customer)} · {t("receivedAgo", ago(tk.createdAt))}{tk.emailTo ? <> · <span title="Mailbox this email was sent to">✉ {tk.emailTo}</span></> : null}</div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <SlaChip t={tk} />
                <select className="fld" style={{ width: 166, padding: "6px 10px", fontSize: 12.5 }} value={tk.status}
                        onChange={(e) => patch({ status: e.target.value }, t("statusTo", tv(ST[e.target.value].n)))}>
                  {ST_KEYS.map((k) => <option key={k} value={k}>{tv(ST[k].n)}</option>)}
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-auto scroll p-5 space-y-3">
              {tk.messages.map((m, i) => (
                <div key={i} className={`flex ${m.from === "agent" ? "justify-end" : ["note", "call"].includes(m.from) ? "justify-center" : "justify-start"}`}>
                  <div>
                    <div className={`bub ${m.from === "agent" ? "bub-a" : m.from === "note" ? "bub-n" : m.from === "call" ? "bub-call" : "bub-c"}`}>
                      {m.from === "note" && <div className="flex items-center gap-1.5 text-[11px] font-bold mb-1"><StickyNote size={11} />{t("noteBanner")}</div>}
                      {m.from === "call" && <div className="flex items-center gap-1.5 text-[11px] font-bold mb-1"><PhoneCall size={11} />{t("navCalls")}</div>}
                      {tv(m.text)}
                      {m.att && m.att.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {m.att.map((a, j) => <AttThumb key={j} a={a} onOpen={() => openAtt(a)} />)}
                        </div>
                      )}
                    </div>
                    <div className="text-[10.5px] mt-1 px-1" style={{ color: "var(--muted)", textAlign: m.from === "agent" ? "right" : "left" }}>
                      {m.from === "customer" ? tv(tk.customer) : m.by || t("supportTeam")} · {clock(m.at)}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>

            <CollisionBar others={others} />

            {/* reply-all: everyone already on this email thread */}
            {tk.channel === "email" && tk.dbId && !isNote && (
              <div className="px-4 pt-2.5 pb-0.5 border-t" style={{ borderColor: "var(--line)" }}>
                <div className="flex items-center gap-2 flex-wrap text-[11.5px]">
                  <label className="flex items-center gap-1.5 font-semibold cursor-pointer select-none"
                         style={{ color: replyAll ? "var(--blue)" : "var(--muted)" }}>
                    <input type="checkbox" checked={replyAll} onChange={(e) => setReplyAll(e.target.checked)} style={{ accentColor: "var(--blue)" }} />
                    {t("replyAllOn")}
                  </label>
                  <span style={{ color: "var(--muted)" }}>{t("replyAllTo")}:</span>
                  <span className="pill" style={{ background: "var(--sky)", color: "var(--blue)" }}>{rcpt.to || tk.email}</span>
                  {replyAll && (
                    ccFinal.length === 0
                      ? <span style={{ color: "var(--muted)" }}>· {t("replyAllNone")}</span>
                      : (<>
                          <span style={{ color: "var(--muted)" }}>{t("replyAllCc")}:</span>
                          {ccFinal.map((a) => (
                            <span key={a} className="pill" style={{ background: "var(--slate-bg)", color: "var(--ink)" }}>
                              {a}
                              <button onClick={() => setDropCc((p) => [...p, a])} style={{ display: "flex", opacity: .55 }}><X size={10} /></button>
                            </span>
                          ))}
                        </>)
                  )}
                </div>

                {/* signature — what the customer will actually see at the bottom */}
                {sig && (
                  <div className="mt-1.5 text-[11.5px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="flex items-center gap-1.5 cursor-pointer select-none" style={{ color: "var(--muted)" }}>
                        <input type="checkbox" checked={!noSig} onChange={(e) => setNoSig(!e.target.checked)} style={{ accentColor: "var(--blue)" }} />
                        {noSig ? t("sigSkip") : t("sigWillAdd")}
                      </label>
                      {!noSig && (
                        <button onClick={() => setShowSig((v) => !v)} className="font-semibold" style={{ color: "var(--blue)" }}>
                          {showSig ? t("sigHide") : t("sigShow")}
                        </button>
                      )}
                    </div>
                    {showSig && !noSig && (
                      <pre className="mt-1.5 px-3 py-2 rounded-lg whitespace-pre-wrap"
                           style={{ background: "var(--slate-bg)", color: "var(--muted)", fontFamily: "inherit", fontSize: 11.5 }}>{sig}</pre>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="border-t p-3" style={{ borderColor: isNote ? "#EAD9A6" : "var(--line)", background: isNote ? "var(--amber-bg)" : "#fff", transition: "background .15s" }}>
              {showCanned && (
                <div className="card mb-2 overflow-hidden">
                  <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: "var(--line)" }}>
                    <b className="text-[12.5px]">{t("cannedBtn")}</b>
                    <button onClick={() => setShowCanned(false)} className="p-1"><X size={14} /></button>
                  </div>
                  <div className="max-h-44 overflow-auto scroll">
                    {canned.map((c) => (
                      <button key={c.id} onClick={() => { setText((p) => (p ? p + "\n" : "") + tv(c.body)); setShowCanned(false); }}
                              className="w-full text-left px-3 py-2.5 border-b hover:bg-slate-50" style={{ borderColor: "#E2E8F0" }}>
                        <b className="text-[12.5px]">{tv(c.title)}</b>
                        <p className="text-[11.5px] mt-0.5 truncate" style={{ color: "var(--muted)" }}>{tv(c.body).replace(/\n/g, " ")}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-1.5 mb-2">
                <button className="btn btn-g" style={{ padding: "5px 11px", fontSize: 12.5 }} onClick={() => setShowCanned(!showCanned)}><Zap size={13} />{t("cannedBtn")}</button>
                <button className="btn btn-g" style={{ padding: "5px 11px", fontSize: 12.5, borderColor: isNote ? "var(--amber)" : "var(--line)", background: isNote ? "var(--amber-bg)" : "#fff", color: isNote ? "var(--amber)" : "var(--ink)" }}
                        onClick={() => setIsNote(!isNote)}><StickyNote size={13} />{isNote ? t("noteBtnOn") : t("noteBtn")}</button>
                <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={(e) => {
                  const picked = Array.from(e.target.files || []);
                  const ok = picked.filter((f) => f.size <= 10 * 1024 * 1024);
                  if (ok.length < picked.length) toast("✉ " + t("attTooBig"), "error");
                  setFiles((p) => [...p, ...ok].slice(0, 10)); e.target.value = "";
                }} />
                <button className="btn btn-g" style={{ padding: "5px 11px", fontSize: 12.5 }} onClick={() => { if (tk?.dbId && tk.channel === "email" && !isNote) fileRef.current?.click(); else toast(t("attachOff"), "error"); }}><Paperclip size={13} />{files.length > 0 && <span className="ml-1 font-bold">{files.length}</span>}</button>
              </div>
              {files.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {files.map((f, i) => (
                    <span key={i} className="flex items-center gap-1.5 text-[11.5px] px-2 py-1 rounded-lg" style={{ background: "var(--sky)", color: "var(--blue)", fontWeight: 600 }}>
                      <Paperclip size={10} />{f.name} <span style={{ opacity: .6 }}>({Math.max(1, Math.round(f.size / 1024))} KB)</span>
                      <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} style={{ display: "flex" }}><X size={11} /></button>
                    </span>
                  ))}
                </div>
              )}
              <textarea className="fld" rows={3} value={text} onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
                        placeholder={isNote ? t("notePh") : t("replyPh", tv(tk.customer), tv(CH[tk.channel].n))}
                        style={{ background: isNote ? "#FFFBF2" : "#fff" }} />
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[11.5px]" style={{ color: "var(--muted)" }}>{t("ctrlEnter")}</span>
                <button className="btn btn-p ml-auto" disabled={!text.trim() && !files.length} onClick={send}>
                  {isNote ? <><StickyNote size={15} />{t("saveNote")}</> : <><Send size={15} />{t("sendBtn")}</>}
                </button>
              </div>
            </div>
          </div>

          <div className="flex-none border-l overflow-auto scroll" style={{ width: 288, borderColor: "var(--line)", background: "#fff" }}>
            <div className="p-4 border-b text-center" style={{ borderColor: "var(--line)" }}>
              <div className="rounded-full grid place-items-center mx-auto text-white font-bold text-[19px]" style={{ width: 54, height: 54, background: "var(--navy)" }}>{tv(tk.customer).charAt(0)}</div>
              <div className="font-bold text-[14.5px] mt-2">{tv(tk.customer)}</div>
              <div className="text-[12px]" style={{ color: "var(--muted)" }}>{tk.phone}</div>
              <div className="flex gap-1.5 justify-center mt-3">
                <button className="btn btn-d" style={{ padding: "6px 12px" }}
                        onClick={() => startCall({ dir: "out", phone: tk.phone, customer: tk.customer, ticketId: tk.id })}><Phone size={13} />{t("callBack")}</button>
                <button className="btn btn-g" style={{ padding: "6px 12px" }} onClick={() => { navigator.clipboard?.writeText(tk.phone); toast(t("copied")); }}><Copy size={13} /></button>
              </div>
            </div>

            <div className="p-4 border-b space-y-2.5" style={{ borderColor: "var(--line)" }}>
              <div className="flex items-center justify-between"><span className="text-[12px]" style={{ color: "var(--muted)" }}>{t("fOrder")}</span><b className="text-[12.5px]">{tk.order || "—"}</b></div>
              <div className="flex items-center justify-between"><span className="text-[12px]" style={{ color: "var(--muted)" }}>{t("fCat")}</span><b className="text-[12.5px]">{tv(CAT[tk.catKey])}</b></div>
              <div className="flex items-center justify-between"><span className="text-[12px]" style={{ color: "var(--muted)" }}>{t("cPriority")}</span>
                <select className="fld" style={{ width: 112, padding: "4px 8px", fontSize: 12 }} value={tk.priority} onChange={(e) => patch({ priority: e.target.value }, t("priSaved"))}>
                  {PRI_KEYS.map((k) => <option key={k} value={k}>{tv(PRI[k].n)}</option>)}
                </select></div>
              <div className="flex items-center justify-between"><span className="text-[12px]" style={{ color: "var(--muted)" }}>{t("cOwner")}</span>
                <select className="fld" style={{ width: 132, padding: "4px 8px", fontSize: 12 }} value={tk.owner || ""} onChange={(e) => patch({ owner: e.target.value || null }, t("ownerSaved"))}>
                  <option value="">{t("unassigned")}</option>{AGENTS.map((a) => <option key={a.id} value={a.id}>{tv(a.n)}</option>)}
                </select></div>
              <div className="flex items-center justify-between"><span className="text-[12px]" style={{ color: "var(--muted)" }}>{t("firstReplyIn")}</span><b className="text-[12.5px]">{dur(tk.firstResponseMin)}</b></div>
            </div>

            <div className="p-4 border-b" style={{ borderColor: "var(--line)" }}>
              <p className="lbl">{t("custHistory")}</p>
              {tickets.filter((x) => tv(x.customer) === tv(tk.customer)).slice(0, 4).map((x) => (
                <button key={x.id} onClick={() => OPEN_ST.includes(x.status) && setSel(x.id)} className="w-full text-left py-2 border-b" style={{ borderColor: "#E2E8F0" }}>
                  <div className="flex items-center gap-1.5"><Chip map={ST} k={x.status} /><span className="ml-auto text-[10.5px]" style={{ color: "var(--muted)" }}>{ago(x.createdAt)}</span></div>
                  <p className="text-[12px] mt-1 truncate">{subjectOf(x)}</p>
                </button>
              ))}
            </div>

            <div className="p-4">
              <p className="lbl">{t("caseActions")}</p>
              <div className="space-y-1.5">
                <button className="btn btn-g w-full justify-start" onClick={() => patch({ status: "escalated", priority: "high" }, t("escalated"))}><ArrowUpRight size={14} />{t("escalate")}</button>
                <button className="btn btn-g w-full justify-start" onClick={() => patch({ status: "pending" }, t("pendingSet"))}><Clock size={14} />{t("waitCust")}</button>
                <button className="btn btn-d w-full justify-start" onClick={() => patch({ status: "resolved", resolveMin: Math.round((Date.now() - tk.createdAt) / MIN) }, t("resolvedMsg"))}><CheckCircle2 size={14} />{t("resolveClose")}</button>
                {me.role === "admin" && (
                  <button className="btn btn-g w-full justify-start" style={{ color: "var(--red)" }}
                    onClick={async () => {
                      if (!window.confirm(t("delConfirm", tk.id))) return;
                      if (tk.dbId) {
                        await supabase.from("messages").delete().eq("ticket_id", tk.dbId);
                        const { error } = await supabase.from("tickets").delete().eq("id", tk.dbId);
                        if (error) { toast("🗑 " + error.message); return; }
                      }
                      setTickets((p) => p.filter((x) => x.id !== tk.id));
                      setSel(null);
                      toast(t("delDone"));
                    }}><X size={14} />{t("delCase")}</button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {compose && (
        <NewMessage me={me} toast={toast} onClose={() => setCompose(false)}
                    onSent={(x) => { setTickets((p) => [x, ...p]); setCompose(false); setSel(x.id); }} />
      )}

      {/* ── collision confirm: two agents replying to the same case ── */}
      {collide && (
        <div className="ovl" onClick={() => setCollide(null)}>
          <div className="sheet p-6" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 mb-2">
              <AlertTriangle size={19} style={{ color: "var(--red)" }} />
              <b className="text-[16px]">{t("colWarnTitle")}</b>
            </div>
            <p className="text-[13.5px]" style={{ color: "var(--muted)" }}>{t("colWarnBody", collide.name)}</p>
            <div className="flex gap-2 mt-5">
              <button className="btn btn-g flex-1 justify-center" onClick={() => setCollide(null)}>{t("cancel")}</button>
              <button className="btn flex-1 justify-center" style={{ background: "var(--red)", color: "#fff" }}
                      onClick={() => { setCollide(null); send(true); }}>{t("colSendAnyway")}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── in-app attachment viewer (images + PDFs) ── */}
      {preview && (
        <div onClick={() => setPreview(null)}
             style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(20,16,45,.78)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div className="flex items-center gap-3 mb-3" onClick={(e) => e.stopPropagation()}>
            <span className="text-white text-[13px] font-semibold truncate" style={{ maxWidth: 480 }}>{preview.name}</span>
            <a href={preview.url} target="_blank" rel="noreferrer" className="btn btn-g" style={{ padding: "5px 12px", fontSize: 12 }}><Download size={13} />Download</a>
            <button className="btn btn-g" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => setPreview(null)}><X size={13} />Close</button>
          </div>
          {preview.kind === "img"
            ? <img src={preview.url} alt={preview.name} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "92vw", maxHeight: "82vh", borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,.5)", background: "#fff" }} />
            : preview.kind === "vid"
            ? <video src={preview.url} controls autoPlay onClick={(e) => e.stopPropagation()} style={{ maxWidth: "92vw", maxHeight: "82vh", borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,.5)", background: "#000" }} />
            : <iframe title={preview.name} src={preview.url} onClick={(e) => e.stopPropagation()} style={{ width: "min(920px, 92vw)", height: "82vh", border: "none", borderRadius: 12, background: "#fff" }} />}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════ CUSTOMERS ═══════════════════════ */

function Customers({ tickets, open }) {
  const [q, setQ] = useState("");
  const [pick, setPick] = useState(null);

  const list = useMemo(() => {
    const m = new Map();
    tickets.forEach((x) => {
      const key = tv(x.customer);
      const c = m.get(key) || { name: key, phone: x.phone, tickets: [], channels: new Set(), tags: [] };
      c.tickets.push(x); c.channels.add(x.channel);
      x.tags.forEach((g) => { if (!c.tags.some((y) => tv(y) === tv(g))) c.tags.push(g); });
      m.set(key, c);
    });
    return [...m.values()].map((c) => {
      const rated = c.tickets.filter((x) => x.csat);
      return { ...c, open: c.tickets.filter((x) => OPEN_ST.includes(x.status)).length,
               csat: rated.length ? (rated.reduce((s, x) => s + x.csat, 0) / rated.length).toFixed(1) : null,
               last: Math.max(...c.tickets.map((x) => x.createdAt)) };
    }).sort((a, b) => b.tickets.length - a.tickets.length);
  }, [tickets]);

  const rows = list.filter((c) => !q.trim() || `${c.name} ${c.phone}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap gap-2.5 items-center">
        <div className="relative flex-1" style={{ minWidth: 230 }}>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
          <input className="fld pl-9" placeholder={t("searchCust")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>{t("custCount", rows.length, rows.filter((c) => c.tickets.length > 1).length)}</span>
      </div>

      <div className="card overflow-hidden">
        <table className="tbl">
          <thead><tr><th>{t("cCustomer")}</th><th>{t("channelsUsed")}</th><th className="text-right">{t("cTotal")}</th><th className="text-right">{t("cOpen")}</th><th>{t("cCsat")}</th><th>{t("cLast")}</th><th></th></tr></thead>
          <tbody>
            {rows.slice(0, 40).map((c) => (
              <tr key={c.name}>
                <td>
                  <div className="font-semibold flex items-center gap-1.5">{c.name}
                    {c.tags.map((g, i) => <span key={i} className="pill" style={{ background: "var(--violet-bg)", color: "var(--violet)", padding: "1px 7px" }}>{tv(g)}</span>)}</div>
                  <div className="text-[11.5px]" style={{ color: "var(--muted)" }}>{c.phone}</div>
                </td>
                <td><div className="flex gap-1 flex-wrap">{[...c.channels].slice(0, 3).map((k) => <ChanChip key={k} k={k} />)}</div></td>
                <td className="text-right font-semibold">{c.tickets.length}</td>
                <td className="text-right">{c.open > 0 ? <span className="pill" style={{ background: "var(--amber-bg)", color: "var(--amber)" }}>{c.open}</span> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                <td>{c.csat ? <span className="flex items-center gap-1.5"><Stars n={Math.round(c.csat)} size={12} /><b className="text-[12.5px]">{c.csat}</b></span> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                <td style={{ color: "var(--muted)" }}>{ago(c.last)}</td>
                <td><button className="btn btn-g" style={{ padding: "6px 12px" }} onClick={() => setPick(c)}>{t("viewHistory")}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pick && (
        <Modal title={pick.name} sub={t("custModalSub", pick.phone, pick.tickets.length)} onClose={() => setPick(null)} w={680}>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[[t("mTotal"), pick.tickets.length], [t("mOpen"), pick.open], [t("mCsat"), pick.csat || "—"]].map(([l, v]) => (
              <div key={l} className="card p-3.5 text-center"><p className="text-[11.5px]" style={{ color: "var(--muted)" }}>{l}</p><p className="text-[21px] font-bold">{v}</p></div>
            ))}
          </div>
          <p className="lbl">{t("timeline")}</p>
          <div className="space-y-2 max-h-80 overflow-auto scroll pr-1">
            {[...pick.tickets].sort((a, b) => b.createdAt - a.createdAt).map((x) => (
              <button key={x.id} onClick={() => { setPick(null); open(x); }} className="w-full text-left card p-3.5 hover:bg-slate-50">
                <div className="flex items-center gap-2 mb-1.5">
                  <ChanChip k={x.channel} /><Chip map={ST} k={x.status} />
                  <span className="ml-auto text-[11.5px]" style={{ color: "var(--muted)" }}>{ago(x.createdAt)}</span>
                </div>
                <div className="font-semibold text-[13.5px]">{subjectOf(x)}</div>
                <div className="text-[12px] mt-0.5 truncate" style={{ color: "var(--muted)" }}>{tv(x.messages[0].text)}</div>
                {x.csat && <div className="mt-1.5"><Stars n={x.csat} size={12} /></div>}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════ KNOWLEDGE ═══════════════════════ */

function Knowledge({ kb, setKb, canned, setCanned, me, toast }) {
  const [tab, setTab] = useState("kb");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null);
  const canEdit = me.role !== "agent";
  const hit = (o) => !q.trim() || `${tv(o.title)} ${tv(o.body)} ${tv(o.cat)}`.toLowerCase().includes(q.toLowerCase());
  const arts = kb.filter(hit), cans = canned.filter(hit);

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap gap-2.5 items-center">
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: "#F1F5F9" }}>
          {[["kb", t("tabArticles")], ["canned", t("tabCanned")]].map(([k, lbl]) => (
            <button key={k} onClick={() => setTab(k)} className="px-4 py-1.5 rounded-md text-[13px] font-semibold"
                    style={{ background: tab === k ? "#fff" : "transparent", color: tab === k ? "var(--blue)" : "var(--muted)", boxShadow: tab === k ? "0 1px 3px rgba(15,23,42,.12)" : "none" }}>{lbl}</button>
          ))}
        </div>
        <div className="relative flex-1" style={{ minWidth: 220 }}>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
          <input className="fld pl-9" placeholder={t("searchKb")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {canEdit && <button className="btn btn-p" onClick={() => setEdit({ title: "", cat: "", body: "" })}><Plus size={15} />{tab === "kb" ? t("addArticle") : t("addCanned")}</button>}
      </div>

      {tab === "kb" ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))" }}>
          {arts.length === 0 && <div className="card" style={{ gridColumn: "1/-1" }}><Empty icon={BookOpen} title={t("kbEmpty")} sub={t("kbEmptySub")} /></div>}
          {arts.map((a) => (
            <div key={a.id} className="card p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="pill" style={{ background: "var(--sky)", color: "var(--blue)" }}><Tag size={10} />{tv(a.cat)}</span>
                <span className="ml-auto text-[11.5px]" style={{ color: "var(--muted)" }}>{t("viewsN", fmt(a.views || 0))}</span>
              </div>
              <h3 className="font-bold text-[14.5px] leading-snug">{tv(a.title)}</h3>
              <p className="text-[12.5px] mt-2 whitespace-pre-wrap" style={{ color: "var(--muted)", lineHeight: 1.65 }}>{tv(a.body)}</p>
              <div className="flex gap-1.5 mt-3">
                <button className="btn btn-g" style={{ padding: "5px 11px", fontSize: 12.5 }} onClick={() => { navigator.clipboard?.writeText(tv(a.body)); toast(t("copiedText")); }}><Copy size={12} />{t("copyBtn")}</button>
                {canEdit && <button className="btn btn-g" style={{ padding: "5px 11px", fontSize: 12.5 }} onClick={() => setEdit(a)}><Edit3 size={12} />{t("editBtn")}</button>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          {cans.length === 0 ? <Empty icon={Zap} title={t("cannedEmpty")} sub={t("kbEmptySub")} /> : (
            <table className="tbl">
              <thead><tr><th>{t("cTitle2")}</th><th>{t("cCat2")}</th><th>{t("cContent")}</th><th style={{ width: 150 }}></th></tr></thead>
              <tbody>
                {cans.map((c) => (
                  <tr key={c.id}>
                    <td className="font-semibold">{tv(c.title)}</td>
                    <td><span className="pill" style={{ background: "var(--slate-bg)", color: "var(--muted)" }}>{tv(c.cat)}</span></td>
                    <td style={{ color: "var(--muted)", maxWidth: 420 }}><div className="truncate">{tv(c.body).replace(/\n/g, " ")}</div></td>
                    <td><div className="flex gap-1.5 justify-end">
                      <button className="btn btn-g" style={{ padding: "5px 11px", fontSize: 12.5 }} onClick={() => { navigator.clipboard?.writeText(tv(c.body)); toast(t("copiedText")); }}><Copy size={12} /></button>
                      {canEdit && <button className="btn btn-g" style={{ padding: "5px 11px", fontSize: 12.5 }} onClick={() => setEdit(c)}><Edit3 size={12} /></button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {edit && (() => {
        const val = (f) => typeof edit[f] === "object" ? tv(edit[f]) : edit[f];
        const put = (f, v) => setEdit({ ...edit, [f]: typeof edit[f] === "object" ? { ...edit[f], [LANG.cur]: v } : v });
        return (
          <Modal title={edit.id ? t("editItem") : tab === "kb" ? t("addArticle") : t("addCanned")} onClose={() => setEdit(null)} w={620}>
            <label className="lbl">{t("mTitleLbl")}</label>
            <input className="fld" value={val("title")} onChange={(e) => put("title", e.target.value)} />
            <label className="lbl mt-4">{t("mCatLbl")}</label>
            <input className="fld" value={val("cat")} onChange={(e) => put("cat", e.target.value)} />
            <label className="lbl mt-4">{t("mBodyLbl")}</label>
            <textarea className="fld" rows={8} value={val("body")} onChange={(e) => put("body", e.target.value)} />
            <div className="flex gap-2 justify-end mt-6">
              <button className="btn btn-g" onClick={() => setEdit(null)}>{t("cancel")}</button>
              <button className="btn btn-p" disabled={!val("title")?.trim() || !val("body")?.trim()} onClick={() => {
                const setter = tab === "kb" ? setKb : setCanned;
                setter((p) => edit.id ? p.map((x) => x.id === edit.id ? edit : x) : [{ ...edit, id: "n" + Date.now(), views: 0 }, ...p]);
                setEdit(null); toast(t("savedOk"));
              }}><Save size={15} />{t("save")}</button>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

/* ═══════════════════════ CALLS ═══════════════════════ */

const OUT = {
  resolved: { n: { en: "Issue resolved", th: "แก้ไขจบในสาย" },  c: "var(--green)",  bg: "var(--green-bg)" },
  followup: { n: { en: "Needs follow-up", th: "ต้องติดตามต่อ" }, c: "var(--cyan)",   bg: "var(--cyan-bg)" },
  callback: { n: { en: "Call back later", th: "นัดโทรกลับ" },    c: "var(--amber)",  bg: "var(--amber-bg)" },
  noanswer: { n: { en: "No answer", th: "ไม่รับสาย" },           c: "var(--muted)",  bg: "var(--slate-bg)" },
  wrong:    { n: { en: "Wrong number", th: "เบอร์ผิด" },         c: "var(--red)",    bg: "var(--red-bg)" },
};
const OUT_KEYS = Object.keys(OUT);

const DIR = {
  out:    { k: "dirOut",    c: "var(--blue)",  bg: "var(--sky)",      ic: PhoneOutgoing },
  in:     { k: "dirIn",     c: "var(--green)", bg: "var(--green-bg)", ic: PhoneIncoming },
  missed: { k: "dirMissed", c: "var(--red)",   bg: "var(--red-bg)",   ic: PhoneMissed },
};

const PRESENCE = {
  available: { k: "pAvailable", c: "var(--green)",  bg: "var(--green-bg)" },
  ringing:   { k: "pRinging",   c: "var(--amber)",  bg: "var(--amber-bg)" },
  oncall:    { k: "pOnCall",    c: "var(--blue)",   bg: "var(--sky)" },
  break:     { k: "pBreak",     c: "var(--violet)", bg: "var(--violet-bg)" },
  offline:   { k: "pOffline",   c: "var(--muted)",  bg: "var(--slate-bg)" },
};
const TAKES_CALLS = ["available", "ringing", "oncall"];

function seedPresence() {
  const p = {};
  USERS.forEach((u, i) => {
    const st = !u.active ? "offline" : i === 5 ? "break" : i === 2 ? "oncall" : "available";
    p[u.id] = { status: st, since: now - ri(40) * MIN, lastCallAt: Math.random() < 0.7 ? now - ri(180) * MIN : null };
  });
  return p;
}

const KEYS = [["1", ""], ["2", "ABC"], ["3", "DEF"], ["4", "GHI"], ["5", "JKL"], ["6", "MNO"],
              ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"], ["*", ""], ["0", "+"], ["#", ""]];

function CallConsole({ call, tickets, onSave, onClose, onTimeout, ringFor = 20, toast }) {
  const [phase, setPhase] = useState(call.dir === "in" ? "incoming" : "dialing");
  const [sec, setSec] = useState(0);
  const [ring, setRing] = useState(ringFor);
  const [mute, setMute] = useState(false);
  const [hold, setHold] = useState(false);
  const [rec, setRec] = useState(true);
  const [pad, setPad] = useState(false);
  const [xfer, setXfer] = useState(false);
  const [dtmf, setDtmf] = useState("");
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState(call.dir === "in" ? "resolved" : "followup");
  const [link, setLink] = useState(call.ticketId || "");

  useEffect(() => {
    if (phase !== "dialing") return;
    const x = setTimeout(() => setPhase("live"), 1600);
    return () => clearTimeout(x);
  }, [phase]);
  useEffect(() => {
    if (phase !== "live" || hold) return;
    const x = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(x);
  }, [phase, hold]);
  useEffect(() => {
    if (phase !== "incoming" || !call.queueId) return;
    if (ring <= 0) { onTimeout?.(); return; }
    const x = setTimeout(() => setRing((r) => r - 1), 1000);
    return () => clearTimeout(x);
  }, [phase, ring, call.queueId]);

  const name = call.customer ? tv(call.customer) : (call.dir === "in" ? t("unknownCaller") : t("manualDial"));
  const openCases = tickets.filter((x) => OPEN_ST.includes(x.status) && call.customer && tv(x.customer) === tv(call.customer));

  const finish = () =>
    onSave({ dir: call.dir, phone: call.phone, customer: call.customer, name, dur: sec,
             outcome, note: note.trim(), ticketId: link || null, recorded: rec && sec > 0,
             queueId: call.queueId || null, waited: call.waited ?? null });

  return (
    <div className="ovl" style={{ alignItems: "flex-end", justifyContent: "flex-end", padding: 22 }}>
      <div className="card overflow-hidden" style={{ width: 380, background: "var(--navy)", border: "none", color: "#fff" }}>
        <div className="px-5 pt-5 pb-4 text-center" style={{ background: "linear-gradient(160deg,var(--navy-2),var(--navy))" }}>
          <div className="flex items-center justify-between mb-4">
            <span className="pill" style={{ background: "rgba(255,255,255,.14)", color: "#fff" }}>
              {phase === "incoming"
                ? <><PhoneIncoming size={11} />{t("incoming")}</>
                : <>{rec && <span className="dot" style={{ background: "#FF5A5F" }} />}{rec ? t("recOn") : t("recOff")}</>}
            </span>
            <button onClick={onClose} className="p-1 rounded-lg" style={{ color: "#99F6E4" }}><X size={17} /></button>
          </div>

          <div className={`mx-auto rounded-full grid place-items-center mb-3 ${phase === "incoming" ? "ringing" : ""}`}
               style={{ width: 64, height: 64, background: "rgba(255,255,255,.12)", fontSize: 23, fontWeight: 700 }}>
            {call.customer ? tv(call.customer).charAt(0) : <Phone size={24} />}
          </div>
          <p className="text-[17px] font-bold">{name}</p>
          <p className="text-[13.5px]" style={{ color: "#99F6E4" }}>{call.phone}</p>

          {openCases.length > 0 && phase !== "wrap" && (
            <span className="pill mt-2" style={{ background: "var(--amber-bg)", color: "var(--amber)" }}>
              <AlertTriangle size={11} />{t("openCasesN", openCases.length)}
            </span>
          )}

          {phase === "dialing" && <p className="text-[13px] mt-3" style={{ color: "#7EE2AC" }}>{t("ringing")}</p>}
          {phase === "incoming" && (
            <p className="text-[13px] mt-3" style={{ color: call.queueId && ring <= 5 ? "#FCA5A5" : "#7EE2AC" }}>
              {call.queueId ? t("answerIn", ring) : t("ringing")}
            </p>
          )}
          {phase === "live" && (
            <div className="flex items-center justify-center gap-2.5 mt-3">
              <div className="wv flex items-end gap-[3px]" style={{ height: 20, opacity: hold ? .3 : 1 }}>
                {[0, .15, .3, .1, .22].map((d, i) => <span key={i} style={{ animationDelay: `${d}s` }} />)}
              </div>
              <span className="text-[19px] font-bold" style={{ fontVariantNumeric: "tabular-nums" }}>{mmss(sec)}</span>
              {hold && <span className="pill" style={{ background: "var(--amber-bg)", color: "var(--amber)" }}>{t("onHold")}</span>}
            </div>
          )}
          {phase === "wrap" && <p className="text-[13px] mt-3" style={{ color: "#99F6E4" }}>{t("callEnded", mmss(sec))}</p>}
        </div>

        {phase === "incoming" && (
          <div className="px-5 py-5 grid grid-cols-2 gap-2.5">
            <button className="btn justify-center" style={{ padding: 12, background: "rgba(255,255,255,.12)", color: "#fff" }}
                    onClick={() => { if (call.queueId) onTimeout?.(); else { setOutcome("noanswer"); setPhase("wrap"); } }}>
              <PhoneOff size={16} />{t("decline")}
            </button>
            <button className="btn btn-d justify-center live" style={{ padding: 12 }} onClick={() => setPhase("live")}>
              <Phone size={16} />{t("accept")}
            </button>
          </div>
        )}

        {(phase === "dialing" || phase === "live") && (
          <div className="px-5 py-5">
            <div className="grid grid-cols-5 gap-2">
              {[[mute ? MicOff : Mic, mute ? t("muteOn") : t("muteOff"), () => setMute(!mute), mute],
                [hold ? Play : Pause, hold ? t("holdOn") : t("holdOff"), () => setHold(!hold), hold],
                [Radio, rec ? t("recStop") : t("recStart"), () => setRec(!rec), rec],
                [Grid3x3, t("keypadBtn"), () => { setPad(!pad); setXfer(false); }, pad],
                [ArrowUpRight, t("transferBtn"), () => { setXfer(!xfer); setPad(false); }, xfer]].map(([Ic, lbl, fn, on], i) => (
                <button key={i} onClick={fn} className="rounded-xl py-2.5 grid place-items-center gap-1 transition"
                        style={{ background: on ? "#fff" : "rgba(255,255,255,.1)", color: on ? "var(--navy)" : "#fff" }}>
                  <Ic size={15} /><span className="text-[9.5px] font-semibold">{lbl}</span>
                </button>
              ))}
            </div>

            {pad && (
              <div className="mt-3">
                <div className="rounded-lg px-3 py-2 mb-2 text-center text-[15px] font-semibold"
                     style={{ background: "rgba(255,255,255,.1)", letterSpacing: ".12em", minHeight: 34 }}>{dtmf || "—"}</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {KEYS.map(([k]) => (
                    <button key={k} onClick={() => setDtmf((p) => p + k)} className="rounded-lg py-2 font-semibold"
                            style={{ background: "rgba(255,255,255,.1)" }}>{k}</button>
                  ))}
                </div>
              </div>
            )}

            {xfer && (
              <div className="mt-3">
                <p className="text-[11.5px] mb-1.5" style={{ color: "#99F6E4" }}>{t("transferTo")}</p>
                <div className="space-y-1 max-h-36 overflow-auto scroll">
                  {AGENTS.filter((a) => a.active).map((a) => (
                    <button key={a.id} className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold"
                            style={{ background: "rgba(255,255,255,.1)" }}
                            onClick={() => { toast(t("transferred", tv(a.n))); setOutcome("followup"); setPhase("wrap"); }}>
                      {tv(a.n)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button className="btn justify-center w-full mt-3 live" style={{ padding: 12, background: "var(--red)", color: "#fff" }}
                    onClick={() => setPhase("wrap")} disabled={phase === "dialing"}>
              <PhoneOff size={17} />{t("hangUp")}
            </button>
          </div>
        )}

        {phase === "wrap" && (
          <div className="px-5 py-5" style={{ background: "#fff", color: "var(--ink)" }}>
            <label className="lbl">{t("outcomeLbl")}</label>
            <div className="grid grid-cols-2 gap-2">
              {OUT_KEYS.map((k) => (
                <button key={k} onClick={() => setOutcome(k)} className="px-3 py-2 rounded-lg border text-[12.5px] font-semibold transition"
                        style={{ borderColor: outcome === k ? OUT[k].c : "var(--line)", background: outcome === k ? OUT[k].bg : "#fff", color: outcome === k ? OUT[k].c : "var(--ink)" }}>
                  {tv(OUT[k].n)}
                </button>
              ))}
            </div>

            <label className="lbl mt-4">{t("linkCase")}</label>
            <select className="fld" value={link} onChange={(e) => setLink(e.target.value)}>
              <option value="">{t("noCase")}</option>
              {(openCases.length ? openCases : tickets.filter((x) => OPEN_ST.includes(x.status)).slice(0, 25)).map((x) => (
                <option key={x.id} value={x.id}>{x.id} · {subjectOf(x)}</option>
              ))}
            </select>

            <label className="lbl mt-4">{t("callNotes")}</label>
            <textarea className="fld" rows={3} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("callNotesPh")} />

            <button className="btn btn-p w-full justify-center mt-4" style={{ padding: 11 }} onClick={finish}>
              <Save size={15} />{t("saveCall")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CallsView({ tickets, allTickets, calls, queue, callbacks, setCallbacks, presence, setPresence, me, sip, routing, startCall, pullCall, onPlay, toast, simulateCall, sf }) {
  const [num, setNum] = useState("");
  const [, tick] = useState(0);
  useEffect(() => { const x = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(x); }, []);

  const digits = (s) => s.replace(/\D/g, "");
  const match = num.length > 2
    ? tickets.filter((x) => digits(x.phone).includes(digits(num)))
             .filter((x, i, a) => a.findIndex((y) => tv(y.customer) === tv(x.customer)) === i).slice(0, 5)
    : [];

  const today = calls.filter((c) => c.at >= days0());
  const talked = calls.filter((c) => c.dur > 0);
  const avgTalk = talked.length ? Math.round(talked.reduce((s, c) => s + c.dur, 0) / talked.length) : 0;
  const waits = calls.filter((c) => c.waited != null);
  const avgWait = waits.length ? Math.round(waits.reduce((s, c) => s + c.waited, 0) / waits.length) : 0;
  const abandoned = calls.filter((c) => c.dir === "missed").length;

  const mine = presence[me.id] || { status: "offline", since: Date.now() };
  const board = USERS.filter((u) => u.active).map((u) => ({ u, p: presence[u.id] || { status: "offline", since: Date.now() },
    open: allTickets.filter((x) => x.owner === u.id && OPEN_ST.includes(x.status)).length }));
  const freeNow = board.filter((b) => b.p.status === "available").length;

  const inbound = () => {
    const pool = tickets.filter((x) => OPEN_ST.includes(x.status));
    if (pool.length && Math.random() < 0.75) {
      const x = rnd(pool);
      startCall({ dir: "in", phone: x.phone, customer: x.customer, ticketId: x.id });
    } else {
      startCall({ dir: "in", phone: `09${ri(10)}-${1000 + ri(9000)}-${1000 + ri(9000)}`, customer: null, ticketId: null });
    }
  };

  const setMy = (st) => {
    setPresence((p) => ({ ...p, [me.id]: { ...p[me.id], status: st, since: Date.now() } }));
    toast(t("statusSet", t(PRESENCE[st].k)));
  };

  const SimBtn = () => (
    <>
      {/* real outbound through the Twilio softphone */}
      <button className="btn btn-d w-full justify-center mt-3" disabled={!num.trim() || sf?.state !== "ready"}
              onClick={() => sf.dial(num.trim())}>
        <Phone size={14} />{t("sfCallBtn")}{num.trim() ? ` ${num.trim()}` : ""}
      </button>
      <button className="btn btn-g w-full justify-center mt-2" style={{ borderStyle: "dashed" }} onClick={simulateCall}>
        <Phone size={14} />{t("simCall")}
      </button>
    </>
  );

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 336px" }}>
      <div className="space-y-4" style={{ alignSelf: "start", order: 2 }}>
        <div className="card p-5">
          <h3 className="font-bold text-[15px] mb-1">{t("myStatus")}</h3>
          <p className="text-[12px] mb-3" style={{ color: "var(--muted)" }}>
            {mine.status === "available" ? t("availToTake") : ["oncall", "ringing"].includes(mine.status) ? t(PRESENCE[mine.status].k) : t("notTakingCalls")}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {["available", "break", "offline"].map((st) => (
              <button key={st} onClick={() => setMy(st)} disabled={["oncall", "ringing"].includes(mine.status)}
                      className="py-2.5 rounded-xl border text-[12.5px] font-semibold disabled:opacity-45"
                      style={{ borderColor: mine.status === st ? PRESENCE[st].c : "var(--line)",
                               background: mine.status === st ? PRESENCE[st].bg : "#fff",
                               color: mine.status === st ? PRESENCE[st].c : "var(--ink)" }}>
                {t(PRESENCE[st].k)}
              </button>
            ))}
          </div>
          <SimBtn />
          {["oncall", "ringing"].includes(mine.status) && (
            <p className="text-[11.5px] mt-2.5 flex items-center gap-1.5" style={{ color: PRESENCE[mine.status].c }}>
              <span className="dot" style={{ background: PRESENCE[mine.status].c }} />{t(PRESENCE[mine.status].k)}
            </p>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-[15px]">{t("dialpad")}</h3>
            <span className="pill" style={{ background: sip.connected ? "var(--green-bg)" : "var(--red-bg)", color: sip.connected ? "var(--green)" : "var(--red)" }}>
              <span className="dot" style={{ background: sip.connected ? "var(--green)" : "var(--red)" }} />
              {sip.connected ? t("sipOn", sip.provider) : t("sipOff")}
            </span>
          </div>

          <input className="fld text-center" value={num} onChange={(e) => setNum(e.target.value)} placeholder={t("numberPh")}
                 style={{ fontSize: 22, fontWeight: 600, letterSpacing: ".04em", padding: 12, fontVariantNumeric: "tabular-nums" }} />

          <div className="grid grid-cols-3 gap-2 mt-3">
            {KEYS.map(([k, sub]) => (
              <button key={k} className="kp" onClick={() => setNum((p) => p + k)}>{k}{sub && <small>{sub}</small>}</button>
            ))}
          </div>

          <div className="flex gap-2 mt-3">
            <button className="btn btn-g" style={{ padding: "11px 14px" }} onClick={() => setNum((p) => p.slice(0, -1))}><Delete size={16} /></button>
            <button className="btn btn-d flex-1 justify-center" style={{ padding: 11 }} disabled={digits(num).length < 6 || !sip.connected}
                    onClick={() => { startCall({ dir: "out", phone: num, customer: null, ticketId: null }); setNum(""); }}>
              <Phone size={16} />{t("callBtn")}
            </button>
          </div>

          {match.length > 0 && (
            <>
              <p className="lbl mt-5 mb-2">{t("matchingCust")}</p>
              <div className="space-y-1.5">
                {match.map((x) => (
                  <button key={x.id} onClick={() => startCall({ dir: "out", phone: x.phone, customer: x.customer, ticketId: OPEN_ST.includes(x.status) ? x.id : null })}
                          className="w-full text-left px-3 py-2.5 rounded-lg border hover:bg-slate-50" style={{ borderColor: "var(--line)" }}>
                    <b className="text-[13px]">{tv(x.customer)}</b>
                    <div className="text-[11.5px]" style={{ color: "var(--muted)" }}>{x.phone} · {tv(ST[x.status].n)}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          <button className="btn btn-g w-full justify-center mt-4" onClick={inbound} disabled={!sip.connected}>
            <PhoneIncoming size={15} />{t("simInbound")}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
          <Kpi icon={PhoneCall} label={t("kCallsToday")} value={today.length} unit={t("uCalls")} tint="var(--blue)" bg="var(--sky)" />
          <Kpi icon={Clock} label={t("kAvgWait")} value={mmss(avgWait)} tint={avgWait > 45 ? "var(--amber)" : "var(--green)"} bg={avgWait > 45 ? "var(--amber-bg)" : "var(--green-bg)"} />
          <Kpi icon={Timer} label={t("kTalkTime")} value={mmss(avgTalk)} tint="var(--cyan)" bg="var(--cyan-bg)" />
          <Kpi icon={PhoneMissed} label={t("kAbandoned")} value={abandoned} unit={t("uCalls")} tint="var(--red)" bg="var(--red-bg)" />
        </div>

        {callbacks.length > 0 && (
          <div className="card overflow-hidden" style={{ borderLeft: "3px solid var(--red)" }}>
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--line)" }}>
              <div>
                <h3 className="font-bold text-[15px] flex items-center gap-2">
                  <PhoneMissed size={15} style={{ color: "var(--red)" }} />{t("cbTitle")}
                  <span className="pill" style={{ background: "var(--red)", color: "#fff" }}>{callbacks.length}</span>
                </h3>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--muted)" }}>{t("cbSub")}</p>
              </div>
            </div>
            <div className="max-h-56 overflow-auto scroll">
              {callbacks.map((c) => (
                <div key={c.id} className="px-5 py-3 border-b flex items-center gap-3" style={{ borderColor: "#E2E8F0" }}>
                  <div className="min-w-0">
                    <b className="text-[13px]">{c.customer ? tv(c.customer) : t("unknownCaller")}</b>
                    <div className="text-[11.5px] mt-0.5" style={{ color: "var(--muted)" }}>
                      {c.phone}{c.ticketId ? ` · ${c.ticketId}` : ""} · {t("cbWaited", mmss(c.waited))} · {ago(c.at)}
                    </div>
                  </div>
                  <button className="btn btn-p ml-auto" style={{ padding: "6px 12px" }}
                          disabled={!sip.connected || !TAKES_CALLS.includes(mine.status)}
                          onClick={() => startCall({ dir: "out", phone: c.phone, customer: c.customer, ticketId: c.ticketId })}>
                    <PhoneOutgoing size={13} />{t("cbCall")}
                  </button>
                  <button className="p-1.5 rounded-lg hover:bg-slate-100" style={{ color: "var(--muted)" }} title={t("cbDismiss")}
                          onClick={() => { setCallbacks((p) => p.filter((x) => x.id !== c.id)); toast(t("cbDismiss")); }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--line)" }}>
              <div>
                <h3 className="font-bold text-[15px]">{t("liveQueue")}</h3>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--muted)" }}>{t(PRESENCE.available.k)} · {freeNow}</p>
              </div>
              {queue.length > 0 && (
                <button className="btn btn-p" style={{ padding: "6px 12px" }} onClick={pullCall} disabled={!TAKES_CALLS.includes(mine.status) || mine.status !== "available"}>
                  <PhoneIncoming size={13} />{t("pullNext")}
                </button>
              )}
            </div>
            {queue.length === 0
              ? <Empty icon={CheckCircle2} title={t("queueEmpty")} sub={t("queueEmptySub")} />
              : (
                <div className="max-h-72 overflow-auto scroll">
                  {queue.map((q, i) => {
                    const w = Math.floor((Date.now() - q.at) / 1000);
                    return (
                      <div key={q.id} className="px-5 py-3 border-b" style={{ borderColor: "#E2E8F0" }}>
                        <div className="flex items-center gap-2">
                          <span className="pill" style={{ background: "var(--slate-bg)", color: "var(--muted)" }}>{t("posInQueue", i + 1)}</span>
                          <b className="text-[13px]">{q.customer ? tv(q.customer) : t("unknownCaller")}</b>
                          <span className="ml-auto text-[12px] font-semibold" style={{ color: w > 45 ? "var(--red)" : w > 20 ? "var(--amber)" : "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
                            {t("waitedFor", mmss(w))}
                          </span>
                        </div>
                        <div className="text-[11.5px] mt-1 flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
                          {q.phone}
                          {q.ticketId && <span className="pill" style={{ background: "var(--sky)", color: "var(--blue)", padding: "1px 7px" }}><Link2 size={9} />{q.ticketId}</span>}
                        </div>
                        <div className="text-[11.5px] mt-1.5 font-semibold" style={{ color: q.routedTo ? "var(--amber)" : "var(--muted)" }}>
                          {q.routedTo ? t("ringingAt", uname(q.routedTo)) : t("lookingForAgent")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b" style={{ borderColor: "var(--line)" }}>
              <h3 className="font-bold text-[15px]">{t("agentBoard")}</h3>
              <p className="text-[12px] mt-0.5" style={{ color: "var(--muted)" }}>{t(`r${routing === "idle" ? "Idle" : routing === "load" ? "Load2" : routing === "round" ? "Round2" : "Manual2"}`)}</p>
            </div>
            <div className="max-h-72 overflow-auto scroll">
              {board.map(({ u, p, open }) => (
                <div key={u.id} className="px-5 py-2.5 border-b flex items-center gap-3" style={{ borderColor: "#E2E8F0" }}>
                  <span className="rounded-full grid place-items-center flex-none text-white font-bold text-[11px]" style={{ width: 28, height: 28, background: PRESENCE[p.status].c }}>
                    {tv(u.n).charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold truncate">{tv(u.n)}{u.id === me.id && <span className="ml-1.5 text-[10.5px]" style={{ color: "var(--muted)" }}>({t("youTag")})</span>}</div>
                    <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                      {p.status === "available" ? t("idleFor", dur(Math.max(1, Math.round((Date.now() - p.since) / MIN))))
                        : p.lastCallAt ? t("lastCallWas", ago(p.lastCallAt)) : t("noCallsYet")}
                    </div>
                  </div>
                  <div className="ml-auto text-right flex-none">
                    <span className="pill" style={{ background: PRESENCE[p.status].bg, color: PRESENCE[p.status].c }}>
                      <span className="dot" style={{ background: PRESENCE[p.status].c }} />{t(PRESENCE[p.status].k)}
                    </span>
                    <div className="text-[10.5px] mt-1" style={{ color: "var(--muted)" }}>{t("cOpen")} {open}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--line)" }}>
            <h3 className="font-bold text-[15px]">{t("callLog")}</h3>
            <span className="text-[12px]" style={{ color: "var(--muted)" }}>{t("items", calls.length)}</span>
          </div>
          {calls.length === 0
            ? <Empty icon={PhoneCall} title={t("callLogEmpty")} sub={t("callLogEmptySub")} />
            : (
              <div className="overflow-auto scroll" style={{ maxHeight: 420 }}>
                <table className="tbl">
                  <thead><tr><th>{t("cTime")}</th><th>{t("cDirection")}</th><th>{t("cCustomer")}</th><th>{t("cPhone")}</th>
                    <th className="text-right">{t("cWaited")}</th><th className="text-right">{t("cDuration")}</th>
                    <th>{t("cOutcome")}</th><th>{t("cHandledBy")}</th><th>{t("cLinked")}</th></tr></thead>
                  <tbody>
                    {calls.map((c) => {
                      const d = DIR[c.dir]; const I = d.ic;
                      return (
                        <tr key={c.id}>
                          <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{clock(c.at)}</td>
                          <td><span className="pill" style={{ background: d.bg, color: d.c }}><I size={11} />{t(d.k)}</span></td>
                          <td className="font-semibold">{c.name}</td>
                          <td style={{ fontVariantNumeric: "tabular-nums" }}>{c.phone}</td>
                          <td className="text-right" style={{ fontVariantNumeric: "tabular-nums", color: c.waited > 45 ? "var(--red)" : "var(--muted)" }}>{c.waited != null ? mmss(c.waited) : "—"}</td>
                          <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{c.dur ? mmss(c.dur) : "—"}</td>
                          <td><span className="pill" style={{ background: OUT[c.outcome].bg, color: OUT[c.outcome].c }}>{tv(OUT[c.outcome].n)}</span></td>
                          <td style={{ color: "var(--muted)" }}>
                            <div className="flex items-center gap-1.5">
                              {c.recorded && (
                                <button onClick={() => onPlay(c)} className="rounded-md p-1 flex-none hover:bg-slate-100"
                                        style={{ color: "var(--blue)" }} title={t("playRec")} aria-label={t("playRec")}>
                                  <Headphones size={13} />
                                </button>
                              )}
                              {c.by ? uname(c.by) : "—"}
                            </div>
                          </td>
                          <td>{c.ticketId
                            ? <span className="pill" style={{ background: "var(--sky)", color: "var(--blue)" }}><Link2 size={10} />{c.ticketId}</span>
                            : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════ RECORDING PLAYER ═══════════════════════ */
/* Demo tone via WebAudio. Live build: replace src with a presigned
   Supabase Storage URL and delete the oscillator block.            */

function RecPlayer({ rec, onClose }) {
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showTx, setShowTx] = useState(false);
  const audioRef = useRef({ ctx: null, osc: null, gain: null });
  const total = Math.max(rec.dur, 1);

  const stopTone = () => {
    const a = audioRef.current;
    try { a.osc?.stop(); a.ctx?.close(); } catch {}
    audioRef.current = { ctx: null, osc: null, gain: null };
  };
  const startTone = () => {
    stopTone();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = "sine"; osc.frequency.value = 340;
    gain.gain.value = 0.04;
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
    lfo.frequency.value = 2.2; lfoG.gain.value = 0.03;
    lfo.connect(lfoG); lfoG.connect(gain.gain);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); lfo.start();
    audioRef.current = { ctx, osc, gain };
  };

  useEffect(() => () => stopTone(), []);
  useEffect(() => {
    if (!playing) { stopTone(); return; }
    startTone();
    const x = setInterval(() => setPos((p) => {
      if (p + speed >= total) { setPlaying(false); return total; }
      return p + speed;
    }), 1000);
    return () => { clearInterval(x); stopTone(); };
  }, [playing, speed]);

  const tx = [
    { who: "agent", en: "Hello, thank you for calling. How can I help today?", th: "สวัสดีค่ะ ขอบคุณที่โทรเข้ามานะคะ ให้ช่วยเรื่องอะไรดีคะ" },
    { who: "cust",  en: "I'm calling about my order — it still hasn't arrived.", th: "โทรมาเรื่องออเดอร์ค่ะ ยังไม่ได้รับของเลย" },
    { who: "agent", en: "Let me check that for you right now. Could I have the order number?", th: "เดี๋ยวตรวจสอบให้ทันทีนะคะ ขอเลขที่คำสั่งซื้อด้วยค่ะ" },
    { who: "cust",  en: `It's ${rec.ticketId || "SO241234"}.`, th: `เลข ${rec.ticketId || "SO241234"} ค่ะ` },
    { who: "agent", en: "Found it — the parcel is out for delivery and should reach you tomorrow. I'll message you the tracking link as well.", th: "เจอแล้วค่ะ พัสดุกำลังนำจ่าย น่าจะถึงพรุ่งนี้นะคะ เดี๋ยวส่งลิงก์ติดตามให้ทางแชทด้วยค่ะ" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[70]" style={{ background: "var(--navy)", color: "#fff", boxShadow: "0 -8px 30px -8px rgba(15,23,42,.5)" }}>
      {showTx && (
        <div className="border-b px-6 py-4 max-h-56 overflow-auto scroll" style={{ borderColor: "rgba(255,255,255,.12)", background: "var(--navy-2)" }}>
          <div className="flex items-center gap-2 mb-3">
            <b className="text-[13px]">{t("transcript")}</b>
            <span className="text-[11px]" style={{ color: "#99F6E4" }}>{t("transcriptNote")}</span>
          </div>
          <div className="space-y-2" style={{ maxWidth: 760 }}>
            {tx.map((m, i) => (
              <div key={i} className="flex gap-2.5 text-[13px]">
                <b className="flex-none" style={{ width: 74, color: m.who === "agent" ? "#7EE2AC" : "#C9A6E8" }}>
                  {m.who === "agent" ? (rec.by ? uname(rec.by) : t("supportTeam")) : rec.name}
                </b>
                <span style={{ color: "#DCDBF0" }}>{LANG.cur === "th" ? m.th : m.en}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 px-6 py-3">
        <button onClick={() => setPlaying(!playing)} className="rounded-full grid place-items-center flex-none"
                style={{ width: 42, height: 42, background: "var(--blue)" }} aria-label={playing ? t("holdOff") : t("playRec")}>
          {playing ? <Pause size={17} /> : <Play size={17} style={{ marginLeft: 2 }} />}
        </button>

        <div className="min-w-0" style={{ width: 210 }}>
          <div className="text-[13px] font-bold truncate">{t("recOf", rec.name)}</div>
          <div className="text-[11px]" style={{ color: "#99F6E4" }}>
            {clock(rec.at)}{rec.ticketId ? ` · ${rec.ticketId}` : ""} · {rec.by ? uname(rec.by) : "—"}
          </div>
        </div>

        <span className="text-[12px] flex-none" style={{ fontVariantNumeric: "tabular-nums", color: "#99F6E4" }}>{mmss(Math.floor(pos))}</span>
        <input type="range" min={0} max={total} value={pos} onChange={(e) => setPos(+e.target.value)}
               className="flex-1" style={{ accentColor: "#9A5FBE" }} aria-label={t("recOf", rec.name)} />
        <span className="text-[12px] flex-none" style={{ fontVariantNumeric: "tabular-nums", color: "#99F6E4" }}>{mmss(total)}</span>

        <div className="flex gap-1 flex-none">
          {[1, 1.5, 2].map((s) => (
            <button key={s} onClick={() => setSpeed(s)} className="px-2 py-1 rounded-md text-[11.5px] font-bold"
                    style={{ background: speed === s ? "#fff" : "rgba(255,255,255,.12)", color: speed === s ? "var(--navy)" : "#fff" }}>
              {s}×
            </button>
          ))}
        </div>

        <button onClick={() => setShowTx(!showTx)} className="btn flex-none" style={{ padding: "7px 12px", background: showTx ? "#fff" : "rgba(255,255,255,.12)", color: showTx ? "var(--navy)" : "#fff", fontSize: 12.5 }}>
          <StickyNote size={13} />{t("transcript")}
        </button>
        <button onClick={onClose} className="p-2 rounded-lg flex-none" style={{ color: "#99F6E4" }} aria-label={t("closePlayer")}><X size={17} /></button>
      </div>

      <div className="px-6 pb-2.5 flex items-center gap-4 text-[10.5px]" style={{ color: "#94A3B8" }}>
        <span className="flex items-center gap-1.5"><Radio size={10} />{t("demoAudio")}</span>
        <span className="flex items-center gap-1.5"><ShieldCheck size={10} />{t("playbackLogged")}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════ REPORTS ═══════════════════════ */

function Reports({ tickets: realTickets, trend: realTrend, toast }) {
  const [period, setPeriod] = useState("daily");
  const [demo, setDemo] = useState(realTickets.length < 20);
  const [demoAll] = useState(() => seedDemoTickets(420, 90));
  const win = period === "daily" ? 14 : 30;
  const demoSet = useMemo(() => {
    const from = Date.now() - win * 86400000;
    const tk = demoAll.filter((x) => x.createdAt >= from);
    return { tickets: tk, trend: computeTrend(tk, win) };
  }, [demoAll, win]);
  const tickets = demo ? demoSet.tickets : realTickets;
  const trend = demo ? demoSet.trend : realTrend;

  const perf = AGENTS.map((a) => {
    const ts = tickets.filter((x) => x.owner === a.id);
    const ansd = ts.filter((x) => x.firstResponseMin != null);
    const met = ansd.filter((x) => x.firstResponseMin <= PRI[x.priority].fr);
    const done = ts.filter((x) => ["resolved", "closed"].includes(x.status));
    const withRes = done.filter((x) => x.resolveMin);
    const rated = ts.filter((x) => x.csat);
    return {
      id: a.id, name: tv(a.n), team: tv(TEAMS[a.team]), total: ts.length,
      done: done.length,
      fr: ansd.length ? Math.round(ansd.reduce((s, x) => s + x.firstResponseMin, 0) / ansd.length) : null,
      res: withRes.length ? Math.round(withRes.reduce((s, x) => s + x.resolveMin, 0) / withRes.length) : null,
      sla: ansd.length ? Math.round((met.length / ansd.length) * 100) : 0,
      csat: rated.length ? +(rated.reduce((s, x) => s + x.csat, 0) / rated.length).toFixed(2) : null,
      reopen: ts.length ? Math.round((ts.filter((x) => x.reopened).length / ts.length) * 100) : 0,
    };
  }).sort((a, b) => (b.csat || 0) - (a.csat || 0));

  const rated = tickets.filter((x) => x.csat);
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, count: rated.filter((x) => x.csat === n).length }));
  const catRep = CAT_KEYS.map((k) => {
    const ts = tickets.filter((x) => x.catKey === k);
    const done = ts.filter((x) => x.resolveMin);
    return { name: tv(CAT[k]), n: ts.length, avg: done.length ? Math.round(done.reduce((s, x) => s + x.resolveMin, 0) / done.length) : null };
  }).sort((a, b) => b.n - a.n);

  const chanRep = CH_KEYS.map((k) => {
    const ts = tickets.filter((x) => x.channel === k);
    const ansd = ts.filter((x) => x.firstResponseMin != null);
    const rt = ts.filter((x) => x.csat);
    return {
      key: k, name: tv(CH[k].n), c: CH[k].c, n: ts.length,
      fr: ansd.length ? Math.round(ansd.reduce((s, x) => s + x.firstResponseMin, 0) / ansd.length) : null,
      csat: rt.length ? +(rt.reduce((s, x) => s + x.csat, 0) / rt.length).toFixed(2) : null,
    };
  }).filter((c) => c.n > 0).sort((a, b) => b.n - a.n);

  const exportX = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(perf.map((p) => ({
      [t("cAgent")]: p.name, [t("cTeam")]: p.team, [t("cTotal")]: p.total, [t("cClosedN")]: p.done,
      [t("cFirstAvg")]: p.fr ?? "", [t("cResAvg")]: p.res ?? "", [t("cSlaMet")]: p.sla, CSAT: p.csat ?? "", [t("cReopen")]: p.reopen,
    }))), "Agents");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catRep.map((c) => ({ [t("cCategory")]: c.name, [t("cCount")]: c.n, [t("cAvgRes")]: c.avg ?? "" }))), "Categories");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(chanRep.map((c) => ({ [t("cChannel2")]: c.name, [t("cCount")]: c.n, [t("cFirstAvg")]: c.fr ?? "", CSAT: c.csat ?? "" }))), "Channels");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trend), "Daily");
    XLSX.writeFile(wb, `cs-report-${demo ? "demo-" : ""}${period}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast(t("reportExported"));
  };

  const ansd = tickets.filter((x) => x.firstResponseMin != null);
  const done = tickets.filter((x) => x.resolveMin);

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap gap-2.5 items-center">
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: "#F1F5F9" }}>
          {[["daily", t("daily")], ["monthly", t("monthly")]].map(([k, lbl]) => (
            <button key={k} onClick={() => setPeriod(k)} className="px-4 py-1.5 rounded-md text-[13px] font-semibold"
                    style={{ background: period === k ? "#fff" : "transparent", color: period === k ? "var(--blue)" : "var(--muted)", boxShadow: period === k ? "0 1px 3px rgba(15,23,42,.12)" : "none" }}>{lbl}</button>
          ))}
        </div>
        <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>{t("rangeIs", period === "daily" ? t("last14") : t("last30"))}</span>
        <label className="flex items-center gap-2 ml-auto cursor-pointer select-none text-[12.5px] font-semibold" style={{ color: demo ? "var(--amber)" : "var(--muted)" }}>
          <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} style={{ accentColor: "var(--amber)" }} />
          {t("demoData")}
        </label>
        <button className="btn btn-p" onClick={exportX}><Download size={15} />{t("exportExcel")}</button>
      </div>
      {demo && (
        <div className="text-[12.5px] px-4 py-2.5 rounded-xl flex items-center gap-2" style={{ background: "var(--amber-bg)", color: "var(--amber)", fontWeight: 600 }}>
          ⚠ {t("demoDataNote")}
        </div>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(205px,1fr))" }}>
        <Kpi icon={Ticket} label={t("rTotal")} value={fmt(tickets.length)} unit={t("uCases")} tint="var(--blue)" bg="var(--sky)" />
        <Kpi icon={Timer} label={t("rFirstAvg")} value={dur(Math.round(ansd.reduce((s, x) => s + x.firstResponseMin, 0) / (ansd.length || 1)))} tint="var(--cyan)" bg="var(--cyan-bg)" />
        <Kpi icon={CheckCircle2} label={t("rResAvg")} value={dur(Math.round(done.reduce((s, x) => s + x.resolveMin, 0) / (done.length || 1)))} tint="var(--green)" bg="var(--green-bg)" />
        <Kpi icon={Repeat} label={t("rReopen")} value={Math.round((tickets.filter((x) => x.reopened).length / (tickets.length || 1)) * 100)} unit="%" tint="var(--amber)" bg="var(--amber-bg)" />
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
        <div className="card p-5">
          <h3 className="font-bold text-[15px] mb-4">{t("csatTrend")}</h3>
          <ResponsiveContainer width="100%" height={218}>
            <LineChart data={trend} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 4" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis domain={[1, 5]} tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 12.5 }} />
              <Line type="monotone" dataKey="csat" name="CSAT" stroke="#E8940C" strokeWidth={2.6} dot={{ r: 2.5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-5">
          <h3 className="font-bold text-[15px] mb-4">{t("csatDist")}</h3>
          {dist.map((d) => (
            <div key={d.n} className="flex items-center gap-3 mb-2.5">
              <span className="flex items-center gap-1 text-[12.5px] font-semibold" style={{ width: 26 }}>{d.n}<Star size={11} fill="#E8940C" style={{ color: "#E8940C" }} /></span>
              <div className="flex-1 rounded-full overflow-hidden" style={{ height: 9, background: "#E2E8F0" }}>
                <div style={{ width: `${rated.length ? (d.count / rated.length) * 100 : 0}%`, height: "100%", background: d.n >= 4 ? "var(--green)" : d.n === 3 ? "var(--amber)" : "var(--red)" }} />
              </div>
              <b className="text-[12.5px]" style={{ width: 30, textAlign: "right" }}>{d.count}</b>
            </div>
          ))}
          <p className="text-[12px] mt-3" style={{ color: "var(--muted)" }}>
            {t("csatFoot", rated.length, tickets.filter((x) => ["resolved", "closed"].includes(x.status)).length)}
          </p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--line)" }}>
          <h3 className="font-bold text-[15px]">{t("agentPerf")}</h3>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--muted)" }}>{t("agentPerfSub")}</p>
        </div>
        <div className="overflow-x-auto scroll">
          <table className="tbl">
            <thead><tr><th style={{ width: 44 }}>#</th><th>{t("cAgent")}</th><th>{t("cTeam")}</th><th className="text-right">{t("cTotal")}</th>
              <th className="text-right">{t("cClosedN")}</th><th className="text-right">{t("cFirstAvg")}</th><th className="text-right">{t("cResAvg")}</th>
              <th className="text-right">{t("cSlaMet")}</th><th>{t("cCsat")}</th><th className="text-right">{t("cReopen")}</th></tr></thead>
            <tbody>
              {perf.map((p, i) => (
                <tr key={p.id}>
                  <td><span className="pill" style={{ background: i < 3 ? "var(--sky)" : "var(--slate-bg)", color: i < 3 ? "var(--blue)" : "var(--muted)" }}>{i + 1}</span></td>
                  <td className="font-semibold">{p.name}</td>
                  <td style={{ color: "var(--muted)" }}>{p.team}</td>
                  <td className="text-right">{p.total}</td>
                  <td className="text-right font-semibold">{p.done}</td>
                  <td className="text-right">{dur(p.fr)}</td>
                  <td className="text-right">{dur(p.res)}</td>
                  <td className="text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <div className="rounded-full overflow-hidden" style={{ width: 42, height: 5, background: "#E2E8F0" }}>
                        <div style={{ width: `${p.sla}%`, height: "100%", background: p.sla >= 85 ? "var(--green)" : p.sla >= 70 ? "var(--amber)" : "var(--red)" }} />
                      </div><b className="text-[12.5px]">{p.sla}%</b>
                    </div>
                  </td>
                  <td>{p.csat ? <span className="flex items-center gap-1.5"><Stars n={Math.round(p.csat)} size={11} /><b className="text-[12.5px]">{p.csat}</b></span> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                  <td className="text-right" style={{ color: p.reopen > 10 ? "var(--red)" : "var(--muted)", fontWeight: p.reopen > 10 ? 600 : 400 }}>{p.reopen}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--line)" }}><h3 className="font-bold text-[15px]">{t("byCategory")}</h3></div>
        <table className="tbl">
          <thead><tr><th>{t("cCategory")}</th><th className="text-right">{t("cCount")}</th><th className="text-right">{t("cShare")}</th><th className="text-right">{t("cAvgRes")}</th><th style={{ width: 200 }}></th></tr></thead>
          <tbody>
            {catRep.map((c) => (
              <tr key={c.name}>
                <td className="font-semibold">{c.name}</td>
                <td className="text-right">{c.n}</td>
                <td className="text-right">{Math.round((c.n / (tickets.length || 1)) * 100)}%</td>
                <td className="text-right">{dur(c.avg)}</td>
                <td><div className="rounded-full overflow-hidden" style={{ height: 6, background: "#E2E8F0" }}>
                  <div style={{ width: `${(c.n / (catRep[0].n || 1)) * 100}%`, height: "100%", background: "var(--blue)" }} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--line)" }}><h3 className="font-bold text-[15px]">{t("byChannel2")}</h3></div>
        <table className="tbl">
          <thead><tr><th>{t("cChannel2")}</th><th className="text-right">{t("cCount")}</th><th className="text-right">{t("cShare")}</th><th className="text-right">{t("cFirstAvg")}</th><th className="text-right">{t("cCsat")}</th><th style={{ width: 200 }}></th></tr></thead>
          <tbody>
            {chanRep.map((c) => (
              <tr key={c.key}>
                <td className="font-semibold"><span className="flex items-center gap-2"><span className="dot" style={{ background: c.c }} />{c.name}</span></td>
                <td className="text-right">{c.n}</td>
                <td className="text-right">{Math.round((c.n / (tickets.length || 1)) * 100)}%</td>
                <td className="text-right">{dur(c.fr)}</td>
                <td className="text-right">{c.csat ?? "—"}</td>
                <td><div className="rounded-full overflow-hidden" style={{ height: 6, background: "#E2E8F0" }}>
                  <div style={{ width: `${(c.n / (chanRep[0]?.n || 1)) * 100}%`, height: "100%", background: c.c }} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════ PEOPLE ═══════════════════════ */

function UsersView({ users, setUsers, me, toast }) {
  const [add, setAdd] = useState(false);
  const [f, setF] = useState({ name: "", email: "", role: "agent", team: "a" });
  const [err, setErr] = useState("");
  const create = () => {
    if (!f.name.trim()) return setErr(t("errUserName"));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return setErr(t("errEmail"));
    if (users.some((u) => u.email.toLowerCase() === f.email.toLowerCase())) return setErr(t("errDup"));
    setUsers((p) => [...p, { id: "u" + Date.now().toString().slice(-5), n: { en: f.name, th: f.name }, email: f.email, role: f.role, team: f.team, active: true }]);
    setAdd(false); setF({ name: "", email: "", role: "agent", team: "a" }); toast(t("userAdded"));
  };
  return (
    <div className="space-y-4">
      <div className="card p-4 flex items-center justify-between">
        <div><h3 className="font-bold text-[15px]">{t("usersTitle")}</h3>
          <p className="text-[12.5px] mt-0.5" style={{ color: "var(--muted)" }}>{t("usersSub", users.filter((u) => u.active).length, users.length)}</p></div>
        <button className="btn btn-p" onClick={() => setAdd(true)}><UserPlus size={15} />{t("addUser")}</button>
      </div>
      <div className="card overflow-hidden">
        <table className="tbl">
          <thead><tr><th>{t("cName")}</th><th>{t("cEmail")}</th><th>{t("cTeam")}</th><th>{t("cRole")}</th><th>{t("cStatus")}</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-semibold">{tv(u.n)}{u.id === me.id && <span className="pill ml-2" style={{ background: "var(--sky)", color: "var(--blue)" }}>{t("youTag")}</span>}</td>
                <td style={{ color: "var(--muted)" }}>{u.email}</td>
                <td>{tv(TEAMS[u.team])}</td>
                <td>
                  <select className="fld" style={{ width: 138, padding: "5px 9px", fontSize: 12.5 }} value={u.role} disabled={u.id === me.id}
                          onChange={(e) => { setUsers((p) => p.map((x) => x.id === u.id ? { ...x, role: e.target.value } : x)); toast(t("roleUpdated", tv(u.n))); }}>
                    <option value="admin">{t("rAdmin")}</option><option value="manager">{t("rSup")}</option><option value="agent">{t("rAgent")}</option>
                  </select>
                </td>
                <td><span className="pill" style={{ background: u.active ? "var(--green-bg)" : "var(--slate-bg)", color: u.active ? "var(--green)" : "var(--muted)" }}>
                  <span className="dot" style={{ background: u.active ? "var(--green)" : "#94A3B8" }} />{u.active ? t("activeSt") : t("inactiveSt")}</span></td>
                <td className="text-right">
                  <button className="btn btn-g" style={{ padding: "5px 11px" }} disabled={u.id === me.id}
                          onClick={() => { setUsers((p) => p.map((x) => x.id === u.id ? { ...x, active: !x.active } : x)); toast(u.active ? t("userDisabled", tv(u.n)) : t("userEnabled", tv(u.n))); }}>
                    {u.active ? t("disable") : t("enable")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {add && (
        <Modal title={t("addUser")} sub={t("addUserSub")} onClose={() => setAdd(false)}>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="lbl">{t("cName")} *</label><input className="fld" value={f.name} onChange={(e) => { setF({ ...f, name: e.target.value }); setErr(""); }} /></div>
            <div><label className="lbl">{t("cEmail")} *</label><input className="fld" value={f.email} onChange={(e) => { setF({ ...f, email: e.target.value }); setErr(""); }} placeholder="name@company.co.th" /></div>
            <div className="col-span-2"><label className="lbl">{t("cTeam")}</label>
              <select className="fld" value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })}>
                {Object.keys(TEAMS).map((k) => <option key={k} value={k}>{tv(TEAMS[k])}</option>)}</select></div>
            <div className="col-span-2"><label className="lbl">{t("cRole")}</label>
              <div className="grid grid-cols-3 gap-2">
                {[["admin", t("rAdmin"), t("rAdminDesc")], ["manager", t("rSup"), t("rSupDesc")], ["agent", t("rAgent"), t("rAgentDesc")]].map(([k, ti, d]) => (
                  <button key={k} onClick={() => setF({ ...f, role: k })} className="text-left p-3 rounded-xl border"
                          style={{ borderColor: f.role === k ? "var(--blue)" : "var(--line)", background: f.role === k ? "var(--sky)" : "#fff" }}>
                    <b className="text-[13px]">{ti}</b><p className="text-[11.5px] mt-0.5" style={{ color: "var(--muted)" }}>{d}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
          {err && <p className="text-[12.5px] mt-3 font-medium" style={{ color: "var(--red)" }}>{err}</p>}
          <div className="flex gap-2 justify-end mt-6">
            <button className="btn btn-g" onClick={() => setAdd(false)}>{t("cancel")}</button>
            <button className="btn btn-p" onClick={create}>{t("addUser")}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════ SETTINGS ═══════════════════════ */

function CallRouting({ routing, setRouting, ringFor, setRingFor, maxWait, setMaxWait, toast }) {
  const rules = [["idle", t("rIdle"), t("rIdleD")], ["load", t("rLoad2"), t("rLoadD2")],
                 ["round", t("rRound2"), t("rRoundD2")], ["manual", t("rManual2"), t("rManualD2")]];
  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="kpi-ic" style={{ background: "var(--green-bg)" }}><PhoneIncoming size={20} style={{ color: "var(--green)" }} /></div>
        <div><h3 className="font-bold text-[15px]">{t("routingTitle")}</h3>
          <p className="text-[12.5px]" style={{ color: "var(--muted)" }}>{t("routingSub")}</p></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {rules.map(([k, ti, d]) => (
          <button key={k} onClick={() => { setRouting(k); toast(t("ruleChanged", ti)); }} className="text-left p-3.5 rounded-xl border"
                  style={{ borderColor: routing === k ? "var(--blue)" : "var(--line)", background: routing === k ? "var(--sky)" : "#fff" }}>
            <b className="text-[13px]">{ti}</b><p className="text-[11.5px] mt-0.5" style={{ color: "var(--muted)" }}>{d}</p>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 mt-5">
        <div><label className="lbl">{t("ringFor")}</label>
          <div className="flex items-center gap-2">
            <input className="fld" type="number" min={5} max={60} value={ringFor} onChange={(e) => setRingFor(Math.max(5, +e.target.value || 20))} />
            <span className="text-[12.5px] flex-none" style={{ color: "var(--muted)" }}>{t("secs")}</span>
          </div></div>
        <div><label className="lbl">{t("maxWaitLbl")}</label>
          <div className="flex items-center gap-2">
            <input className="fld" type="number" min={20} max={600} value={maxWait} onChange={(e) => setMaxWait(Math.max(20, +e.target.value || 90))} />
            <span className="text-[12.5px] flex-none" style={{ color: "var(--muted)" }}>{t("secs")}</span>
          </div></div>
      </div>
    </div>
  );
}

function Telephony({ sip, setSip, toast }) {
  const [f, setF] = useState(sip);
  const test = () => {
    if (!f.host.trim()) return toast(t("sipNeedHost"), "error");
    setSip({ ...f, connected: true });
    toast(t("sipConnected", f.provider, `${f.host}:${f.port}`));
  };
  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="kpi-ic" style={{ background: "var(--sky)" }}><Server size={20} style={{ color: "var(--blue)" }} /></div>
        <div><h3 className="font-bold text-[15px]">{t("telTitle")}</h3>
          <p className="text-[12.5px]" style={{ color: "var(--muted)" }}>{t("telSub")}</p></div>
        <span className="pill ml-auto" style={{ background: sip.connected ? "var(--green-bg)" : "var(--amber-bg)", color: sip.connected ? "var(--green)" : "var(--amber)" }}>
          <span className="dot" style={{ background: sip.connected ? "var(--green)" : "var(--amber)" }} />{sip.connected ? t("telConnected") : t("telPending")}
        </span>
      </div>

      <label className="lbl">{t("provider")}</label>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {["3CX", "Asterisk", "SIP Trunk"].map((p) => (
          <button key={p} onClick={() => setF({ ...f, provider: p })} className="py-2.5 rounded-xl border text-[13px] font-semibold"
                  style={{ borderColor: f.provider === p ? "var(--blue)" : "var(--line)", background: f.provider === p ? "var(--sky)" : "#fff", color: f.provider === p ? "var(--blue)" : "var(--ink)" }}>{p}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2"><label className="lbl">{t("sipServer")}</label><input className="fld" value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} placeholder="pbx.company.co.th" /></div>
        <div><label className="lbl">{t("sipPort")}</label><input className="fld" value={f.port} onChange={(e) => setF({ ...f, port: e.target.value })} /></div>
        <div><label className="lbl">{t("sipProto")}</label>
          <select className="fld" value={f.proto} onChange={(e) => setF({ ...f, proto: e.target.value })}><option>WSS</option><option>TLS</option><option>UDP</option></select></div>
        <div><label className="lbl">{t("sipExt")}</label><input className="fld" value={f.ext} onChange={(e) => setF({ ...f, ext: e.target.value })} /></div>
        <div><label className="lbl">{t("sipSecret")}</label><input className="fld" type="password" value={f.secret} onChange={(e) => setF({ ...f, secret: e.target.value })} /></div>
        <div className="col-span-2"><label className="lbl">{t("callerId")}</label><input className="fld" value={f.cid} onChange={(e) => setF({ ...f, cid: e.target.value })} /></div>
      </div>

      <div className="flex items-center gap-3 mt-4 p-3.5 rounded-xl" style={{ background: "#FBFAFD", border: "1px solid var(--line)" }}>
        <Headphones size={17} style={{ color: "var(--blue)" }} className="flex-none" />
        <p className="text-[12.5px]" style={{ color: "var(--muted)" }}>{t("recNote")}</p>
      </div>

      <div className="flex gap-2 mt-5">
        <button className="btn btn-p" onClick={test}><Radio size={15} />{t("testSave")}</button>
        <button className="btn btn-g" onClick={() => { setSip({ ...f, connected: false }); toast(t("sipDropped")); }}>{t("disconnect")}</button>
      </div>
    </div>
  );
}

/* "My signature" — the team shares a set of template shells; each person fills
   in their own name / role / phone, or writes a fully custom block. Everything
   lives in kv_state so the edge function resolves exactly the same text when it
   signs the outgoing email. */
function SignatureSettings({ me, toast }) {
  const [cfg, setCfg] = useState(null);
  const [mine, setMine] = useState({ mode: "template", templateId: "", name: "", role: "", phone: "", custom: "" });
  const [box, setBox] = useState(OUTBOUND_MAILBOXES[0]);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);

  const key = (me.email || me.id || "").toLowerCase();

  useEffect(() => {
    supabase.from("kv_state").select("value").eq("key", "nirm-crm-signatures").maybeSingle()
      .then(({ data }) => {
        const v = data?.value;
        if (!v) return;
        setCfg(v);
        const existing = (v.byAgent || {})[key] || {};
        setMine({
          mode: existing.mode || "template",
          templateId: existing.templateId || v.defaultTemplate || (v.templates?.[0]?.id ?? ""),
          name: existing.name || tv(me.n),
          role: existing.role || "",
          phone: existing.phone || "",
          custom: existing.custom || "",
        });
      })
      .catch(() => {});
  }, [key]);

  // live preview straight from the server, so it matches what actually sends
  useEffect(() => {
    if (!cfg) return;
    const id = setTimeout(() => {
      const shell = mine.mode === "custom"
        ? mine.custom
        : (cfg.templates || []).find((x) => x.id === mine.templateId)?.body || "";
      const brand = cfg.brandByMailbox?.[box] || "CREA Customer Care";
      const out = String(shell)
        .replace(/\{\{\s*(name|agent)\s*\}\}/gi, mine.name || tv(me.n))
        .replace(/\{\{\s*role\s*\}\}/gi, mine.role || "Customer Care")
        .replace(/\{\{\s*phone\s*\}\}/gi, mine.phone || "")
        .replace(/\{\{\s*mailbox\s*\}\}/gi, box)
        .replace(/\{\{\s*brand\s*\}\}/gi, brand)
        .split("\n").map((l) => l.replace(/\s*·\s*$/, "").replace(/^\s*·\s*/, "").trimEnd())
        .join("\n").trim();
      setPreview(out);
    }, 120);
    return () => clearTimeout(id);
  }, [cfg, mine, box]);

  const save = async () => {
    if (!cfg) return;
    setBusy(true);
    const next = { ...cfg, byAgent: { ...(cfg.byAgent || {}), [key]: mine } };
    const { error } = await supabase.from("kv_state")
      .upsert({ key: "nirm-crm-signatures", value: next }, { onConflict: "key" });
    setBusy(false);
    if (!error) setCfg(next);
    toast(error ? error.message : t("sigSaved"), error ? "error" : "ok");
  };

  if (!cfg) return null;

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="kpi-ic" style={{ background: "var(--sky)" }}><Mail size={20} style={{ color: "var(--blue)" }} /></div>
        <div className="flex-1">
          <h3 className="font-bold text-[15px]">{t("sigMine")}</h3>
          <p className="text-[12.5px]" style={{ color: "var(--muted)" }}>{t("sigMineSub")}</p>
        </div>
      </div>

      {/* template shells + "write my own" */}
      <label className="lbl">{t("sigTemplate")}</label>
      <div className="flex gap-1 p-1 rounded-lg mb-3 flex-wrap" style={{ background: "#F1F5F9" }}>
        {(cfg.templates || []).map((tp) => {
          const on = mine.mode === "template" && mine.templateId === tp.id;
          return (
            <button key={tp.id} onClick={() => setMine((p) => ({ ...p, mode: "template", templateId: tp.id }))}
                    className="px-3 py-1.5 rounded-md text-[12px] font-semibold"
                    style={{ background: on ? "#fff" : "transparent", color: on ? "var(--blue)" : "var(--muted)",
                             boxShadow: on ? "0 1px 3px rgba(15,23,42,.12)" : "none" }}>{tp.name}</button>
          );
        })}
        <button onClick={() => setMine((p) => ({ ...p, mode: "custom" }))}
                className="px-3 py-1.5 rounded-md text-[12px] font-semibold"
                style={{ background: mine.mode === "custom" ? "#fff" : "transparent",
                         color: mine.mode === "custom" ? "var(--blue)" : "var(--muted)",
                         boxShadow: mine.mode === "custom" ? "0 1px 3px rgba(15,23,42,.12)" : "none" }}>{t("sigCustom")}</button>
      </div>

      {mine.mode === "custom" ? (
        <>
          <textarea className="fld" rows={6} style={{ fontFamily: "inherit" }} value={mine.custom}
                    onChange={(e) => setMine((p) => ({ ...p, custom: e.target.value }))} />
          <p className="text-[11.5px] mt-1.5" style={{ color: "var(--muted)" }}>{t("sigVars")}</p>
        </>
      ) : (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div><label className="lbl">{t("sigName")}</label>
            <input className="fld" value={mine.name} onChange={(e) => setMine((p) => ({ ...p, name: e.target.value }))} /></div>
          <div><label className="lbl">{t("sigRole")}</label>
            <input className="fld" value={mine.role} onChange={(e) => setMine((p) => ({ ...p, role: e.target.value }))} /></div>
          <div style={{ gridColumn: "1 / -1" }}><label className="lbl">{t("sigPhone")}</label>
            <input className="fld" value={mine.phone} onChange={(e) => setMine((p) => ({ ...p, phone: e.target.value }))} /></div>
        </div>
      )}

      {/* preview per mailbox — brand line changes with the client */}
      {/* preview against any of the brand mailboxes — the brand line follows it */}
      <label className="lbl mt-4">{t("sigPreviewAs", cfg.brandByMailbox?.[box] || box.split("@")[0])}</label>
      <select className="fld mb-2" value={box} onChange={(e) => setBox(e.target.value)}>
        {Object.keys(cfg.brandByMailbox || {}).sort().map((m) => (
          <option key={m} value={m}>{(cfg.brandByMailbox[m] || m.split("@")[0])} — {m}</option>
        ))}
      </select>
      <pre className="px-3 py-2.5 rounded-lg whitespace-pre-wrap"
           style={{ background: "var(--slate-bg)", color: "var(--ink)", fontFamily: "inherit", fontSize: 12.5 }}>{preview}</pre>

      <button className="btn btn-p mt-3" disabled={busy} onClick={save}><Save size={15} />{t("sigSave")}</button>
    </div>
  );
}

function SettingsView({ chans, setChans, notif, setNotif, assign, setAssign, sip, setSip, routing, setRouting, ringFor, setRingFor, maxWait, setMaxWait, toast, me }) {
  const rules = [["round", t("asRound"), t("asRoundD")], ["load", t("asLoad"), t("asLoadD")], ["manual", t("asManual"), t("asManualD")]];
  const notifs = [["risk", t("nRisk"), t("nRiskD")], ["unassigned", t("nUnassigned"), t("nUnassignedD")], ["daily", t("nDaily"), t("nDailyD")], ["lowcsat", t("nLowCsat"), t("nLowCsatD")]];
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "1.2fr 1fr" }}>
      <div className="space-y-4">
        <SignatureSettings me={me} toast={toast} />

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="kpi-ic" style={{ background: "var(--sky)" }}><Inbox size={20} style={{ color: "var(--blue)" }} /></div>
            <div><h3 className="font-bold text-[15px]">{t("chansTitle")}</h3>
              <p className="text-[12.5px]" style={{ color: "var(--muted)" }}>{t("chansSub")}</p></div>
          </div>
          {CH_KEYS.map((k) => {
            const c = CH[k]; const I = c.ic;
            return (
              <div key={k} className="flex items-center gap-3 py-3 border-b" style={{ borderColor: "#E2E8F0" }}>
                <span className="kpi-ic" style={{ background: c.bg, width: 36, height: 36, borderRadius: 10 }}><I size={16} style={{ color: c.c }} /></span>
                <div><b className="text-[13.5px]">{tv(c.n)}</b>
                  <p className="text-[11.5px] mt-0.5" style={{ color: "var(--muted)" }}>{chans[k] ? t("chanOn") : t("chanOff")}</p></div>
                <button className="ml-auto rounded-full flex-none transition" style={{ width: 40, height: 22, padding: 3, background: chans[k] ? "var(--green)" : "#CBD5E1" }}
                        onClick={() => { setChans((p) => ({ ...p, [k]: !p[k] })); toast(chans[k] ? t("chanTurnedOff", tv(c.n)) : t("chanTurnedOn", tv(c.n))); }}>
                  <span className="block rounded-full bg-white transition" style={{ width: 16, height: 16, transform: chans[k] ? "translateX(18px)" : "none" }} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="kpi-ic" style={{ background: "var(--violet-bg)" }}><Users size={20} style={{ color: "var(--violet)" }} /></div>
            <div><h3 className="font-bold text-[15px]">{t("autoAssign")}</h3>
              <p className="text-[12.5px]" style={{ color: "var(--muted)" }}>{t("autoAssignSub")}</p></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {rules.map(([k, ti, d]) => (
              <button key={k} onClick={() => { setAssign(k); toast(t("ruleChanged", ti)); }} className="text-left p-3.5 rounded-xl border"
                      style={{ borderColor: assign === k ? "var(--blue)" : "var(--line)", background: assign === k ? "var(--sky)" : "#fff" }}>
                <b className="text-[13px]">{ti}</b><p className="text-[11.5px] mt-0.5" style={{ color: "var(--muted)" }}>{d}</p>
              </button>
            ))}
          </div>
        </div>

        <CallRouting routing={routing} setRouting={setRouting} ringFor={ringFor} setRingFor={setRingFor} maxWait={maxWait} setMaxWait={setMaxWait} toast={toast} />
        <Telephony sip={sip} setSip={setSip} toast={toast} />
      </div>

      <div className="space-y-4">
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="kpi-ic" style={{ background: "var(--cyan-bg)" }}><Timer size={20} style={{ color: "var(--cyan)" }} /></div>
            <div><h3 className="font-bold text-[15px]">{t("slaTitle")}</h3>
              <p className="text-[12.5px]" style={{ color: "var(--muted)" }}>{t("slaSub")}</p></div>
          </div>
          <table className="tbl">
            <thead><tr><th>{t("cPriority")}</th><th className="text-right">{t("cFirstIn")}</th><th className="text-right">{t("cCloseIn")}</th></tr></thead>
            <tbody>
              {PRI_KEYS.map((k) => (
                <tr key={k}><td><Chip map={PRI} k={k} /></td>
                  <td className="text-right font-semibold">{dur(PRI[k].fr)}</td>
                  <td className="text-right font-semibold">{dur(PRI[k].res)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-3 mt-4 p-3.5 rounded-xl" style={{ background: "#FBFAFD", border: "1px solid var(--line)" }}>
            <ShieldCheck size={17} style={{ color: "var(--green)" }} className="flex-none" />
            <p className="text-[12.5px]" style={{ color: "var(--muted)" }}>{t("slaNote")}</p>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="kpi-ic" style={{ background: "var(--amber-bg)" }}><Bell size={20} style={{ color: "var(--amber)" }} /></div>
            <div><h3 className="font-bold text-[15px]">{t("notifSettings")}</h3>
              <p className="text-[12.5px]" style={{ color: "var(--muted)" }}>{t("notifSettingsSub")}</p></div>
          </div>
          {notifs.map(([k, ti, d]) => (
            <button key={k} onClick={() => setNotif((p) => ({ ...p, [k]: !p[k] }))} className="w-full flex items-center gap-3 py-3.5 border-b text-left" style={{ borderColor: "#E2E8F0" }}>
              <div><b className="text-[13.5px]">{ti}</b><p className="text-[12px] mt-0.5" style={{ color: "var(--muted)" }}>{d}</p></div>
              <span className="ml-auto rounded-full flex-none transition" style={{ width: 40, height: 22, padding: 3, background: notif[k] ? "var(--green)" : "#CBD5E1" }}>
                <span className="block rounded-full bg-white transition" style={{ width: 16, height: 16, transform: notif[k] ? "translateX(18px)" : "none" }} />
              </span>
            </button>
          ))}
          <p className="lbl mt-5">{t("bizHours")}</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">{t("openAt")}</label><input className="fld" type="time" defaultValue="09:00" /></div>
            <div><label className="lbl">{t("closeAt")}</label><input className="fld" type="time" defaultValue="19:00" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ APP ═══════════════════════ */

const NAV = [
  { k: "dash",      key: "navDash",      ic: LayoutDashboard, roles: ["admin", "manager", "agent"] },
  { k: "inbox",     key: "navInbox",     ic: Inbox,           roles: ["admin", "manager", "agent"] },
  { k: "tickets",   key: "navTickets",   ic: Ticket,          roles: ["admin", "manager", "agent"] },
  { k: "calls",     key: "navCalls",     ic: PhoneCall,       roles: ["admin", "manager", "agent"] },
  { k: "customers", key: "navCustomers", ic: Users,           roles: ["admin", "manager", "agent"] },
  { k: "kb",        key: "navKb",        ic: BookOpen,        roles: ["admin", "manager", "agent"] },
  { k: "reports",   key: "navReports",   ic: BarChart3,       roles: ["admin", "manager"] },
  { k: "users",     key: "navUsers",     ic: UserCog,         roles: ["admin"] },
  { k: "settings",  key: "navSettings",  ic: Settings,        roles: ["admin", "manager"] },
];

export default function ServiceCRM({ user, role }) {
  const [lang, setLangState] = useState("en");
  LANG.cur = lang;                       // keep module helpers in sync before children render
  const setLang = (l) => { LANG.cur = l; setLangState(l); };

  // NiRM session is the login — no second sign-in inside the tab.
  // NiRM role → CRM role: manager→admin (full control), T2→supervisor, else agent.
  const [me, setMe] = useState(() => {
    const crmRole = role === "manager" ? "admin" : role === "fulltime" ? "manager" : "agent";
    const display = (user || "User").replace(/@.*/, "");
    const known = USERS.find((u) => tv(u.n).toLowerCase().startsWith(display.toLowerCase()));
    return known ? { ...known, role: crmRole } : { id: "nirm-" + display.toLowerCase(), n: { en: display, th: display }, role: crmRole, team: "cx", email: user || "", active: true };
  });
  const [tab, setTab] = useState("dash");
  const [tickets, setTickets] = useState([]);   // real cases only — no demo seeds
  const [unread, setUnread] = useState({});     // ticketId → # new inbound msgs since last opened
  const seenInRef = useRef(null);               // ticketId → inbound msg count at last poll (null = first load)

  // ask once for desktop-notification permission (browser remembers the answer)
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
  }, []);

  // ── live email cases: merge in front of demo seeds, refresh every 20s ──
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const real = await fetchRealTickets();
        if (stop || !real.length) return;
        // ── new inbound message detection → chime + unread badges ──
        // only OPEN cases count toward chime/badges — auto-closed robot mail stays silent
        const openReal = real.filter((x) => !["resolved", "closed"].includes(x.status));
        const counts = new Map(openReal.map((x) => [x.id, x.messages.filter((m) => m.from === "customer").length]));
        if (seenInRef.current) {
          const fresh = {}; let hits = 0, latest = null;
          for (const x of openReal) {
            const grew = (counts.get(x.id) || 0) - (seenInRef.current.get(x.id) ?? 0);
            if (grew > 0) { fresh[x.id] = grew; hits += grew; latest = x; }
          }
          if (hits) {
            setUnread((u) => { const n = { ...u }; for (const k in fresh) n[k] = (n[k] || 0) + fresh[k]; return n; });
            playChime();
            const label = hits > 1 ? `${hits} new messages` : `New message from ${tv(latest.customer)}`;
            toast(`📩 ${label}`);
            if (document.hidden) notifyDesktop("Service Desk — " + label, hits > 1 ? "Open the inbox to view them." : (subjectOf(latest) || tv(latest.customer)));
          }
        }
        seenInRef.current = counts;
        setTickets((p) => {
          const demo = p.filter((x) => !x.dbId);
          return [...real, ...demo].sort((a, b) => b.createdAt - a.createdAt);
        });
      } catch (e) { console.warn("[crm] live ticket load failed", e); }
    };
    load();
    // Realtime push: a new message or ticket reloads within ~1s instead of waiting
    // for the poll. The 20s interval stays as a safety net if the socket drops.
    const ch = supabase.channel("crm-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, load)
      .subscribe();
    const iv = setInterval(load, 20000);
    return () => { stop = true; clearInterval(iv); supabase.removeChannel(ch); };
  }, []);
  const [users, setUsers] = useState(USERS);
  const trend = useMemo(() => computeTrend(tickets), [tickets]);   // real volumes, not demo
  const [kb, setKb] = useState(KB_SEED);
  const [canned, setCanned] = useState(CANNED_SEED);
  const [toasts, setToasts] = useState([]);
  const [bell, setBell] = useState(false);
  const [focus, setFocus] = useState(null);
  const [chans, setChans] = useState({ email: true, webchat: true, phone: true, line: false, fb: false, tiktok: false, shopee: false, lazada: false });
  const [notif, setNotif] = useState({ risk: true, unassigned: true, daily: true, lowcsat: true });
  const [assign, setAssign] = useState("load");
  const [calls, setCalls] = useState([]);
  const [call, setCall] = useState(null);
  const [playRec, setPlayRec] = useState(null);
  const [queue, setQueue] = useState([]);
  const [callbacks, setCallbacks] = useState([]);   // abandoned callers owed a return call
  const [presence, setPresence] = useState(seedPresence);
  const [routing, setRouting] = useState("idle");
  const [ringFor, setRingFor] = useState(20);
  const [maxWait, setMaxWait] = useState(90);
  const rr = useRef(0);
  const [sip, setSip] = useState({ provider: "3CX", host: "pbx.company.co.th", port: "5061", proto: "WSS", ext: "1001", secret: "••••••••", cid: "02-000-0000", connected: true });

  const toast = (msg, kind = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, msg, kind }]);
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), 3400);
  };

  const scope = (arr) => me?.role === "agent" ? arr.filter((x) => x.owner === me.id) : arr;
  const alerts = me ? scope(tickets).filter((x) => OPEN_ST.includes(x.status) && ["breach", "risk"].includes(sla(x).state)) : [];
  const markRead = (id) => setUnread((u) => { if (!u[id]) return u; const n = { ...u }; delete n[id]; return n; });
  const unreadTotal = Object.values(unread).reduce((a, b) => a + b, 0);
  const openTicket = (x) => { setFocus(x); setTab("inbox"); markRead(x.id); };

  /* ── ACD: pick the next agent for a waiting call ── */
  const pickAgent = (tried, pres) => {
    const free = USERS.filter((u) => u.active && pres[u.id]?.status === "available" && !tried.includes(u.id));
    if (!free.length) return null;
    if (routing === "manual") return null;
    if (routing === "load") {
      return free.reduce((a, b) => {
        const n = (x) => tickets.filter((k) => k.owner === x.id && OPEN_ST.includes(k.status)).length;
        return n(b) < n(a) ? b : a;
      }).id;
    }
    if (routing === "round") { rr.current = (rr.current + 1) % free.length; return free[rr.current].id; }
    return free.reduce((a, b) => (pres[b.id].since < pres[a.id].since ? b : a)).id;   // longest idle
  };

  const answerAt = (q, agentId) => {
    setPresence((p) => ({ ...p, [agentId]: { ...p[agentId], status: "oncall", since: Date.now() } }));
    const waited = Math.floor((Date.now() - q.at) / 1000);
    const talk = 45 + ri(170);
    toast(t("answeredByX", uname(agentId), q.customer ? tv(q.customer) : t("unknownCaller")));
    setQueue((p) => p.filter((x) => x.id !== q.id));
    setTimeout(() => {
      setPresence((p) => ({ ...p, [agentId]: { status: "available", since: Date.now(), lastCallAt: Date.now() } }));
      setCalls((p) => [{ id: Date.now() + Math.random(), at: Date.now(), dir: "in", phone: q.phone,
        name: q.customer ? tv(q.customer) : t("unknownCaller"), dur: talk, outcome: "resolved",
        note: "", ticketId: q.ticketId, recorded: true, waited, by: agentId }, ...p]);
    }, 9000 + ri(12000));
  };

  const abandon = (q) => {
    const waited = Math.floor((Date.now() - q.at) / 1000);
    setQueue((p) => p.filter((x) => x.id !== q.id));
    setCalls((p) => [{ id: Date.now() + Math.random(), at: Date.now(), dir: "missed", phone: q.phone,
      name: q.customer ? tv(q.customer) : t("unknownCaller"), dur: 0, outcome: "noanswer",
      note: "", ticketId: q.ticketId, recorded: false, waited, by: null }, ...p]);
    // one open callback per number — refresh timestamp if they abandoned again
    setCallbacks((p) => [{ id: "cb" + Date.now(), phone: q.phone, customer: q.customer || null,
      ticketId: q.ticketId || null, at: Date.now(), waited },
      ...p.filter((c) => c.phone !== q.phone)]);
    toast(t("cbAlert"), "error");
  };

  /* ── queue ticker: route, ring, time out, abandon ── */
  useEffect(() => {
    if (!me) return;
    const x = setInterval(() => {
      setQueue((qs) => {
        if (!qs.length) return qs;
        const nowMs = Date.now();
        let next = [...qs];
        for (const q of next) {
          if (q.routedTo) {
            if (q.routedTo === me.id) continue;                       // my console owns the timer
            if (nowMs - q.ringAt > 2500 + (q.seed % 2500)) answerAt(q, q.routedTo);
            continue;
          }
          if (nowMs - q.at > maxWait * 1000) { abandon(q); continue; }
          const pick = pickAgent(q.tried, presence);
          if (!pick) continue;
          q.routedTo = pick; q.ringAt = nowMs;
          if (pick === me.id) {
            setPresence((p) => ({ ...p, [me.id]: { ...p[me.id], status: "ringing", since: nowMs } }));
            setCall({ dir: "in", phone: q.phone, customer: q.customer, ticketId: q.ticketId,
                      queueId: q.id, waited: Math.floor((nowMs - q.at) / 1000) });
            toast(t("routedToYou"));
          } else {
            setPresence((p) => ({ ...p, [pick]: { ...p[pick], status: "ringing", since: nowMs } }));
          }
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(x);
  }, [me, presence, routing, maxWait, tickets]);

  /* ── incoming-call screen-pop ──────────────────────────────────────────────
     Polls call_events for a ringing leg. Real calls arrive from Twilio (the
     /twilio/voice TwiML writes the row as the phone rings); the Simulate button
     in the Calls tab feeds the same table for demos. Answering picks up the
     live Twilio call if the softphone is online. */
  const sf = useSoftphone(toast);
  const [incoming, setIncoming] = useState(null);
  const seenCallRef = useRef(new Set());
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      if (stop || incoming) return;
      try {
        const since = new Date(Date.now() - 60000).toISOString();
        const { data } = await supabase.from("call_events")
          .select("*").eq("status", "ringing").eq("direction", "inbound")
          .gte("created_at", since).order("id", { ascending: false }).limit(1);
        const ev = data && data[0];
        if (!ev || seenCallRef.current.has(ev.id)) return;
        seenCallRef.current.add(ev.id);
        setIncoming(ev);
        notifyDesktop(t("incCall"), `${ev.caller_name || ev.from_number || ""}`);
      } catch (e) { /* offline — try again next tick */ }
    };
    poll();
    const iv = setInterval(poll, 3000);
    return () => { stop = true; clearInterval(iv); };
  }, [incoming]);

  const answerIncoming = async () => {
    const ev = incoming;
    setIncoming(null);
    if (!ev) return;
    const key = phoneKey(ev.from_number);
    const hit = tickets.find((x) => phoneKey(x.phone) === key && OPEN_ST.includes(x.status));
    if (sf.conn) sf.accept();          // pick up the real Twilio leg
    supabase.from("call_events").update({ status: "answered" }).eq("id", ev.id).then(() => {}, () => {});
    if (hit) { openTicket(hit); }
    else {
      // brand-new caller — drop them straight into a phone case
      const fresh = {
        id: "TK-C" + String(Date.now()).slice(-6),
        catKey: "inquiry", product: null,
        customer: biText(ev.caller_name || ev.from_number || "Caller"),
        phone: ev.from_number || "", email: "", order: null,
        channel: "phone", priority: "normal", status: "open", owner: me.id,
        createdAt: Date.now(), firstResponseMin: 0, resolveMin: null,
        csat: null, reopened: false, tags: [], messages: [],
      };
      setTickets((p) => [fresh, ...p]);
      openTicket(fresh);
    }
    setPresence((p) => ({ ...p, [me.id]: { ...p[me.id], status: "oncall", since: Date.now() } }));
    toast(t("incAnswered"));
  };

  const declineIncoming = () => {
    const ev = incoming;
    setIncoming(null);
    if (sf.conn) sf.reject();
    if (ev) supabase.from("call_events").update({ status: "missed" }).eq("id", ev.id).then(() => {}, () => {});
    toast(t("incDeclined"), "error");
  };

  const simulateCall = async () => {
    try {
      await fetch(`${TEL_BASE}/simulate?token=${TEL_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: "0922634562" }),
      });
      toast(t("simSent"));
    } catch (e) { toast(String(e.message || e), "error"); }
  };

  const startCall = (payload) => {
    if (!sip.connected) return toast(t("sipOff"), "error");
    if (payload.dir === "in") {                                       // inbound always goes through the queue
      const q = { id: Date.now(), at: Date.now(), seed: ri(9999), phone: payload.phone,
                  customer: payload.customer, ticketId: payload.ticketId, tried: [], routedTo: null };
      setQueue((p) => [...p, q]);
      if (!USERS.some((u) => u.active && presence[u.id]?.status === "available")) toast(t("noAgentFree"), "error");
      return;
    }
    setPresence((p) => ({ ...p, [me.id]: { ...p[me.id], status: "oncall", since: Date.now() } }));
    setCall(payload);
  };

  const pullCall = () => {
    const q = queue.find((x) => !x.routedTo || x.routedTo !== me.id);
    if (!q) return;
    setQueue((p) => p.map((x) => x.id === q.id ? { ...x, routedTo: me.id, ringAt: Date.now() } : x));
    setPresence((p) => ({ ...p, [me.id]: { ...p[me.id], status: "ringing", since: Date.now() } }));
    setCall({ dir: "in", phone: q.phone, customer: q.customer, ticketId: q.ticketId,
              queueId: q.id, waited: Math.floor((Date.now() - q.at) / 1000) });
  };

  /* I let it ring out or declined — hand it to the next agent */
  const passOn = () => {
    const qid = call?.queueId;
    setCall(null);
    setPresence((p) => ({ ...p, [me.id]: { ...p[me.id], status: "available", since: Date.now() } }));
    if (qid) setQueue((p) => p.map((x) => x.id === qid ? { ...x, routedTo: null, tried: [...x.tried, me.id] } : x));
    toast(t("rerouted"));
  };

  const endCall = ({ dir, phone, customer, name, dur: secs, outcome, note, ticketId, recorded, queueId, waited }) => {
    const at = Date.now();
    const finalDir = secs === 0 && dir === "in" ? "missed" : dir;
    setCalls((p) => [{ id: at, at, dir: finalDir, phone, name, dur: secs, outcome, note, ticketId, recorded, waited: waited ?? null, by: me.id }, ...p]);
    if (queueId) setQueue((p) => p.filter((x) => x.id !== queueId));
    // an answered outbound call to a call-back number settles the debt
    if (secs > 0 && outcome !== "noanswer" && outcome !== "wrong") {
      setCallbacks((p) => {
        const hit = p.find((c) => c.phone === phone);
        if (hit) toast(t("cbDone", mmss(secs)), "success");
        return p.filter((c) => c.phone !== phone);
      });
    }
    setPresence((p) => ({ ...p, [me.id]: { status: "available", since: at, lastCallAt: at } }));

    if (ticketId) {
      setTickets((p) => p.map((x) => {
        if (x.id !== ticketId) return x;
        const summary = t("callEntry", t(DIR[finalDir].k), mmss(secs), tv(OUT[outcome].n));
        const body = note ? `${summary}\n${note}` : summary;
        const msgs = [...x.messages, { from: "call", text: { en: body, th: body }, at, by: tv(me.n) }];
        const first = x.firstResponseMin == null && secs > 0 ? Math.max(1, Math.round((at - x.createdAt) / MIN)) : x.firstResponseMin;
        const next = outcome === "resolved" ? "resolved" : outcome === "callback" ? "pending" : "open";
        return {
          ...x, messages: msgs, firstResponseMin: first, owner: x.owner || me.id, status: next,
          resolveMin: outcome === "resolved" ? Math.round((at - x.createdAt) / MIN) : x.resolveMin,
        };
      }));
    }
    setCall(null);
    toast(t("callSaved", secs > 0 ? mmss(secs) : tv(OUT[outcome].n)));
  };

  // login handled by NiRM — CRM always has a session (me is never null)

  const nav = NAV.filter((n) => n.roles.includes(me.role));
  const title = t(nav.find((n) => n.k === tab)?.key || "navDash");
  const roleFull = { admin: t("rAdminFull"), manager: t("rSupFull"), agent: t("rAgentFull") }[me.role];
  const myOpen = scope(tickets).filter((x) => OPEN_ST.includes(x.status)).length;

  return (
    <div className={`svc ${lang}`} lang={lang}>
      <style>{CSS}</style>

      {/* horizontal top bar (was a left sidebar) — NiRM already owns the left rail */}
      <div className="flex items-center gap-1.5 px-4 py-2" style={{ background: "var(--navy)", position: "sticky", top: 0, zIndex: 40, overflowX: "auto" }}>
        {nav.map((n) => (
          <button key={n.k} className={`nav-i ${tab === n.k ? "on" : ""}`} style={{ width: "auto", flex: "none", padding: "8px 12px", gap: 8, whiteSpace: "nowrap" }} onClick={() => setTab(n.k)}>
            <n.ic size={16} className="flex-none" />{t(n.key)}
            {n.k === "inbox" && unreadTotal > 0 && <span className="pill" style={{ background: "var(--amber)", color: "#0F172A", padding: "1px 7px", fontWeight: 700 }}>{unreadTotal}</span>}
            {n.k === "inbox" && unreadTotal === 0 && myOpen > 0 && <span className="pill" style={{ background: "rgba(255,255,255,.2)", color: "#fff", padding: "1px 7px" }}>{myOpen}</span>}
            {n.k === "calls" && (queue.length + callbacks.length) > 0 && <span className="pill" style={{ background: queue.length ? "var(--amber)" : "var(--red)", color: queue.length ? "#0F172A" : "#fff", padding: "1px 7px" }}>{queue.length + callbacks.length}</span>}
          </button>
        ))}
        <div className="ml-auto flex-none flex items-center gap-4 text-[11px] pl-4" style={{ color: "#94A3B8" }}>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="dot" style={{ background: alerts.length ? "#FBBF24" : "#34D399" }} />
            {alerts.length ? t("slaRisk", alerts.length) : t("allWithin")}
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="dot" style={{ background: sip.connected ? PRESENCE[presence[me.id]?.status || "offline"].c : "#F87171" }} />
            {sip.connected ? `${t(PRESENCE[presence[me.id]?.status || "offline"].k)} · ${sip.ext}` : t("lineDown")}
          </span>
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <main className="p-6 flex-1" style={{ paddingBottom: playRec && !call ? 130 : 24 }}>
          {tab === "dash"      && <Dashboard tickets={tickets} trend={trend} scope={scope} go={setTab} open={openTicket} me={me} />}
          {tab === "inbox"     && <InboxView tickets={tickets} setTickets={setTickets} me={me} scope={scope} canned={canned} toast={toast} focus={focus} clearFocus={() => setFocus(null)} startCall={startCall} unread={unread} markRead={markRead} />}
          {tab === "tickets"   && <Tickets tickets={tickets} setTickets={setTickets} me={me} scope={scope} open={openTicket} toast={toast} />}
          {tab === "calls"     && <CallsView tickets={scope(tickets)} allTickets={tickets} calls={calls} queue={queue} callbacks={callbacks} setCallbacks={setCallbacks} presence={presence} setPresence={setPresence} me={me} sip={sip} routing={routing} startCall={startCall} pullCall={pullCall} onPlay={setPlayRec} toast={toast} simulateCall={simulateCall} sf={sf} />}
          {tab === "customers" && <Customers tickets={tickets} open={openTicket} />}
          {tab === "kb"        && <Knowledge kb={kb} setKb={setKb} canned={canned} setCanned={setCanned} me={me} toast={toast} />}
          {tab === "reports"   && <Reports tickets={tickets} trend={trend} toast={toast} />}
          {tab === "users"     && <UsersView users={users} setUsers={setUsers} me={me} toast={toast} />}
          {tab === "settings"  && <SettingsView chans={chans} setChans={setChans} notif={notif} setNotif={setNotif} assign={assign} setAssign={setAssign} sip={sip} setSip={setSip} routing={routing} setRouting={setRouting} ringFor={ringFor} setRingFor={setRingFor} maxWait={maxWait} setMaxWait={setMaxWait} toast={toast} me={me} />}
        </main>
      </div>

      <SoftphoneBar sf={sf} />

      {incoming && !call && (
        <IncomingCall
          ev={incoming}
          match={(() => {
            const k = phoneKey(incoming.from_number);
            const mine = tickets.filter((x) => phoneKey(x.phone) === k);
            return { customer: mine[0]?.customer || null, open: mine.filter((x) => OPEN_ST.includes(x.status)) };
          })()}
          onAnswer={answerIncoming}
          onDecline={declineIncoming}
        />
      )}

      {playRec && !call && <RecPlayer rec={playRec} onClose={() => setPlayRec(null)} />}
      {call && <CallConsole call={call} tickets={tickets} onSave={endCall} onTimeout={passOn} ringFor={ringFor} toast={toast}
                            onClose={() => { if (call.queueId) passOn(); else { setCall(null); setPresence((p) => ({ ...p, [me.id]: { ...p[me.id], status: "available", since: Date.now() } })); } }} />}

      <div className="fixed bottom-5 left-1/2 z-[80] space-y-2" style={{ transform: "translateX(-50%)" }}>
        {toasts.map((x) => (
          <div key={x.id} className="card flex items-center gap-2.5 px-4 py-3" style={{ background: "var(--navy)", border: "none", color: "#fff", minWidth: 250 }}>
            {x.kind === "error" ? <AlertTriangle size={16} style={{ color: "#FCA5A5" }} className="flex-none" /> : <CheckCircle2 size={16} style={{ color: "#7EE2AC" }} className="flex-none" />}
            <span className="text-[13px] font-medium">{x.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
