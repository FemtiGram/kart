import { readFileSync, statSync } from "fs";
import { join } from "path";

// ─── Types ───────────────────────────────────────────────────

export interface BoligEntry {
  price: number;
  count: number | null;
  trend: Array<{ year: string; price: number }>;
}

export interface ChargingMarker {
  id: string;
  name: string;
  maxKw: number | null;
  lat: number;
  lon: number;
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
  /** All charging stations in the kommune (capped at 200 per kommune). */
  all: ChargingMarker[];
}

export interface CabinMarker {
  id: number;
  name: string;
  cabinType: "fjellhytte" | "ubetjent";
  beds: number | null;
  lat: number;
  lon: number;
}

export interface CabinSummary {
  total: number;
  top: Array<{
    id: number;
    name: string;
    operator: string | null;
    beds: number | null;
    elevation: number | null;
    lat: number;
    lon: number;
  }>;
  /** All cabins in the kommune (capped at 200 per kommune). */
  all: CabinMarker[];
}

export interface ReservoirMarker {
  id: number;
  name: string;
  volumeMm3: number | null;
  lat: number;
  lon: number;
}

export interface ReservoirSummary {
  total: number;
  top: Array<{
    id: number;
    name: string;
    volumeMm3: number | null;
    plantName: string | null;
    lat: number;
    lon: number;
  }>;
  /** All reservoirs in the kommune (capped at 200 per kommune). */
  all: ReservoirMarker[];
}

export interface EnergyMarker {
  id: number;
  name: string;
  type: "vind" | "vann";
  capacityMW: number | null;
  lat: number;
  lon: number;
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
    lat: number;
    lon: number;
  }>;
  /** All plants in the kommune (capped at 200 per kommune). */
  all: EnergyMarker[];
}

export type SchoolKind = "grunnskole" | "vgs" | "begge";

export interface SchoolMarker {
  id: string;
  name: string;
  type: SchoolKind;
  students: number | null;
  lat: number;
  lon: number;
}

export interface SchoolSummary {
  total: number;
  grunnskoleCount: number;
  vgsCount: number;
  totalStudents: number;
  top: Array<{
    id: string;
    name: string;
    type: SchoolKind;
    students: number | null;
    owner: "offentlig" | "privat";
    lat: number;
    lon: number;
  }>;
  /** All schools in the kommune (capped at 200 per kommune). */
  all: SchoolMarker[];
}

export interface KindergartenMarker {
  id: string;
  name: string;
  children: number | null;
  lat: number;
  lon: number;
}

export interface KindergartenSummary {
  total: number;
  totalChildren: number;
  top: Array<{
    id: string;
    name: string;
    children: number | null;
    owner: "offentlig" | "privat";
    lat: number;
    lon: number;
  }>;
  /** All kindergartens in the kommune (capped at 200 per kommune). */
  all: KindergartenMarker[];
}

/**
 * Fastlege (general practitioner) data per kommune, sourced from SSB
 * table 12005. This is authoritative NLOD-licensed data — very different
 * in character from the OSM marker data that /helse also shows.
 *
 * `latest` is a flat map of metric code → value for the most recent year
 * SSB has published (see `year`). `trend` carries the full 2015→latest
 * series, but only for the three primary metrics used on the /helse
 * choropleth and the Stedsprofil sparkline — the rest would bloat the
 * profile JSON unnecessarily.
 *
 * `osm` carries reference counts from the OpenStreetMap markers that
 * /helse uses as an optional overlay. These are crowd-sourced and
 * incomplete — good for context, bad as a single source of truth.
 */
export interface HealthSummary {
  year: string;
  latest: Record<string, number>;
  trend: Record<string, Array<{ year: string; value: number }>>;
  osm: {
    sykehusCount: number;
    legevaktCount: number;
    privatklinikkerCount: number;
  };
}

