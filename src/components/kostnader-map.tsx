"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { MapContainer, GeoJSON, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoJsonObject, Feature } from "geojson";
import type L from "leaflet";
import type { Layer } from "leaflet";
import Link from "next/link";
import {
  Info,
  Map as MapIcon,
  ChevronUp,
  ArrowRight,
  ArrowLeftRight,
  ExternalLink,
  Droplets,
  Droplet,
  Trash2,
  Flame,
  Wallet,
  Receipt,
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
import type { Suggestion } from "@/lib/map-utils";

// ─── Types ──────────────────────────────────────────────────

interface KostnaderMetric {
  code: string;
  label: string;
  shortLabel: string;
  unit: string;
  primary: boolean;
  invertColor: boolean;
  description: string;
}

interface KostnaderGebyrer {
  vann: number | null;
  avlop: number | null;
  avfall: number | null;
  feiing: number | null;
  total: number | null;
  year: string;
}

interface KostnaderKommuneEntry {
  latest: Record<string, number>;
  /** Explicit "has eiendomsskatt on homes" flag. false = positive "Ingen"
   *  fill, null = unknown (rare), true = the card shows the kr/promille. */
  hasEiendomsskatt: boolean | null;
  gebyrer: KostnaderGebyrer | null;
  displayName: string;
  fylke: string | null;
}

interface KostnaderData {
  generatedAt: string;
  gebyrerYear: string;
  eiendomsskattYear: string;
  metrics: KostnaderMetric[];
  kommuner: Record<string, KostnaderKommuneEntry>;
}

interface Selected {
  knr: string;
  name: string;
}

// ─── Metric-aware color helper ──────────────────────────────
//
// Both cost metrics are "lower = better", so `invertColor: true` flips the
// t so 0 (cheapest) = green, 1 (most expensive) = red. Kommuner with null
// values render with the muted fill. For the eiendomsskatt metric, a
// kommune with `hasEiendomsskatt === false` is NOT missing data — it's a
// positive answer ("Ingen eiendomsskatt på bolig") and gets its own
// distinct tint so the reader can spot those kommuner at a glance.
function colorFor(
  value: number | null | undefined,
  metric: KostnaderMetric,
  min: number,
  max: number,
  hasEiendomsskatt: boolean | null
): string {
  if (metric.code === "eiendomsskatt120m2" && hasEiendomsskatt === false) {
    return "var(--kv-positive-light)";
  }
  if (value == null) return "var(--kv-muted-fill)";
  if (max === min) return interpolateColor(0.5);
  let t = (value - min) / (max - min);
  if (metric.invertColor) t = 1 - t;
  return interpolateColor(Math.max(0, Math.min(1, t)));
}

// ─── Primary metric configs ─────────────────────────────────

const PRIMARY_METRIC_CODES = [
  "gebyrerTotal",
  "eiendomsskatt120m2",
] as const;

const METRIC_ICON: Record<string, typeof Wallet> = {
  gebyrerTotal: Wallet,
  eiendomsskatt120m2: Receipt,
};

/** Format a metric value for display — kr, ‰, or raw. */
function formatMetric(
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

function getFylke(knr: string): string | null {
  const prefix = knr.slice(0, 2);
  return FYLKER.find((f) => f.fylkesnummer === prefix)?.fylkesnavn ?? null;
}

function computeRank(
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

// ─── Component ──────────────────────────────────────────────

export function KostnaderMap() {
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const [kostnader, setKostnader] = useState<KostnaderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [counting, setCounting] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [error, setError] = useState(false);

  const [metricCode, setMetricCode] = useState<(typeof PRIMARY_METRIC_CODES)[number]>(
    "gebyrerTotal"
  );
  const [selected, setSelected] = useState<Selected | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lon: number; zoom?: number } | null>(
    null
  );
  const [showBase, setShowBase] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [showFilter, setShowFilter] = useState(false);

  // Comparison state — mirrors income-map / bolig-map. The refs below are
  // written during render so GeoJSON click-handler closures can read the
  // *current* compareMode/selected without re-binding onEachFeature.
  const [compareMode, setCompareMode] = useState(false);
  const [compareQuery, setCompareQuery] = useState("");
  const [compareHighlight, setCompareHighlight] = useState(-1);
  const [compareTarget, setCompareTarget] = useState<Selected | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  const compareModeRef = useRef(false);
  const selectedRef = useRef<Selected | null>(null);
  compareModeRef.current = compareMode;
  selectedRef.current = selected;

  const kostnaderRef = useRef<KostnaderData | null>(null);
  const metricCodeRef = useRef(metricCode);
  const detailSheetTopRef = useRef<HTMLDivElement>(null);
  const geoFeaturesRef = useRef<
    Array<{ kommunenummer: string; kommunenavn: string }>
  >([]);
  const layerRefs = useRef<Map<string, L.Path>>(new Map());
  const selectedKnrRef = useRef<string | null>(null);
  const searchBarRef = useRef<MapSearchBarHandle>(null);
  const restoredRef = useRef(false);
  const prevSelectionKey = useRef<string | null>(null);

  const highlightKommune = useCallback((knr: string) => {
    const k = kostnaderRef.current;
    const metric = k?.metrics.find((m) => m.code === metricCodeRef.current);
    const values = k
      ? Object.values(k.kommuner)
          .map((v) => v.latest[metricCodeRef.current])
          .filter((v): v is number => v != null)
      : [];
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    if (selectedKnrRef.current && selectedKnrRef.current !== knr) {
      const prev = layerRefs.current.get(selectedKnrRef.current);
      if (prev && metric) {
        const prevEntry = k?.kommuner[selectedKnrRef.current];
        const v = prevEntry?.latest[metricCodeRef.current];
        prev.setStyle({
          weight: 0.5,
          color: "white",
          fillColor: colorFor(
            v,
            metric,
            min,
            max,
            prevEntry?.hasEiendomsskatt ?? null
          ),
          fillOpacity: fillOpacityFor(v, metric, prevEntry?.hasEiendomsskatt ?? null),
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

  // Sync hash ↔ selection (deep link pattern, see feedback_hash_deep_linking)
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
      const [geo, k] = await Promise.all([
        fetch("/api/kommuner").then((r) => r.json()),
        fetch("/data/kostnader.json").then((r) => r.json()),
      ]);
      kostnaderRef.current = k;
      geoFeaturesRef.current = (geo.features ?? []).map(
        (f: { properties: { kommunenummer: string; kommunenavn: string } }) => ({
          kommunenummer: f.properties.kommunenummer,
          kommunenavn: f.properties.kommunenavn,
        })
      );
      setGeoData(geo);
      setKostnader(k);
      setLoadedCount(Object.keys(k.kommuner).length);
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
    if (loading || !geoData || !kostnader) return;
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
  }, [loading, geoData, kostnader, highlightKommune]);

  // Re-style all polygons when the metric flips. Same pattern as health-map.
  useEffect(() => {
    metricCodeRef.current = metricCode;
    if (!kostnader) return;
    const metric = kostnader.metrics.find((m) => m.code === metricCode);
    if (!metric) return;
    const values = Object.values(kostnader.kommuner)
      .map((k) => k.latest[metricCode])
      .filter((v): v is number => v != null);
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    for (const [knr, layer] of layerRefs.current.entries()) {
      const entry = kostnader.kommuner[knr];
      const v = entry?.latest[metricCode];
      layer.setStyle({
        fillColor: colorFor(
          v,
          metric,
          min,
          max,
          entry?.hasEiendomsskatt ?? null
        ),
        fillOpacity: fillOpacityFor(v, metric, entry?.hasEiendomsskatt ?? null),
      });
    }
    if (selectedKnrRef.current) {
      layerRefs.current.get(selectedKnrRef.current)?.setStyle({
        weight: 2.5,
        color: "#24374c",
        fillOpacity: 1,
      });
    }
  }, [metricCode, kostnader]);

  const resetKommunePolygon = useCallback(() => {
    const k = kostnaderRef.current;
    const metric = k?.metrics.find((m) => m.code === metricCodeRef.current);
    if (!selectedKnrRef.current || !metric || !k) return;
    const layer = layerRefs.current.get(selectedKnrRef.current);
    if (layer) {
      const values = Object.values(k.kommuner)
        .map((v) => v.latest[metricCodeRef.current])
        .filter((v): v is number => v != null);
      const min = values.length ? Math.min(...values) : 0;
      const max = values.length ? Math.max(...values) : 1;
      const entry = k.kommuner[selectedKnrRef.current];
      const v = entry?.latest[metricCodeRef.current];
      layer.setStyle({
        weight: 0.5,
        color: "white",
        fillColor: colorFor(
          v,
          metric,
          min,
          max,
          entry?.hasEiendomsskatt ?? null
        ),
        fillOpacity: fillOpacityFor(v, metric, entry?.hasEiendomsskatt ?? null),
      });
    }
    selectedKnrRef.current = null;
  }, []);

  const clearSelection = useCallback(() => {
    resetKommunePolygon();
    setSelected(null);
    setCompareMode(false);
    setCompareQuery("");
    setCompareHighlight(-1);
    setCompareTarget(null);
    setShowCompare(false);
    searchBarRef.current?.setQuery("");
  }, [resetKommunePolygon]);

  const handleSearchSelect = useCallback(
    (s: Suggestion) => {
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
    const k = kostnaderRef.current;
    const metric = k?.metrics.find((m) => m.code === metricCodeRef.current);
    if (!k || !metric) {
      return { fillColor: "var(--kv-muted-fill)", weight: 0.5, color: "white", fillOpacity: 0.4 };
    }
    const values = Object.values(k.kommuner)
      .map((v) => v.latest[metricCodeRef.current])
      .filter((v): v is number => v != null);
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    const entry = k.kommuner[nr];
    const v = entry?.latest[metricCodeRef.current];
    return {
      fillColor: colorFor(v, metric, min, max, entry?.hasEiendomsskatt ?? null),
      weight: 0.5,
      color: "white",
      fillOpacity: fillOpacityFor(v, metric, entry?.hasEiendomsskatt ?? null),
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
          l.setStyle(geoStyle(feature));
        }
      },
      click() {
        // In compare mode, a second click picks the B-kommune rather than
        // replacing A. Check compareModeRef, not the captured state, so
        // this stays in sync without re-binding the listener.
        const k = kostnaderRef.current;
        if (
          compareModeRef.current &&
          selectedRef.current &&
          selectedRef.current.knr !== nr &&
          k?.kommuner[nr]?.latest.gebyrerTotal != null
        ) {
          setCompareTarget({ knr: nr, name: navn });
          setShowCompare(true);
          setCompareMode(false);
          setCompareQuery("");
          setCompareHighlight(-1);
          return;
        }
        highlightKommune(nr);
        setSelected({ knr: nr, name: navn });
      },
    });
  };

  const currentMetric = useMemo(
    () => kostnader?.metrics.find((m) => m.code === metricCode),
    [kostnader, metricCode]
  );

  const metricValues = useMemo(() => {
    if (!kostnader) return { min: 0, max: 1 };
    const values = Object.values(kostnader.kommuner)
      .map((k) => k.latest[metricCode])
      .filter((v): v is number => v != null);
    return {
      min: values.length ? Math.min(...values) : 0,
      max: values.length ? Math.max(...values) : 1,
    };
  }, [kostnader, metricCode]);

  // Typeahead results for the inline "Sammenlign med..." input. Exclude the
  // currently-selected kommune and any without gebyr data (so the comparison
  // always has something to show on the primary metric).
  const compareResults = useMemo(() => {
    if (!compareMode || compareQuery.length < 1) return [];
    const q = compareQuery.toLowerCase();
    const k = kostnaderRef.current;
    return geoFeaturesRef.current
      .filter(
        (f) =>
          f.kommunenavn.toLowerCase().includes(q) &&
          f.kommunenummer !== selected?.knr &&
          k?.kommuner[f.kommunenummer]?.latest.gebyrerTotal != null
      )
      .slice(0, 6);
  }, [compareMode, compareQuery, selected?.knr]);

  const selectedEntry = selected && kostnader?.kommuner[selected.knr];
  const selectedMetricValue = selectedEntry
    ? selectedEntry.latest[metricCode]
    : undefined;
  const compactMetricText =
    metricCode === "eiendomsskatt120m2" &&
    selectedEntry &&
    selectedEntry.hasEiendomsskatt === false
      ? "Ingen"
      : currentMetric
        ? formatMetric(selectedMetricValue, currentMetric)
        : "–";

  return (
    <div className="flex flex-col" style={{ height: MAP_HEIGHT }}>
      {/* Search bar + filter sheet */}
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
                    <SheetTitle className="text-left">Velg metrikk</SheetTitle>
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
                          const m = kostnader?.metrics.find((x) => x.code === code);
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
                                {m?.shortLabel ?? code}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <Button className="w-full" onClick={() => setShowFilter(false)}>
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
                ? "Henter kostnadsdata..."
                : `${loadedCount} kommuner · ${currentMetric?.shortLabel} · ${metricCode === "gebyrerTotal" ? `SSB 12842 · ${kostnader?.gebyrerYear}` : `SSB 14674 · ${kostnader?.eiendomsskattYear}`}`}
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
          loadingMessage="Henter kostnadsdata..."
        />
        {error && (
          <MapError message="Kunne ikke laste kostnadsdata." onRetry={loadData} />
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
              <FlyTo lat={flyTarget.lat} lon={flyTarget.lon} zoom={flyTarget.zoom} />
            )}
            <GeoJSON
              key={metricCode}
              data={geoData}
              style={geoStyle}
              onEachFeature={onEachFeature}
            />
          </MapContainer>
        )}

        {/* Compact card */}
        <CompactCard
          visible={!!selected && !showInfoSheet}
          onClose={clearSelection}
        >
          {selected && currentMetric && (
            <>
              <CompactCard.Header
                title={selected.name}
                metric={compactMetricText}
                metricColor={
                  metricCode === "eiendomsskatt120m2" &&
                  selectedEntry &&
                  selectedEntry.hasEiendomsskatt === false
                    ? "var(--kv-positive-dark)"
                    : undefined
                }
              />
              <CompactCard.Context>
                <CompactCard.ContextLeft>
                  <CompactCard.ContextText>
                    {getFylke(selected.knr) ?? "Norge"}
                  </CompactCard.ContextText>
                </CompactCard.ContextLeft>
                <CompactCard.ContextRight>
                  <CompactCard.ContextText>
                    {currentMetric.shortLabel}
                  </CompactCard.ContextText>
                </CompactCard.ContextRight>
              </CompactCard.Context>
              {compareMode ? (
                <CompactCard.Custom>
                  <p className="text-[10px] text-foreground/70 mb-1.5">
                    Velg en kommune å sammenligne med, eller klikk på kartet.
                  </p>
                  <div className="relative">
                    <input
                      autoFocus={typeof window !== "undefined" && window.innerWidth >= 640}
                      value={compareQuery}
                      onChange={(e) => {
                        setCompareQuery(e.target.value);
                        setCompareHighlight(-1);
                      }}
                      onKeyDown={(e) => {
                        if (compareResults.length === 0) return;
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setCompareHighlight((i) =>
                            Math.min(i + 1, compareResults.length - 1)
                          );
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setCompareHighlight((i) => Math.max(i - 1, 0));
                        } else if (e.key === "Enter" && compareHighlight >= 0) {
                          e.preventDefault();
                          const c = compareResults[compareHighlight];
                          setCompareTarget({
                            knr: c.kommunenummer,
                            name: c.kommunenavn,
                          });
                          setShowCompare(true);
                          setCompareMode(false);
                          setCompareQuery("");
                          setCompareHighlight(-1);
                        } else if (e.key === "Escape") {
                          setCompareMode(false);
                          setCompareQuery("");
                          setCompareHighlight(-1);
                        }
                      }}
                      placeholder="Sammenlign med..."
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      enterKeyHint="search"
                      className="w-full bg-muted border rounded-xl px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground text-[16px] sm:text-sm"
                    />
                    {compareResults.length > 0 && (
                      <ul className="absolute top-full mt-1 left-0 right-0 bg-background rounded-xl shadow-xl border overflow-hidden z-50">
                        {compareResults.map((c, i) => (
                          <li key={c.kommunenummer}>
                            <button
                              onMouseDown={() => {
                                setCompareTarget({
                                  knr: c.kommunenummer,
                                  name: c.kommunenavn,
                                });
                                setShowCompare(true);
                                setCompareMode(false);
                                setCompareQuery("");
                                setCompareHighlight(-1);
                              }}
                              className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-b last:border-0 ${compareHighlight === i ? "bg-muted" : "hover:bg-muted"}`}
                            >
                              <p className="font-medium">{c.kommunenavn}</p>
                              <p className="text-[10px] text-foreground/70">
                                {getFylke(c.kommunenummer)}
                              </p>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setCompareMode(false);
                      setCompareQuery("");
                      setCompareHighlight(-1);
                    }}
                    className="mt-2 text-xs text-foreground/70 hover:text-foreground transition-colors"
                  >
                    Avbryt
                  </button>
                </CompactCard.Custom>
              ) : (
                <CompactCard.Actions>
                  <CompactCard.Action
                    primary
                    onClick={() => setShowInfoSheet(true)}
                    icon={<ChevronUp className="h-3.5 w-3.5" />}
                  >
                    Vis mer
                  </CompactCard.Action>
                  <CompactCard.Action
                    onClick={() => setCompareMode(true)}
                    icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
                  >
                    Sammenlign
                  </CompactCard.Action>
                </CompactCard.Actions>
              )}
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
            {selected && kostnader && (
              <DetailSheetBody
                selected={selected}
                kostnader={kostnader}
                topRef={detailSheetTopRef}
              />
            )}
          </SheetContent>
        </Sheet>

        {/* Comparison sheet */}
        <Sheet
          open={showCompare && !!selected && !!compareTarget}
          onOpenChange={(open) => {
            if (!open) {
              setShowCompare(false);
              setCompareTarget(null);
            }
          }}
        >
          <SheetContent
            side="bottom"
            className="rounded-t-2xl max-h-[85svh] overflow-y-auto"
          >
            {selected && compareTarget && kostnader && (
              <CompareSheetBody
                a={selected}
                b={compareTarget}
                kostnader={kostnader}
              />
            )}
          </SheetContent>
        </Sheet>

        {/* Legend + base layer toggle */}
        {!loading && currentMetric && (
          <div className="absolute top-3 right-3 z-[999] flex flex-col gap-2 items-end">
            <div
              className="hidden sm:block bg-card rounded-xl shadow-md px-3 py-2.5"
              style={{ border: "1px solid var(--kv-muted-fill)" }}
            >
              <p className="text-xs font-semibold text-foreground/70 mb-1.5">
                {currentMetric.shortLabel}
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
                  {formatMetric(metricValues.min, currentMetric)}
                </span>
                <span className="text-[10px] text-foreground/70">
                  {formatMetric(metricValues.max, currentMetric)}
                </span>
              </div>
              {metricCode === "eiendomsskatt120m2" && (
                <div className="flex items-center gap-1.5 mt-2 pt-2 border-t">
                  <div
                    className="h-3 w-3 rounded-sm shrink-0"
                    style={{ background: "var(--kv-positive-light)", border: "1px solid var(--kv-positive)" }}
                  />
                  <span className="text-[10px] text-foreground/70">Ingen eiendomsskatt</span>
                </div>
              )}
            </div>
            <button
              onClick={() => setShowBase((b) => !b)}
              className={`flex items-center gap-1.5 rounded-lg border bg-card shadow-md px-3 py-1.5 text-xs font-semibold transition-colors ${showBase ? "text-white" : "text-muted-foreground hover:bg-muted"}`}
              style={showBase ? { background: "var(--kv-blue)" } : {}}
            >
              <MapIcon className="h-3.5 w-3.5" />
              Bakgrunnskart
            </button>
          </div>
        )}
      </div>

      {/* Info modal */}
      <InfoModal
        open={showInfo}
        onClose={() => setShowInfo(false)}
        title="Om kostnader-kartet"
      >
        <p>
          Kartet viser <span className="font-medium text-foreground">hva det koster å bo i hver kommune</span> — de to
          faste utgiftene som varierer mest mellom kommuner: kommunale årsgebyr og eiendomsskatt.
        </p>
        <p>Velg en indikator over kartet for å fargelegge kommunene:</p>
        <ul className="list-disc ml-5 space-y-1.5 text-sm">
          <li>
            <span className="font-medium text-foreground">Kommunale årsgebyr</span> — sum av årsgebyr for vann, avløp, avfall og
            feiing (ekskl. mva.). Fra SSB tabell 12842, {kostnader?.gebyrerYear ?? "2026"}.
          </li>
          <li>
            <span className="font-medium text-foreground">Eiendomsskatt</span> — SSBs standardiserte årlige skatt for en
            enebolig på 120 m². Fra SSB tabell 14674, {kostnader?.eiendomsskattYear ?? "2024"}. Kommuner som ikke har innført
            eiendomsskatt på bolig vises med lys grønn — det regnes som gode nyheter for huseierne.
          </li>
        </ul>
        <p>
          Klikk en kommune for å se et gebyr-sammendrag og lenke til full stedsprofil med boligpriser, skoler og mer.
        </p>
        <a
          href="https://www.ssb.no/statbank/table/12842"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Åpne SSB tabell 12842 (gebyrer)
        </a>
        <a
          href="https://www.ssb.no/statbank/table/14674"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Åpne SSB tabell 14674 (eiendomsskatt)
        </a>
      </InfoModal>
    </div>
  );
}

// Full saturation for live values, positive-pill opacity for "Ingen
// eiendomsskatt", and a dimmed fill for true missing data.
function fillOpacityFor(
  value: number | null | undefined,
  metric: KostnaderMetric,
  hasEiendomsskatt: boolean | null
): number {
  if (metric.code === "eiendomsskatt120m2" && hasEiendomsskatt === false) {
    return 0.75;
  }
  return value != null ? 0.85 : 0.3;
}

// ─── Detail sheet body ──────────────────────────────────────

function DetailSheetBody({
  selected,
  kostnader,
  topRef,
}: {
  selected: Selected;
  kostnader: KostnaderData;
  topRef: React.RefObject<HTMLDivElement | null>;
}) {
  const entry = kostnader.kommuner[selected.knr];
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
          Ingen kostnadsdata i SSB for denne kommunen.
        </p>
      </div>
    );
  }

  const fylke = getFylke(selected.knr);
  const gebyrRank = computeRank(kostnader, "gebyrerTotal", selected.knr, false);
  const eskattRank =
    entry.latest.eiendomsskatt120m2 != null
      ? computeRank(kostnader, "eiendomsskatt120m2", selected.knr, false)
      : null;

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
        {fylke ? `${fylke} · ` : ""}SSB KOSTRA
      </p>

      {/* Primary stats — two cards */}
      <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-3">
        <PrimaryStat
          label="Årsgebyr"
          value={entry.latest.gebyrerTotal}
          valueFormatter={(v) =>
            `${v.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}\u00a0kr`
          }
          rank={gebyrRank}
        />
        {entry.hasEiendomsskatt === false ? (
          <div className="rounded-xl border bg-card px-3 py-2.5">
            <p
              className="text-xl font-extrabold leading-none whitespace-nowrap"
              style={{ color: "var(--kv-positive-dark)" }}
            >
              Ingen
            </p>
            <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
              Eiendomsskatt
            </p>
            <p className="mt-0.5 text-[10px] text-foreground/70">
              Ikke innført
            </p>
          </div>
        ) : (
          <PrimaryStat
            label="Eiendomsskatt"
            value={entry.latest.eiendomsskatt120m2}
            valueFormatter={(v) =>
              `${v.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}\u00a0kr`
            }
            rank={eskattRank ?? undefined}
            fallback={
              entry.latest.eiendomsskattPromille != null
                ? `${entry.latest.eiendomsskattPromille.toLocaleString("nb-NO", { maximumFractionDigits: 1 })}\u00a0‰`
                : undefined
            }
            fallbackLabel="Kun promille rapportert"
          />
        )}
      </div>

      {/* Gebyr breakdown — the four fees that make up the total */}
      {entry.gebyrer && (
        <div className="mt-4 pt-4 border-t">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70 mb-2">
            Fordeling av årsgebyr ({entry.gebyrer.year})
          </p>
          <div className="rounded-2xl border bg-card overflow-hidden">
            <GebyrRow
              icon={Droplet}
              label="Vann"
              value={entry.gebyrer.vann}
              first
            />
            <GebyrRow icon={Droplets} label="Avløp" value={entry.gebyrer.avlop} />
            <GebyrRow icon={Trash2} label="Avfall" value={entry.gebyrer.avfall} />
            <GebyrRow icon={Flame} label="Feiing" value={entry.gebyrer.feiing} />
          </div>
          <p className="mt-2 text-[11px] text-foreground/70">
            Tall i kr/år eksklusiv mva. Totalt for en typisk husholdning.
          </p>
        </div>
      )}

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

      {/* Sources */}
      <div className="mt-4 pt-4 border-t">
        <p className="text-xs text-foreground/70 text-center">
          Kilde:{" "}
          <a
            href="https://www.ssb.no/statbank/table/12842"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            SSB 12842
          </a>
          {" "}({kostnader.gebyrerYear}) og{" "}
          <a
            href="https://www.ssb.no/statbank/table/14674"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            SSB 14674
          </a>
          {" "}({kostnader.eiendomsskattYear})
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
  fallback,
  fallbackLabel,
}: {
  label: string;
  value: number | undefined;
  valueFormatter: (v: number) => string;
  rank?: { rank: number; total: number };
  fallback?: string;
  fallbackLabel?: string;
}) {
  // Lower-is-better: top quartile = green, bottom quartile = red.
  const q = rank && rank.total > 0 ? rank.rank / rank.total : 0.5;
  const color =
    value == null
      ? "var(--kv-muted-fill)"
      : q <= 0.25
        ? "var(--kv-positive)"
        : q >= 0.75
          ? "var(--kv-negative)"
          : "var(--kv-blue)";
  const displayValue =
    value != null ? valueFormatter(value) : fallback ?? "–";
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <p
        className="text-xl font-extrabold tabular-nums leading-none whitespace-nowrap"
        style={{ color: value != null ? color : "var(--kv-blue)" }}
      >
        {displayValue}
      </p>
      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
        {label}
      </p>
      {value != null && rank ? (
        <p className="mt-0.5 text-[10px] text-foreground/70 tabular-nums">
          #{rank.rank}/{rank.total}
        </p>
      ) : value == null && fallbackLabel ? (
        <p className="mt-0.5 text-[10px] text-foreground/70">{fallbackLabel}</p>
      ) : null}
    </div>
  );
}

// ─── Compare sheet body ─────────────────────────────────────
//
// Two-column cost diff. The headline is the *combined* faste kostnader
// (gebyrer + eiendomsskatt) per year — that's the question this sheet
// exists to answer. Below it, side-by-side gebyr and eiendomsskatt
// numbers with percentile bars so the reader can place both kommuner
// relative to the national range. Handles the "Ingen eiendomsskatt"
// case by showing a neutral 0 kr contribution for that side.

function CompareSheetBody({
  a,
  b,
  kostnader,
}: {
  a: Selected;
  b: Selected;
  kostnader: KostnaderData;
}) {
  const entryA = kostnader.kommuner[a.knr];
  const entryB = kostnader.kommuner[b.knr];

  // Combined annual: gebyr total (always present for the set we compare)
  // plus the 120 m² eiendomsskatt (0 if "Ingen"; null if truly unknown).
  function combined(entry: KostnaderKommuneEntry | undefined): number | null {
    if (!entry) return null;
    const g = entry.latest.gebyrerTotal ?? null;
    if (g == null) return null;
    if (entry.hasEiendomsskatt === false) return g;
    const e = entry.latest.eiendomsskatt120m2;
    if (e == null) return null;
    return g + e;
  }

  const totalA = combined(entryA);
  const totalB = combined(entryB);
  const diff = totalA != null && totalB != null ? totalA - totalB : null;

  // Percentile shared across both columns: use all kommuner's combined
  // totals (skipping ones with missing eiendomsskatt data).
  const allCombined = Object.values(kostnader.kommuner)
    .map(combined)
    .filter((v): v is number => v != null);
  const minVal = allCombined.length ? Math.min(...allCombined) : 0;
  const maxVal = allCombined.length ? Math.max(...allCombined) : 1;
  const pct = (v: number | null): number =>
    v == null || maxVal === minVal
      ? 0
      : Math.max(0, Math.min(100, ((v - minVal) / (maxVal - minVal)) * 100));

  function rank(v: number | null): { rank: number; total: number } {
    if (v == null) return { rank: 0, total: allCombined.length };
    const sorted = [...allCombined].sort((x, y) => x - y);
    return { rank: sorted.indexOf(v) + 1, total: sorted.length };
  }

  const rankA = rank(totalA);
  const rankB = rank(totalB);

  const fylkeA = getFylke(a.knr);
  const fylkeB = getFylke(b.knr);

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-6">
      <SheetHeader>
        <SheetTitle className="text-left sr-only">Sammenligning</SheetTitle>
      </SheetHeader>

      <div className="flex items-center gap-1.5 mb-3">
        <ArrowLeftRight className="h-4 w-4" style={{ color: "var(--kv-blue)" }} />
        <p className="text-xs font-semibold text-foreground/70">
          Sammenligning · Faste kostnader per år
        </p>
      </div>

      {/* Kommune name header */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="font-bold text-base leading-snug">{a.name}</p>
          <p className="text-xs text-foreground/70">{fylkeA ?? ""}</p>
        </div>
        <div>
          <p className="font-bold text-base leading-snug">{b.name}</p>
          <p className="text-xs text-foreground/70">{fylkeB ?? ""}</p>
        </div>
      </div>

      {/* Combined total hero */}
      <div className="mt-4 pt-4 border-t">
        <p className="text-xs font-semibold text-foreground/70 mb-2">
          Gebyrer + eiendomsskatt
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span
              className="text-2xl font-extrabold tabular-nums"
              style={{ color: "var(--kv-blue)" }}
            >
              {totalA != null
                ? `${totalA.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}\u00a0kr`
                : "–"}
            </span>
            <p className="text-[10px] text-foreground/70">per år</p>
          </div>
          <div>
            <span
              className="text-2xl font-extrabold tabular-nums"
              style={{ color: "var(--kv-blue)" }}
            >
              {totalB != null
                ? `${totalB.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}\u00a0kr`
                : "–"}
            </span>
            <p className="text-[10px] text-foreground/70">per år</p>
          </div>
        </div>
        {diff != null && diff !== 0 && (
          <div className="mt-2">
            <span
              className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold"
              style={{
                background:
                  diff < 0 ? "var(--kv-positive-light)" : "var(--kv-negative-light)",
                color:
                  diff < 0 ? "var(--kv-positive-dark)" : "var(--kv-negative-dark)",
              }}
            >
              {a.name} er{" "}
              {Math.abs(diff).toLocaleString("nb-NO", { maximumFractionDigits: 0 })}
              {"\u00a0"}kr{" "}
              {diff < 0 ? "billigere" : "dyrere"} enn {b.name}
            </span>
          </div>
        )}
      </div>

      {/* Per-metric side-by-side */}
      <div className="mt-4 pt-4 border-t">
        <p className="text-xs font-semibold text-foreground/70 mb-2">
          Kommunale årsgebyr
        </p>
        <div className="grid grid-cols-2 gap-4">
          <MetricCell
            value={entryA?.latest.gebyrerTotal ?? null}
            unit="kr"
          />
          <MetricCell
            value={entryB?.latest.gebyrerTotal ?? null}
            unit="kr"
          />
        </div>
      </div>

      <div className="mt-4 pt-4 border-t">
        <p className="text-xs font-semibold text-foreground/70 mb-2">
          Eiendomsskatt (enebolig 120 m²)
        </p>
        <div className="grid grid-cols-2 gap-4">
          <EiendomsskattCompareCell entry={entryA} />
          <EiendomsskattCompareCell entry={entryB} />
        </div>
      </div>

      {/* Rank bars — combined total percentile among all kommuner.
          Minimum width of 6 % so bars stay visible even for the cheapest
          kommuner, and a muted striped fill for kommuner with no combined
          total (usually because eiendomsskatt 120 m² is missing). */}
      <div className="mt-4 pt-4 border-t">
        <p className="text-xs font-semibold text-foreground/70 mb-3">
          Plassering blant kommuner (lavere er billigere)
        </p>
        <div className="space-y-3">
          {[
            { name: a.name, value: totalA, rank: rankA },
            { name: b.name, value: totalB, rank: rankB },
          ].map((item) => {
            const p = pct(item.value);
            const hasValue = item.value != null;
            const width = hasValue ? Math.max(6, p) : 100;
            const bg = hasValue
              ? interpolateColor(1 - p / 100)
              : "var(--kv-muted-fill)";
            return (
              <div key={item.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{item.name}</span>
                  {hasValue && item.rank.rank > 0 ? (
                    <span className="text-xs text-foreground/70 tabular-nums">
                      #{item.rank.rank} av {item.rank.total}
                    </span>
                  ) : (
                    <span className="text-xs text-foreground/70">Ingen sum</span>
                  )}
                </div>
                <div
                  className="relative h-2.5 w-full rounded-full overflow-hidden"
                  style={{ background: "var(--kv-muted-fill)", opacity: 0.5 }}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${width}%`,
                      background: bg,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Source */}
      <div className="mt-4 pt-4 border-t">
        <p className="text-xs text-foreground/70 text-center">
          Kilde:{" "}
          <a
            href="https://www.ssb.no/statbank/table/12842"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            SSB 12842
          </a>
          {" "}({kostnader.gebyrerYear}) og{" "}
          <a
            href="https://www.ssb.no/statbank/table/14674"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            SSB 14674
          </a>
          {" "}({kostnader.eiendomsskattYear})
        </p>
        <DataDisclaimer />
      </div>
    </div>
  );
}

function MetricCell({
  value,
  unit,
}: {
  value: number | null;
  unit: "kr" | "‰";
}) {
  return (
    <div>
      <span
        className="text-lg font-extrabold tabular-nums"
        style={{ color: "var(--kv-blue)" }}
      >
        {value != null
          ? `${value.toLocaleString("nb-NO", { maximumFractionDigits: unit === "‰" ? 1 : 0 })}\u00a0${unit}`
          : "–"}
      </span>
    </div>
  );
}

function EiendomsskattCompareCell({
  entry,
}: {
  entry: KostnaderKommuneEntry | undefined;
}) {
  if (!entry) {
    return <MetricCell value={null} unit="kr" />;
  }
  if (entry.hasEiendomsskatt === false) {
    return (
      <div>
        <span
          className="text-lg font-extrabold leading-none"
          style={{ color: "var(--kv-positive-dark)" }}
        >
          Ingen
        </span>
        <p className="text-[10px] text-foreground/70 mt-0.5">Ikke innført</p>
      </div>
    );
  }
  if (entry.latest.eiendomsskatt120m2 != null) {
    return <MetricCell value={entry.latest.eiendomsskatt120m2} unit="kr" />;
  }
  if (entry.latest.eiendomsskattPromille != null) {
    return (
      <div>
        <MetricCell value={entry.latest.eiendomsskattPromille} unit="‰" />
        <p className="text-[10px] text-foreground/70 mt-0.5">
          Kun promille rapportert
        </p>
      </div>
    );
  }
  return <MetricCell value={null} unit="kr" />;
}

// ─── Gebyr breakdown row ────────────────────────────────────

function GebyrRow({
  icon: Icon,
  label,
  value,
  first,
}: {
  icon: typeof Wallet;
  label: string;
  value: number | null;
  first?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-3 text-sm ${first ? "" : "border-t"}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">{label}</span>
      </div>
      <span
        className="tabular-nums font-semibold shrink-0"
        style={{ color: "var(--kv-blue)" }}
      >
        {value != null
          ? `${value.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}\u00a0kr`
          : "–"}
      </span>
    </div>
  );
}
