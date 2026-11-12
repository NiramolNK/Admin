/* ═══════════ Password Keeper + Brand email groups ═══════════
   Two Service CRM screens that share a shape: a list of records grouped by
   brand, a search box, an add/edit sheet. Kept out of ServiceCRM.jsx (7,000+
   lines) on purpose; ServiceCRM only renders them and reuses the hook below
   for the Compose / Reply "brand group" picker.

   Password Keeper — every logged-in NiRM user can see every record (April,
   10 Nov 2026). The password itself is never in the row the browser loads:
   the `secret` column is encrypted in Postgres and not even selectable from
   the client. Reveal / copy calls cred_reveal(), which decrypts server-side
   and writes who-looked-when into credential_reveals, so the card can show
   "last seen by …".

   Brand email groups — a named To + Cc list per brand. Several per brand are
   fine. The group is a *starting point*: once inserted the chips are
   ordinary chips the agent can still remove or add to.
   ──────────────────────────────────────────────────────────────────────── */
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Search, Plus, X, Eye, EyeOff, Copy, Edit3, Trash2, KeyRound, Mail, ExternalLink, Check } from "lucide-react";
import { supabase } from "./supabase.js";

/* ─── tiny bilingual dictionary (same [en, th] shape as ServiceCRM's) ─── */
const D = {
  // password keeper
  pkTitle: ["Password Keeper", "คลังรหัสผ่าน"],
  pkSub: ["Shop and platform logins for every brand — visible to everyone with a NiRM login", "รหัสเข้าร้านค้าและแพลตฟอร์มของทุกแบรนด์ — ทุกคนที่มีบัญชี NiRM มองเห็นได้"],
  pkSearch: ["Search brand, platform, username…", "ค้นหาแบรนด์ แพลตฟอร์ม ชื่อผู้ใช้…"],
  pkAdd: ["Add login", "เพิ่มบัญชี"],
  pkEdit: ["Edit login", "แก้ไขบัญชี"],
  pkNone: ["No logins saved yet. Add the first one — Seller Centre, Lazada, TikTok Shop, a brand mailbox…", "ยังไม่มีบัญชีที่บันทึกไว้ เพิ่มบัญชีแรกได้เลย — Seller Centre, Lazada, TikTok Shop, อีเมลแบรนด์…"],
  pkNoMatch: ["Nothing matches that search", "ไม่พบรายการที่ตรงกับคำค้น"],
  pkBrand: ["Brand", "แบรนด์"], pkPlatform: ["Platform", "แพลตฟอร์ม"], pkLabel: ["Label", "ชื่อรายการ"],
  pkLabelPh: ["e.g. Seller Centre main account", "เช่น บัญชีหลัก Seller Centre"],
  pkUser: ["Username / email", "ชื่อผู้ใช้ / อีเมล"], pkPass: ["Password", "รหัสผ่าน"],
  pkPassKeep: ["Leave blank to keep the current password", "เว้นว่างไว้เพื่อคงรหัสผ่านเดิม"],
  pkUrl: ["Login URL", "ลิงก์เข้าสู่ระบบ"], pkNote: ["Note", "หมายเหตุ"],
  pkNotePh: ["OTP goes to…, 2FA phone, who owns the account", "OTP ส่งไปที่…, เบอร์ 2FA, ใครเป็นเจ้าของบัญชี"],
  pkSave: ["Save", "บันทึก"], pkCancel: ["Cancel", "ยกเลิก"], pkDelete: ["Delete", "ลบ"],
  pkDeleteQ: ["Delete this login? This cannot be undone.", "ลบบัญชีนี้? ย้อนกลับไม่ได้"],
  pkSaved: ["Login saved", "บันทึกบัญชีแล้ว"], pkDeleted: ["Login deleted", "ลบบัญชีแล้ว"],
  pkReveal: ["Show", "แสดง"], pkHide: ["Hide", "ซ่อน"], pkCopy: ["Copy", "คัดลอก"],
  pkCopied: ["Password copied", "คัดลอกรหัสผ่านแล้ว"], pkUserCopied: ["Username copied", "คัดลอกชื่อผู้ใช้แล้ว"],
  pkNoPass: ["No password stored", "ยังไม่ได้บันทึกรหัสผ่าน"],
  pkLastSeen: ["Last shown to %s · %s", "แสดงล่าสุดให้ %s · %s"],
  pkNeverSeen: ["Never shown", "ยังไม่เคยแสดง"],
  pkUpdated: ["Updated by %s · %s", "แก้ไขโดย %s · %s"],
  pkErrBrand: ["Pick a brand", "กรุณาเลือกแบรนด์"],
  pkErrUser: ["Enter the username", "กรุณากรอกชื่อผู้ใช้"],
  pkOther: ["Other / shared", "อื่นๆ / ส่วนกลาง"],
  pkCount: ["%s logins", "%s บัญชี"],
  // email groups
  egTitle: ["Brand email groups", "กลุ่มอีเมลแบรนด์"],
  egSub: ["Who gets To and Cc when we email each brand — pick the group in Compose or Reply instead of pasting addresses", "ใครต้องอยู่ใน To และ Cc เวลาส่งอีเมลหาแต่ละแบรนด์ — เลือกกลุ่มตอนเขียนหรือตอบอีเมลแทนการวางที่อยู่ทุกครั้ง"],
  egSearch: ["Search brand, group, address…", "ค้นหาแบรนด์ กลุ่ม ที่อยู่อีเมล…"],
  egAdd: ["Add group", "เพิ่มกลุ่ม"], egEdit: ["Edit group", "แก้ไขกลุ่ม"],
  egNone: ["No groups yet. Add one per brand (or several — e.g. “Nestlé · stock issues”, “Nestlé · refund approval”).", "ยังไม่มีกลุ่ม เพิ่มกลุ่มต่อแบรนด์ได้ (หลายกลุ่มก็ได้ เช่น “Nestlé · ปัญหาสต็อก”, “Nestlé · อนุมัติคืนเงิน”)"],
  egName: ["Group name", "ชื่อกลุ่ม"], egNamePh: ["e.g. Stock & delivery issues", "เช่น ปัญหาสต็อกและจัดส่ง"],
  egTo: ["To", "ถึง"], egCc: ["Cc", "สำเนาถึง"],
  egAddrPh: ["one address per line, or separated by commas", "หนึ่งที่อยู่ต่อบรรทัด หรือคั่นด้วยจุลภาค"],
  egNote: ["When to use this group", "ใช้กลุ่มนี้เมื่อไหร่"],
  egErrName: ["Give the group a name", "กรุณาตั้งชื่อกลุ่ม"],
  egErrTo: ["Add at least one To address", "ต้องมีที่อยู่ To อย่างน้อย 1 รายการ"],
  egErrAddr: ["Not a valid email: %s", "อีเมลไม่ถูกต้อง: %s"],
  egSaved: ["Group saved", "บันทึกกลุ่มแล้ว"], egDeleted: ["Group deleted", "ลบกลุ่มแล้ว"],
  egDeleteQ: ["Delete this group?", "ลบกลุ่มนี้?"],
  egCount: ["%s groups", "%s กลุ่ม"],
  egToN: ["%s To", "To %s"], egCcN: ["%s Cc", "Cc %s"],
  egCopied: ["Addresses copied", "คัดลอกที่อยู่แล้ว"],
};
const mk = (lang) => (k, ...a) => {
  const s = D[k] ? D[k][lang === "th" ? 1 : 0] : k;
  return a.reduce((acc, v) => acc.replace("%s", v), s);
};

