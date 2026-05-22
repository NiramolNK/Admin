// ════════════════════════════════════════════════════════════════════════════
// Vercel Serverless Function — /api/cs-sync
//
// Pulls customer-service inquiry data from Monday.com boards and aggregates
// it into the shape that CSAnalyticsTab.jsx expects (cases, status, brands,
// platformTotals).
//
// Configure in Vercel → Project → Settings → Environment Variables:
//   MONDAY_API_TOKEN   — Monday API token (Personal Access Token from monday.com → Developers)
//
// Boards synced:
//   Q1 2026: 18393854274  (Jan-Mar)
//   Q2 2026: 18406331436  (Apr-Jun)
//
// Notes:
//   - Returns only case-related fields. Order counts and chat volumes still
//     come from the existing JSON import flow.
//   - Built-in 60-second rate limit (memoized per Vercel instance) to avoid
//     hammering the Monday API on repeated page loads.
// ════════════════════════════════════════════════════════════════════════════

const MONDAY_API_URL = "https://api.monday.com/v2";

const BOARDS = [
  { id: 18393854274, period: "Q1 2026", months: ["jan", "feb", "mar"] },
  { id: 18406331436, period: "Q2 2026", months: ["apr", "may", "jun"] },
];

const MONTH_LABEL = {
  jan: "January", feb: "February", mar: "March",
  apr: "April",   may: "May",      jun: "June",
  jul: "July",    aug: "August",   sep: "September",
  oct: "October", nov: "November", dec: "December",
};

// Map common Monday status labels → "solved" | "open"
// Anything not in SOLVED is treated as open. Case-insensitive.
const STATUS_SOLVED_LABELS = new Set([
  "done", "solved", "resolved", "closed", "complete", "completed", "finished",
]);

// ── In-memory cache (per Vercel instance) ───────────────────────────────────
let cache = { data: null, timestamp: 0 };
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

// ── Helpers ─────────────────────────────────────────────────────────────────
function monthCodeFromDate(yyyyMmDd) {
  if (!yyyyMmDd) return null;
  const m = String(yyyyMmDd).match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const monthNum = parseInt(m[2], 10);
  return ["", "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"][monthNum];
}

function brandGroup(brandName) {
  if (!brandName) return "Other";
  const lower = brandName.toLowerCase();
  if (lower.includes("nescafe") || lower.includes("nestle") || lower.includes("nespresso") || lower.includes("milo")) return "Nestle";
  if (lower.includes("pedigree") || lower.includes("whiskas") || lower.includes("mars-")) return "Mars";
  if (lower.includes("amore") || lower.includes("aestura") || lower.includes("hera-")) return "Amore";
  if (lower.includes("-cmg") || lower.endsWith(" cmg") || lower.includes("cmg ")) return "CMG";
  if (lower.includes("enfa") || lower.includes("mead")) return "MeadJohnson";
  return "Other";
}

function classifyStatus(text) {
  if (!text) return "open";
  if (STATUS_SOLVED_LABELS.has(String(text).toLowerCase().trim())) return "solved";
  return "open";
}

async function mondayQuery(query, apiToken) {
  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiToken,
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Monday API HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error("Monday API: " + JSON.stringify(json.errors));
  return json.data;
}

async function fetchAllBoardItems(boardId, apiToken) {
  const items = [];
  const COLS = `["brand","status","single_select__1","reason","date4"]`;

  // First page
  let q = `query { boards(ids: ${boardId}) { items_page(limit: 500) { cursor items { id column_values(ids: ${COLS}) { id text } } } } }`;
  let data = await mondayQuery(q, apiToken);
  let page = data.boards[0].items_page;
  items.push(...page.items);

  // Subsequent pages
  while (page.cursor) {
    q = `query { next_items_page(cursor: "${page.cursor}", limit: 500) { cursor items { id column_values(ids: ${COLS}) { id text } } } }`;
    data = await mondayQuery(q, apiToken);
    page = data.next_items_page;
    items.push(...page.items);
  }
  return items;
}

