"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { MapContainer, GeoJSON, TileLayer, Marker } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import type { GeoJsonObject, Feature } from "geojson";
import type { Layer } from "leaflet";
import Link from "next/link";
import {
  Info,
  Map as MapIcon,
  ChevronUp,
  ArrowRight,
  HeartPulse,
  ExternalLink,
  Phone,
  Gauge,
  UserX,
  Users,
  SlidersHorizontal,
  Check,
} from "lucide-react";
import { kommuneSlug } from "@/lib/kommune-slug";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { MapSearchBar, type MapSearchBarHandle } from "@/components/map-search";
import {
  FlyTo,
  DataDisclaimer,
  MapError,
  interpolateColor,
  MAP_HEIGHT,
} from "@/lib/map-utils";
import { FYLKER } from "@/lib/fylker";
import { CompactCard } from "@/components/compact-card";
import { InfoModal } from "@/components/info-modal";
import { MapLoading } from "@/components/map-loading";
import { healthIcon, HEALTH_COLOR, type HealthType } from "@/components/map-icons";
import {
  synthesizeHealth,
  type HealthTone,
} from "@/lib/health-summary";
import type { Suggestion } from "@/lib/map-utils";

// ─── Types ──────────────────────────────────────────────────

interface FastlegeMetric {
  code: string;
  label: string;
  unit: string;
  primary: boolean;
  invertColor: boolean;
}

interface FastlegeKommuneEntry {
  latest: Record<string, number>;
  trend: Record<string, Array<{ year: string; value: number }>>;
}

interface FastlegeData {
  generatedAt: string;
  latestYear: string;
  metrics: FastlegeMetric[];
  kommuner: Record<string, FastlegeKommuneEntry>;
}

interface HealthEntity {
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

interface OsmHealthData {
  sykehus: HealthEntity[];
  legevakt: HealthEntity[];
  privatklinikker: HealthEntity[];
}

interface Selected {
  knr: string;
  name: string;
}

// ─── Metric-aware color helper ──────────────────────────────
//
// `interpolateColor(t)` in map-utils goes red→yellow→green for t ∈ [0,1].
// Semantics per metric differ:
//   - reservekapasitet (primary): 100 = balanced, <100 = overbooked (red),
//     >100 = headroom (green). Diverging scale clamped to [85, 115].
//   - andelUtenLege: lower = better, so we invert t.
//   - listelengde: lower = better, so we invert t.
function colorFor(
  value: number | null | undefined,
  metric: FastlegeMetric,
  min: number,
  max: number
): string {
  if (value == null) return "var(--kv-muted-fill)";
  if (metric.code === "KOSreservekapasi0000") {
    const clamped = Math.max(85, Math.min(115, value));
    const t = (clamped - 85) / 30;
    return interpolateColor(t);
  }
  if (max === min) return interpolateColor(0.5);
  let t = (value - min) / (max - min);
  if (metric.invertColor) t = 1 - t;
  return interpolateColor(Math.max(0, Math.min(1, t)));
}

// ─── Primary metric configs ─────────────────────────────────

const PRIMARY_METRIC_CODES = [
  "KOSreservekapasi0000",
  "KOSandelpasiente0000",
  "KOSgjsnlisteleng0000",
] as const;

const METRIC_SHORT_LABEL: Record<string, string> = {
  KOSreservekapasi0000: "Ledig kapasitet",
  KOSandelpasiente0000: "Uten fastlege",
  KOSgjsnlisteleng0000: "Pasienter per lege",
};

const METRIC_ICON: Record<string, typeof Gauge> = {
  KOSreservekapasi0000: Gauge,
  KOSandelpasiente0000: UserX,
  KOSgjsnlisteleng0000: Users,
};

/**
 * One-line plain-language descriptions for the 18 SSB fastlege metrics.
 * Shown under each row in the "Alle fastlege-metrikker" table in the
 * detail sheet. SSB's own definitions are paragraphs; we compress each
 * to a single readable line so the table stays scannable.
 */
/**
 * Renders an ISO timestamp as a coarse relative-time string in Norwegian.
 * Used on OSM marker popups so the reader can quickly eyeball whether the
 * OpenStreetMap entry is recent or stale (OSM edits are crowd-sourced and
 * a 5-year-old untouched entry is a reason to verify twice).
 */
function formatRelativeDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;
  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return null;
  if (days < 1) return "i dag";
  if (days < 7) return `${days} dager siden`;
  if (days < 30) return `${Math.floor(days / 7)} uker siden`;
  if (days < 365) return `${Math.floor(days / 30)} måneder siden`;
  return `${Math.floor(days / 365)} år siden`;
}

