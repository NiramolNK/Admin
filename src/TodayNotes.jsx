/**
 * TodayNotes.jsx — two small shell additions (11 Nov 2026):
 *
 *   <RefreshButton/>  — the ↻ icon in the top bar. Flushes any pending save
 *                       first (so a signature typed 200 ms ago is not lost),
 *                       then reloads the page. One icon, no menu.
 *
 *   <TodayNotes/>     — "Today's notes": a notice managers post for the team.
 *                       Sits at the top of the Roster tab above the LINE code
 *                       card, so everyone passes it when they open NiRM.
 *                       Managers get a composer (post / edit / remove, and an
 *                       optional "show until" date so a note can stay up for
 *                       a campaign week). Everyone else reads it. Polls every
 *                       5 minutes; nothing to dismiss, it simply expires.
 *
 * Table: public.daily_notices — see supabase/migrations/daily_notices.sql.
 */
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase.js";

const TEAL = "#0D9488";
const todayISO = () => {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const fmtTime = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const fmtDay = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/* Turn bare URLs in a note into links (April, 12 Nov — SharePoint links were
   showing as plain text). Trailing punctuation stays outside the link so
   "see https://x.com." does not break the URL. Opens in a new tab. */
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;
function Linkify({ text }) {
  const parts = String(text || "").split(URL_RE);
  return parts.map((p, i) => {
    if (i % 2 === 0) return p;
    const m = p.match(/^(.*?)([.,;:!?)\]]*)$/);
    const url = m ? m[1] : p, tail = m ? m[2] : "";
    let label = url;
    try { const u = new URL(url); label = u.host.replace(/^www\./, "") + (u.pathname.length > 1 ? u.pathname.slice(0, 40) + (u.pathname.length > 41 ? "…" : "") : ""); } catch {}
    return (
      <React.Fragment key={i}>
        <a href={url} target="_blank" rel="noopener noreferrer" title={url}
           style={{ color: TEAL, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 2, wordBreak: "break-all" }}>{label}</a>{tail}
      </React.Fragment>
    );
  });
}

/* ── Refresh ────────────────────────────────────────────────────────────── */
/* A bare icon, no box and no label (April, 12 Nov): a thin circular arrow
   like the one in her screenshot, grey at rest, teal on hover, spinning
   while the reload is on its way. */
export function RefreshButton({ flush }) {
  const [busy, setBusy] = useState(false);
  const [hot, setHot] = useState(false);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    try { await Promise.resolve(flush?.()); } catch (e) { console.warn("[refresh] flush failed, reloading anyway", e); }
    // give the save request a moment to leave the browser before we tear it down
    setTimeout(() => window.location.reload(), 250);
  };
  return (
    <button onClick={go} title="Refresh" aria-label="Refresh"
      onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, padding: 0, borderRadius: 999,
               border: "none", background: hot ? "#F0FDFA" : "transparent", color: hot || busy ? "#0D9488" : "#64748B",
               cursor: busy ? "default" : "pointer", transition: "color .15s, background .15s" }}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
           style={{ animation: busy ? "spin 0.8s linear infinite" : "none", display: "block" }}>
        <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6.02" /><polyline points="21 3 21 9 15 9" />
      </svg>
    </button>
  );
}

/* ── Today's notes ──────────────────────────────────────────────────────── */
/* Why a note was posted. Fixed list so the tags stay consistent and can be
   filtered on later; "Other" covers the rest. */
const REASONS = ["Campaign", "Stock / delivery", "Price & promo", "Product issue", "Policy / process", "System issue", "Reminder", "Other"];
const REASON_C = {
  "Campaign": ["#7C3AED", "#F3E8FF"], "Stock / delivery": ["#C2410C", "#FFF1E8"], "Price & promo": ["#B45309", "#FEF3C7"],
  "Product issue": ["#B91C1C", "#FEE2E2"], "Policy / process": ["#1D4ED8", "#E8EEFF"], "System issue": ["#0F172A", "#E5E7EB"],
  "Reminder": ["#0F766E", "#F0FDFA"], "Other": ["#64748B", "#F1F5F9"],
};
const ALL_BRANDS = "All brands";

