import { FYLKER } from "@/lib/fylker";

// ─── Types ──────────────────────────────────────────────────

export interface FastlegeMetric {
  code: string;
  label: string;
  unit: string;
  primary: boolean;
  invertColor: boolean;
}

export interface FastlegeKommuneEntry {
  latest: Record<string, number>;
  trend: Record<string, Array<{ year: string; value: number }>>;
}

export interface FastlegeData {
  generatedAt: string;
  latestYear: string;
  metrics: FastlegeMetric[];
  kommuner: Record<string, FastlegeKommuneEntry>;
}

export interface HealthEntity {
  id: string;
  osmType: "node" | "way";
  osmId: number;
  lat: number;
  lon: number;
  name: string;
  operator: string | null;
  phone: string | null;
  address: string | null;
  lastUpdated: string | null;
}

export interface OsmHealthData {
  sykehus: HealthEntity[];
  legevakt: HealthEntity[];
  privatklinikker: HealthEntity[];
}

export interface Selected {
  knr: string;
  name: string;
}

// ─── Constants ──────────────────────────────────────────────

export const METRIC_SHORT_LABEL: Record<string, string> = {
  KOSreservekapasi0000: "Ledig kapasitet",
  KOSandelpasiente0000: "Uten fastlege",
  KOSgjsnlisteleng0000: "Pasienter per lege",
};

/**
 * One-line plain-language descriptions for the 18 SSB fastlege metrics.
 * Shown under each row in the "Alle fastlege-metrikker" table in the
 * detail sheet. SSB's own definitions are paragraphs; we compress each
 * to a single readable line so the table stays scannable.
 */
export const METRIC_DESCRIPTION: Record<string, string> = {
  KOSantallavtaler0001: "Totalt antall fastlegeavtaler i kommunen",
  KOSantallpasient0000: "Innbyggere som står på en liste med navngitt lege",
  KOSantallavtaler0000:
    "Lister som står uten fast lege — typisk grunnet sykdom, oppsigelse eller tomme hjemler",
  KOSantallpasient0001: "Innbyggere på en liste uten navngitt lege",
  KOSandelpasiente0000:
    "Andel av innbyggerne som står på en liste uten fast lege",
  KOSaapnelister0000: "Fastlegelister som tar imot nye pasienter",
  KOSgjsnlisteleng0000: "Gjennomsnittlig antall pasienter per fastlege",
  KOSgjsnllkomm0000:
    "Listelengde justert for timer fastlegen bruker på kommunale oppgaver (sykehjem, helsestasjon osv.)",
  KOSantallkvinnel0000: "Antall fastleger som er kvinner",
  KOSandelkvinnele0000: "Kvinneandel blant fastlegene i kommunen",
  KOSkapasitet0000:
    "Samlet avtalt kapasitet — det totale antallet pasienter fastlegene kan ta imot",
  KOSkapasitetbere0000:
    "Beregnet reell kapasitet basert på arbeidsmengde og kommunale timer",
  KOSreservekapasi0000:
    "Kapasitet delt på listelengde × 100. Over 100 betyr at det er ledig plass på listene",
  KOSkonsultpasien0000:
    "Konsultasjoner innbyggerne har hos fastlege, uansett hvor legen praktiserer",
  KOSkonsultlegeko0000:
    "Konsultasjoner fastlegene i kommunen utfører, uansett hvor pasienten bor",
  KOSkonspasientpr0000: "Gjennomsnittlig antall konsultasjoner per innbygger",
  KOSkonslegeprper0000: "Gjennomsnittlig antall konsultasjoner per fastlege",
  KOSantallavtaler0002:
    "Totalt antall fastlegeavtaler, inkludert lister som står uten lege",
};

// ─── Helper functions ───────────────────────────────────────

/**
 * SSB's `KOSreservekapasi0000` is an index centered on 100: 100 = kapasitet
 * matches patient load, >100 = headroom, <100 = overbooked. The raw number
 * is confusing at a glance, so we display it as a signed percentage
 * relative to 100 — Oslo (105) becomes "+5 %", Vefsn (98) becomes "−2 %".
 * Intuitive once you know 0 = balansert.
 */
export function formatMetric(
  value: number | null | undefined,
  metric: FastlegeMetric
): string {
  if (value == null) return "–";
  if (metric.code === "KOSreservekapasi0000") {
    const delta = value - 100;
    const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
    return `${sign}${Math.abs(delta).toLocaleString("nb-NO", { maximumFractionDigits: 0 })}\u00a0%`;
  }
  if (metric.unit === "prosent")
    return `${value.toLocaleString("nb-NO", { maximumFractionDigits: 1 })}\u00a0%`;
  return value.toLocaleString("nb-NO", { maximumFractionDigits: 0 });
}

export function getFylke(knr: string): string | null {
  const prefix = knr.slice(0, 2);
  return FYLKER.find((f) => f.fylkesnummer === prefix)?.fylkesnavn ?? null;
}

export function computeRank(
  data: FastlegeData,
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
