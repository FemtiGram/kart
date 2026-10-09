// Build-time card art for the landing page: the "Mest populært" strip and
// the three theme cards below it.
//
// Draws small pictures straight from the committed data (kommune outlines
// + centroids from kommune-profiles.json, winners from valg/st-2025.json,
// schools.json, reservoirs.json, cabins.json, kommuner.geojson, and the
// elevation grid in scripts/data/ from fetch-terrain.mjs) and
// rasterises them to 16:10 webp with sharp. No network, no tiles,
// deterministic — rerun with `npm run thumbs` after a data refresh and
// commit the output in src/assets/thumbs/.
//
// Mest populært — Sør-Norge (the maps share one frame):
//   hoydekart.webp    terrain lines: ridgelines raised by the real elevation
//   bolig.webp        enebolig price bubbles (same blue→orange→red scale as /bolig)
//   stedsprofil.webp  every kommune tinted by population, brand blue only
//   valg.webp         party-coloured choropleth (same partyFill as /valg)
//
// Theme cards — zoomed in, one texture each:
//   samfunn.webp      every school and barnehage around Oslofjorden
//   energi.webp       every regulated reservoir around Sognefjorden–Hallingdal
//   natur.webp        verne share + turisthytter around Jotunheimen
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

const svg = (body, bg = SEA) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
  `<rect width="${W}" height="${H}" fill="${bg}"/>${body}</svg>`;

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

// ─── 3. Stedsprofil: all kommuner, tinted by population rank ────
const byPop = [...profiles].filter((p) => p.population > 0).sort((a, b) => a.population - b.population);
const popRank = new Map(byPop.map((p, i) => [p.knr, i / Math.max(1, byPop.length - 1)]));
const stedSvg = svg(land((p) => (popRank.has(p.knr) ? mix(0.12 + 0.78 * popRank.get(p.knr)) : LAND), "#fff", 0.7));

// ─── Zoomed frames ─────────────────────────────────────────────
// The theme cards below the strip each get a different texture — dots,
// water, green — so they don't read as three more copies of the
// Sør-Norge maps above. They zoom in, so they draw the full-resolution
// kommuner.geojson instead of the ~40-point outlines.

const geo = read("public/data/kommuner.geojson").features;
const polysOf = (f) => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates);

/** Equirectangular frame around a centre, `latSpan` degrees tall at 16:10. */
const frameAt = (latc, lonc, latSpan) => {
  const cos = Math.cos((latc * Math.PI) / 180);
  const k = H / latSpan;
  return (lon, lat) => [W / 2 + (lon - lonc) * cos * k, H / 2 - (lat - latc) * k];
};
const onScreen = ([x, y], m = 60) => x > -m && x < W + m && y > -m && y < H + m;

