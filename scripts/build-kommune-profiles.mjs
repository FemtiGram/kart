// Builds a per-kommune profile JSON by combining:
//   - kommuner.geojson (boundary polygons)
//   - SSB 07459 (population)
//   - SSB InntektStruk13 (median household income)
//   - SSB 06035 (housing prices per dwelling type, 10 years)
//   - SSB 08936 (protected areas)
//   - SSB 14674 (eiendomsskatt per kommune)
//   - SSB 12842 (kommunale gebyrer: vann, avløp, avfall, feiing)
//   - NVE Vannkraft1/0 + Vindkraft2/0 (hydro + operational wind plants)
//   - public/data/stations.json (charging stations, grouped by municipalityId)
//   - public/data/cabins.json (DNT cabins, point-in-polygon)
//   - public/data/reservoirs.json (reservoirs, point-in-polygon)
//
// Output: public/data/kommune-profiles.json keyed by kommunenummer.
// Run with: node scripts/build-kommune-profiles.mjs

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { generateSnapshot } from "./generate-snapshot.mjs";

const ROOT = process.cwd();
const GEOJSON_PATH = join(ROOT, "public", "data", "kommuner.geojson");
const STATIONS_PATH = join(ROOT, "public", "data", "stations.json");
const CABINS_PATH = join(ROOT, "public", "data", "cabins.json");
const RESERVOIRS_PATH = join(ROOT, "public", "data", "reservoirs.json");
const SCHOOLS_PATH = join(ROOT, "public", "data", "schools.json");
const HEALTH_PATH = join(ROOT, "public", "data", "health.json");
const FINN_LOCATIONS_PATH = join(ROOT, "public", "data", "finn-locations.json");
const OUT_PATH = join(ROOT, "public", "data", "kommune-profiles.json");
const FASTLEGE_OUT_PATH = join(ROOT, "public", "data", "fastlege.json");
const KOSTNADER_OUT_PATH = join(ROOT, "public", "data", "kostnader.json");

// ─── Geometry helpers ────────────────────────────────────────

// Ray-casting point-in-polygon for a single ring (GeoJSON [lon, lat]).
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeometry(lon, lat, geometry) {
  if (geometry.type === "Polygon") {
    if (!pointInRing(lon, lat, geometry.coordinates[0])) return false;
    // Holes
    for (let i = 1; i < geometry.coordinates.length; i++) {
      if (pointInRing(lon, lat, geometry.coordinates[i])) return false;
    }
    return true;
  }
  if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates) {
      if (!pointInRing(lon, lat, poly[0])) continue;
      let inHole = false;
      for (let i = 1; i < poly.length; i++) {
        if (pointInRing(lon, lat, poly[i])) {
          inHole = true;
          break;
        }
      }
      if (!inHole) return true;
    }
  }
  return false;
}

// Bounding box for fast rejection
function bboxOf(geometry) {
  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  const visitRing = (ring) => {
    for (const [lon, lat] of ring) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }
  };
  if (geometry.type === "Polygon") {
    visitRing(geometry.coordinates[0]);
  } else {
    for (const poly of geometry.coordinates) visitRing(poly[0]);
  }
  return { minLat, maxLat, minLon, maxLon };
}

// Spherical polygon area in m² (approximation via spherical excess).
function ringArea(ring) {
  const R = 6371000;
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[(i + 1) % ring.length];
    area +=
      ((lon2 - lon1) * Math.PI) / 180 *
      (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180));
  }
  return Math.abs((area * R * R) / 2);
}

function areaKm2(geometry) {
  let total = 0;
  if (geometry.type === "Polygon") {
    total += ringArea(geometry.coordinates[0]);
    for (let i = 1; i < geometry.coordinates.length; i++) {
      total -= ringArea(geometry.coordinates[i]);
    }
  } else {
    for (const poly of geometry.coordinates) {
      total += ringArea(poly[0]);
      for (let i = 1; i < poly.length; i++) {
        total -= ringArea(poly[i]);
      }
    }
  }
  return Math.max(0, total / 1e6);
}

// Simplify a ring by keeping every Nth point. Target roughly 40 points per
// ring for small kommuner, down to ~60 for huge ones. Good enough for a
// locator mini-map.
function simplifyRing(ring) {
  const target = 40;
  if (ring.length <= target) {
    return ring.map(([lon, lat]) => [
      Math.round(lon * 10000) / 10000,
      Math.round(lat * 10000) / 10000,
    ]);
  }
  const step = Math.max(1, Math.floor(ring.length / target));
  const out = [];
  for (let i = 0; i < ring.length; i += step) {
    out.push([
      Math.round(ring[i][0] * 10000) / 10000,
      Math.round(ring[i][1] * 10000) / 10000,
    ]);
  }
  // Ensure closed
  if (
    out.length > 0 &&
    (out[0][0] !== out[out.length - 1][0] ||
      out[0][1] !== out[out.length - 1][1])
  ) {
    out.push([...out[0]]);
  }
  return out;
}

// Produce a simplified outline as a flat array of rings in [lat, lon] order
// (the format Leaflet Polygon expects). Drops holes — not needed for locator.
function simplifiedOutline(geometry) {
  const rings = [];
  if (geometry.type === "Polygon") {
    rings.push(simplifyRing(geometry.coordinates[0]).map(([lon, lat]) => [lat, lon]));
  } else if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates) {
      const ring = simplifyRing(poly[0]);
      if (ring.length >= 4) {
        rings.push(ring.map(([lon, lat]) => [lat, lon]));
      }
    }
  }
  return rings;
}

// Centroid of the largest polygon in a Polygon/MultiPolygon
function centroidOf(geometry) {
  let ring;
  if (geometry.type === "Polygon") {
    ring = geometry.coordinates[0];
  } else {
    let best = 0;
    for (const poly of geometry.coordinates) {
      const a = ringArea(poly[0]);
      if (a > best) {
        best = a;
        ring = poly[0];
      }
    }
  }
  let lat = 0;
  let lon = 0;
  for (const [x, y] of ring) {
    lon += x;
    lat += y;
  }
  return { lat: lat / ring.length, lon: lon / ring.length };
}

// ─── SSB fetchers ────────────────────────────────────────────

async function fetchPopulation() {
  console.log("  Fetching SSB 07459 (population)...");
  const res = await fetch("https://data.ssb.no/api/v0/no/table/07459/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: [
        { code: "Region", selection: { filter: "all", values: ["*"] } },
        { code: "Tid", selection: { filter: "item", values: ["2024"] } },
      ],
      response: { format: "json-stat2" },
    }),
  });
  if (!res.ok) throw new Error(`SSB 07459: HTTP ${res.status}`);
  const data = await res.json();
  const regionIndex = data.dimension.Region.category.index;
  const values = data.value;
  const out = {};
  for (const [code, idx] of Object.entries(regionIndex)) {
    if (/^\d{4}$/.test(code) && values[idx] != null) {
      out[code] = values[idx];
    }
  }
  return out;
}

async function fetchIncome() {
  console.log("  Fetching SSB InntektStruk13 (income)...");
  const res = await fetch(
    "https://data.ssb.no/api/v0/no/table/InntektStruk13",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: [
          { code: "Region", selection: { filter: "all", values: ["*"] } },
          { code: "HusholdType", selection: { filter: "item", values: ["0000"] } },
          { code: "ContentsCode", selection: { filter: "item", values: ["InntSkatt"] } },
          { code: "Tid", selection: { filter: "item", values: ["2024"] } },
        ],
        response: { format: "json-stat2" },
      }),
    }
  );
  if (!res.ok) throw new Error(`SSB InntektStruk13: HTTP ${res.status}`);
  const data = await res.json();
  const regionIndex = data.dimension.Region.category.index;
  const values = data.value;
  const out = {};
  for (const [code, idx] of Object.entries(regionIndex)) {
    if (/^\d{4}$/.test(code) && values[idx] != null) {
      out[code] = values[idx];
    }
  }
  return out;
}

