// ════════════════════════════════════════════════════════════════════════════
// CS Agent Invoice — approval flow
//
// Agent submits → CS Manager approves each one → Manager shares the whole
// month with Finance in a single batch, BY EMAIL. Finance never logs in.
//
//   draft ──submit──▶ submitted ──manager approves──▶ manager_approved
//     ▲                   │                                │
//     │                   │        (Teams tab: "Share to Finance", one click —
//     │                   │         sends the summary email, then marks shared)
//     │                   │                                ▼
//     └── returned with a reason ◀──────────────    sent_to_finance  (final)
//         (agent fixes, resubmits)
//
// THE EMAIL IS THE HAND-OFF, NOT A NOTIFICATION
//   Finance has no NiRM account, so the summary email is the only thing they
//   receive. That reverses the failure rule a courtesy email would have:
//   share() sends the email FIRST and only marks the invoices shared if
//   SendGrid accepted it. A failed send leaves everything in
//   "manager_approved" with an error the manager can see — never a batch that
//   NiRM believes was shared but Finance never got.
//
// WHY THERE IS A SEPARATE "SHARE" STEP
//   Approving an invoice and handing the month to Finance are two different
//   decisions. The manager ticks each agent as the invoices arrive through the
//   month; the batch is what Finance actually receives, once, with a total
//   they can reconcile against.
//
// WHY THE FIGURES ARE FROZEN AT SUBMIT
//   The total is derived from the roster (worked days × daily rate, OT at
//   1.5×, plus extra hours). If it were recomputed live, a roster edit made
//   after submission would silently change an amount someone already approved
//   — the same class of bug as an allocation reshuffling a day already worked.
//   So submitting takes a snapshot and every later stage reads that snapshot.
//
//   Legitimate roster corrections still happen, and we do not hide them:
//   driftOf() recomputes the live figures and the approver gets a red banner
//   naming exactly what moved, plus a confirmation before approving anyway.
//   Never silently, never automatic.
//
// STORAGE
//   One array under the `nirm-invoices` domain key, one record per agent per
//   pay period, id = `${agentId}__${period}`. Every transition appends to
//   `history`, which nothing in this file ever removes — so the audit trail
//   survives rejections, resubmits and re-batching.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useMemo } from "react";
import { supabase } from "./supabase.js";

const FN_BASE = "https://bequrilwgooesolepubv.supabase.co/functions/v1";

// ── Status vocabulary ───────────────────────────────────────────────────────
export const INV_STATUS = {
  draft:            { label: "Not submitted",              color: "#64748B", bg: "#F1F5F9", border: "#E2E8F0" },
  submitted:        { label: "Waiting CS Manager",         color: "#92400E", bg: "#FEF3C7", border: "#FDE68A" },
  manager_approved: { label: "Approved — in this batch",   color: "#7C3AED", bg: "#F3E8FF", border: "#DDD6FE" },
  sent_to_finance:  { label: "Shared with Finance ✓",      color: "#065F46", bg: "#D1FAE5", border: "#6EE7B7" },
  rejected:         { label: "Returned to agent",          color: "#B91C1C", bg: "#FEE2E2", border: "#FECACA" },
};

export const invoiceId = (agentId, period) => `${agentId}__${period}`;

// Teams whose people invoice by the day. Full-time (T2) staff are salaried and
// never appear in this flow.
export const DAILY_RATE_TEAMS = ["T1", "RT&RF", "CC"];