// ── Aggregation: turn raw items into the shape CSAnalyticsTab expects ──────
function aggregate(allBoardItems, allMonths) {
  // Maps for accumulation
  const brandTotals = new Map();        // brand → {cases, solved, open}
  const caseBreakdown = new Map();      // "brand|platform|reason|month" → count
  const statusBreakdown = new Map();    // "brand|platform|month|Status" → count
  const platformByMonth = new Map();    // "platform|month" → count
  const monthsSeen = new Set();

  for (const it of allBoardItems) {
    const cv = {};
    for (const c of it.column_values || []) cv[c.id] = c.text;

    const brand = (cv.brand || "").trim();
    const platform = (cv.single_select__1 || "").toLowerCase().trim();
    const reason = (cv.reason || "Other").trim() || "Other";
    const status = cv.status || "Open";
    const month = monthCodeFromDate(cv.date4);

    if (!brand || !month) continue;
    if (!allMonths.includes(month)) continue;
    if (!platform) continue;

    monthsSeen.add(month);

    // Brand totals
    if (!brandTotals.has(brand)) brandTotals.set(brand, { cases: 0, solved: 0, open: 0 });
    const bt = brandTotals.get(brand);
    bt.cases++;
    if (classifyStatus(status) === "solved") bt.solved++;
    else bt.open++;

    // Case breakdown (brand × platform × reason × month)
    const ck = `${brand}|${platform}|${reason}|${month}`;
    caseBreakdown.set(ck, (caseBreakdown.get(ck) || 0) + 1);

    // Status breakdown
    const sk = `${brand}|${platform}|${month}|${status}`;
    statusBreakdown.set(sk, (statusBreakdown.get(sk) || 0) + 1);

    // Platform totals per month
    const pk = `${platform}|${month}`;
    platformByMonth.set(pk, (platformByMonth.get(pk) || 0) + 1);
  }

  // ── Build output shape ────────────────────────────────────────────────────
  const months = allMonths.filter(m => monthsSeen.has(m));
  const monthLabels = Object.fromEntries(months.map(m => [m, MONTH_LABEL[m]]));

  const brands = Array.from(brandTotals.entries())
    .map(([name, totals]) => ({
      name,
      group: brandGroup(name),
      cases: totals.cases,
      solved: totals.solved,
      open: totals.open,
      comments: 0,
    }))
    .sort((a, b) => b.cases - a.cases);

  const cases = Array.from(caseBreakdown.entries()).map(([key, count]) => {
    const [brand, platform, reason, month] = key.split("|");
    return { brand, platform, reason, month, count };
  });

  const status = Array.from(statusBreakdown.entries()).map(([key, count]) => {
    const [brand, platform, month, Status] = key.split("|");
    return { brand, platform, month, Status, count };
  });

  // platformTotals: combine all platforms across the months we saw
  const platformTotalsMap = new Map();
  for (const [key, count] of platformByMonth.entries()) {
    const [platform, month] = key.split("|");
    if (!platformTotalsMap.has(platform)) {
      platformTotalsMap.set(platform, { name: platform.charAt(0).toUpperCase() + platform.slice(1), key: platform });
    }
    platformTotalsMap.get(platform)[month] = count;
  }
  const platformTotals = Array.from(platformTotalsMap.values());

  // Period label — use the latest period that has data
  let period = "Custom range";
  for (let i = BOARDS.length - 1; i >= 0; i--) {
    const hasData = BOARDS[i].months.some(m => monthsSeen.has(m));
    if (hasData) { period = BOARDS[i].period; break; }
  }

  return { period, months, monthLabels, brands, cases, status, platformTotals };
}

// ── Vercel handler ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  // Rate-limit / cache: if data was fetched in the last 60s, return it
  if (cache.data && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return res.status(200).json({
      ...cache.data,
      lastSyncAt: new Date(cache.timestamp).toISOString(),
      cached: true,
    });
  }

  const apiToken = process.env.MONDAY_API_TOKEN;
  if (!apiToken) {
    return res.status(500).json({
      error: "MONDAY_API_TOKEN environment variable is not set in Vercel.",
    });
  }

  try {
    const start = Date.now();
    const allMonths = BOARDS.flatMap(b => b.months);
    let allItems = [];

    for (const board of BOARDS) {
      const items = await fetchAllBoardItems(board.id, apiToken);
      allItems = allItems.concat(items);
    }

    const aggregated = aggregate(allItems, allMonths);
    aggregated.lastSyncAt = new Date().toISOString();
    aggregated.source = "monday";
    aggregated.itemCount = allItems.length;
    aggregated.durationMs = Date.now() - start;

    cache = { data: aggregated, timestamp: Date.now() };

    return res.status(200).json(aggregated);
  } catch (e) {
    console.error("cs-sync error:", e);
    return res.status(500).json({ error: e.message || "Sync failed" });
  }
}
