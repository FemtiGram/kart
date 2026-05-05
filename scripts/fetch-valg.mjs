// Fetches election results from valgresultat.no (Valgdirektoratet).
// Outputs one file per (type, year) at public/data/valg/{type}-{year}.json
// plus a manifest at public/data/valg/index.json.
//
// API shape: /api/{år}/{type}             → top-level (fylker as _links.related)
//            /api/{år}/{type}/{fylke}     → fylke (kommuner as _links.related)
//            /api/{år}/{type}/{fylke}/{komm} → kommune (partier[] + frammote)
//
// We only fetch post-2020-reform years (2019+) so kommunenummer match the
// current 357-kommune geometry without a merger remap. Older elections
// (2017, 2015, 2013, ...) use pre-reform codes — could be added later
// with a kommune-merger table.

import fs from "node:fs/promises";
import path from "node:path";

const ELECTIONS = [
  { type: "st", year: 2025, label: "Stortingsvalg 2025" },
  { type: "st", year: 2021, label: "Stortingsvalg 2021" },
  { type: "ko", year: 2023, label: "Kommunestyrevalg 2023" },
  { type: "ko", year: 2019, label: "Kommunestyrevalg 2019" },
];

const OUT_DIR = path.join(process.cwd(), "public/data/valg");
const CONCURRENCY = 8;

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function pool(items, worker, concurrency = CONCURRENCY) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) return;
        results[idx] = await worker(items[idx], idx);
      }
    })
  );
  return results;
}

function pickPartier(d) {
  return (d.partier ?? [])
    .map((p) => ({
      kode: p.id?.partikode,
      navn: p.id?.navn,
      prosent: p.stemmer?.resultat?.prosent ?? 0,
      stemmer: p.stemmer?.resultat?.antall?.total ?? 0,
      endring: p.stemmer?.resultat?.endring?.samme ?? null,
    }))
    .filter((p) => p.stemmer > 0)
    .sort((a, b) => b.prosent - a.prosent);
}

// Maps the API's fylke nr (which varies by election year — pre-2020 used 19
// valgkretser, 2020–2023 used 11 fylker, 2024+ uses 15) to the current fylke
// prefix(es) used by kommunenummer. Used to disambiguate name collisions
// when remapping old → current knr.
const FYLKE_TO_NEW_PREFIX = {
  // Pre-2020 (19 valgkretser)
  "01": ["31"], "02": ["32"], "03": ["03"],
  "04": ["34"], "05": ["34"], // Hedmark, Oppland → Innlandet
  "06": ["33"], "07": ["39"], "08": ["40"],
  "09": ["42"], "10": ["42"], // Aust-Agder, Vest-Agder → Agder
  "11": ["11"],
  "12": ["46"], "14": ["46"], // Hordaland, Sogn og Fjordane → Vestland
  "15": ["15"],
  "16": ["50"], "17": ["50"], // Sør-Trøndelag, Nord-Trøndelag → Trøndelag
  "18": ["18"], "19": ["55"], "20": ["56"],
  // 2020–2023 fylker (Viken / Vestfold-Telemark / Troms-Finnmark merged)
  "30": ["31", "32", "33"], // Viken → Østfold / Akershus / Buskerud
  "34": ["34"],              // Innlandet (unchanged in 2024)
  "38": ["39", "40"],        // Vestfold-Telemark → Vestfold / Telemark
  "42": ["42"],              // Agder (unchanged)
  "46": ["46"],              // Vestland (unchanged)
  "50": ["50"],              // Trøndelag (unchanged)
  "54": ["55", "56"],        // Troms-Finnmark → Troms / Finnmark
};

// Build a remap function from old (2020–2023 era) kommunenr → current (2024+).
// The 2024 fylkesoppløsning split Viken / Vestfold-Telemark / Troms-Finnmark
// and renumbered kommunenr inconsistently (Halden 3001→3101 preserved suffix,
// Våler 3018→3114 did not). We disambiguate by fylke prefix, using the API's
// old valgkrets fylke nr (always one of the 19 pre-2020 fylker) mapped to the
// current fylke prefix via the table above.
// Hardcoded renames where a kommune was renamed across the 2024 reform and
// a name-based remap can't recover. Add entries as needed.
const RENAMES = {
  "Nes, Buskerud": "Nesbyen", // 3040 (Buskerud) → 3322 Nesbyen
};

// Normalize a kommune name for lookup:
//   1. "Nordreisa - Ráisa - Raisi" → "Nordreisa" (strip multi-language suffixes)
//   2. "Aurskog -Høland" → "Aurskog-Høland" (collapse stray hyphen whitespace)
//   3. "Nes, Akershus" → "Nes" (strip disambiguating fylke suffix)
function normalizeName(n) {
  let s = n.trim();
  s = s.replace(/,\s+[^,]+$/, ""); // strip ", Fylkenavn"
  s = s.split(/\s+-\s+/)[0].trim(); // strip multi-language suffix
  s = s.replace(/\s*-\s*/g, "-"); // tighten hyphen
  return s;
}

