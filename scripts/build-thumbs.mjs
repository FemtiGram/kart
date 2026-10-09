// Build-time card art for the landing page's "Mest populært" strip.
//
// Draws four small maps of Sør-Norge straight from the committed data
// (kommune outlines + centroids from kommune-profiles.json, winners from
// valg/st-2025.json) and rasterises them to 16:10 webp with sharp. No
// network, no tiles, deterministic — rerun with `npm run thumbs` after a
// data refresh and commit the output in src/assets/thumbs/.
//
//   valg.webp         party-coloured choropleth (same partyFill as /valg)
//   bolig.webp        enebolig price bubbles (same blue→orange→red scale as /bolig)
//   energikart.webp   power plants, wind blue / hydro cyan (same as /energikart)
//   stedsprofil.webp  every kommune tinted by population, brand blue only
//
// The pictures are decorative (alt="" in the card); the numbers next to
// them come from src/lib/home-facts.ts.

import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { partyFill } from "../src/lib/party-colors.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

const profiles = Object.values(read("public/data/kommune-profiles.json").profiles);
const valg = read("public/data/valg/st-2025.json").data;

// ─── Frame: Sør-Norge at 16:10, equirectangular with cos(lat) correction ──
const W = 960;
const H = 600;
const FRAME = { lon0: 3.2, lon1: 15.0, lat0: 57.9, lat1: 61.6 };
const COS = Math.cos(((FRAME.lat0 + FRAME.lat1) / 2) * Math.PI / 180);
const K = H / (FRAME.lat1 - FRAME.lat0);
const px = (lon) => ((lon - FRAME.lon0) * COS * K).toFixed(1);
const py = (lat) => ((FRAME.lat1 - lat) * K).toFixed(1);

const SEA = "#e9eef3";
const LAND = "#e3ddd4"; // --kv-muted-fill
const BLUE = [0x24, 0x37, 0x4c]; // --kv-blue

const inFrame = (p) =>
  p.bbox && !(p.bbox.maxLat < FRAME.lat0 - 0.5 || p.bbox.minLat > FRAME.lat1 + 0.5 || p.bbox.maxLon < FRAME.lon0 - 0.5 || p.bbox.minLon > FRAME.lon1 + 0.5);
const visible = profiles.filter((p) => p.outline && (!p.bbox || inFrame(p)));

// profile.outline is rings of [lat, lon]
const ringPath = (ring) => ring.map(([lat, lon], i) => `${i ? "L" : "M"}${px(lon)} ${py(lat)}`).join("") + "Z";
const kommunePath = (p) => p.outline.map(ringPath).join("");

const mix = (t) => {
  // white → brand blue
  const c = BLUE.map((v) => Math.round(255 + (v - 255) * t));
  return `rgb(${c.join(",")})`;
};
const priceColor = (t) => {
  // Mirrors priceColor() in src/components/bolig-map.tsx
  const c = Math.max(0, Math.min(1, t));
  if (c <= 0.5) {
    const s = c * 2;
    return `rgb(${Math.round(59 + s * 190)},${Math.round(130 - s * 15)},${Math.round(246 - s * 224)})`;
  }
  const s = (c - 0.5) * 2;
  return `rgb(${Math.round(249 - s * 10)},${Math.round(115 - s * 47)},${Math.round(22 + s * 46)})`;
};

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
  `<rect width="${W}" height="${H}" fill="${SEA}"/>${body}</svg>`;

const land = (fillFor, stroke = "#fff", sw = 0.8) =>
  visible.map((p) => `<path d="${kommunePath(p)}" fill="${fillFor(p)}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`).join("");

// ─── 1. Valgkart ───────────────────────────────────────────────
const valgSvg = svg(land((p) => partyFill(valg[p.knr]?.vinner?.kode)));

