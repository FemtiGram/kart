// Fetches all active schools and kindergartens in Norway from Utdanningsdirektoratet's
// open registries (NSR + NBR). Both APIs require a per-orgnr detail call to get
// coordinates — the list endpoints only return metadata. We list active enheter,
// filter to schools/grunnskoler/vgs, and fetch detail in a parallel pool.
//
// Output: public/data/schools.json (committed to repo).
// Run with: node scripts/fetch-schools.mjs

import { writeFileSync, existsSync } from "fs";
import { join } from "path";

const OUT_PATH = join(process.cwd(), "public", "data", "schools.json");

const NSR_BASE = "https://data-nsr.udir.no/v3";
const NBR_BASE = "https://data-nbr.udir.no/v3";

const CONCURRENCY = 20;
const PAGE_SIZE = 1000;

// ─── Tiny parallel pool ──────────────────────────────────────

async function pool(items, concurrency, worker) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i], i);
      } catch (err) {
        results[i] = null;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchJson(url, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Datakart/1.0 github.com/FemtiGram/kart",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
}

// ─── List all active enheter from NSR or NBR ────────────────

async function listAll(base, predicate) {
  const first = await fetchJson(`${base}/enheter?sidenummer=1&antallPerSide=${PAGE_SIZE}`);
  const total = first.AntallSider;
  const all = first.Enheter.filter(predicate);
  for (let p = 2; p <= total; p++) {
    const page = await fetchJson(`${base}/enheter?sidenummer=${p}&antallPerSide=${PAGE_SIZE}`);
    for (const e of page.Enheter) {
      if (predicate(e)) all.push(e);
    }
  }
  return all;
}

// ─── Fetch detail per orgnr ─────────────────────────────────

async function fetchDetails(base, orgnrs, label) {
  const start = Date.now();
  let done = 0;
  const total = orgnrs.length;
  const tick = setInterval(() => {
    process.stdout.write(`\r    ${label}: ${done}/${total} details fetched...`);
  }, 1000);

  const results = await pool(orgnrs, CONCURRENCY, async (orgnr) => {
    const detail = await fetchJson(`${base}/enhet/${orgnr}`);
    done++;
    return detail;
  });

  clearInterval(tick);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  process.stdout.write(`\r    ${label}: ${done}/${total} details fetched in ${elapsed}s\n`);
  return results.filter((d) => d != null);
}

// ─── Schools (NSR) ──────────────────────────────────────────

async function fetchSchools() {
  console.log("  Listing active grunnskoler + VGS from NSR...");
  const list = await listAll(NSR_BASE, (e) => {
    if (!e.ErAktiv || !e.ErSkole) return false;
    return e.ErGrunnskole || e.ErVideregaaendeSkole;
  });
  console.log(`    found ${list.length} active schools`);

  const orgnrs = list.map((e) => e.Orgnr);
  const details = await fetchDetails(NSR_BASE, orgnrs, "schools");

  const schools = [];
  for (const d of details) {
    if (!d) continue;
    const lat = d.Koordinat?.Breddegrad;
    const lon = d.Koordinat?.Lengdegrad;
    if (lat == null || lon == null) continue;
    // Drop placeholder 0,0 coordinates and anything outside Norway's bbox.
    if (lat < 57 || lat > 72 || lon < 4 || lon > 32) continue;
    // Skip schools outside Norway (Norske skoler i utlandet are tagged with
    // Fylkesnr "25" / Kommunenr starting with "25xx")
    if (d.Fylkesnr === "25" || (d.Kommunenr ?? "").startsWith("25")) continue;
    let type;
    if (d.ErGrunnskole && d.ErVideregaaendeSkole) type = "begge";
    else if (d.ErGrunnskole) type = "grunnskole";
    else if (d.ErVideregaaendeSkole) type = "vgs";
    else continue;
    schools.push({
      id: d.Orgnr,
      name: d.Navn,
      kommunenummer: d.Kommune?.Kommunenr ?? d.Kommunenr,
      lat,
      lon,
      type,
      owner: d.ErPrivatskole ? "privat" : "offentlig",
      students: d.Elevtall ?? null,
      gradeFrom: d.SkoletrinnGSFra ?? d.SkoletrinnVGSFra ?? null,
      gradeTo: d.SkoletrinnVGSTil ?? d.SkoletrinnGSTil ?? null,
      address: d.Beliggenhetsadresse?.Adresse ?? null,
      poststed: d.Beliggenhetsadresse?.Poststed ?? null,
      url: d.Url || null,
    });
  }
  return schools;
}

// ─── Kindergartens (NBR) ────────────────────────────────────

async function fetchKindergartens() {
  console.log("  Listing active barnehager from NBR...");
  const list = await listAll(NBR_BASE, (e) => e.ErAktiv && e.ErBarnehage);
  console.log(`    found ${list.length} active barnehager`);

  const orgnrs = list.map((e) => e.Orgnr);
  const details = await fetchDetails(NBR_BASE, orgnrs, "kindergartens");

  const kindergartens = [];
  for (const d of details) {
    if (!d) continue;
    const lat = d.Koordinat?.Breddegrad;
    const lon = d.Koordinat?.Lengdegrad;
    if (lat == null || lon == null) continue;
    if (d.Fylkesnr === "25" || (d.Kommunenr ?? "").startsWith("25")) continue;
    kindergartens.push({
      id: d.Orgnr,
      name: d.Navn,
      kommunenummer: d.Kommune?.Kommunenr ?? d.Kommunenr,
      lat,
      lon,
      owner: d.ErPrivatBarnehage ? "privat" : "offentlig",
      children: d.AntallBarn ?? null,
      ageMin: d.AlderstrinnFra ?? null,
      ageMax: d.AlderstrinnTil ?? null,
      address: d.Beliggenhetsadresse?.Adresse ?? null,
      poststed: d.Beliggenhetsadresse?.Poststed ?? null,
      url: d.Url || null,
    });
  }
  return kindergartens;
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const start = Date.now();
  console.log("Fetching schools and kindergartens from UDIR...");

  let schools, kindergartens;
  try {
    [schools, kindergartens] = await Promise.all([
      fetchSchools(),
      fetchKindergartens(),
    ]);
  } catch (err) {
    console.error(`  ✗ Failed: ${err.message}`);
    if (existsSync(OUT_PATH)) {
      console.log("  → Keeping existing schools.json");
      return;
    }
    process.exit(1);
  }

  const out = {
    fetchedAt: new Date().toISOString(),
    schools,
    kindergartens,
  };
  writeFileSync(OUT_PATH, JSON.stringify(out));

  const sizeKB = (Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(0);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `  ✓ ${schools.length} schools + ${kindergartens.length} barnehager (${sizeKB} KB) → ${OUT_PATH} [${elapsed}s]`
  );
}

main().catch((err) => {
  console.error(`  ✗ Fatal: ${err.message}`);
  process.exit(1);
});
