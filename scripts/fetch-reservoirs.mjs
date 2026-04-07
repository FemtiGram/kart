// Fetches reservoir polygons + metadata from NVE ArcGIS and saves
// as static JSON. The heavy geometry query takes 5-10s which exceeds
// Vercel's 10s serverless timeout, so we do it at build time instead.
// Run with: node scripts/fetch-reservoirs.mjs

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "public", "data", "reservoirs.json");

const NVE_URL =
  "https://nve.geodataonline.no/arcgis/rest/services/Vannkraft1/MapServer/6/query?" +
  "where=status%3D'D'+AND+volumOppdemt_Mm3+IS+NOT+NULL" +
  "&outFields=OBJECTID,magasinNavn,vannkraftverkNavn,elvenavnHierarki," +
  "hoyesteRegulerteVannstand_moh,lavesteRegulerteVannstand_moh," +
  "volumOppdemt_Mm3,magasinArealHRV_km2,idriftsattAar,magasinFormal_Liste" +
  "&returnGeometry=true&f=json&resultRecordCount=500";

// ─── UTM zone 33N → WGS84 (same math as src/lib/utm.ts) ────

function utmToLatLon(easting, northing) {
  const k0 = 0.9996;
  const a = 6378137;
  const f = 1 / 298.257223563;
  const e = Math.sqrt(2 * f - f * f);
  const e2 = e * e;
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const lon0 = (15 * Math.PI) / 180;

  const x = easting - 500000;
  const y = northing;
  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 * e1 * e1) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 * e1 * e1 * e1) / 32) * Math.sin(4 * mu) +
    ((151 * e1 * e1 * e1) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 * e1 * e1 * e1) / 512) * Math.sin(8 * mu);

  const sinPhi = Math.sin(phi1);
  const cosPhi = Math.cos(phi1);
  const tanPhi = Math.tan(phi1);
  const ep2 = e2 / (1 - e2);
  const N1 = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const T1 = tanPhi * tanPhi;
  const C1 = ep2 * cosPhi * cosPhi;
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinPhi * sinPhi, 1.5);
  const D = x / (N1 * k0);

  const lat =
    phi1 -
    ((N1 * tanPhi) / R1) *
      (D * D / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D * D * D * D) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) *
          D * D * D * D * D * D) / 720);

  const lon =
    lon0 +
    (D -
      ((1 + 2 * T1 + C1) * D * D * D) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) *
        D * D * D * D * D) / 120) /
      cosPhi;

  return { lat: (lat * 180) / Math.PI, lon: (lon * 180) / Math.PI };
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  console.log("Fetching reservoirs from NVE...");
  try {
    const res = await fetch(NVE_URL, {
      headers: { "User-Agent": "Datakart/1.0 github.com/FemtiGram/kart" },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) throw new Error(`NVE API returned ${res.status}`);

    const data = await res.json();
    const features = data.features ?? [];
    console.log(`  → ${features.length} features from NVE`);

    const reservoirs = [];

    for (const f of features) {
      const a = f.attributes;
      const rings = f.geometry?.rings;
      if (!rings?.length) continue;

      // Convert UTM polygon rings to WGS84, simplify large rings
      const wgsRings = rings.map((ring) => {
        const step = ring.length > 100 ? 5 : ring.length > 50 ? 3 : ring.length > 20 ? 2 : 1;
        const simplified = [];
        for (let i = 0; i < ring.length; i += step) {
          const { lat, lon } = utmToLatLon(ring[i][0], ring[i][1]);
          simplified.push([
            Math.round(lat * 100000) / 100000,
            Math.round(lon * 100000) / 100000,
          ]);
        }
        // Close the ring
        if (simplified.length > 0) {
          const last = ring[ring.length - 1];
          const { lat, lon } = utmToLatLon(last[0], last[1]);
          simplified.push([
            Math.round(lat * 100000) / 100000,
            Math.round(lon * 100000) / 100000,
          ]);
        }
        return simplified;
      });

      const firstRing = wgsRings[0];
      const centerLat = firstRing.reduce((s, c) => s + c[0], 0) / firstRing.length;
      const centerLon = firstRing.reduce((s, c) => s + c[1], 0) / firstRing.length;

      reservoirs.push({
        id: a.OBJECTID,
        name: a.magasinNavn ?? "Ukjent magasin",
        plantName: a.vannkraftverkNavn ?? null,
        river: a.elvenavnHierarki ?? null,
        hrv: a.hoyesteRegulerteVannstand_moh ?? null,
        lrv: a.lavesteRegulerteVannstand_moh ?? null,
        volumeMm3: a.volumOppdemt_Mm3 ?? null,
        areaKm2: a.magasinArealHRV_km2 ?? null,
        yearBuilt: a.idriftsattAar ?? null,
        purpose: a.magasinFormal_Liste ?? null,
        polygon: wgsRings,
        center: {
          lat: Math.round(centerLat * 100000) / 100000,
          lon: Math.round(centerLon * 100000) / 100000,
        },
      });
    }

    const output = { fetchedAt: new Date().toISOString(), reservoirs };
    writeFileSync(OUT_PATH, JSON.stringify(output));
    const sizeKB = (Buffer.byteLength(JSON.stringify(output)) / 1024).toFixed(0);
    console.log(`  → Wrote ${reservoirs.length} reservoirs to ${OUT_PATH} (${sizeKB} KB)`);
  } catch (err) {
    console.error("Failed to fetch reservoirs:", err.message);
    if (existsSync(OUT_PATH)) {
      console.log("  → Keeping existing data file");
    } else {
      // Write empty fallback so the app doesn't crash
      writeFileSync(OUT_PATH, JSON.stringify({ fetchedAt: null, reservoirs: [] }));
      console.log("  → Wrote empty fallback");
    }
  }
}

main();
