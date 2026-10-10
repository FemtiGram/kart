// Stortingsvalg 1945–2025 per kommune, recalculated onto today's kommuner.
// Feeds the /valg "Tidslinje" animation → public/data/valg/historikk.json
//
// Sources:
//   SSB 08092 — godkjente stemmer per parti per (historisk) kommune, 1945–2025
//   SSB Klass 131 — every kommune change since 1945 (mergers, splits, renumbering)
//
// Each historical kommune is matched to Klass by code AND name as of the
// election date (SSB reuses codes; e.g. "0701u Borre" vs "0701 Horten"), then
// followed through every later change to the kommuner on today's map. When a
// kommune was later divided, its votes go to the successor that kept its
// name/code (the main part). Only shares are published, so a misplaced
// border village moves a fraction of a percent, not a winner. A kommune that
// didn't exist yet (e.g. Fedje, split from Austrheim in 1947) shows the
// shares of the kommune it was part of — the same voters — without its
// votes being counted twice.
//
// Historic data never changes, so this is NOT in prebuild — rerun manually
// after a new Stortingsvalg (or a kommune reform):
//   node scripts/fetch-valg-historikk.mjs
//
// Like the other fetch scripts it never fails the build and never replaces
// good data with partial data: any failed check keeps the existing file.

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const OUT_PATH = join(process.cwd(), "public", "data", "valg", "historikk.json");
const GEO_PATH = join(process.cwd(), "public", "data", "kommuner.geojson");
const TABLE = "https://data.ssb.no/api/v0/no/table/08092";
const KLASS = "https://data.ssb.no/api/klass/v1/classifications/131";

// Party lineages, so a party keeps one colour across name changes:
// Bondepartiet → Sp, Anders Langes parti → FrP, SF / Sosialistisk
// Valgforbund → SV, Rød Valgallianse → Rødt. Joint lists (90x) can't be
// credited to one party and get their own group.
const GROUPS = ["A", "H", "FRP", "SP", "KRF", "V", "SV", "RØDT", "MDG", "NKP", "FELLES", "ANDRE"];
const PARTY_GROUP = {
  "01": "A",
  "03": "H",
  "02": "FRP", "75": "FRP",
  "05": "SP", "71": "SP",
  "04": "KRF",
  "07": "V",
  "06": "SV", "70": "SV", "79": "SV",
  "55": "RØDT", "11": "RØDT",
  "08": "MDG",
  "09": "NKP",
};
const groupOf = (code) => PARTY_GROUP[code] ?? (code.startsWith("90") ? "FELLES" : "ANDRE");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sum = (a) => a.reduce((x, y) => x + y, 0);

async function fetchJson(url, init, timeout = 30000) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { Accept: "application/json", ...(init?.headers ?? {}) },
        signal: AbortSignal.timeout(timeout),
      });
      // SSB rate-limits at 30 req/min; back off and retry.
      if (res.status === 429) { await sleep(5000 * attempt); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.json();
    } catch (err) {
      if (attempt === 3) throw err;
      await sleep(1500 * attempt);
    }
  }
}

// "Unjárga - Nesseby (-2019)" → ["unjárga", "nesseby", "unjárga - nesseby"]
function nameKeys(name) {
  const base = name.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
  return [base, ...base.split(/\s+-\s+/).map((s) => s.trim())];
}
const sameName = (a, b) => nameKeys(a).some((k) => nameKeys(b).includes(k));