async function fetchProtectedAreas() {
  console.log("  Fetching SSB 08936 (protected areas)...");
  const res = await fetch(
    "https://data.ssb.no/api/pxwebapi/v2/tables/08936/data?lang=en&outputFormat=json-stat2&valuecodes[ContentsCode]=VernetAreal&valuecodes[Tid]=2024&valuecodes[Region]=*&codelist[Region]=agg_KommGjeldende&valuecodes[VerneOmrader]=0&heading=ContentsCode,Tid,VerneOmrader&stub=Region"
  );
  if (!res.ok) throw new Error(`SSB 08936: HTTP ${res.status}`);
  const data = await res.json();
  const regionIndex = data.dimension.Region.category.index;
  const values = data.value;
  const out = {};
  for (const [code, idx] of Object.entries(regionIndex)) {
    if (/^\d{4}$/.test(code) && values[idx] != null) {
      out[code] = values[idx];
    }
  }
  return out;
}

async function fetchBolig() {
  console.log("  Fetching SSB 06035 (housing prices)...");
  const res = await fetch("https://data.ssb.no/api/v0/no/table/06035", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: [
        { code: "Region", selection: { filter: "all", values: ["*"] } },
        { code: "Boligtype", selection: { filter: "item", values: ["01", "02", "03"] } },
        { code: "ContentsCode", selection: { filter: "item", values: ["KvPris", "Omsetninger"] } },
        { code: "Tid", selection: { filter: "item", values: ["2020", "2021", "2022", "2023", "2024"] } },
      ],
      response: { format: "json-stat2" },
    }),
  });
  if (!res.ok) throw new Error(`SSB 06035: HTTP ${res.status}`);
  const data = await res.json();

  const ids = data.id;
  const sizes = data.size;
  const values = data.value;
  const strides = new Array(ids.length).fill(1);
  for (let i = ids.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }
  const regionIndex = data.dimension.Region.category.index;
  const typeIndex = data.dimension.Boligtype.category.index;
  const contentsIndex = data.dimension.ContentsCode.category.index;
  const tidIndex = data.dimension.Tid.category.index;
  const rStride = strides[ids.indexOf("Region")];
  const bStride = strides[ids.indexOf("Boligtype")];
  const cStride = strides[ids.indexOf("ContentsCode")];
  const tStride = strides[ids.indexOf("Tid")];
  const priceIdx = contentsIndex["KvPris"];
  const countIdx = contentsIndex["Omsetninger"];

  const result = {};
  for (const [kommune, rI] of Object.entries(regionIndex)) {
    if (!/^\d{4}$/.test(kommune)) continue;
    const types = {};
    let any = false;
    for (const [typeCode, bI] of Object.entries(typeIndex)) {
      const years = {};
      for (const [year, tI] of Object.entries(tidIndex)) {
        const base = rI * rStride + bI * bStride + tI * tStride;
        const price = values[base + priceIdx * cStride] ?? null;
        const count = values[base + countIdx * cStride] ?? null;
        if (price !== null) {
          years[year] = { price, count };
          any = true;
        }
      }
      if (Object.keys(years).length > 0) types[typeCode] = years;
    }
    if (any) result[kommune] = types;
  }
  return result;
}

// ─── SSB 14674: Eiendomsskatt (per kommune, KOSTRA) ─────────
//
// Three variables matter for Stedsprofil:
//   - KOShareskatt0000   — has the kommune introduced eiendomsskatt at all? (1/0)
//   - KOSskattenebolig0000 — eiendomsskatt for a STANDARDIZED enebolig på 120 m²
//                          (kr/year). SSB normalizes for house size so this is the
//                          single best apples-to-apples number between kommuner.
//   - KOSgenskatt0000    — general tax rate (promille, per 1000)
//
// Request a range of years and pick the latest with reasonable coverage —
// KOSTRA publishes preliminary numbers in March each year, so by April the
// previous year should be populated. We ask for the last 3 years to be safe.

const EIENDOMSSKATT_YEARS = ["2023", "2024", "2025", "2026"];
const EIENDOMSSKATT_VARS = [
  "KOShareskatt0000",
  "KOSskattenebolig0000",
  "KOSgenskatt0000",
];

async function fetchEiendomsskatt() {
  console.log("  Fetching SSB 14674 (eiendomsskatt)...");
  const res = await fetch("https://data.ssb.no/api/v0/no/table/14674", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: [
        { code: "KOKkommuneregion0000", selection: { filter: "all", values: ["*"] } },
        { code: "ContentsCode", selection: { filter: "item", values: EIENDOMSSKATT_VARS } },
        { code: "Tid", selection: { filter: "item", values: EIENDOMSSKATT_YEARS } },
      ],
      response: { format: "json-stat2" },
    }),
  });
  if (!res.ok) throw new Error(`SSB 14674: HTTP ${res.status}`);
  const data = await res.json();

  const ids = data.id;
  const sizes = data.size;
  const values = data.value;
  const strides = new Array(ids.length).fill(1);
  for (let i = ids.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }
  const regionIndex = data.dimension.KOKkommuneregion0000.category.index;
  const contentsIndex = data.dimension.ContentsCode.category.index;
  const tidIndex = data.dimension.Tid.category.index;
  const rStride = strides[ids.indexOf("KOKkommuneregion0000")];
  const cStride = strides[ids.indexOf("ContentsCode")];
  const tStride = strides[ids.indexOf("Tid")];

  // Decode into { knr: { code: { year: value } } } for 4-digit kommune codes only.
  const byKnr = {};
  for (const [knr, rI] of Object.entries(regionIndex)) {
    if (!/^\d{4}$/.test(knr)) continue;
    const perCode = {};
    for (const [code, cI] of Object.entries(contentsIndex)) {
      const perYear = {};
      for (const [year, tI] of Object.entries(tidIndex)) {
        const v = values[rI * rStride + cI * cStride + tI * tStride];
        if (v != null) perYear[year] = v;
      }
      if (Object.keys(perYear).length > 0) perCode[code] = perYear;
    }
    byKnr[knr] = perCode;
  }

  // Pick the latest year with good coverage of KOSskattenebolig0000 —
  // the standardized 120 m² bill is the headline kr number. SSB stopped
  // publishing this variable after 2024, so the picker lands on 2024
  // for recent runs rather than 2026 (where only the promille is set).
  let latestYear = EIENDOMSSKATT_YEARS[0];
  for (const year of [...EIENDOMSSKATT_YEARS].reverse()) {
    const populated = Object.values(byKnr).filter(
      (k) => k.KOSskattenebolig0000?.[year] != null
    ).length;
    if (populated >= 150) {
      latestYear = year;
      break;
    }
  }
  console.log(`    → latest usable year: ${latestYear}`);

  // Collapse to { knr: { has, annualFor120m2, promille } } for the picked year.
  const out = {};
  for (const [knr, series] of Object.entries(byKnr)) {
    const hasRaw = series.KOShareskatt0000?.[latestYear];
    if (hasRaw == null) continue;
    out[knr] = {
      has: hasRaw === 1,
      annualFor120m2: series.KOSskattenebolig0000?.[latestYear] ?? null,
      promille: series.KOSgenskatt0000?.[latestYear] ?? null,
    };
  }
  return { byKnr: out, year: latestYear };
}

