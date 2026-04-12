// Fetches Finn.no's hierarchical location codes and matches them to
// Norwegian kommuner so we can deep-link straight into Finn's property
// search with the kommune filter pre-applied.
//
// Finn embeds a JSON location tree in the HTML of the realestate search
// page. Each kommune is stored as a `"Name","<code>"` pair where code is
// `1.<fylke>.<kommune>` for normal kommuner or `0.20061` for Oslo (which
// Finn treats as a 2-level hierarchy because it's both fylke and kommune).
//
// Output: public/data/finn-locations.json keyed by kommunenummer.
// Run with: node scripts/fetch-finn-locations.mjs

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const GEOJSON_PATH = join(ROOT, "public", "data", "kommuner.geojson");
const OUT_PATH = join(ROOT, "public", "data", "finn-locations.json");
const FINN_URL = "https://www.finn.no/realestate/homes/search.html";

function displayNameFor(fullName) {
  const first = fullName.split(/\s+-\s+/)[0].trim();
  return first || fullName;
}

async function main() {
  const start = Date.now();
  console.log("Fetching Finn.no location codes...");

  let html;
  try {
    const res = await fetch(FINN_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Datakart build; github.com/FemtiGram/kart)",
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.error(`  ✗ Failed to fetch Finn: ${err.message}`);
    if (existsSync(OUT_PATH)) {
      console.log("  → Keeping existing finn-locations.json");
      return;
    }
    process.exit(1);
  }

  // Extract "Name","<code>" pairs. Finn escapes quotes inside the JSON
  // payload embedded in the HTML, so we match against the escaped form.
  // Finn disambiguates same-named kommuner via parenthetical suffixes
  // ("Herøy (M.R.)") or dashes ("Frogn - Drøbak"), so we normalize each
  // name to its base form and index both.
  const re =
    /\\"([A-Za-zÆØÅæøåÁáČčŊŋŠšŦŧŽž][A-Za-zÆØÅæøåÁáČčŊŋŠšŦŧŽž\-\s().]{1,60}?)\\",\\"((?:0|1)\.\d{5}(?:\.\d{5})?)\\"/g;
  const nameToCodes = new Map();
  const addMapping = (name, code) => {
    if (!nameToCodes.has(name)) nameToCodes.set(name, []);
    const list = nameToCodes.get(name);
    if (!list.includes(code)) list.push(code);
  };
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, rawName, code] = m;
    // Only kommune-level codes: 3-segment or Oslo's 0.20061
    const isKommune = code.split(".").length === 3 || code === "0.20061";
    if (!isKommune) continue;
    addMapping(rawName, code);
    // Strip parenthetical suffix: "Herøy (Nordland)" → "Herøy"
    const stripped = rawName.replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (stripped && stripped !== rawName) addMapping(stripped, code);
    // Take first segment of dashed names: "Frogn - Drøbak" → "Frogn"
    const firstSegment = rawName.split(/\s+-\s+/)[0].trim();
    if (firstSegment && firstSegment !== rawName) addMapping(firstSegment, code);
  }
  console.log(`  Extracted ${nameToCodes.size} unique location names from Finn`);

  const lookup = (name) => {
    if (!name) return [];
    return nameToCodes.get(name) ?? [];
  };

  // Load our kommuner
  const geo = JSON.parse(readFileSync(GEOJSON_PATH, "utf8"));

  // Pass 1: match unambiguous names. This lets us learn the SSB fylke
  // prefix → Finn fylke prefix mapping from the matches.
  const mapping = {};
  const ambiguous = [];
  const ssbToFinnFylke = new Map(); // "11" → "20012"

  const finnFylkeOf = (code) => {
    // "1.20012.20195" → "20012"; "0.20061" → "20061"
    const parts = code.split(".");
    return parts.length === 3 ? parts[1] : parts[1];
  };

  for (const feature of geo.features) {
    const knr = feature.properties.kommunenummer;
    const name = feature.properties.kommunenavn;
    const display = displayNameFor(name);
    const reverseSami = name.split(/\s+-\s+/)[1]?.trim();
    const candidates = [
      ...lookup(display),
      ...lookup(name),
      ...lookup(reverseSami),
    ];
    const unique = [...new Set(candidates)];

    if (unique.length === 1) {
      mapping[knr] = unique[0];
      const ssbFylke = knr.slice(0, 2);
      const finnFylke = finnFylkeOf(unique[0]);
      if (!ssbToFinnFylke.has(ssbFylke)) {
        ssbToFinnFylke.set(ssbFylke, finnFylke);
      }
    } else if (unique.length > 1) {
      ambiguous.push({ knr, name, candidates: unique });
    } else {
      ambiguous.push({ knr, name, candidates: [] });
    }
  }

  // Pass 2: resolve ambiguous matches using the learned SSB→Finn fylke map.
  const unmatched = [];
  for (const { knr, name, candidates } of ambiguous) {
    const ssbFylke = knr.slice(0, 2);
    const expectedFinnFylke = ssbToFinnFylke.get(ssbFylke);
    const pick =
      expectedFinnFylke &&
      candidates.find((c) => finnFylkeOf(c) === expectedFinnFylke);
    if (pick) {
      mapping[knr] = pick;
    } else {
      unmatched.push(`${knr} ${name} [${candidates.join(", ") || "no candidates"}]`);
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(mapping));

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const matched = Object.keys(mapping).length;
  console.log(
    `  ✓ Matched ${matched}/${geo.features.length} kommuner → ${OUT_PATH} [${elapsed}s]`
  );
  if (unmatched.length > 0) {
    console.log(`  ⚠ ${unmatched.length} unmatched:`);
    unmatched.slice(0, 10).forEach((u) => console.log(`    ${u}`));
    if (unmatched.length > 10) console.log(`    ... and ${unmatched.length - 10} more`);
  }
}

main().catch((err) => {
  console.error(`  ✗ Fatal: ${err.message}`);
  process.exit(1);
});
