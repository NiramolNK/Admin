import { useState, useEffect, useMemo } from "react";
import { BookMarked, Search, Plus, Edit3, Trash2, ChevronUp, ChevronDown, Save, X } from "lucide-react";
import { supabase } from "./supabase.js";

/* ═══════════════════════ MANUAL ═══════════════════════
   How to use Service CRM, written by the managers and read by everyone.

   Content lives in the crm_manual table rather than in this file so that
   fixing a wrong instruction is a two-minute edit in the browser instead of
   a code change, a push and a deploy. Row-level security does the gating:
   every signed-in user can select, only is_manager() can write. The canEdit
   prop only decides whether the buttons are worth drawing — the database is
   what actually refuses an agent's write.                                  */

const TXT = {
  title:      ["Manual", "คู่มือ"],
  sub:        ["How to use Service CRM", "วิธีใช้งาน Service CRM"],
  search:     ["Search the manual…", "ค้นหาในคู่มือ…"],
  add:        ["Add section", "เพิ่มหัวข้อ"],
  edit:       ["Edit section", "แก้ไขหัวข้อ"],
  empty:      ["No manual yet", "ยังไม่มีคู่มือ"],
  emptySub:   ["A manager can add the first section.", "ผู้จัดการสามารถเพิ่มหัวข้อแรกได้"],
  noHit:      ["Nothing matches that", "ไม่พบสิ่งที่ค้นหา"],
  noHitSub:   ["Try a different word.", "ลองใช้คำอื่น"],
  pick:       ["Pick a section on the left", "เลือกหัวข้อทางซ้าย"],
  titleEn:    ["Title (English)", "ชื่อหัวข้อ (อังกฤษ)"],
  titleTh:    ["Title (Thai)", "ชื่อหัวข้อ (ไทย)"],
  bodyEn:     ["Body (English)", "เนื้อหา (อังกฤษ)"],
  bodyTh:     ["Body (Thai)", "เนื้อหา (ไทย)"],
  order:      ["Order", "ลำดับ"],
  save:       ["Save", "บันทึก"],
  cancel:     ["Cancel", "ยกเลิก"],
  del:        ["Delete", "ลบ"],
  delSure:    ["Delete this section? This cannot be undone.", "ลบหัวข้อนี้? ไม่สามารถย้อนกลับได้"],
  saved:      ["Section saved", "บันทึกหัวข้อแล้ว"],
  deleted:    ["Section deleted", "ลบหัวข้อแล้ว"],
  moved:      ["Order updated", "อัปเดตลำดับแล้ว"],
  loadFail:   ["Could not load the manual", "โหลดคู่มือไม่สำเร็จ"],
  saveFail:   ["Could not save — managers only", "บันทึกไม่สำเร็จ — เฉพาะผู้จัดการ"],
  updated:    ["Updated", "อัปเดตเมื่อ"],
  hint:       ["## heading · - bullet · 1. step · **bold** · `code`",
               "## หัวข้อ · - รายการ · 1. ขั้นตอน · **ตัวหนา** · `โค้ด`"],
};

/* ── markdown-lite ─────────────────────────────────────────────────────────
   Deliberately small: headings, bullets, numbered steps, bold and inline
   code, and nothing else. A full markdown library would pull in a parser and
   an HTML sanitiser for a document that only ever needs these five things,
   and every one of these renders as a React element, never as raw HTML, so
   there is no path from manual text to injected markup.                    */

function inline(s, keyBase) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      out.push(<strong key={`${keyBase}b${i++}`} style={{ fontWeight: 700 }}>{tok.slice(2, -2)}</strong>);
    } else {
      out.push(
        <code key={`${keyBase}c${i++}`}
              style={{ background: "#F1F5F9", borderRadius: 5, padding: "1px 6px", fontSize: 12.5,
                       fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace" }}>
          {tok.slice(1, -1)}
        </code>);
    }
    last = m.index + tok.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

function Body({ text }) {
  const blocks = [];
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  let list = null, listKind = null;

  const flush = () => {
    if (!list) return;
    const Tag = listKind === "ol" ? "ol" : "ul";
    blocks.push(
      <Tag key={`l${blocks.length}`}
           style={{ margin: "8px 0 14px", paddingLeft: 22, display: "flex", flexDirection: "column", gap: 6,
                    listStyle: listKind === "ol" ? "decimal" : "disc" }}>
        {list.map((li, i) => (
          <li key={i} style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink,#0F172A)" }}>{inline(li, `li${blocks.length}_${i}`)}</li>
        ))}
      </Tag>);
    list = null; listKind = null;
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); return; }

    const h = /^(#{2,3})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const big = h[1].length === 2;
      blocks.push(
        <h4 key={`h${i}`}
            style={{ fontSize: big ? 15 : 13.5, fontWeight: 700, margin: blocks.length ? "18px 0 6px" : "0 0 6px",
                     color: big ? "var(--blue,#2563EB)" : "var(--ink,#0F172A)" }}>
          {inline(h[2], `h${i}`)}
        </h4>);
      return;
    }

    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    const ul = /^[-*•]\s+(.*)$/.exec(line);
    if (ol || ul) {
      const kind = ol ? "ol" : "ul";
      if (list && listKind !== kind) flush();
      list = list || [];
      listKind = kind;
      list.push((ol || ul)[1]);
      return;
    }

    flush();
    blocks.push(
      <p key={`p${i}`} style={{ fontSize: 13.5, lineHeight: 1.7, margin: "0 0 12px", color: "var(--ink,#0F172A)" }}>
        {inline(line, `p${i}`)}
      </p>);
  });
  flush();
  return <div>{blocks}</div>;
}

