// Fetches yearly oil/gas production data per field from Sodir (Norwegian Offshore Directorate)
// and saves as a static JSON file grouped by field name.
// Run with: node scripts/fetch-production.mjs

import { writeFileSync, readFileSync } from "fs";

const CSV_URL =
  "https://factpages.sodir.no/public?/Factpages/external/tableview/field_production_yearly&rs:Command=Render&rc:Toolbar=false&rc:Parameters=f&IpAddress=not_used&CultureCode=en&rs:Format=CSV&Top100=false";

const OUT_PATH = "public/data/production.json";

async function fetchProduction() {
  console.log("Fetching Sodir yearly production data...");
  try {
    const res = await fetch(CSV_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    // Parse CSV (BOM-safe)
    const lines = text.replace(/^\uFEFF/, "").trim().split("\n");
    const header = lines[0].split(",");
    console.log(`  ${lines.length - 1} rows, columns: ${header.join(", ")}`);

    // Group by field name
    const byField = {};
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      const field = cols[0];
      const year = parseInt(cols[1], 10);
      const oil = parseFloat(cols[2]) || 0;     // mill Sm3
      const gas = parseFloat(cols[3]) || 0;     // bill Sm3
      const ngl = parseFloat(cols[4]) || 0;     // mill Sm3
      const condensate = parseFloat(cols[5]) || 0; // mill Sm3
      const oe = parseFloat(cols[6]) || 0;      // mill Sm3 oil equivalents
      const water = parseFloat(cols[7]) || 0;   // mill Sm3

      if (!byField[field]) byField[field] = [];
      byField[field].push({ year, oil, gas, ngl, condensate, oe, water });
    }

    // Sort each field's data by year
    for (const field of Object.keys(byField)) {
      byField[field].sort((a, b) => a.year - b.year);
    }

    const fieldCount = Object.keys(byField).length;
    console.log(`  ${fieldCount} unique fields`);

    writeFileSync(OUT_PATH, JSON.stringify({ fetchedAt: new Date().toISOString(), fields: byField }));
    const size = readFileSync(OUT_PATH).length;
    console.log(`  Saved to ${OUT_PATH} (${(size / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.error("  Failed to fetch production data:", err.message);
    // Keep existing file if it exists
    try {
      readFileSync(OUT_PATH);
      console.log("  Keeping existing production.json");
    } catch {
      writeFileSync(OUT_PATH, "{}");
      console.log("  Created empty production.json");
    }
  }
}

fetchProduction();