async function main() {
  const geo = JSON.parse(readFileSync(GEO_PATH, "utf8"));
  const current = new Map(geo.features.map((f) => [f.properties.kommunenummer, f.properties.kommunenavn]));
  console.log(`Target: ${current.size} kommuner on today's map`);

  const meta = await fetchJson(TABLE);
  const years = meta.variables.find((v) => v.code === "Tid").values;
  const today = new Date().toISOString().slice(0, 10);
  const { codeChanges } = await fetchJson(`${KLASS}/changes?from=1945-01-01&to=${today}`, undefined, 60000);
  const changesFrom = new Map();
  for (const c of codeChanges) {
    if (!changesFrom.has(c.oldCode)) changesFrom.set(c.oldCode, []);
    changesFrom.get(c.oldCode).push(c);
  }
  console.log(`Klass: ${codeChanges.length} kommune changes since 1945 · ${years.length} elections`);

  // Every kommune a code turns into after `date`, following each change in
  // date order until it lands on a kommune on today's map.
  function successors(code, date, depth = 0) {
    if (depth > 12) return new Set();
    const later = (changesFrom.get(code) ?? []).filter((c) => c.changeOccurred > date);
    if (later.length === 0) return current.has(code) ? new Set([code]) : new Set();
    const first = later.reduce((m, c) => (c.changeOccurred < m ? c.changeOccurred : m), later[0].changeOccurred);
    const out = new Set();
    for (const c of later.filter((c) => c.changeOccurred === first)) {
      // A name-only change keeps the code; follow it from the change date.
      for (const s of successors(c.newCode, first, depth + 1)) out.add(s);
    }
    return out;
  }

  const kommuner = Object.fromEntries([...current.keys()].map((k) => [k, years.map(() => new Array(GROUPS.length).fill(0))]));
  const national = [];
  const notes = [];
  const shareOnly = new Set();

  for (const [yi, year] of years.entries()) {
    const date = `${year}-09-01`;
    const codesAt = (await fetchJson(`${KLASS}/codesAt?date=${date}`)).codes;
    const nameAt = new Map(codesAt.map((c) => [c.code, c.name]));

    const data = await fetchJson(TABLE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: [
          { code: "Region", selection: { filter: "all", values: ["*"] } },
          { code: "PolitParti", selection: { filter: "all", values: ["*"] } },
          { code: "ContentsCode", selection: { filter: "item", values: ["Godkjente1"] } },
          { code: "Tid", selection: { filter: "item", values: [year] } },
        ],
        response: { format: "json-stat2" },
      }),
    }, 60000);

    const R = data.dimension.Region.category;
    const P = data.dimension.PolitParti.category;
    const nP = Object.keys(P.index).length;
    const parties = Object.entries(P.index);
    const nat = new Array(GROUPS.length).fill(0);
    let mapped = 0, viaName = 0, splitToMain = 0;
    const unmapped = [];
    // Kommuner that were part of a larger one in this election → that
    // kommune's votes (used for shares only).
    const partOf = new Map();

    for (const [region, ri] of Object.entries(R.index)) {
      const votes = new Array(GROUPS.length).fill(0);
      let any = false;
      for (const [pcode, pi] of parties) {
        const v = data.value[ri * nP + pi];
        if (v == null) continue;
        any = true;
        votes[GROUPS.indexOf(groupOf(pcode))] += v;
      }
      if (!any) continue;
      if (region === "0") { votes.forEach((v, i) => (nat[i] = v)); continue; }
      if (region.startsWith("v") || region.length < 4) continue;

      // Resolve to the Klass code valid on election day, by code + name.
      const label = R.label[region];
      let code = region.slice(0, 4);
      if (!nameAt.has(code) || !sameName(nameAt.get(code), label)) {
        const byName = codesAt.find((c) => sameName(c.name, label));
        if (byName) { code = byName.code; viaName++; }
      }
      let succ = [...successors(code, date)];
      if (succ.length === 0 && current.has(code)) succ = [code];
      if (succ.length === 0) { unmapped.push(`${region} ${label}`); continue; }
      let target = succ[0];
      if (succ.length > 1) {
        splitToMain++;
        target =
          succ.find((s) => s === code) ??
          succ.find((s) => sameName(current.get(s), label)) ??
          succ.sort()[0];
        for (const s of succ) {
          const prev = partOf.get(s);
          if (s !== target && (!prev || sum(prev) < sum(votes))) partOf.set(s, votes);
        }
      }
      const acc = kommuner[target][yi];
      votes.forEach((v, i) => (acc[i] += v));
      mapped++;
    }

    // Checks: everything mapped, totals add up, every kommune has votes.
    const natTotal = sum(nat);
    let kommTotal = 0;
    let inherited = 0;
    for (const [knr, rows] of Object.entries(kommuner)) {
      if (rows[yi].some((v) => v > 0) || !partOf.has(knr)) continue;
      shareOnly.add(`${knr}:${yi}`);
      rows[yi] = [...partOf.get(knr)];
      inherited++;
    }
    const empty = [...current.keys()].filter((k) => kommuner[k][yi].every((v) => v === 0));
    for (const [knr, k] of Object.entries(kommuner)) if (!shareOnly.has(`${knr}:${yi}`)) kommTotal += sum(k[yi]);
    if (unmapped.length) throw new Error(`${year}: unmapped regions ${unmapped.join(", ")}`);
    if (natTotal === 0 || Math.abs(kommTotal - natTotal) > 0.001 * natTotal) {
      throw new Error(`${year}: kommune sum ${kommTotal} ≠ national ${natTotal}`);
    }
    if (empty.length) throw new Error(`${year}: no votes for ${empty.join(", ")}`);

    national.push({ year: Number(year), votes: natTotal, shares: nat.map((v) => Math.round((v / natTotal) * 1000) / 10) });
    notes.push({ year: Number(year), regions: mapped, matchedByName: viaName, splitAssignedToMain: splitToMain, sharesFromParent: inherited });
    console.log(`  ${year}: ${mapped} kommuner → ${current.size} · ${viaName} matched by name · ${splitToMain} split → main part · ${inherited} from parent · ${natTotal.toLocaleString("nb-NO")} stemmer`);
    await sleep(2100); // stay under SSB's 30 requests/minute
  }

  // Votes → shares (0.1 % precision), one row per election.
  const out = {
    meta: {
      source: "SSB tabell 08092 + Klass 131",
      generated: new Date().toISOString(),
      years: years.map(Number),
      parties: GROUPS,
      notes,
    },
    national,
    kommuner: Object.fromEntries(
      Object.entries(kommuner).map(([knr, rows]) => [
        knr,
        rows.map((r) => {
          const t = r.reduce((a, b) => a + b, 0);
          return r.map((v) => Math.round((v / t) * 1000) / 10);
        }),
      ]),
    ),
  };
  writeFileSync(OUT_PATH, JSON.stringify(out));
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("fetch-valg-historikk failed:", err.message);
  if (existsSync(OUT_PATH)) {
    console.warn("Keeping existing historikk.json");
    process.exit(0);
  }
  process.exit(1);
});