const THB = (n) =>
  (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const stamp = () => new Date().toISOString();

const fmtWhen = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const MONTH_NAME = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const periodLabel = (period) => {
  const [y, m] = String(period || "").split("-").map(Number);
  return y && m ? `${MONTH_NAME[m - 1]} ${y}` : String(period || "");
};

// Fields that make up the money. Compared snapshot-vs-live to detect drift.
const FIGURE_FIELDS = [
  ["workDays",    "Working days"],
  ["otDays",      "OT days"],
  ["extraHours",  "Extra hours"],
  ["subtotal",    "Subtotal"],
  ["withholding", "Withholding 3%"],
  ["netAmount",   "Net payable"],
];

// Compare the frozen snapshot against freshly-computed roster figures.
// Returns [] when they agree.
export function driftOf(inv, live) {
  if (!inv || !live) return [];
  const out = [];
  for (const [key, label] of FIGURE_FIELDS) {
    const was = Number(inv[key] || 0);
    const now = Number(live[key] || 0);
    if (Math.abs(was - now) > 0.005) out.push({ key, label, was, now });
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// AGENT SIDE — status + submit control, rendered inside the "My Invoice" tab
// ════════════════════════════════════════════════════════════════════════════
export function InvoiceStatusBar({
  invoice, figures, signature, canSubmit, submitBlockedReason, onSubmit,
}) {
  const [showLog, setShowLog] = useState(false);
  const status = invoice?.status || "draft";
  const s = INV_STATUS[status] || INV_STATUS.draft;
  const drift = status === "draft" || status === "rejected" ? [] : driftOf(invoice, figures);

  const submittable = status === "draft" || status === "rejected";
  const blocked = !signature
    ? "Sign the invoice first — the signature is what makes it a submission."
    : !canSubmit
    ? (submitBlockedReason || "Not available yet.")
    : null;

  return (
    <div style={{ padding: "12px 18px", borderBottom: "1px solid #F1F5F9", background: s.bg, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ padding: "4px 10px", borderRadius: 999, background: "#fff", border: `1px solid ${s.border}`, color: s.color, fontSize: 11, fontWeight: 800 }}>
          {s.label}
        </span>
        {invoice?.submittedAt && (
          <span style={{ fontSize: 11, color: s.color }}>submitted {fmtWhen(invoice.submittedAt)}</span>
        )}
      </div>

      {status === "rejected" && invoice?.rejectReason && (
        <div style={{ flexBasis: "100%", fontSize: 11, color: "#B91C1C", background: "#fff", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 10px" }}>
          <strong>Returned by {invoice.rejectedBy}:</strong> {invoice.rejectReason}
        </div>
      )}

      {drift.length > 0 && (
        <div style={{ flexBasis: "100%", fontSize: 11, color: "#B91C1C", background: "#fff", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 10px" }}>
          ⚠ The roster changed after you submitted. This invoice still shows the submitted figures
          ({drift.map(d => `${d.label} ${THB(d.was)} → now ${THB(d.now)}`).join(", ")}).
          Ask your manager to return it so you can resubmit.
        </div>
      )}

      <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
        {invoice?.history?.length > 0 && (
          <button onClick={() => setShowLog(v => !v)}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            {showLog ? "Hide" : "History"}
          </button>
        )}
        {submittable && (
          <button
            onClick={() => { if (!blocked) onSubmit(); }}
            title={blocked || ""}
            style={{
              padding: "7px 16px", borderRadius: 8, border: "none",
              background: blocked ? "#E2E8F0" : "#0D9488",
              color: blocked ? "#94A3B8" : "#fff",
              fontSize: 12, fontWeight: 800, cursor: blocked ? "not-allowed" : "pointer", fontFamily: "inherit",
            }}>
            {status === "rejected" ? "Resubmit invoice" : "Submit for approval"}
          </button>
        )}
      </div>

      {blocked && submittable && (
        <div style={{ flexBasis: "100%", fontSize: 11, color: "#92400E" }}>{blocked}</div>
      )}

      {showLog && (
        <div style={{ flexBasis: "100%", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 10px" }}>
          <HistoryList history={invoice?.history} />
        </div>
      )}
    </div>
  );
}

function HistoryList({ history }) {
  if (!history || history.length === 0) {
    return <div style={{ fontSize: 11, color: "#94A3B8" }}>No activity yet.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {[...history].reverse().map((h, i) => (
        <div key={i} style={{ fontSize: 11, color: "#475569", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ color: "#94A3B8", minWidth: 140 }}>{fmtWhen(h.at)}</span>
          <strong style={{ color: "#1A1D2E" }}>{h.action}</strong>
          <span>by {h.by}{h.role ? ` (${h.role})` : ""}</span>
          {h.note && <span style={{ color: "#B91C1C" }}>— {h.note}</span>}
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MONTHLY BATCH — lives on the Teams tab, CS Manager only
// ════════════════════════════════════════════════════════════════════════════
export function InvoiceBatchPanel({
  agents = [], invoices = [], setInvoices, period,
  computeFigures,        // (agentId, period) => figures | null
  financeEmails = [],    // saved by the manager, persisted in globalFlags
  onSaveFinanceEmails,   // (list) => void — persists the addresses
  role, loginUser,
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);   // { tone, text }
  // Finance never logs into NiRM, so the address book lives here: the manager
  // types the address(es) once and they persist for every later month.
  const [emailDraft, setEmailDraft] = useState(financeEmails.join(", "));
  const [editingEmails, setEditingEmails] = useState(financeEmails.length === 0);

  const parseEmails = (s) => [...new Set(
    String(s || "").split(/[,;\s]+/)
      .map(a => a.toLowerCase().trim())
      .filter(a => /^[^\s@]+@crea\.asia$/.test(a))
  )].slice(0, 5);

  const saveEmails = () => {
    const list = parseEmails(emailDraft);
    if (!list.length) { setNote({ tone: "warn", text: "Enter at least one @crea.asia address — the batch email only sends internally." }); return; }
    onSaveFinanceEmails?.(list);
    setEmailDraft(list.join(", "));
    setEditingEmails(false);
    setNote(null);
  };

  // Only daily-rate, active people invoice. Everyone else is salaried.
  const roster = useMemo(
    () => agents.filter(a => a.active && DAILY_RATE_TEAMS.includes(a.team))
                .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [agents]
  );

  const rows = useMemo(() => roster.map(a => {
    const inv = invoices.find(i => i.id === invoiceId(a.id, period)) || null;
    // Nothing submitted yet? Show what the roster says it will be, so the
    // manager can see the shape of the month before the invoices land.
    const preview = inv ? null : computeFigures?.(a.id, period);
    return { agent: a, inv, preview, status: inv?.status || "draft" };
  }), [roster, invoices, period, computeFigures]);

  const approved   = rows.filter(r => r.status === "manager_approved");
  const waitingMgr = rows.filter(r => r.status === "submitted");
  const notIn      = rows.filter(r => r.status === "draft" || r.status === "rejected");
  const already    = rows.filter(r => r.status === "sent_to_finance");

  const batchTotal = approved.reduce((s, r) => s + (Number(r.inv?.netAmount) || 0), 0);
  const batchGross = approved.reduce((s, r) => s + (Number(r.inv?.subtotal) || 0), 0);
  const batchWht   = approved.reduce((s, r) => s + (Number(r.inv?.withholding) || 0), 0);

  const isManager = role === "manager";

  const share = async () => {
    if (!approved.length || busy) return;
    if (!financeEmails.length) {
      setEditingEmails(true);
      setNote({ tone: "warn", text: "Save Finance's email address first — the email is how Finance receives the batch." });
      return;
    }

    // Warn about stragglers, but never block — they can go in a second batch.
    const problems = [];
    if (waitingMgr.length) problems.push(`${waitingMgr.length} still waiting for your approval: ${waitingMgr.map(r => r.agent.name).join(", ")}`);
    if (notIn.length)      problems.push(`${notIn.length} have not submitted: ${notIn.map(r => r.agent.name).join(", ")}`);
    const msg =
      `Email ${approved.length} invoice${approved.length === 1 ? "" : "s"} for ${periodLabel(period)} to Finance?\n\n` +
      `To: ${financeEmails.join(", ")}\n` +
      `Total net payable: ฿${THB(batchTotal)}\n` +
      (problems.length ? `\nNot included:\n${problems.map(p => "  • " + p).join("\n")}\n\nYou can share the rest in a second batch later.` : "");
    if (!window.confirm(msg)) return;

    setBusy(true);
    setNote(null);

    // Finance has no NiRM login — this email IS the hand-off. So it goes out
    // FIRST, and the invoices are only marked shared if SendGrid accepted it.
    // A failed send changes nothing and says so; it never leaves NiRM claiming
    // a batch was shared that Finance never received.
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch(`${FN_BASE}/invoice-notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s?.session?.access_token ?? ""}` },
        body: JSON.stringify({
          to: financeEmails,
          subject: `CS agent invoices — ${periodLabel(period)} (${approved.length} agents, ฿${THB(batchTotal)})`,
          text: batchEmailText({ approved, period, batchTotal, batchGross, batchWht, by: loginUser, waitingMgr, notIn }),
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.detail || j.error || `HTTP ${r.status}`);
      }
    } catch (e) {
      setNote({ tone: "warn", text: `NOT shared — the email to Finance failed to send (${e.message || e}). Nothing was changed; fix the problem and press Share again.` });
      setBusy(false);
      return;
    }

    const now = stamp();
    const batchId = `${period}-${now.replace(/\D/g, "").slice(0, 14)}`;
    const ids = new Set(approved.map(r => r.inv.id));
    setInvoices(prev => prev.map(i => ids.has(i.id)
      ? {
          ...i, status: "sent_to_finance",
          batchId, sharedAt: now, sharedBy: loginUser,
          history: [...(i.history || []), { at: now, by: loginUser || "—", role, action: "Shared with Finance by email", note: `batch ${batchId} → ${financeEmails.join(", ")}` }],
        }
      : i
    ));
    setNote({ tone: "ok", text: `Emailed ${approved.length} invoices (฿${THB(batchTotal)}) to ${financeEmails.join(", ")}.` });
    setBusy(false);
  };

  if (!isManager) return null;

  return (
    <div style={{ marginTop: 18, background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #F1F5F9", background: "#F8FAFC", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1D2E" }}>Invoice batch — {periodLabel(period)}</div>
          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
            {approved.length} approved · {waitingMgr.length} waiting your approval · {notIn.length} not submitted
            {already.length ? ` · ${already.length} already sent` : ""}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>Batch total</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#1A1D2E" }}>฿{THB(batchTotal)}</div>
          </div>
          <button onClick={share} disabled={busy || approved.length === 0}
            title={approved.length === 0 ? "Approve at least one invoice first" : ""}
            style={{
              padding: "9px 18px", borderRadius: 8, border: "none",
              background: approved.length && !busy ? "#0D9488" : "#E2E8F0",
              color: approved.length && !busy ? "#fff" : "#94A3B8",
              fontSize: 12, fontWeight: 800, cursor: approved.length && !busy ? "pointer" : "not-allowed", fontFamily: "inherit",
            }}>
            {busy ? "Emailing…" : `Share ${approved.length || ""} to Finance ✉`.replace(/\s+/g, " ")}
          </button>
        </div>
      </div>

      {/* Finance address book — the email is the hand-off, so this is required */}
      <div style={{ padding: "9px 18px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#fff" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.3 }}>Finance email</span>
        {editingEmails ? (
          <>
            <input
              value={emailDraft}
              onChange={e => setEmailDraft(e.target.value)}
              placeholder="finance@crea.asia (comma-separate for more than one)"
              style={{ flex: 1, minWidth: 220, padding: "6px 10px", borderRadius: 7, border: "1px solid #E2E8F0", fontSize: 12, fontFamily: "inherit" }}
            />
            <button onClick={saveEmails}
              style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: "#0D9488", color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              Save
            </button>
            {financeEmails.length > 0 && (
              <button onClick={() => { setEmailDraft(financeEmails.join(", ")); setEditingEmails(false); }}
                style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
            )}
          </>
        ) : (
          <>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#1A1D2E" }}>{financeEmails.join(", ")}</span>
            <button onClick={() => { setEmailDraft(financeEmails.join(", ")); setEditingEmails(true); }}
              style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Change
            </button>
          </>
        )}
      </div>

      {note && (
        <div style={{
          padding: "10px 18px", fontSize: 11, borderBottom: "1px solid #F1F5F9",
          background: note.tone === "ok" ? "#ECFDF5" : "#FEF3C7",
          color: note.tone === "ok" ? "#065F46" : "#92400E",
        }}>{note.text}</div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              {["Agent", "Team", "Days", "OT", "Extra h", "Subtotal", "WHT 3%", "Net payable", "Status"].map((h, i) => (
                <th key={h} style={{ padding: "8px 12px", textAlign: i >= 2 && i <= 7 ? "right" : "left", fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.3, borderBottom: "1px solid #E2E8F0", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ agent, inv, preview, status }) => {
              const s = INV_STATUS[status] || INV_STATUS.draft;
              const f = inv || preview;
              const pending = !inv;
              return (
                <tr key={agent.id} style={{ borderBottom: "1px solid #F8FAFC", opacity: pending ? 0.55 : 1 }}>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: "#1A1D2E" }}>{agent.name}</td>
                  <td style={{ padding: "8px 12px", color: "#64748B" }}>{agent.team}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: "#475569" }}>{f ? f.workDays : "—"}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: "#475569" }}>{f ? (f.otDays || 0) : "—"}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: "#475569" }}>{f ? (f.extraHours || 0) : "—"}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: "#475569", fontFamily: "monospace" }}>{f ? THB(f.subtotal) : "—"}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: "#94A3B8", fontFamily: "monospace" }}>{f ? THB(f.withholding) : "—"}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 800, color: "#1A1D2E", fontFamily: "monospace" }}>{f ? THB(f.netAmount) : "—"}</td>
                  <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                    <span style={{ padding: "3px 8px", borderRadius: 999, background: s.bg, border: `1px solid ${s.border}`, color: s.color, fontSize: 10, fontWeight: 700 }}>
                      {pending ? "Not submitted (roster estimate)" : s.label}
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 24, textAlign: "center", color: "#94A3B8" }}>No daily-rate agents on the roster.</td></tr>
            )}
          </tbody>
          {approved.length > 0 && (
            <tfoot>
              <tr style={{ background: "#F8FAFC", borderTop: "2px solid #E2E8F0" }}>
                <td colSpan={5} style={{ padding: "10px 12px", fontWeight: 800, color: "#1A1D2E" }}>
                  Batch ({approved.length} approved)
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#475569", fontFamily: "monospace" }}>{THB(batchGross)}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#94A3B8", fontFamily: "monospace" }}>{THB(batchWht)}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, color: "#0D9488", fontFamily: "monospace", fontSize: 13 }}>{THB(batchTotal)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function batchEmailText({ approved, period, batchTotal, batchGross, batchWht, by, waitingMgr, notIn }) {
  const pad = (s, n) => String(s).padEnd(n).slice(0, n);
  const padL = (s, n) => String(s).padStart(n);
  const lines = [
    `CS agent invoices for ${periodLabel(period)}`,
    `Pay period ${approved[0]?.inv?.periodStart ?? ""} to ${approved[0]?.inv?.periodEnd ?? ""}`,
    `Approved and released by ${by || "CS Manager"}.`,
    "",
    `${pad("Agent", 18)}${padL("Days", 5)}${padL("OT", 4)}${padL("Extra", 6)}${padL("Subtotal", 12)}${padL("WHT 3%", 10)}${padL("Net", 12)}`,
    "-".repeat(67),
  ];
  for (const { agent, inv } of approved) {
    lines.push(
      pad(agent.name, 18) + padL(inv.workDays, 5) + padL(inv.otDays || 0, 4) +
      padL(inv.extraHours || 0, 6) + padL(THB(inv.subtotal), 12) +
      padL(THB(inv.withholding), 10) + padL(THB(inv.netAmount), 12)
    );
  }
  lines.push("-".repeat(67));
  lines.push(pad(`TOTAL (${approved.length})`, 33) + padL(THB(batchGross), 12) + padL(THB(batchWht), 10) + padL(THB(batchTotal), 12));
  lines.push("");
  if (waitingMgr.length) lines.push(`Not included — still with the CS Manager: ${waitingMgr.map(r => r.agent.name).join(", ")}`);
  if (notIn.length)      lines.push(`Not included — not yet submitted: ${notIn.map(r => r.agent.name).join(", ")}`);
  if (waitingMgr.length || notIn.length) lines.push("These will follow in a later batch.");
  lines.push("");
  lines.push("All figures are computed from the NiRM roster and were approved");
  lines.push("individually by the CS Manager before this batch was released.");
  lines.push("Sent automatically by NiRM Roster.");
  return lines.join("\n");
}

// ════════════════════════════════════════════════════════════════════════════
// APPROVER SIDE — the queue. CS Manager only: Finance receives the batch by
// email and never logs in, so there is no Finance queue.
// ════════════════════════════════════════════════════════════════════════════
export default function InvoiceApprovals({
  invoices = [], setInvoices, role, loginUser,
  liveFiguresFor,          // (agentId, period) => figures | null — recomputed from the roster
}) {
  const [tab, setTab] = useState("todo");
  const [expanded, setExpanded] = useState(null);
  const [rejectFor, setRejectFor] = useState(null);
  const [rejectNote, setRejectNote] = useState("");

  const isManager = role === "manager";

  // What the manager can move. Note there is no action once approved —
  // releasing to Finance is the batch button on the Teams tab, deliberately
  // not a per-invoice control.
  const actionFor = (inv) => {
    if (isManager && inv.status === "submitted") {
      return { label: "Approve", next: "manager_approved", verb: "CS Manager approved" };
    }
    return null;
  };

  // Approved-but-unsent can still be pulled back. Once emailed to Finance it
  // is out of the building — returning it in NiRM could not un-send the email,
  // so a correction after that point is a resubmit in the NEXT batch.
  const canReject = (inv) =>
    isManager && ["submitted", "manager_approved"].includes(inv.status);

  const todo = useMemo(
    () => invoices.filter(i => actionFor(i)).sort((a, b) => (a.submittedAt || "").localeCompare(b.submittedAt || "")),
    [invoices, role]
  );
  const rest = useMemo(
    () => invoices.filter(i => !actionFor(i)).sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || "")),
    [invoices, role]
  );
  const shown = tab === "todo" ? todo : rest;

  const patch = (inv, changes, action, note) => {
    setInvoices(prev => prev.map(x => x.id === inv.id
      ? {
          ...x, ...changes,
          history: [...(x.history || []), { at: stamp(), by: loginUser || "—", role, action, note: note || "" }],
        }
      : x
    ));
  };

  const approve = (inv) => {
    const a = actionFor(inv);
    if (!a) return;
    const drift = driftOf(inv, liveFiguresFor?.(inv.agentId, inv.period));
    if (drift.length > 0) {
      const lines = drift.map(d => `  • ${d.label}: submitted ${THB(d.was)} → roster now ${THB(d.now)}`).join("\n");
      const ok = window.confirm(
        `The roster has changed since this invoice was submitted:\n\n${lines}\n\n` +
        `Approving pays the SUBMITTED figures, not the current roster.\n` +
        `Cancel and return it to the agent if the new figures are the correct ones.\n\nApprove anyway?`
      );
      if (!ok) return;
    }
    const now = stamp();
    patch(inv, { status: a.next, managerAt: now, managerBy: loginUser }, a.verb,
      drift.length ? "approved despite roster drift" : "");
  };

  const doReject = () => {
    if (!rejectFor) return;
    const note = rejectNote.trim();
    if (!note) { alert("Please say why you're returning it — the agent needs to know what to fix."); return; }
    patch(rejectFor,
      { status: "rejected", rejectedAt: stamp(), rejectedBy: loginUser, rejectReason: note, batchId: null },
      "Returned to agent", note);
    setRejectFor(null);
    setRejectNote("");
  };

  const exportCsv = () => {
    const rows = [[
      "Invoice No", "Agent", "Period", "Working days", "OT days", "Extra hours",
      "Daily rate", "Subtotal", "Withholding 3%", "Net payable", "Status", "Batch",
      "Submitted", "Manager approved", "Emailed to Finance",
    ]];
    for (const i of shown) {
      rows.push([
        i.invoiceNumber, i.agentName, i.period, i.workDays, i.otDays, i.extraHours,
        i.costDay, i.subtotal, i.withholding, i.netAmount, INV_STATUS[i.status]?.label || i.status, i.batchId || "",
        i.submittedAt || "", i.managerAt || "", i.sharedAt || "",
      ]);
    }
    const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `cs-invoices-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPending = todo.reduce((s, i) => s + (Number(i.netAmount) || 0), 0);

  if (!isManager) {
    return (
      <div style={{ padding: 24, fontSize: 13, color: "#64748B" }}>
        Invoice approvals are available to the CS Manager.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <Stat label="Waiting your approval" value={todo.length} tone="#F59E0B" />
        <Stat label="Value awaiting you" value={`฿${THB(totalPending)}`} tone="#0D9488" />
        <Stat label="All invoices" value={invoices.length} tone="#64748B" />
      </div>

      {isManager && (
        <div style={{ marginBottom: 12, padding: "9px 12px", borderRadius: 8, background: "#F3E8FF", border: "1px solid #DDD6FE", fontSize: 11, color: "#5B21B6" }}>
          Approving here puts an agent into this month's batch. Email the batch to Finance from the <strong>Teams</strong> tab.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        {[["todo", `Needs me (${todo.length})`], ["all", `Everything else (${rest.length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{
              padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              border: tab === k ? "1px solid #0D9488" : "1px solid #E2E8F0",
              background: tab === k ? "#F0FDFA" : "#fff",
              color: tab === k ? "#0D9488" : "#64748B",
            }}>{l}</button>
        ))}
        <button onClick={exportCsv} disabled={shown.length === 0}
          style={{ marginLeft: "auto", padding: "7px 14px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: shown.length ? "#64748B" : "#CBD5E1", fontSize: 12, fontWeight: 700, cursor: shown.length ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
          Export CSV
        </button>
      </div>

      {shown.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, color: "#94A3B8", fontSize: 13 }}>
          {tab === "todo" ? "Nothing waiting on you." : "Nothing here yet."}
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, overflow: "hidden" }}>
          {shown.map((inv, idx) => {
            const s = INV_STATUS[inv.status] || INV_STATUS.draft;
            const a = actionFor(inv);
            const drift = driftOf(inv, liveFiguresFor?.(inv.agentId, inv.period));
            const open = expanded === inv.id;
            return (
              <div key={inv.id} style={{ borderTop: idx === 0 ? "none" : "1px solid #F1F5F9" }}>
                <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 180 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1D2E" }}>{inv.agentName}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>#{inv.invoiceNumber} · {inv.periodStart} → {inv.periodEnd}</div>
                  </div>

                  <div style={{ fontSize: 11, color: "#64748B", minWidth: 150 }}>
                    {inv.workDays} days{inv.otDays ? ` · ${inv.otDays} OT` : ""}{inv.extraHours ? ` · ${inv.extraHours}h extra` : ""}
                  </div>

                  <div style={{ fontSize: 14, fontWeight: 800, color: "#1A1D2E", minWidth: 120, textAlign: "right" }}>
                    ฿{THB(inv.netAmount)}
                  </div>

                  <span style={{ padding: "4px 10px", borderRadius: 999, background: s.bg, border: `1px solid ${s.border}`, color: s.color, fontSize: 11, fontWeight: 700 }}>
                    {s.label}
                  </span>

                  {drift.length > 0 && (
                    <span title="The roster changed after submission"
                      style={{ padding: "4px 8px", borderRadius: 6, background: "#FEE2E2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 10, fontWeight: 800 }}>
                      ⚠ roster changed
                    </span>
                  )}

                  <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    <button onClick={() => setExpanded(open ? null : inv.id)}
                      style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                      {open ? "Close" : "Details"}
                    </button>
                    {canReject(inv) && (
                      <button onClick={() => { setRejectFor(inv); setRejectNote(""); }}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #FECACA", background: "#FFF5F5", color: "#B91C1C", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        Return
                      </button>
                    )}
                    {a && (
                      <button onClick={() => approve(inv)}
                        style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#0D9488", color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                        {a.label}
                      </button>
                    )}
                  </div>
                </div>

                {open && (
                  <div style={{ padding: "0 16px 16px 16px", background: "#F8FAFC" }}>
                    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", padding: "12px 0" }}>
                      <Detail label="Daily rate" value={`฿${THB(inv.costDay)}`} />
                      <Detail label="Normal days" value={inv.normalDays} />
                      <Detail label="OT days (1.5×)" value={inv.otDays} />
                      <Detail label="Extra hours" value={`${inv.extraHours || 0}h · ฿${THB(inv.extraPay)}`} />
                      <Detail label="Subtotal" value={`฿${THB(inv.subtotal)}`} />
                      <Detail label="Withholding 3%" value={`−฿${THB(inv.withholding)}`} />
                      <Detail label="Net payable" value={`฿${THB(inv.netAmount)}`} strong />
                      {inv.batchId && <Detail label="Batch" value={inv.batchId} />}
                    </div>
                    {drift.length > 0 && (
                      <div style={{ fontSize: 11, color: "#B91C1C", background: "#fff", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
                        <strong>The roster no longer matches this invoice.</strong> Approving pays the submitted figures.
                        <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                          {drift.map(d => (
                            <li key={d.key}>{d.label}: submitted <strong>{THB(d.was)}</strong> → roster now <strong>{THB(d.now)}</strong></li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#1A1D2E", marginBottom: 6 }}>Audit trail</div>
                      <HistoryList history={inv.history} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {rejectFor && (
        <div onClick={() => setRejectFor(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 14, padding: 20, width: 460, maxWidth: "92vw", boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#1A1D2E", marginBottom: 4 }}>
              Return {rejectFor.agentName}'s invoice
            </div>
            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 12 }}>
              #{rejectFor.invoiceNumber} · ฿{THB(rejectFor.netAmount)}. They'll see this reason and can resubmit.
              {rejectFor.batchId ? " It will also drop out of this month's batch." : ""}
            </div>
            <textarea
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              autoFocus
              placeholder="e.g. 3 Aug is marked OT but the roster shows a normal shift — please check before resubmitting."
              style={{ width: "100%", minHeight: 96, padding: 10, borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button onClick={() => setRejectFor(null)}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
              <button onClick={doReject}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#B91C1C", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                Return to agent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div style={{ flex: "1 1 160px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: tone, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Detail({ label, value, strong }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: strong ? 15 : 13, fontWeight: strong ? 800 : 700, color: "#1A1D2E", marginTop: 2 }}>{value}</div>
    </div>
  );
}
