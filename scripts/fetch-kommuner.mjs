// Fetches kommune boundary GeoJSON from GitHub and saves as static file.
// The file is 4.4 MB which exceeds Next.js's 2 MB fetch cache limit,
// so we serve it as a static file instead of proxying through an API route.
// Run with: node scripts/fetch-kommuner.mjs

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "public", "data", "kommuner.geojson");

const URL = "https://raw.githubusercontent.com/robhop/fylker-og-kommuner/main/Kommuner-M.geojson";

async function main() {
  console.log("Fetching kommune boundaries...");
  try {
    const res = await fetch(URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const featureCount = data.features?.length ?? 0;
    writeFileSync(OUT_PATH, JSON.stringify(data));
    const sizeMB = (Buffer.byteLength(JSON.stringify(data)) / 1e6).toFixed(1);
    console.log(`  ✓ ${featureCount} kommuner (${sizeMB} MB) → ${OUT_PATH}`);
  } catch (err) {
    console.error(`  ✗ Failed: ${err.message}`);
    if (existsSync(OUT_PATH)) {
      console.log("  → Keeping existing file");
    }
    // Don't fail the build — existing file is fine
  }
}

main();
