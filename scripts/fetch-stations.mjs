// Fetches all Norwegian charging stations from NOBIL (official database)
// and saves them as a static JSON file for the frontend.
// Requires NOBIL_API_KEY in environment.
// Run with: node scripts/fetch-stations.mjs

import { writeFileSync, existsSync } from "fs";
import { join } from "path";

const OUT_PATH = join(process.cwd(), "public", "data", "stations.json");
const API_KEY = process.env.NOBIL_API_KEY;

// Parse kW from NOBIL capacity string like "150 kW DC", "22 kW - 400V 3-phase max 32A"
function parseKw(capacityStr) {
  if (!capacityStr) return null;
  const match = capacityStr.match(/([\d,.]+)\s*kW/i);
  if (match) return parseFloat(match[1].replace(",", "."));
  // "230V 1-phase max 16A" → ~3.6 kW
  const ampMatch = capacityStr.match(/(\d+)V.*?(\d+)A/);
  if (ampMatch) {
    const v = parseInt(ampMatch[1]);
    const a = parseInt(ampMatch[2]);
    const phases = capacityStr.includes("3-phase") ? 3 : 1;
    return Math.round((v * a * phases) / 1000 * 10) / 10;
  }
  return null;
}

// Parse "(lat,lon)" position string
function parsePosition(pos) {
  if (!pos) return null;
  const match = pos.match(/\(([-\d.]+),([-\d.]+)\)/);
  if (!match) return null;
  return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
}

async function main() {
  if (!API_KEY) {
    console.warn("NOBIL_API_KEY not set — keeping existing stations.json");
    return;
  }

  console.log("Fetching all charging stations from NOBIL...");
  const start = Date.now();

  try {
    const res = await fetch(
      `https://nobil.no/api/server/datadump.php?apikey=${API_KEY}&countrycode=NOR&format=json&file=false`,
      { signal: AbortSignal.timeout(60000) }
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const raw = data.chargerstations ?? [];

    const stations = [];
    for (const s of raw) {
      const csmd = s.csmd;
      if (csmd.Station_status !== 1) continue; // Only active stations
      const pos = parsePosition(csmd.Position);
      if (!pos) continue;

      // Group connectors by type, aggregate count and max kW
      const connMap = new Map();
      for (const conn of Object.values(s.attr.conn)) {
        const type = conn["4"]?.trans;
        if (!type) continue;
        const kw = parseKw(conn["5"]?.trans);
        const existing = connMap.get(type);
        if (existing) {
          existing.count++;
          if (kw && (!existing.kw || kw > existing.kw)) existing.kw = kw;
        } else {
          connMap.set(type, { type, count: 1, kw });
        }
      }
      const connectors = [...connMap.values()];

      // Max kW across all connectors
      const maxKw = connectors.reduce((max, c) => Math.max(max, c.kw ?? 0), 0) || null;

      // Station attributes
      const st = s.attr.st;

      stations.push({
        id: csmd.International_id,
        lat: pos.lat,
        lon: pos.lon,
        name: csmd.name || "Ladestasjon",
        operator: csmd.Operator || null,
        owner: csmd.Owned_by !== csmd.Operator ? csmd.Owned_by || null : null,
        address: [csmd.Street, csmd.House_number].filter(Boolean).join(" ") || null,
        city: csmd.City || null,
        zipcode: csmd.Zipcode || null,
        municipality: csmd.Municipality || null,
        municipalityId: csmd.Municipality_ID || null,
        county: csmd.County || null,
        numPoints: csmd.Number_charging_points ?? null,
        maxKw,
        connectors,
        open24h: st["24"]?.trans === "Yes",
        parkingFee: st["7"]?.trans === "Yes",
        locationType: st["3"]?.trans || null,
        availability: st["2"]?.trans || null,
        nobilId: csmd.id,
      });
    }

    writeFileSync(OUT_PATH, JSON.stringify(stations));

    const sizeKB = (Buffer.byteLength(JSON.stringify(stations)) / 1024).toFixed(0);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  ✓ ${stations.length} stations (${sizeKB} KB) → ${OUT_PATH} [${elapsed}s]`);
  } catch (err) {
    console.error(`  ✗ Failed: ${err.message}`);
    if (existsSync(OUT_PATH)) {
      console.log("  → Keeping existing file");
    }
  }
}

main();
