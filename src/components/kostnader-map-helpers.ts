import { FYLKER } from "@/lib/fylker";

// ─── Types ──────────────────────────────────────────────────

export interface KostnaderMetric {
  code: string;
  label: string;
  shortLabel: string;
  unit: string;
  primary: boolean;
  invertColor: boolean;
  description: string;
}

export interface KostnaderGebyrer {
  vann: number | null;
  avlop: number | null;
  avfall: number | null;
  feiing: number | null;
  total: number | null;
  year: string;
}

export interface KostnaderKommuneEntry {
  latest: Record<string, number>;
  /** Explicit "has eiendomsskatt on homes" flag. false = positive "Ingen"
   *  fill, null = unknown (rare), true = the card shows the kr/promille. */
  hasEiendomsskatt: boolean | null;
  gebyrer: KostnaderGebyrer | null;
  displayName: string;
  fylke: string | null;
}

export interface KostnaderData {
  generatedAt: string;
  gebyrerYear: string;
  eiendomsskattYear: string;
  metrics: KostnaderMetric[];
  kommuner: Record<string, KostnaderKommuneEntry>;
}

export interface Selected {
  knr: string;
  name: string;
}

// ─── Helpers ────────────────────────────────────────────────

export function getFylke(knr: string): string | null {
  const prefix = knr.slice(0, 2);
  return FYLKER.find((f) => f.fylkesnummer === prefix)?.fylkesnavn ?? null;
}

export function computeRank(
  data: KostnaderData,
  code: string,
  knr: string,
  higherIsBetter: boolean
): { rank: number; total: number } {
  const entries = Object.entries(data.kommuner)
    .map(([k, v]) => [k, v.latest[code]] as const)
    .filter(([, v]) => v != null) as Array<[string, number]>;
  entries.sort((a, b) => (higherIsBetter ? b[1] - a[1] : a[1] - b[1]));
  const total = entries.length;
  const rank = entries.findIndex(([k]) => k === knr) + 1;
  return { rank, total };
}

/** Format a metric value for display — kr, ‰, or raw. */
export function formatMetric(
  value: number | null | undefined,
  metric: KostnaderMetric
): string {
  if (value == null) return "–";
  if (metric.unit === "kr") {
    return `${value.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}\u00a0kr`;
  }
  if (metric.unit === "‰") {
    return `${value.toLocaleString("nb-NO", { maximumFractionDigits: 1 })}\u00a0‰`;
  }
  return value.toLocaleString("nb-NO", { maximumFractionDigits: 0 });
}