/**
 * Cost-of-living stats. Eiendomsskatt (SSB 14674) and the four annual
 * kommunale gebyrer — vann, avløp, avfall, feiing (SSB 12842). Both
 * carry the SSB reporting year so the detail copy can cite it.
 *
 * `eiendomsskatt.has === false` means the kommune has not introduced
 * property tax at all (≈ 1/3 of kommuner). `annualFor120m2` is SSB's
 * standardized figure for a 120 m² enebolig — the single comparable
 * number across kommuner, independent of valuation practice.
 *
 * `gebyrer.total` is the sum of the four fees (any null summands
 * excluded), the single headline number for the card.
 */
/**
 * Demografi — household ownership, education level, and dwelling type
 * distribution per kommune. Sourced from three SSB tables:
 *   - 11084 (Eierstatus): % selveier / andelseier / leier (households)
 *   - 09429 (Utdanningsnivå): % grunnskole / vgs / fagskole / UH kort/lang
 *   - 06265 (Boliger etter bygningstype): % enebolig / tomannsbolig /
 *           rekkehus / blokk / bofellesskap / annet (share of dwellings)
 *
 * All values are percentages (0..100). A sub-object is null when SSB
 * has no data for that kommune.
 */
export interface DemografiSummary {
  eierstatus: {
    selveier: number;
    andelseier: number;
    leier: number;
    year: string;
  } | null;
  utdanning: {
    grunnskole: number;
    vgs: number;
    fagskole: number;
    hoyereKort: number;
    hoyereLang: number;
    year: string;
  } | null;
  boliger: {
    enebolig: number;
    tomannsbolig: number;
    rekkehus: number;
    blokk: number;
    bofellesskap: number;
    annet: number;
    year: string;
  } | null;
}

export interface CostSummary {
  eiendomsskatt: {
    has: boolean;
    annualFor120m2: number | null;
    promille: number | null;
    year: string;
  } | null;
  gebyrer: {
    vann: number | null;
    avlop: number | null;
    avfall: number | null;
    feiing: number | null;
    total: number | null;
    year: string;
  } | null;
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
  /** Finn.no hierarchical location code (e.g. `1.20012.20195`). Null for
   *  kommuner not present in Finn's taxonomy (e.g. Drammen). */
  finnLocationCode: string | null;
  verneAreaKm2: number | null;
  vernePct: number | null;
  charging: ChargingSummary;
  cabins: CabinSummary;
  reservoirs: ReservoirSummary;
  energy: EnergySummary;
  schools: SchoolSummary;
  kindergartens: KindergartenSummary;
  health: HealthSummary;
  cost: CostSummary;
  demografi: DemografiSummary;
  ranks: {
    population: number | null;
    income: number | null;
    bolig: number | null;
    /** Enebolig-first bolig rank (01 → 02 → 03), used by the snapshot
     *  generator so price + rank labels stay consistent. */
    boligEnebolig: number | null;
    verne: number | null;
    energy: number | null;
    affordability: number | null;
    reservekapasitet: number | null;
    andelUtenLege: number | null;
    listelengde: number | null;
    gebyrTotal: number | null;
  };
  /** Auto-generated 3-sentence narrative summary, built in
   *  scripts/generate-snapshot.mjs. Baked in at build time. */
  snapshot: string[];
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

// ─── Loader ──────────────────────────────────────────────────
//
// Cached in a module-level variable for performance (the JSON is ~3.7
// MB and parsed once), but invalidated when the file's mtime changes.
// In production/SSG the file never changes mid-build so the cache is
// populated once. In dev, running `build-kommune-profiles.mjs`
// rewrites the JSON and the next request picks up the new mtime and
// reloads — no dev-server restart needed.

let cached: ProfilesFile | null = null;
let cachedMtimeMs = 0;

function load(): ProfilesFile {
  const path = join(process.cwd(), "public", "data", "kommune-profiles.json");
  const mtimeMs = statSync(path).mtimeMs;
  if (cached && cachedMtimeMs === mtimeMs) return cached;
  cached = JSON.parse(readFileSync(path, "utf8"));
  cachedMtimeMs = mtimeMs;
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
