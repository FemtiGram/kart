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
import {
  Info,
  Map as MapIcon,
  ChevronUp,
  HeartPulse,
  ExternalLink,
  Phone,
  Gauge,
  UserX,
  Users,
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
} from "@/lib/map-utils";
import { CompactCard } from "@/components/compact-card";
import { InfoModal } from "@/components/info-modal";
import { MapLoading } from "@/components/map-loading";
import { healthIcon, HEALTH_COLOR, type HealthType } from "@/components/map-icons";
import type { Suggestion } from "@/lib/map-utils";
import { DetailSheetBody } from "@/components/health-detail-sheet";
import {
  formatMetric,
  getFylke,
  METRIC_SHORT_LABEL,
  type FastlegeMetric,
  type FastlegeData,
  type HealthEntity,
  type OsmHealthData,
  type Selected,
} from "@/components/health-map-helpers";

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

const METRIC_ICON: Record<string, typeof Gauge> = {
  KOSreservekapasi0000: Gauge,
  KOSandelpasiente0000: UserX,
  KOSgjsnlisteleng0000: Users,
};

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

// ─── Component ──────────────────────────────────────────────

export function HealthMap() {
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const [fastlege, setFastlege] = useState<FastlegeData | null>(null);
  const [osm, setOsm] = useState<OsmHealthData | null>(null);
  const { loading, setLoading, error, setError } = useMapCore();
  const [counting, setCounting] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);

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
                url={TILE_URL_GRAATONE}
                attribution={KV_ATTRIBUTION}
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