export function TodayNotes({ canPost = false, me = {}, isPhone = false }) {
  const [rows, setRows] = useState(null);
  const [brands, setBrands] = useState([]);
  useEffect(() => {
    if (!canPost) return;
    let dead = false;
    supabase.from("brands").select("name").eq("offboarded", false).order("name")
      .then(({ data }) => { if (!dead) setBrands((data || []).map((b) => b.name).filter(Boolean)); });
    return () => { dead = true; };
  }, [canPost]);
  const [draft, setDraft] = useState(null);     // null | { id?, body, until }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const taRef = useRef(null);

  const load = async () => {
    const today = todayISO();
    const { data, error } = await supabase.from("daily_notices")
      .select("id, body, brand, reason, for_date, until_date, author_name, author_email, created_at, updated_at")
      .lte("for_date", today)
      .or(`until_date.is.null,until_date.gte.${today}`)
      .order("created_at", { ascending: false });
    if (error) { console.warn("[notes]", error.message); return; }
    // a note with no until_date is for its own day only
    setRows((data || []).filter((r) => r.until_date || r.for_date === today));
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  useEffect(() => { if (draft && taRef.current) taRef.current.focus(); }, [draft]);

  const save = async () => {
    const body = (draft?.body || "").trim();
    if (!body) { setErr("Write the note first"); return; }
    setBusy(true); setErr("");
    const payload = { body, brand: draft.brand || null, reason: draft.reason || null, until_date: draft.until || null,
                      author_email: me.email || null, author_name: me.name || null, updated_at: new Date().toISOString() };
    const { error } = draft.id
      ? await supabase.from("daily_notices").update(payload).eq("id", draft.id)
      : await supabase.from("daily_notices").insert({ ...payload, for_date: todayISO() });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDraft(null); load();
  };
  const remove = async (id) => {
    const { error } = await supabase.from("daily_notices").delete().eq("id", id);
    if (error) { setErr(error.message); return; }
    load();
  };

  const notes = rows || [];
  // Nothing posted and nobody who can post: stay out of the way entirely.
  if (!canPost && notes.length === 0) return null;

  return (
    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderLeft: `4px solid ${TEAL}`, borderRadius: 12, padding: isPhone ? 12 : "12px 16px",
                  boxShadow: "0 1px 2px rgba(15,23,42,.05)", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v12H8l-4 4z" /><line x1="8" y1="9" x2="16" y2="9" /><line x1="8" y1="12" x2="13" y2="12" /></svg>
        <b style={{ fontSize: 13.5, color: "#0F172A" }}>Today's notes</b>
        <span style={{ fontSize: 11, color: "#94A3B8" }}>{fmtDay(todayISO())}</span>
        {canPost && !draft && (
          <button onClick={() => setDraft({ body: "", until: "", brand: "", reason: "" })}
            style={{ marginLeft: "auto", padding: "5px 11px", borderRadius: 8, border: "none", background: TEAL, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            + Post a note
          </button>
        )}
      </div>

      {notes.length === 0 && !draft && (
        <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#94A3B8" }}>Nothing posted for today yet.</p>
      )}

      {notes.map((n) => (
        <div key={n.id} style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #F1F5F9" }}>
          {(n.brand || n.reason) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 5 }}>
              {n.brand && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: "#F0FDFA", color: TEAL, border: "1px solid #CCFBF1" }}>{n.brand}</span>}
              {n.reason && (() => { const [c, bg] = REASON_C[n.reason] || REASON_C.Other; return <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: bg, color: c }}>{n.reason}</span>; })()}
            </div>
          )}
          <div style={{ fontSize: 13.5, color: "#0F172A", whiteSpace: "pre-wrap", lineHeight: 1.5, overflowWrap: "anywhere" }}><Linkify text={n.body} /></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 11, color: "#94A3B8", flexWrap: "wrap" }}>
            <span>{n.author_name || (n.author_email || "").replace(/@.*/, "") || "Manager"} · {fmtTime(n.updated_at || n.created_at)}</span>
            {n.until_date && <span style={{ background: "#F0FDFA", color: TEAL, padding: "1px 7px", borderRadius: 999, fontWeight: 600 }}>until {fmtDay(n.until_date)}</span>}
            {canPost && (
              <span style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                <button onClick={() => setDraft({ id: n.id, body: n.body, until: n.until_date || "", brand: n.brand || "", reason: n.reason || "" })} style={{ border: "none", background: "none", color: TEAL, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>Edit</button>
                <button onClick={() => remove(n.id)} style={{ border: "none", background: "none", color: "#B91C1C", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>Remove</button>
              </span>
            )}
          </div>
        </div>
      ))}

      {draft && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #F1F5F9", display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ fontSize: 11.5, color: "#64748B", display: "flex", alignItems: "center", gap: 6, flex: isPhone ? "1 1 100%" : "0 1 auto" }}>
              Brand
              <select value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
                style={{ padding: "5px 8px", border: "1px solid #E2E8F0", borderRadius: 7, fontFamily: "inherit", fontSize: 12.5, background: "#fff", minWidth: 160, flex: 1 }}>
                <option value="">—</option>
                <option value={ALL_BRANDS}>{ALL_BRANDS}</option>
                {brands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 11.5, color: "#64748B", display: "flex", alignItems: "center", gap: 6, flex: isPhone ? "1 1 100%" : "0 1 auto" }}>
              Reason
              <select value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
                style={{ padding: "5px 8px", border: "1px solid #E2E8F0", borderRadius: 7, fontFamily: "inherit", fontSize: 12.5, background: "#fff", minWidth: 160, flex: 1 }}>
                <option value="">—</option>
                {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          </div>
          <textarea ref={taRef} value={draft.body} onChange={(e) => { setDraft({ ...draft, body: e.target.value }); setErr(""); }}
            rows={3} placeholder="e.g. Lazada 11.11 — expect high chat volume on Enfa and Nestlé until 23:59. Prioritise order-status questions; escalate stock issues to AM."
            style={{ width: "100%", padding: "9px 12px", border: "1px solid #E2E8F0", borderRadius: 9, fontFamily: "inherit", fontSize: 13.5, resize: "vertical", outline: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <label style={{ fontSize: 11.5, color: "#64748B", display: "flex", alignItems: "center", gap: 6 }}>
              Show until
              <input type="date" value={draft.until} min={todayISO()} onChange={(e) => setDraft({ ...draft, until: e.target.value })}
                style={{ padding: "4px 8px", border: "1px solid #E2E8F0", borderRadius: 7, fontFamily: "inherit", fontSize: 12 }} />
              <span style={{ color: "#94A3B8" }}>(blank = today only)</span>
            </label>
            {err && <span style={{ fontSize: 12, color: "#B91C1C", fontWeight: 600 }}>{err}</span>}
            <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button onClick={() => { setDraft(null); setErr(""); }} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#475569", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={save} disabled={busy} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: TEAL, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: busy ? .6 : 1 }}>
                {busy ? "Posting…" : draft.id ? "Save changes" : "Post to team"}
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