// ─── SSB 12842: Kommunale gebyrer (vann, avløp, avfall, feiing) ──
//
// Annual fees households pay to the kommune for basic infrastructure.
// The four together range from ~8 000 kr (cheap rural) to 20 000+ kr
// (expensive coastal) — a huge and almost-never-surfaced spread.
//
// Variables (all in NOK, excl. VAT):
//   - KOSaarsgebyrvann0000 — Årsgebyr vannforsyning
//   - KOSaarsgebyravlo0000 — Årsgebyr avløp
//   - KOSaarsgebyravfa0000 — Årsgebyr avfall
//   - KOSfeiingtilsyn0000  — Årsgebyr feiing og tilsyn

const GEBYR_YEARS = ["2023", "2024", "2025", "2026"];
const GEBYR_VARS = [
  "KOSaarsgebyrvann0000",
  "KOSaarsgebyravlo0000",
  "KOSaarsgebyravfa0000",
  "KOSfeiingtilsyn0000",
];

async function fetchKommunaleGebyrer() {
  console.log("  Fetching SSB 12842 (kommunale gebyrer)...");
  const res = await fetch("https://data.ssb.no/api/v0/no/table/12842", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: [
        { code: "KOKkommuneregion0000", selection: { filter: "all", values: ["*"] } },
        { code: "ContentsCode", selection: { filter: "item", values: GEBYR_VARS } },
        { code: "Tid", selection: { filter: "item", values: GEBYR_YEARS } },
      ],
      response: { format: "json-stat2" },
    }),
  });
  if (!res.ok) throw new Error(`SSB 12842: HTTP ${res.status}`);
  const data = await res.json();

  const ids = data.id;
  const sizes = data.size;
  const values = data.value;
  const strides = new Array(ids.length).fill(1);
  for (let i = ids.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }
  const regionIndex = data.dimension.KOKkommuneregion0000.category.index;
  const contentsIndex = data.dimension.ContentsCode.category.index;
  const tidIndex = data.dimension.Tid.category.index;
  const rStride = strides[ids.indexOf("KOKkommuneregion0000")];
  const cStride = strides[ids.indexOf("ContentsCode")];
  const tStride = strides[ids.indexOf("Tid")];

  const byKnr = {};
  for (const [knr, rI] of Object.entries(regionIndex)) {
    if (!/^\d{4}$/.test(knr)) continue;
    const perCode = {};
    for (const [code, cI] of Object.entries(contentsIndex)) {
      const perYear = {};
      for (const [year, tI] of Object.entries(tidIndex)) {
        const v = values[rI * rStride + cI * cStride + tI * tStride];
        if (v != null) perYear[year] = v;
      }
      if (Object.keys(perYear).length > 0) perCode[code] = perYear;
    }
    byKnr[knr] = perCode;
  }

  // Pick latest year with ≥ 150 kommuner reporting all four fees.
  let latestYear = GEBYR_YEARS[0];
  for (const year of [...GEBYR_YEARS].reverse()) {
    const populated = Object.values(byKnr).filter((k) =>
      GEBYR_VARS.every((v) => k[v]?.[year] != null)
    ).length;
    if (populated >= 150) {
      latestYear = year;
      break;
    }
  }
  console.log(`    → latest usable year: ${latestYear}`);

  const out = {};
  for (const [knr, series] of Object.entries(byKnr)) {
    const vann = series.KOSaarsgebyrvann0000?.[latestYear] ?? null;
    const avlop = series.KOSaarsgebyravlo0000?.[latestYear] ?? null;
    const avfall = series.KOSaarsgebyravfa0000?.[latestYear] ?? null;
    const feiing = series.KOSfeiingtilsyn0000?.[latestYear] ?? null;
    if (vann == null && avlop == null && avfall == null && feiing == null) continue;
    const total = [vann, avlop, avfall, feiing].reduce(
      (sum, v) => (v != null ? sum + v : sum),
      0
    );
    out[knr] = {
      vann,
      avlop,
      avfall,
      feiing,
      total: total > 0 ? Math.round(total) : null,
    };
  }
  return { byKnr: out, year: latestYear };
}

// ─── SSB 12005: Fastlege (general practitioner) data ────────
//
// Authoritative kommune-level data from SSB — covers the whole
// fastlegekrise story far better than OSM markers ever could. 18
// metrics per kommune per year, 2015–2025. We keep all 18 for the
// latest year (for the /helse detail sheet) and a full trend for the
// three metrics used on the /helse choropleth + Stedsprofil sparkline.

const FASTLEGE_METRICS = [
  { code: "KOSantallavtaler0001", label: "Antall fastlegeavtaler", unit: "antall" },
  { code: "KOSantallpasient0000", label: "Pasienter på liste med lege", unit: "antall" },
  { code: "KOSantallavtaler0000", label: "Fastlegelister uten lege", unit: "antall" },
  { code: "KOSantallpasient0001", label: "Pasienter på liste uten lege", unit: "antall" },
  { code: "KOSandelpasiente0000", label: "Andel pasienter på liste uten lege", unit: "prosent", primary: true, invertColor: true },
  { code: "KOSaapnelister0000", label: "Antall åpne fastlegelister", unit: "antall" },
  { code: "KOSgjsnlisteleng0000", label: "Gjennomsnittlig listelengde", unit: "antall", primary: true, invertColor: true },
  { code: "KOSgjsnllkomm0000", label: "Gj.sn. listelengde korr. kommunale timer", unit: "antall" },
  { code: "KOSantallkvinnel0000", label: "Antall kvinnelige leger", unit: "antall" },
  { code: "KOSandelkvinnele0000", label: "Andel kvinnelige leger", unit: "prosent" },
  { code: "KOSkapasitet0000", label: "Kapasitet hos fastlegene", unit: "antall" },
  { code: "KOSkapasitetbere0000", label: "Beregnet kapasitet", unit: "antall" },
  { code: "KOSreservekapasi0000", label: "Ledig kapasitet hos fastlegen", unit: "antall", primary: true },
  { code: "KOSkonsultpasien0000", label: "Konsultasjoner (bostedskommune)", unit: "antall" },
  { code: "KOSkonsultlegeko0000", label: "Konsultasjoner (praksiskommune)", unit: "antall" },
  { code: "KOSkonspasientpr0000", label: "Konsultasjoner per person (bosted)", unit: "antall" },
  { code: "KOSkonslegeprper0000", label: "Konsultasjoner per person (praksis)", unit: "antall" },
  { code: "KOSantallavtaler0002", label: "Avtaler totalt inkl. lister uten lege", unit: "antall" },
];

const FASTLEGE_YEARS = ["2015", "2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025"];

