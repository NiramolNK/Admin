/**
 * DailyCount.jsx — the "Daily Count" tab.
 *
 * Tap counters for the platforms that are neither in Duoke (Shopee, Lazada,
 * Tiktok) nor already in the Service Desk (Email, Webchat). In practice that
 * means Amaze, Call CC, Line MyShop and Brand.com — about 11 brand-platform
 * pairs across the whole team.
 *
 * Mounted from AllocationRoster2026.jsx as the `daily` tab. Props:
 *   role            "manager" | "fulltime" | anything else (agent)
 *   myAgentId       nirm-agents id of the signed-in user, or null
 *   agents, brands  the arrays the roster already holds
 *   getShift        (agentId, "YYYY-MM-DD") => "M"|"ME"|"E"|"OT"|"Off"|"RO"|""
 *   getAgentBrands  (agentId, "YYYY-MM-DD") => ["b01", ...]  (brand ids)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as DC from "./dailyTally";

const WORKED = new Set(["M", "ME", "E", "OT"]);

/* NiRM chrome (teal) for controls; the validated blue ramp for data marks. */
const T = {
  ink: "#0F172A", ink2: "#475569", ink3: "#94A3B8",
  line: "#E2E8F0", card: "#FFFFFF", teal: "#0D9488", tealBg: "#F0FDFA",
  blue: "#2A78D6", red: "#B91C1C", amber: "#92400E",
};
const RAMP = ["#CDE2FB", "#B7D3F6", "#9EC5F4", "#6DA7EC", "#3987E5", "#1C5CAB", "#104281"];

