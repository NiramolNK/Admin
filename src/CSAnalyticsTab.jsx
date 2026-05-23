// ════════════════════════════════════════════════════════════════════════════
// CSAnalyticsTab.jsx
// Customer Service overview dashboard. Works for any brand group.
// Data shape — stored under "cs-analytics" key in window.storage:
//
//   {
//     period: "Q2 2026",
//     months: ["apr", "may"],                          // 1-3 months supported
//     monthLabels: { apr: "April", may: "May" },
//     brands: [
//       { name, group, aprO, mayO, q2, cases,
//         solved, comments, open, aprC, mayC }
//     ],
//     cases: [{ brand, platform, reason, month, count }],
//     status: [{ brand, platform, month, Status, count }],
//     chat:   { apr: [{brand, platform, chats, rt}], may: [...] },
//     platformTotals: [{ name, key, apr, may }],
//   }
//
// Use the "Import Data" button (manager only) to paste a JSON blob matching
// this shape. A generator script that builds this from CUSP + Monday.com is
// in `tools/build-cs-data.mjs` (separate file in the repo).
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from "react";

const REASON_COLORS = {
  "Delivery": "#D02B27", "Damaged Product": "#FB8C00", "Missing Item": "#1A6FC4",
  "Defective": "#C9972A", "Missing GWP": "#1E8C4A", "Receive Wrong item": "#7B3FA0",
  "Tax invoice": "#0891B2", "Cancel": "#BE185D", "Damaged Package": "#D97706",
  "Damaged GWP": "#64748B", "Return/Refund": "#0F766E", "Product Detail": "#6366F1",
  "Tax": "#0284C7", "Tax Invoice": "#0284C7", "Other": "#94A3B8",
  "Promotion": "#EC4899", "Top Spender / GWP": "#F59E0B", "Excessed Item": "#10B981",
  "Expiry date": "#EF4444", "Product allergy": "#8B5CF6", "Affiliate": "#06B6D4",
};

const PLATFORM_C = {
  shopee: { color: "#EE4D2D", bg: "#FFF2EF" },
  tiktok: { color: "#444444", bg: "#F4F4F4" },
  lazada: { color: "#2A3FA0", bg: "#EEF1FF" },
};

// Default empty state used before any data is imported.
const EMPTY_DATA = {
  period: "—", months: [], monthLabels: {},
  brands: [], cases: [], status: [], chat: {}, platformTotals: [],
};

