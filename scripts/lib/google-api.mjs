// Shared read-only access to Google Analytics 4 and Search Console for the
// analytics scripts (scripts/analytics.mjs, scripts/analytics-report.mjs).
//
// Auth: a service account whose JSON key lives OUTSIDE the repo. .env.local
// (git-ignored) holds:
//   GOOGLE_SERVICE_ACCOUNT_KEY=/Users/<you>/.config/datakart/ga-service-account.json
//   GA_PROPERTY_ID=123456789          (numeric property ID, not the G- tag)
//   GSC_SITE=sc-domain:datakart.no
// No dependencies: the OAuth token comes from a JWT signed with node:crypto.

import { readFileSync, existsSync } from "node:fs";
import { createSign } from "node:crypto";
import { join } from "node:path";

const ENV_PATH = join(process.cwd(), ".env.local");
if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

export class ConfigError extends Error {}

const b64url = (s) => Buffer.from(s).toString("base64url");
const tokens = new Map();

async function accessToken(scope) {
  if (tokens.has(scope)) return tokens.get(scope);
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyPath) throw new ConfigError("GOOGLE_SERVICE_ACCOUNT_KEY is not set in .env.local (path to the service-account JSON key).");
  if (!existsSync(keyPath)) throw new ConfigError(`Service-account key not found at ${keyPath}`);
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({ iss: key.client_email, scope, aud: key.token_uri, iat: now, exp: now + 3600 }),
  )}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key.private_key).toString("base64url");
  const res = await fetch(key.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Token request failed: ${body.error_description ?? body.error ?? res.status}`);
  tokens.set(scope, body.access_token);
  return body.access_token;
}

async function post(url, scope, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(scope)}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}: ${body.error?.message ?? JSON.stringify(body)}`);
  return body;
}

/** "2026-09-30" for a Date (UTC). */
export const isoDate = (d) => d.toISOString().slice(0, 10);

/**
 * GA4 runReport → plain rows. `range` is { startDate, endDate } in GA4 syntax
 * ("2026-09-01", "28daysAgo", "yesterday").
 */
export async function ga4(report, range) {
  const property = process.env.GA_PROPERTY_ID;
  if (!property) throw new ConfigError("GA_PROPERTY_ID is not set in .env.local (numeric GA4 property ID).");
  const res = await post(
    `https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`,
    "https://www.googleapis.com/auth/analytics.readonly",
    { dateRanges: [range], ...report },
  );
  const dims = (res.dimensionHeaders ?? []).map((h) => h.name);
  const mets = (res.metricHeaders ?? []).map((h) => h.name);
  return (res.rows ?? []).map((r) => ({
    ...Object.fromEntries(dims.map((d, i) => [d, r.dimensionValues[i].value])),
    ...Object.fromEntries(mets.map((m, i) => [m, Number(r.metricValues[i].value)])),
  }));
}

/**
 * Search Console searchAnalytics.query → rows of { key, clicks, impressions,
 * ctr, position }. `range` is { startDate, endDate } as YYYY-MM-DD. Data lags
 * 2–3 days, so ranges ending within the last 3 days are incomplete.
 */
export async function gsc(body, range) {
  const site = process.env.GSC_SITE;
  if (!site) throw new ConfigError("GSC_SITE is not set in .env.local (e.g. sc-domain:datakart.no).");
  const res = await post(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    "https://www.googleapis.com/auth/webmasters.readonly",
    { rowLimit: 25, ...range, ...body },
  );
  // Rows have no `keys` when the query has no dimensions (period totals).
  return (res.rows ?? []).map((r) => ({
    key: (r.keys ?? []).join(" · "),
    keys: r.keys ?? [],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
}

/** Search Console page URL → path, folding datakart.no and www.datakart.no together. */
export const pagePath = (url) => url.replace(/^https:\/\/(www\.)?datakart\.no/, "") || "/";

/** Regex matching a path on both hosts, with or without a query string. */
export const pageRegex = (path) =>
  `^https://(www\\.)?datakart\\.no${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\?.*)?$`;
