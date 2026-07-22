import React, { useState, useEffect, useMemo } from "react";
import SEED_RESOURCES from "./data/kb-resources-seed.json";
import DEFAULT_PICS from "./data/kb-brand-pics.json";

// ═══════════════════════════════════════════════════════════════
// KNOWLEDGE BASE — org-wide resource library for NiRM Roster.
// Visible to every role (T1, RT&RF, Viewer, T2, Manager, CC); a shared
// reference shelf for links to Excel sheets, PDFs, training videos, SOP
// docs, slide decks, etc. — anything an agent might need to look up
// without asking someone. Adding/editing/deleting is restricted to
// canEdit roles (Manager / T2); everyone else can browse and open links.
// Persists via window.storage shim → kv_state, under kb-* keys.
//
// Two sections: Resources (link library, seeded from the team's existing
// FAQ/PDF/training sheets) and Brand PIC Directory (who's responsible for
// each brand — Lead/KAM/ASSO/MC/Affiliate/Live Admin/LAM — imported from
// the KAM PIC roster). Both seed their real starting data on first load
// and are then fully editable going forward.
// ═══════════════════════════════════════════════════════════════

const NAVY = "#0F172A";
const TEAL = "#0D9488";

const TYPE_DEFS = [
  { key: "excel", label: "Excel / Sheet", chipBg: "#DCFCE7", chipFg: "#166534" },
  { key: "pdf",   label: "PDF",           chipBg: "#FEE2E2", chipFg: "#991B1B" },
  { key: "video", label: "Video",         chipBg: "#EDE9FE", chipFg: "#5B21B6" },
  { key: "doc",   label: "Doc",           chipBg: "#DBEAFE", chipFg: "#1E40AF" },
  { key: "slides",label: "Slides",        chipBg: "#FEF3C7", chipFg: "#92400E" },
  { key: "link",  label: "Link",          chipBg: "#F1F5F9", chipFg: "#334155" },
  { key: "other", label: "Other",         chipBg: "#F1F5F9", chipFg: "#334155" },
];
function getTypeDef(key) { return TYPE_DEFS.find((t) => t.key === key) || TYPE_DEFS[TYPE_DEFS.length - 1]; }

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function fmtDT(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const K = { resources: "kb-resources", pics: "kb-brand-pics", seeded: "kb-seeded-flag" };
async function loadKey(key, fallback) {
  try { const r = await window.storage.get(key); return r && r.value ? JSON.parse(r.value) : fallback; }
  catch (e) { console.warn("[KB] load failed", key, e); return fallback; }
}
async function saveKey(key, val) {
  try { await window.storage.set(key, JSON.stringify(val)); }
  catch (e) { console.error("[KB] save failed", key, e); }
}

const S = {
  page: { fontFamily: "'Galano Grotesque','Segoe UI',sans-serif", background: "#F1F5F9", minHeight: "100%", padding: 0 },
  header: { background: `linear-gradient(100deg, ${NAVY} 0%, #1E293B 100%)`, color: "#fff", padding: "20px 24px 16px" },
  kicker: { fontSize: 11, letterSpacing: 2, textTransform: "uppercase", opacity: 0.7, fontWeight: 600 },
  h1: { fontSize: 20, fontWeight: 700, margin: "2px 0 0" },
  sub: { fontSize: 12, opacity: 0.8, marginTop: 4 },
  body: { maxWidth: 1100, margin: "0 auto", padding: "20px 20px 40px" },
  card: { background: "#fff", border: "1px solid #CBD5E1", borderRadius: 12, padding: 16 },
  input: { border: "1px solid #CBD5E1", borderRadius: 8, padding: "6px 10px", fontSize: 13, fontFamily: "inherit", background: "#fff", color: "#1E293B", outline: "none" },
  label: { display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 600, color: "#64748B" },
  btn: (bg) => ({ background: bg, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }),
  btnGhost: { background: "#fff", color: "#475569", border: "1px solid #CBD5E1", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  chip: (bg, fg) => ({ background: bg, color: fg, padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }),
  panel: { border: "1px solid #E2E8F0", borderRadius: 12, padding: 12, background: "#F8FAFC", marginBottom: 14 },
};
const Field = ({ label, children }) => (<label style={S.label}>{label}{children}</label>);

export default function KnowledgeBase({ role, canEdit }) {
  const [section, setSection] = useState("resources"); // "resources" | "pics"
  const [resources, setResources] = useState([]);
  const [pics, setPics] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [fType, setFType] = useState("All");
  const [fCategory, setFCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ title: "", type: "excel", url: "", description: "", category: "" });
  const [toast, setToast] = useState(null);

  useEffect(() => {
    (async () => {
      // Seed real starting data exactly once, ever — gated by an explicit
      // flag rather than "is the stored value null/empty". The earlier
      // null-check version broke in production: the page had been opened
      // once before the seed data existed, which saved an empty array —
      // and an empty array looks identical to "someone deleted everything
      // on purpose", so the seed could never run again. A dedicated flag
      // means it's unambiguous: seeded once, never touched again, no matter
      // what state the data is later left in.
      const alreadySeeded = await loadKey(K.seeded, false);
      const res = await loadKey(K.resources, []);
      const pc = await loadKey(K.pics, []);
      if (!alreadySeeded) {
        setResources(res.length ? res : SEED_RESOURCES);
        setPics(pc.length ? pc : DEFAULT_PICS);
        await saveKey(K.seeded, true);
      } else {
        setResources(res);
        setPics(pc);
      }
      setLoaded(true);
    })();
  }, []);
  useEffect(() => { if (loaded) saveKey(K.resources, resources); }, [resources, loaded]);
  useEffect(() => { if (loaded) saveKey(K.pics, pics); }, [pics, loaded]);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  const categories = useMemo(() => Array.from(new Set(resources.map((r) => r.category).filter(Boolean))).sort(), [resources]);
  const filtered = resources.filter((r) => {
    if (fType !== "All" && r.type !== fType) return false;
    if (fCategory !== "All" && r.category !== fCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${r.title} ${r.description} ${r.category}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const addResource = () => {
    if (!form.title.trim() || !form.url.trim()) return;
    if (editingId) {
      setResources((p) => p.map((r) => (r.id === editingId ? { ...r, ...form } : r)));
      showToast("Resource updated");
      setEditingId(null);
      setShowForm(false);
    } else {
      setResources((p) => [{ id: uid(), ...form, addedBy: role || "", addedAt: new Date().toISOString() }, ...p]);
      showToast("Resource added");
    }
    setForm({ title: "", type: form.type, url: "", description: "", category: form.category });
  };
  const removeResource = (id) => setResources((p) => p.filter((r) => r.id !== id));
  const startEdit = (r) => {
    setEditingId(r.id);
    setForm({ title: r.title, type: r.type, url: r.url, description: r.description || "", category: r.category || "" });
    setShowForm(true);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setShowForm(false);
    setForm({ title: "", type: "excel", url: "", description: "", category: "" });
  };

  const updatePic = (id, field, value) => setPics((p) => p.map((x) => (x.id === id ? { ...x, [field]: value } : x)));
  const removePic = (id) => setPics((p) => p.filter((x) => x.id !== id));
  const addPic = (brand) => {
    if (!brand.trim()) return;
    setPics((p) => [{ id: uid(), brand: brand.trim(), lead: "", kam: "", asso: "", mc: "", affiliate: "", liveAdmin: "", lam: "", lamAsso: "", wh: "", taxProvider: "", note: "" }, ...p]);
  };

  if (!loaded) return <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: "#94A3B8", fontSize: 13 }}>Loading knowledge base…</div>;

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.kicker}>NiRM · Reference Library</div>
        <div style={S.h1}>Knowledge Base</div>
        <div style={S.sub}>Excel sheets, PDFs, training videos, SOPs, and reference docs — shared across every team.</div>
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <button onClick={() => setSection("resources")} style={{ fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 999, border: "none", cursor: "pointer", background: section === "resources" ? "#fff" : "rgba(255,255,255,0.15)", color: section === "resources" ? NAVY : "#fff" }}>Resources</button>
          <button onClick={() => setSection("pics")} style={{ fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 999, border: "none", cursor: "pointer", background: section === "pics" ? "#fff" : "rgba(255,255,255,0.15)", color: section === "pics" ? NAVY : "#fff" }}>Brand PIC Directory</button>
        </div>
      </div>

      <div style={S.body}>
        {section === "pics" ? (
          <PicDirectory pics={pics} canEdit={canEdit} updatePic={updatePic} removePic={removePic} addPic={addPic} search={search} setSearch={setSearch} />
        ) : (
        <div style={S.card}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
            {canEdit && <button style={S.btn(TEAL)} onClick={() => (showForm ? cancelEdit() : setShowForm(true))}>{showForm ? "Close" : "+ Add resource"}</button>}
            <select style={S.input} value={fType} onChange={(e) => setFType(e.target.value)}>
              <option value="All">All types</option>
              {TYPE_DEFS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <select style={S.input} value={fCategory} onChange={(e) => setFCategory(e.target.value)}>
              <option value="All">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input style={{ ...S.input, flex: 1, minWidth: 160 }} placeholder="Search title / description / category…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {showForm && canEdit && (
            <div style={S.panel}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
                <Field label="Title"><input style={S.input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. CUSP Query Cheat Sheet" /></Field>
                <Field label="Type">
                  <select style={S.input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    {TYPE_DEFS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </Field>
                <Field label="Category (optional)"><input style={S.input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. CX Operations, CUSP, HR" /></Field>
                <Field label="Link / URL"><input style={S.input} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" /></Field>
                <Field label="Description"><input style={S.input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What's in it, when to use it" /></Field>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button style={S.btn(NAVY)} onClick={addResource}>{editingId ? "Save changes" : "Save resource"}</button>
                {editingId && <button style={S.btnGhost} onClick={cancelEdit}>Cancel</button>}
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 13, padding: "40px 0" }}>
              {resources.length === 0 ? "No resources yet." + (canEdit ? " Add the first one above." : " Check back once a manager adds some.") : "No resources match this filter."}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 10 }}>
              {filtered.map((r) => (
                <ResourceCard key={r.id} r={r} canEdit={canEdit} onEdit={startEdit} onRemove={removeResource} />
              ))}
            </div>
          )}
        </div>
        )}
      </div>
      {toast && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#0F172A", color: "#fff", fontSize: 13, padding: "8px 18px", borderRadius: 999, zIndex: 9999 }}>{toast}</div>}
    </div>
  );
}

// ── Resource card: preview toggle (best-effort iframe) + edit/delete ──
function ResourceCard({ r, canEdit, onEdit, onRemove }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const t = getTypeDef(r.type);
  return (
    <div style={{ border: "1px solid #E2E8F0", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={S.chip(t.chipBg, t.chipFg)}>{t.label}</span>
        {r.category && <span style={S.chip("#F1F5F9", "#64748B")}>{r.category}</span>}
        <div style={{ flex: 1 }} />
        {canEdit && <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#64748B" }} onClick={() => onEdit(r)} title="Edit">✎</button>}
        {canEdit && <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#94A3B8" }} onClick={() => window.confirm("Remove this resource?") && onRemove(r.id)} title="Delete">✕</button>}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#1E293B" }}>{r.title}</div>
      {r.description && <div style={{ fontSize: 12, color: "#64748B" }}>{r.description}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#64748B", padding: 0 }} onClick={() => setPreviewOpen((o) => !o)}>{previewOpen ? "Hide preview" : "👁 Preview"}</button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "#94A3B8" }}>Added {fmtDT(r.addedAt)}</span>
          <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 700, color: TEAL, textDecoration: "none" }}>Open ↗</a>
        </div>
      </div>
      {previewOpen && (
        <div style={{ marginTop: 4 }}>
          <iframe src={r.url} title={r.title} style={{ width: "100%", height: 220, border: "1px solid #E2E8F0", borderRadius: 8 }} />
          <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 4 }}>
            Blank or blocked above? Some sources (SharePoint, some Google Docs) don't allow embedded previews — use Open ↗ instead.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Brand PIC Directory — who's responsible for each brand ──
const PIC_COLS = [
  { key: "lead", label: "Lead" }, { key: "kam", label: "KAM" }, { key: "asso", label: "ASSO" },
  { key: "mc", label: "MC" }, { key: "affiliate", label: "Affiliate" }, { key: "liveAdmin", label: "Live Admin" },
  { key: "lam", label: "LAM" }, { key: "lamAsso", label: "LAM ASSO" },
  { key: "wh", label: "WH" }, { key: "taxProvider", label: "Tax Provider" },
];
function PicDirectory({ pics, canEdit, updatePic, removePic, addPic, search, setSearch }) {
  const [newBrand, setNewBrand] = useState("");
  const filtered = pics.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${p.brand} ${p.lead} ${p.kam} ${p.asso} ${p.mc} ${p.affiliate} ${p.liveAdmin} ${p.lam} ${p.wh || ""} ${p.taxProvider || ""} ${p.note}`.toLowerCase().includes(q);
  });

  return (
    <div style={S.card}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <input style={{ ...S.input, flex: 1, minWidth: 200 }} placeholder="Search brand or PIC name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span style={{ fontSize: 12, color: "#94A3B8" }}>{filtered.length} brands</span>
        {canEdit && (
          <>
            <input style={S.input} placeholder="New brand name" value={newBrand} onChange={(e) => setNewBrand(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newBrand.trim()) { addPic(newBrand); setNewBrand(""); } }} />
            <button style={S.btn(TEAL)} onClick={() => { if (newBrand.trim()) { addPic(newBrand); setNewBrand(""); } }}>+ Add brand</button>
          </>
        )}
      </div>
      {/* Brand column is sticky (position: sticky; left: 0) so it stays
          visible while scrolling right through the other 8 PIC columns —
          otherwise a wide table like this loses track of which row is
          which brand the moment you scroll past the first column. */}
      <div style={{ overflowX: "auto", border: "1px solid #E2E8F0", borderRadius: 8 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 130 }} />
            {PIC_COLS.map((c) => <col key={c.key} style={{ width: 84 }} />)}
            <col style={{ width: 220 }} />
            {canEdit && <col style={{ width: 28 }} />}
          </colgroup>
          <thead>
            <tr style={{ borderBottom: "2px solid #E2E8F0" }}>
              <th style={{ position: "sticky", left: 0, background: "#F8FAFC", zIndex: 2, textAlign: "left", padding: "6px 8px", color: "#64748B", fontWeight: 700, borderRight: "1px solid #E2E8F0" }}>Brand</th>
              {PIC_COLS.map((c) => <th key={c.key} style={{ textAlign: "left", padding: "6px 6px", color: "#64748B", fontWeight: 700, fontSize: 11 }}>{c.label}</th>)}
              <th style={{ textAlign: "left", padding: "6px 8px", color: "#64748B", fontWeight: 700 }}>Note</th>
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                <td style={{ position: "sticky", left: 0, background: "#fff", zIndex: 1, padding: "4px 8px", fontWeight: 700, color: "#1E293B", borderRight: "1px solid #E2E8F0" }}>
                  {canEdit ? <input style={{ ...S.input, padding: "3px 6px", fontWeight: 700, width: "100%", boxSizing: "border-box" }} value={p.brand} onChange={(e) => updatePic(p.id, "brand", e.target.value)} /> : p.brand}
                </td>
                {PIC_COLS.map((c) => (
                  <td key={c.key} style={{ padding: "4px 4px", color: "#334155" }}>
                    {canEdit ? <input style={{ ...S.input, padding: "3px 4px", width: "100%", boxSizing: "border-box", fontSize: 11 }} value={p[c.key] || ""} onChange={(e) => updatePic(p.id, c.key, e.target.value)} /> : <span style={{ fontSize: 11 }}>{p[c.key] || "—"}</span>}
                  </td>
                ))}
                <td style={{ padding: "4px 8px", color: "#64748B" }}>
                  {canEdit ? <input style={{ ...S.input, padding: "3px 6px", width: "100%", boxSizing: "border-box" }} value={p.note || ""} onChange={(e) => updatePic(p.id, "note", e.target.value)} /> : (p.note || "")}
                </td>
                {canEdit && <td style={{ padding: "4px 4px", textAlign: "center" }}><button style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }} onClick={() => window.confirm(`Remove ${p.brand}?`) && removePic(p.id)}>✕</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 13, padding: "30px 0" }}>No brands match this search.</div>}
      </div>
    </div>
  );
}
