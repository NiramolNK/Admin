/**
 * LiveNow.jsx — the header chip showing who is in NiRM right now.
 *
 * Managers and T2 see names and which tab each person is on. Everyone else
 * sees a count only ("4 online"), which is enough to feel the team is there
 * without anyone feeling watched.
 *
 * Also exports usePresenceTick(), a tiny hook other screens use to re-render
 * when the roster changes (the Daily Count Shift Board uses it for its dots).
 */

import React, { useEffect, useRef, useState } from "react";
import * as P from "./livePresence";

const DOT = { online: "#0D9488", idle: "#FAB219" };

/** Re-render on every presence change. Returns a counter you can ignore. */
export function usePresenceTick() {
  const [n, setN] = useState(0);
  useEffect(() => P.subscribe(() => setN((v) => v + 1)), []);
  return n;
}

export function PresenceDot({ agentId, showLabel = false }) {
  usePresenceTick();
  const s = P.statusOf(agentId);
  if (!s) return null;
  return (
    <span title={s === "online" ? "in NiRM now" : "tab open, idle 5+ min"}
      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: DOT[s],
        display: "inline-block", flexShrink: 0 }} />
      {showLabel && <span style={{ fontSize: 11, color: "#94A3B8" }}>{s}</span>}
    </span>
  );
}

export default function LiveNow({ canSeeNames = false }) {
  usePresenceTick();
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const list = P.roster();
  const { online, idle } = P.counts();
  if (!list.length) return null;

  const label = `${online} online${idle ? ` · ${idle} idle` : ""}`;

  if (!canSeeNames) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12,
        color: "#64748B", padding: "4px 10px", borderRadius: 999, background: "#F0FDFA" }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: DOT.online }} />
        {online === 1 ? "just you right now" : `${online} of the team online`}
      </span>
    );
  }

  return (
    <div ref={box} style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12,
          fontFamily: "inherit", color: "#0F172A", cursor: "pointer",
          padding: "5px 11px", borderRadius: 999, background: "#F0FDFA",
          border: "1px solid #CCFBF1" }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: DOT.online }} />
        {label}
      </button>

      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 200,
          background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, padding: 8,
          minWidth: 240, boxShadow: "0 8px 24px rgba(15,23,42,.12)" }}>
          {list.map((r) => (
            <div key={r.key || r.agentId || r.name}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                fontSize: 12.5, whiteSpace: "nowrap" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: DOT[r.status],
                flexShrink: 0 }} />
              <span style={{ fontWeight: 600, color: "#0F172A" }}>
                {r.name}{r.agentId ? ` (${r.agentId})` : ""}
              </span>
              <span style={{ color: "#94A3B8", marginLeft: "auto" }}>
                {r.status === "idle" ? "idle" : (r.tab || "—")}
                {r.tabs > 1 ? ` · ${r.tabs} tabs` : ""}
              </span>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "#94A3B8", padding: "6px 8px 2px",
            borderTop: "1px solid #F1F5F9", marginTop: 4 }}>
            Idle = tab open, nothing for 5 minutes. This is who is connected now,
            not a history.
          </div>
        </div>
      )}
    </div>
  );
}
