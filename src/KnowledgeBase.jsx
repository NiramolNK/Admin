import React, { useState, useEffect, useMemo, useRef } from "react";
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
const PURPLE = "#7300E6";

// ── small inline SVG icons (no external icon library in this project) ──
const Ico = ({ children, size = 16, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>{children}</svg>
);
const IconGrid = (p) => <Ico {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Ico>;
const IconUsersIco = (p) => <Ico {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></Ico>;
const IconCheckCircle = (p) => <Ico {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4 12 14.01l-3-3" /></Ico>;
const IconClock = (p) => <Ico {...p}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></Ico>;
const IconSearch = (p) => <Ico {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></Ico>;
const IconFilter = (p) => <Ico {...p}><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></Ico>;
const IconReset = (p) => <Ico {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></Ico>;
const IconDownload = (p) => <Ico {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></Ico>;
const IconPencil = (p) => <Ico {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></Ico>;
const IconDots = (p) => <Ico {...p}><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></Ico>;
const IconEye = (p) => <Ico {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Ico>;

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
const RESOURCE_CSV_COLS = [
  { key: "title", label: "Title" }, { key: "type", label: "Type" }, { key: "category", label: "Category" },
  { key: "url", label: "URL" }, { key: "description", label: "Description" },
];

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function fmtDT(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── CSV helpers (no library dependency — hand-rolled RFC4180-ish parser/writer) ──
function toCSV(rows, cols) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = cols.map((c) => esc(c.label)).join(",");
  const lines = rows.map((r) => cols.map((c) => esc(r[c.key])).join(","));
  return "\uFEFF" + [header, ...lines].join("\r\n");
}
function downloadCSV(text, filename) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
}
// Handles quoted fields containing commas, quotes, and newlines — the parts
// a naive text.split(",") gets wrong on real-world exported spreadsheets.
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip — \n handles the line break */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(file);
  });
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

// Reads the NiRM Roster's own live brand list (key "nirm-brands", written by
// AllocationRoster2026.jsx) so new brands added in Roster automatically show
// up here too. Roster stores this value directly (not JSON.stringify'd first
// the way our own kb-* keys are), so r.value may already be a parsed
// array/object rather than a string — handle both shapes defensively.
async function loadRosterBrands() {
  try {
    const r = await window.storage.get("nirm-brands");
    if (!r || r.value == null) return [];
    return typeof r.value === "string" ? JSON.parse(r.value) : r.value;
  } catch (e) { console.warn("[KB] failed to load nirm-brands", e); return []; }
}
// Merges Roster's brand list into the PIC directory: any active (non-
// offboarded) Roster brand not already present (matched by name,
// case-insensitive) gets added with its platforms + WH pre-filled from
// Roster. Existing rows are never removed or have their manually-edited
// fields overwritten — only `platforms` is kept in sync on every load,
// since that's Roster's authoritative data, not something edited here.
function syncPicsWithRoster(pics, rosterBrands) {
  const byName = new Map(pics.map((p) => [p.brand.trim().toLowerCase(), p]));
  const list = [...pics];
  const added = [];
  rosterBrands.forEach((b) => {
    if (b.offboarded || !b.name) return;
    const key = b.name.trim().toLowerCase();
    const platformsStr = Array.isArray(b.platforms) ? b.platforms.join(", ") : "";
    const existing = byName.get(key);
    if (existing) {
      const idx = list.findIndex((p) => p.id === existing.id);
      if (idx >= 0 && list[idx].platforms !== platformsStr) list[idx] = { ...list[idx], platforms: platformsStr };
    } else {
      const fresh = { id: uid(), brand: b.name.trim(), group: b.group || "", lead: "", kam: "", asso: "", mc: "", affiliate: "", liveAdmin: "", lam: "", lamAsso: "", wh: b.wh || "", taxProvider: "", note: "", platforms: platformsStr };
      list.push(fresh);
      byName.set(key, fresh);
      added.push(b.name.trim());
    }
  });
  return { list, added };
}

const S = {
  page: { fontFamily: "'Galano Grotesque','Segoe UI',sans-serif", background: "#F1F5F9", minHeight: "100%", padding: 0 },
  header: { background: `linear-gradient(100deg, ${NAVY} 0%, #1E293B 100%)`, color: "#fff", padding: "20px 24px 16px" },
  kicker: { fontSize: 11, letterSpacing: 2, textTransform: "uppercase", opacity: 0.7, fontWeight: 600 },
  h1: { fontSize: 20, fontWeight: 700, margin: "2px 0 0" },
  sub: { fontSize: 12, opacity: 0.8, marginTop: 4 },
  body: { maxWidth: 1650, margin: "0 auto", padding: "20px 20px 40px" },
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
  const [resPage, setResPage] = useState(1);
  const resPerPage = 16;
  const [form, setForm] = useState({ title: "", type: "excel", url: "", description: "", category: "" });
  const [toast, setToast] = useState(null);
  const resourceFileRef = useRef(null);

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

      // Auto-link new brands from Roster on every load — not gated by the
      // one-time seed flag above, since Roster's brand list changes over
      // time and each load should pick up anything added since the last one.
      try {
        const rosterBrands = await loadRosterBrands();
        if (rosterBrands.length) {
          const basePics = alreadySeeded ? pc : (pc.length ? pc : DEFAULT_PICS);
          const { list, added } = syncPicsWithRoster(basePics, rosterBrands);
          setPics(list);
          if (added.length) showToast(`Linked ${added.length} new brand${added.length > 1 ? "s" : ""} from Roster: ${added.slice(0, 3).join(", ")}${added.length > 3 ? "…" : ""}`);
        }
      } catch (e) { console.warn("[KB] Roster brand sync skipped", e); }

      setLoaded(true);
    })();
  }, []);
  useEffect(() => { if (loaded) saveKey(K.resources, resources); }, [resources, loaded]);
  useEffect(() => { if (loaded) saveKey(K.pics, pics); }, [pics, loaded]);

  const showToast = (m, duration = 2200) => { setToast(m); setTimeout(() => setToast(null), duration); };

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
  useEffect(() => { setResPage(1); }, [search, fType, fCategory]);
  const resTotalPages = Math.max(1, Math.ceil(filtered.length / resPerPage));
  const resPageSafe = Math.min(resPage, resTotalPages);
  const pagedResources = filtered.slice((resPageSafe - 1) * resPerPage, resPageSafe * resPerPage);
  const resetResourceFilters = () => { setSearch(""); setFType("All"); setFCategory("All"); };

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

  const exportResourcesCSV = () => downloadCSV(toCSV(resources, RESOURCE_CSV_COLS), `knowledge-base-resources-${new Date().toISOString().slice(0, 10)}.csv`);
  const importResourcesCSV = async (file) => {
    try {
      const text = await readFileAsText(file);
      const rows = parseCSV(text);
      if (rows.length < 2) { showToast("CSV has no data rows"); return; }
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const idx = (name) => header.indexOf(name);
      const iTitle = idx("title"), iType = idx("type"), iCategory = idx("category"), iUrl = idx("url") >= 0 ? idx("url") : idx("link / url"), iDesc = idx("description");
      if (iTitle < 0 || iUrl < 0) { showToast("CSV needs at least Title and URL columns"); return; }
      const validTypes = new Set(TYPE_DEFS.map((t) => t.key));
      const imported = rows.slice(1).map((r) => {
        const rawType = (r[iType] || "").trim().toLowerCase();
        return {
          id: uid(),
          title: (r[iTitle] || "").trim(),
          type: validTypes.has(rawType) ? rawType : "link",
          category: iCategory >= 0 ? (r[iCategory] || "").trim() : "",
          url: (r[iUrl] || "").trim(),
          description: iDesc >= 0 ? (r[iDesc] || "").trim() : "",
          addedBy: `${role || ""} (CSV import)`,
          addedAt: new Date().toISOString(),
        };
      }).filter((r) => r.title && r.url);
      if (!imported.length) { showToast("No valid rows found — check Title and URL columns"); return; }
      setResources((p) => [...imported, ...p]);
      showToast(`Imported ${imported.length} resource${imported.length > 1 ? "s" : ""} — appended, nothing overwritten`);
    } catch (e) { console.error(e); showToast("Import failed — check the file is a valid CSV"); }
  };

  const updatePic = (id, field, value) => setPics((p) => p.map((x) => (x.id === id ? { ...x, [field]: value } : x)));
  const removePic = (id) => setPics((p) => p.filter((x) => x.id !== id));
  const addPic = (brand) => {
    if (!brand.trim()) return;
    setPics((p) => [{ id: uid(), brand: brand.trim(), group: "", lead: "", kam: "", asso: "", mc: "", affiliate: "", liveAdmin: "", lam: "", lamAsso: "", wh: "", taxProvider: "", note: "" }, ...p]);
  };
  const exportPicsCSV = () => downloadCSV(toCSV(pics, PIC_CSV_COLS), `knowledge-base-brand-pics-${new Date().toISOString().slice(0, 10)}.csv`);
  // Upserts by brand name (case-insensitive) — re-uploading an updated master
  // roster sheet updates matching brands in place instead of duplicating them;
  // any brand name not already present gets added as a new row.
  const importPicsCSV = async (file) => {
    try {
      const text = await readFileAsText(file);
      const rows = parseCSV(text);
      if (rows.length < 2) { showToast("CSV has no data rows"); return; }
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const idx = (name) => header.indexOf(name);
      const colIdx = { brand: idx("brand"), ...Object.fromEntries(PIC_COLS.map((c) => [c.key, idx(c.label.toLowerCase())])), note: idx("note") };
      if (colIdx.brand < 0) { showToast("CSV needs a Brand column"); return; }
      let updated = 0, added = 0;
      setPics((prev) => {
        const list = [...prev];
        rows.slice(1).forEach((r) => {
          const brand = (r[colIdx.brand] || "").trim();
          if (!brand) return;
          const patch = { brand };
          PIC_COLS.forEach((c) => { if (colIdx[c.key] >= 0) patch[c.key] = (r[colIdx[c.key]] || "").trim(); });
          if (colIdx.note >= 0) patch.note = (r[colIdx.note] || "").trim();
          const existingIdx = list.findIndex((x) => x.brand.trim().toLowerCase() === brand.toLowerCase());
          if (existingIdx >= 0) { list[existingIdx] = { ...list[existingIdx], ...patch }; updated++; }
          else { list.unshift({ id: uid(), group: "", lead: "", kam: "", asso: "", mc: "", affiliate: "", liveAdmin: "", lam: "", lamAsso: "", wh: "", taxProvider: "", note: "", ...patch }); added++; }
        });
        return list;
      });
      showToast(`Imported: ${updated} brand${updated === 1 ? "" : "s"} updated, ${added} added`);
    } catch (e) { console.error(e); showToast("Import failed — check the file is a valid CSV"); }
  };

  if (!loaded) return <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: "#94A3B8", fontSize: 13 }}>Loading knowledge base…</div>;

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={S.kicker}>NiRM · Reference Library</div>
            <div style={S.h1}>Knowledge Base</div>
            <div style={S.sub}>Excel sheets, PDFs, training videos, SOPs, and reference docs — shared across every team.</div>
          </div>
          <button onClick={() => showToast("Resources: browse links, filter by type/category, click Preview or Open. Brand PIC Directory: click any cell to edit inline, use ⋮ for more actions.", 6000)}
            style={{ background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            ⓘ How to use
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <button onClick={() => setSection("resources")} style={{ fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 999, border: "none", cursor: "pointer", background: section === "resources" ? "#fff" : "rgba(255,255,255,0.15)", color: section === "resources" ? NAVY : "#fff" }}>Resources</button>
          <button onClick={() => setSection("pics")} style={{ fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 999, border: "none", cursor: "pointer", background: section === "pics" ? "#fff" : "rgba(255,255,255,0.15)", color: section === "pics" ? NAVY : "#fff" }}>Brand PIC Directory</button>
        </div>
      </div>

      <div style={S.body}>
        {section === "pics" ? (
          <PicDirectory pics={pics} canEdit={canEdit} updatePic={updatePic} removePic={removePic} addPic={addPic} search={search} setSearch={setSearch} exportPicsCSV={exportPicsCSV} importPicsCSV={importPicsCSV} />
        ) : (
        <div style={S.card}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
            {canEdit && <button style={{ ...S.btn(PURPLE), display: "flex", alignItems: "center", gap: 6 }} onClick={() => (showForm ? cancelEdit() : setShowForm(true))}>{showForm ? "Close" : (<>+ Add resource</>)}</button>}
            <select style={S.input} value={fType} onChange={(e) => setFType(e.target.value)}>
              <option value="All">All types</option>
              {TYPE_DEFS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <select style={S.input} value={fCategory} onChange={(e) => setFCategory(e.target.value)}>
              <option value="All">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
              <IconSearch size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94A3B8", pointerEvents: "none" }} />
              <input style={{ ...S.input, width: "100%", boxSizing: "border-box", paddingLeft: 32 }} placeholder="Search title / description / category…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <button style={{ ...S.btnGhost, display: "flex", alignItems: "center", gap: 6 }} onClick={exportResourcesCSV}><IconDownload size={13} /> Export CSV</button>
            {canEdit && <button style={S.btnGhost} onClick={() => resourceFileRef.current?.click()}>Import CSV</button>}
            {canEdit && <input ref={resourceFileRef} type="file" accept=".csv" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importResourcesCSV(f); e.target.value = ""; }} />}
          </div>

          {(fType !== "All" || fCategory !== "All" || search) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase" }}>Filters</span>
              {fType !== "All" && (
                <span style={{ ...S.chip(getTypeDef(fType).chipBg, getTypeDef(fType).chipFg), display: "flex", alignItems: "center", gap: 4 }}>
                  {getTypeDef(fType).label}
                  <button onClick={() => setFType("All")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, fontSize: 12 }}>✕</button>
                </span>
              )}
              {fCategory !== "All" && (
                <span style={{ ...S.chip("#F1F5F9", "#334155"), display: "flex", alignItems: "center", gap: 4 }}>
                  {fCategory}
                  <button onClick={() => setFCategory("All")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, fontSize: 12 }}>✕</button>
                </span>
              )}
              {search && (
                <span style={{ ...S.chip("#F1F5F9", "#334155"), display: "flex", alignItems: "center", gap: 4 }}>
                  "{search}"
                  <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, fontSize: 12 }}>✕</button>
                </span>
              )}
              <button onClick={resetResourceFilters} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: PURPLE, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}><IconReset size={12} /> Reset filters</button>
            </div>
          )}


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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 10 }}>
              {pagedResources.map((r) => (
                <ResourceCard key={r.id} r={r} canEdit={canEdit} onEdit={startEdit} onRemove={removeResource} />
              ))}
            </div>
          )}
          {filtered.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
              <span style={{ fontSize: 12, color: "#94A3B8" }}>
                Showing {(resPageSafe - 1) * resPerPage + 1} to {Math.min(resPageSafe * resPerPage, filtered.length)} of {filtered.length} resources
              </span>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <button style={S.btnGhost} disabled={resPageSafe <= 1} onClick={() => setResPage(1)}>«</button>
                <button style={S.btnGhost} disabled={resPageSafe <= 1} onClick={() => setResPage((p) => p - 1)}>‹</button>
                {Array.from({ length: resTotalPages }, (_, i) => i + 1)
                  .filter((n) => n === 1 || n === resTotalPages || Math.abs(n - resPageSafe) <= 1)
                  .map((n, idx, arr) => (
                    <React.Fragment key={n}>
                      {idx > 0 && arr[idx - 1] !== n - 1 && <span style={{ color: "#CBD5E1", padding: "0 2px" }}>…</span>}
                      <button style={{ ...S.btnGhost, background: n === resPageSafe ? PURPLE : "#fff", color: n === resPageSafe ? "#fff" : "#475569", borderColor: n === resPageSafe ? PURPLE : "#CBD5E1" }} onClick={() => setResPage(n)}>{n}</button>
                    </React.Fragment>
                  ))}
                <button style={S.btnGhost} disabled={resPageSafe >= resTotalPages} onClick={() => setResPage((p) => p + 1)}>›</button>
                <button style={S.btnGhost} disabled={resPageSafe >= resTotalPages} onClick={() => setResPage(resTotalPages)}>»</button>
              </div>
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
  const [menuOpen, setMenuOpen] = useState(false);
  const t = getTypeDef(r.type);
  return (
    <div style={{ border: "1px solid #E2E8F0", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={S.chip(t.chipBg, t.chipFg)}>{t.label}</span>
        {r.category && <span style={S.chip("#F1F5F9", "#64748B")}>{r.category}</span>}
        <div style={{ flex: 1 }} />
        {canEdit && (
          <div style={{ position: "relative" }}>
            <button style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }} onClick={() => setMenuOpen((o) => !o)}><IconDots size={14} /></button>
            {menuOpen && (
              <div style={{ position: "absolute", right: 0, top: "100%", zIndex: 5, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", minWidth: 100 }}>
                <button onClick={() => { setMenuOpen(false); onEdit(r); }} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "#334155", padding: "8px 12px", fontSize: 12 }}>Edit</button>
                <button onClick={() => { setMenuOpen(false); if (window.confirm("Remove this resource?")) onRemove(r.id); }} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "#DC2626", padding: "8px 12px", fontSize: 12 }}>Delete</button>
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#1E293B" }}>{r.title}</div>
      {r.description && <div style={{ fontSize: 12, color: "#64748B" }}>{r.description}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#64748B", padding: 0, display: "flex", alignItems: "center", gap: 4 }} onClick={() => setPreviewOpen((o) => !o)}>
          {previewOpen ? "Hide preview" : (<><IconEye size={12} /> Preview</>)}
        </button>
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
  { key: "group", label: "Group" }, { key: "wh", label: "WH" }, { key: "taxProvider", label: "Tax Provider" },
  { key: "lead", label: "Lead" }, { key: "kam", label: "KAM" }, { key: "asso", label: "ASSO" },
  { key: "mc", label: "MC" }, { key: "affiliate", label: "Affiliate" }, { key: "liveAdmin", label: "Live Admin" },
  { key: "lam", label: "LAM" }, { key: "lamAsso", label: "LAM ASSO" },
];
const PIC_CSV_COLS = [{ key: "brand", label: "Brand" }, { key: "platforms", label: "Platforms" }, ...PIC_COLS, { key: "note", label: "Note" }];
// Which core PIC roles count toward "complete" — Group/WH/Tax Provider/Note
// are metadata, not staffing, so they don't factor into completeness.
const CORE_ROLE_KEYS = ["lead", "kam", "asso", "mc", "affiliate", "liveAdmin", "lam", "lamAsso"];
function picFilledCount(p) { return CORE_ROLE_KEYS.filter((k) => (p[k] || "").trim()).length; }
function picStatus(p) {
  const filled = picFilledCount(p);
  if (filled === 0) return "Incomplete";
  if (filled === CORE_ROLE_KEYS.length) return "Complete";
  return "Need Update";
}
const PIC_STATUS_STYLE = {
  Complete: { bg: "#D1FAE5", fg: "#065F46" },
  "Need Update": { bg: "#FEF3C7", fg: "#92400E" },
  Incomplete: { bg: "#E0E7FF", fg: "#4338CA" },
};

function StatCard({ value, label, sub, iconBg, iconFg, Icon }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flex: "1 1 220px", border: "1px solid #E2E8F0", borderRadius: 12, padding: "16px 18px", background: "#fff" }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: iconBg, color: iconFg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={20} />
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: "#1E293B", lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginTop: 3 }}>{label}</div>
        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{sub}</div>
      </div>
    </div>
  );
}