async function fetchFastlege() {
  console.log("  Fetching SSB 12005 (fastlege)...");
  const res = await fetch("https://data.ssb.no/api/v0/no/table/12005", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: [
        { code: "KOKkommuneregion0000", selection: { filter: "all", values: ["*"] } },
        {
          code: "ContentsCode",
          selection: { filter: "item", values: FASTLEGE_METRICS.map((m) => m.code) },
        },
        { code: "Tid", selection: { filter: "item", values: FASTLEGE_YEARS } },
      ],
      response: { format: "json-stat2" },
    }),
  });
  if (!res.ok) throw new Error(`SSB 12005: HTTP ${res.status}`);
  const data = await res.json();

  const ids = data.id;
  const sizes = data.size;
  const values = data.value;
  const strides = new Array(ids.length).fill(1);
  for (let i = ids.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }
  const regionIndex = data.dimension.KOKkommuneregion0000.category.index;
  const contentsIndex = data.dimension.ContentsCode.category.index;
  const tidIndex = data.dimension.Tid.category.index;
  const rStride = strides[ids.indexOf("KOKkommuneregion0000")];
  const cStride = strides[ids.indexOf("ContentsCode")];
  const tStride = strides[ids.indexOf("Tid")];

  // First pass: decode into a nested map { knr: { code: { year: value } } }.
  // Only keep four-digit kommune codes — SSB also returns regional aggregates.
  const byKnr = {};
  for (const [knr, rI] of Object.entries(regionIndex)) {
    if (!/^\d{4}$/.test(knr)) continue;
    const perCode = {};
    for (const [code, cI] of Object.entries(contentsIndex)) {
      const perYear = {};
      for (const [year, tI] of Object.entries(tidIndex)) {
        const v = values[rI * rStride + cI * cStride + tI * tStride];
        if (v != null) perYear[year] = v;
      }
      if (Object.keys(perYear).length > 0) perCode[code] = perYear;
    }
    if (Object.keys(perCode).length > 0) byKnr[knr] = perCode;
  }

  // Pick the most recent year that has data for the majority of kommuner —
  // SSB sometimes publishes thin preview data for the current year before
  // the full release lands. "Latest" = the youngest year where at least
  // half the kommuner have a Reservekapasitet value.
  let latestYear = FASTLEGE_YEARS[0];
  for (const year of [...FASTLEGE_YEARS].reverse()) {
    const populated = Object.values(byKnr).filter(
      (k) => k.KOSreservekapasi0000?.[year] != null
    ).length;
    if (populated >= 150) {
      latestYear = year;
      break;
    }
  }
  console.log(`    → latest usable year: ${latestYear} (${Object.keys(byKnr).length} kommuner total)`);

  return { byKnr, latestYear };
}

// ─── Demografi fetchers (SSB 11084 + 09429 + 06265) ──────────
//
// Three separate tables, all requested at once and then merged into a
// `demografi` sub-object per kommune. Each sub-fetch asks for the last
// few years and picks the most populated year with reasonable coverage.
// Output shape per knr:
//   {
//     eierstatus: { selveier: 0.72, andelseier: 0.14, leier: 0.14, year: "2024" },
//     utdanning:  { grunnskole: 0.22, vgs: 0.38, hoyere: 0.38, year: "2024" },
//     boliger:    { enebolig: 0.58, tomannsbolig: 0.08, rekkehus: 0.18,
//                   blokk: 0.12, annet: 0.04, year: "2024" }
//   }
// All fractions are 0..1 (decimal); the render layer formats as percent.

const DEMOGRAFI_YEARS = ["2021", "2022", "2023", "2024"];

async function fetchEierstatus() {
  console.log("  Fetching SSB 11084 (eierstatus)...");
  const res = await fetch("https://data.ssb.no/api/v0/no/table/11084", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: [
        { code: "Region", selection: { filter: "all", values: ["*"] } },
        // Values: 1=I alt, 2=Selveier, 3=Andels-/aksjeeier, 4=Leier
        { code: "EierStatus", selection: { filter: "item", values: ["2", "3", "4"] } },
        { code: "ContentsCode", selection: { filter: "item", values: ["HusholdningProsent"] } },
        { code: "Tid", selection: { filter: "item", values: DEMOGRAFI_YEARS } },
      ],
      response: { format: "json-stat2" },
    }),
  });
  if (!res.ok) throw new Error(`SSB 11084: HTTP ${res.status}`);
  const data = await res.json();
  return decodeDemografi(data, "EierStatus", {
    "2": "selveier",
    "3": "andelseier",
    "4": "leier",
  });
}

async function fetchUtdanning() {
  console.log("  Fetching SSB 09429 (utdanningsnivå)...");
  const res = await fetch("https://data.ssb.no/api/v0/no/table/09429", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: [
        { code: "Region", selection: { filter: "all", values: ["*"] } },
        // Levels: 01=grunnskole, 02a=vgs, 11=fagskole,
        //        03a=UH kort, 04a=UH lang, 09a=uoppgitt (skipped)
        {
          code: "Nivaa",
          selection: {
            filter: "item",
            values: ["01", "02a", "11", "03a", "04a"],
          },
        },
        // Kjonn 0 = Begge kjønn (total)
        { code: "Kjonn", selection: { filter: "item", values: ["0"] } },
        { code: "ContentsCode", selection: { filter: "item", values: ["PersonerProsent"] } },
        { code: "Tid", selection: { filter: "item", values: DEMOGRAFI_YEARS } },
      ],
      response: { format: "json-stat2" },
    }),
  });
  if (!res.ok) throw new Error(`SSB 09429: HTTP ${res.status}`);
  const data = await res.json();
  return decodeDemografi(data, "Nivaa", {
    "01": "grunnskole",
    "02a": "vgs",
    "11": "fagskole",
    "03a": "hoyereKort",
    "04a": "hoyereLang",
  });
}

async function fetchBoligtyper() {
  console.log("  Fetching SSB 06265 (boligtyper)...");
  // 06265 publishes absolute dwelling counts per building type; we
  // compute percentages ourselves (in decodeBoligtyper below).
  const res = await fetch("https://data.ssb.no/api/v0/no/table/06265", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: [
        { code: "Region", selection: { filter: "all", values: ["*"] } },
        {
          code: "BygnType",
          selection: { filter: "item", values: ["01", "02", "03", "04", "05", "999"] },
        },
        { code: "ContentsCode", selection: { filter: "item", values: ["Boliger"] } },
        { code: "Tid", selection: { filter: "item", values: DEMOGRAFI_YEARS } },
      ],
      response: { format: "json-stat2" },
    }),
  });
  if (!res.ok) throw new Error(`SSB 06265: HTTP ${res.status}`);
  const data = await res.json();
  // Raw counts — convert to percentages per kommune.
  const raw = decodeDemografi(data, "BygnType", {
    "01": "enebolig",
    "02": "tomannsbolig",
    "03": "rekkehus",
    "04": "blokk",
    "05": "bofellesskap",
    "999": "annet",
  });
  const byKnr = {};
  for (const [knr, row] of Object.entries(raw.byKnr)) {
    const total = Object.values(row).reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    const pct = {};
    for (const [k, v] of Object.entries(row)) {
      pct[k] = (v / total) * 100;
    }
    byKnr[knr] = pct;
  }
  return { latestYear: raw.latestYear, byKnr };
}

// Shared json-stat2 decoder: returns { latestYear, byKnr: { knr: { <label>: value } } }.
// Picks the most recent year that has values for at least 150 kommuner.
function decodeDemografi(data, breakdownDim, labelMap) {
  const ids = data.id;
  const sizes = data.size;
  const values = data.value;
  const strides = new Array(ids.length).fill(1);
  for (let i = ids.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }
  const regionIndex = data.dimension.Region.category.index;
  const breakIndex = data.dimension[breakdownDim].category.index;
  const tidIndex = data.dimension.Tid.category.index;
  const rStride = strides[ids.indexOf("Region")];
  const bStride = strides[ids.indexOf(breakdownDim)];
  const tStride = strides[ids.indexOf("Tid")];

  // Try years newest-first; first year with decent coverage wins.
  const years = Object.entries(tidIndex).sort((a, b) => Number(b[0]) - Number(a[0]));
  let latestYear = null;
  let picked = null;
  for (const [year, tI] of years) {
    const byKnr = {};
    for (const [knr, rI] of Object.entries(regionIndex)) {
      if (!/^\d{4}$/.test(knr)) continue;
      const row = {};
      let any = false;
      for (const [code, bI] of Object.entries(breakIndex)) {
        const label = labelMap[code];
        if (!label) continue;
        const v = values[rI * rStride + bI * bStride + tI * tStride];
        if (v != null) {
          row[label] = v;
          any = true;
        }
      }
      if (any) byKnr[knr] = row;
    }
    if (Object.keys(byKnr).length >= 150) {
      latestYear = year;
      picked = byKnr;
      break;
    }
  }
  return { latestYear, byKnr: picked ?? {} };
}

