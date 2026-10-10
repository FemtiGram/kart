// Turns the monthly report data (analytics-report.mjs --json) and Claude's
// plain-language findings into one self-contained, offline HTML page in
// Norwegian. No libraries, fonts or network: charts are plain HTML/CSS.
//
//   node scripts/render-report-html.mjs <data.json> [findings.json] > report.html
//
// Every string from Google (search terms, URLs) is escaped. Chart colours:
// one brand blue for single-series bars; before/after is two steps of the
// same blue (validated for colour-vision deficiency, light and dark).

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const [dataPath, findingsPath] = process.argv.slice(2);
if (!dataPath) {
  console.error("Usage: node scripts/render-report-html.mjs <data.json> [findings.json]");
  process.exit(2);
}
const d = JSON.parse(readFileSync(dataPath, "utf8"));
let f = null;
if (findingsPath && existsSync(findingsPath)) {
  try { f = JSON.parse(readFileSync(findingsPath, "utf8")); } catch { f = null; }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const nb = (v) => Math.round(v).toLocaleString("nb-NO");
const pct1 = (v) => `${(v * 100).toFixed(1).replace(".", ",")} %`;
const monthNb = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("nb-NO", { month: "long", year: "numeric", timeZone: "UTC" });
const monthShort = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("nb-NO", { month: "short", timeZone: "UTC" }).replace(".", "");

/** Signed % change chip. upIsGood decides the colour; arrow + text, never colour alone. */
function delta(cur, prev, upIsGood = true) {
  if (!prev) return cur ? `<span class="chip neutral">ny</span>` : "";
  const ch = (cur - prev) / prev;
  if (Math.abs(ch) < 0.005) return `<span class="chip neutral">→ uendret</span>`;
  const good = ch > 0 === upIsGood;
  return `<span class="chip ${good ? "good" : "bad"}">${ch > 0 ? "▲" : "▼"} ${ch > 0 ? "+" : "−"}${Math.abs(ch * 100).toFixed(0)} %</span>`;
}

const PAGE_NAMES = {
  "/": "Forsiden", "/map": "Høydekart", "/valg": "Valgkart", "/eiendom": "Tomtegrenser", "/magasin": "Magasinkart",
  "/energikart": "Energikart", "/energi": "Energi (temaside)", "/natur": "Natur (temaside)", "/samfunn": "Samfunn (temaside)",
  "/bolig": "Boligpriser", "/kommune": "Alle kommuner", "/skoler": "Skoler og barnehager", "/vern": "Verneområder",
  "/prisvekst": "Prisvekst", "/helse": "Helsetilbud", "/lonn": "Inntektskart", "/lading": "Ladestasjoner",
  "/hytter": "Turisthytter", "/kostnader": "Kostnader", "/kilder": "Kilder", "/personvern": "Personvern",
};
// Proper kommune names (Bodø, not "bodo") from the profiles file, by slug.
const KOMMUNE_NAMES = (() => {
  try {
    const p = JSON.parse(readFileSync(join(process.cwd(), "public/data/kommune-profiles.json"), "utf8"));
    return new Map(Object.values(p.profiles).map((k) => [k.slug, k.name]));
  } catch {
    return new Map();
  }
})();
function pageName(path) {
  const clean = path.split("?")[0];
  if (PAGE_NAMES[clean]) return PAGE_NAMES[clean];
  const m = clean.match(/^\/kommune\/(\d{4}-.+)$/);
  if (m) return `Kommune: ${KOMMUNE_NAMES.get(m[1]) ?? m[1].replace(/^\d{4}-/, "")}`;
  return clean;
}
// Short label for the bar + explanation for the hover text.
const CHANNELS = {
  "Organic Search": ["Søkemotorer", "Google, Bing og andre søkemotorer"],
  Direct: ["Direkte", "skrev adressen, brukte et bokmerke eller en lenke i en app"],
  "AI Assistant": ["AI-assistenter", "ChatGPT og lignende"],
  Referral: ["Andre nettsider", "lenker fra andre nettsider"],
  "Organic Social": ["Sosiale medier", "Facebook, Snapchat o.l."],
  Unassigned: ["Ukjent", "Google Analytics vet ikke hvor de kom fra"],
};
const chName = (n) => CHANNELS[n]?.[0] ?? n;
const chHint = (n) => (CHANNELS[n] ? ` (${CHANNELS[n][1]})` : "");
const DEVICES = { mobile: "Mobil", desktop: "PC", tablet: "Nettbrett" };

/** Horizontal bar list: one series, value at the bar tip, tooltip on hover/focus. */
function barList(rows, { max = Math.max(1, ...rows.map((r) => r.value)) } = {}) {
  return `<ul class="bars">${rows
    .map(
      (r) => `<li class="bar-row" tabindex="0" data-tip="${esc(r.tip ?? `${r.label}: ${r.valueText}`)}">
      <span class="bar-label">${esc(r.label)}${r.extra ?? ""}</span>
      <span class="bar-track"><span class="bar" style="width:calc((100% - 72px) * ${Math.max(0.01, r.value / max).toFixed(3)})"></span><span class="bar-value">${esc(r.valueText)}</span></span>
    </li>`,
    )
    .join("")}</ul>`;
}

function numbersTable(headers, rows) {
  return `<details class="numbers"><summary>Vis tallene</summary><div class="table-wrap"><table><thead><tr>${headers.map((h, i) => `<th${i ? ' class="num"' : ""}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ""}>${esc(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div></details>`;
}

// ─── Sections ────────────────────────────────────────────────────────────

const ga = d.ga, sc = d.search;
const avg = (t) => (t.userEngagementDuration ?? 0) / (t.activeUsers || 1);

const kpis = `<section class="kpis">
  <div class="tile"><p class="tile-label">Besøkende</p><p class="tile-value">${nb(ga.cur.activeUsers ?? 0)}</p><p class="tile-sub">${delta(ga.cur.activeUsers, ga.prev.activeUsers)} fra ${esc(monthNb(d.prevMonth))}</p></div>
  <div class="tile"><p class="tile-label">Klikk fra Google</p><p class="tile-value">${nb(sc.cur.clicks)}</p><p class="tile-sub">${delta(sc.cur.clicks, sc.prev.clicks)} fra ${esc(monthNb(d.prevMonth))}</p></div>
  <div class="tile"><p class="tile-label">Ganger vist i Google</p><p class="tile-value">${nb(sc.cur.impressions)}</p><p class="tile-sub">${delta(sc.cur.impressions, sc.prev.impressions)} fra ${esc(monthNb(d.prevMonth))}</p></div>
  <div class="tile"><p class="tile-label">Tid per besøkende</p><p class="tile-value">${Math.round(avg(ga.cur))} sek</p><p class="tile-sub">${delta(avg(ga.cur), avg(ga.prev))} fra ${esc(monthNb(d.prevMonth))}</p></div>
</section>`;

const histMax = Math.max(1, ...d.history.map((h) => h.users));
const trend = `<section class="card">
  <h2>Besøkende per måned</h2>
  <p class="lead">Hvor mange forskjellige personer som besøkte Datakart hver måned.</p>
  <div class="columns" role="img" aria-label="Besøkende per måned">
    ${d.history
      .map(
        (h) => `<div class="col${h.month === d.month ? " current" : ""}" tabindex="0" data-tip="${esc(`${monthNb(h.month)}: ${nb(h.users)} besøkende, ${nb(h.clicks)} klikk fra Google`)}">
      <span class="col-value">${nb(h.users)}</span>
      <span class="col-bar" style="height:${Math.max(2, (h.users / histMax) * 100).toFixed(1)}%"></span>
      <span class="col-label">${esc(monthShort(h.month))}</span>
    </div>`,
      )
      .join("")}
  </div>
  ${numbersTable(["Måned", "Besøkende", "Klikk fra Google"], d.history.map((h) => [monthNb(h.month), nb(h.users), nb(h.clicks)]))}
</section>`;

const chTotal = ga.channels.reduce((s, c) => s + c.sessions, 0) || 1;
const channels = `<section class="card">
  <h2>Hvor kommer de fra?</h2>
  <p class="lead">Andel av besøkene, etter hvordan folk fant siden.</p>
  ${barList(ga.channels.filter((c) => c.sessions > 0).map((c) => ({ label: chName(c.name), value: c.sessions, valueText: `${Math.round((c.sessions / chTotal) * 100)} %`, tip: `${chName(c.name)}${chHint(c.name)}: ${nb(c.sessions)} besøk (${nb(c.prev)} måneden før)` })))}
  ${numbersTable(["Kilde", "Besøk", "Måneden før"], ga.channels.map((c) => [chName(c.name), nb(c.sessions), nb(c.prev)]))}
</section>`;

const dev = ga.devices.filter((x) => x.name !== "tablet");
const devMax = Math.max(1, ...dev.map((x) => x.avgSec));
const devices = `<section class="card">
  <h2>Mobil eller PC?</h2>
  <p class="lead">Hvor lenge folk blir på siden, i gjennomsnitt.</p>
  ${barList(dev.map((x) => ({ label: `${DEVICES[x.name] ?? x.name} · ${nb(x.users)} besøkende`, value: x.avgSec, valueText: `${Math.round(x.avgSec)} sek`, tip: `${DEVICES[x.name] ?? x.name}: ${nb(x.users)} besøkende, ${Math.round(x.avgSec)} sek i snitt, ${Math.round(x.engagementRate * 100)} % ble på siden` })), { max: devMax })}
</section>`;

const pgMax = Math.max(1, ...ga.pages.map((p) => p.views));
const pages = `<section class="card">
  <h2>Mest besøkte sider</h2>
  <p class="lead">Sidevisninger i ${esc(monthNb(d.month))}, med endring fra måneden før.</p>
  ${barList(ga.pages.map((p) => ({ label: pageName(p.path), extra: ` ${delta(p.views, p.prev)}`, value: p.views, valueText: nb(p.views), tip: `${pageName(p.path)}: ${nb(p.views)} visninger (${nb(p.prev)} måneden før), ${Math.round(p.avgSec)} sek per besøkende` })), { max: pgMax })}
  ${numbersTable(["Side", "Visninger", "Måneden før", "Sek per besøkende"], ga.pages.map((p) => [pageName(p.path), nb(p.views), nb(p.prev), Math.round(p.avgSec)]))}
</section>`;

const qMax = Math.max(1, ...sc.queries.map((q) => q.clicks));
const searches = `<section class="card">
  <h2>Hva folk søkte på i Google</h2>
  <p class="lead">Søkene som ga flest klikk inn til Datakart.</p>
  ${barList(sc.queries.map((q) => ({ label: `«${q.query}»`, value: q.clicks, valueText: `${nb(q.clicks)} klikk`, tip: `«${q.query}»: ${nb(q.clicks)} klikk (${nb(q.prev)} måneden før), vist ${nb(q.impressions)} ganger` })), { max: qMax })}
  ${numbersTable(["Søk", "Klikk", "Måneden før", "Vist"], sc.queries.map((q) => [q.query, nb(q.clicks), nb(q.prev), nb(q.impressions)]))}
</section>`;

const opp = `<section class="card">
  <h2>Nesten der</h2>
  <p class="lead">Søk der Google allerede viser Datakart ofte, men nesten ingen klikker. Her er det mest å hente.</p>
  <div class="opps">${sc.opportunities
    .slice(0, 6)
    .map(
      (o) => `<div class="opp">
      <p class="opp-q">«${esc(o.query)}»</p>
      <p class="opp-page">${esc(pageName(o.page))}</p>
      <p class="opp-stats"><strong>Vist ${nb(o.impressions)} ganger</strong> · ${nb(o.clicks)} klikk · plass ${Math.round(o.position)} i Google</p>
    </div>`,
    )
    .join("")}</div>
</section>`;

function dumbbell(t) {
  if (t.pending) return `<li class="track"><p class="track-label">${esc(t.label)}</p><p class="muted">Endret ${esc(t.changedOn)}, etter denne måneden. Første tall kommer i neste rapport.</p></li>`;
  const b = t.before.ctr * 100, a = t.after.ctr * 100;
  const max = Math.max(1, b, a) * 1.15;
  const better = a > b;
  return `<li class="track">
    <p class="track-label">${esc(t.label)} <span class="muted">· endret ${esc(t.changedOn)}</span></p>
    <div class="dumb" role="img" aria-label="Andel som klikket: før ${esc(pct1(t.before.ctr))}, etter ${esc(pct1(t.after.ctr))}">
      <span class="dumb-line" style="left:${((Math.min(a, b) / max) * 100).toFixed(1)}%;width:${((Math.abs(a - b) / max) * 100).toFixed(1)}%"></span>
      <span class="dot before" style="left:${((b / max) * 100).toFixed(1)}%" tabindex="0" data-tip="Før: ${esc(pct1(t.before.ctr))} klikket"></span>
      <span class="dot after" style="left:${((a / max) * 100).toFixed(1)}%" tabindex="0" data-tip="Etter: ${esc(pct1(t.after.ctr))} klikket"></span>
    </div>
    <p class="track-text"><span class="key before"></span>Før ${esc(pct1(t.before.ctr))} <span class="key after"></span>Etter ${esc(pct1(t.after.ctr))} av de som så siden i Google klikket ${delta(a, b)}</p>
    ${better ? "" : `<p class="muted">Ikke bedre ennå. Google bruker ofte noen uker på å ta i bruk nye titler.</p>`}
  </li>`;
}
const tracked = `<section class="card">
  <h2>Endringene vi har gjort</h2>
  <p class="lead">Andel som klikket når Google viste siden, før og etter endringen.</p>
  <ul class="tracks">${d.tracked.map(dumbbell).join("")}</ul>
</section>`;

const apexShare = sc.cur.impressions ? sc.apexImpressions / sc.cur.impressions : 0;
const quality = `<section class="card">
  <h2>Teknisk sjekk</h2>
  <p class="lead">Google bør vise adressen <strong>www.datakart.no</strong>. Når den viser <strong>datakart.no</strong> uten www, deles rangeringen mellom to adresser.</p>
  <div class="meter" role="img" aria-label="${esc(`${Math.round(apexShare * 100)} % av visningene på datakart.no uten www`)}"><span class="meter-fill ${apexShare > 0.2 ? "warn" : "ok"}" style="width:${(apexShare * 100).toFixed(1)}%"></span></div>
  <p class="meter-text">${apexShare > 0.2 ? "⚠︎" : "✓"} <strong>${Math.round(apexShare * 100)} %</strong> av visningene i Google var på datakart.no uten www. ${apexShare > 0.2 ? "Løsning: sett omdirigeringen til «permanent (308)» under Domains i Vercel." : "Bra, det meste går til www."}</p>
  <p class="muted">«Min posisjon»-knappen på Høydekart ble brukt ${ga.minPosisjon ? `${nb(ga.minPosisjon)} ganger` : "0 ganger (måles fra oktober 2026)"}.</p>
</section>`;

const findings = f
  ? `<section class="summary">
  <p class="summary-text">${esc(f.kortFortalt)}</p>
</section>
<section class="two">
  <div class="card"><h2>Gode nyheter</h2><ul class="items">${(f.godeNyheter ?? []).map((x) => `<li><p class="item-title">✓ ${esc(x.tittel)}</p><p>${esc(x.tekst)}</p></li>`).join("")}</ul></div>
  <div class="card"><h2>Dette bør du gjøre</h2><ol class="items">${(f.gjoreNa ?? []).map((x) => `<li><p class="item-title">${esc(x.tittel)}</p><p>${esc(x.tekst)}</p></li>`).join("")}</ol></div>
</section>`
  : `<section class="summary"><p class="muted">Claudes oppsummering kunne ikke lages denne måneden. Tallene under er komplette.</p></section>`;

// ─── Page ────────────────────────────────────────────────────────────────

process.stdout.write(`<!doctype html>
<html lang="no">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Datakart · ${esc(monthNb(d.month))}</title>
<style>
:root {
  --bg: #eae8e3; --card: #ffffff; --ink: #0f1923; --ink-2: #4a5563; --muted: #6b7280; --line: #e3ddd4;
  --brand: #24374c; --bar: #24374c; --before: #9fb4ca; --after: #24374c; --track: #eef0f3;
  --good: #166534; --good-bg: #f0fdf4; --bad: #991b1b; --bad-bg: #fef2f2; --warn: #d97706; --ok: #16a34a;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #11181f; --card: #1b2530; --ink: #f0efec; --ink-2: #c3c7cd; --muted: #9aa3ad; --line: #2c3845;
    --brand: #a8c5e4; --bar: #a8c5e4; --before: #3d5570; --after: #a8c5e4; --track: #24303c;
    --good: #86efac; --good-bg: #14301f; --bad: #fca5a5; --bad-bg: #3a1b1b; --warn: #fbbf24; --ok: #4ade80;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 "Nunito Sans", system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 980px; margin: 0 auto; padding: 32px 16px 64px; }
header h1 { font-size: 32px; line-height: 1.15; margin: 0; color: var(--brand); font-weight: 800; }
header p { margin: 6px 0 0; color: var(--muted); }
h2 { font-size: 20px; margin: 0 0 4px; color: var(--brand); font-weight: 800; }
.lead { margin: 0 0 16px; color: var(--ink-2); font-size: 15px; }
.muted { color: var(--muted); font-size: 14px; margin: 6px 0 0; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 20px; margin-top: 16px; }
.summary { margin-top: 24px; background: var(--card); border-radius: 16px; padding: 20px 22px; border-left: 6px solid var(--brand); }
.summary-text { font-size: 19px; line-height: 1.45; margin: 0; font-weight: 600; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 16px; }
.tile { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 16px; min-width: 0; }
.tile-label { margin: 0; font-size: 13px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.tile-value { margin: 4px 0 6px; font-size: 34px; font-weight: 800; color: var(--brand); line-height: 1.1; }
.tile-sub { margin: 0; font-size: 13px; color: var(--muted); }
.chip { display: inline-block; font-size: 12px; font-weight: 700; padding: 1px 7px; border-radius: 999px; white-space: nowrap; }
.chip.good { color: var(--good); background: var(--good-bg); } .chip.bad { color: var(--bad); background: var(--bad-bg); } .chip.neutral { color: var(--ink-2); background: var(--track); }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.two .card { margin-top: 16px; }
.items { margin: 8px 0 0; padding-left: 20px; } .items li { margin-bottom: 12px; } .items p { margin: 0; color: var(--ink-2); font-size: 15px; }
.items .item-title { color: var(--ink); font-weight: 700; margin-bottom: 2px; }
ul.items { list-style: none; padding-left: 0; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; } .grid2 .card { margin-top: 16px; }
.bars { list-style: none; margin: 0; padding: 0; }
.bar-row { display: grid; grid-template-columns: minmax(0, 42%) 1fr; gap: 12px; align-items: center; padding: 5px 0; border-radius: 6px; outline: none; }
.bar-row:hover .bar, .bar-row:focus-visible .bar { filter: brightness(1.25); }
.bar-row:focus-visible { box-shadow: 0 0 0 2px var(--brand); }
.bar-label { font-size: 14px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-track { display: flex; align-items: center; gap: 8px; min-width: 0; }
.bar { display: block; height: 14px; background: var(--bar); border-radius: 0 4px 4px 0; flex: none; }
.bar-value { font-size: 13px; color: var(--ink-2); white-space: nowrap; font-variant-numeric: tabular-nums; }
.columns { display: grid; grid-template-columns: repeat(${d.history.length}, 1fr); gap: 10px; align-items: end; height: 220px; padding-top: 8px; border-bottom: 1px solid var(--line); }
.col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; outline: none; border-radius: 6px; position: relative; }
.col:focus-visible { box-shadow: 0 0 0 2px var(--brand); }
.col-bar { display: block; width: min(24px, 60%); background: var(--before); border-radius: 4px 4px 0 0; }
.col.current .col-bar { background: var(--bar); }
.col:hover .col-bar { filter: brightness(1.15); }
.col-value { font-size: 13px; color: var(--ink-2); margin-bottom: 4px; font-variant-numeric: tabular-nums; }
.col-label { position: absolute; bottom: -24px; font-size: 13px; color: var(--muted); }
.columns { margin-bottom: 34px; } /* room for the month labels under the axis */
.opps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.opp { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
.opp-q { margin: 0; font-weight: 700; } .opp-page { margin: 2px 0 6px; color: var(--muted); font-size: 13px; } .opp-stats { margin: 0; font-size: 14px; color: var(--ink-2); }
.tracks { list-style: none; margin: 0; padding: 0; } .track { padding: 12px 0; border-top: 1px solid var(--line); } .track:first-child { border-top: 0; }
.track-label { margin: 0 0 8px; font-weight: 700; }
.dumb { position: relative; height: 20px; background: var(--track); border-radius: 10px; }
.dumb-line { position: absolute; top: 9px; height: 2px; background: var(--after); }
.dot { position: absolute; top: 2px; width: 16px; height: 16px; margin-left: -8px; border-radius: 50%; border: 2px solid var(--card); outline: none; }
.dot.before { background: var(--before); } .dot.after { background: var(--after); }
.dot:focus-visible { box-shadow: 0 0 0 2px var(--brand); }
.track-text { margin: 8px 0 0; font-size: 14px; color: var(--ink-2); }
.key { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin: 0 4px 0 2px; vertical-align: middle; } .key.before { background: var(--before); } .key.after { background: var(--after); margin-left: 10px; }
.meter { height: 12px; background: var(--track); border-radius: 6px; overflow: hidden; margin-top: 4px; }
.meter-fill { display: block; height: 100%; } .meter-fill.warn { background: var(--warn); } .meter-fill.ok { background: var(--ok); }
.meter-text { margin: 10px 0 0; }
details.numbers { margin-top: 14px; } details.numbers summary { cursor: pointer; color: var(--ink-2); font-size: 14px; font-weight: 600; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 14px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); } th { color: var(--muted); font-weight: 700; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
#tip { position: fixed; pointer-events: none; background: var(--ink); color: var(--card); font-size: 13px; padding: 6px 10px; border-radius: 8px; max-width: 280px; opacity: 0; transition: opacity .1s; z-index: 10; }
footer { margin-top: 32px; color: var(--muted); font-size: 13px; }
@media (max-width: 760px) {
  .kpis { grid-template-columns: 1fr 1fr; } .two, .grid2 { grid-template-columns: 1fr; } .opps { grid-template-columns: 1fr; }
  .tile-value { font-size: 28px; } header h1 { font-size: 26px; } .bar-row { grid-template-columns: minmax(0, 48%) 1fr; }
}
</style>
</head>
<body>
<main>
<header>
  <h1>Datakart · ${esc(monthNb(d.month))}</h1>
  <p>Månedsrapport, sammenlignet med ${esc(monthNb(d.prevMonth))}. Laget ${esc(d.generated)}.</p>
</header>
${findings}
${kpis}
${trend}
<div class="grid2">${channels}${devices}</div>
${pages}
${searches}
${opp}
${tracked}
${quality}
<footer>Tall fra Google Analytics og Google Search Console. Den tekniske rapporten med alle tall ligger ved siden av denne filen (samme navn, .md).</footer>
</main>
<div id="tip" role="tooltip"></div>
<script>
// One tooltip for every chart mark; same content on keyboard focus as on hover.
const tip = document.getElementById("tip");
function show(el, x, y) { tip.textContent = el.dataset.tip; tip.style.opacity = "1"; const r = tip.getBoundingClientRect(); tip.style.left = Math.min(window.innerWidth - r.width - 8, x + 12) + "px"; tip.style.top = Math.max(8, y - r.height - 10) + "px"; }
function hide() { tip.style.opacity = "0"; }
document.querySelectorAll("[data-tip]").forEach((el) => {
  el.addEventListener("pointermove", (e) => show(el, e.clientX, e.clientY));
  el.addEventListener("pointerleave", hide);
  el.addEventListener("focus", () => { const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top); });
  el.addEventListener("blur", hide);
});
</script>
</body>
</html>
`);