const S = {
  card: { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18, marginBottom: 16 },
  h2: { margin: "0 0 2px", fontSize: 15, fontWeight: 700, color: T.ink },
  sub: { margin: "0 0 14px", color: T.ink2, fontSize: 12.5 },
  row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  between: { display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" },
  tap: { display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 10, alignItems: "center",
    padding: "11px 12px", border: `1px solid ${T.line}`, borderRadius: 10, marginBottom: 8 },
  count: { fontSize: 26, fontWeight: 700, minWidth: 56, textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.ink },
  plus: { border: "none", borderRadius: 10, background: T.teal, color: "#fff", fontFamily: "inherit",
    fontWeight: 700, fontSize: 16, padding: "12px 26px", cursor: "pointer" },
  minus: { border: `1px solid ${T.line}`, background: "#fff", borderRadius: 8, width: 34, height: 34,
    fontSize: 17, color: T.ink2, cursor: "pointer", fontFamily: "inherit" },
  primary: { border: "none", borderRadius: 10, background: T.ink, color: "#fff", fontFamily: "inherit",
    fontWeight: 700, padding: "11px 20px", cursor: "pointer", fontSize: 13 },
  ghost: { border: `1px solid ${T.line}`, background: "#fff", borderRadius: 9, fontFamily: "inherit",
    padding: "9px 14px", cursor: "pointer", fontSize: 13, color: T.ink },
  input: { fontFamily: "inherit", fontSize: 13, padding: "7px 9px", border: `1px solid ${T.line}`, borderRadius: 8 },
  th: { textAlign: "left", padding: "9px 10px", borderBottom: `1px solid ${T.line}`, fontSize: 11,
    textTransform: "uppercase", letterSpacing: ".05em", color: T.ink3, fontWeight: 700 },
  td: { textAlign: "left", padding: "9px 10px", borderBottom: `1px solid ${T.line}`, fontSize: 13 },
  note: { fontSize: 12, color: T.ink2, background: "#F8FAFC", borderRadius: 8, padding: "10px 12px", marginTop: 12 },
};
const pill = (bg, fg) => ({ display: "inline-flex", fontSize: 10, fontWeight: 700, letterSpacing: ".04em",
  textTransform: "uppercase", padding: "3px 7px", borderRadius: 999, background: bg, color: fg });
const chip = (bg, fg) => ({ display: "inline-flex", fontSize: 11.5, fontWeight: 600, padding: "3px 9px",
  borderRadius: 999, background: bg, color: fg });
const PILL = { tap: pill("#E9F1FD", "#1C4F8F"), auto: pill("#ECFDF5", "#065F46") };
const CHIP = { ended: chip("#ECFDF5", "#065F46"), open: chip("#FEF3C7", "#92400E"), missing: chip("#FEE2E2", "#B91C1C") };
const LABEL = { ended: "✓ Ended", open: "⚠ Not ended", missing: "✕ Missing" };

const addDays = (iso, n) =>
  new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

function useAsync(fn, deps) {
  const [st, setSt] = useState({ loading: true, data: null, error: null });
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const run = useCallback(() => {
    setSt((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve().then(fn)
      .then((data) => { if (alive.current) setSt({ loading: false, data, error: null }); })
      .catch((error) => { if (alive.current) setSt({ loading: false, data: null, error }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(run, [run]);
  return { ...st, reload: run };
}

function Msg({ m }) {
  if (!m) return null;
  return (
    <div style={{ ...S.note, marginTop: 12,
      background: m.bad ? "#FEE2E2" : "#ECFDF5", color: m.bad ? "#991B1B" : "#065F46" }}>
      {m.bad ? "⚠ " : "✓ "}{m.text}
    </div>
  );
}

/* ═══════════════════════════ Agent — My Shift ═══════════════════════════ */
function MyShift({ myAgentId, agents, brands, getShift, getAgentBrands }) {
  const [date, setDate] = useState(DC.bkkToday());
  const [tick, setTick] = useState(0);
  const [msg, setMsg] = useState(null);
  const [recallOpen, setRecallOpen] = useState(false);
  const [recallVals, setRecallVals] = useState({});

  /* tick only forces a re-render when the tap buffer changes; the numbers are
     read from DC.pendingFor() during render */
  useEffect(() => DC.onBufferChange(() => setTick((t) => t + 1)), []);
  void tick;

  const shift = getShift ? getShift(myAgentId, date) : "";
  const worked = WORKED.has(shift);
  const editable = DC.withinEditWindow(date);
  const brandById = useMemo(
    () => Object.fromEntries((brands || []).map((b) => [b.id, b])), [brands]);
  const me = useMemo(
    () => (agents || []).find((a) => a.id === myAgentId), [agents, myAgentId]);

  const rows = useMemo(() => {
    if (!worked || !myAgentId) return [];
    const ids = getAgentBrands ? (getAgentBrands(myAgentId, date) || []) : [];
    const out = [];
    for (const bid of ids) {
      const b = brandById[bid];
      if (!b) continue;
      for (const p of DC.tappablePlatforms(b)) {
        out.push({ brand_id: bid, brand_name: b.name || bid, platform: p });
      }
    }
    return out;
  }, [worked, myAgentId, date, getAgentBrands, brandById]);

  const autoRows = useMemo(() => {
    if (!myAgentId) return [];
    const ids = getAgentBrands ? (getAgentBrands(myAgentId, date) || []) : [];
    const out = [];
    for (const bid of ids) {
      const b = brandById[bid]; if (!b) continue;
      for (const p of (b.platforms || [])) {
        if (DC.AUTO_PLATFORMS.has(p)) out.push(`${b.name || bid} · ${p}`);
      }
    }
    return out;
  }, [myAgentId, date, getAgentBrands, brandById]);

  const { data: counts, loading, error, reload } = useAsync(
    () => (worked && myAgentId
      ? DC.fetchShiftCounts({ work_date: date, shift, agent_id: myAgentId })
      : Promise.resolve({})),
    [date, shift, myAgentId, worked]);

  const board = useAsync(
    () => (myAgentId && worked
      ? DC.fetchShiftBoard({ work_date: date, shift }) : Promise.resolve([])),
    [date, shift, myAgentId, worked]);
  const mine = (board.data || []).find((r) => r.agent_id === myAgentId);

  const keyOf = (r) => DC.rowKey({
    work_date: date, shift, agent_id: myAgentId, brand_id: r.brand_id, platform: r.platform });
  const valueOf = (r) => {
    const k = keyOf(r);
    return ((counts && counts[k]) || 0) + DC.pendingFor(k);
  };
  const total = rows.reduce((a, r) => a + valueOf(r), 0);
  const unsaved = DC.pendingCount();

  const doTap = (r, delta) => {
    if (!editable) return setMsg({ bad: true, text: "This day is closed. Ask a manager to reopen it." });
    try {
      DC.tap({ work_date: date, shift, agent_id: myAgentId,
        brand_id: r.brand_id, platform: r.platform, delta });
      setMsg(null);
    } catch (e) { setMsg({ bad: true, text: e.message }); }
  };

  const doEnd = async () => {
    try {
      const t = await DC.endShift({ work_date: date, shift, agent_id: myAgentId });
      setMsg({ text: `Shift ended — ${t} confirmed for ${date} shift ${shift}. Editable until end of tomorrow.` });
      reload(); board.reload();
    } catch (e) { setMsg({ bad: true, text: (e && e.message) || String(e) }); }
  };

  const doRecall = async () => {
    try {
      const entries = rows
        .filter((r) => recallVals[keyOf(r)] !== undefined && recallVals[keyOf(r)] !== "")
        .map((r) => ({ brand_id: r.brand_id, platform: r.platform, count: recallVals[keyOf(r)] }));
      if (!entries.length) return setMsg({ bad: true, text: "Type at least one number first." });
      const n = await DC.recallShift({ work_date: date, shift, agent_id: myAgentId, entries });
      setMsg({ text: `Saved ${n} line${n === 1 ? "" : "s"} as recalled — flagged so we know it was remembered, not tapped.` });
      setRecallOpen(false); setRecallVals({}); reload();
    } catch (e) { setMsg({ bad: true, text: (e && e.message) || String(e) }); }
  };

  return (
    <div>
      <div style={S.card}>
        <div style={S.between}>
          <div>
            <h2 style={S.h2}>My Shift — {date}{shift ? ` · shift ${shift}` : ""}</h2>
            <p style={S.sub}>
              {me ? `${me.name} (${me.id})` : (myAgentId || "no agent linked to this login")}
              {" · tap as you go, don't save it for the end"}
            </p>
          </div>
          <div style={S.row}>
            <button style={S.ghost} onClick={() => setDate(addDays(date, -1))}>&larr; prev</button>
            <button style={S.ghost} disabled={date >= DC.bkkToday()}
              onClick={() => setDate(addDays(date, 1))}>next &rarr;</button>
          </div>
        </div>

        {!myAgentId && (
          <div style={{ ...S.note, background: "#FEE2E2", color: "#991B1B" }}>
            This login is not linked to an agent record, so there is nothing to count.
            A manager needs to set the agent&apos;s email to your login email.
          </div>
        )}

        {myAgentId && !worked && (
          <div style={S.note}>
            The roster has you as <strong>{shift || "not scheduled"}</strong> on {date} —
            nothing to count. Days off and requested-off days are neither paid nor counted.
          </div>
        )}

        {myAgentId && worked && (
          <>
            {loading && <p style={S.sub}>Loading your counts…</p>}
            {error && (
              <div style={{ ...S.note, background: "#FEE2E2", color: "#991B1B" }}>
                Could not read your counts: {(error && error.message) || String(error)}.
                Taps are still held locally — don&apos;t retype them.
              </div>
            )}

            {rows.length === 0 && (
              <div style={S.note}>
                No brand with a tapped platform is allocated to you on {date}. Amaze, Call CC,
                Line MyShop and Brand.com are the only tapped platforms — Shopee, Lazada and
                Tiktok come from Duoke.
              </div>
            )}

            {rows.map((r) => {
              const k = keyOf(r);
              return (
                <div key={k} style={S.tap}>
                  <div>
                    <div style={{ fontWeight: 600, color: T.ink }}>
                      {r.brand_name} &middot; {r.platform} <span style={PILL.tap}>tap</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 1 }}>
                      {DC.PLATFORM_HELP[r.platform] || "One tap = one customer you replied to."}
                    </div>
                    {recallOpen && (
                      <input style={{ ...S.input, width: 90, textAlign: "right", marginTop: 6 }}
                        type="number" min="0" placeholder="actual"
                        value={recallVals[k] === undefined ? "" : recallVals[k]}
                        onChange={(e) => setRecallVals((v) => ({ ...v, [k]: e.target.value }))} />
                    )}
                  </div>
                  <div style={S.count}>{valueOf(r)}</div>
                  <button style={S.minus} title="correction (-1)" disabled={!editable}
                    onClick={() => doTap(r, -1)}>&minus;</button>
                  <button style={{ ...S.plus, opacity: editable ? 1 : 0.4 }} disabled={!editable}
                    onClick={() => doTap(r, 1)}>+1</button>
                </div>
              );
            })}

            {autoRows.length > 0 && (
              <div style={{ ...S.tap, background: "#F8FAFC" }}>
                <div>
                  <div style={{ fontWeight: 600, color: T.ink }}>
                    {autoRows.join(", ")} <span style={PILL.auto}>auto</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 1 }}>
                    counted from the Service Desk — no importer written yet, so this shows
                    nothing rather than a number that isn&apos;t real
                  </div>
                </div>
                <div style={{ ...S.count, color: T.ink3 }}>&ndash;</div><div /><div />
              </div>
            )}

            <div style={{ ...S.between, marginTop: 14 }}>
              <span style={{ fontSize: 12.5, color: T.ink2 }}>
                <strong>{total}</strong> tapped this shift
                {unsaved > 0 && <span style={{ color: T.amber }}> &middot; {unsaved} not saved yet</span>}
                {mine && mine.submitted_at &&
                  <span> &middot; ended {new Date(mine.submitted_at).toLocaleTimeString()}</span>}
                {!editable && <span> &middot; this day is closed</span>}
              </span>
              <div style={S.row}>
                <button style={S.ghost} onClick={() => setRecallOpen((v) => !v)}>
                  {recallOpen ? "Cancel" : "Forgot to tap? Enter actual"}
                </button>
                {recallOpen
                  ? <button style={S.primary} onClick={doRecall}>Save actual</button>
                  : <button style={{ ...S.primary, opacity: editable ? 1 : 0.4 }}
                      disabled={!editable} onClick={doEnd}>
                      {mine && mine.submitted_at ? "Re-confirm shift" : "End shift"}
                    </button>}
              </div>
            </div>
            <Msg m={msg} />
          </>
        )}
      </div>
      {myAgentId && <MyWeek agentId={myAgentId} date={date} />}
    </div>
  );
}

function MyWeek({ agentId, date }) {
  const from = addDays(date, -6);
  const { data, loading } = useAsync(
    () => DC.fetchMyRecent({ agent_id: agentId, from, to: date }), [agentId, from, date]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const max = Math.max(1, ...days.map((d) => (data && data[d]) || 0));
  return (
    <div style={S.card}>
      <h2 style={S.h2}>My last 7 days</h2>
      <p style={S.sub}>Touches per day — your own load, not a team total</p>
      {loading ? <p style={S.sub}>Loading…</p> : (
        <>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120,
            borderBottom: `1px solid ${T.line}` }}>
            {days.map((d) => {
              const v = (data && data[d]) || 0;
              return <div key={d} title={`${d} — ${v}`}
                style={{ flex: 1, height: Math.max(2, (v / max) * 112),
                  background: v ? T.blue : "#F1F5F9", borderRadius: "4px 4px 0 0" }} />;
            })}
          </div>
          <div style={{ display: "flex", gap: 3, marginTop: 5 }}>
            {days.map((d) => (
              <span key={d} style={{ flex: 1, textAlign: "center", fontSize: 10, color: T.ink3 }}>
                {d.slice(8)}/{d.slice(5, 7)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════ Supervisor — Shift Board ═══════════════════════ */
function ShiftBoard({ agents, role, getShift }) {
  const [date, setDate] = useState(DC.bkkToday());
  const [shift, setShift] = useState("M");
  const [msg, setMsg] = useState(null);
  const { data, loading, error, reload } = useAsync(
    () => DC.fetchShiftBoard({ work_date: date, shift }), [date, shift]);

  const nameOf = useMemo(() => {
    const m = Object.fromEntries((agents || []).map((a) => [a.id, a.name]));
    return (id) => (m[id] ? `${m[id]} (${id})` : id);
  }, [agents]);

  /* CRITICAL: an agent who tapped nothing AND never pressed End shift has no
   * row in daily_tally and none in shift_submission, so v_shift_status cannot
   * produce them — Missing would be unreachable from the view alone. The
   * expected list has to come from the roster and be merged in here. (Same
   * trap as the invoice tests, where every test row had an invoice so the
   * not-yet-submitted case never rendered.) */
  const rows = useMemo(() => {
    const seen = new Map();
    for (const r of data || []) seen.set(r.agent_id, r);
    if (getShift) {
      for (const a of agents || []) {
        if (a.active === false || seen.has(a.id)) continue;
        // T2 are the salaried full-timers. They do not run the part-time chat
        // tally, so a roster shift for them is not a missing count - it was
        // showing all six of them as Missing on every single shift. Anyone with
        // REAL recorded activity is untouched: rows from the view are seeded
        // above, so a T2 who does tap still appears.
        if ((a.team || "") === "T2") continue;
        if (getShift(a.id, date) !== shift) continue;
        seen.set(a.id, { work_date: date, shift, agent_id: a.id, tapped_total: 0,
          event_count: 0, confirmed_total: null, submitted_at: null, reopened_at: null,
          status: "missing", drifted: false, rostered: true });
      }
    }
    return [...seen.values()].sort((x, y) => String(x.agent_id).localeCompare(String(y.agent_id)));
  }, [data, agents, getShift, date, shift]);

  const outstanding = rows.filter((r) => r.status !== "ended").length;

  const doReopen = async (r) => {
    try {
      await DC.reopenShift({ work_date: r.work_date, shift: r.shift, agent_id: r.agent_id });
      setMsg({ text: `${nameOf(r.agent_id)} can edit ${r.work_date} shift ${r.shift} again.` });
      reload();
    } catch (e) { setMsg({ bad: true, text: (e && e.message) || String(e) }); }
  };

  return (
    <div style={S.card}>
      <div style={S.between}>
        <div>
          <h2 style={S.h2}>Shift Board</h2>
          <p style={S.sub}>Who hasn&apos;t ended their shift. A confirmed 0 is a real quiet shift.</p>
        </div>
        <div style={S.row}>
          <input style={S.input} type="date" value={date} max={DC.bkkToday()}
            onChange={(e) => setDate(e.target.value)} />
          <select style={S.input} value={shift} onChange={(e) => setShift(e.target.value)}>
            {["M", "ME", "E", "OT"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {rows.length > 0 && (
            <span style={outstanding ? CHIP.open : CHIP.ended}>
              {outstanding ? `⚠ ${outstanding} of ${rows.length} outstanding`
                           : `✓ all ${rows.length} ended`}
            </span>
          )}
        </div>
      </div>

      {loading && <p style={S.sub}>Loading…</p>}
      {error && <div style={{ ...S.note, background: "#FEE2E2", color: "#991B1B" }}>
        {(error && error.message) || String(error)}</div>}

      {!loading && rows.length === 0 && (
        <div style={S.note}>Nothing recorded and nobody rostered for {date} shift {shift}.</div>
      )}

      {rows.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={S.th}>Agent</th>
            <th style={{ ...S.th, textAlign: "right" }}>Tapped</th>
            <th style={{ ...S.th, textAlign: "right" }}>Confirmed</th>
            <th style={S.th}>Status</th>
            <th style={S.th}>Ended</th>
            {role === "manager" && <th style={S.th} />}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.agent_id}>
                <td style={{ ...S.td, fontWeight: 600 }}>
                  {nameOf(r.agent_id)}
                  {r.rostered && <span style={{ fontSize: 10.5, color: T.ink3 }}> from roster</span>}
                </td>
                <td style={{ ...S.td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {r.tapped_total}
                  {r.tapped_total === 0 && r.status === "ended" &&
                    <span style={{ color: T.ink3, fontSize: 11 }}> quiet</span>}
                </td>
                <td style={{ ...S.td, textAlign: "right", fontVariantNumeric: "tabular-nums",
                  color: r.drifted ? T.red : T.ink }}>
                  {r.confirmed_total === null || r.confirmed_total === undefined ? "—" : r.confirmed_total}
                  {r.drifted && <span title="edited after End shift"> ⚠</span>}
                </td>
                <td style={S.td}><span style={CHIP[r.status] || CHIP.missing}>
                  {LABEL[r.status] || r.status}</span></td>
                <td style={{ ...S.td, color: T.ink2 }}>
                  {r.submitted_at ? new Date(r.submitted_at).toLocaleTimeString() : "—"}
                </td>
                {role === "manager" && (
                  <td style={S.td}>
                    {!DC.withinEditWindow(r.work_date) && !r.reopened_at && (
                      <button style={S.ghost} onClick={() => doReopen(r)}>Reopen</button>
                    )}
                    {r.reopened_at && <span style={{ fontSize: 11.5, color: T.ink3 }}>reopened</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Msg m={msg} />
      <div style={S.note}>
        <strong>Ended</strong> nothing to do &middot; <strong>Not ended</strong> nudge them before
        they go home &middot; <strong>Missing</strong> no taps and no End shift — chase, or
        reopen it tomorrow. A red confirmed number means the shift was edited after it was ended.
      </div>
    </div>
  );
}

/* ═══════════════════════════ Manager — Volume ═══════════════════════════ */
function Volume({ brands }) {
  const [date, setDate] = useState(DC.bkkToday());
  const brandName = useMemo(
    () => Object.fromEntries((brands || []).map((b) => [b.id, b.name || b.id])), [brands]);

  const day = useAsync(() => DC.fetchBrandDay({ work_date: date }), [date]);
  const hourly = useAsync(() => DC.fetchHourly({ work_date: date }), [date]);

  const m = useMemo(() => {
    const rows = {}, cols = {}, cells = {};
    for (const r of day.data || []) {
      const n = Number(r.cnt || 0);
      rows[r.brand_id] = (rows[r.brand_id] || 0) + n;
      cols[r.platform] = (cols[r.platform] || 0) + n;
      cells[`${r.brand_id}|${r.platform}`] = (cells[`${r.brand_id}|${r.platform}`] || 0) + n;
    }
    return { rows, cols, cells };
  }, [day.data]);

  const hours = useMemo(() => {
    const by = {};
    for (const r of hourly.data || []) by[r.hour_bkk] = (by[r.hour_bkk] || 0) + Number(r.cnt || 0);
    const ks = Object.keys(by).map(Number).sort((a, b) => a - b);
    const lo = ks.length ? ks[0] : 9, hi = ks.length ? ks[ks.length - 1] : 21;
    return Array.from({ length: hi - lo + 1 }, (_, i) => ({ hour: lo + i, cnt: by[lo + i] || 0 }));
  }, [hourly.data]);

  const total = Object.values(m.rows).reduce((a, b) => a + b, 0);
  const maxCell = Math.max(1, ...Object.values(m.cells));
  const maxHour = Math.max(1, ...hours.map((h) => h.cnt));
  const bids = Object.keys(m.rows).sort((a, b) => m.rows[b] - m.rows[a]);
  const pfs = Object.keys(m.cols).sort((a, b) => m.cols[b] - m.cols[a]);
  const peak = hours.reduce((a, b) => (b.cnt > a.cnt ? b : a), { hour: 0, cnt: -1 });

  const tile = (lab, val) => (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: ".05em", color: T.ink3 }}>{lab}</div>
      <div style={{ fontSize: 29, fontWeight: 700, lineHeight: 1.1, color: T.ink }}>{val}</div>
    </div>
  );

  return (
    <div>
      <div style={S.card}>
        <div style={S.between}>
          <div>
            <h2 style={S.h2}>Volume — {date}</h2>
            <p style={S.sub}>Every number here is a SUM over the same append-only table.</p>
          </div>
          <input style={S.input} type="date" value={date} max={DC.bkkToday()}
            onChange={(e) => setDate(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          {tile("Touches", total)}
          {tile("Brands", bids.length)}
          {tile("Peak hour", total ? `${String(peak.hour).padStart(2, "0")}:00` : "—")}
        </div>
      </div>

      <div style={S.card}>
        <h2 style={S.h2}>Volume by hour</h2>
        <p style={S.sub}>When you need people, not just how many.</p>
        {hourly.loading ? <p style={S.sub}>Loading…</p> : total === 0 ? (
          <div style={S.note}>Nothing counted on {date} yet.</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 130,
              borderBottom: `1px solid ${T.line}` }}>
              {hours.map((h) => (
                <div key={h.hour} title={`${String(h.hour).padStart(2, "0")}:00 — ${h.cnt}`}
                  style={{ flex: 1, height: Math.max(2, (h.cnt / maxHour) * 122),
                    background: T.blue, borderRadius: "4px 4px 0 0" }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 2, marginTop: 5 }}>
              {hours.map((h) => (
                <span key={h.hour} style={{ flex: 1, textAlign: "center", fontSize: 10,
                  color: T.ink3, fontVariantNumeric: "tabular-nums" }}>{h.hour}</span>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={S.card}>
        <h2 style={S.h2}>Brand &times; platform</h2>
        <p style={S.sub}>Darker = more volume. Hover a cell for the detail.</p>
        {day.loading ? <p style={S.sub}>Loading…</p> : bids.length === 0 ? (
          <div style={S.note}>Nothing counted on {date} yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "separate", borderSpacing: 2 }}>
              <thead><tr>
                <th style={{ ...S.th, border: 0 }} />
                {pfs.map((p) => (
                  <th key={p} style={{ ...S.th, border: 0, textAlign: "center" }}>
                    {p}<br />
                    <span style={DC.AUTO_PLATFORMS.has(p) ? PILL.auto : PILL.tap}>
                      {DC.AUTO_PLATFORMS.has(p) ? "auto" : "tap"}
                    </span>
                  </th>
                ))}
                <th style={{ ...S.th, border: 0, textAlign: "right" }}>Total</th>
              </tr></thead>
              <tbody>
                {bids.map((bid) => (
                  <tr key={bid}>
                    <th style={{ ...S.th, border: 0, textAlign: "left", whiteSpace: "nowrap" }}>
                      {brandName[bid] || bid}
                    </th>
                    {pfs.map((p) => {
                      const v = m.cells[`${bid}|${p}`] || 0;
                      const base = { borderRadius: 5, padding: "11px 8px", textAlign: "center",
                        fontWeight: 700, fontSize: 13, fontVariantNumeric: "tabular-nums" };
                      if (!v) return (
                        <td key={p} style={{ border: 0, padding: 0 }}>
                          <div style={{ ...base, background: "#F8FAFC", color: T.ink3, fontWeight: 400 }}>
                            &ndash;</div>
                        </td>
                      );
                      const step = Math.min(RAMP.length - 1, Math.floor((v / maxCell) * RAMP.length));
                      return (
                        <td key={p} style={{ border: 0, padding: 0 }}>
                          <div title={`${brandName[bid] || bid} · ${p} — ${v}`}
                            style={{ ...base, background: RAMP[step],
                              color: step >= 4 ? "#fff" : T.ink }}>{v}</div>
                        </td>
                      );
                    })}
                    <td style={{ border: 0, textAlign: "right", fontWeight: 700, padding: "0 8px",
                      fontVariantNumeric: "tabular-nums", fontSize: 13 }}>{m.rows[bid]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={S.note}>
          Shopee, Lazada and Tiktok are deliberately absent — that volume already comes from
          the Duoke import. Email and Webchat come from the Service Desk. Only the manual
          platforms are tapped.
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════ Shell ═════════════════════════════════ */
export default function DailyCount({
  role = "agent", myAgentId, agents = [], brands = [], getShift, getAgentBrands,
}) {
  const canSupervise = role === "manager" || role === "fulltime";
  const [tab, setTab] = useState("mine");
  useEffect(() => { DC.installFlushHooks(); }, []);

  const tabs = [{ k: "mine", label: "My Shift" }].concat(
    canSupervise ? [{ k: "board", label: "Shift Board" }, { k: "volume", label: "Volume" }] : []);

  return (
    <div>
      {canSupervise && (
        <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${T.line}`, marginBottom: 16 }}>
          {tabs.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{ background: "none", border: "none", fontFamily: "inherit", fontSize: 13,
                fontWeight: 600, padding: "9px 14px", cursor: "pointer", borderRadius: "6px 6px 0 0",
                color: tab === t.k ? T.teal : T.ink2,
                borderBottom: `2px solid ${tab === t.k ? T.teal : "transparent"}` }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === "mine" && (
        <MyShift myAgentId={myAgentId} agents={agents} brands={brands}
          getShift={getShift} getAgentBrands={getAgentBrands} />
      )}
      {tab === "board" && canSupervise && (
        <ShiftBoard agents={agents} role={role} getShift={getShift} />
      )}
      {tab === "volume" && canSupervise && <Volume brands={brands} />}
    </div>
  );
}