// ─── NVE energy fetcher (hydro + operational wind only) ──────

function utmToLatLon(easting, northing) {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const falseEasting = 500000.0;
  const falseNorthing = 0.0;
  const lon0 = (15.0 * Math.PI) / 180.0;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const M = (northing - falseNorthing) / k0;
  const mu =
    M /
    (a *
      (1 -
        e2 / 4 -
        (3 * e2 * e2) / 64 -
        (5 * e2 * e2 * e2) / 256));
  const e1 =
    (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 * e1 * e1) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 * e1 * e1 * e1) / 32) * Math.sin(4 * mu) +
    ((151 * e1 * e1 * e1) / 96) * Math.sin(6 * mu);
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
  const T1 = Math.tan(phi1) ** 2;
  const C1 = ep2 * Math.cos(phi1) ** 2;
  const R1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
  const D = (easting - falseEasting) / (N1 * k0);
  const lat =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) *
          D ** 6) /
          720);
  const lon =
    lon0 +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) /
        120) /
      Math.cos(phi1);
  return { lat: (lat * 180) / Math.PI, lon: (lon * 180) / Math.PI };
}

async function fetchEnergyPlants() {
  console.log("  Fetching NVE hydro + operational wind...");
  const NVE = "https://nve.geodataonline.no/arcgis/rest/services";
  const QUERY =
    "query?where=1%3D1&outFields=*&returnGeometry=true&f=json&resultRecordCount=2000";
  const [windRes, hydroRes] = await Promise.all([
    fetch(`${NVE}/Vindkraft2/MapServer/0/${QUERY}`, {
      headers: { "User-Agent": "Datakart/1.0 github.com/FemtiGram/kart" },
    }),
    fetch(`${NVE}/Vannkraft1/MapServer/0/${QUERY}`, {
      headers: { "User-Agent": "Datakart/1.0 github.com/FemtiGram/kart" },
    }),
  ]);
  const plants = [];
  if (windRes.ok) {
    const data = await windRes.json();
    for (const f of data.features ?? []) {
      if (!f.geometry?.x || !f.geometry?.y) continue;
      const a = f.attributes;
      const { lat, lon } = utmToLatLon(f.geometry.x, f.geometry.y);
      plants.push({
        id: a.OBJECTID,
        name: a.anleggNavn ?? "Ukjent vindkraftverk",
        type: "vind",
        capacityMW:
          a.effekt_MW_idrift ?? a.effekt_MW ?? null,
        lat,
        lon,
      });
    }
  }
  if (hydroRes.ok) {
    const data = await hydroRes.json();
    for (const f of data.features ?? []) {
      if (!f.geometry?.x || !f.geometry?.y) continue;
      const a = f.attributes;
      if (a.status !== "D") continue; // Drift (operational) only
      const { lat, lon } = utmToLatLon(f.geometry.x, f.geometry.y);
      plants.push({
        id: 100000 + (a.OBJECTID ?? a.vannkraftverkNr ?? 0),
        name: a.vannkraftverkNavn ?? "Ukjent vannkraftverk",
        type: "vann",
        capacityMW: a.maksYtelse_MW ?? null,
        lat,
        lon,
      });
    }
  }
  console.log(`    → ${plants.length} plants`);
  return plants;
}

// ─── Fylke name from kommunenummer prefix ────────────────────

const FYLKE_BY_PREFIX = {
  "03": "Oslo",
  "11": "Rogaland",
  "15": "Møre og Romsdal",
  "18": "Nordland",
  "31": "Østfold",
  "32": "Akershus",
  "33": "Buskerud",
  "34": "Innlandet",
  "39": "Vestfold",
  "40": "Telemark",
  "42": "Agder",
  "46": "Vestland",
  "50": "Trøndelag",
  "55": "Troms",
  "56": "Finnmark",
};

function fylkeFor(knr) {
  return FYLKE_BY_PREFIX[knr.slice(0, 2)] ?? null;
}

// ─── Slug ────────────────────────────────────────────────────

