// Monthly analytics report for datakart.no as Markdown (GA4 + Search Console).
// Run by scripts/monthly-report.sh (launchd, on the 4th of each month), or by hand:
//
//   node scripts/analytics-report.mjs                 previous calendar month
//   node scripts/analytics-report.mjs --month 2026-09
//   node scripts/analytics-report.mjs --json         the same numbers as JSON (for the visual HTML report)
//
// Writes Markdown (or JSON) to stdout. Compares the month with the month before, and
// follows up the SEO changes in TRACKED by comparing Search Console for the
// 28 days before each change with the report month. No numbers live in this
// file (the repo is public); everything is read live from the APIs.
//
// Auth and settings: see scripts/lib/google-api.mjs.

import { ga4, gsc, isoDate, pagePath, pageRegex, ConfigError } from "./lib/google-api.mjs";

// Changes to follow up month by month. `page` is a path, or a regex source
// matched against the full URL; `query` (optional) is a regex source.
const TRACKED = [
  { label: "/map: title + position button for «hvor høyt over havet er jeg»", labelNb: "Høydekart: ny tittel og «Hvor høyt over havet er jeg?»-knapp", changedOn: "2026-10-10", page: "/map", query: "høyt over havet|over havet|min posisjon|moh" },
  { label: "Kommune pages: «Hvor mange bor i …» titles + 2026 population", labelNb: "Kommunesidene: «Hvor mange bor i …»-titler og folketall for 2026", changedOn: "2026-10-10", pageRe: "^https://(www\\.)?datakart\\.no/kommune/.+", query: "innbyggere|bor i|bor det i|folketall|befolkning" },
  { label: "/eiendom: title, intro and FAQ for «tomtegrenser»", labelNb: "Tomtegrenser: ny tittel, introtekst og spørsmål og svar", changedOn: "2026-10-11", page: "/eiendom" },
  { label: "/valg: 1945–2025 timeline + crawlable table", labelNb: "Valgkart: tidslinje 1945–2025 og tabell for Google", changedOn: "2026-10-10", page: "/valg" },
];

// ─── Periods ─────────────────────────────────────────────────────────────

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

function monthRange(ym) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  return { startDate: isoDate(start), endDate: isoDate(end) };
}
const prevMonth = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return isoDate(new Date(Date.UTC(y, m - 2, 1))).slice(0, 7);
};

const now = new Date();
const month = arg("month") ?? isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))).slice(0, 7);
const cur = monthRange(month);
const prev = monthRange(prevMonth(month));
const monthName = (ym) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

// ─── Formatting ──────────────────────────────────────────────────────────

