// Fetches all Norwegian hospitals, legevakt stations and private clinics
// from OpenStreetMap via Overpass, and saves them as a static JSON file.
//
// Classification logic:
//   - amenity=hospital               → sykehus
//   - amenity=clinic with an emergency hint
//     (emergency=yes, healthcare=emergency, or name matching /legevakt/i)
//                                    → legevakt
//   - amenity=clinic (everything else) → privatklinikk
//
// OSM is crowd-sourced and inconsistent; the /helse page wraps this data
// in a permanent verification banner. We also pull the OSM element
// `timestamp` (via `out meta`) so the detail sheet can show "sist oppdatert
// i OpenStreetMap: X år siden", letting users spot stale entries.
//
// Run with: node scripts/fetch-health.mjs

// Using Overpass area lookup to constrain results to Norway only. A raw
// bbox over Fennoscandia pulls in Sweden/Finland/Russia/Estonia — the
// bbox trick the other fetchers use happens to work for cabins but is
// wrong for health infrastructure where every neighbour has dense data.
const QUERY = `
[out:json][timeout:120];
area["ISO3166-1"="NO"][admin_level=2]->.no;
(
  node["amenity"="hospital"](area.no);
  way["amenity"="hospital"](area.no);
  node["amenity"="clinic"](area.no);
  way["amenity"="clinic"](area.no);
);
out center meta;
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
        signal: AbortSignal.timeout(120000),
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

function classify(tags) {
  const amenity = tags.amenity;
  const name = tags.name ?? "";
  // Name match for legevakt wins regardless of the amenity tag — OSM is
  // inconsistent and several legevakter are tagged amenity=hospital.
  if (/legevakt/i.test(name)) return "legevakt";
  if (amenity === "hospital") return "sykehus";
  const isEmergency =
    tags.emergency === "yes" ||
    tags["healthcare:speciality"]?.includes("emergency") ||
    tags.healthcare === "emergency";
  if (isEmergency && amenity === "clinic") return "legevakt";
  if (amenity === "clinic") return "privatklinikk";
  return null;
}

function composeAddress(tags) {
  const street = tags["addr:street"];
  const houseNumber = tags["addr:housenumber"];
  const postcode = tags["addr:postcode"];
  const city = tags["addr:city"];
  const streetPart = [street, houseNumber].filter(Boolean).join(" ");
  const cityPart = [postcode, city].filter(Boolean).join(" ");
  return [streetPart, cityPart].filter(Boolean).join(", ") || null;
}

async function main() {
  console.log("Fetching Norwegian hospitals, legevakt and clinics from OSM...");
  const start = Date.now();

  const res = await fetchWithRetry();
  if (!res) {
    console.warn("All Overpass endpoints failed — keeping existing health.json");
    return;
  }

  const data = await res.json();

  const out = { sykehus: [], legevakt: [], privatklinikker: [] };

  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {};
    const type = classify(tags);
    if (!type) continue;

    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;

    const entity = {
      id: `${el.type}-${el.id}`,
      osmType: el.type,
      osmId: el.id,
      lat,
      lon,
      name: tags.name ?? (type === "sykehus" ? "Ukjent sykehus" : type === "legevakt" ? "Legevakt" : "Ukjent klinikk"),
      operator: tags.operator ?? null,
      phone: tags.phone ?? tags["contact:phone"] ?? null,
      website: tags.website ?? tags["contact:website"] ?? null,
      email: tags.email ?? tags["contact:email"] ?? null,
      openingHours: tags.opening_hours ?? null,
      emergency: tags.emergency === "yes",
      wheelchair: tags.wheelchair ?? null,
      beds: tags.beds ? parseInt(tags.beds, 10) : null,
      speciality: tags["healthcare:speciality"] ?? null,
      address: composeAddress(tags),
      lastUpdated: el.timestamp ?? null,
    };

    if (type === "sykehus") out.sykehus.push(entity);
    else if (type === "legevakt") out.legevakt.push(entity);
    else out.privatklinikker.push(entity);
  }

  // Drop sykehus entries that duplicate a legevakt with the same name at the
  // same spot — happens when the same location is tagged twice in OSM. The
  // emergency flag on the legevakt entry is the more actionable signal.
  out.sykehus = out.sykehus.filter(
    (s) =>
      !out.legevakt.some(
        (l) =>
          Math.abs(l.lat - s.lat) < 0.0005 &&
          Math.abs(l.lon - s.lon) < 0.0005 &&
          l.name === s.name
      )
  );

  const fs = await import("fs");
  const path = await import("path");
  const outPath = path.join(process.cwd(), "public", "data", "health.json");
  fs.writeFileSync(outPath, JSON.stringify(out));

  const sizeKB = (Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(0);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(
    `Done! ${out.sykehus.length} sykehus, ${out.legevakt.length} legevakt, ${out.privatklinikker.length} privatklinikker (${sizeKB} KB, ${elapsed}s)`
  );
}

main().catch((err) => {
  console.error("Failed to fetch health data:", err.message);
  console.log("Continuing build with existing health.json");
});