function slugify(name) {
  return name
    .toLowerCase()
    .replaceAll("æ", "ae")
    .replaceAll("ø", "o")
    .replaceAll("å", "a")
    // Strip common Sami diacritics → ASCII
    .replaceAll("á", "a")
    .replaceAll("č", "c")
    .replaceAll("ŋ", "ng")
    .replaceAll("š", "s")
    .replaceAll("ŧ", "t")
    .replaceAll("ž", "z")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// For bilingual names like "Trondheim - Tråante" or "Guovdageaidnu - Kautokeino",
// return the first segment. This is a compromise — preserves the full `name`
// for hero display but gives a clean display name for titles and slugs.
function displayNameFor(fullName) {
  const first = fullName.split(/\s+-\s+/)[0].trim();
  return first || fullName;
}

// ─── Ranking helper ──────────────────────────────────────────

function rankBy(profiles, getKey, descending = true) {
  const withValue = Object.entries(profiles).filter(([, p]) => getKey(p) != null);
  withValue.sort((a, b) => {
    const va = getKey(a[1]);
    const vb = getKey(b[1]);
    return descending ? vb - va : va - vb;
  });
  const ranks = {};
  withValue.forEach(([knr], i) => {
    ranks[knr] = i + 1;
  });
  return { ranks, total: withValue.length };
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const start = Date.now();
  console.log("Building kommune profiles...");

  // Load static files
  const geo = JSON.parse(readFileSync(GEOJSON_PATH, "utf8"));
  const stations = JSON.parse(readFileSync(STATIONS_PATH, "utf8"));
  const cabins = JSON.parse(readFileSync(CABINS_PATH, "utf8"));
  const reservoirsFile = JSON.parse(readFileSync(RESERVOIRS_PATH, "utf8"));
  const reservoirs = reservoirsFile.reservoirs ?? reservoirsFile;
  const finnLocations = existsSync(FINN_LOCATIONS_PATH)
    ? JSON.parse(readFileSync(FINN_LOCATIONS_PATH, "utf8"))
    : {};
  const schoolsFile = existsSync(SCHOOLS_PATH)
    ? JSON.parse(readFileSync(SCHOOLS_PATH, "utf8"))
    : { schools: [], kindergartens: [] };
  const schools = schoolsFile.schools ?? [];
  const kindergartens = schoolsFile.kindergartens ?? [];
  const healthFile = existsSync(HEALTH_PATH)
    ? JSON.parse(readFileSync(HEALTH_PATH, "utf8"))
    : { sykehus: [], legevakt: [], privatklinikker: [] };
  const healthSykehus = healthFile.sykehus ?? [];
  const healthLegevakt = healthFile.legevakt ?? [];
  const healthPrivat = healthFile.privatklinikker ?? [];

  console.log(`  Loaded ${geo.features.length} kommuner, ${stations.length} stations, ${cabins.length} cabins, ${reservoirs.length} reservoirs, ${schools.length} schools, ${kindergartens.length} barnehager, ${Object.keys(finnLocations).length} Finn codes, ${healthSykehus.length} sykehus, ${healthLegevakt.length} legevakt, ${healthPrivat.length} klinikker`);

  // Fetch external data in parallel
  let population, income, bolig, protectedAreas, plants, fastlege, eiendomsskatt, gebyrer;
  let eierstatus, utdanning, boligtyper;
  try {
    [
      population,
      income,
      bolig,
      protectedAreas,
      plants,
      fastlege,
      eiendomsskatt,
      gebyrer,
      eierstatus,
      utdanning,
      boligtyper,
    ] = await Promise.all([
      fetchPopulation(),
      fetchIncome(),
      fetchBolig(),
      fetchProtectedAreas(),
      fetchEnergyPlants(),
      fetchFastlege(),
      fetchEiendomsskatt(),
      fetchKommunaleGebyrer(),
      fetchEierstatus(),
      fetchUtdanning(),
      fetchBoligtyper(),
    ]);
  } catch (err) {
    console.error(`  ✗ Failed fetching external data: ${err.message}`);
    if (existsSync(OUT_PATH)) {
      console.log("  → Keeping existing kommune-profiles.json");
      process.exit(0);
    }
    process.exit(1);
  }

  // Index stations by municipalityId (NOBIL already provides this)
  const stationsByKnr = {};
  for (const s of stations) {
    const knr = s.municipalityId;
    if (!knr) continue;
    (stationsByKnr[knr] ??= []).push(s);
  }

  // Index schools and kindergartens by kommunenummer (UDIR already provides this)
  const schoolsByKnr = {};
  for (const s of schools) {
    const knr = s.kommunenummer;
    if (!knr) continue;
    (schoolsByKnr[knr] ??= []).push(s);
  }
  const kindergartensByKnr = {};
  for (const k of kindergartens) {
    const knr = k.kommunenummer;
    if (!knr) continue;
    (kindergartensByKnr[knr] ??= []).push(k);
  }

  // Compute bboxes for all kommune polygons (fast point rejection)
  const kommuneBboxes = geo.features.map((f) => ({
    knr: f.properties.kommunenummer,
    feature: f,
    bbox: bboxOf(f.geometry),
  }));

  // Point-in-polygon: assign each cabin/reservoir/plant to a kommune
  function assignPoints(points, getCoord) {
    const byKnr = {};
    for (const pt of points) {
      const { lat, lon } = getCoord(pt);
      if (lat == null || lon == null) continue;
      // Try each kommune with bbox pre-filter
      for (const { knr, feature, bbox } of kommuneBboxes) {
        if (
          lat < bbox.minLat ||
          lat > bbox.maxLat ||
          lon < bbox.minLon ||
          lon > bbox.maxLon
        )
          continue;
        if (pointInGeometry(lon, lat, feature.geometry)) {
          (byKnr[knr] ??= []).push(pt);
          break;
        }
      }
    }
    return byKnr;
  }

  console.log("  Spatial join: cabins...");
  const cabinsByKnr = assignPoints(cabins, (c) => ({ lat: c.lat, lon: c.lon }));
  console.log("  Spatial join: reservoirs...");
  const reservoirsByKnr = assignPoints(reservoirs, (r) => r.center);
  console.log("  Spatial join: energy plants...");
  const plantsByKnr = assignPoints(plants, (p) => ({ lat: p.lat, lon: p.lon }));
  console.log("  Spatial join: health (sykehus + legevakt + klinikker)...");
  const sykehusByKnr = assignPoints(healthSykehus, (h) => ({ lat: h.lat, lon: h.lon }));
  const legevaktByKnr = assignPoints(healthLegevakt, (h) => ({ lat: h.lat, lon: h.lon }));
  const privatByKnr = assignPoints(healthPrivat, (h) => ({ lat: h.lat, lon: h.lon }));

  // Build profiles
  const profiles = {};
  for (const feature of geo.features) {
    const knr = feature.properties.kommunenummer;
    const name = feature.properties.kommunenavn;
    const area = Math.round(areaKm2(feature.geometry));
    const centroid = centroidOf(feature.geometry);
    const fylke = fylkeFor(knr);

    const stationList = stationsByKnr[knr] ?? [];
    const fastStations = stationList.filter((s) => (s.maxKw ?? 0) >= 50);
    const cabinList = cabinsByKnr[knr] ?? [];
    const reservoirList = reservoirsByKnr[knr] ?? [];
    const plantList = plantsByKnr[knr] ?? [];
    const totalMW = plantList.reduce((sum, p) => sum + (p.capacityMW ?? 0), 0);
    const schoolList = schoolsByKnr[knr] ?? [];
    const kindergartenList = kindergartensByKnr[knr] ?? [];
    const sykehusList = sykehusByKnr[knr] ?? [];
    const legevaktList = legevaktByKnr[knr] ?? [];
    const privatList = privatByKnr[knr] ?? [];
    const totalStudents = schoolList.reduce(
      (sum, s) => sum + (s.students ?? 0),
      0
    );
    const totalChildren = kindergartenList.reduce(
      (sum, k) => sum + (k.children ?? 0),
      0
    );
    const grunnskoleCount = schoolList.filter(
      (s) => s.type === "grunnskole" || s.type === "begge"
    ).length;
    const vgsCount = schoolList.filter(
      (s) => s.type === "vgs" || s.type === "begge"
    ).length;

    // Bolig summary: take 2024 for each of the 3 dwelling types
    const boligRaw = bolig[knr] ?? {};
    const boligByType = {};
    for (const [typeCode, years] of Object.entries(boligRaw)) {
      const yr2024 = years["2024"];
      if (yr2024) {
        boligByType[typeCode] = {
          price: yr2024.price,
          count: yr2024.count,
          trend: Object.entries(years)
            .filter(([y]) => ["2020", "2021", "2022", "2023", "2024"].includes(y))
            .sort()
            .map(([y, v]) => ({ year: y, price: v.price })),
        };
      }
    }

    // Affordability: kr/m² × 50 / income. Use Blokk (03) or Småhus (02) fallback or Enebolig (01).
    const priceForAffordability =
      boligByType["03"]?.price ??
      boligByType["02"]?.price ??
      boligByType["01"]?.price ??
      null;
    const incomeValue = income[knr] ?? null;
    const affordability =
      priceForAffordability && incomeValue
        ? Math.round(((priceForAffordability * 50) / incomeValue) * 10) / 10
        : null;

    const verneAreaKm2 = protectedAreas[knr] ?? null;
    const vernePct = verneAreaKm2 != null && area > 0
      ? Math.round((verneAreaKm2 / area) * 10000) / 100
      : null;

    const displayName = displayNameFor(name);
    const outline = simplifiedOutline(feature.geometry);
    const bbox = bboxOf(feature.geometry);
    profiles[knr] = {
      knr,
      name,
      displayName,
      slug: `${knr}-${slugify(displayName)}`,
      fylke,
      area,
      centroid,
      bbox: [bbox.minLat, bbox.minLon, bbox.maxLat, bbox.maxLon],
      outline,
      population: population[knr] ?? null,
      income: incomeValue,
      bolig: boligByType,
      affordability,
      finnLocationCode: finnLocations[knr] ?? null,
      verneAreaKm2,
      vernePct,
      charging: {
        total: stationList.length,
        fast: fastStations.length,
        topByKw: stationList
          .sort((a, b) => (b.maxKw ?? 0) - (a.maxKw ?? 0))
          .slice(0, 5)
          .map((s) => ({
            id: s.id,
            name: s.name,
            operator: s.operator,
            maxKw: s.maxKw,
          })),
        // All stations in the kommune (minimal fields for the mini-map)
        all: stationList
          .sort((a, b) => (b.maxKw ?? 0) - (a.maxKw ?? 0))
          .slice(0, 200)
          .map((s) => ({
            id: s.id,
            name: s.name,
            maxKw: s.maxKw,
            lat: s.lat,
            lon: s.lon,
          })),
      },
      cabins: {
        total: cabinList.length,
        top: cabinList
          .sort((a, b) => (b.beds ?? 0) - (a.beds ?? 0))
          .slice(0, 5)
          .map((c) => ({
            id: c.id,
            name: c.name,
            operator: c.operator,
            beds: c.beds,
            elevation: c.elevation,
            lat: c.lat,
            lon: c.lon,
          })),
        all: cabinList
          .sort((a, b) => (b.beds ?? 0) - (a.beds ?? 0))
          .slice(0, 200)
          .map((c) => ({
            id: c.id,
            name: c.name,
            cabinType: c.cabinType,
            beds: c.beds,
            lat: c.lat,
            lon: c.lon,
          })),
      },
      reservoirs: {
        total: reservoirList.length,
        top: reservoirList
          .sort((a, b) => (b.volumeMm3 ?? 0) - (a.volumeMm3 ?? 0))
          .slice(0, 5)
          .map((r) => ({
            id: r.id,
            name: r.name,
            volumeMm3: r.volumeMm3,
            plantName: r.plantName,
            lat: r.center?.lat,
            lon: r.center?.lon,
          })),
        all: reservoirList
          .sort((a, b) => (b.volumeMm3 ?? 0) - (a.volumeMm3 ?? 0))
          .slice(0, 200)
          .map((r) => ({
            id: r.id,
            name: r.name,
            volumeMm3: r.volumeMm3,
            lat: r.center?.lat,
            lon: r.center?.lon,
          })),
      },
      energy: {
        totalMW: Math.round(totalMW),
        plantCount: plantList.length,
        windCount: plantList.filter((p) => p.type === "vind").length,
        hydroCount: plantList.filter((p) => p.type === "vann").length,
        top: plantList
          .sort((a, b) => (b.capacityMW ?? 0) - (a.capacityMW ?? 0))
          .slice(0, 5)
          .map((p) => ({
            id: p.id,
            name: p.name,
            type: p.type,
            capacityMW: p.capacityMW,
            lat: p.lat,
            lon: p.lon,
          })),
        all: plantList
          .sort((a, b) => (b.capacityMW ?? 0) - (a.capacityMW ?? 0))
          .slice(0, 200)
          .map((p) => ({
            id: p.id,
            name: p.name,
            type: p.type,
            capacityMW: p.capacityMW,
            lat: p.lat,
            lon: p.lon,
          })),
      },
      schools: {
        total: schoolList.length,
        grunnskoleCount,
        vgsCount,
        totalStudents,
        top: schoolList
          .sort((a, b) => (b.students ?? 0) - (a.students ?? 0))
          .slice(0, 5)
          .map((s) => ({
            id: s.id,
            name: s.name,
            type: s.type,
            students: s.students,
            owner: s.owner,
            lat: s.lat,
            lon: s.lon,
          })),
        all: schoolList
          .sort((a, b) => (b.students ?? 0) - (a.students ?? 0))
          .slice(0, 200)
          .map((s) => ({
            id: s.id,
            name: s.name,
            type: s.type,
            students: s.students,
            lat: s.lat,
            lon: s.lon,
          })),
      },
      kindergartens: {
        total: kindergartenList.length,
        totalChildren,
        top: kindergartenList
          .sort((a, b) => (b.children ?? 0) - (a.children ?? 0))
          .slice(0, 5)
          .map((k) => ({
            id: k.id,
            name: k.name,
            children: k.children,
            owner: k.owner,
            lat: k.lat,
            lon: k.lon,
          })),
        all: kindergartenList
          .sort((a, b) => (b.children ?? 0) - (a.children ?? 0))
          .slice(0, 200)
          .map((k) => ({
            id: k.id,
            name: k.name,
            children: k.children,
            lat: k.lat,
            lon: k.lon,
          })),
      },
      health: (() => {
        const fl = fastlege.byKnr[knr] ?? {};
        // Latest year's value per metric (flat object, all 18 metrics)
        const latest = {};
        for (const m of FASTLEGE_METRICS) {
          const v = fl[m.code]?.[fastlege.latestYear];
          if (v != null) latest[m.code] = v;
        }
        // Trend for the three primary metrics only — keeps per-profile
        // footprint tight while still supporting the Stedsprofil sparkline.
        const trend = {};
        for (const m of FASTLEGE_METRICS.filter((m) => m.primary)) {
          const series = fl[m.code];
          if (!series) continue;
          trend[m.code] = Object.entries(series)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([year, value]) => ({ year, value }));
        }
        return {
          year: fastlege.latestYear,
          latest,
          trend,
          // OSM markers (sykehus + legevakt) reference count, kept so the
          // /helse optional OSM overlay badge and Stedsprofil can surface
          // "X sykehus i OSM" without fetching the full marker file.
          osm: {
            sykehusCount: sykehusList.length,
            legevaktCount: legevaktList.length,
            privatklinikkerCount: privatList.length,
          },
        };
      })(),
      cost: {
        eiendomsskatt: eiendomsskatt.byKnr[knr]
          ? {
              ...eiendomsskatt.byKnr[knr],
              year: eiendomsskatt.year,
            }
          : null,
        gebyrer: gebyrer.byKnr[knr]
          ? {
              ...gebyrer.byKnr[knr],
              year: gebyrer.year,
            }
          : null,
      },
      demografi: {
        eierstatus: eierstatus.byKnr[knr]
          ? { ...eierstatus.byKnr[knr], year: eierstatus.latestYear }
          : null,
        utdanning: utdanning.byKnr[knr]
          ? { ...utdanning.byKnr[knr], year: utdanning.latestYear }
          : null,
        boliger: boligtyper.byKnr[knr]
          ? { ...boligtyper.byKnr[knr], year: boligtyper.latestYear }
          : null,
      },
    };
  }

  // Compute rankings
  const popRanks = rankBy(profiles, (p) => p.population);
  const incomeRanks = rankBy(profiles, (p) => p.income);
  const boligRanks = rankBy(
    profiles,
    (p) => p.bolig?.["03"]?.price ?? p.bolig?.["02"]?.price ?? p.bolig?.["01"]?.price
  );
  // Enebolig-first rank — used by the snapshot generator so the kr/m²
  // figure and the "#X av Y" reference stay consistent when we prefer
  // the enebolig price as the reader's anchor.
  const eneboligRanks = rankBy(
    profiles,
    (p) => p.bolig?.["01"]?.price ?? p.bolig?.["02"]?.price ?? p.bolig?.["03"]?.price
  );
  const verneRanks = rankBy(profiles, (p) => p.vernePct);
  const energyRanks = rankBy(profiles, (p) => p.energy.totalMW);
  const affordabilityRanks = rankBy(profiles, (p) => p.affordability, false); // lower = better
  // Fastlege rankings — for "reservekapasitet" higher is better, for the
  // other two primary metrics LOWER is better (you don't want overcrowded
  // lists or a large andel without a GP).
  const reservekapasitetRanks = rankBy(
    profiles,
    (p) => p.health.latest.KOSreservekapasi0000
  );
  const andelUtenLegeRanks = rankBy(
    profiles,
    (p) => p.health.latest.KOSandelpasiente0000,
    false
  );
  const listelengdeRanks = rankBy(
    profiles,
    (p) => p.health.latest.KOSgjsnlisteleng0000,
    false
  );
  // Cheapest kommunale gebyrer first (rank 1 = lowest total).
  const gebyrTotalRanks = rankBy(profiles, (p) => p.cost?.gebyrer?.total, false);

  const rankTotals = {
    kommuner: Object.keys(profiles).length,
    popTotal: popRanks.total,
    incomeTotal: incomeRanks.total,
    boligTotal: boligRanks.total,
    eneboligTotal: eneboligRanks.total,
    verneTotal: verneRanks.total,
    energyTotal: energyRanks.total,
    reservekapasitetTotal: reservekapasitetRanks.total,
    andelUtenLegeTotal: andelUtenLegeRanks.total,
    listelengdeTotal: listelengdeRanks.total,
    gebyrTotalTotal: gebyrTotalRanks.total,
  };

  for (const [knr, profile] of Object.entries(profiles)) {
    profile.ranks = {
      population: popRanks.ranks[knr] ?? null,
      income: incomeRanks.ranks[knr] ?? null,
      bolig: boligRanks.ranks[knr] ?? null,
      boligEnebolig: eneboligRanks.ranks[knr] ?? null,
      verne: verneRanks.ranks[knr] ?? null,
      energy: energyRanks.ranks[knr] ?? null,
      affordability: affordabilityRanks.ranks[knr] ?? null,
      reservekapasitet: reservekapasitetRanks.ranks[knr] ?? null,
      andelUtenLege: andelUtenLegeRanks.ranks[knr] ?? null,
      listelengde: listelengdeRanks.ranks[knr] ?? null,
      gebyrTotal: gebyrTotalRanks.ranks[knr] ?? null,
    };
    profile.snapshot = generateSnapshot(profile, rankTotals);
  }

  // Write public/data/fastlege.json — consumed by /helse choropleth. Each
  // kommune row carries the latest-year value for ALL 18 metrics (small
  // enough: 357 × 18 = 6.4k numbers) so the detail sheet can show the
  // full stat grid without another fetch. Trend series are only stored
  // for the three primary metrics used in sparklines.
  const fastlegeOut = {
    generatedAt: new Date().toISOString(),
    latestYear: fastlege.latestYear,
    metrics: FASTLEGE_METRICS.map((m) => ({
      code: m.code,
      label: m.label,
      unit: m.unit,
      primary: m.primary ?? false,
      invertColor: m.invertColor ?? false,
    })),
    kommuner: Object.fromEntries(
      Object.entries(fastlege.byKnr)
        .map(([knr, series]) => {
          const latest = {};
          for (const m of FASTLEGE_METRICS) {
            const v = series[m.code]?.[fastlege.latestYear];
            if (v != null) latest[m.code] = v;
          }
          const trend = {};
          for (const m of FASTLEGE_METRICS.filter((m) => m.primary)) {
            if (!series[m.code]) continue;
            trend[m.code] = Object.entries(series[m.code])
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([year, value]) => ({ year, value }));
          }
          return [knr, { latest, trend }];
        })
        .filter(([, entry]) => Object.keys(entry.latest).length > 0)
    ),
  };
  writeFileSync(FASTLEGE_OUT_PATH, JSON.stringify(fastlegeOut));
  const fastlegeKb = (Buffer.byteLength(JSON.stringify(fastlegeOut)) / 1024).toFixed(0);
  console.log(
    `  ✓ ${Object.keys(fastlegeOut.kommuner).length} fastlege rows (${fastlegeKb} KB) → ${FASTLEGE_OUT_PATH}`
  );

  // Write public/data/kostnader.json — flat cost-of-living dataset consumed
  // by the /kostnader choropleth. Mirrors fastlege.json's structure: a
  // shared metric definition + one row per kommune. Kept tiny (~40 KB)
  // because the values are single-year snapshots with no trend series.
  const KOSTNAD_METRICS = [
    {
      code: "gebyrerTotal",
      label: "Kommunale årsgebyr",
      shortLabel: "Årsgebyr",
      unit: "kr",
      primary: true,
      invertColor: true, // lower = better (greener)
      description:
        "Sum av årsgebyr for vann, avløp, avfall og feiing — ekskl. mva. Fra SSB tabell 12842.",
    },
    {
      code: "eiendomsskatt120m2",
      label: "Eiendomsskatt (enebolig 120 m²)",
      shortLabel: "Eiendomsskatt",
      unit: "kr",
      primary: true,
      invertColor: true, // lower = better
      description:
        "SSBs standardiserte årlige eiendomsskatt for en enebolig på 120 m². Fra SSB tabell 14674. Kommuner uten eiendomsskatt på bolig vises som «Ingen».",
    },
    {
      code: "eiendomsskattPromille",
      label: "Eiendomsskatt (promille)",
      shortLabel: "Promille",
      unit: "‰",
      primary: false,
      invertColor: true,
      description:
        "Generell eiendomsskattesats i promille av takst. Fra SSB tabell 14674.",
    },
  ];

  const kostnaderOut = {
    generatedAt: new Date().toISOString(),
    gebyrerYear: gebyrer.year,
    eiendomsskattYear: eiendomsskatt.year,
    metrics: KOSTNAD_METRICS,
    kommuner: Object.fromEntries(
      Object.entries(profiles)
        .map(([knr, p]) => {
          const cost = p.cost;
          const latest = {};
          if (cost.gebyrer?.total != null) latest.gebyrerTotal = cost.gebyrer.total;
          if (cost.eiendomsskatt?.annualFor120m2 != null)
            latest.eiendomsskatt120m2 = cost.eiendomsskatt.annualFor120m2;
          if (cost.eiendomsskatt?.promille != null)
            latest.eiendomsskattPromille = cost.eiendomsskatt.promille;
          return [
            knr,
            {
              latest,
              // Explicit "no eiendomsskatt on homes" flag so the UI can show
              // the positive "Ingen" pill instead of an empty cell. A null
              // means we don't know, a false means kommunen confirmed no
              // eiendomsskatt.
              hasEiendomsskatt:
                cost.eiendomsskatt == null ? null : cost.eiendomsskatt.has,
              gebyrer: cost.gebyrer ?? null,
              displayName: p.displayName,
              fylke: p.fylke,
            },
          ];
        })
        .filter(([, entry]) => Object.keys(entry.latest).length > 0 || entry.hasEiendomsskatt === false)
    ),
  };
  writeFileSync(KOSTNADER_OUT_PATH, JSON.stringify(kostnaderOut));
  const kostnaderKb = (Buffer.byteLength(JSON.stringify(kostnaderOut)) / 1024).toFixed(0);
  console.log(
    `  ✓ ${Object.keys(kostnaderOut.kommuner).length} kostnader rows (${kostnaderKb} KB) → ${KOSTNADER_OUT_PATH}`
  );

  // Write
  const output = {
    generatedAt: new Date().toISOString(),
    totals: {
      kommuner: Object.keys(profiles).length,
      popTotal: popRanks.total,
      incomeTotal: incomeRanks.total,
      boligTotal: boligRanks.total,
    },
    profiles,
  };
  writeFileSync(OUT_PATH, JSON.stringify(output));

  const sizeKB = (Buffer.byteLength(JSON.stringify(output)) / 1024).toFixed(0);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`  ✓ ${Object.keys(profiles).length} profiles (${sizeKB} KB) → ${OUT_PATH} [${elapsed}s]`);
}

main().catch((err) => {
  console.error(`  ✗ Fatal: ${err.message}`);
  process.exit(1);
});