export default function CSAnalyticsTab({ role, canEdit, chatsByMonth = {}, currentMonthCode }) {
  const [data, setData] = useState(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [group, setGroup] = useState("all");
  const [brand, setBrand] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [reasonBrand, setReasonBrand] = useState("all");
  // Custom date range (overrides the global single-month picker when set)
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importErr, setImportErr] = useState("");

  // Convert YYYY-MM-DD → month code (jan/feb/.../dec)
  const dateToMonthCode = (yyyymmdd) => {
    const m = String(yyyymmdd || "").match(/^\d{4}-(\d{2})/);
    return m ? ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"][parseInt(m[1],10)-1] : null;
  };

  // Months falling within the custom date range (inclusive). null if range not set.
  const monthsInRange = useMemo(() => {
    if (!dateFrom || !dateTo) return null;
    const fromCode = dateToMonthCode(dateFrom);
    const toCode = dateToMonthCode(dateTo);
    if (!fromCode || !toCode) return null;
    const all = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const fi = all.indexOf(fromCode);
    const ti = all.indexOf(toCode);
    if (fi < 0 || ti < 0 || ti < fi) return null;
    return new Set(all.slice(fi, ti + 1));
  }, [dateFrom, dateTo]);

  // Effective month filter:
  //   - If date range set: `month` becomes "all" so the explicit `monthsInRange` filter takes over.
  //   - Otherwise follow the global header month picker (currentMonthCode).
  const month = monthsInRange ? "all" : (currentMonthCode || "all");
  // Monday.com sync state
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState(null);

  // ── Load saved analytics data + Monday sync ──────────────────────────────
  // 1. Load whatever's cached (legacy JSON import OR previous Monday sync)
  // 2. If cache is older than 15 min, trigger a fresh Monday sync in background
  useEffect(() => {
    (async () => {
      if (!window.storage) { setLoaded(true); return; }
      try {
        // Legacy JSON import data (chat, orders) — never overwritten by Monday
        const legacy = await window.storage.get("cs-analytics");
        // Monday-synced data (cases, status) — refreshed periodically
        const monday = await window.storage.get("cs-analytics-monday");

        let merged = { ...EMPTY_DATA };
        if (legacy?.value) {
          const parsed = typeof legacy.value === "string" ? JSON.parse(legacy.value) : legacy.value;
          merged = { ...merged, ...parsed };
        }
        if (monday?.value) {
          const m = typeof monday.value === "string" ? JSON.parse(monday.value) : monday.value;
          merged = mergeMondayInto(merged, m);
          if (m.lastSyncAt) setLastSyncAt(m.lastSyncAt);
        }
        setData(merged);
      } catch (e) {
        console.error("Load CS analytics failed:", e);
      }
      setLoaded(true);
    })();
  }, []);

  // Auto-sync on first load if data is stale (>15 min) — only run after `loaded`
  useEffect(() => {
    if (!loaded) return;
    const age = lastSyncAt ? (Date.now() - new Date(lastSyncAt).getTime()) : Infinity;
    if (age > 15 * 60 * 1000) {
      syncFromMonday();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // ── Sync from Monday.com (manual or auto) ────────────────────────────────
  const syncFromMonday = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncError("");
    try {
      const res = await fetch("/api/cs-sync");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const mondayData = await res.json();
      setData(prev => mergeMondayInto(prev, mondayData));
      setLastSyncAt(mondayData.lastSyncAt || new Date().toISOString());
      if (window.storage) {
        await window.storage.set("cs-analytics-monday", JSON.stringify(mondayData));
      }
    } catch (e) {
      setSyncError(e.message || "Sync failed");
      console.error("Monday sync error:", e);
    }
    setSyncing(false);
  };

  // ── Available brand groups (derived from data) ───────────────────────────
  const groups = useMemo(() => {
    const set = new Set();
    data.brands.forEach((b) => b.group && set.add(b.group));
    return ["all", ...Array.from(set).sort()];
  }, [data.brands]);

  // ── Brands filtered by current group + (optional) brand selection ───────
  const brandsInScope = useMemo(() => {
    let list = data.brands;
    if (group !== "all") list = list.filter((b) => b.group === group);
    if (brand !== "all") list = list.filter((b) => b.name === brand);
    return list;
  }, [data.brands, group, brand]);

  // All brand names within the current group (for the Brand dropdown)
  const brandsForFilter = useMemo(() => {
    if (group === "all") return data.brands;
    return data.brands.filter((b) => b.group === group);
  }, [data.brands, group]);

  const brandNamesInScope = useMemo(
    () => new Set(brandsInScope.map((b) => b.name)),
    [brandsInScope]
  );

  // ── Filtered data slices ─────────────────────────────────────────────────
  const filteredCases = useMemo(() => {
    return data.cases.filter((d) =>
      brandNamesInScope.has(d.brand) &&
      (brand === "all" || d.brand === brand) &&
      (monthsInRange ? monthsInRange.has(d.month) : (month === "all" || d.month === month)) &&
      (platform === "all" || d.platform === platform)
    );
  }, [data.cases, brandNamesInScope, brand, month, monthsInRange, platform]);

  const filteredCasesByBrand = useMemo(() => {
    return filteredCases.filter((d) => reasonBrand === "all" || d.brand === reasonBrand);
  }, [filteredCases, reasonBrand]);

  const filteredStatus = useMemo(() => {
    return data.status.filter((d) =>
      brandNamesInScope.has(d.brand) &&
      (brand === "all" || d.brand === brand) &&
      (monthsInRange ? monthsInRange.has(d.month) : (month === "all" || d.month === month)) &&
      (platform === "all" || d.platform === platform)
    );
  }, [data.status, brandNamesInScope, brand, month, monthsInRange, platform]);

  const filteredChat = useMemo(() => {
    const months = monthsInRange
      ? data.months.filter(m => monthsInRange.has(m))
      : (month === "all" ? data.months : [month]);
    let rows = [];
    months.forEach((m) => {
      const list = (data.chat[m] || []).filter(
        (d) => brandNamesInScope.has(d.brand) &&
               (platform === "all" || d.platform === platform)
      );
      rows = rows.concat(list);
    });
    // merge duplicates if multiple months combined
    const map = {};
    rows.forEach((d) => {
      const k = d.brand + "|" + d.platform;
      if (!map[k]) map[k] = { brand: d.brand, platform: d.platform, chats: 0, rt: d.rt };
      map[k].chats += d.chats;
    });
    return Object.values(map).sort((a, b) => b.chats - a.chats);
  }, [data.chat, data.months, brandNamesInScope, month, monthsInRange, platform]);

  // ── Derived KPIs ─────────────────────────────────────────────────────────
  const totalCases = filteredCases.reduce((s, d) => s + d.count, 0);

  // Case status counts (In Progress / Resolved) derived from Monday status labels.
  // Solved-like labels: Done, Solved, Resolved, Closed, Complete, Completed, Finished
  // Anything else is treated as In Progress.
  const SOLVED_RE = /^(done|solved|resolved|closed|complete|completed|finished)$/i;
  const resolvedCount = filteredStatus
    .filter((d) => SOLVED_RE.test(d.Status || ""))
    .reduce((s, d) => s + d.count, 0);
  const inProgressCount = filteredStatus
    .filter((d) => !SOLVED_RE.test(d.Status || ""))
    .reduce((s, d) => s + d.count, 0);

  // Chats — prefer NiRM Performance Replied Chats data (passed via prop).
  // Falls back to data.chat (JSON import) for any month where Performance has 0 / no data.
  const totalChats = useMemo(() => {
    const fromPerf = month === "all"
      ? Object.values(chatsByMonth || {}).reduce((s, v) => s + (v || 0), 0)
      : ((chatsByMonth && chatsByMonth[month]) || 0);
    if (fromPerf > 0) return fromPerf;
    return filteredChat.reduce((s, d) => s + d.chats, 0);
  }, [chatsByMonth, month, filteredChat]);

  // ── Import handler ───────────────────────────────────────────────────────
  const handleImport = async () => {
    setImportErr("");
    try {
      const parsed = JSON.parse(importText);
      // light validation
      if (!Array.isArray(parsed.brands)) throw new Error("Missing 'brands' array");
      if (!Array.isArray(parsed.cases))  throw new Error("Missing 'cases' array");
      if (!Array.isArray(parsed.status)) throw new Error("Missing 'status' array");
      if (typeof parsed.chat !== "object") throw new Error("Missing 'chat' object");
      const merged = { ...EMPTY_DATA, ...parsed };
      setData(merged);
      await window.storage.set("cs-analytics", JSON.stringify(merged));
      setImportOpen(false);
      setImportText("");
    } catch (e) {
      setImportErr(e.message || "Invalid JSON");
    }
  };

  if (!loaded) {
    return <div style={loadingStyle}>Loading analytics…</div>;
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (data.brands.length === 0) {
    return (
      <div style={{ padding: 32, fontFamily: "'Nunito Sans', sans-serif" }}>
        <div style={emptyCardStyle}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1C2233", marginBottom: 8, fontFamily: "'Nunito', sans-serif" }}>
            No analytics data yet
          </div>
          <div style={{ fontSize: 13, color: "#4A5568", marginBottom: 16 }}>
            Sync live case data from Monday.com, or import historical chat/order data.
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={syncFromMonday} disabled={syncing} style={primaryBtn}>
              {syncing ? "Syncing from Monday…" : "Sync from Monday"}
            </button>

          </div>
          {syncError && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#D02B27" }}>
              Sync error: {syncError}
            </div>
          )}
        </div>
        {importOpen && <ImportModal
          text={importText} setText={setImportText}
          err={importErr} onCancel={() => setImportOpen(false)}
          onImport={handleImport}
        />}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 13, color: "#1C2233" }}>
      {/* ── Filter bar ── */}
      <div style={filterBarStyle}>
        <span style={gfLabelStyle}>Group:</span>
        {groups.map((g) => (
          <FilterBtn key={g} active={group === g} onClick={() => { setGroup(g); setBrand("all"); setReasonBrand("all"); }}>
            {g === "all" ? "All" : g}
          </FilterBtn>
        ))}
        <div style={sepStyle} />
        <span style={gfLabelStyle}>Brand:</span>
        <select value={brand} onChange={(e) => setBrand(e.target.value)} style={brandSelectStyle}>
          <option value="all">All brands</option>
          {brandsForFilter.map((b) => (
            <option key={b.name} value={b.name}>{b.name}</option>
          ))}
        </select>
        <div style={sepStyle} />
        <span style={gfLabelStyle}>Platform:</span>
        {["all", "shopee", "tiktok", "lazada"].map((p) => (
          <FilterBtn key={p} active={platform === p} onClick={() => setPlatform(p)} colorKey={p}>
            {p === "all" ? "All" : p.charAt(0).toUpperCase() + p.slice(1)}
          </FilterBtn>
        ))}
        <div style={{ marginLeft: "auto", fontSize: 11, color: "#8A96A8" }}>
          <strong>{group === "all" ? "All groups" : group}</strong> · {brandsInScope.length} brands · {totalCases.toLocaleString()} cases
        </div>
        <button onClick={syncFromMonday} disabled={syncing} style={{
          ...smallBtn,
          background: syncing ? "#94A3B8" : "#0D9488",
          color: "#fff",
          cursor: syncing ? "wait" : "pointer",
        }}>
          {syncing ? "Syncing…" : "Sync from Monday"}
        </button>
        {lastSyncAt && (
          <span style={{ fontSize: 10, color: "#94A3B8", marginLeft: 6 }}>
            Last sync: {formatRelativeTime(lastSyncAt)}
          </span>
        )}
        {syncError && (
          <span style={{ fontSize: 10, color: "#D02B27", marginLeft: 6 }} title={syncError}>
            ⚠ sync error
          </span>
        )}
      </div>

      {/* Date range filter (overrides global month when set) */}
      <div style={dateRangeBarStyle}>
        <span style={gfLabelStyle}>Date Range:</span>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={dateInputStyle} placeholder="From" />
        <span style={{ color: "#94A3B8", fontSize: 12 }}>to</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={dateInputStyle} placeholder="To" />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); }} style={{
            ...smallBtn,
            border: "1.5px solid #94A3B8", background: "#fff", color: "#64748B", marginLeft: 4,
          }}>Clear range</button>
        )}
        {monthsInRange && (
          <span style={{ fontSize: 11, color: "#0D9488", marginLeft: 8, fontWeight: 600 }}>
            Filtering by {Array.from(monthsInRange).map(m => data.monthLabels[m] || m).join(", ")}
          </span>
        )}
      </div>

      {/* Quick-month buttons — click sets the date range to that month */}
      <div style={dateRangeBarStyle}>
        <span style={gfLabelStyle}>Quick Month:</span>
        {(() => {
          // Derive year from the data.period label (fallback to current year)
          const yMatch = String(data.period||"").match(/(20\d{2})/);
          const y = yMatch ? parseInt(yMatch[1], 10) : new Date().getFullYear();
          return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((mn, i) => {
            const mNum = i + 1;
            const last = new Date(y, mNum, 0).getDate();
            const from = `${y}-${String(mNum).padStart(2,"0")}-01`;
            const to   = `${y}-${String(mNum).padStart(2,"0")}-${String(last).padStart(2,"0")}`;
            const active = dateFrom === from && dateTo === to;
            return (
              <button key={mn} onClick={() => { setDateFrom(from); setDateTo(to); }} style={{
                padding: "4px 10px", borderRadius: 6,
                border: active ? "none" : "1.5px solid #E4E8F0",
                background: active ? "#0D9488" : "#fff",
                color: active ? "#fff" : "#64748B",
                fontSize: 11, fontWeight: 700, fontFamily: "'Nunito', sans-serif",
                cursor: "pointer",
              }}>{mn}</button>
            );
          });
        })()}
      </div>

      <div style={{ padding: "20px 28px" }}>
        {/* ── KPI tiles ── */}
        <div style={kpiGrid}>
          <KPI label="Total Cases" value={totalCases.toLocaleString()} sub={brand === "all" ? `${brandsInScope.length} brands` : brand} color="#D02B27" />
          <KPI label="Chats" value={totalChats.toLocaleString()} sub={(() => {
            const fromPerf = month === "all"
              ? Object.values(chatsByMonth || {}).reduce((s, v) => s + (v || 0), 0)
              : ((chatsByMonth && chatsByMonth[month]) || 0);
            const label = month === "all" ? data.period : data.monthLabels[month] || month;
            return `${label} · ${fromPerf > 0 ? "from Performance" : "from imported data"}`;
          })()} color="#1A6FC4" />
          <KPI label="In Progress" value={inProgressCount.toLocaleString()} sub={totalCases > 0 ? `${Math.round(inProgressCount/totalCases*100)}% of total` : "—"} color="#D46B08" />
          <KPI label="Resolved" value={resolvedCount.toLocaleString()} sub={totalCases > 0 ? `${Math.round(resolvedCount/totalCases*100)}% of total` : "—"} color="#1E8C4A" />
        </div>

        {/* ── Top row: Reasons + Status + Cases by Platform ── */}
        <div style={threeColGrid}>
          {/* Reasons panel */}
          <Panel title="Reasons for Cases" sub={`${reasonBrand === "all" ? "All brands" : reasonBrand} · ${platform === "all" ? "All platforms" : platform} · ${month === "all" ? "All months" : data.monthLabels[month] || month}`}>
            <ReasonsBlock
              cases={filteredCasesByBrand}
              brandsInScope={brandsInScope}
              reasonBrand={reasonBrand}
              setReasonBrand={setReasonBrand}
            />
          </Panel>

          {/* Status panel */}
          <Panel title="Case Status by Brand" sub="Solved · Has comments · Open">
            <StatusBars status={filteredStatus} brands={brandsInScope} />
          </Panel>

          {/* Platform breakdown */}
          <Panel title="Cases by Platform" sub={`${brandsInScope.length} brands`}>
            <PlatformBlocks cases={filteredCases} />
            <div style={{ borderTop: "1.5px solid #EEF1F7", paddingTop: 12, marginTop: 12 }}>
              <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: 11, fontWeight: 800, marginBottom: 8 }}>
                Chat by Platform — {data.months.map((m) => data.monthLabels[m] || m).join(" vs ")}
              </div>
              <PlatformMonthBars platformTotals={data.platformTotals} months={data.months} monthLabels={data.monthLabels} />
            </div>
          </Panel>
        </div>

        {/* ── Brand × Month chart ── */}
        <Panel title="Brand Chat — Monthly Comparison" sub={data.months.map((m) => data.monthLabels[m] || m).join(" vs ")}>
          <BrandMonthBars brands={brandsInScope} months={data.months} monthLabels={data.monthLabels} />
        </Panel>

        {/* ── Chat table ── */}
        <Panel title={`Chat Volume — ${month === "all" ? "All Months" : data.monthLabels[month] || month}`} sub="Sorted by chat volume">
          <ChatTable rows={filteredChat} totalChats={totalChats} />
        </Panel>

        {/* ── Brand performance table ── */}
        <Panel title="Brand-Level Performance Overview" sub="Orders, chats, cases, case rate">
          <BrandTable brands={brandsInScope} months={data.months} monthLabels={data.monthLabels} />
        </Panel>
      </div>

      {importOpen && <ImportModal
        text={importText} setText={setImportText}
        err={importErr} onCancel={() => setImportOpen(false)}
        onImport={handleImport}
      />}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=Nunito+Sans:wght@300;400;500;600;700&display=swap');
      `}</style>
    </div>
  );
}

// ─── Building blocks ────────────────────────────────────────────────────────

function FilterBtn({ active, onClick, children, colorKey }) {
  const colorMap = {
    apr: "#D02B27", may: "#1A6FC4", jun: "#1E8C4A",
    shopee: "#EE4D2D", tiktok: "#444", lazada: "#2A3FA0",
  };
  const bg = active ? (colorMap[colorKey] || "#1C2233") : "#F8F9FC";
  const color = active ? "#fff" : "#8A96A8";
  const border = active ? "transparent" : "#E4E8F0";
  return (
    <button onClick={onClick} style={{
      padding: "6px 14px", borderRadius: 9, border: `1.5px solid ${border}`,
      fontFamily: "'Nunito', sans-serif", fontSize: 12, fontWeight: 700,
      cursor: "pointer", background: bg, color, transition: "all 0.15s",
      whiteSpace: "nowrap",
    }}>
      {children}
    </button>
  );
}

function KPI({ label, value, sub, color }) {
  return (
    <div style={{
      background: "#fff", border: "1.5px solid #E4E8F0", borderRadius: 12,
      padding: "16px 20px", boxShadow: "0 2px 12px rgba(28,34,51,0.07)",
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5,
        textTransform: "uppercase", color: "#8A96A8", marginBottom: 8,
        fontFamily: "'Nunito', sans-serif" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color, fontFamily: "'Nunito', sans-serif", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "#8A96A8", marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function Panel({ title, sub, children }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 12, border: "1.5px solid #E4E8F0",
      padding: 18, marginBottom: 16, boxShadow: "0 2px 12px rgba(28,34,51,0.07)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 14, paddingBottom: 10, borderBottom: "1.5px solid #EEF1F7" }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, fontFamily: "'Nunito', sans-serif", color: "#1C2233" }}>{title}</h3>
        <span style={{ fontSize: 11, color: "#8A96A8" }}>{sub}</span>
      </div>
      {children}
    </div>
  );
}

function ReasonsBlock({ cases, brandsInScope, reasonBrand, setReasonBrand }) {
  // (Brand selection is now handled by the top-level Brand filter — chips removed)

  // Aggregate
  const map = {};
  cases.forEach((d) => { map[d.reason] = (map[d.reason] || 0) + d.count; });
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, c]) => s + c, 0);

  // Donut SVG
  const cx = 80, cy = 80, r = 60, ir = 38;
  let angle = -Math.PI / 2;
  const paths = sorted.map(([reason, count]) => {
    const frac = count / total, sweep = frac * 2 * Math.PI, end = angle + sweep;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(end),   y2 = cy + r * Math.sin(end);
    const xi1 = cx + ir * Math.cos(angle), yi1 = cy + ir * Math.sin(angle);
    const xi2 = cx + ir * Math.cos(end),   yi2 = cy + ir * Math.sin(end);
    const lg = sweep > Math.PI ? 1 : 0;
    const d = `M${xi1},${yi1} L${x1},${y1} A${r},${r} 0 ${lg} 1 ${x2},${y2} L${xi2},${yi2} A${ir},${ir} 0 ${lg} 0 ${xi1},${yi1} Z`;
    const col = REASON_COLORS[reason] || "#94A3B8";
    angle = end;
    return { d, col, reason };
  });

  const maxC = sorted[0]?.[1] || 1;

  return (
    <div>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <svg width={160} height={160} style={{ flexShrink: 0 }}>
          {total === 0 ? (
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EEF1F7" strokeWidth={22}/>
          ) : (
            paths.map((p, i) => (
              <path key={i} d={p.d} fill={p.col} stroke="#fff" strokeWidth={1.5}/>
            ))
          )}
          <text x={cx} y={cy - 4} textAnchor="middle" fontFamily="Nunito, sans-serif"
            fontSize={16} fontWeight={900} fill="#1C2233">{total.toLocaleString()}</text>
          <text x={cx} y={cy + 11} textAnchor="middle" fontFamily="Nunito Sans, sans-serif"
            fontSize={9} fill="#8A96A8">CASES</text>
        </svg>

        <div style={{ flex: 1, minWidth: 0, maxHeight: 200, overflowY: "auto" }}>
          {sorted.length === 0 && (
            <div style={{ fontSize: 12, color: "#8A96A8", textAlign: "center", padding: 20 }}>
              No cases matching current filters
            </div>
          )}
          {sorted.map(([reason, count]) => {
            const w = Math.round(count / maxC * 100);
            const pct = Math.round(count / total * 100);
            const col = REASON_COLORS[reason] || "#94A3B8";
            return (
              <div key={reason} style={{ display: "grid",
                gridTemplateColumns: "minmax(0,1fr) 50px 35px 32px",
                gap: 6, alignItems: "center", padding: "3px 0", fontSize: 11 }}>
                <div style={{ fontWeight: 600, color: "#4A5568", whiteSpace: "nowrap",
                  overflow: "hidden", textOverflow: "ellipsis" }} title={reason}>{reason}</div>
                <div style={{ height: 6, background: "#F4F6FA", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${w}%`, height: "100%", background: col, borderRadius: 3 }}/>
                </div>
                <div style={{ fontWeight: 800, fontFamily: "'Nunito', sans-serif", textAlign: "right" }}>{count}</div>
                <div style={{ fontSize: 10, color: "#8A96A8", textAlign: "right" }}>{pct}%</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatusBars({ status, brands }) {
  const brandMap = {};
  status.forEach((d) => {
    if (!brandMap[d.brand]) brandMap[d.brand] = { solved: 0, comments: 0, open: 0 };
    if (d.Status === "Solved")            brandMap[d.brand].solved   += d.count;
    else if (d.Status === "Has comments") brandMap[d.brand].comments += d.count;
    else if (d.Status === "Open")         brandMap[d.brand].open     += d.count;
  });

  // sort by total volume
  const sorted = [...brands].map((b) => {
    const bd = brandMap[b.name] || { solved: 0, comments: 0, open: 0 };
    const total = bd.solved + bd.comments + bd.open;
    return { ...b, ...bd, total };
  }).sort((a, b) => b.total - a.total);

  return (
    <div style={{ maxHeight: 260, overflowY: "auto" }}>
      {sorted.map((b) => {
        if (b.total === 0) {
          return (
            <div key={b.name} style={statusRow}>
              <div style={statusLabel}>{b.name}</div>
              <div style={statusBarOuter}>
                <div style={{ width: "100%", height: "100%", background: "#EEF1F7", borderRadius: 6 }}/>
              </div>
              <div style={{ ...statusTotal, color: "#8A96A8" }}>0</div>
            </div>
          );
        }
        const sv = Math.round(b.solved / b.total * 100);
        const cv = Math.round(b.comments / b.total * 100);
        const ov = 100 - sv - cv;
        return (
          <div key={b.name} style={statusRow}>
            <div style={statusLabel}>{b.name}</div>
            <div style={statusBarOuter}>
              {sv > 0 && <div style={{ ...statusSeg, width: `${sv}%`, background: "#1E8C4A" }}>{sv > 18 ? sv + "%" : ""}</div>}
              {cv > 0 && <div style={{ ...statusSeg, width: `${cv}%`, background: "#D46B08" }}>{cv > 12 ? cv + "%" : ""}</div>}
              {ov > 0 && <div style={{ ...statusSeg, width: `${ov}%`, background: "#D02B27" }}>{ov > 12 ? ov + "%" : ""}</div>}
            </div>
            <div style={statusTotal}>{b.total}</div>
          </div>
        );
      })}
    </div>
  );
}

