import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAllKommuner } from "@/lib/kommune-profiles";

/**
 * Headline numbers for the landing page, derived at build time from the
 * same data the maps use (kommune-profiles.json + valg/st-2025.json), so
 * nothing on the front page is a hand-maintained figure that goes stale.
 * Server-only: import from server components (page.tsx), never from
 * client components.
 */

/** 1912 → "1 912" (no-break space, nb-NO style). */
export const nb = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

const SHORT_PARTY: Record<string, string> = {
  A: "Ap", FRP: "Frp", SP: "Sp", H: "Høyre", SV: "SV", R: "Rødt", V: "Venstre", KRF: "KrF", MDG: "MDG",
};

interface ValgFile {
  meta: { valgår: number };
  data: Record<string, { vinner?: { kode: string; navn: string } }>;
}

let valgCache: ValgFile | null = null;
function loadValg(): ValgFile {
  if (!valgCache) {
    valgCache = JSON.parse(readFileSync(join(process.cwd(), "public/data/valg/st-2025.json"), "utf8")) as ValgFile;
  }
  return valgCache;
}

export interface HomeFacts {
  kommuner: number;
  population: number;
  plants: number;
  totalMW: number;
  stations: number;
  bolig: { year: string; min: { name: string; price: number }; max: { name: string; price: number } } | null;
  pop: { min: { name: string; n: number }; max: { name: string; n: number } } | null;
  valg: { year: number; winners: { party: string; count: number }[] };
}

export function getHomeFacts(): HomeFacts {
  const all = getAllKommuner();

  const plants = all.reduce((s, p) => s + (p.energy?.plantCount ?? 0), 0);
  const totalMW = all.reduce((s, p) => s + (p.energy?.totalMW ?? 0), 0);
  const stations = all.reduce((s, p) => s + (p.charging?.total ?? 0), 0);
  const population = all.reduce((s, p) => s + (p.population ?? 0), 0);

  // Enebolig (01) extremes — only kommuner with a meaningful number of sales
  const priced = all
    .map((p) => ({ name: p.name, entry: p.bolig?.["01"] }))
    .filter((x): x is { name: string; entry: NonNullable<typeof x.entry> } => !!x.entry && x.entry.price > 0 && (x.entry.count ?? 0) >= 10)
    .sort((a, b) => a.entry.price - b.entry.price);
  const lastYear = (trend?: { year: string }[]) => trend?.[trend.length - 1]?.year;
  const bolig = priced.length >= 2
    ? {
        year: lastYear(priced[priced.length - 1].entry.trend) ?? "",
        min: { name: priced[0].name, price: priced[0].entry.price },
        max: { name: priced[priced.length - 1].name, price: priced[priced.length - 1].entry.price },
      }
    : null;

  const populated = all.filter((p) => (p.population ?? 0) > 0).sort((a, b) => (a.population ?? 0) - (b.population ?? 0));
  const pop = populated.length >= 2
    ? {
        min: { name: populated[0].name, n: populated[0].population ?? 0 },
        max: { name: populated[populated.length - 1].name, n: populated[populated.length - 1].population ?? 0 },
      }
    : null;

  const valgFile = loadValg();
  const tally = new Map<string, number>();
  for (const k of Object.values(valgFile.data)) {
    const kode = k.vinner?.kode;
    if (kode) tally.set(kode, (tally.get(kode) ?? 0) + 1);
  }
  const winners = [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([kode, count]) => ({ party: SHORT_PARTY[kode] ?? kode, count }));

  return { kommuner: all.length, population, plants, totalMW, stations, bolig, pop, valg: { year: valgFile.meta.valgår, winners } };
}
