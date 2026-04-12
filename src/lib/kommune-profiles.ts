import { readFileSync } from "fs";
import { join } from "path";

// ─── Types ───────────────────────────────────────────────────

export interface BoligEntry {
  price: number;
  count: number | null;
  trend: Array<{ year: string; price: number }>;
}

export interface ChargingSummary {
  total: number;
  fast: number;
  topByKw: Array<{
    id: string;
    name: string;
    operator: string | null;
    maxKw: number | null;
  }>;
}

export interface CabinSummary {
  total: number;
  top: Array<{
    id: number;
    name: string;
    operator: string | null;
    beds: number | null;
    elevation: number | null;
  }>;
}

export interface ReservoirSummary {
  total: number;
  top: Array<{
    id: number;
    name: string;
    volumeMm3: number | null;
    plantName: string | null;
  }>;
}

export interface EnergySummary {
  totalMW: number;
  plantCount: number;
  windCount: number;
  hydroCount: number;
  top: Array<{
    id: number;
    name: string;
    type: "vind" | "vann";
    capacityMW: number | null;
  }>;
}

export interface KommuneProfile {
  knr: string;
  name: string;
  displayName: string;
  slug: string;
  fylke: string | null;
  area: number;
  centroid: { lat: number; lon: number };
  /** [minLat, minLon, maxLat, maxLon] */
  bbox: [number, number, number, number];
  /** Simplified outline as [lat, lon] rings — Leaflet Polygon format. */
  outline: Array<Array<[number, number]>>;
  population: number | null;
  income: number | null;
  bolig: Record<string, BoligEntry>;
  affordability: number | null;
  verneAreaKm2: number | null;
  vernePct: number | null;
  charging: ChargingSummary;
  cabins: CabinSummary;
  reservoirs: ReservoirSummary;
  energy: EnergySummary;
  ranks: {
    population: number | null;
    income: number | null;
    bolig: number | null;
    verne: number | null;
    energy: number | null;
    affordability: number | null;
  };
}

interface ProfilesFile {
  generatedAt: string;
  totals: {
    kommuner: number;
    popTotal: number;
    incomeTotal: number;
    boligTotal: number;
  };
  profiles: Record<string, KommuneProfile>;
}

// ─── Loader (read once at build time) ────────────────────────

let cached: ProfilesFile | null = null;
function load(): ProfilesFile {
  if (cached) return cached;
  const path = join(process.cwd(), "public", "data", "kommune-profiles.json");
  cached = JSON.parse(readFileSync(path, "utf8"));
  return cached!;
}

// ─── Public helpers ──────────────────────────────────────────

/** Returns all kommuner with their slugs (used by generateStaticParams). */
export function getAllKommuner(): KommuneProfile[] {
  const { profiles } = load();
  return Object.values(profiles);
}

/** Lookup by slug. Returns null if unknown. */
export function getProfileBySlug(slug: string): KommuneProfile | null {
  const { profiles } = load();
  for (const profile of Object.values(profiles)) {
    if (profile.slug === slug) return profile;
  }
  return null;
}

/** Lookup by kommunenummer. */
export function getProfileByKnr(knr: string): KommuneProfile | null {
  const { profiles } = load();
  return profiles[knr] ?? null;
}

/** Total ranking denominators. */
export function getTotals() {
  return load().totals;
}