function PlatformBlocks({ cases }) {
  const mp = { shopee: 0, tiktok: 0, lazada: 0 };
  cases.forEach((d) => { if (mp[d.platform] !== undefined) mp[d.platform] += d.count; });
  const total = mp.shopee + mp.tiktok + mp.lazada || 1;
  const blocks = [
    { key: "shopee", label: "Shopee", val: mp.shopee },
    { key: "tiktok", label: "TikTok", val: mp.tiktok },
    { key: "lazada", label: "Lazada", val: mp.lazada },
  ];
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {blocks.map((b) => {
        const c = PLATFORM_C[b.key];
        return (
          <div key={b.key} style={{
            flex: 1, padding: "12px 10px", borderRadius: 9, background: c.bg,
            textAlign: "center",
          }}>
            <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: 20,
              fontWeight: 900, color: c.color }}>{b.val.toLocaleString()}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: c.color,
              textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>
              {b.label}
            </div>
            <div style={{ fontSize: 10, color: c.color, opacity: 0.7, marginTop: 1 }}>
              {Math.round(b.val / total * 100)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlatformMonthBars({ platformTotals, months, monthLabels }) {
  if (!platformTotals || platformTotals.length === 0) {
    return <div style={{ fontSize: 11, color: "#8A96A8" }}>No data</div>;
  }
  const max = Math.max(...platformTotals.flatMap((p) => months.map((m) => p[m] || 0)));
  const monthColors = { apr: "#D02B27", may: "#1A6FC4", jun: "#1E8C4A", jul: "#D46B08" };
  return platformTotals.map((p) => (
    <div key={p.name} style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "1px 8px", borderRadius: 4,
          background: PLATFORM_C[p.key]?.bg, color: PLATFORM_C[p.key]?.color,
          fontFamily: "'Nunito', sans-serif",
        }}>{p.name}</span>
        <span style={{ fontSize: 10, color: "#8A96A8", fontWeight: 600 }}>
          {months.map((m) => (p[m] || 0).toLocaleString()).join(" / ")}
        </span>
      </div>
      {months.map((m) => {
        const w = max > 0 ? Math.round((p[m] || 0) / max * 100) : 0;
        return (
          <div key={m} style={mcBarRow}>
            <span style={{ ...mcLabel, color: monthColors[m] || "#1C2233" }}>{(monthLabels[m] || m).slice(0, 3)}</span>
            <div style={mcTrack}>
              <div style={{ width: `${w}%`, height: "100%",
                background: monthColors[m] || "#1C2233", opacity: 0.85, borderRadius: 3 }}/>
            </div>
            <span style={mcVal}>{p[m] || 0}</span>
          </div>
        );
      })}
    </div>
  ));
}

function BrandMonthBars({ brands, months, monthLabels }) {
  const monthColors = { apr: "#D02B27", may: "#1A6FC4", jun: "#1E8C4A", jul: "#D46B08" };
  const maxC = Math.max(1, ...brands.flatMap((b) => months.map((m) => b[`${m}C`] || 0)));
  return (
    <div style={{ maxHeight: 320, overflowY: "auto", paddingRight: 4 }}>
      {brands.map((b) => (
        <div key={b.name} style={{
          padding: "8px 0", borderBottom: "1px solid #EEF1F7",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between",
            marginBottom: 4, fontSize: 11, fontWeight: 700 }}>
            <span style={{ fontFamily: "'Nunito', sans-serif" }}>{b.name}</span>
            <span style={{ fontSize: 10, color: "#8A96A8", fontWeight: 600 }}>
              {months.map((m) => (b[`${m}C`] || 0).toLocaleString()).join(" / ")}
            </span>
          </div>
          {months.map((m) => {
            const v = b[`${m}C`] || 0;
            const w = Math.round(v / maxC * 100);
            return (
              <div key={m} style={mcBarRow}>
                <span style={{ ...mcLabel, color: monthColors[m] || "#1C2233" }}>{(monthLabels[m] || m).slice(0, 3)}</span>
                <div style={mcTrack}>
                  <div style={{ width: `${w}%`, height: "100%",
                    background: monthColors[m] || "#1C2233", opacity: 0.85, borderRadius: 3 }}/>
                </div>
                <span style={mcVal}>{v}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ChatTable({ rows, totalChats }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #E4E8F0" }}>
            <th style={th}>Brand</th>
            <th style={th}>Platform</th>
            <th style={th}>Chats</th>
            <th style={th}>Share</th>
            <th style={th}>Response Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={5} style={{ textAlign: "center", padding: 20, color: "#8A96A8" }}>No data</td></tr>
          )}
          {rows.map((c, i) => {
            const pct = totalChats > 0 ? Math.round(c.chats / totalChats * 100) : 0;
            const rt = c.rt === 0 ? "< 1 min" : (c.rt || 0) + " min";
            const rtColor = (c.rt || 0) <= 5 ? "#1E8C4A" : (c.rt || 0) <= 10 ? "#D46B08" : "#D02B27";
            const rtBg = (c.rt || 0) <= 5 ? "#EBF7F0" : (c.rt || 0) <= 10 ? "#FFF7E6" : "#FFF0EF";
            return (
              <tr key={c.brand + c.platform} style={{ borderBottom: "1px solid #EEF1F7" }}>
                <td style={td}>{c.brand}</td>
                <td style={td}>
                  <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                    background: PLATFORM_C[c.platform]?.bg, color: PLATFORM_C[c.platform]?.color,
                    fontFamily: "'Nunito', sans-serif" }}>
                    {c.platform}
                  </span>
                </td>
                <td style={{ ...td, fontWeight: 800, fontFamily: "'Nunito', sans-serif" }}>{c.chats.toLocaleString()}</td>
                <td style={td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1, height: 6, background: "#F4F6FA", borderRadius: 3, maxWidth: 100 }}>
                      <div style={{ width: `${Math.min(pct * 4, 100)}%`, height: "100%", background: "#D02B27", borderRadius: 3 }}/>
                    </div>
                    <span style={{ fontSize: 10, color: "#8A96A8", fontWeight: 700, minWidth: 26 }}>{pct}%</span>
                  </div>
                </td>
                <td style={td}>
                  <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10,
                    fontWeight: 700, background: rtBg, color: rtColor,
                    fontFamily: "'Nunito', sans-serif" }}>
                    {rt}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BrandTable({ brands, months, monthLabels }) {
  const monthColors = { apr: "#D02B27", may: "#1A6FC4", jun: "#1E8C4A", jul: "#D46B08" };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #E4E8F0", background: "#F8F9FC" }}>
            <th style={{ ...th, textAlign: "left", paddingLeft: 12 }}>Brand</th>
            {months.map((m) => <th key={`o${m}`} style={th}>{monthLabels[m] || m} Orders</th>)}
            <th style={th}>Period Total</th>
            {months.map((m) => <th key={`c${m}`} style={th}>{monthLabels[m] || m} Chats</th>)}
            <th style={th}>Cases</th>
            <th style={th}>Solved</th>
            <th style={th}>Open</th>
            <th style={th}>Case Rate</th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {brands.map((b) => {
            const sv = b.cases > 0 ? Math.round(b.solved / b.cases * 100) : 0;
            const cv = b.cases > 0 ? Math.round((b.comments || 0) / b.cases * 100) : 0;
            const ov = b.cases > 0 ? Math.round(b.open / b.cases * 100) : 0;
            const cr = b.q2 > 0 ? (b.cases / b.q2 * 100).toFixed(2) : "0.00";
            const crNum = parseFloat(cr);
            const rateBg = crNum < 0.5 ? "#EBF7F0" : crNum < 1.5 ? "#FFF7E6" : "#FFF0EF";
            const rateCol = crNum < 0.5 ? "#1E8C4A" : crNum < 1.5 ? "#D46B08" : "#D02B27";
            return (
              <tr key={b.name} style={{ borderBottom: "1px solid #EEF1F7" }}>
                <td style={{ ...td, textAlign: "left", paddingLeft: 12, fontWeight: 800, fontFamily: "'Nunito', sans-serif" }}>{b.name}</td>
                {months.map((m) => (
                  <td key={`o${m}`} style={td}>
                    <span style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 700 }}>
                      {(b[`${m}O`] || 0).toLocaleString()}
                    </span>
                  </td>
                ))}
                <td style={td}>
                  <span style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800 }}>
                    {(b.q2 || 0).toLocaleString()}
                  </span>
                </td>
                {months.map((m) => (
                  <td key={`c${m}`} style={td}>
                    <span style={{ color: monthColors[m] || "#1C2233", fontWeight: 700, fontFamily: "'Nunito', sans-serif" }}>
                      {(b[`${m}C`] || 0).toLocaleString()}
                    </span>
                  </td>
                ))}
                <td style={td}>
                  <span style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 700 }}>{b.cases}</span>
                </td>
                <td style={td}>
                  <span style={{ fontWeight: 800, color: "#1E8C4A", fontFamily: "'Nunito', sans-serif" }}>{b.solved}</span>
                </td>
                <td style={td}>
                  <span style={{ fontWeight: 800, color: "#D02B27", fontFamily: "'Nunito', sans-serif" }}>{b.open}</span>
                </td>
                <td style={td}>
                  <span style={{ padding: "3px 9px", borderRadius: 5, fontSize: 11,
                    fontWeight: 800, background: rateBg, color: rateCol,
                    fontFamily: "'Nunito', sans-serif" }}>{cr}%</span>
                </td>
                <td style={td}>
                  <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden",
                    background: "#EEF1F7", minWidth: 100 }}>
                    {sv > 0 && <div style={{ width: `${sv}%`, background: "#1E8C4A" }}/>}
                    {cv > 0 && <div style={{ width: `${cv}%`, background: "#D46B08" }}/>}
                    {ov > 0 && <div style={{ width: `${ov}%`, background: "#D02B27" }}/>}
                  </div>
                  <div style={{ fontSize: 9, color: "#8A96A8", marginTop: 3, fontFamily: "'Nunito', sans-serif", fontWeight: 700 }}>
                    ✓{sv}% ··{cv}% ✗{ov}%
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Format an ISO timestamp as "5 min ago" / "2 h ago" / "yesterday" ──────
function formatRelativeTime(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0 || isNaN(ms)) return "";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Merge Monday-synced data into the existing CS analytics shape ──────────
// Monday provides: brands (case counts only), cases, status, platformTotals (case counts).
// Legacy JSON import provides: orders (aprO/mayO/q2), chat volumes (chat object).
// We merge so Monday data updates case-related fields without wiping chat/order data.
function mergeMondayInto(existing, monday) {
  if (!monday || !monday.brands) return existing;

  const out = { ...existing };

  if (monday.period) out.period = monday.period;
  if (monday.months && monday.months.length) {
    const set = new Set([...(out.months || []), ...monday.months]);
    out.months = Array.from(set);
  }
  out.monthLabels = { ...(out.monthLabels || {}), ...(monday.monthLabels || {}) };

  const existingBrandMap = new Map((out.brands || []).map(b => [b.name, b]));
  const mergedBrands = monday.brands.map(mb => {
    const eb = existingBrandMap.get(mb.name) || {};
    return {
      ...eb,
      name: mb.name,
      group: mb.group || eb.group || "Other",
      cases: mb.cases,
      solved: mb.solved,
      open: mb.open,
      comments: mb.comments != null ? mb.comments : (eb.comments || 0),
    };
  });
  for (const eb of (out.brands || [])) {
    if (!monday.brands.find(mb => mb.name === eb.name)) mergedBrands.push(eb);
  }
  out.brands = mergedBrands;

  if (monday.cases) out.cases = monday.cases;
  if (monday.status) out.status = monday.status;

  if (monday.platformTotals && monday.platformTotals.length) {
    const ptMap = new Map((out.platformTotals || []).map(p => [p.key, p]));
    for (const mp of monday.platformTotals) {
      ptMap.set(mp.key, { ...ptMap.get(mp.key), ...mp });
    }
    out.platformTotals = Array.from(ptMap.values());
  }

  return out;
}

function ImportModal({ text, setText, err, onCancel, onImport }) {
  return (
    <div style={modalOverlay} onClick={onCancel}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontFamily: "'Nunito', sans-serif", fontSize: 16, fontWeight: 800, color: "#1C2233" }}>
            Import CS Analytics Data
          </h3>
          <button onClick={onCancel} style={closeBtn}>×</button>
        </div>
        <div style={{ fontSize: 12, color: "#4A5568", marginBottom: 12, lineHeight: 1.5 }}>
          Paste a JSON object below. Required fields: <code>brands</code> (array),
          <code> cases</code> (array), <code>status</code> (array), <code>chat</code> (object),
          <code> months</code>, <code>monthLabels</code>, <code>period</code>, <code>platformTotals</code>.
          A sample JSON template can be found in the project's <code>tools/sample-cs-data.json</code>.
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{"period":"Q2 2026","months":["apr","may"], ...}'
          style={textareaStyle}
        />
        {err && (
          <div style={{ fontSize: 12, color: "#D02B27", fontWeight: 700, marginTop: 8 }}>{err}</div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button onClick={onCancel} style={secondaryBtn}>Cancel</button>
          <button onClick={onImport} style={primaryBtn}>Import</button>
        </div>
      </div>
    </div>
  );
}

function solvedRate(status) {
  const total = status.reduce((s, d) => s + d.count, 0);
  const solved = status.filter((d) => d.Status === "Solved").reduce((s, d) => s + d.count, 0);
  return total > 0 ? Math.round(solved / total * 100) : 0;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const filterBarStyle = {
  background: "#fff", borderBottom: "1.5px solid #E4E8F0",
  padding: "10px 28px", display: "flex", alignItems: "center", gap: 8,
  flexWrap: "wrap", boxShadow: "0 1px 4px rgba(28,34,51,0.04)",
};
const gfLabelStyle = {
  fontSize: 10, fontWeight: 800, letterSpacing: 1.5,
  textTransform: "uppercase", color: "#8A96A8",
  fontFamily: "'Nunito', sans-serif", whiteSpace: "nowrap",
};
const sepStyle = { width: 1, height: 22, background: "#E4E8F0", margin: "0 4px" };
const kpiGrid = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14, marginBottom: 18,
};
const threeColGrid = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16, marginBottom: 16,
};
const statusRow = {
  display: "grid", gridTemplateColumns: "minmax(0, 1fr) 2fr 45px",
  gap: 10, alignItems: "center", padding: "6px 0",
};
const statusLabel = {
  fontSize: 11, fontWeight: 700, color: "#4A5568", whiteSpace: "nowrap",
  overflow: "hidden", textOverflow: "ellipsis",
};
const statusBarOuter = {
  display: "flex", height: 22, borderRadius: 6, overflow: "hidden",
  background: "#EEF1F7",
};
const statusSeg = {
  height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
  color: "#fff", fontSize: 9, fontWeight: 800, fontFamily: "'Nunito', sans-serif",
};
const statusTotal = {
  fontFamily: "'Nunito', sans-serif", fontSize: 13, fontWeight: 800,
  color: "#1C2233", textAlign: "right",
};
const mcBarRow = { display: "flex", alignItems: "center", gap: 6, fontSize: 10, padding: "1px 0" };
const mcLabel = { fontWeight: 800, width: 24, fontFamily: "'Nunito', sans-serif" };
const mcTrack = { flex: 1, height: 8, background: "#F4F6FA", borderRadius: 3, overflow: "hidden" };
const mcVal = { width: 38, textAlign: "right", fontWeight: 700, color: "#4A5568", fontFamily: "'Nunito', sans-serif" };

const th = {
  padding: "10px 8px", fontSize: 10, fontWeight: 800, color: "#8A96A8",
  letterSpacing: 1, textTransform: "uppercase", fontFamily: "'Nunito', sans-serif",
  textAlign: "center", whiteSpace: "nowrap",
};
const td = { padding: "8px 6px", textAlign: "center", fontSize: 12, color: "#1C2233" };

const loadingStyle = {
  padding: 40, textAlign: "center", color: "#8A96A8", fontSize: 13,
  fontFamily: "'Nunito Sans', sans-serif",
};
const emptyCardStyle = {
  maxWidth: 480, margin: "60px auto", padding: 24, background: "#fff",
  border: "1.5px solid #E4E8F0", borderRadius: 14, textAlign: "center",
  boxShadow: "0 2px 12px rgba(28,34,51,0.07)",
};
const dateRangeBarStyle = {
  background: "#FAFBFC", borderBottom: "1.5px solid #E4E8F0",
  padding: "8px 28px", display: "flex", alignItems: "center", gap: 8,
  flexWrap: "wrap",
};
const dateInputStyle = {
  padding: "5px 10px", borderRadius: 6, border: "1.5px solid #E4E8F0",
  background: "#fff", color: "#1C2233", fontSize: 12, fontWeight: 600,
  fontFamily: "'Nunito', sans-serif", outline: "none",
};
const brandSelectStyle = {
  padding: "6px 10px", borderRadius: 6, border: "1.5px solid #E4E8F0",
  background: "#fff", color: "#1C2233", fontSize: 12, fontWeight: 600,
  fontFamily: "'Nunito', sans-serif", cursor: "pointer", outline: "none",
  maxWidth: 220, minWidth: 120,
};
const primaryBtn = {
  padding: "10px 18px", borderRadius: 9, border: "none",
  background: "#D02B27", color: "#fff", fontSize: 13, fontWeight: 700,
  fontFamily: "'Nunito', sans-serif", cursor: "pointer",
};
const secondaryBtn = {
  padding: "10px 18px", borderRadius: 9, border: "1.5px solid #E4E8F0",
  background: "#fff", color: "#4A5568", fontSize: 13, fontWeight: 700,
  fontFamily: "'Nunito', sans-serif", cursor: "pointer",
};
const smallBtn = {
  padding: "6px 14px", borderRadius: 9, border: "1.5px solid #D02B27",
  background: "#FFF0EF", color: "#D02B27", fontSize: 12, fontWeight: 700,
  fontFamily: "'Nunito', sans-serif", cursor: "pointer", marginLeft: 8,
};
const modalOverlay = {
  position: "fixed", inset: 0, background: "rgba(28,34,51,0.5)",
  zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
  padding: 20,
};
const modalCard = {
  background: "#fff", borderRadius: 14, padding: 24, maxWidth: 600, width: "100%",
  maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
};
const closeBtn = {
  background: "none", border: "none", fontSize: 24, color: "#8A96A8",
  cursor: "pointer", padding: 0, lineHeight: 1,
};
const textareaStyle = {
  width: "100%", minHeight: 220, padding: 12, borderRadius: 8,
  border: "1.5px solid #E4E8F0", background: "#F8F9FC", color: "#1C2233",
  fontFamily: "ui-monospace, monospace", fontSize: 11, lineHeight: 1.5,
  resize: "vertical", outline: "none", boxSizing: "border-box",
};
