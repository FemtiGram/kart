// Builds a per-kommune profile JSON by combining:
//   - kommuner.geojson (boundary polygons)
//   - SSB 07459 (population)
//   - SSB InntektStruk13 (median household income)
//   - SSB 06035 (housing prices per dwelling type, 10 years)
//   - SSB 08936 (protected areas)
//   - NVE Vannkraft1/0 + Vindkraft2/0 (hydro + operational wind plants)
//   - public/data/stations.json (charging stations, grouped by municipalityId)
//   - public/data/cabins.json (DNT cabins, point-in-polygon)
//   - public/data/reservoirs.json (reservoirs, point-in-polygon)
//
// Output: public/data/kommune-profiles.json keyed by kommunenummer.
// Run with: node scripts/build-kommune-profiles.mjs

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const GEOJSON_PATH = join(ROOT, "public", "data", "kommuner.geojson");
const STATIONS_PATH = join(ROOT, "public", "data", "stations.json");
const CABINS_PATH = join(ROOT, "public", "data", "cabins.json");
const RESERVOIRS_PATH = join(ROOT, "public", "data", "reservoirs.json");
const OUT_PATH = join(ROOT, "public", "data", "kommune-profiles.json");

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

  console.log(`  Loaded ${geo.features.length} kommuner, ${stations.length} stations, ${cabins.length} cabins, ${reservoirs.length} reservoirs`);

  // Fetch external data in parallel
  let population, income, bolig, protectedAreas, plants;
  try {
    [population, income, bolig, protectedAreas, plants] = await Promise.all([
      fetchPopulation(),
      fetchIncome(),
      fetchBolig(),
      fetchProtectedAreas(),
      fetchEnergyPlants(),
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
  const verneRanks = rankBy(profiles, (p) => p.vernePct);
  const energyRanks = rankBy(profiles, (p) => p.energy.totalMW);
  const affordabilityRanks = rankBy(profiles, (p) => p.affordability, false); // lower = better

  for (const [knr, profile] of Object.entries(profiles)) {
    profile.ranks = {
      population: popRanks.ranks[knr] ?? null,
      income: incomeRanks.ranks[knr] ?? null,
      bolig: boligRanks.ranks[knr] ?? null,
      verne: verneRanks.ranks[knr] ?? null,
      energy: energyRanks.ranks[knr] ?? null,
      affordability: affordabilityRanks.ranks[knr] ?? null,
    };
  }

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