const PLATFORMS = ["Shopee", "Lazada", "TikTok Shop", "Email", "LINE OA", "Other"];
const PLAT_C = {
  "Shopee": { c: "#C2410C", bg: "#FFF1E8" }, "Lazada": { c: "#1D4ED8", bg: "#E8EEFF" },
  "TikTok Shop": { c: "#0F172A", bg: "#E5E7EB" }, "Email": { c: "#0369A1", bg: "#E0F2FE" },
  "LINE OA": { c: "#15803D", bg: "#DCFCE7" }, "Other": { c: "#64748B", bg: "#F1F5F9" },
};
export const isEmailAddr = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
export const splitAddrs = (s) => [...new Set(String(s || "").split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
const fmtAt = (iso, lang) => iso ? new Date(iso).toLocaleString(lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const who = (e) => String(e || "").replace(/@.*/, "");

/* ─── shared: brand directory (live brands only) ─── */
function useBrands() {
  const [brands, setBrands] = useState([]);
  useEffect(() => {
    let dead = false;
    supabase.from("brands").select("id,name").eq("offboarded", false).order("name")
      .then(({ data }) => { if (!dead) setBrands(data || []); });
    return () => { dead = true; };
  }, []);
  return brands;
}

/* ─── shared: the saved groups, for the Compose / Reply picker ───
   ServiceCRM imports this. `reload` lets a view that just saved a group
   refresh without a page reload. */
export function useBrandGroups() {
  const [groups, setGroups] = useState([]);
  const reload = useCallback(() => {
    supabase.from("brand_email_groups").select("*").order("brand").order("name")
      .then(({ data }) => setGroups(data || []));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return [groups, reload];
}

/* ─── shared sheet chrome (mirrors ServiceCRM's Modal, kept local) ─── */
function Sheet({ title, sub, onClose, children, w = 560 }) {
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

function BrandSelect({ brands, value, onChange, otherLabel, allowOther = true }) {
  return (
    <select className="fld" value={value || ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {allowOther && <option value="__other__">{otherLabel}</option>}
      {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
  );
}

/* ══════════════════════════ PASSWORD KEEPER ══════════════════════════ */
export function PasswordKeeper({ me, lang = "en", toast }) {
  const t = useMemo(() => mk(lang), [lang]);
  const brands = useBrands();
  const [rows, setRows] = useState(null);
  const [seen, setSeen] = useState({});          // cred_id → { user_email, at }
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null);        // null | {} (new) | row
  const [shown, setShown] = useState({});        // cred_id → plaintext while revealed

  const load = useCallback(async () => {
    const [{ data: c }, { data: r }] = await Promise.all([
      supabase.from("brand_credentials").select("id,brand_id,brand,platform,label,username,url,note,created_at,updated_at,updated_by").order("brand").order("platform").order("label"),
      supabase.from("credential_reveals").select("cred_id,user_email,at").order("at", { ascending: false }).limit(500),
    ]);
    setRows(c || []);
    const last = {};
    (r || []).forEach((x) => { if (!last[x.cred_id]) last[x.cred_id] = x; });
    setSeen(last);
  }, []);
  useEffect(() => { load(); }, [load]);

  const list = useMemo(() => {
    if (!rows) return null;
    const s = q.trim().toLowerCase();
    return s ? rows.filter((r) => `${r.brand || ""} ${r.platform} ${r.label || ""} ${r.username || ""} ${r.note || ""}`.toLowerCase().includes(s)) : rows;
  }, [rows, q]);

  // group by brand for display; "Other / shared" last
  const byBrand = useMemo(() => {
    if (!list) return [];
    const m = new Map();
    list.forEach((r) => { const k = r.brand || "__other__"; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    const keys = [...m.keys()].sort((a, b) => (a === "__other__") - (b === "__other__") || a.localeCompare(b));
    return keys.map((k) => [k === "__other__" ? t("pkOther") : k, m.get(k)]);
  }, [list, t]);

  const reveal = async (id) => {
    if (shown[id] != null) { setShown((p) => { const n = { ...p }; delete n[id]; return n; }); return; }
    const { data, error } = await supabase.rpc("cred_reveal", { p_id: id });
    if (error) { toast?.("🔑 " + error.message, "error"); return; }
    setShown((p) => ({ ...p, [id]: data || "" }));
    setSeen((p) => ({ ...p, [id]: { user_email: me?.email, at: new Date().toISOString() } }));
    // auto-hide after 30 s so a password never sits on an unattended screen
    setTimeout(() => setShown((p) => { if (!(id in p)) return p; const n = { ...p }; delete n[id]; return n; }), 30000);
  };
  const copyPass = async (id) => {
    let v = shown[id];
    if (v == null) {
      const { data, error } = await supabase.rpc("cred_reveal", { p_id: id });
      if (error) { toast?.("🔑 " + error.message, "error"); return; }
      v = data || "";
      setSeen((p) => ({ ...p, [id]: { user_email: me?.email, at: new Date().toISOString() } }));
    }
    if (!v) { toast?.("🔑 " + t("pkNoPass"), "error"); return; }
    try { await navigator.clipboard.writeText(v); toast?.("🔑 " + t("pkCopied")); } catch { toast?.("🔑 clipboard blocked", "error"); }
  };
  const copyUser = async (u) => { try { await navigator.clipboard.writeText(u); toast?.("🔑 " + t("pkUserCopied")); } catch {} };
  const del = async (r) => {
    if (!window.confirm(t("pkDeleteQ"))) return;
    const { error } = await supabase.from("brand_credentials").delete().eq("id", r.id);
    if (error) { toast?.("🔑 " + error.message, "error"); return; }
    toast?.("🔑 " + t("pkDeleted")); load();
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="font-bold text-[18px] flex items-center gap-2"><KeyRound size={18} style={{ color: "var(--blue)" }} /> {t("pkTitle")}</h2>
          <p className="text-[12.5px]" style={{ color: "var(--muted)" }}>{t("pkSub")}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="relative" style={{ width: 260 }}>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
            <input className="fld w-full" style={{ paddingLeft: 32 }} placeholder={t("pkSearch")} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {list && <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>{t("pkCount", list.length)}</span>}
          <button className="btn btn-p" onClick={() => setEdit({})}><Plus size={15} /> {t("pkAdd")}</button>
        </div>
      </div>

      {!list ? (
        <div className="card p-6 text-[13px]" style={{ color: "var(--muted)" }}>…</div>
      ) : list.length === 0 ? (
        <div className="card p-6 text-[13px]" style={{ color: "var(--muted)" }}>{rows.length ? t("pkNoMatch") : t("pkNone")}</div>
      ) : byBrand.map(([brand, items]) => (
        <div key={brand} className="mb-5">
          <p className="lbl mb-2">{brand} <span style={{ color: "var(--muted)", fontWeight: 500 }}>· {items.length}</span></p>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))" }}>
            {items.map((r) => {
              const pc = PLAT_C[r.platform] || PLAT_C.Other;
              const open = shown[r.id] != null;
              const s = seen[r.id];
              return (
                <div key={r.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-[14px] truncate">{r.label || r.platform}</div>
                      <div className="text-[12px]" style={{ color: "var(--muted)" }}>{r.brand || t("pkOther")}</div>
                    </div>
                    <span className="pill flex-none" style={{ background: pc.bg, color: pc.c }}>{r.platform}</span>
                  </div>

                  <div className="mt-3 space-y-1.5 text-[12.5px]">
                    <div className="flex items-center gap-2">
                      <span className="flex-none" style={{ color: "var(--muted)", width: 68 }}>{t("pkUser")}</span>
                      <b className="truncate min-w-0" title={r.username}>{r.username || "—"}</b>
                      {r.username && <button title={t("pkCopy")} onClick={() => copyUser(r.username)} style={{ color: "var(--muted)" }}><Copy size={13} /></button>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="flex-none" style={{ color: "var(--muted)", width: 68 }}>{t("pkPass")}</span>
                      <code className="truncate min-w-0" style={{ fontSize: 12.5, letterSpacing: open ? 0 : 2 }}>{open ? (shown[r.id] || <i style={{ color: "var(--muted)" }}>{t("pkNoPass")}</i>) : "••••••••••"}</code>
                      <button title={open ? t("pkHide") : t("pkReveal")} onClick={() => reveal(r.id)} style={{ color: "var(--blue)" }}>{open ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                      <button title={t("pkCopy")} onClick={() => copyPass(r.id)} style={{ color: "var(--muted)" }}><Copy size={13} /></button>
                    </div>
                    {r.url && (
                      <div className="flex items-center gap-2">
                        <span className="flex-none" style={{ color: "var(--muted)", width: 68 }}>{t("pkUrl")}</span>
                        <a href={/^https?:/i.test(r.url) ? r.url : `https://${r.url}`} target="_blank" rel="noreferrer" className="truncate min-w-0 flex items-center gap-1" style={{ color: "var(--blue)" }}>{r.url.replace(/^https?:\/\//i, "")} <ExternalLink size={11} /></a>
                      </div>
                    )}
                    {r.note && <p className="text-[12px] pt-1" style={{ color: "var(--ink)", whiteSpace: "pre-wrap" }}>{r.note}</p>}
                  </div>

                  <div className="mt-3 pt-2 border-t flex items-center gap-2 text-[11px]" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
                    <span className="truncate min-w-0" title={r.updated_by ? t("pkUpdated", r.updated_by, fmtAt(r.updated_at, lang)) : ""}>
                      {s ? t("pkLastSeen", who(s.user_email), fmtAt(s.at, lang)) : t("pkNeverSeen")}
                    </span>
                    <button className="ml-auto flex-none" title={t("pkEdit")} onClick={() => setEdit(r)} style={{ color: "var(--blue)" }}><Edit3 size={13} /></button>
                    <button className="flex-none" title={t("pkDelete")} onClick={() => del(r)} style={{ color: "var(--red)" }}><Trash2 size={13} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {edit && <CredSheet t={t} brands={brands} row={edit.id ? edit : null} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); toast?.("🔑 " + t("pkSaved")); }} toast={toast} />}
    </div>
  );
}

function CredSheet({ t, brands, row, onClose, onSaved, toast }) {
  const [f, setF] = useState(() => ({
    brandSel: row ? (row.brand_id || (row.brand ? "__other__" : "")) : "",
    brandText: row?.brand_id ? "" : (row?.brand || ""),
    platform: row?.platform || PLATFORMS[0], label: row?.label || "", username: row?.username || "",
    password: "", url: row?.url || "", note: row?.note || "",
  }));
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setF((p) => ({ ...p, [k]: e.target.value })); setErr(""); };

  const save = async () => {
    const brandId = f.brandSel && f.brandSel !== "__other__" ? f.brandSel : null;
    const brandName = brandId ? (brands.find((b) => b.id === brandId)?.name || "") : f.brandText.trim();
    if (!brandId && !brandName) return setErr(t("pkErrBrand"));
    if (!f.username.trim()) return setErr(t("pkErrUser"));
    setBusy(true);
    const { error } = await supabase.rpc("cred_save", {
      p_id: row?.id || null, p_brand_id: brandId, p_brand: brandName || null, p_platform: f.platform,
      p_label: f.label.trim() || null, p_username: f.username.trim(), p_password: f.password || null,
      p_url: f.url.trim() || null, p_note: f.note.trim() || null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  };

  return (
    <Sheet title={row ? t("pkEdit") : t("pkAdd")} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div><label className="lbl">{t("pkBrand")}</label>
            <BrandSelect brands={brands} value={f.brandSel} otherLabel={t("pkOther")} onChange={(v) => setF((p) => ({ ...p, brandSel: v }))} />
            {f.brandSel === "__other__" && <input className="fld mt-2" placeholder={t("pkOther")} value={f.brandText} onChange={set("brandText")} />}
          </div>
          <div><label className="lbl">{t("pkPlatform")}</label>
            <select className="fld" value={f.platform} onChange={set("platform")}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select>
          </div>
        </div>
        <div><label className="lbl">{t("pkLabel")}</label><input className="fld" placeholder={t("pkLabelPh")} value={f.label} onChange={set("label")} /></div>
        <div><label className="lbl">{t("pkUser")}</label><input className="fld" value={f.username} onChange={set("username")} autoComplete="off" /></div>
        <div><label className="lbl">{t("pkPass")}</label>
          <div className="relative">
            <input className="fld w-full" type={showPw ? "text" : "password"} value={f.password} onChange={set("password")} autoComplete="new-password" placeholder={row ? "••••••••" : ""} style={{ paddingRight: 36 }} />
            <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }}>{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</button>
          </div>
          {row && <p className="text-[11.5px] mt-1" style={{ color: "var(--muted)" }}>{t("pkPassKeep")}</p>}
        </div>
        <div><label className="lbl">{t("pkUrl")}</label><input className="fld" placeholder="seller.shopee.co.th" value={f.url} onChange={set("url")} /></div>
        <div><label className="lbl">{t("pkNote")}</label><textarea className="fld" rows={3} placeholder={t("pkNotePh")} value={f.note} onChange={set("note")} /></div>
        {err && <p className="text-[12.5px]" style={{ color: "var(--red)" }}>{err}</p>}
        <div className="flex items-center gap-2 pt-1">
          <button className="btn btn-p" disabled={busy} onClick={save}><Check size={15} /> {t("pkSave")}</button>
          <button className="btn btn-g" onClick={onClose}>{t("pkCancel")}</button>
        </div>
      </div>
    </Sheet>
  );
}

/* ══════════════════════════ BRAND EMAIL GROUPS ══════════════════════════ */
export function EmailGroupsView({ me, lang = "en", toast }) {
  const t = useMemo(() => mk(lang), [lang]);
  const brands = useBrands();
  const [groups, reload] = useBrandGroups();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? groups.filter((g) => `${g.brand || ""} ${g.name} ${(g.to_emails || []).join(" ")} ${(g.cc_emails || []).join(" ")} ${g.note || ""}`.toLowerCase().includes(s)) : groups;
  }, [groups, q]);
  const byBrand = useMemo(() => {
    const m = new Map();
    list.forEach((g) => { const k = g.brand || "—"; if (!m.has(k)) m.set(k, []); m.get(k).push(g); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [list]);

  const del = async (g) => {
    if (!window.confirm(t("egDeleteQ"))) return;
    const { error } = await supabase.from("brand_email_groups").delete().eq("id", g.id);
    if (error) { toast?.("✉ " + error.message, "error"); return; }
    toast?.("✉ " + t("egDeleted")); reload();
  };
  const copyAll = async (g) => {
    const txt = `To: ${(g.to_emails || []).join(", ")}\nCc: ${(g.cc_emails || []).join(", ")}`;
    try { await navigator.clipboard.writeText(txt); toast?.("✉ " + t("egCopied")); } catch {}
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="font-bold text-[18px] flex items-center gap-2"><Mail size={18} style={{ color: "var(--blue)" }} /> {t("egTitle")}</h2>
          <p className="text-[12.5px]" style={{ color: "var(--muted)" }}>{t("egSub")}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="relative" style={{ width: 260 }}>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
            <input className="fld w-full" style={{ paddingLeft: 32 }} placeholder={t("egSearch")} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>{t("egCount", list.length)}</span>
          <button className="btn btn-p" onClick={() => setEdit({})}><Plus size={15} /> {t("egAdd")}</button>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="card p-6 text-[13px]" style={{ color: "var(--muted)" }}>{groups.length ? t("pkNoMatch") : t("egNone")}</div>
      ) : byBrand.map(([brand, items]) => (
        <div key={brand} className="mb-5">
          <p className="lbl mb-2">{brand} <span style={{ color: "var(--muted)", fontWeight: 500 }}>· {items.length}</span></p>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))" }}>
            {items.map((g) => (
              <div key={g.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-[14px] truncate">{g.name}</div>
                    {g.note && <div className="text-[12px]" style={{ color: "var(--muted)" }}>{g.note}</div>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-none">
                    <span className="pill" style={{ background: "var(--sky)", color: "var(--blue)" }}>{t("egToN", (g.to_emails || []).length)}</span>
                    <span className="pill" style={{ background: "var(--slate-bg)", color: "var(--ink)" }}>{t("egCcN", (g.cc_emails || []).length)}</span>
                  </div>
                </div>
                <div className="mt-3 text-[12px] space-y-1.5">
                  <div className="flex gap-2"><span className="flex-none font-semibold" style={{ width: 24, color: "var(--muted)" }}>{t("egTo")}</span>
                    <div className="flex flex-wrap gap-1">{(g.to_emails || []).map((a) => <span key={a} className="pill" style={{ background: "var(--sky)", color: "var(--blue)" }}>{a}</span>)}</div></div>
                  {(g.cc_emails || []).length > 0 && (
                    <div className="flex gap-2"><span className="flex-none font-semibold" style={{ width: 24, color: "var(--muted)" }}>{t("egCc")}</span>
                      <div className="flex flex-wrap gap-1">{g.cc_emails.map((a) => <span key={a} className="pill" style={{ background: "var(--slate-bg)", color: "var(--ink)" }}>{a}</span>)}</div></div>
                  )}
                </div>
                <div className="mt-3 pt-2 border-t flex items-center gap-2 text-[11px]" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
                  <span className="truncate min-w-0">{g.updated_by ? t("pkUpdated", who(g.updated_by), fmtAt(g.updated_at, lang)) : ""}</span>
                  <button className="ml-auto flex-none" title={t("pkCopy")} onClick={() => copyAll(g)} style={{ color: "var(--muted)" }}><Copy size={13} /></button>
                  <button className="flex-none" title={t("egEdit")} onClick={() => setEdit(g)} style={{ color: "var(--blue)" }}><Edit3 size={13} /></button>
                  <button className="flex-none" title={t("pkDelete")} onClick={() => del(g)} style={{ color: "var(--red)" }}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {edit && <GroupSheet t={t} brands={brands} me={me} row={edit.id ? edit : null} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); toast?.("✉ " + t("egSaved")); }} />}
    </div>
  );
}

function GroupSheet({ t, brands, me, row, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    brandSel: row ? (row.brand_id || (row.brand ? "__other__" : "")) : "",
    brandText: row?.brand_id ? "" : (row?.brand || ""),
    name: row?.name || "", to: (row?.to_emails || []).join("\n"), cc: (row?.cc_emails || []).join("\n"), note: row?.note || "",
  }));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setF((p) => ({ ...p, [k]: e.target.value })); setErr(""); };

  const save = async () => {
    const brandId = f.brandSel && f.brandSel !== "__other__" ? f.brandSel : null;
    const brandName = brandId ? (brands.find((b) => b.id === brandId)?.name || "") : f.brandText.trim();
    if (!brandId && !brandName) return setErr(t("pkErrBrand"));
    if (!f.name.trim()) return setErr(t("egErrName"));
    const to = splitAddrs(f.to), cc = splitAddrs(f.cc).filter((a) => !to.includes(a));
    if (!to.length) return setErr(t("egErrTo"));
    const bad = [...to, ...cc].find((a) => !isEmailAddr(a));
    if (bad) return setErr(t("egErrAddr", bad));
    setBusy(true);
    const payload = { brand_id: brandId, brand: brandName || null, name: f.name.trim(), to_emails: to, cc_emails: cc, note: f.note.trim() || null, updated_by: me?.email || null, updated_at: new Date().toISOString() };
    const { error } = row
      ? await supabase.from("brand_email_groups").update(payload).eq("id", row.id)
      : await supabase.from("brand_email_groups").insert(payload);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  };

  return (
    <Sheet title={row ? t("egEdit") : t("egAdd")} onClose={onClose} w={600}>
      <div className="space-y-3">
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1.4fr" }}>
          <div><label className="lbl">{t("pkBrand")}</label>
            <BrandSelect brands={brands} value={f.brandSel} otherLabel={t("pkOther")} onChange={(v) => setF((p) => ({ ...p, brandSel: v }))} />
            {f.brandSel === "__other__" && <input className="fld mt-2" placeholder={t("pkOther")} value={f.brandText} onChange={set("brandText")} />}
          </div>
          <div><label className="lbl">{t("egName")}</label><input className="fld" placeholder={t("egNamePh")} value={f.name} onChange={set("name")} /></div>
        </div>
        <div><label className="lbl">{t("egTo")}</label><textarea className="fld" rows={3} placeholder={t("egAddrPh")} value={f.to} onChange={set("to")} spellCheck={false} /></div>
        <div><label className="lbl">{t("egCc")}</label><textarea className="fld" rows={5} placeholder={t("egAddrPh")} value={f.cc} onChange={set("cc")} spellCheck={false} /></div>
        <div><label className="lbl">{t("egNote")}</label><input className="fld" value={f.note} onChange={set("note")} /></div>
        {err && <p className="text-[12.5px]" style={{ color: "var(--red)" }}>{err}</p>}
        <div className="flex items-center gap-2 pt-1">
          <button className="btn btn-p" disabled={busy} onClick={save}><Check size={15} /> {t("pkSave")}</button>
          <button className="btn btn-g" onClick={onClose}>{t("pkCancel")}</button>
        </div>
      </div>
    </Sheet>
  );
}

/* ─── the picker ServiceCRM drops into Compose and Reply ───
   Renders a compact select of "Brand · Group"; onPick gets the group row.
   Nothing is inserted until the agent chooses — a case has no group by
   default, and picking the wrong one is one more click to undo. */
export function GroupPicker({ groups, lang = "en", onPick, brandHint, style }) {
  const t = useMemo(() => mk(lang), [lang]);
  if (!groups?.length) return null;
  // the case's own brand floats to the top, everything else below
  const sorted = [...groups].sort((a, b) => ((b.brand === brandHint) - (a.brand === brandHint)) || String(a.brand || "").localeCompare(String(b.brand || "")) || a.name.localeCompare(b.name));
  return (
    <select value="" onChange={(e) => { const g = groups.find((x) => x.id === e.target.value); if (g) onPick(g); e.target.value = ""; }}
            title={t("egSub")}
            style={{ fontSize: 11.5, fontWeight: 600, color: "var(--blue)", background: "var(--sky)", border: "1px solid transparent", borderRadius: 999, padding: "2px 8px", cursor: "pointer", maxWidth: 240, ...style }}>
      <option value="">+ {lang === "th" ? "กลุ่มแบรนด์" : "Brand group"}</option>
      {sorted.map((g) => <option key={g.id} value={g.id}>{g.brand ? `${g.brand} · ` : ""}{g.name} ({(g.to_emails || []).length}+{(g.cc_emails || []).length})</option>)}
    </select>
  );
}