const METRIC_DESCRIPTION: Record<string, string> = {
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

/**
 * SSB's `KOSreservekapasi0000` is an index centered on 100: 100 = kapasitet
 * matches patient load, >100 = headroom, <100 = overbooked. The raw number
 * is confusing at a glance, so we display it as a signed percentage
 * relative to 100 — Oslo (105) becomes "+5 %", Vefsn (98) becomes "−2 %".
 * Intuitive once you know 0 = balansert.
 */
function formatMetric(value: number | null | undefined, metric: FastlegeMetric): string {
  if (value == null) return "–";
  if (metric.code === "KOSreservekapasi0000") {
    const delta = value - 100;
    const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
    return `${sign}${Math.abs(delta).toLocaleString("nb-NO", { maximumFractionDigits: 0 })}\u00a0%`;
  }
  if (metric.unit === "prosent") return `${value.toLocaleString("nb-NO", { maximumFractionDigits: 1 })}\u00a0%`;
  return value.toLocaleString("nb-NO", { maximumFractionDigits: 0 });
}

function getFylke(knr: string): string | null {
  const prefix = knr.slice(0, 2);
  return FYLKER.find((f) => f.fylkesnummer === prefix)?.fylkesnavn ?? null;
}

function computeRank(
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

// ─── Component ──────────────────────────────────────────────

export function HealthMap() {
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const [fastlege, setFastlege] = useState<FastlegeData | null>(null);
  const [osm, setOsm] = useState<OsmHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [counting, setCounting] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [error, setError] = useState(false);

  const [metricCode, setMetricCode] = useState<(typeof PRIMARY_METRIC_CODES)[number]>(
    "KOSreservekapasi0000"
  );
  const [showOsm, setShowOsm] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  // OSM marker selection is parallel to kommune selection — clicking
  // either one clears the other so the compact card slot is always
  // showing exactly one thing.
  const [selectedOsm, setSelectedOsm] = useState<{
    kind: HealthType;
    data: HealthEntity;
  } | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lon: number; zoom?: number } | null>(
    null
  );
  const [showBase, setShowBase] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [showFilter, setShowFilter] = useState(false);

  const fastlegeRef = useRef<FastlegeData | null>(null);
  const metricCodeRef = useRef(metricCode);
  // Ref passed to the Dialog.Popup's `initialFocus` prop so base-ui
  // focuses the top of the detail sheet on open instead of the first
  // tabbable link (which would be near the bottom and scroll the hero
  // off-screen). See DetailSheetBody for where the ref is attached.
  const detailSheetTopRef = useRef<HTMLDivElement>(null);
  const geoFeaturesRef = useRef<
    Array<{ kommunenummer: string; kommunenavn: string }>
  >([]);
  const layerRefs = useRef<Map<string, L.Path>>(new Map());
  const selectedKnrRef = useRef<string | null>(null);
  const searchBarRef = useRef<MapSearchBarHandle>(null);
  const restoredRef = useRef(false);
  const prevSelectionKey = useRef<string | null>(null);

  // Declared before any effect that references it — JS TDZ gotcha
  // triggers the exhaustive-deps lint even though the actual call sites
  // run after commit. Keep the definition order: refs → callbacks → effects.
  const highlightKommune = useCallback((knr: string) => {
    const fl = fastlegeRef.current;
    const metric = fl?.metrics.find((m) => m.code === metricCodeRef.current);
    const values = fl
      ? Object.values(fl.kommuner)
          .map((k) => k.latest[metricCodeRef.current])
          .filter((v): v is number => v != null)
      : [];
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    if (selectedKnrRef.current && selectedKnrRef.current !== knr) {
      const prev = layerRefs.current.get(selectedKnrRef.current);
      if (prev && metric) {
        const v = fl?.kommuner[selectedKnrRef.current]?.latest[metricCodeRef.current];
        prev.setStyle({
          weight: 0.5,
          color: "white",
          fillColor: colorFor(v, metric, min, max),
          fillOpacity: v != null ? 0.85 : 0.3,
        });
      }
    }
    const layer = layerRefs.current.get(knr);
    if (layer) {
      layer.setStyle({ weight: 2.5, color: "#24374c", fillOpacity: 1 });
      layer.bringToFront();
    }
    selectedKnrRef.current = knr;
  }, []);

  // Sync hash ↔ selection. Same pattern as schools-map / energy-map —
  // see feedback_hash_deep_linking.md memory.
  useEffect(() => {
    const key = selected ? `kommune-${selected.knr}` : null;
    if (key === prevSelectionKey.current) return;
    prevSelectionKey.current = key;
    const path = window.location.pathname;
    if (key) {
      history.replaceState(null, "", `${path}#${key}`);
    } else {
      history.replaceState(null, "", path);
    }
  }, [selected]);

  const loadData = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const [geo, fl, om] = await Promise.all([
        fetch("/api/kommuner").then((r) => r.json()),
        fetch("/data/fastlege.json").then((r) => r.json()),
        fetch("/data/health.json").then((r) => r.json()),
      ]);
      fastlegeRef.current = fl;
      geoFeaturesRef.current = (geo.features ?? []).map(
        (f: { properties: { kommunenummer: string; kommunenavn: string } }) => ({
          kommunenummer: f.properties.kommunenummer,
          kommunenavn: f.properties.kommunenavn,
        })
      );
      setGeoData(geo);
      setFastlege(fl);
      setOsm(om);
      setLoadedCount(Object.keys(fl.kommuner).length);
      setCounting(true);
      setLoading(false);
      setTimeout(() => setCounting(false), 800);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Restore selection from URL hash — #kommune-<knr>
  useEffect(() => {
    if (restoredRef.current) return;
    if (loading || !geoData || !fastlege) return;
    restoredRef.current = true;
    const hash = window.location.hash;
    if (!hash) return;
    const segments = hash.split("#").filter(Boolean);
    const last = segments[segments.length - 1];
    const match = last?.match(/^kommune-(\d{4})$/);
    if (!match) return;
    const nr = match[1];
    const feature = geoFeaturesRef.current.find((f) => f.kommunenummer === nr);
    if (!feature) return;
    highlightKommune(nr);
    setSelected({ knr: nr, name: feature.kommunenavn });
    setShowInfoSheet(true);
    const layer = layerRefs.current.get(nr) as L.Polygon | undefined;
    const center = layer?.getBounds().getCenter();
    if (center) setFlyTarget({ lat: center.lat, lon: center.lng, zoom: 9 });
  }, [loading, geoData, fastlege, highlightKommune]);

  // Sync the metric code ref so GeoJSON onEachFeature closures can read
  // the current metric without re-binding every feature.
  useEffect(() => {
    metricCodeRef.current = metricCode;
    // Force a restyle of all features when the metric flips
    if (!fastlege) return;
    const metric = fastlege.metrics.find((m) => m.code === metricCode);
    if (!metric) return;
    const values = Object.values(fastlege.kommuner)
      .map((k) => k.latest[metricCode])
      .filter((v): v is number => v != null);
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    for (const [knr, layer] of layerRefs.current.entries()) {
      const v = fastlege.kommuner[knr]?.latest[metricCode];
      layer.setStyle({
        fillColor: colorFor(v, metric, min, max),
        fillOpacity: v != null ? 0.85 : 0.3,
      });
    }
    if (selectedKnrRef.current) {
      layerRefs.current.get(selectedKnrRef.current)?.setStyle({
        weight: 2.5,
        color: "#24374c",
        fillOpacity: 1,
      });
    }
  }, [metricCode, fastlege]);

  /** Reset the currently highlighted kommune polygon back to its metric
   *  fill. Shared between `clearSelection` and OSM marker clicks that
   *  need to steal the selection. */
  const resetKommunePolygon = useCallback(() => {
    const fl = fastlegeRef.current;
    const metric = fl?.metrics.find((m) => m.code === metricCodeRef.current);
    if (!selectedKnrRef.current || !metric || !fl) return;
    const layer = layerRefs.current.get(selectedKnrRef.current);
    if (layer) {
      const values = Object.values(fl.kommuner)
        .map((k) => k.latest[metricCodeRef.current])
        .filter((v): v is number => v != null);
      const min = values.length ? Math.min(...values) : 0;
      const max = values.length ? Math.max(...values) : 1;
      const v = fl.kommuner[selectedKnrRef.current]?.latest[metricCodeRef.current];
      layer.setStyle({
        weight: 0.5,
        color: "white",
        fillColor: colorFor(v, metric, min, max),
        fillOpacity: v != null ? 0.85 : 0.3,
      });
    }
    selectedKnrRef.current = null;
  }, []);

  const clearSelection = useCallback(() => {
    resetKommunePolygon();
    setSelected(null);
    searchBarRef.current?.setQuery("");
  }, [resetKommunePolygon]);

  /** Click handler for an OSM sykehus/legevakt marker. Steals the compact
   *  card slot from any active kommune selection. */
  const handleOsmClick = useCallback(
    (kind: HealthType, data: HealthEntity) => {
      resetKommunePolygon();
      setSelected(null);
      setShowInfoSheet(false);
      setSelectedOsm((prev) =>
        prev?.data.id === data.id ? null : { kind, data }
      );
    },
    [resetKommunePolygon]
  );

  const clearOsmSelection = useCallback(() => setSelectedOsm(null), []);

  const handleSearchSelect = useCallback(
    (s: Suggestion) => {
      setSelectedOsm(null);
      if (s.type === "fylke") {
        searchBarRef.current?.setQuery(s.fylkesnavn);
        setFlyTarget({ lat: s.lat, lon: s.lon, zoom: s.zoom });
        return;
      }
      if (s.type === "kommune") {
        searchBarRef.current?.setQuery(s.kommunenavn);
        highlightKommune(s.kommunenummer);
        setSelected({ knr: s.kommunenummer, name: s.kommunenavn });
        const layer = layerRefs.current.get(s.kommunenummer) as L.Polygon | undefined;
        const center = layer?.getBounds().getCenter();
        if (center) setFlyTarget({ lat: center.lat, lon: center.lng, zoom: 9 });
      } else if (s.type === "adresse") {
        const addr = s.addr;
        const nr = addr.kommunenummer ?? "";
        searchBarRef.current?.setQuery(addr.kommunenavn);
        if (nr) {
          highlightKommune(nr);
          setSelected({ knr: nr, name: addr.kommunenavn });
        }
        setFlyTarget(addr.representasjonspunkt);
      }
    },
    [highlightKommune]
  );

  const geoStyle = (feature?: Feature) => {
    const nr = feature?.properties?.kommunenummer;
    const fl = fastlegeRef.current;
    const metric = fl?.metrics.find((m) => m.code === metricCodeRef.current);
    if (!fl || !metric) {
      return { fillColor: "var(--kv-muted-fill)", weight: 0.5, color: "white", fillOpacity: 0.4 };
    }
    const values = Object.values(fl.kommuner)
      .map((k) => k.latest[metricCodeRef.current])
      .filter((v): v is number => v != null);
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    const v = fl.kommuner[nr]?.latest[metricCodeRef.current];
    return {
      fillColor: colorFor(v, metric, min, max),
      weight: 0.5,
      color: "white",
      fillOpacity: v != null ? 0.85 : 0.3,
    };
  };

  const onEachFeature = (feature: Feature, layer: Layer) => {
    const nr = feature.properties?.kommunenummer;
    const navn = feature.properties?.kommunenavn ?? "";
    if (nr) layerRefs.current.set(nr, layer as L.Path);
    layer.on({
      mouseover(e) {
        const l = e.target as L.Path;
        if (nr !== selectedKnrRef.current) {
          l.setStyle({ weight: 1.5, color: "#24374c", fillOpacity: 1 });
          l.bringToFront();
        }
      },
      mouseout(e) {
        const l = e.target as L.Path;
        if (nr !== selectedKnrRef.current) {
          // Restore via geoStyle so the color matches the current metric
          l.setStyle(geoStyle(feature));
        }
      },
      click() {
        setSelectedOsm(null);
        highlightKommune(nr);
        setSelected({ knr: nr, name: navn });
      },
    });
  };

  const currentMetric = useMemo(
    () => fastlege?.metrics.find((m) => m.code === metricCode),
    [fastlege, metricCode]
  );

  const metricValues = useMemo(() => {
    if (!fastlege) return { min: 0, max: 1 };
    const values = Object.values(fastlege.kommuner)
      .map((k) => k.latest[metricCode])
      .filter((v): v is number => v != null);
    return {
      min: values.length ? Math.min(...values) : 0,
      max: values.length ? Math.max(...values) : 1,
    };
  }, [fastlege, metricCode]);

  const selectedEntry = selected && fastlege?.kommuner[selected.knr];
  const selectedMetricValue = selectedEntry?.latest[metricCode];

  // OSM markers visible only when overlay is toggled on. Filter to the
  // currently-selected kommune's bbox approximation so we don't spam
  // markers across the whole country.
  const osmMarkers = useMemo(() => {
    if (!showOsm || !osm) return [];
    return [
      ...osm.sykehus.map((e) => ({ kind: "sykehus" as HealthType, data: e })),
      ...osm.legevakt.map((e) => ({ kind: "legevakt" as HealthType, data: e })),
    ];
  }, [showOsm, osm]);

  return (
    <div className="flex flex-col" style={{ height: MAP_HEIGHT }}>
      {/* Search bar + filter sheet — matches /skoler pattern: filter
          button inline with search, metric options live in a bottom
          sheet instead of a segmented control row. */}
      <div className="relative z-[1000] px-4 py-4 md:px-8 shrink-0 bg-background border-b">
        <div className="max-w-xl mx-auto relative flex flex-col gap-2">
          <MapSearchBar
            ref={searchBarRef}
            kommuneList={() => geoFeaturesRef.current}
            onSelect={handleSearchSelect}
            placeholder="Søk etter kommune, fylke eller adresse..."
          >
            <Sheet
              open={showFilter}
              onOpenChange={(open) => {
                setShowFilter(open);
                if (open) setShowInfoSheet(false);
              }}
            >
              <SheetTrigger
                render={
                  <Button
                    variant="secondary"
                    size="icon"
                    className="relative shadow-lg shrink-0 h-11 w-11 rounded-xl"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                  </Button>
                }
              />
              <SheetContent
                side="bottom"
                className="rounded-t-2xl max-h-[70svh] overflow-y-auto"
              >
                <div className="mx-auto w-full max-w-md px-2">
                  <SheetHeader>
                    <SheetTitle className="text-left">
                      Velg metrikk
                    </SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col gap-4 py-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70 mb-2">
                        Fargelegg kommunene etter
                      </p>
                      <div className="rounded-xl border overflow-hidden">
                        {PRIMARY_METRIC_CODES.map((code) => {
                          const Icon = METRIC_ICON[code];
                          const active = metricCode === code;
                          return (
                            <button
                              key={code}
                              onClick={() => setMetricCode(code)}
                              className={`flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors border-b last:border-0 ${active ? "bg-background" : "bg-muted/40 text-muted-foreground"}`}
                            >
                              <div
                                className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${active ? "border-primary bg-primary" : "border-muted-foreground/30 bg-background"}`}
                              >
                                {active && (
                                  <Check className="h-3 w-3 text-primary-foreground" />
                                )}
                              </div>
                              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="font-medium flex-1 text-left">
                                {METRIC_SHORT_LABEL[code]}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => setShowFilter(false)}
                    >
                      Ferdig
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </MapSearchBar>

          {/* Stats summary */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-foreground/70">
              {loading
                ? "Henter fastlegedata..."
                : `${loadedCount} kommuner · ${METRIC_SHORT_LABEL[metricCode]} · ${fastlege?.latestYear} · Kilde: SSB 12005`}
            </p>
            <button
              onClick={() => setShowInfo(true)}
              className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border bg-muted text-foreground/70 hover:text-foreground transition-colors shrink-0"
            >
              <Info className="h-3 w-3" />
              Om data
            </button>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="relative grow">
        <MapLoading
          visible={loading || counting}
          loading={loading}
          counting={counting}
          count={loadedCount}
          countLabel="kommuner lastet"
          loadingMessage="Henter fastlegedata..."
        />
        {error && (
          <MapError message="Kunne ikke laste fastlegedata." onRetry={loadData} />
        )}

        {!loading && !error && geoData && (
          <MapContainer
            center={[65, 14]}
            zoom={5}
            style={{ height: "100%", width: "100%" }}
          >
            {showBase && (
              <TileLayer
                url="https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png"
                attribution='&copy; <a href="https://www.kartverket.no/">Kartverket</a>'
              />
            )}
            {flyTarget && (
              <FlyTo
                lat={flyTarget.lat}
                lon={flyTarget.lon}
                zoom={flyTarget.zoom}
              />
            )}
            <GeoJSON
              key={metricCode}
              data={geoData}
              style={geoStyle}
              onEachFeature={onEachFeature}
            />

            {/* Optional OSM overlay. Off by default — when active, a blue
                informational pill at the top of the map warns that the
                markers are crowd-sourced and to verify before relying. */}
            {showOsm && osmMarkers.length > 0 && (
              <MarkerClusterGroup
                chunkedLoading
                maxClusterRadius={60}
                spiderfyOnMaxZoom
                showCoverageOnHover={false}
                iconCreateFunction={(c: { getChildCount: () => number }) => {
                  const count = c.getChildCount();
                  const size = count >= 100 ? 44 : 36;
                  return L.divIcon({
                    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${HEALTH_COLOR};color:white;border-radius:50%;font-weight:700;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid rgba(255,255,255,0.6)">${count}</div>`,
                    className: "",
                    iconSize: [size, size],
                    iconAnchor: [size / 2, size / 2],
                  });
                }}
              >
                {osmMarkers.map((m) => (
                  <Marker
                    key={`${m.kind}-${m.data.id}`}
                    position={[m.data.lat, m.data.lon]}
                    icon={healthIcon(m.kind, false, true)}
                    eventHandlers={{ click: () => handleOsmClick(m.kind, m.data) }}
                  />
                ))}
              </MarkerClusterGroup>
            )}
          </MapContainer>
        )}

        {/* Compact card — kommune selection (primary) */}
        <CompactCard
          visible={!!selected && !showInfoSheet && !selectedOsm}
          onClose={clearSelection}
        >
          {selected && currentMetric && (
            <>
              <CompactCard.Header
                title={selected.name}
                metric={formatMetric(selectedMetricValue, currentMetric)}
              />
              <CompactCard.Context>
                <CompactCard.ContextLeft>
                  <CompactCard.ContextText>
                    {getFylke(selected.knr) ?? "Norge"}
                  </CompactCard.ContextText>
                </CompactCard.ContextLeft>
                <CompactCard.ContextRight>
                  <CompactCard.ContextText>
                    {METRIC_SHORT_LABEL[metricCode]}
                  </CompactCard.ContextText>
                </CompactCard.ContextRight>
              </CompactCard.Context>
              <CompactCard.Actions>
                <CompactCard.Action
                  primary
                  onClick={() => setShowInfoSheet(true)}
                  icon={<ChevronUp className="h-3.5 w-3.5" />}
                >
                  Vis mer
                </CompactCard.Action>
              </CompactCard.Actions>
            </>
          )}
        </CompactCard>

        {/* Compact card — OSM marker selection (optional overlay). Shares
            the same slot as the kommune card; only one can be active. */}
        <CompactCard visible={!!selectedOsm} onClose={clearOsmSelection}>
          {selectedOsm && (
            <>
              <CompactCard.Header
                title={selectedOsm.data.name}
                metric={selectedOsm.kind === "sykehus" ? "Sykehus" : "Legevakt"}
                metricColor="var(--kv-negative-dark)"
              />
              <CompactCard.Context>
                <CompactCard.ContextLeft>
                  <CompactCard.ContextText>
                    {selectedOsm.data.operator ??
                      selectedOsm.data.address ??
                      "Fra OpenStreetMap"}
                  </CompactCard.ContextText>
                </CompactCard.ContextLeft>
                <CompactCard.ContextRight>
                  <CompactCard.ContextText>
                    {formatRelativeDate(selectedOsm.data.lastUpdated)
                      ? `OSM · ${formatRelativeDate(selectedOsm.data.lastUpdated)}`
                      : "OSM"}
                  </CompactCard.ContextText>
                </CompactCard.ContextRight>
              </CompactCard.Context>
              <CompactCard.Actions>
                {selectedOsm.data.phone ? (
                  <CompactCard.Action
                    primary
                    href={`tel:${selectedOsm.data.phone.replace(/\s/g, "")}`}
                    icon={<Phone className="h-3.5 w-3.5" />}
                  >
                    Ring
                  </CompactCard.Action>
                ) : null}
                <CompactCard.Action
                  href={`https://www.openstreetmap.org/${selectedOsm.data.osmType}/${selectedOsm.data.osmId}`}
                  icon={<ExternalLink className="h-3.5 w-3.5" />}
                >
                  Se i OSM
                </CompactCard.Action>
              </CompactCard.Actions>
            </>
          )}
        </CompactCard>

        {/* Detail sheet */}
        <Sheet
          open={showInfoSheet && !!selected}
          onOpenChange={(open) => {
            setShowInfoSheet(open);
            if (!open && !selected) clearSelection();
          }}
        >
          <SheetContent
            side="bottom"
            className="rounded-t-2xl max-h-[85svh] overflow-y-auto"
            initialFocus={detailSheetTopRef}
          >
            {selected && fastlege && (
              <DetailSheetBody
                selected={selected}
                fastlege={fastlege}
                osm={osm}
                topRef={detailSheetTopRef}
              />
            )}
          </SheetContent>
        </Sheet>

        {/* Legend + base layer toggle + OSM overlay toggle */}
        {!loading && currentMetric && (
          <div className="absolute top-3 right-3 z-[999] flex flex-col gap-2 items-end">
            <div
              className="hidden sm:block bg-card rounded-xl shadow-md px-3 py-2.5"
              style={{ border: "1px solid var(--kv-muted-fill)" }}
            >
              <p className="text-xs font-semibold text-foreground/70 mb-1.5">
                {METRIC_SHORT_LABEL[metricCode]}
              </p>
              <div
                className="h-3 w-24 rounded-sm"
                style={{
                  background: currentMetric.invertColor
                    ? "linear-gradient(to right, var(--kv-positive), #facc15, var(--kv-negative))"
                    : "linear-gradient(to right, var(--kv-negative), #facc15, var(--kv-positive))",
                }}
              />
              <div className="flex justify-between mt-0.5">
                <span className="text-[10px] text-foreground/70">
                  {metricCode === "KOSreservekapasi0000"
                    ? "−15 % (overbooket)"
                    : formatMetric(metricValues.min, currentMetric)}
                </span>
                <span className="text-[10px] text-foreground/70">
                  {metricCode === "KOSreservekapasi0000"
                    ? "+15 % (ledig plass)"
                    : formatMetric(metricValues.max, currentMetric)}
                </span>
              </div>
            </div>
            <button
              onClick={() => setShowBase((b) => !b)}
              className={`flex items-center gap-1.5 rounded-lg border bg-card shadow-md px-3 py-1.5 text-xs font-semibold transition-colors ${showBase ? "text-white" : "text-muted-foreground hover:bg-muted"}`}
              style={showBase ? { background: "var(--kv-blue)" } : {}}
            >
              <MapIcon className="h-3.5 w-3.5" />
              Bakgrunnskart
            </button>
            <button
              onClick={() => {
                setShowOsm((v) => {
                  // Toggling the overlay off should also clear any
                  // selected OSM marker — otherwise the compact card
                  // lingers while the markers it references are gone.
                  if (v) setSelectedOsm(null);
                  return !v;
                });
              }}
              className={`flex items-center gap-1.5 rounded-lg border bg-card shadow-md px-3 py-1.5 text-xs font-semibold transition-colors ${showOsm ? "text-white" : "text-muted-foreground hover:bg-muted"}`}
              style={showOsm ? { background: HEALTH_COLOR } : {}}
            >
              <HeartPulse className="h-3.5 w-3.5" />
              OSM-markører
            </button>

            {/* Tiny "OSM data quality" note attached to the toggle stack
                so it sits right under the button that activates it.
                Short text, no floating absolute position. */}
            {showOsm && (
              <div
                className="max-w-[180px] bg-card border rounded-lg px-2.5 py-1 shadow-sm text-right"
                style={{ borderColor: "var(--kv-info)" }}
              >
                <p
                  className="text-[10px] font-medium leading-tight"
                  style={{ color: "var(--kv-info-dark)" }}
                >
                  OSM er dugnadsdata
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info modal */}
      <InfoModal
        open={showInfo}
        onClose={() => setShowInfo(false)}
        title="Om helsetilbud-kartet"
      >
        <p>
          Kartet viser <span className="font-medium text-foreground">fastlegedata per kommune</span> fra SSB tabell 12005 — 357 kommuner, oppdatert til og med {fastlege?.latestYear ?? "2025"}.
        </p>
        <p>
          Velg en indikator over kartet for å fargelegge kommunene:
        </p>
        <ul className="list-disc ml-5 space-y-1.5 text-sm">
          <li><span className="font-medium text-foreground">Ledig kapasitet</span> — hvor mye plass det er på fastlegelistene, vist som prosent. <span className="font-medium">+5&nbsp;%</span> betyr at det er 5&nbsp;% mer kapasitet enn pasienter (ledig plass). <span className="font-medium">−2&nbsp;%</span> betyr at listene er 2&nbsp;% overbooket. Grønn er bra.</li>
          <li><span className="font-medium text-foreground">Uten fastlege</span> — andel av innbyggerne som står på en liste uten fast lege. Rød er krise.</li>
          <li><span className="font-medium text-foreground">Listelengde</span> — gjennomsnittlig antall pasienter per fastlege.</li>
        </ul>
        <p>
          Klikk en kommune for detaljer med alle 18 metrikker fra SSB, trendkurve og rangering blant alle kommunene.
        </p>
        <p
          className="rounded-xl p-3 font-medium leading-snug text-sm"
          style={{
            background: "var(--kv-info-light)",
            color: "var(--kv-info)",
          }}
        >
          Du kan også slå på <span className="font-bold">OSM-markører</span> (sykehus og legevakt fra OpenStreetMap) som et valgfritt lag. OSM er dugnadsbasert og kan være feil eller ufullstendig — <span className="font-bold">ring 113 ved akutt nød</span> og sjekk helsenorge.no for offisiell informasjon.
        </p>
        <a
          href="https://www.ssb.no/statbank/table/12005"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Åpne SSB tabell 12005
        </a>
      </InfoModal>
    </div>
  );
}

// ─── Detail sheet body ──────────────────────────────────────

function DetailSheetBody({
  selected,
  fastlege,
  topRef,
}: {
  selected: Selected;
  fastlege: FastlegeData;
  osm: OsmHealthData | null;
  topRef: React.RefObject<HTMLDivElement | null>;
}) {
  // topRef is forwarded to the root <div> below and passed to the parent
  // Sheet's `initialFocus` prop. base-ui focuses it when the sheet opens,
  // which means the sheet starts at the top instead of scrolling to
  // whichever link happens to be the first tabbable inside the content.
  const entry = fastlege.kommuner[selected.knr];
  if (!entry) {
    return (
      <div
        ref={topRef}
        tabIndex={-1}
        className="mx-auto w-full max-w-md px-4 pb-6 outline-none"
      >
        <SheetHeader>
          <SheetTitle className="text-left">{selected.name}</SheetTitle>
        </SheetHeader>
        <p className="text-sm text-muted-foreground mt-3">
          Ingen fastlegedata i SSB for denne kommunen.
        </p>
      </div>
    );
  }

  const fylke = getFylke(selected.knr);

  // Rankings for the three primary metrics
  const ranks = {
    reservekapasitet: computeRank(fastlege, "KOSreservekapasi0000", selected.knr, true),
    andelUtenLege: computeRank(fastlege, "KOSandelpasiente0000", selected.knr, false),
    listelengde: computeRank(fastlege, "KOSgjsnlisteleng0000", selected.knr, false),
  };

  return (
    <div
      ref={topRef}
      tabIndex={-1}
      className="mx-auto w-full max-w-md px-4 pb-6 outline-none"
    >
      <SheetHeader>
        <SheetTitle className="text-left sr-only">{selected.name}</SheetTitle>
      </SheetHeader>

      {/* Identity */}
      <p className="font-bold text-xl leading-snug">{selected.name}</p>
      <p className="text-sm text-muted-foreground">
        {fylke ? `${fylke} · ` : ""}SSB {fastlege.latestYear}
      </p>

      {/* Plain-language synthesis — does the reasoning about the three
          metrics for the reader so they don't have to. */}
      <HealthSynthesisBanner
        metrics={{
          reservekapasitet: entry.latest.KOSreservekapasi0000,
          andelUtenLege: entry.latest.KOSandelpasiente0000,
          listelengde: entry.latest.KOSgjsnlisteleng0000,
        }}
      />

      {/* Three primary stats */}
      <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-3">
        <PrimaryStat
          label="Ledig kapasitet"
          value={entry.latest.KOSreservekapasi0000}
          valueFormatter={(v) => {
            const delta = v - 100;
            const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
            return `${sign}${Math.abs(delta).toLocaleString("nb-NO", { maximumFractionDigits: 0 })}\u00a0%`;
          }}
          rank={ranks.reservekapasitet}
          higherIsBetter
        />
        <PrimaryStat
          label="Uten fastlege"
          value={entry.latest.KOSandelpasiente0000}
          valueFormatter={(v) =>
            `${v.toLocaleString("nb-NO", { maximumFractionDigits: 1 })}\u00a0%`
          }
          rank={ranks.andelUtenLege}
          higherIsBetter={false}
        />
        <PrimaryStat
          label="Pasienter per lege"
          value={entry.latest.KOSgjsnlisteleng0000}
          valueFormatter={(v) =>
            v.toLocaleString("nb-NO", { maximumFractionDigits: 0 })
          }
          rank={ranks.listelengde}
          higherIsBetter={false}
        />
      </div>

      {/* Trend bar chart — mirrors the bolig detail sheet pattern. Bars
          represent raw SSB values (85–120 band rebased to 0 for contrast)
          so the trend shape reads clearly. Current year is opaque, the
          rest dimmed. Tooltips convert back to signed % for legibility. */}
      {entry.trend.KOSreservekapasi0000 && entry.trend.KOSreservekapasi0000.length > 1 && (
        <KapasitetTrend
          trend={entry.trend.KOSreservekapasi0000}
          latestYear={fastlege.latestYear}
        />
      )}

      {/* All 18 metrics in a stat list — each row shows the SSB label,
          a one-line plain-language description, and the value. Rows use
          items-start so a wrapping description doesn't push the number
          off its baseline. */}
      <div className="mt-4 pt-4 border-t">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70 mb-2">
          Alle fastlege-metrikker ({fastlege.latestYear})
        </p>
        <div className="rounded-2xl border bg-card overflow-hidden">
          {fastlege.metrics.map((m, i) => {
            const value = entry.latest[m.code];
            const description = METRIC_DESCRIPTION[m.code];
            return (
              <div
                key={m.code}
                className={`flex items-start justify-between gap-3 px-4 py-3 text-sm ${i > 0 ? "border-t" : ""} ${m.primary ? "bg-muted/30" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-foreground/80 font-medium">{m.label}</p>
                  {description && (
                    <p className="text-[11px] text-foreground/70 leading-tight mt-0.5">
                      {description}
                    </p>
                  )}
                </div>
                <span
                  className="tabular-nums font-semibold shrink-0"
                  style={{ color: "var(--kv-blue)" }}
                >
                  {formatMetric(value, m)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stedsprofil link */}
      <div className="mt-4 pt-4 border-t">
        <Link
          href={`/kommune/${kommuneSlug(selected.knr, selected.name)}`}
          className="flex items-center justify-between rounded-xl border bg-muted/40 hover:bg-muted px-4 py-3 transition-colors"
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--kv-blue)" }}>
              Se full stedsprofil
            </p>
            <p className="text-xs text-foreground/70 mt-0.5">
              Boligpriser, skoler, natur og mer
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-foreground/70 shrink-0" />
        </Link>
      </div>

      {/* Source */}
      <div className="mt-4 pt-4 border-t">
        <p className="text-xs text-foreground/70 text-center">
          Kilde:{" "}
          <a
            href="https://www.ssb.no/statbank/table/12005"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            SSB tabell 12005
          </a>
          , {fastlege.latestYear}
        </p>
        <DataDisclaimer />
      </div>
    </div>
  );
}

// ─── Primary stat card (inside detail sheet) ────────────────

function PrimaryStat({
  label,
  value,
  valueFormatter,
  rank,
  higherIsBetter,
}: {
  label: string;
  value: number | undefined;
  valueFormatter: (v: number) => string;
  rank: { rank: number; total: number };
  higherIsBetter: boolean;
}) {
  void higherIsBetter; // rank quartile already decides color
  const q = rank.rank / rank.total;
  const color =
    value == null
      ? "var(--kv-muted-fill)"
      : q <= 0.25
        ? "var(--kv-positive)"
        : q >= 0.75
          ? "var(--kv-negative)"
          : "var(--kv-blue)";
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <p
        className="text-xl font-extrabold tabular-nums leading-none whitespace-nowrap"
        style={{ color }}
      >
        {value != null ? valueFormatter(value) : "–"}
      </p>
      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
        {label}
      </p>
      <p className="mt-0.5 text-[10px] text-foreground/70 tabular-nums">
        #{rank.rank}/{rank.total}
      </p>
    </div>
  );
}

// ─── Synthesis banner ───────────────────────────────────────

function HealthSynthesisBanner({
  metrics,
}: {
  metrics: {
    reservekapasitet: number | undefined;
    andelUtenLege: number | undefined;
    listelengde: number | undefined;
  };
}) {
  const synth = synthesizeHealth(metrics);
  if (!synth) return null;
  const color = toneColor(synth.tone);
  return (
    <div
      className="mt-3 rounded-xl p-3"
      style={{ background: color.bg }}
    >
      <p className="text-sm font-medium leading-snug" style={{ color: color.fg }}>
        {synth.sentence}
      </p>
    </div>
  );
}

function toneColor(tone: HealthTone): { bg: string; fg: string } {
  // Text-on-tinted-bg: base semantic tokens (e.g. --kv-warning) only clear
  // ~3:1 against their -light backgrounds, which fails WCAG AA for normal
  // text. The -dark variants step to the 800-family and all clear ≥6.8:1.
  switch (tone) {
    case "good":
      return { bg: "var(--kv-positive-light)", fg: "var(--kv-positive-dark)" };
    case "bad":
      return { bg: "var(--kv-negative-light)", fg: "var(--kv-negative-dark)" };
    case "mixed":
      return { bg: "var(--kv-warning-light)", fg: "var(--kv-warning-dark)" };
    default:
      return { bg: "var(--kv-info-light)", fg: "var(--kv-info-dark)" };
  }
}

// ─── Kapasitet trend bar chart ──────────────────────────────
//
// Mirrors the bolig-map detail sheet pattern: a tight row of flex bars
// sized to the series max, most recent year opaque and the rest dim.
// Raw SSB values sit in the 85–120 band, which would all render near
// full-height if we normalized by `max`; we subtract a baseline so the
// year-to-year shape is actually legible. Tooltip restores the signed
// percentage format for anyone hovering an individual bar.

function KapasitetTrend({
  trend,
  latestYear,
}: {
  trend: Array<{ year: string; value: number }>;
  latestYear: string;
}) {
  const minRaw = Math.min(...trend.map((p) => p.value));
  const maxRaw = Math.max(...trend.map((p) => p.value));
  // Rebase to the series min for contrast; if the range is too narrow
  // (flat kommune) fall back to 1 so every bar renders at min height.
  const range = Math.max(1, maxRaw - minRaw);
  const first = trend[0];
  const last = trend[trend.length - 1];
  const totalChange = last.value - first.value;
  return (
    <div className="mt-4 pt-4 border-t">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-foreground/70">
          Ledig kapasitet ({first.year}–{latestYear})
        </p>
        {totalChange !== 0 && (
          <span
            className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold"
            style={{
              background:
                totalChange >= 0
                  ? "var(--kv-positive-light)"
                  : "var(--kv-negative-light)",
              color:
                totalChange >= 0
                  ? "var(--kv-positive-dark)"
                  : "var(--kv-negative-dark)",
            }}
          >
            {totalChange > 0 ? "+" : "−"}
            {Math.abs(totalChange).toLocaleString("nb-NO", { maximumFractionDigits: 0 })}
          </span>
        )}
      </div>
      <div className="flex items-end gap-[2px] h-12">
        {trend.map((p) => {
          const heightPct = Math.max(4, ((p.value - minRaw) / range) * 100);
          const delta = p.value - 100;
          const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
          const tooltip = `${p.year}: ${sign}${Math.abs(delta)} %`;
          return (
            <div
              key={p.year}
              className="flex-1 rounded-sm min-w-[2px] transition-all"
              style={{
                height: `${heightPct}%`,
                background: "var(--kv-blue)",
                opacity: p.year === latestYear ? 1 : 0.3,
              }}
              title={tooltip}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] text-foreground/70">{first.year}</span>
        <span className="text-[10px] text-foreground/70">{latestYear}</span>
      </div>
    </div>
  );
}