async function buildRemap() {
  const geoPath = path.join(process.cwd(), "public/data/kommuner.geojson");
  const geo = JSON.parse(await fs.readFile(geoPath, "utf8"));
  const currentKnrs = new Set();
  const byName = new Map();
  for (const f of geo.features) {
    const knr = f.properties.kommunenummer;
    currentKnrs.add(knr);
    // Index every part of a multi-language name so "Tjeldsund" finds
    // 5512 even when the geojson stores "Dielddanuorri - Tjeldsund".
    const parts = f.properties.kommunenavn.split(/\s+-\s+/).map((p) => normalizeName(p));
    for (const p of parts) {
      const arr = byName.get(p) ?? [];
      arr.push(knr);
      byName.set(p, arr);
    }
  }
  return (oldKnr, navn, oldFylkeNr) => {
    if (currentKnrs.has(oldKnr)) return oldKnr;
    const renamed = RENAMES[navn] ?? null;
    const lookup = renamed ? normalizeName(renamed) : normalizeName(navn);
    const candidates = byName.get(lookup) ?? [];
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    const prefixes = FYLKE_TO_NEW_PREFIX[oldFylkeNr];
    if (prefixes) {
      const match = candidates.find((c) => prefixes.some((p) => c.startsWith(p)));
      if (match) return match;
    }
    const suffix = oldKnr.slice(-2);
    return candidates.find((c) => c.endsWith(suffix)) ?? null;
  };
}

async function fetchOne({ type, year }, remap) {
  const base = `https://valgresultat.no/api/${year}/${type}`;
  console.log(`\n[${type}-${year}] Fetching hierarchy...`);
  const root = await fetchJson(base);
  const fylker = root._links?.related ?? [];

  const fylkePages = await pool(fylker, async (f) => {
    const data = await fetchJson(`https://valgresultat.no/api${f.href}`);
    return { fylkeNr: f.nr, kommuner: data._links?.related ?? [] };
  });

  const kommuneTasks = fylkePages.flatMap(({ fylkeNr, kommuner }) =>
    kommuner.map((k) => ({ ...k, fylkeNr }))
  );
  console.log(`[${type}-${year}] ${fylker.length} fylker → ${kommuneTasks.length} kommuner`);

  let done = 0;
  const kommunePages = await pool(kommuneTasks, async (k) => {
    const data = await fetchJson(`https://valgresultat.no/api${k.href}`);
    done++;
    if (done % 100 === 0 || done === kommuneTasks.length) {
      console.log(`[${type}-${year}]   ${done}/${kommuneTasks.length}`);
    }
    return { knr: k.nr, navn: k.navn, fylkeNr: k.fylkeNr, data };
  });

  const out = {};
  let remapped = 0;
  let dropped = 0;
  for (const { knr, navn, fylkeNr, data } of kommunePages) {
    const partier = pickPartier(data);
    if (partier.length === 0) continue;
    const winner = partier[0];
    const currentKnr = remap(knr, navn, fylkeNr);
    if (!currentKnr) {
      dropped++;
      continue;
    }
    if (currentKnr !== knr) remapped++;
    out[currentKnr] = {
      kommunenavn: navn,
      vinner: { kode: winner.kode, navn: winner.navn, prosent: winner.prosent },
      partier: partier.slice(0, 10),
      frammote: data.frammote?.prosent ?? null,
    };
  }
  if (remapped > 0 || dropped > 0) {
    console.log(`[${type}-${year}] remapped ${remapped} old→new kommunenr, dropped ${dropped}`);
  }

  const meta = {
    valgtype: type,
    valgår: year,
    rapportGenerert: root.tidspunkt?.rapportGenerert ?? null,
    kommuner: Object.keys(out).length,
  };

  return { meta, data: out };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const remap = await buildRemap();

  const manifest = [];
  for (const e of ELECTIONS) {
    const result = await fetchOne(e, remap);
    const filename = `${e.type}-${e.year}.json`;
    await fs.writeFile(path.join(OUT_DIR, filename), JSON.stringify(result, null, 0));
    manifest.push({
      type: e.type,
      year: e.year,
      label: e.label,
      file: filename,
      kommuner: result.meta.kommuner,
    });
    console.log(`[${e.type}-${e.year}] wrote ${filename} — ${result.meta.kommuner} kommuner`);
  }

  await fs.writeFile(path.join(OUT_DIR, "index.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nWrote manifest with ${manifest.length} elections.`);
}

main().catch((err) => {
  console.error("fetch-valg failed:", err.message);
  process.exit(1);
});
