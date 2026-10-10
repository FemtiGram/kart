// Read-only Google Analytics 4 + Search Console reports for datakart.no.
// Not part of the build — run by hand:
//
//   node scripts/analytics.mjs overview            GA4 totals per week
//   node scripts/analytics.mjs pages               GA4 top pages
//   node scripts/analytics.mjs sources             GA4 traffic channels/sources
//   node scripts/analytics.mjs hosts               GA4 hostnames (spot localhost/preview hits)
//   node scripts/analytics.mjs queries             Search Console top queries
//   node scripts/analytics.mjs gsc-pages           Search Console top pages
//   node scripts/analytics.mjs query-pages <page>  Search Console queries for one page (e.g. /valg)
//
// Options: --days 28 (default) · --limit 25 (default) · --json
//
// Auth: a Google service account with Viewer access to the GA4 property and
// Restricted access to the Search Console property. Its JSON key lives
// OUTSIDE the repo; .env.local (git-ignored) points to it:
//
//   GOOGLE_SERVICE_ACCOUNT_KEY=/Users/<you>/.config/datakart/ga-service-account.json
//   GA_PROPERTY_ID=123456789          (numeric property ID, not the G- tag)
//   GSC_SITE=sc-domain:datakart.no    (or https://www.datakart.no/ for a URL-prefix property)
//
// No dependencies: the OAuth token comes from a JWT signed with node:crypto.

import { readFileSync, existsSync } from "node:fs";
import { createSign } from "node:crypto";
import { join } from "node:path";

const ENV_PATH = join(process.cwd(), ".env.local");
if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

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

// ─── Auth ────────────────────────────────────────────────────────────────

const b64url = (s) => Buffer.from(s).toString("base64url");

async function accessToken(scopes) {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyPath) fail("GOOGLE_SERVICE_ACCOUNT_KEY is not set in .env.local (path to the service-account JSON key).");
  if (!existsSync(keyPath)) fail(`Service-account key not found at ${keyPath}`);
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({ iss: key.client_email, scope: scopes.join(" "), aud: key.token_uri, iat: now, exp: now + 3600 }),
  )}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key.private_key).toString("base64url");
  const res = await fetch(key.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json();
  if (!res.ok) fail(`Token request failed: ${body.error_description ?? body.error ?? res.status}`);
  return body.access_token;
}

async function post(url, token, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  const body = await res.json();
  if (!res.ok) fail(`${res.status} from ${new URL(url).host}: ${body.error?.message ?? JSON.stringify(body)}`);
  return body;
}

// ─── GA4 Data API ────────────────────────────────────────────────────────

async function ga4(report) {
  const property = process.env.GA_PROPERTY_ID;
  if (!property) fail("GA_PROPERTY_ID is not set in .env.local (numeric GA4 property ID).");
  const token = await accessToken(["https://www.googleapis.com/auth/analytics.readonly"]);
  const res = await post(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, token, {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "yesterday" }],
    ...report,
  });
  const dims = (res.dimensionHeaders ?? []).map((h) => h.name);
  const mets = (res.metricHeaders ?? []).map((h) => h.name);
  return (res.rows ?? []).map((r) => ({
    ...Object.fromEntries(dims.map((d, i) => [d, r.dimensionValues[i].value])),
    ...Object.fromEntries(mets.map((m, i) => [m, Number(r.metricValues[i].value)])),
  }));
}

// ─── Search Console API ──────────────────────────────────────────────────

async function gsc(body) {
  const site = process.env.GSC_SITE;
  if (!site) fail("GSC_SITE is not set in .env.local (e.g. sc-domain:datakart.no).");
  const token = await accessToken(["https://www.googleapis.com/auth/webmasters.readonly"]);
  // Search Console data lags ~2–3 days; end 3 days back so totals are final.
  const end = new Date(Date.now() - 3 * 864e5);
  const start = new Date(end.getTime() - (days - 1) * 864e5);
  const iso = (d) => d.toISOString().slice(0, 10);
  const res = await post(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    token,
    { startDate: iso(start), endDate: iso(end), rowLimit: limit, ...body },
  );
  return (res.rows ?? []).map((r) => ({
    key: r.keys.join(" · "),
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
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
  queries: async () => print(await gsc({ dimensions: ["query"] }), "Search Console top queries"),
  "gsc-pages": async () => print(await gsc({ dimensions: ["page"] }), "Search Console top pages"),
  "query-pages": async () => {
    const page = args[1];
    if (!page || page.startsWith("--")) fail("Usage: node scripts/analytics.mjs query-pages /valg");
    // Match the path on both datakart.no and www.datakart.no (Google indexes
    // both while the apex redirect is a 307), with or without a query string.
    const path = page.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    print(
      await gsc({
        dimensions: ["query"],
        dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "includingRegex", expression: `^https://(www\\.)?datakart\\.no${path}(\\?.*)?$` }] }],
      }),
      `Search Console queries for ${page}`,
    );
  },
};

if (!commands[command]) {
  console.log(`Usage: node scripts/analytics.mjs <${Object.keys(commands).join(" | ")}> [--days 28] [--limit 25] [--json]`);
  process.exit(command ? 1 : 0);
}
await commands[command]();
