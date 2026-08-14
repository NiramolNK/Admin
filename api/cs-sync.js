// ════════════════════════════════════════════════════════════════════════════
// Vercel Serverless Function — /api/cs-sync
//
// Pulls customer-service inquiry data from Monday.com boards and aggregates
// it into the shape that CSAnalyticsTab.jsx expects (cases, status, brands,
// platformTotals).
//
// Configure in Vercel → Project → Settings → Environment Variables:
//   MONDAY_API_TOKEN     — Monday API token (Personal Access Token)
//   CS_SYNC_YEAR         — (optional) force a reporting year, e.g. "2026".
//                          Defaults to the current year in Asia/Bangkok.
//   MONDAY_CS_BOARD_IDS  — (optional) comma-separated board IDs. If set, board
//                          auto-discovery is skipped and exactly these are used.
//
// BOARD DISCOVERY (why this changed)
//   Monday caps a board at 10,000 items, so the CS team rolls onto a new board
//   whenever one fills up — Q1, Q2, then "Q2-2", then Q3, and so on. Board IDs
//   used to be hard-coded here, which meant every rollover silently dropped the
//   newest months from CS Analytics (July 2026 vanished this way).
//   We now discover every active board whose name matches
//       <reporting year> ... "inquiry Laz Shp TT"
//   so future rollovers (Q4, Q3-2, …) are picked up with no code change.
//
// YEAR SAFETY
//   Month codes (jan/feb/…) carry no year, so a 2025 board would merge straight
//   into 2026's numbers. Every item is therefore filtered on the YEAR of its
//   Inquiry date (date4) as well — a stray board can no longer pollute totals.
//
// Notes:
//   - Returns only case-related fields. Order counts and chat volumes still
//     come from the CUSP sync / Chat Volume grid.
//   - Built-in 60-second rate limit (memoized per Vercel instance).
// ════════════════════════════════════════════════════════════════════════════

const MONDAY_API_URL = "https://api.monday.com/v2";

// Board names that hold CS inquiries. Matched case-insensitively against
// active boards, alongside the reporting year.
const BOARD_NAME_RE = /inquiry\s*laz\s*shp\s*tt/i;

// Used only if board discovery fails (Monday API hiccup). Keeps the endpoint
// serving yesterday's board set rather than returning nothing.
const FALLBACK_BOARD_IDS = [
  18393854274, // 2026 Q1  Jan-Mar
  18406331436, // 2026 Q2  Apr-Jun
  18416928857, // 2026 Q2-2 Jun-Jul
  18425991403, // 2026 Q3  Jul-Sep
];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

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
function reportingYear() {
  if (process.env.CS_SYNC_YEAR) return parseInt(process.env.CS_SYNC_YEAR, 10);
  // Current year in Asia/Bangkok, independent of the Vercel region's clock.
  const bkk = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return bkk.getUTCFullYear();
}

// "2026-07-14" → { year: 2026, month: "jul" }, or null.
function parseInquiryDate(yyyyMmDd) {
  if (!yyyyMmDd) return null;
  const m = String(yyyyMmDd).match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const monthNum = parseInt(m[2], 10);
  if (monthNum < 1 || monthNum > 12) return null;
  return { year: parseInt(m[1], 10), month: MONTHS[monthNum - 1] };
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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Monday enforces a per-minute complexity budget. Because we now pull four or
// more boards in parallel we can trip it, so back off and retry rather than
// failing the whole sync.
async function mondayQuery(query, apiToken, attempt = 0) {
  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiToken,
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query }),
  });

  if (res.status === 429 && attempt < 3) {
    await sleep(2000 * (attempt + 1));
    return mondayQuery(query, apiToken, attempt + 1);
  }
  if (!res.ok) throw new Error(`Monday API HTTP ${res.status}`);

  const json = await res.json();
  if (json.errors) {
    const msg = JSON.stringify(json.errors);
    if (/complexity|rate.?limit|budget/i.test(msg) && attempt < 3) {
      const wait = Number((msg.match(/"retry_in_seconds":\s*(\d+)/) || [])[1] || 0);
      await sleep(wait ? wait * 1000 : 2000 * (attempt + 1));
      return mondayQuery(query, apiToken, attempt + 1);
    }
    throw new Error("Monday API: " + msg);
  }
  return json.data;
}