/* ── the tab ─────────────────────────────────────────────────────────────── */

export default function CrmManual({ lang = "en", canEdit = false, me, toast }) {
  const T = (k) => (TXT[k] || [k, k])[lang === "th" ? 1 : 0];
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);

  const pickTitle = (r) => (lang === "th" && r.title_th ? r.title_th : r.title_en) || "—";
  const pickBody  = (r) => (lang === "th" && r.body_th ? r.body_th : r.body_en) || "";

  const load = async () => {
    const { data, error } = await supabase.from("crm_manual").select("*").order("sort_order").order("slug");
    if (error) { toast && toast(T("loadFail"), "err"); setLoading(false); return; }
    setRows(data || []);
    setLoading(false);
    setSel((cur) => cur && (data || []).some((r) => r.id === cur) ? cur : (data && data[0] ? data[0].id : null));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      `${r.title_en} ${r.title_th} ${r.body_en} ${r.body_th}`.toLowerCase().includes(needle));
  }, [rows, q]);

  const current = rows.find((r) => r.id === sel) || null;

  const save = async () => {
    if (!edit) return;
    const clean = {
      slug: (edit.slug || edit.title_en || "section").toLowerCase().trim()
              .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "section",
      title_en: edit.title_en || "", title_th: edit.title_th || "",
      body_en:  edit.body_en  || "", body_th:  edit.body_th  || "",
      sort_order: Number(edit.sort_order) || 100,
      updated_by: (me && (me.email || me.id)) || null,
    };
    setBusy(true);
    const q2 = edit.id
      ? supabase.from("crm_manual").update(clean).eq("id", edit.id)
      : supabase.from("crm_manual").insert(clean);
    const { error } = await q2;
    setBusy(false);
    if (error) { toast && toast(T("saveFail"), "err"); return; }
    toast && toast(T("saved"), "ok");
    setEdit(null);
    load();
  };

  const del = async (row) => {
    if (!window.confirm(T("delSure"))) return;
    const { error } = await supabase.from("crm_manual").delete().eq("id", row.id);
    if (error) { toast && toast(T("saveFail"), "err"); return; }
    toast && toast(T("deleted"), "ok");
    load();
  };

  /* Reorder swaps the two rows' sort_order values rather than renumbering the
     whole list, so a move is two small writes and concurrent edits elsewhere
     in the list stay intact. */
  const move = async (row, dir) => {
    const ordered = [...rows];
    const i = ordered.findIndex((r) => r.id === row.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ordered.length) return;
    const a = ordered[i], b = ordered[j];
    const av = a.sort_order, bv = b.sort_order;
    const [x, y] = av === bv ? [i, j] : [bv, av];   // equal orders: fall back to index
    const r1 = await supabase.from("crm_manual").update({ sort_order: x }).eq("id", a.id);
    const r2 = await supabase.from("crm_manual").update({ sort_order: y }).eq("id", b.id);
    if (r1.error || r2.error) { toast && toast(T("saveFail"), "err"); return; }
    toast && toast(T("moved"), "ok");
    load();
  };

  const when = (r) => {
    if (!r || !r.updated_at) return "";
    try {
      return new Date(r.updated_at).toLocaleDateString(lang === "th" ? "th-TH" : "en-GB",
        { day: "2-digit", month: "short", year: "numeric" });
    } catch { return ""; }
  };

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="card p-4 flex flex-wrap gap-2.5 items-center">
        <div className="flex items-center gap-2.5" style={{ minWidth: 200 }}>
          <div className="p-2 rounded-lg" style={{ background: "#EFF6FF" }}>
            <BookMarked size={17} style={{ color: "var(--blue,#2563EB)" }} />
          </div>
          <div>
            <div className="text-[14px] font-bold">{T("title")}</div>
            <div className="text-[12px]" style={{ color: "var(--muted)" }}>{T("sub")}</div>
          </div>
        </div>
        <div className="relative flex-1" style={{ minWidth: 220 }}>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
          <input className="fld pl-9" placeholder={T("search")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {canEdit && (
          <button className="btn btn-p" onClick={() => setEdit({ title_en: "", title_th: "", body_en: "", body_th: "", sort_order: (rows.length + 1) * 10 })}>
            <Plus size={15} />{T("add")}
          </button>
        )}
      </div>

      {loading ? (
        <div className="card p-10 text-center text-[13px]" style={{ color: "var(--muted)" }}>…</div>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center">
          <BookMarked size={26} style={{ color: "var(--muted)", margin: "0 auto 10px" }} />
          <div className="text-[14px] font-semibold">{T("empty")}</div>
          <div className="text-[12.5px] mt-1" style={{ color: "var(--muted)" }}>{T("emptySub")}</div>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(210px,260px) 1fr", alignItems: "start" }}>
          {/* section list */}
          <div className="card p-2" style={{ position: "sticky", top: 8 }}>
            {hits.length === 0 && (
              <div className="p-4 text-center">
                <div className="text-[13px] font-semibold">{T("noHit")}</div>
                <div className="text-[12px] mt-0.5" style={{ color: "var(--muted)" }}>{T("noHitSub")}</div>
              </div>
            )}
            {hits.map((r, i) => {
              const on = r.id === sel;
              return (
                <div key={r.id} className="flex items-center gap-1">
                  <button
                    onClick={() => setSel(r.id)}
                    className="flex-1 text-left px-3 py-2 rounded-lg text-[13px]"
                    style={{ background: on ? "#EFF6FF" : "transparent",
                             color: on ? "var(--blue,#2563EB)" : "inherit",
                             fontWeight: on ? 700 : 500 }}>
                    <span style={{ color: "var(--muted)", marginRight: 7, fontSize: 12 }}>{i + 1}</span>
                    {pickTitle(r)}
                  </button>
                  {canEdit && !q.trim() && (
                    <div className="flex flex-col">
                      <button title="up"   onClick={() => move(r, -1)} className="px-1 rounded hover:bg-slate-100" style={{ lineHeight: 0.8 }}><ChevronUp size={13} /></button>
                      <button title="down" onClick={() => move(r,  1)} className="px-1 rounded hover:bg-slate-100" style={{ lineHeight: 0.8 }}><ChevronDown size={13} /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* body */}
          <div className="card p-6" style={{ minHeight: 260 }}>
            {!current ? (
              <div className="text-[13px]" style={{ color: "var(--muted)" }}>{T("pick")}</div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b" style={{ borderColor: "var(--line)" }}>
                  <div>
                    <h3 className="text-[17px] font-bold">{pickTitle(current)}</h3>
                    {current.updated_at && (
                      <div className="text-[11.5px] mt-1" style={{ color: "var(--muted)" }}>
                        {T("updated")} {when(current)}{current.updated_by ? ` · ${String(current.updated_by).replace(/@.*/, "")}` : ""}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex gap-1.5 shrink-0">
                      <button className="btn" onClick={() => setEdit({ ...current })}><Edit3 size={14} />{T("edit")}</button>
                      <button className="btn" onClick={() => del(current)} style={{ color: "#B91C1C" }}><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
                <Body text={pickBody(current)} />
              </>
            )}
          </div>
        </div>
      )}

      {/* editor */}
      {edit && (
        <div className="ovl" onMouseDown={(e) => e.target === e.currentTarget && setEdit(null)}>
          <div className="sheet scroll" style={{ maxWidth: 720 }}>
            <div className="flex items-start justify-between px-6 py-5 border-b" style={{ borderColor: "var(--line)" }}>
              <div>
                <h3 className="text-[17px] font-bold">{edit.id ? T("edit") : T("add")}</h3>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--muted)" }}>{T("hint")}</p>
              </div>
              <button onClick={() => setEdit(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <label className="block">
                  <span className="text-[12px] font-semibold">{T("titleEn")}</span>
                  <input className="fld mt-1" value={edit.title_en || ""} onChange={(e) => setEdit({ ...edit, title_en: e.target.value })} />
                </label>
                <label className="block">
                  <span className="text-[12px] font-semibold">{T("titleTh")}</span>
                  <input className="fld mt-1" value={edit.title_th || ""} onChange={(e) => setEdit({ ...edit, title_th: e.target.value })} />
                </label>
              </div>
              <label className="block">
                <span className="text-[12px] font-semibold">{T("bodyEn")}</span>
                <textarea className="fld mt-1" rows={10} style={{ fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", fontSize: 12.5 }}
                          value={edit.body_en || ""} onChange={(e) => setEdit({ ...edit, body_en: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-[12px] font-semibold">{T("bodyTh")}</span>
                <textarea className="fld mt-1" rows={8} style={{ fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", fontSize: 12.5 }}
                          value={edit.body_th || ""} onChange={(e) => setEdit({ ...edit, body_th: e.target.value })} />
              </label>
              <label className="block" style={{ maxWidth: 140 }}>
                <span className="text-[12px] font-semibold">{T("order")}</span>
                <input className="fld mt-1" type="number" value={edit.sort_order ?? 100}
                       onChange={(e) => setEdit({ ...edit, sort_order: e.target.value })} />
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button className="btn" onClick={() => setEdit(null)}>{T("cancel")}</button>
                <button className="btn btn-p" disabled={busy} onClick={save}><Save size={15} />{T("save")}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
