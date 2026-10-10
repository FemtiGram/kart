// Read-only Google Analytics 4 + Search Console reports for datakart.no.
// Not part of the build — run by hand:
//
//   node scripts/analytics.mjs overview            GA4 totals per week
//   node scripts/analytics.mjs pages               GA4 top pages
//   node scripts/analytics.mjs sources             GA4 traffic channels/sources
//   node scripts/analytics.mjs hosts               GA4 hostnames (spot localhost/preview hits)
//   node scripts/analytics.mjs devices             GA4 engagement by device
//   node scripts/analytics.mjs landing             GA4 landing pages (where visits start)
//   node scripts/analytics.mjs opps                Search Console: query+page pairs seen ≥40 times at position ≥4 (CTR wins)
//   node scripts/analytics.mjs queries             Search Console top queries
//   node scripts/analytics.mjs gsc-pages           Search Console top pages
//   node scripts/analytics.mjs query-pages <page>  Search Console queries for one page (e.g. /valg)
//
// Options: --days 28 (default) · --limit 25 (default) · --json
//
// Auth and settings: see scripts/lib/google-api.mjs.

import { ga4 as ga4Range, gsc as gscRange, pageRegex, isoDate, ConfigError } from "./lib/google-api.mjs";

const args = process.argv.slice(2);
const command = args[0];
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const days = Number(opt("days", 28));
const limit = Number(opt("limit", 25));
const asJson = args.includes("--json");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const ga4 = (report) => ga4Range(report, { startDate: `${days}daysAgo`, endDate: "yesterday" });

// Search Console data lags ~2–3 days; end 3 days back so totals are final.
function gsc(body) {
  const end = new Date(Date.now() - 3 * 864e5);
  const start = new Date(end.getTime() - (days - 1) * 864e5);
  return gscRange({ rowLimit: limit, ...body }, { startDate: isoDate(start), endDate: isoDate(end) });
}

// ─── Output ──────────────────────────────────────────────────────────────

const fmt = (v, col) => {
  if (typeof v !== "number") return String(v);
  if (col === "ctr") return `${(v * 100).toFixed(1)} %`;
  if (col === "position") return v.toFixed(1);
  if (col.endsWith("Duration") || col === "avgEngagementSec") return `${Math.round(v)} s`;
  if (col === "engagementRate") return `${(v * 100).toFixed(0)} %`;
  return Math.round(v).toLocaleString("nb-NO");
};

function print(rows, title) {
  // Drop the raw `keys` array the API module adds; `key` holds the joined form.
  rows = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "keys")));
  if (asJson) return console.log(JSON.stringify(rows, null, 2));
  console.log(`\n${title} — last ${days} days\n`);
  if (rows.length === 0) return console.log("(no rows)");
  const cols = Object.keys(rows[0]);
  const cells = rows.map((r) => cols.map((c) => fmt(r[c], c)));
  const widths = cols.map((c, i) => Math.min(60, Math.max(c.length, ...cells.map((row) => row[i].length))));
  const line = (vals) => vals.map((v, i) => (i === 0 ? v.slice(0, widths[i]).padEnd(widths[i]) : v.padStart(widths[i]))).join("  ");
  console.log(line(cols));
  console.log(widths.map((w) => "─".repeat(w)).join("  "));
  for (const row of cells) console.log(line(row));
}

// Engagement time per active user, the number GA4 shows as "average engagement time".
const withAvgEngagement = (rows) =>
  rows.map(({ userEngagementDuration, ...r }) => ({ ...r, avgEngagementSec: r.activeUsers ? userEngagementDuration / r.activeUsers : 0 }));

const commands = {
  overview: async () =>
    print(
      withAvgEngagement(await ga4({
        dimensions: [{ name: "isoYearIsoWeek" }],
        metrics: [{ name: "activeUsers" }, { name: "newUsers" }, { name: "sessions" }, { name: "screenPageViews" }, { name: "userEngagementDuration" }],
        orderBys: [{ dimension: { dimensionName: "isoYearIsoWeek" } }],
      })),
      "GA4 per ISO week",
    ),
  pages: async () =>
    print(
      withAvgEngagement(await ga4({
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }, { name: "userEngagementDuration" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit,
      })),
      "GA4 top pages",
    ),
  sources: async () =>
    print(
      await ga4({
        dimensions: [{ name: "sessionDefaultChannelGroup" }, { name: "sessionSource" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "engagementRate" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit,
      }),
      "GA4 traffic sources",
    ),
  // Which hostnames send hits — catches localhost / Vercel previews polluting production data.
  hosts: async () =>
    print(
      await ga4({
        dimensions: [{ name: "hostName" }],
        metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit,
      }),
      "GA4 hostnames",
    ),
  devices: async () =>
    print(
      withAvgEngagement(await ga4({
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "engagementRate" }, { name: "userEngagementDuration" }],
      })),
      "GA4 devices",
    ),
  landing: async () =>
    print(
      await ga4({
        dimensions: [{ name: "landingPage" }],
        metrics: [{ name: "sessions" }, { name: "engagementRate" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit,
      }),
      "GA4 landing pages",
    ),
  // Pages Google already shows for a query but that rarely get the click —
  // usually fixed by a title/description that answers the query.
  opps: async () => {
    const rows = await gsc({ dimensions: ["query", "page"], rowLimit: 5000 });
    print(
      rows
        .filter((r) => r.impressions >= 40 && r.position >= 4)
        .map((r) => ({ ...r, key: r.key.replace(/https:\/\/(www\.)?datakart\.no/, "") }))
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, limit),
      "Search Console opportunities (≥40 impressions, position ≥4)",
    );
  },
  queries: async () => print(await gsc({ dimensions: ["query"] }), "Search Console top queries"),
  "gsc-pages": async () => print(await gsc({ dimensions: ["page"] }), "Search Console top pages"),
  "query-pages": async () => {
    const page = args[1];
    if (!page || page.startsWith("--")) fail("Usage: node scripts/analytics.mjs query-pages /valg");
    // Match the path on both datakart.no and www.datakart.no (Google indexes
    // both while the apex redirect is a 307), with or without a query string.
    print(
      await gsc({
        dimensions: ["query"],
        dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "includingRegex", expression: pageRegex(page) }] }],
      }),
      `Search Console queries for ${page}`,
    );
  },
};

if (!commands[command]) {
  console.log(`Usage: node scripts/analytics.mjs <${Object.keys(commands).join(" | ")}> [--days 28] [--limit 25] [--json]`);
  process.exit(command ? 1 : 0);
}
try {
  await commands[command]();
} catch (err) {
  fail(err instanceof ConfigError ? err.message : `Error: ${err.message}`);
}