// ── Board discovery ─────────────────────────────────────────────────────────
// Every active top-level board whose name contains the reporting year AND
// matches BOARD_NAME_RE. Sub-item boards ("Subitems of …") are excluded by the
// `type` check — their items are child rows, not inquiries.
async function discoverBoards(apiToken, year) {
  const override = (process.env.MONDAY_CS_BOARD_IDS || "").trim();
  if (override) {
    return override
      .split(",")
      .map(s => parseInt(s.trim(), 10))
      .filter(Boolean)
      .map(id => ({ id, name: `board ${id} (env override)` }));
  }

  const found = [];
  for (let page = 1; page <= 20; page++) {
    const q = `query { boards(limit: 100, page: ${page}, state: active) { id name type } }`;
    const data = await mondayQuery(q, apiToken);
    const batch = data?.boards || [];
    if (batch.length === 0) break;
    for (const b of batch) {
      if (b.type && b.type !== "board") continue;                 // skip sub-item boards
      if (/^subitems of/i.test(b.name || "")) continue;           // belt and braces
      if (!BOARD_NAME_RE.test(b.name || "")) continue;
      if (!String(b.name).includes(String(year))) continue;
      found.push({ id: Number(b.id), name: b.name });
    }
    if (batch.length < 100) break;
  }
  return found;
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
function aggregate(allBoardItems, year) {
  // Maps for accumulation
  const brandTotals = new Map();        // brand → {cases, solved, open}
  const caseBreakdown = new Map();      // "brand|platform|reason|month" → count
  const statusBreakdown = new Map();    // "brand|platform|month|Status" → count
  const platformByMonth = new Map();    // "platform|month" → count
  const monthsSeen = new Set();
  const perMonthCount = {};             // diagnostics: month → items counted
  let skippedWrongYear = 0;

  for (const it of allBoardItems) {
    const cv = {};
    for (const c of it.column_values || []) cv[c.id] = c.text;

    const brand = (cv.brand || "").trim();
    const platform = (cv.single_select__1 || "").toLowerCase().trim();
    const reason = (cv.reason || "Other").trim() || "Other";
    const status = cv.status || "Open";
    const when = parseInquiryDate(cv.date4);

    if (!brand || !when || !platform) continue;
    if (when.year !== year) { skippedWrongYear++; continue; }
    const month = when.month;

    monthsSeen.add(month);
    perMonthCount[month] = (perMonthCount[month] || 0) + 1;

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
  const months = MONTHS.filter(m => monthsSeen.has(m));   // always chronological
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

  // Period label — derived from the months actually present, e.g. "Jan–Aug 2026"
  const period = months.length
    ? (months.length === 1
        ? `${MONTH_LABEL[months[0]]} ${year}`
        : `${MONTH_LABEL[months[0]]}–${MONTH_LABEL[months[months.length - 1]]} ${year}`)
    : `${year}`;

  return { period, months, monthLabels, brands, cases, status, platformTotals, perMonthCount, skippedWrongYear };
}

// ── Vercel handler ─────────────────────────────────────────────────────────
// Four+ boards of up to 10k items each need more than the default 10s.
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const force = "force" in (req.query || {}) || "refresh" in (req.query || {});

  // Rate-limit / cache: if data was fetched in the last 60s, return it
  if (!force && cache.data && Date.now() - cache.timestamp < CACHE_TTL_MS) {
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
    const year = reportingYear();

    let boards = [];
    let discoveryError = null;
    try {
      boards = await discoverBoards(apiToken, year);
    } catch (e) {
      discoveryError = e.message || String(e);
    }
    if (boards.length === 0) {
      boards = FALLBACK_BOARD_IDS.map(id => ({ id, name: `board ${id} (fallback)` }));
    }

    // Fetch boards in parallel — pagination inside a board is cursor-driven and
    // therefore sequential, so wall-clock is now the slowest board rather than
    // the sum of all of them. With four boards (~30k items) the serial version
    // was close to the function timeout.
    const fetched = await Promise.all(
      boards.map(async (board) => ({
        board,
        items: await fetchAllBoardItems(board.id, apiToken),
      }))
    );

    // De-duplicate by Monday item id, in case a board is ever listed twice.
    const byId = new Map();
    const boardStats = [];
    for (const { board, items } of fetched) {
      boardStats.push({ id: board.id, name: board.name, items: items.length });
      for (const it of items) byId.set(it.id, it);
    }
    const allItems = Array.from(byId.values());

    const aggregated = aggregate(allItems, year);
    aggregated.lastSyncAt = new Date().toISOString();
    aggregated.source = "monday";
    aggregated.year = year;
    aggregated.boards = boardStats;
    aggregated.itemCount = allItems.length;
    aggregated.durationMs = Date.now() - start;
    if (discoveryError) aggregated.discoveryError = discoveryError;

    cache = { data: aggregated, timestamp: Date.now() };

    return res.status(200).json(aggregated);
  } catch (e) {
    console.error("cs-sync error:", e);
    return res.status(500).json({ error: e.message || "Sync failed" });
  }
}
