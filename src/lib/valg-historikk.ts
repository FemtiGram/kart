import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Per-election summary of public/data/valg/historikk.json (Stortingsvalg
 * 1945–2025 on today's kommuner) for the crawlable table on /valg. The
 * timeline itself is client-rendered and invisible to search engines; this
 * puts the same numbers in the HTML. Derived from the data, never typed.
 * Server-only: import from server components.
 */

interface Historikk {
  meta: { years: number[]; parties: string[] };
  national: { year: number; shares: number[] }[];
  kommuner: Record<string, number[][]>;
}

export interface ElectionSummary {
  year: number;
  /** Largest party nationally. */
  winner: { party: string; share: number };
  /** Kommuner won, most first (top 3). */
  wins: { party: string; count: number }[];
}

const argmax = (a: number[]) => a.reduce((best, v, i) => (v > a[best] ? i : best), 0);

let cache: { elections: ElectionSummary[]; kommuner: number } | null = null;

export function getElectionHistory(): { elections: ElectionSummary[]; kommuner: number } {
  if (cache) return cache;
  const h = JSON.parse(
    readFileSync(join(process.cwd(), "public/data/valg/historikk.json"), "utf8"),
  ) as Historikk;
  const P = h.meta.parties;
  const elections = h.meta.years.map((year, i) => {
    const nat = h.national[i].shares;
    const w = argmax(nat);
    const counts = new Map<string, number>();
    for (const rows of Object.values(h.kommuner)) {
      const k = P[argmax(rows[i])];
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return {
      year,
      winner: { party: P[w], share: nat[w] },
      wins: [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([party, count]) => ({ party, count })),
    };
  });
  cache = { elections, kommuner: Object.keys(h.kommuner).length };
  return cache;
}
