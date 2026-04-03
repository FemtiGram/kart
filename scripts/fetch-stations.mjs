// Fetches all Norwegian charging stations from Overpass API
// and saves them as a static JSON file for the frontend.
// Run with: node scripts/fetch-stations.mjs

const QUERY = `
[out:json][timeout:60];
node["amenity"="charging_station"](57.5,4.0,71.5,31.5);
out body;
`;

async function main() {
  console.log("Fetching all charging stations from Overpass API...");
  const start = Date.now();

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(QUERY)}`,
  });

  if (!res.ok) {
    console.error(`Overpass API returned ${res.status}`);
    process.exit(1);
  }

  const data = await res.json();

  const stations = data.elements.map((el) => {
    const t = el.tags || {};
    const connectors = ["type2", "chademo", "type2_combo", "type1", "schuko", "type3c"]
      .filter((s) => t[`socket:${s}`] && t[`socket:${s}`] !== "no")
      .map((s) =>
        s.replace("type2_combo", "CCS")
          .replace("type2", "Type 2")
          .replace("chademo", "CHAdeMO")
          .replace("type1", "Type 1")
          .replace("schuko", "Schuko")
          .replace("type3c", "Type 3C")
      );

    const address = [t["addr:street"], t["addr:housenumber"], t["addr:city"]]
      .filter(Boolean)
      .join(" ");

    return {
      id: el.id,
      lat: el.lat,
      lon: el.lon,
      name: t.name ?? t.operator ?? "Ladestasjon",
      operator: t.operator ?? null,
      capacity: t.capacity ? parseInt(t.capacity) : null,
      connectors,
      address: address || null,
    };
  });

  const fs = await import("fs");
  const path = await import("path");
  const outPath = path.join(process.cwd(), "public", "data", "stations.json");
  fs.writeFileSync(outPath, JSON.stringify(stations));

  const sizeKB = (Buffer.byteLength(JSON.stringify(stations)) / 1024).toFixed(0);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`Done! ${stations.length} stations, ${sizeKB}KB, ${elapsed}s`);
}

main().catch((err) => {
  console.error("Failed to fetch stations:", err.message);
  // Don't exit with error — let the build continue with existing data
  console.log("Continuing build with existing stations.json");
});
