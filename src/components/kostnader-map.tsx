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
import {
  Info,
  Map as MapIcon,
  ChevronUp,
  ArrowLeftRight,
  ExternalLink,
  Wallet,
  Receipt,
  SlidersHorizontal,
  Check,
} from "lucide-react";
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
  MapError,
  interpolateColor,
  MAP_HEIGHT,
  TILE_URL_GRAATONE,
  KV_ATTRIBUTION,
  useMapCore,
  useCompare,
} from "@/lib/map-utils";
import { CompactCard } from "@/components/compact-card";
import { InfoModal } from "@/components/info-modal";
import { MapLoading } from "@/components/map-loading";
import type { Suggestion } from "@/lib/map-utils";
import type {
  KostnaderMetric,
  KostnaderData,
  Selected,
} from "@/components/kostnader-map-helpers";
import { getFylke, formatMetric } from "@/components/kostnader-map-helpers";
import { DetailSheetBody, CompareSheetBody } from "@/components/kostnader-detail-sheets";

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

// ─── Component ──────────────────────────────────────────────

export function KostnaderMap() {
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const [kostnader, setKostnader] = useState<KostnaderData | null>(null);
  const { loading, setLoading, error, setError } = useMapCore();
  const [counting, setCounting] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);

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

  const kostnaderRef = useRef<KostnaderData | null>(null);
  const metricCodeRef = useRef(metricCode);
  const detailSheetTopRef = useRef<HTMLDivElement>(null);
  const geoFeaturesRef = useRef<
    Array<{ properties: { kommunenummer: string; navn: string } }>
  >([]);

  // Comparison state machine
  const getSelectedId = useCallback((s: Selected) => s.knr, []);
  const hasKostnaderData = useCallback(
    (knr: string) => kostnaderRef.current?.kommuner[knr]?.latest.gebyrerTotal != null,
    [],
  );
  const {
    compareMode, compareQuery, setCompareQuery, compareHighlight, setCompareHighlight,
    compareTarget, showCompare, compareResults,
    activateCompare, selectTarget, cancelCompare, resetCompare, closeCompareSheet,
    handleCompareClick,
  } = useCompare<Selected>(selected, getSelectedId, useCallback(() => geoFeaturesRef.current ?? [], []), hasKostnaderData);

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
          properties: { kommunenummer: f.properties.kommunenummer, navn: f.properties.kommunenavn },
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
    const feature = geoFeaturesRef.current.find((f) => f.properties.kommunenummer === nr);
    if (!feature) return;
    highlightKommune(nr);
    setSelected({ knr: nr, name: feature.properties.navn });
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
    resetCompare();
    searchBarRef.current?.setQuery("");
  }, [resetKommunePolygon, resetCompare]);

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
        if (handleCompareClick(nr, () => ({ knr: nr, name: navn }))) return;
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
            kommuneList={() => geoFeaturesRef.current.map((f) => ({ kommunenummer: f.properties.kommunenummer, kommunenavn: f.properties.navn }))}
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
                url={TILE_URL_GRAATONE}
                attribution={KV_ATTRIBUTION}
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
                          selectTarget({
                            knr: c.properties.kommunenummer,
                            name: c.properties.navn,
                          });
                        } else if (e.key === "Escape") {
                          cancelCompare();
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
                          <li key={c.properties.kommunenummer}>
                            <button
                              onMouseDown={() => {
                                selectTarget({
                                  knr: c.properties.kommunenummer,
                                  name: c.properties.navn,
                                });
                              }}
                              className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-b last:border-0 ${compareHighlight === i ? "bg-muted" : "hover:bg-muted"}`}
                            >
                              <p className="font-medium">{c.properties.navn}</p>
                              <p className="text-[10px] text-foreground/70">
                                {getFylke(c.properties.kommunenummer)}
                              </p>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button
                    onClick={cancelCompare}
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
                    onClick={activateCompare}
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
            if (!open) closeCompareSheet();
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
