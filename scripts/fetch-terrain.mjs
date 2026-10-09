// One-off: elevation grid for the Høydekart card art (scripts/build-thumbs.mjs).
//
// Downloads Mapzen Terrain Tiles (terrarium PNGs on AWS Open Data, zoom 8,
// ~300 m/px — Norway's data in them is Kartverket's DTM) for Sør-Norge,
// resamples them onto a plain lat/lon grid and saves it as an 8-bit
// greyscale PNG next to a small JSON describing the grid. Terrain doesn't
// change, so this is NOT part of prebuild: run it once, commit the output,
// and build-thumbs stays offline.
//
//   node scripts/fetch-terrain.mjs
//
// Output (committed):
//   scripts/data/terrain.png   grid, 1 grey level = METRES_PER_LEVEL m, sea and
//                              anything below sea level clamped to 0
//   scripts/data/terrain.json  bounds, size, scale, source

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(root, "scripts/data");

// Generous bounds so the card's frame can be re-tuned without refetching
const BOUNDS = { lon0: 1.5, lon1: 16.5, lat0: 58.0, lat1: 63.2 };
const STEP = { lon: 0.02, lat: 0.01 }; // ≈1.1 km either way at 60°N
const Z = 8;
const METRES_PER_LEVEL = 10; // 0–2550 m in one byte; Galdhøpiggen is 2469
const TILE_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

const n = 2 ** Z;
const tileX = (lon) => ((lon + 180) / 360) * n;
const tileY = (lat) => {
  const φ = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(φ) + 1 / Math.cos(φ)) / Math.PI) / 2) * n;
};

async function fetchTile(x, y) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(TILE_URL(Z, x, y), { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { data } = await sharp(Buffer.from(await res.arrayBuffer())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      return data; // 256×256×3, terrarium-encoded
    } catch (err) {
      if (attempt >= 3) throw new Error(`tile ${Z}/${x}/${y}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

const x0 = Math.floor(tileX(BOUNDS.lon0)), x1 = Math.floor(tileX(BOUNDS.lon1));
const y0 = Math.floor(tileY(BOUNDS.lat1)), y1 = Math.floor(tileY(BOUNDS.lat0));
const jobs = [];
for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) jobs.push([tx, ty]);
console.log(`Fetching ${jobs.length} terrain tiles (z${Z})...`);

const tiles = new Map();
for (let i = 0; i < jobs.length; i += 8) {
  await Promise.all(jobs.slice(i, i + 8).map(async ([tx, ty]) => tiles.set(`${tx}/${ty}`, await fetchTile(tx, ty))));
}

/** Elevation in metres at a fractional global pixel position (nearest tile pixel). */
const elevationAt = (gx, gy) => {
  const tx = Math.floor(gx / 256), ty = Math.floor(gy / 256);
  const t = tiles.get(`${tx}/${ty}`);
  const i = ((Math.floor(gy) - ty * 256) * 256 + (Math.floor(gx) - tx * 256)) * 3;
  return t[i] * 256 + t[i + 1] + t[i + 2] / 256 - 32768;
};

// Each grid cell is the mean of a 4×4 supersample (a cell spans ~3–4 tile pixels)
const width = Math.round((BOUNDS.lon1 - BOUNDS.lon0) / STEP.lon);
const height = Math.round((BOUNDS.lat1 - BOUNDS.lat0) / STEP.lat);
const grid = Buffer.alloc(width * height);
const SS = 4;
let highest = 0;
for (let j = 0; j < height; j++) {
  for (let i = 0; i < width; i++) {
    let sum = 0;
    for (let sj = 0; sj < SS; sj++) for (let si = 0; si < SS; si++) {
      const lon = BOUNDS.lon0 + (i + (si + 0.5) / SS) * STEP.lon;
      const lat = BOUNDS.lat1 - (j + (sj + 0.5) / SS) * STEP.lat;
      sum += Math.max(0, elevationAt(tileX(lon) * 256, tileY(lat) * 256));
    }
    const metres = sum / (SS * SS);
    highest = Math.max(highest, metres);
    grid[j * width + i] = Math.min(255, Math.round(metres / METRES_PER_LEVEL));
  }
}

mkdirSync(OUT_DIR, { recursive: true });
const png = await sharp(grid, { raw: { width, height, channels: 1 } }).png({ compressionLevel: 9 }).toFile(join(OUT_DIR, "terrain.png"));
writeFileSync(
  join(OUT_DIR, "terrain.json"),
  JSON.stringify(
    {
      source: "Mapzen Terrain Tiles on AWS Open Data (terrarium, z8). Norway © Kartverket; see https://github.com/tilezen/joerd/blob/master/docs/attribution.md",
      bounds: BOUNDS,
      width,
      height,
      metresPerLevel: METRES_PER_LEVEL,
      fetchedAt: new Date().toISOString(),
    },
    null,
    2
  ) + "\n"
);
console.log(`Saved terrain.png ${width}×${height} (${(png.size / 1024).toFixed(0)} KB), highest cell ${highest.toFixed(0)} m`);