/** geojson [lon, lat] rings → SVG path, dropping vertices under ~1px apart. */
const geoPath = (P, rings) => {
  let d = "";
  for (const ring of rings) {
    let seg = "", n = 0, lx = 0, ly = 0;
    for (const [lon, lat] of ring) {
      const [x, y] = P(lon, lat);
      if (n && Math.abs(x - lx) + Math.abs(y - ly) < 0.8) continue;
      seg += `${n ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
      lx = x; ly = y; n++;
    }
    if (n > 2) d += seg + "Z";
  }
  return d;
};
const geoLand = (P, fillFor, stroke, sw) =>
  geo
    .filter((f) => polysOf(f).some((poly) => poly[0].some(([lon, lat]) => onScreen(P(lon, lat)))))
    .map((f) => {
      const d = polysOf(f).map((poly) => geoPath(P, poly)).join("");
      return `<path d="${d}" fill="${fillFor(f.properties.kommunenummer)}" fill-rule="evenodd" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    })
    .join("");

// ─── 4. Høydekart: terrain lines ───────────────────────────────
// Ridgelines in the style of Joy Division's "Unknown Pleasures": every
// line is a band of latitude from the Bergen coast to the Swedish border,
// raised by the real terrain under it — Hardangervidda, Jotunheimen,
// Rondane and Dovre. Elevations come from scripts/data/terrain.png (a
// ~1 km grid fetched once by scripts/fetch-terrain.mjs, Norway © Kartverket).
// The exponent keeps the lowlands nearly flat so the high mountains read
// as peaks instead of one wall of scribble.
const terrain = read("scripts/data/terrain.json");
const { data: terrainGrid } = await sharp(join(root, "scripts/data/terrain.png")).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
const tb = terrain.bounds;
const highest = terrainGrid.reduce((m, v) => Math.max(m, v), 0) * terrain.metresPerLevel;
/** Mean elevation (m) over a lon/lat box, 0 outside the grid. */
const elevation = (lonA, lonB, latA, latB) => {
  const col = (lon) => Math.floor(((lon - tb.lon0) / (tb.lon1 - tb.lon0)) * terrain.width);
  const row = (lat) => Math.floor(((tb.lat1 - lat) / (tb.lat1 - tb.lat0)) * terrain.height);
  let sum = 0, n = 0;
  for (let j = row(latB); j <= Math.max(row(latB), row(latA)); j++) {
    for (let i = col(lonA); i <= Math.max(col(lonA), col(lonB)); i++) {
      const inside = i >= 0 && j >= 0 && i < terrain.width && j < terrain.height;
      sum += inside ? terrainGrid[j * terrain.width + i] * terrain.metresPerLevel : 0;
      n++;
    }
  }
  return sum / n;
};

const MOUNTAIN_FRAME = { latc: 61.0, lonc: 8.0, latSpan: 3.0 };
const mCos = Math.cos((MOUNTAIN_FRAME.latc * Math.PI) / 180);
const mK = H / MOUNTAIN_FRAME.latSpan;
const ROWS = 28;
const COLS = 320;
const TOP = 80; // headroom for Dovre in the top rows
const STEP = (H - TOP - 18) / ROWS;
const AMP = 105; // px for the highest cell
const HALF_LON = ((W / (COLS - 1)) / (mCos * mK)) * 1.5; // ±1.5 sample widths: smooths 1 km noise
const HALF_LAT = (STEP / mK) * 0.35;
const PAPER = "#f4f1ec";
// Top row first: each line's paper-coloured fill hides the lines behind it
let ridges = "";
for (let r = 0; r < ROWS; r++) {
  const base = TOP + (r + 1) * STEP;
  const lat = MOUNTAIN_FRAME.latc - (base - H / 2) / mK;
  const pts = [];
  for (let c = 0; c < COLS; c++) {
    const x = (c / (COLS - 1)) * W;
    const lon = MOUNTAIN_FRAME.lonc + (x - W / 2) / (mCos * mK);
    const e = elevation(lon - HALF_LON, lon + HALF_LON, lat - HALF_LAT, lat + HALF_LAT);
    pts.push(`${x.toFixed(1)},${(base - Math.pow(e / highest, 1.5) * AMP).toFixed(1)}`);
  }
  const line = pts.join(" ");
  ridges += `<polygon points="-4,${H + 4} ${line} ${W + 4},${H + 4}" fill="${PAPER}"/><polyline points="${line}" fill="none" stroke="rgb(${BLUE.join(",")})" stroke-width="2.4" stroke-linejoin="round"/>`;
}
const hoydekartSvg = svg(ridges, PAPER);

// ─── 5. Samfunn: every school and barnehage around Oslofjorden ──
// Schools in brand blue sized by pupils, barnehager as small slate dots
// beneath them — no other layer, the towns draw themselves.
const { schools, kindergartens } = read("public/data/schools.json");
const units = [
  ...schools.map((s) => ({ kind: "skole", lat: s.lat, lon: s.lon, w: s.students || 50 })),
  ...kindergartens.map((k) => ({ kind: "barnehage", lat: k.lat, lon: k.lon, w: k.children || 25 })),
].filter((u) => u.lat && u.lon);
const OSLOFJORD = frameAt(59.75, 10.55, 1.45);
const institutions = [...units]
  // barnehager first so schools sit on top; big schools under small ones
  .sort((a, b) => (a.kind === b.kind ? b.w - a.w : a.kind === "barnehage" ? -1 : 1))
  .map((u) => ({ u, xy: OSLOFJORD(u.lon, u.lat) }))
  .filter(({ xy }) => onScreen(xy, 10))
  .map(({ u, xy: [x, y] }) =>
    u.kind === "skole"
      ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${Math.max(3.4, Math.min(9, Math.sqrt(u.w) * 0.34)).toFixed(1)}" fill="rgb(${BLUE.join(",")})" fill-opacity=".9" stroke="#fff" stroke-width="1.1"/>`
      : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="#7f8fa3" fill-opacity=".75"/>`
  )
  .join("");
const samfunnSvg = svg(geoLand(OSLOFJORD, () => LAND, "#fff", 0.8) + institutions);

// ─── 6. Energi: regulated reservoirs ───────────────────────────
// Every NVE magasin between Sognefjorden and Hallingdal, the hydro
// heartland, in the cyan /energikart uses for vannkraft. Land without
// kommune borders so the water is the only drawing.
const reservoirs = read("public/data/reservoirs.json").reservoirs;
const HYDRO = frameAt(60.55, 8.0, 2.3);
const water = reservoirs
  .filter((r) => r.center && onScreen(HYDRO(r.center.lon, r.center.lat)))
  .map((r) => {
    // reservoir polygons are rings of [lat, lon]
    const d = geoPath(HYDRO, r.polygon.map((ring) => ring.map(([lat, lon]) => [lon, lat])));
    // A 2px outline keeps the small lakes visible at card size (~300px wide)
    return `<path d="${d}" fill="#0e7490" stroke="#0e7490" stroke-width="2" stroke-linejoin="round"/>`;
  })
  .join("");
const magasinSvg = svg(geoLand(HYDRO, () => LAND, LAND, 0.6) + water);

// ─── 7. Natur: verneområder + turisthytter around Jotunheimen ──
// Kommuner tinted by protected share (darkest at ≥ 50 %), with every
// cabin on top in the /hytter amber. cabins.json comes from an Overpass
// bbox that reaches into Sweden and Finland, so cabins are kept only if
// they fall inside a Norwegian kommune.
const cabins = read("public/data/cabins.json");
const bboxes = geo.map((f) => {
  const b = [180, 90, -180, -90];
  for (const poly of polysOf(f)) for (const [lon, lat] of poly[0]) {
    b[0] = Math.min(b[0], lon); b[1] = Math.min(b[1], lat); b[2] = Math.max(b[2], lon); b[3] = Math.max(b[3], lat);
  }
  return b;
});
const inRing = (lon, lat, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inNorway = (lon, lat) =>
  geo.some((f, i) => {
    const b = bboxes[i];
    if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) return false;
    return polysOf(f).some((poly) => inRing(lon, lat, poly[0]) && !poly.slice(1).some((hole) => inRing(lon, lat, hole)));
  });
const norCabins = cabins.filter((c) => inNorway(c.lon, c.lat));
const vernePct = new Map(profiles.map((p) => [p.knr, p.vernePct ?? 0]));
const GREEN = [0x16, 0x65, 0x34]; // --kv-positive-dark
const LAND_RGB = [0xe3, 0xdd, 0xd4];
const verneFill = (knr) => {
  const pct = vernePct.get(knr) ?? 0;
  if (pct <= 0) return LAND;
  const t = 0.06 + 0.8 * Math.min(1, pct / 50);
  return `rgb(${GREEN.map((v, i) => Math.round(LAND_RGB[i] + (v - LAND_RGB[i]) * t)).join(",")})`;
};
const MOUNTAINS = frameAt(61.5, 8.3, 1.9);
const huts = norCabins
  .map((c) => ({ c, xy: MOUNTAINS(c.lon, c.lat) }))
  .filter(({ xy }) => onScreen(xy, 10))
  .map(({ c, xy: [x, y] }) =>
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${c.cabinType === "fjellhytte" ? 5.5 : 3.8}" fill="#b45309" stroke="#fff" stroke-width="1.3"/>`
  )
  .join("");
const naturSvg = svg(geoLand(MOUNTAINS, verneFill, "#fff", 0.9) + huts);

// ─── Write ─────────────────────────────────────────────────────
const outDir = join(root, "src/assets/thumbs");
mkdirSync(outDir, { recursive: true });
const jobs = {
  hoydekart: hoydekartSvg, bolig: boligSvg, stedsprofil: stedSvg, valg: valgSvg,
  samfunn: samfunnSvg, energi: magasinSvg, natur: naturSvg,
};
for (const [name, markup] of Object.entries(jobs)) {
  const out = join(outDir, `${name}.webp`);
  const info = await sharp(Buffer.from(markup)).webp({ quality: 80 }).toFile(out);
  console.log(`${name}.webp  ${info.width}×${info.height}  ${(info.size / 1024).toFixed(0)} KB`);
}

// A contact sheet for eyeballing the result (not committed)
if (process.argv.includes("--sheet")) {
  const tiles = await Promise.all(Object.values(jobs).map((m) => sharp(Buffer.from(m)).resize(480, 300).png().toBuffer()));
  const rows = Math.ceil(tiles.length / 2);
  await sharp({ create: { width: 980, height: 10 + rows * 310, channels: 3, background: "#ffffff" } })
    .composite(tiles.map((input, i) => ({ input, left: 10 + (i % 2) * 490, top: 10 + Math.floor(i / 2) * 310 })))
    .png()
    .toFile(process.argv[process.argv.indexOf("--sheet") + 1] || "thumbs-sheet.png");
}
console.log(`frame lon ${FRAME.lon0}–${FRAME.lon1}, lat ${FRAME.lat0}–${FRAME.lat1}; ${visible.length} kommuner drawn, ${priced.length} priced`);
console.log(`theme cards: ${units.length} schools/barnehager, ${reservoirs.length} reservoirs, ${norCabins.length}/${cabins.length} cabins inside Norway`);
