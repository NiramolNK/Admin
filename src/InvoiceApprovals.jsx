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
// never appear in this flow. NOTE: the RT&RF team is stored as "Return" on
// agent records (the Teams editor's dropdown value) — both spellings are
// accepted so nobody drops out of the batch over a label.
export const DAILY_RATE_TEAMS = ["T1", "RT&RF", "Return", "CC"];

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
  invoice, figures, signature, docs, canSubmit, submitBlockedReason, onSubmit,
}) {
  const [showLog, setShowLog] = useState(false);
  const status = invoice?.status || "draft";
  const s = INV_STATUS[status] || INV_STATUS.draft;
  const drift = status === "draft" || status === "rejected" ? [] : driftOf(invoice, figures);

  const submittable = status === "draft" || status === "rejected";
  // Finance requires the signed invoice WITH the ID card and bookbank copies,
  // so an invoice missing either document is not submittable — catching it
  // here beats Finance bouncing the whole batch at month end.
  const missingDocs = [
    docs && !docs.idCard ? "ID card copy" : null,
    docs && !docs.bookbank ? "bookbank copy" : null,
  ].filter(Boolean);
  const blocked = !signature
    ? "Sign the invoice first — the signature is what makes it a submission."
    : missingDocs.length
    ? `Upload your ${missingDocs.join(" and ")} in Personal Info first — Finance requires ${missingDocs.length > 1 ? "them" : "it"} with every invoice.`
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
// MONTHLY BATCH — lives on the Teams tab, CS Manager only.
//
// "Share to Finance" does three things, in a deliberate order:
//   1. builds the BATCH PACK — one self-contained HTML file holding every
//      approved agent's signed invoice page + ID card + bookbank, in order,
//      with print page-breaks so Finance can Ctrl+P the lot into one PDF;
//   2. uploads it to the payroll-docs bucket (where the ID/bookbank images
//      already live — attaching a month of scans to the email itself would
//      blow the mail size limit, a link cannot);
//   3. emails the summary + pack link to the fixed Finance recipients, and
//      ONLY on a successful send marks the invoices shared.
// ════════════════════════════════════════════════════════════════════════════

// The CS part-time payment distribution list. Saved once into shared state so
// it can be edited in the panel without a code change; these are the seeds.
export const DEFAULT_FINANCE_RECIPIENTS = {
  to: ["jiratchaya.j@crea.asia"],
  cc: [
    "accounts_ap@crea.asia",
    "niramol.k@crea.asia",
    "hrservices@crea.asia",
    "chutimon.d@crea.asia",
    "areeya.w@crea.asia",
    "valerio.b@crea.asia",
  ],
};

const parseEmailList = (raw, max) => [...new Set(
  String(raw || "").split(/[,;\s]+/)
    .map(a => a.toLowerCase().trim())
    .filter(a => /^[^\s@]+@crea\.asia$/.test(a))
)].slice(0, max);

// One agent's chapter of the pack: invoice page, then ID card, then bookbank.
// Figures come from the FROZEN invoice snapshot — never recomputed — so the
// pack Finance receives is exactly what the manager approved.
function agentPackPages(inv, agent, signature) {
  const a = agent || {};
  const name = inv.thaiName || a.thaiName || inv.fullName || a.fullName || inv.agentName;
  const money = (n) => THB(n);
  const sigBlock = signature?.dataUrl
    ? `<img src="${signature.dataUrl}" style="max-height:70px;max-width:260px"/>`
    : `<div style="font-size:17px;font-weight:700;font-style:italic;color:#0D9488">${inv.agentName}</div>`;
  const docPage = (title, url) => url ? `
    <section class="page">
      <h2>${title} — ${name}</h2>
      <div class="docwrap"><img src="${url}"/></div>
    </section>` : `
    <section class="page">
      <h2>${title} — ${name}</h2>
      <p class="missing">⚠ Not on file at the time this batch was generated.</p>
    </section>`;
  return `
    <section class="page">
      <div class="invhead">
        <div>
          <h1>ใบแจ้งหนี้ / INVOICE</h1>
          <div class="muted">CS Part-time — ${periodLabel(inv.period)}</div>
        </div>
        <div class="invno">
          <div><b>เลขที่ / No:</b> ${inv.invoiceNumber}</div>
          <div><b>งวด / Period:</b> ${inv.periodStart} → ${inv.periodEnd}</div>
        </div>
      </div>
      <table class="kv">
        <tr><td>ชื่อ / Name</td><td>${name}${(inv.fullName || a.fullName) && name !== (inv.fullName || a.fullName) ? ` (${inv.fullName || a.fullName})` : ""}</td></tr>
        <tr><td>รหัสพนักงาน / PCODE</td><td>${inv.pcode || a.pcode || a.id || "—"}</td></tr>
        <tr><td>เลขประจำตัวผู้เสียภาษี / Tax ID</td><td>${inv.taxId || a.taxId || a.idCard || "—"}</td></tr>
        <tr><td>ธนาคาร / Bank</td><td>${inv.bankName || a.bankName || "—"}</td></tr>
        <tr><td>เลขที่บัญชี / Account</td><td>${inv.bankAccount || a.bankAccount || "—"}${(inv.bankAccountName || a.bankAccountName) ? ` (${inv.bankAccountName || a.bankAccountName})` : ""}</td></tr>
      </table>
      <table class="fig">
        <tr><th>รายการ / Description</th><th class="r">จำนวน</th><th class="r">บาท / THB</th></tr>
        <tr><td>วันทำงานปกติ × ฿${money(inv.costDay)}</td><td class="r">${inv.normalDays}</td><td class="r">${money(inv.normalDays * inv.costDay)}</td></tr>
        ${inv.otDays ? `<tr><td>วัน OT × ฿${money(inv.costDay)} × 1.5</td><td class="r">${inv.otDays}</td><td class="r">${money(inv.otDays * inv.costDay * 1.5)}</td></tr>` : ""}
        ${inv.extraHours ? `<tr><td>ชั่วโมงพิเศษ / Extra hours</td><td class="r">${inv.extraHours} h</td><td class="r">${money(inv.extraPay)}</td></tr>` : ""}
        <tr class="sum"><td colspan="2">รวม / Subtotal</td><td class="r">${money(inv.subtotal)}</td></tr>
        <tr><td colspan="2">หัก ณ ที่จ่าย 3% / Withholding</td><td class="r">−${money(inv.withholding)}</td></tr>
        <tr class="net"><td colspan="2">ยอดสุทธิ / Net payable</td><td class="r">฿${money(inv.netAmount)}</td></tr>
      </table>
      <div class="sig">
        <div class="sigline">${sigBlock}</div>
        <div class="signame">${name}</div>
        <div class="sigmeta">✓ ลงนามอิเล็กทรอนิกส์ผ่านระบบ NiRM${inv.signedAt ? " · " + String(inv.signedAt).slice(0, 10) : ""}</div>
        <div class="sigmeta">Submitted ${String(inv.submittedAt || "").slice(0, 10)} · Approved by ${inv.managerBy || "CS Manager"} ${String(inv.managerAt || "").slice(0, 10)}</div>
      </div>
    </section>
    ${docPage("สำเนาบัตรประชาชน / ID Card", inv.idCardPhotoUrl || a.idCardPhotoUrl)}
    ${docPage("สำเนาสมุดบัญชี / Bookbank", inv.bookbankPhotoUrl || a.bookbankPhotoUrl)}`;
}

export function buildBatchPack({ approved, agents, period, batchTotal, by }) {
  const rows = approved.map(({ inv }) => {
    const agent = agents.find(x => x.id === inv.agentId);
    const signature = agent?.signatures?.[inv.period];
    return { inv, agent, signature };
  });
  const summaryRows = rows.map(({ inv, agent }) =>
    `<tr><td>${inv.agentName}</td><td>${inv.pcode || agent?.pcode || agent?.id || "—"}</td><td>${inv.fullName || agent?.fullName || "—"}</td><td>#${inv.invoiceNumber}</td><td class="r">${inv.workDays}</td><td class="r">${inv.otDays || 0}</td><td class="r">${inv.extraHours || 0}</td><td class="r">${THB(inv.subtotal)}</td><td class="r">${THB(inv.withholding)}</td><td class="r"><b>${THB(inv.netAmount)}</b></td></tr>`
  ).join("");
  return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">
<title>CS parttime payment — ${periodLabel(period)}</title>
<style>
  body{font-family:'Sarabun','Segoe UI',Arial,sans-serif;color:#1A1D2E;margin:0;background:#fff}
  .page{padding:48px 56px;page-break-after:always;max-width:800px;margin:0 auto}
  h1{font-size:22px;margin:0}h2{font-size:16px;text-align:center;margin:0 0 14px}
  .muted{color:#64748B;font-size:12px}.r{text-align:right}
  .invhead{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px}
  .invno{font-size:12px;text-align:right;line-height:1.7}
  table.kv{width:100%;font-size:13px;border-collapse:collapse;margin-bottom:18px}
  table.kv td{padding:5px 8px;border-bottom:1px solid #F1F5F9}
  table.kv td:first-child{color:#64748B;width:42%}
  table.fig{width:100%;font-size:13px;border-collapse:collapse}
  table.fig th,table.fig td{border:1px solid #CBD5E1;padding:8px 10px}
  table.fig th{background:#F8FAFC;font-size:11px;text-transform:uppercase;letter-spacing:.3px;color:#64748B;text-align:left}
  table.fig .sum td{font-weight:700}table.fig .net td{font-weight:800;font-size:15px;background:#F0FDFA}
  .sig{margin-top:44px;text-align:center}
  .sigline{border-bottom:1px solid #1A1D2E;width:300px;height:78px;margin:0 auto 6px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:2px}
  .signame{font-size:13px;font-weight:700}.sigmeta{font-size:10px;color:#0D9488;margin-top:2px}
  .docwrap{text-align:center}.docwrap img{max-width:100%;max-height:820px;border:1px solid #CBD5E1}
  .missing{color:#B91C1C;text-align:center;font-size:13px}
  table.summary{width:100%;font-size:12px;border-collapse:collapse;margin-top:16px}
  table.summary th,table.summary td{border:1px solid #CBD5E1;padding:6px 9px}
  table.summary th{background:#F8FAFC;font-size:10px;text-transform:uppercase;color:#64748B;text-align:left}
  tfoot td{font-weight:800;background:#F0FDFA}
  @media print{.page{padding:24px 8px}}
</style></head><body>
<section class="page">
  <h1>CS parttime payment — ${periodLabel(period)}</h1>
  <div class="muted">Pay period ${approved[0]?.inv?.periodStart ?? ""} → ${approved[0]?.inv?.periodEnd ?? ""} · ${approved.length} agents · released by ${by || "CS Manager"}</div>
  <table class="summary">
    <thead><tr><th>Agent</th><th>PCODE</th><th>Full name</th><th>Invoice</th><th class="r">Days</th><th class="r">OT</th><th class="r">Extra h</th><th class="r">Subtotal</th><th class="r">WHT 3%</th><th class="r">Net (THB)</th></tr></thead>
    <tbody>${summaryRows}</tbody>
    <tfoot><tr><td colspan="9">TOTAL — net payable</td><td class="r">฿${THB(batchTotal)}</td></tr></tfoot>
  </table>
  <p class="muted" style="margin-top:14px">Each agent follows: signed invoice · ID card copy · bookbank copy. Print this document to PDF for filing.</p>
</section>
${rows.map(({ inv, agent, signature }) => agentPackPages(inv, agent, signature)).join("")}
</body></html>`;
}

export function InvoiceBatchPanel({
  agents = [], invoices = [], setInvoices, period,
  computeFigures,          // (agentId, period) => figures | null
  recipients,              // { to: [], cc: [] } — persisted in globalFlags
  onSaveRecipients,        // ({to, cc}) => void
  role, loginUser,
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);   // { tone, text }
  const rcpt = recipients?.to?.length ? recipients : DEFAULT_FINANCE_RECIPIENTS;
  const [editingRcpt, setEditingRcpt] = useState(false);
  const [toDraft, setToDraft] = useState(rcpt.to.join(", "));
  const [ccDraft, setCcDraft] = useState(rcpt.cc.join(", "));

  const saveRcpt = () => {
    const to = parseEmailList(toDraft, 3);
    const cc = parseEmailList(ccDraft, 10).filter(a => !to.includes(a));
    if (!to.length) { setNote({ tone: "warn", text: "The To field needs at least one @crea.asia address." }); return; }
    onSaveRecipients?.({ to, cc });
    setToDraft(to.join(", ")); setCcDraft(cc.join(", "));
    setEditingRcpt(false); setNote(null);
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

    // Warn about stragglers, but never block — they can go in a second batch.
    const problems = [];
    if (waitingMgr.length) problems.push(`${waitingMgr.length} still waiting for your approval: ${waitingMgr.map(r => r.agent.name).join(", ")}`);
    if (notIn.length)      problems.push(`${notIn.length} have not submitted: ${notIn.map(r => r.agent.name).join(", ")}`);
    const msg =
      `Email "CS parttime payment — ${periodLabel(period)}" (${approved.length} agents, ฿${THB(batchTotal)})?\n\n` +
      `To: ${rcpt.to.join(", ")}\nCc: ${rcpt.cc.join(", ")}\n` +
      `Includes each agent's signed invoice, ID card and bookbank in one pack.\n` +
      (problems.length ? `\nNot included:\n${problems.map(p => "  • " + p).join("\n")}\n\nYou can share the rest in a second batch later.` : "");
    if (!window.confirm(msg)) return;

    setBusy(true);
    setNote(null);

    // 1. The pack — every approved agent's signed invoice + ID card + bookbank
    // in one printable file. Built and uploaded BEFORE the email so the link
    // in Finance's inbox is never dead.
    let packUrl = "";
    try {
      const html = buildBatchPack({ approved, agents, period, batchTotal, by: loginUser });
      const packPath = `invoice-packs/${period}/CS-parttime-${period}-${Date.now()}.html`;
      const { error: upErr } = await supabase.storage.from("payroll-docs")
        .upload(packPath, new Blob([html], { type: "text/html" }), { upsert: true, contentType: "text/html" });
      if (upErr) throw new Error(upErr.message);
      packUrl = supabase.storage.from("payroll-docs").getPublicUrl(packPath).data.publicUrl;
    } catch (e) {
      setNote({ tone: "warn", text: `NOT shared — could not build the document pack (${e.message || e}). Nothing was changed.` });
      setBusy(false);
      return;
    }

    // 2. The email IS the hand-off (Finance has no NiRM login), so it goes out
    // before anything is marked shared; a failed send changes nothing.
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch(`${FN_BASE}/invoice-notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s?.session?.access_token ?? ""}` },
        body: JSON.stringify({
          to: rcpt.to,
          cc: rcpt.cc,
          subject: `CS parttime payment — ${periodLabel(period)}`,
          text: batchEmailText({ approved, period, batchTotal, batchGross, batchWht, by: loginUser, waitingMgr, notIn, packUrl }),
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

    // 3. Only now do the invoices move.
    const now = stamp();
    const batchId = `${period}-${now.replace(/\D/g, "").slice(0, 14)}`;
    const ids = new Set(approved.map(r => r.inv.id));
    setInvoices(prev => prev.map(i => ids.has(i.id)
      ? {
          ...i, status: "sent_to_finance",
          batchId, sharedAt: now, sharedBy: loginUser, packUrl,
          history: [...(i.history || []), { at: now, by: loginUser || "—", role, action: "Shared with Finance by email", note: `batch ${batchId} → ${rcpt.to.join(", ")}` }],
        }
      : i
    ));
    setNote({ tone: "ok", text: `Emailed ${approved.length} invoices (฿${THB(batchTotal)}) to ${rcpt.to.join(", ")} — pack: ${packUrl}` });
    setBusy(false);
  };

  if (!isManager) return null;

  return (
    <div style={{ marginTop: 18, background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #F1F5F9", background: "#F8FAFC", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1D2E" }}>CS parttime payment — {periodLabel(period)}</div>
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
            {busy ? "Building pack…" : `Share ${approved.length || ""} to Finance ✉`.replace(/\s+/g, " ")}
          </button>
        </div>
      </div>

      {/* Distribution list — seeded with the CS parttime payment recipients */}
      <div style={{ padding: "9px 18px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap", background: "#fff" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.3, paddingTop: 4 }}>Recipients</span>
        {editingRcpt ? (
          <div style={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#64748B", width: 22 }}>To</span>
              <input value={toDraft} onChange={e => setToDraft(e.target.value)}
                style={{ flex: 1, padding: "6px 10px", borderRadius: 7, border: "1px solid #E2E8F0", fontSize: 12, fontFamily: "inherit" }}/>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#64748B", width: 22 }}>Cc</span>
              <input value={ccDraft} onChange={e => setCcDraft(e.target.value)}
                style={{ flex: 1, padding: "6px 10px", borderRadius: 7, border: "1px solid #E2E8F0", fontSize: 12, fontFamily: "inherit" }}/>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveRcpt}
                style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: "#0D9488", color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Save</button>
              <button onClick={() => { setToDraft(rcpt.to.join(", ")); setCcDraft(rcpt.cc.join(", ")); setEditingRcpt(false); }}
                style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, minWidth: 220, fontSize: 11, color: "#475569", lineHeight: 1.6 }}>
              <div><b style={{ color: "#1A1D2E" }}>To:</b> {rcpt.to.join(", ")}</div>
              <div><b style={{ color: "#1A1D2E" }}>Cc:</b> {rcpt.cc.join(", ")}</div>
            </div>
            <button onClick={() => { setToDraft(rcpt.to.join(", ")); setCcDraft(rcpt.cc.join(", ")); setEditingRcpt(true); }}
              style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Change
            </button>
          </>
        )}
      </div>

      {note && (
        <div style={{
          padding: "10px 18px", fontSize: 11, borderBottom: "1px solid #F1F5F9", wordBreak: "break-all",
          background: note.tone === "ok" ? "#ECFDF5" : "#FEF3C7",
          color: note.tone === "ok" ? "#065F46" : "#92400E",
        }}>{note.text}</div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              {["Agent", "PCODE", "Team", "Docs", "Days", "OT", "Extra h", "Subtotal", "WHT 3%", "Net payable", "Status"].map((h, i) => (
                <th key={h} style={{ padding: "8px 12px", textAlign: i >= 4 && i <= 9 ? "right" : "left", fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.3, borderBottom: "1px solid #E2E8F0", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ agent, inv, preview, status }) => {
              const s = INV_STATUS[status] || INV_STATUS.draft;
              const f = inv || preview;
              const pending = !inv;
              const hasId = !!(inv?.idCardPhotoUrl || agent.idCardPhotoUrl);
              const hasBank = !!(inv?.bookbankPhotoUrl || agent.bookbankPhotoUrl);
              return (
                <tr key={agent.id} style={{ borderBottom: "1px solid #F8FAFC", opacity: pending ? 0.55 : 1 }}>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: "#1A1D2E" }}>{agent.name}</td>
                  <td style={{ padding: "8px 12px", color: "#475569", fontFamily: "monospace", fontWeight: 700 }}>{inv?.pcode || agent.pcode || agent.id}</td>
                  <td style={{ padding: "8px 12px", color: "#64748B" }}>{agent.team}</td>
                  <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }} title={`ID card ${hasId ? "on file" : "MISSING"} · Bookbank ${hasBank ? "on file" : "MISSING"}`}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: hasId ? "#065F46" : "#B91C1C" }}>ID{hasId ? "✓" : "✗"}</span>{" "}
                    <span style={{ fontSize: 10, fontWeight: 800, color: hasBank ? "#065F46" : "#B91C1C" }}>BK{hasBank ? "✓" : "✗"}</span>
                  </td>
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
              <tr><td colSpan={11} style={{ padding: 24, textAlign: "center", color: "#94A3B8" }}>No daily-rate agents on the roster.</td></tr>
            )}
          </tbody>
          {approved.length > 0 && (
            <tfoot>
              <tr style={{ background: "#F8FAFC", borderTop: "2px solid #E2E8F0" }}>
                <td colSpan={7} style={{ padding: "10px 12px", fontWeight: 800, color: "#1A1D2E" }}>
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

function batchEmailText({ approved, period, batchTotal, batchGross, batchWht, by, waitingMgr, notIn, packUrl }) {
  const pad = (s, n) => String(s).padEnd(n).slice(0, n);
  const padL = (s, n) => String(s).padStart(n);
  const lines = [
    `CS parttime payment — ${periodLabel(period)}`,
    `Pay period ${approved[0]?.inv?.periodStart ?? ""} to ${approved[0]?.inv?.periodEnd ?? ""}`,
    `Approved and released by ${by || "CS Manager"}.`,
    "",
    `${pad("Agent", 15)}${pad("PCODE", 8)}${padL("Days", 5)}${padL("OT", 4)}${padL("Extra", 6)}${padL("Subtotal", 12)}${padL("WHT 3%", 10)}${padL("Net", 12)}`,
    "-".repeat(72),
  ];
  for (const { agent, inv } of approved) {
    lines.push(
      pad(agent.name, 15) + pad(inv.pcode || agent.pcode || "—", 8) + padL(inv.workDays, 5) + padL(inv.otDays || 0, 4) +
      padL(inv.extraHours || 0, 6) + padL(THB(inv.subtotal), 12) +
      padL(THB(inv.withholding), 10) + padL(THB(inv.netAmount), 12)
    );
  }
  lines.push("-".repeat(72));
  lines.push(pad(`TOTAL (${approved.length})`, 38) + padL(THB(batchGross), 12) + padL(THB(batchWht), 10) + padL(THB(batchTotal), 12));
  lines.push("");
  lines.push("PAYMENT DETAILS");
  for (const { agent, inv } of approved) {
    const pcode = inv.pcode || agent.pcode || agent.id || "—";
    const full = inv.fullName || agent.fullName || inv.agentName;
    const bank = [inv.bankName || agent.bankName, inv.bankAccount || agent.bankAccount].filter(Boolean).join(" ") || "bank details missing";
    const acctName = inv.bankAccountName || agent.bankAccountName;
    const tax = inv.taxId || agent.taxId;
    lines.push(`  ${pcode}  ${full} (${inv.agentName})`);
    lines.push(`      ${bank}${acctName ? ` (${acctName})` : ""}${tax ? ` · Tax ID ${tax}` : ""} · Net ฿${THB(inv.netAmount)}`);
  }
  lines.push("");
  lines.push("DOCUMENTS — signed invoices + ID card + bookbank for every agent,");
  lines.push("in one file (open and print to PDF for filing):");
  lines.push(packUrl || "(pack link missing)");
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
      "Invoice No", "Agent", "PCODE", "Period", "Working days", "OT days", "Extra hours",
      "Daily rate", "Subtotal", "Withholding 3%", "Net payable", "Status", "Batch",
      "Submitted", "Manager approved", "Emailed to Finance",
    ]];
    for (const i of shown) {
      rows.push([
        i.invoiceNumber, i.agentName, i.pcode || "", i.period, i.workDays, i.otDays, i.extraHours,
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