const n = (v) => Math.round(v).toLocaleString("en-GB");
const pct = (v) => `${(v * 100).toFixed(1)} %`;
const pos = (v) => (v ? v.toFixed(1) : "–");
const sec = (v) => `${Math.round(v)} s`;
function change(a, b) {
  if (!b) return a ? "new" : "–";
  const d = (a - b) / b;
  return `${d >= 0 ? "+" : ""}${(d * 100).toFixed(0)} %`;
}
const cell = (v) => String(v).replace(/\|/g, "\\|");
function table(headers, rows) {
  if (rows.length === 0) return "_No data._\n";
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map((_, i) => (i === 0 ? "---" : "---:")).join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`),
  ].join("\n") + "\n";
}

// ─── Data ────────────────────────────────────────────────────────────────

const totalsReport = {
  metrics: ["activeUsers", "newUsers", "sessions", "screenPageViews", "engagementRate", "userEngagementDuration"].map((name) => ({ name })),
};

async function gaTotals(range) {
  const [row] = await ga4(totalsReport, range);
  return row ?? {};
}

async function gscAll(dimensions, range, extra = {}) {
  return gsc({ dimensions, rowLimit: 5000, ...extra }, range);
}

/** Search Console clicks/impressions/CTR/position for a page (+ query) filter. */
async function gscFiltered(t, range) {
  const filters = [{ dimension: "page", operator: "includingRegex", expression: t.pageRe ?? pageRegex(t.page) }];
  if (t.query) filters.push({ dimension: "query", operator: "includingRegex", expression: t.query });
  const [row] = await gsc({ dimensionFilterGroups: [{ filters }] }, range);
  return row ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
}

const byKey = (rows, keyFn = (r) => r.key) => new Map(rows.map((r) => [keyFn(r), r]));

/** Fold apex + www page rows (Google indexes both while the apex 307s). */
function mergePages(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = pagePath(r.keys[0]).split("?")[0];
    const e = m.get(k) ?? { key: k, clicks: 0, impressions: 0, posWeighted: 0 };
    e.clicks += r.clicks;
    e.impressions += r.impressions;
    e.posWeighted += r.position * r.impressions;
    m.set(k, e);
  }
  return [...m.values()].map((e) => ({ ...e, ctr: e.impressions ? e.clicks / e.impressions : 0, position: e.impressions ? e.posWeighted / e.impressions : 0 }));
}

async function main() {
  const [gaCur, gaPrev] = await Promise.all([gaTotals(cur), gaTotals(prev)]);
  const channelReport = { dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }] };
  const [chCur, chPrev] = await Promise.all([ga4(channelReport, cur), ga4(channelReport, prev)]);
  const devices = await ga4({ dimensions: [{ name: "deviceCategory" }], metrics: [{ name: "activeUsers" }, { name: "engagementRate" }, { name: "userEngagementDuration" }], orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }] }, cur);
  const pageReport = { dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }, { name: "userEngagementDuration" }], orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: 200 };
  const [pgCur, pgPrev] = await Promise.all([ga4(pageReport, cur), ga4(pageReport, prev)]);
  const events = await ga4({ dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }], dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: ["min_posisjon"] } } } }, cur);

  const [scCur, scPrev] = await Promise.all([gsc({}, cur), gsc({}, prev)]);
  const [qCur, qPrev] = await Promise.all([gscAll(["query"], cur), gscAll(["query"], prev)]);
  const [pCur, pPrev] = await Promise.all([gscAll(["page"], cur), gscAll(["page"], prev)]);
  const qp = await gscAll(["query", "page"], cur);

  const tracked = [];
  for (const t of TRACKED) {
    const changed = new Date(`${t.changedOn}T00:00:00Z`);
    const before = { startDate: isoDate(new Date(changed.getTime() - 28 * 864e5)), endDate: isoDate(new Date(changed.getTime() - 864e5)) };
    if (cur.endDate < t.changedOn) {
      tracked.push({ t, pending: true });
      continue;
    }
    // Report month, but never days before the change.
    const after = { startDate: cur.startDate > t.changedOn ? cur.startDate : t.changedOn, endDate: cur.endDate };
    const [b, a] = await Promise.all([gscFiltered(t, before), gscFiltered(t, after)]);
    const days = (r) => (new Date(r.endDate) - new Date(r.startDate)) / 864e5 + 1;
    tracked.push({ t, before, after, b, a, daysBefore: days(before), daysAfter: days(after) });
  }

  // Six calendar months up to the report month, for the trend chart.
  const histStart = (() => {
    const [y, m] = month.split("-").map(Number);
    return isoDate(new Date(Date.UTC(y, m - 6, 1)));
  })();
  const histRange = { startDate: histStart, endDate: cur.endDate };
  const [gaHist, scDaily] = await Promise.all([
    ga4({ dimensions: [{ name: "yearMonth" }], metrics: [{ name: "activeUsers" }], orderBys: [{ dimension: { dimensionName: "yearMonth" } }] }, histRange),
    gsc({ dimensions: ["date"], rowLimit: 500 }, histRange),
  ]);
  const clicksByMonth = new Map();
  for (const r of scDaily) clicksByMonth.set(r.keys[0].slice(0, 7), (clicksByMonth.get(r.keys[0].slice(0, 7)) ?? 0) + r.clicks);
  const history = gaHist.map((r) => {
    const ym = `${r.yearMonth.slice(0, 4)}-${r.yearMonth.slice(4)}`;
    return { month: ym, users: r.activeUsers, clicks: clicksByMonth.get(ym) ?? 0 };
  });

  const sc = scCur[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const scp = scPrev[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const qPrevMap = byKey(qPrev);
  const movers = [...new Set([...qCur.map((r) => r.key), ...qPrev.map((r) => r.key)])]
    .map((k) => ({ k, a: qCur.find((r) => r.key === k)?.clicks ?? 0, b: qPrevMap.get(k)?.clicks ?? 0 }))
    .map((m) => ({ ...m, d: m.a - m.b }))
    .filter((m) => m.d !== 0)
    .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
    .slice(0, 10);
  const pagesMerged = mergePages(pCur).sort((a, b) => b.impressions - a.impressions);
  const pPrevMap = byKey(mergePages(pPrev));
  const apex = pCur.filter((r) => /^https:\/\/datakart\.no/.test(r.keys[0])).reduce((s, r) => s + r.impressions, 0);
  const opportunities = qp.filter((r) => r.impressions >= 40 && r.position >= 4).sort((a, b) => b.impressions - a.impressions).slice(0, 15);
  const pos_ = events.find((e) => e.eventName === "min_posisjon");
  const chPrevMap = byKey(chPrev, (r) => r.sessionDefaultChannelGroup);
  const pgPrevMap = byKey(pgPrev, (r) => r.pagePath);

  if (process.argv.includes("--json")) {
    const per = (x, r, days) => ({ range: r, clicksPerDay: x.clicks / days, impressionsPerDay: x.impressions / days, ctr: x.ctr, position: x.position });
    process.stdout.write(JSON.stringify({
      month, prevMonth: prevMonth(month), monthName: monthName(month), prevMonthName: monthName(prevMonth(month)), generated: isoDate(new Date()),
      ga: {
        cur: gaCur, prev: gaPrev,
        channels: chCur.map((r) => ({ name: r.sessionDefaultChannelGroup, sessions: r.sessions, prev: chPrevMap.get(r.sessionDefaultChannelGroup)?.sessions ?? 0 })),
        devices: devices.map((r) => ({ name: r.deviceCategory, users: r.activeUsers, engagementRate: r.engagementRate, avgSec: r.userEngagementDuration / (r.activeUsers || 1) })),
        pages: pgCur.slice(0, 10).map((r) => ({ path: r.pagePath, views: r.screenPageViews, prev: pgPrevMap.get(r.pagePath)?.screenPageViews ?? 0, users: r.activeUsers, avgSec: r.userEngagementDuration / (r.activeUsers || 1) })),
        minPosisjon: pos_?.eventCount ?? 0,
      },
      search: {
        cur: sc, prev: scp,
        queries: [...qCur].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 10).map((r) => ({ query: r.key, clicks: r.clicks, prev: qPrevMap.get(r.key)?.clicks ?? 0, impressions: r.impressions, position: r.position })),
        movers: movers.map((m) => ({ query: m.k, clicks: m.a, prev: m.b })),
        pages: pagesMerged.slice(0, 10).map((r) => ({ path: r.key, clicks: r.clicks, prev: pPrevMap.get(r.key)?.clicks ?? 0, impressions: r.impressions, position: r.position })),
        apexImpressions: apex,
        opportunities: opportunities.map((r) => ({ query: r.keys[0], page: pagePath(r.keys[1]), clicks: r.clicks, impressions: r.impressions, position: r.position })),
      },
      history,
      tracked: tracked.map((x) => x.pending
        ? { label: x.t.labelNb ?? x.t.label, changedOn: x.t.changedOn, pending: true }
        : { label: x.t.labelNb ?? x.t.label, changedOn: x.t.changedOn, pending: false, before: per(x.b, x.before, x.daysBefore), after: per(x.a, x.after, x.daysAfter) }),
    }, null, 2));
    return;
  }

  // ─── Markdown ──────────────────────────────────────────────────────────

  const out = [];
  out.push(`# Datakart — analytics report for ${monthName(month)}`);
  out.push(`_Compared with ${monthName(prevMonth(month))}. GA4 property ${process.env.GA_PROPERTY_ID}, Search Console ${process.env.GSC_SITE}. Generated ${isoDate(new Date())}._\n`);

  out.push("## Traffic (GA4)\n");
  out.push(table(["Metric", monthName(month), monthName(prevMonth(month)), "Change"], [
    ["Active users", n(gaCur.activeUsers ?? 0), n(gaPrev.activeUsers ?? 0), change(gaCur.activeUsers, gaPrev.activeUsers)],
    ["New users", n(gaCur.newUsers ?? 0), n(gaPrev.newUsers ?? 0), change(gaCur.newUsers, gaPrev.newUsers)],
    ["Sessions", n(gaCur.sessions ?? 0), n(gaPrev.sessions ?? 0), change(gaCur.sessions, gaPrev.sessions)],
    ["Page views", n(gaCur.screenPageViews ?? 0), n(gaPrev.screenPageViews ?? 0), change(gaCur.screenPageViews, gaPrev.screenPageViews)],
    ["Engagement rate", pct(gaCur.engagementRate ?? 0), pct(gaPrev.engagementRate ?? 0), ""],
    ["Avg. engagement per user", sec((gaCur.userEngagementDuration ?? 0) / (gaCur.activeUsers || 1)), sec((gaPrev.userEngagementDuration ?? 0) / (gaPrev.activeUsers || 1)), ""],
  ]));

  out.push("### Channels\n");
  out.push(table(["Channel", "Sessions", "Previous", "Change"], chCur.map((r) => {
    const p = chPrevMap.get(r.sessionDefaultChannelGroup)?.sessions ?? 0;
    return [r.sessionDefaultChannelGroup, n(r.sessions), n(p), change(r.sessions, p)];
  })));

  out.push("### Devices\n");
  out.push(table(["Device", "Users", "Engagement rate", "Avg. engagement"], devices.map((r) => [r.deviceCategory, n(r.activeUsers), pct(r.engagementRate), sec(r.userEngagementDuration / (r.activeUsers || 1))])));

  out.push("### Top pages\n");
  out.push(table(["Page", "Views", "Previous", "Change", "Users", "Avg. engagement"], pgCur.slice(0, 15).map((r) => {
    const p = pgPrevMap.get(r.pagePath)?.screenPageViews ?? 0;
    return [r.pagePath, n(r.screenPageViews), n(p), change(r.screenPageViews, p), n(r.activeUsers), sec(r.userEngagementDuration / (r.activeUsers || 1))];
  })));
  out.push(`«Min posisjon» lookups on /map (event \`min_posisjon\`, CTA + search-bar button): ${pos_ ? n(pos_.eventCount) : "0 (event introduced Oct 2026)"}.\n`);

  out.push("## Google Search (Search Console)\n");
  out.push(table(["Metric", monthName(month), monthName(prevMonth(month)), "Change"], [
    ["Clicks", n(sc.clicks), n(scp.clicks), change(sc.clicks, scp.clicks)],
    ["Impressions", n(sc.impressions), n(scp.impressions), change(sc.impressions, scp.impressions)],
    ["CTR", pct(sc.ctr), pct(scp.ctr), ""],
    ["Avg. position", pos(sc.position), pos(scp.position), ""],
  ]));

  out.push("### Top searches\n");
  out.push(table(["Search", "Clicks", "Previous", "Impressions", "CTR", "Position"], [...qCur].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 20).map((r) => [r.key, n(r.clicks), n(qPrevMap.get(r.key)?.clicks ?? 0), n(r.impressions), pct(r.ctr), pos(r.position)])));

  out.push("### Biggest movers (clicks vs previous month)\n");
  out.push(table(["Search", "Clicks", "Previous", "Δ"], movers.map((m) => [m.k, n(m.a), n(m.b), `${m.d > 0 ? "+" : ""}${n(m.d)}`])));

  out.push("### Pages in Google (datakart.no and www folded together)\n");
  out.push(table(["Page", "Clicks", "Previous", "Impressions", "CTR", "Position"], pagesMerged.slice(0, 15).map((r) => [r.key, n(r.clicks), n(pPrevMap.get(r.key)?.clicks ?? 0), n(r.impressions), pct(r.ctr), pos(r.position)])));
  out.push(`Impressions on apex URLs (https://datakart.no/…, not www): ${n(apex)} of ${n(sc.impressions)}. Should fall towards 0 once the apex redirect is a permanent 308.\n`);

  out.push("### Opportunities (shown ≥ 40 times at position ≥ 4)\n");
  out.push(table(["Search", "Page", "Clicks", "Impressions", "CTR", "Position"], opportunities.map((r) => [r.keys[0], pagePath(r.keys[1]), n(r.clicks), n(r.impressions), pct(r.ctr), pos(r.position)])));

  out.push("## Tracked changes\n");
  out.push("_Search Console for the 28 days before each change vs the report month (from the change date). Clicks and impressions are per day, since the periods differ in length._\n");
  for (const x of tracked) {
    out.push(`### ${x.t.label} (changed ${x.t.changedOn})\n`);
    if (x.pending) { out.push("_Change is after this report month — first numbers next month._\n"); continue; }
    out.push(table(["", "Clicks/day", "Impressions/day", "CTR", "Position"], [
      [`Before (${x.before.startDate} – ${x.before.endDate})`, (x.b.clicks / x.daysBefore).toFixed(1), (x.b.impressions / x.daysBefore).toFixed(0), pct(x.b.ctr), pos(x.b.position)],
      [`After (${x.after.startDate} – ${x.after.endDate})`, (x.a.clicks / x.daysAfter).toFixed(1), (x.a.impressions / x.daysAfter).toFixed(0), pct(x.a.ctr), pos(x.a.position)],
    ]));
  }

  process.stdout.write(out.join("\n"));
}

main().catch((err) => {
  console.error(err instanceof ConfigError ? err.message : `analytics-report failed: ${err.message}`);
  process.exit(1);
});