function PicDirectory({ pics, canEdit, removePic, addPic, updatePic, search, setSearch, exportPicsCSV, importPicsCSV }) {
  const [newBrand, setNewBrand] = useState("");
  const [fLead, setFLead] = useState("All");
  const [fMC, setFMC] = useState("All");
  const [fStatus, setFStatus] = useState("All");
  const [page, setPage] = useState(1);
  const perPage = 12;
  const [openMenuId, setOpenMenuId] = useState(null);
  const fileRef = useRef(null);

  const leadOptions = useMemo(() => Array.from(new Set(pics.map((p) => p.lead).filter(Boolean))).sort(), [pics]);
  const mcOptions = useMemo(() => Array.from(new Set(pics.map((p) => p.mc).filter(Boolean))).sort(), [pics]);

  const filtered = pics.filter((p) => {
    if (fLead !== "All" && p.lead !== fLead) return false;
    if (fMC !== "All" && p.mc !== fMC) return false;
    if (fStatus !== "All" && picStatus(p) !== fStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${p.brand} ${p.lead} ${p.kam} ${p.asso} ${p.mc} ${p.affiliate} ${p.liveAdmin} ${p.lam} ${p.group || ""} ${p.wh || ""} ${p.taxProvider || ""} ${p.note}`.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => a.brand.localeCompare(b.brand));

  useEffect(() => { setPage(1); }, [search, fLead, fMC, fStatus]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  const totalPICs = useMemo(() => pics.reduce((sum, p) => sum + picFilledCount(p), 0), [pics]);
  const completeCount = useMemo(() => pics.filter((p) => picStatus(p) === "Complete").length, [pics]);
  const needUpdateCount = useMemo(() => pics.filter((p) => picStatus(p) === "Need Update").length, [pics]);

  const resetFilters = () => { setSearch(""); setFLead("All"); setFMC("All"); setFStatus("All"); };



  return (
    <div style={S.card}>
      {/* ── summary stat cards ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <StatCard value={pics.length} label="Total Brands" sub="All active brands" iconBg="#EDE9FE" iconFg="#7C3AED" Icon={IconGrid} />
        <StatCard value={totalPICs} label="Total PICs" sub="Across all brands" iconBg="#DBEAFE" iconFg="#2563EB" Icon={IconUsersIco} />
        <StatCard value={completeCount} label="With Complete Info" sub="PIC details complete" iconBg="#D1FAE5" iconFg="#059669" Icon={IconCheckCircle} />
        <StatCard value={needUpdateCount} label="Need Update" sub="Missing information" iconBg="#FEF3C7" iconFg="#D97706" Icon={IconClock} />
      </div>

      {/* ── search + filters + actions ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <IconSearch size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94A3B8", pointerEvents: "none" }} />
          <input style={{ ...S.input, width: "100%", boxSizing: "border-box", paddingLeft: 32 }} placeholder="Search brand or PIC name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select style={S.input} value={fLead} onChange={(e) => setFLead(e.target.value)}>
          <option value="All">All Lead</option>{leadOptions.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select style={S.input} value={fMC} onChange={(e) => setFMC(e.target.value)}>
          <option value="All">All MC</option>{mcOptions.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select style={S.input} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="All">All Status</option><option>Complete</option><option>Need Update</option><option>Incomplete</option>
        </select>
        <button style={{ ...S.btnGhost, display: "flex", alignItems: "center", gap: 6 }} onClick={resetFilters}><IconReset size={13} /> Reset</button>
        <span style={{ fontSize: 12, color: "#94A3B8" }}>{filtered.length} brands</span>
        <div style={{ flex: 1 }} />
        <button style={{ ...S.btnGhost, display: "flex", alignItems: "center", gap: 6 }} onClick={exportPicsCSV}><IconDownload size={13} /> Export</button>
        {canEdit && <button style={S.btnGhost} onClick={() => fileRef.current?.click()}>Import CSV</button>}
        {canEdit && <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importPicsCSV(f); e.target.value = ""; }} />}
        {canEdit && (
          <>
            <input style={S.input} placeholder="New brand name" value={newBrand} onChange={(e) => setNewBrand(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newBrand.trim()) { addPic(newBrand); setNewBrand(""); } }} />
            <button style={S.btn(PURPLE)} onClick={() => { if (newBrand.trim()) { addPic(newBrand); setNewBrand(""); } }}>+ Add Brand</button>
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
            <col style={{ width: 115 }} />
            <col style={{ width: 110 }} />
            {PIC_COLS.map((c) => <col key={c.key} style={{ width: 72 }} />)}
            <col style={{ width: 170 }} />
            <col style={{ width: 90 }} />
            {canEdit && <col style={{ width: 40 }} />}
          </colgroup>
          <thead>
            <tr style={{ borderBottom: "2px solid #E2E8F0" }}>
              <th style={{ position: "sticky", left: 0, background: "#F8FAFC", zIndex: 2, textAlign: "left", padding: "6px 8px", color: "#64748B", fontWeight: 700, borderRight: "1px solid #E2E8F0" }}>Brand</th>
              <th style={{ textAlign: "left", padding: "6px 6px", color: "#64748B", fontWeight: 700, fontSize: 11 }} title="From NiRM Roster — read-only, syncs automatically">Platforms</th>
              {PIC_COLS.map((c) => <th key={c.key} style={{ textAlign: "left", padding: "6px 6px", color: "#64748B", fontWeight: 700, fontSize: 11 }}>{c.label}</th>)}
              <th style={{ textAlign: "left", padding: "6px 8px", color: "#64748B", fontWeight: 700 }}>Note</th>
              <th style={{ textAlign: "left", padding: "6px 8px", color: "#64748B", fontWeight: 700 }}>Status</th>
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((p, i) => {
              const st = PIC_STATUS_STYLE[picStatus(p)];
              return (
              <tr key={p.id} style={{ borderBottom: "1px solid #F1F5F9", background: i % 2 ? "#FBFCFE" : "#fff" }}>
                <td style={{ position: "sticky", left: 0, background: i % 2 ? "#FBFCFE" : "#fff", zIndex: 1, padding: "4px 8px", fontWeight: 700, color: "#1E293B", borderRight: "1px solid #E2E8F0" }}>
                  {canEdit ? <input style={{ ...S.input, padding: "3px 6px", fontWeight: 700, width: "100%", boxSizing: "border-box" }} value={p.brand} onChange={(e) => updatePic(p.id, "brand", e.target.value)} /> : p.brand}
                </td>
                <td style={{ padding: "4px 6px" }}>
                  {(p.platforms || "").split(",").map((s) => s.trim()).filter(Boolean).map((pf) => (
                    <span key={pf} style={{ ...S.chip("#EEF2FF", "#4338CA"), marginRight: 3, marginBottom: 2, display: "inline-block" }}>{pf}</span>
                  ))}
                  {!p.platforms && <span style={{ fontSize: 10, color: "#CBD5E1" }}>—</span>}
                </td>
                {PIC_COLS.map((c) => (
                  <td key={c.key} style={{ padding: "4px 4px", color: "#334155" }}>
                    {canEdit ? <input style={{ ...S.input, padding: "3px 4px", width: "100%", boxSizing: "border-box", fontSize: 11 }} value={p[c.key] || ""} onChange={(e) => updatePic(p.id, c.key, e.target.value)} /> : <span style={{ fontSize: 11 }}>{p[c.key] || "—"}</span>}
                  </td>
                ))}
                <td style={{ padding: "4px 8px", color: "#64748B" }}>
                  {canEdit ? <input style={{ ...S.input, padding: "3px 6px", width: "100%", boxSizing: "border-box" }} value={p.note || ""} onChange={(e) => updatePic(p.id, "note", e.target.value)} /> : (p.note || "")}
                </td>
                <td style={{ padding: "4px 8px" }}><span style={S.chip(st.bg, st.fg)}>{picStatus(p)}</span></td>
                {canEdit && (
                  <td style={{ padding: "4px 4px", textAlign: "center", position: "relative" }}>
                    <button title="Cells are already editable inline — click any field" style={{ background: "none", border: "none", cursor: "default", color: "#94A3B8", marginRight: 4 }}><IconPencil size={14} /></button>
                    <button onClick={() => setOpenMenuId((id) => (id === p.id ? null : p.id))} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }}><IconDots size={14} /></button>
                    {openMenuId === p.id && (
                      <div style={{ position: "absolute", right: 6, top: "100%", zIndex: 5, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", minWidth: 110 }}>
                        <button
                          onClick={() => { setOpenMenuId(null); if (window.confirm(`Remove ${p.brand}?`)) removePic(p.id); }}
                          style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "#DC2626", padding: "8px 12px", fontSize: 12 }}
                        >Delete</button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            );})}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 13, padding: "30px 0" }}>No brands match this search.</div>}
      </div>
      {/* ── pagination ── */}
      {filtered.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
          <span style={{ fontSize: 12, color: "#94A3B8" }}>
            Showing {(pageSafe - 1) * perPage + 1} to {Math.min(pageSafe * perPage, filtered.length)} of {filtered.length} brands
          </span>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <button style={S.btnGhost} disabled={pageSafe <= 1} onClick={() => setPage(1)}>«</button>
            <button style={S.btnGhost} disabled={pageSafe <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === totalPages || Math.abs(n - pageSafe) <= 1)
              .map((n, idx, arr) => (
                <React.Fragment key={n}>
                  {idx > 0 && arr[idx - 1] !== n - 1 && <span style={{ color: "#CBD5E1", padding: "0 2px" }}>…</span>}
                  <button style={{ ...S.btnGhost, background: n === pageSafe ? PURPLE : "#fff", color: n === pageSafe ? "#fff" : "#475569", borderColor: n === pageSafe ? PURPLE : "#CBD5E1" }} onClick={() => setPage(n)}>{n}</button>
                </React.Fragment>
              ))}
            <button style={S.btnGhost} disabled={pageSafe >= totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
            <button style={S.btnGhost} disabled={pageSafe >= totalPages} onClick={() => setPage(totalPages)}>»</button>
          </div>
        </div>
      )}
    </div>
  );
}