// ─── 2. Boligpriser: enebolig (01) bubbles, percentile-coloured ─
const priced = profiles.filter((p) => p.bolig?.["01"]?.price > 0 && p.centroid);
const sorted = priced.map((p) => p.bolig["01"].price).sort((a, b) => a - b);
const percentile = (price) => sorted.indexOf(price) / Math.max(1, sorted.length - 1);
const radius = (count) => (!count || count < 50 ? 5 : count < 150 ? 7 : count < 500 ? 9.5 : 13);
const bubbles = priced
  .filter((p) => inFrame(p))
  .sort((a, b) => radius(b.bolig["01"].count) - radius(a.bolig["01"].count)) // big ones underneath
  .map((p) =>
    `<circle cx="${px(p.centroid.lon)}" cy="${py(p.centroid.lat)}" r="${radius(p.bolig["01"].count)}" fill="${priceColor(percentile(p.bolig["01"].price))}" fill-opacity=".88" stroke="#fff" stroke-width="1.2"/>`
  )
  .join("");
const boligSvg = svg(land(() => LAND) + bubbles);

// ─── 3. Energikart: plants from each profile's top list ────────
const plants = profiles.flatMap((p) => p.energy?.top ?? []).filter((pl) => pl.lat && pl.lon);
const dots = plants
  .filter((pl) => pl.lat > FRAME.lat0 - 0.2 && pl.lat < FRAME.lat1 + 0.2 && pl.lon > FRAME.lon0 - 0.2 && pl.lon < FRAME.lon1 + 0.2)
  .map((pl) => {
    const r = Math.max(2.6, Math.min(7, 2.2 + Math.sqrt(pl.capacityMW || 1) * 0.35));
    return `<circle cx="${px(pl.lon)}" cy="${py(pl.lat)}" r="${r.toFixed(1)}" fill="${pl.type === "vind" ? "#0369a1" : "#0e7490"}" fill-opacity=".82" stroke="#fff" stroke-width=".9"/>`;
  })
  .join("");
const energiSvg = svg(land(() => LAND, "#fff", 0.6) + dots);

// ─── 4. Stedsprofil: all kommuner, tinted by population rank ────
const byPop = [...profiles].filter((p) => p.population > 0).sort((a, b) => a.population - b.population);
const popRank = new Map(byPop.map((p, i) => [p.knr, i / Math.max(1, byPop.length - 1)]));
const stedSvg = svg(land((p) => (popRank.has(p.knr) ? mix(0.12 + 0.78 * popRank.get(p.knr)) : LAND), "#fff", 0.7));

// ─── Write ─────────────────────────────────────────────────────
const outDir = join(root, "src/assets/thumbs");
mkdirSync(outDir, { recursive: true });
const jobs = { valg: valgSvg, bolig: boligSvg, energikart: energiSvg, stedsprofil: stedSvg };
for (const [name, markup] of Object.entries(jobs)) {
  const out = join(outDir, `${name}.webp`);
  const info = await sharp(Buffer.from(markup)).webp({ quality: 80 }).toFile(out);
  console.log(`${name}.webp  ${info.width}×${info.height}  ${(info.size / 1024).toFixed(0)} KB`);
}

// A contact sheet for eyeballing the result (not committed)
if (process.argv.includes("--sheet")) {
  const tiles = await Promise.all(Object.values(jobs).map((m) => sharp(Buffer.from(m)).resize(480, 300).png().toBuffer()));
  await sharp({ create: { width: 980, height: 620, channels: 3, background: "#ffffff" } })
    .composite(tiles.map((input, i) => ({ input, left: 10 + (i % 2) * 490, top: 10 + Math.floor(i / 2) * 310 })))
    .png()
    .toFile(process.argv[process.argv.indexOf("--sheet") + 1] || "thumbs-sheet.png");
}
console.log(`frame lon ${FRAME.lon0}–${FRAME.lon1}, lat ${FRAME.lat0}–${FRAME.lat1}; ${visible.length} kommuner drawn, ${priced.length} priced, ${plants.length} plants`);
