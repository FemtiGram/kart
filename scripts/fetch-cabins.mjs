// Fetches all Norwegian tourist cabins from Overpass API
// and saves them as a static JSON file for the frontend.
// Run with: node scripts/fetch-cabins.mjs

const QUERY = `
[out:json][timeout:60];
(
  node["tourism"="alpine_hut"](57.5,4.0,71.5,31.5);
  node["tourism"="wilderness_hut"](57.5,4.0,71.5,31.5);
  way["tourism"="alpine_hut"](57.5,4.0,71.5,31.5);
  way["tourism"="wilderness_hut"](57.5,4.0,71.5,31.5);
);
out center body;
`;

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

async function fetchWithRetry() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
    console.log(`Attempt ${attempt + 1}: ${endpoint}`);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(QUERY)}`,
        signal: AbortSignal.timeout(90000),
      });
      if (res.ok) return res;
      console.warn(`  → ${res.status}, trying next...`);
    } catch (err) {
      console.warn(`  → ${err.message}, trying next...`);
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

async function main() {
  console.log("Fetching all tourist cabins from Overpass API...");
  const start = Date.now();

  const res = await fetchWithRetry();

  if (!res) {
    console.warn("All Overpass endpoints failed — keeping existing cabins.json");
    return;
  }

  const data = await res.json();

  const cabins = data.elements.map((el) => {
    const t = el.tags || {};
    const lat = el.lat ?? el.center?.lat ?? 0;
    const lon = el.lon ?? el.center?.lon ?? 0;

    const isDNT = /turistforening|dnt/i.test(t.operator ?? "");
    const cabinType = t.tourism === "alpine_hut" ? "fjellhytte" : "ubetjent";

    const rawHours = t.opening_hours ?? null;
    let season = null;
    if (rawHours) {
      const h = rawHours.toLowerCase();
      if (h === "24/7" || h.includes("jan-dec") || h.includes("mo-su")) {
        season = "Helårs";
      } else {
        season = rawHours.charAt(0).toUpperCase() + rawHours.slice(1);
      }
    }

    return {
      id: el.id,
      lat,
      lon,
      name: t.name ?? "Ukjent hytte",
      operator: t.operator ?? null,
      cabinType,
      isDNT,
      elevation: t.ele ? parseInt(t.ele) : null,
      beds: t.beds ? parseInt(t.beds) : t.capacity ? parseInt(t.capacity) : null,
      website: t.website ?? t["contact:website"] ?? null,
      description: t.description ?? null,
      fee: t.fee === "yes" ? true : t.fee === "no" ? false : null,
      season,
      phone: t.phone ?? t["contact:phone"] ?? null,
      shower: t.shower === "yes" ? true : t.shower === "no" ? false : null,
    };
  }).filter((c) => c.lat !== 0 && c.lon !== 0);

  const fs = await import("fs");
  const path = await import("path");
  const outPath = path.join(process.cwd(), "public", "data", "cabins.json");
  fs.writeFileSync(outPath, JSON.stringify(cabins));

  const sizeKB = (Buffer.byteLength(JSON.stringify(cabins)) / 1024).toFixed(0);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`Done! ${cabins.length} cabins, ${sizeKB}KB, ${elapsed}s`);
}

main().catch((err) => {
  console.error("Failed to fetch cabins:", err.message);
  console.log("Continuing build with existing cabins.json");
});
