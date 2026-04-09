"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { X, Info, ChevronUp, Navigation, Home, Building2, Building, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMapSearch, MapSearchBar } from "@/components/map-search";
import { FYLKER } from "@/lib/fylker";
import { FlyTo, DataDisclaimer, MapError, AnimatedCount } from "@/lib/map-utils";
import type { Suggestion } from "@/lib/map-utils";

// ─── Types ──────────────────────────────────────────────────
interface BoligEntry {
  price: number | null;
  count: number | null;
}

type BoligData = Record<string, Record<string, Record<string, BoligEntry>>>;
// { kommunenummer: { boligtype: { year: { price, count } } } }

interface SelectedKommune {
  kommunenummer: string;
  kommunenavn: string;
  lat: number;
  lon: number;
}

const TYPE_LABELS: Record<string, string> = {
  "01": "Eneboliger",
  "02": "Småhus",
  "03": "Blokkleiligheter",
};
const TYPE_ICONS: Record<string, typeof Home> = {
  "01": Home,
  "02": Building2,
  "03": Building,
};
const TYPE_KEYS = ["01", "02", "03"] as const;

const TILE_LAYERS = {
  kart: {
    url: "https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png",
    attribution: '&copy; <a href="https://www.kartverket.no/">Kartverket</a>',
  },
  gråtone: {
    url: "https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png",
    attribution: '&copy; <a href="https://www.kartverket.no/">Kartverket</a>',
  },
};

// ─── Color scale: blue → orange → red ──────────────────────
function priceColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped <= 0.5) {
    const s = clamped * 2;
    const r = Math.round(59 + s * (249 - 59));
    const g = Math.round(130 + s * (115 - 130));
    const b = Math.round(246 + s * (22 - 246));
    return `rgb(${r},${g},${b})`;
  }
  const s = (clamped - 0.5) * 2;
  const r = Math.round(249 + s * (239 - 249));
  const g = Math.round(115 + s * (68 - 115));
  const b = Math.round(22 + s * (68 - 22));
  return `rgb(${r},${g},${b})`;
}

function bubbleSize(count: number | null): number {
  if (!count || count < 50) return 10;
  if (count < 200) return 16;
  if (count < 500) return 22;
  return 28;
}

// ─── Percentile lookup ──────────────────────────────────────
function pricePercentile(price: number, sorted: number[]): number {
  if (sorted.length === 0) return 0.5;
  // Binary search for position
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < price) lo = mid + 1; else hi = mid;
  }
  return sorted.length > 1 ? lo / (sorted.length - 1) : 0.5;
}

// ─── Icon cache ─────────────────────────────────────────────
const iconCache = new Map<string, L.DivIcon>();
function bubbleIcon(price: number | null, count: number | null, sorted: number[], isSelected: boolean): L.DivIcon {
  const size = bubbleSize(count);
  const t = price != null ? pricePercentile(price, sorted) : 0.5;
  // Bucket color to ~20 steps for cache efficiency
  const colorBucket = Math.round(t * 20);
  const key = `${size}-${colorBucket}-${isSelected}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const color = priceColor(t);
  const border = isSelected ? "2.5px solid #24374c" : "1.5px solid rgba(255,255,255,0.6)";
  const shadow = isSelected ? "0 0 0 2px rgba(36,55,76,0.3), 0 2px 6px rgba(0,0,0,0.2)" : "0 1px 4px rgba(0,0,0,0.2)";

  const icon = L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};opacity:0.8;border:${border};box-shadow:${shadow};"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  iconCache.set(key, icon);
  return icon;
}

// ─── Centroid from GeoJSON ──────────────────────────────────
function computeCentroids(geo: { features: Array<{ properties: { kommunenummer: string }; geometry: { type: string; coordinates: number[][][][] | number[][][] } }> }): Map<string, { lat: number; lon: number }> {
  const centroids = new Map<string, { lat: number; lon: number }>();
  for (const f of geo.features) {
    const nr = f.properties?.kommunenummer;
    if (!nr) continue;
    const coords = f.geometry.type === "MultiPolygon"
      ? (f.geometry.coordinates as number[][][][])[0][0]
      : (f.geometry.coordinates as number[][][])[0];
    if (!coords || coords.length === 0) continue;
    let sumLat = 0, sumLon = 0;
    for (const c of coords) { sumLon += c[0]; sumLat += c[1]; }
    centroids.set(nr, { lat: sumLat / coords.length, lon: sumLon / coords.length });
  }
  return centroids;
}

// ─── Stats helpers ──────────────────────────────────────────
function computeRank(data: BoligData, type: string, year: string, kommunenummer: string) {
  const entries: { nr: string; price: number }[] = [];
  for (const [nr, types] of Object.entries(data)) {
    const p = types[type]?.[year]?.price;
    if (p != null && p > 0) entries.push({ nr, price: p });
  }
  entries.sort((a, b) => b.price - a.price);
  const rank = entries.findIndex((e) => e.nr === kommunenummer) + 1;
  const total = entries.length;
  const median = entries[Math.floor(total / 2)]?.price ?? 0;
  return { rank, total, median };
}

function getFylke(kommunenummer: string): string | null {
  const prefix = kommunenummer.slice(0, 2);
  return FYLKER.find((f) => f.fylkesnummer === prefix)?.fylkesnavn ?? null;
}

function fylkeRank(data: BoligData, type: string, year: string, kommunenummer: string) {
  const prefix = kommunenummer.slice(0, 2);
  const entries: { nr: string; price: number }[] = [];
  for (const [nr, types] of Object.entries(data)) {
    if (!nr.startsWith(prefix)) continue;
    const p = types[type]?.[year]?.price;
    if (p != null && p > 0) entries.push({ nr, price: p });
  }
  entries.sort((a, b) => b.price - a.price);
  const rank = entries.findIndex((e) => e.nr === kommunenummer) + 1;
  return { rank, total: entries.length };
}

// ─── Zoom tracker ───────────────────────────────────────────
function ZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => onZoom(map.getZoom());
    map.on("zoomend", handler);
    return () => { map.off("zoomend", handler); };
  }, [map, onZoom]);
  return null;
}

// ═══════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════
export function BoligMap() {
  // Data
  const [boligData, setBoligData] = useState<BoligData>({});
  const [years, setYears] = useState<string[]>([]);
  const [centroids, setCentroids] = useState<Map<string, { lat: number; lon: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [counting, setCounting] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [error, setError] = useState(false);

  // Filters
  const [boligtype, setBoligtype] = useState<string>("01");
  const [year, setYear] = useState<string>("2024");

  // Selection
  const [selected, setSelected] = useState<SelectedKommune | null>(null);
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // Map
  const [tileLayer, setTileLayer] = useState<"kart" | "gråtone">("gråtone");
  const [center, setCenter] = useState<{ lat: number; lon: number; zoom?: number; _t?: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(5);

  // Search
  const geoFeaturesRef = useRef<Array<{ kommunenummer: string; kommunenavn: string }>>([]);
  const setQueryRef = useRef<(q: string) => void>(() => {});

  const handleSearchSelect = useCallback((s: Suggestion) => {
    setSelected(null);
    setShowInfoSheet(false);
    if (s.type === "fylke") {
      setQueryRef.current(s.fylkesnavn);
      setCenter({ lat: s.lat, lon: s.lon, zoom: s.zoom });
    } else if (s.type === "kommune") {
      setQueryRef.current(s.kommunenavn);
      const c = centroids.get(s.kommunenummer);
      if (c) {
        setCenter({ lat: c.lat, lon: c.lon, zoom: 10 });
        setSelected({ kommunenummer: s.kommunenummer, kommunenavn: s.kommunenavn, lat: c.lat, lon: c.lon });
      }
    } else if (s.type === "adresse") {
      const addr = s.addr;
      setQueryRef.current(addr.kommunenavn);
      const match = geoFeaturesRef.current.find((f) => f.kommunenavn.toLowerCase() === addr.kommunenavn.toLowerCase());
      const nr = match?.kommunenummer;
      if (nr) {
        const c = centroids.get(nr);
        if (c) {
          setCenter({ lat: addr.representasjonspunkt.lat, lon: addr.representasjonspunkt.lon, zoom: 11 });
          setSelected({ kommunenummer: nr, kommunenavn: addr.kommunenavn, lat: c.lat, lon: c.lon });
        }
      }
    }
  }, [centroids]);

  const searchProps = useMapSearch({
    kommuneList: geoFeaturesRef.current,
    onSelect: handleSearchSelect,
  });
  setQueryRef.current = searchProps.setQuery;

  // ─── Data loading ───────────────────────────────────────
  const loadData = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const [geoRes, boligRes] = await Promise.all([
        fetch("/api/kommuner").then((r) => r.json()),
        fetch("/api/bolig").then((r) => r.json()),
      ]);

      if (boligRes.error) { setError(true); setLoading(false); return; }

      const cent = computeCentroids(geoRes);
      setCentroids(cent);
      setBoligData(boligRes.data);
      setYears(boligRes.years ?? []);
      geoFeaturesRef.current = (geoRes.features ?? []).map((f: { properties: { kommunenummer: string; kommunenavn: string } }) => ({
        kommunenummer: f.properties.kommunenummer,
        kommunenavn: f.properties.kommunenavn,
      }));

      const count = Object.keys(boligRes.data).length;
      setLoadedCount(count);
      setCounting(true);
      setLoading(false);
      setTimeout(() => setCounting(false), 800);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Derived data ───────────────────────────────────────
  const markers = useMemo(() => {
    const arr: { nr: string; name: string; lat: number; lon: number; price: number | null; count: number | null }[] = [];
    for (const [nr, types] of Object.entries(boligData)) {
      const entry = types[boligtype]?.[year];
      const c = centroids.get(nr);
      if (!c) continue;
      const name = geoFeaturesRef.current.find((f) => f.kommunenummer === nr)?.kommunenavn ?? nr;
      arr.push({ nr, name, lat: c.lat, lon: c.lon, price: entry?.price ?? null, count: entry?.count ?? null });
    }
    return arr;
  }, [boligData, boligtype, year, centroids]);

  // Sort prices for percentile-based coloring (avoids Oslo skewing the entire scale)
  const { minPrice, maxPrice, sortedPrices } = useMemo(() => {
    const prices = markers.map((m) => m.price).filter((p): p is number => p != null && p > 0).sort((a, b) => a - b);
    return {
      minPrice: prices[0] ?? 0,
      maxPrice: prices[prices.length - 1] ?? 1,
      sortedPrices: prices,
    };
  }, [markers]);

  const visibleMarkers = useMemo(() => markers.filter((m) => m.price != null && m.price > 0), [markers]);

  const clearSelection = useCallback(() => {
    setSelected(null);
    setShowInfoSheet(false);
    searchProps.setQuery("");
  }, [searchProps]);

  // ─── Card data helpers ──────────────────────────────────
  const getPrice = (nr: string, type: string, yr: string) => boligData[nr]?.[type]?.[yr]?.price ?? null;
  const getCount = (nr: string, type: string, yr: string) => boligData[nr]?.[type]?.[yr]?.count ?? null;

  const selectedPrice = selected ? getPrice(selected.kommunenummer, boligtype, year) : null;
  const selectedCount = selected ? getCount(selected.kommunenummer, boligtype, year) : null;

  // Year-over-year change
  const prevYear = year ? String(parseInt(year) - 1) : null;
  const prevPrice = selected && prevYear ? getPrice(selected.kommunenummer, boligtype, prevYear) : null;
  const yoyChange = selectedPrice && prevPrice ? ((selectedPrice - prevPrice) / prevPrice) * 100 : null;

  return (
    <div className="flex flex-col" style={{ height: "calc(100svh - 57px - 56px)" }}>
      {/* Search bar + filters */}
      <div className="relative z-[1000] px-4 py-3 md:px-8 shrink-0 bg-background border-b">
        <div className="max-w-xl mx-auto">
          <MapSearchBar search={searchProps} placeholder="Søk etter kommune eller adresse..." />

          {/* Filter row */}
          <div className="flex items-center gap-3 mt-2">
            <div className="flex rounded-lg border overflow-hidden">
              {TYPE_KEYS.map((t) => {
                const Icon = TYPE_ICONS[t];
                return (
                  <button
                    key={t}
                    onClick={() => setBoligtype(t)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${boligtype === t ? "text-white" : "text-muted-foreground hover:bg-muted"}`}
                    style={boligtype === t ? { background: "var(--kv-blue)" } : {}}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{TYPE_LABELS[t]}</span>
                  </button>
                );
              })}
            </div>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="rounded-lg border px-3 py-1.5 text-xs font-semibold bg-background text-foreground"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              onClick={() => setShowInfo(true)}
              className="ml-auto inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <Info className="h-3 w-3" /> Om
            </button>
          </div>

          {/* Stats summary */}
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-muted-foreground">
              {loading
                ? "Henter boligpriser..."
                : `${visibleMarkers.length} kommuner med data · ${TYPE_LABELS[boligtype]} · ${year} · Kilde: SSB`}
            </p>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="relative grow">
        {(loading || counting) && (
          <div className="absolute inset-0 z-[1000] bg-background flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center px-6">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--kv-blue)" }} />
              {counting ? (
                <>
                  <p className="text-2xl font-extrabold tabular-nums" style={{ color: "var(--kv-blue)" }}>
                    <AnimatedCount target={loadedCount} duration={700} />
                  </p>
                  <p className="text-sm text-muted-foreground">kommuner lastet</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Henter boligpriser...</p>
              )}
            </div>
          </div>
        )}
        {error && <MapError message="Kunne ikke hente boligpriser." onRetry={loadData} />}

        <MapContainer center={[65, 14]} zoom={5} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            key={tileLayer}
            url={TILE_LAYERS[tileLayer].url}
            attribution={TILE_LAYERS[tileLayer].attribution}
            maxZoom={17}
          />
          {center && <FlyTo lat={center.lat} lon={center.lon} zoom={center.zoom} _t={center._t} />}
          <ZoomTracker onZoom={setZoomLevel} />

          <MarkerClusterGroup
            key={`${boligtype}-${year}`}
            chunkedLoading
            maxClusterRadius={50}
            spiderfyOnMaxZoom
            showCoverageOnHover={false}
            iconCreateFunction={(cluster: { getChildCount: () => number; getAllChildMarkers: () => Array<{ options: Record<string, unknown> }> }) => {
              const children = cluster.getAllChildMarkers();
              const count = cluster.getChildCount();
              const size = count < 10 ? 36 : count < 30 ? 44 : 52;
              // Average price of contained markers
              let priceSum = 0, priceCount = 0;
              for (const m of children) {
                const p = (m.options as { price?: number }).price;
                if (p && p > 0) { priceSum += p; priceCount++; }
              }
              const avgPrice = priceCount > 0 ? Math.round(priceSum / priceCount) : 0;
              const t = pricePercentile(avgPrice, sortedPrices);
              const color = priceColor(t);

              return L.divIcon({
                className: "",
                html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:${size < 40 ? 10 : 11}px;border:2.5px solid rgba(255,255,255,0.7);box-shadow:0 2px 6px rgba(0,0,0,0.25);text-shadow:0 1px 2px rgba(0,0,0,0.3);">${count}</div>`,
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2],
              });
            }}
          >
            {visibleMarkers.map((m) => (
              <Marker
                key={m.nr}
                position={[m.lat, m.lon]}
                icon={bubbleIcon(m.price, m.count, sortedPrices, selected?.kommunenummer === m.nr)}
                eventHandlers={{
                  click() {
                    setSelected((prev) => prev?.kommunenummer === m.nr ? null : { kommunenummer: m.nr, kommunenavn: m.name, lat: m.lat, lon: m.lon });
                    setShowInfoSheet(false);
                  },
                }}
                {...{ price: m.price } as Record<string, unknown>}
              />
            ))}
          </MarkerClusterGroup>
        </MapContainer>

        {/* Tile layer toggle */}
        <div className="absolute top-3 right-3 z-[999] flex flex-col gap-2 items-end">
          <div className="flex rounded-lg border bg-card shadow-md overflow-hidden">
            {(["kart", "gråtone"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTileLayer(t)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${tileLayer === t ? "text-white" : "text-muted-foreground hover:bg-muted"}`}
                style={tileLayer === t ? { background: "var(--kv-blue)" } : {}}
              >
                {t === "kart" ? "Kart" : "Gråtone"}
              </button>
            ))}
          </div>

          {/* Legend */}
          {!loading && visibleMarkers.length > 0 && (
            <div className="bg-card rounded-xl shadow-md px-3 py-2.5" style={{ border: "1px solid var(--border)" }}>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">kr/m² ({TYPE_LABELS[boligtype]})</p>
              <div className="h-3 w-24 rounded-sm" style={{ background: "linear-gradient(to right, #3b82f6, #f97316, #ef4444)" }} />
              <div className="flex justify-between mt-0.5">
                <span className="text-[10px] text-muted-foreground">{minPrice.toLocaleString("nb-NO")}</span>
                <span className="text-[10px] text-muted-foreground">{maxPrice.toLocaleString("nb-NO")}</span>
              </div>
            </div>
          )}
        </div>

        {/* Compact card */}
        {selected && !showInfoSheet && (
          <div
            className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-96 z-[999] bg-card rounded-2xl shadow-xl px-4 py-4"
            style={{ border: "1.5px solid var(--border)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground">
                    {(() => { const Icon = TYPE_ICONS[boligtype]; return <Icon className="h-3 w-3" />; })()}
                    {TYPE_LABELS[boligtype]}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{year}</span>
                </div>
                <p className="font-bold text-base leading-snug">{selected.kommunenavn}</p>
                <p className="text-xs text-muted-foreground">{getFylke(selected.kommunenummer)}</p>
              </div>
              <button
                onClick={clearSelection}
                className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Lukk"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {selectedPrice != null ? (
              <div className="mt-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold" style={{ color: "var(--kv-blue)" }}>
                    {selectedPrice.toLocaleString("nb-NO")}
                  </span>
                  <span className="text-sm text-muted-foreground">kr/m²</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {selectedCount != null && (
                    <span className="text-xs text-muted-foreground">{selectedCount.toLocaleString("nb-NO")} salg</span>
                  )}
                  {yoyChange != null && (
                    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${yoyChange >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                      {yoyChange >= 0 ? "+" : ""}{yoyChange.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">Ingen prisdata for {TYPE_LABELS[boligtype].toLowerCase()} i {year}</p>
            )}

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setShowInfoSheet(true)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border bg-muted/50 hover:bg-muted transition-colors"
              >
                <ChevronUp className="h-3.5 w-3.5" /> Vis mer
              </button>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border bg-muted/50 hover:bg-muted transition-colors"
              >
                <Navigation className="h-3.5 w-3.5" /> Kjør hit
              </a>
            </div>
          </div>
        )}

        {/* Detail sheet */}
        <Sheet open={showInfoSheet && !!selected} onOpenChange={(open) => { setShowInfoSheet(open); }}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[85svh] overflow-y-auto">
            {selected && (() => {
              const nr = selected.kommunenummer;
              const fylke = getFylke(nr);
              const price = getPrice(nr, boligtype, year);
              const count = getCount(nr, boligtype, year);
              const { rank, total, median } = computeRank(boligData, boligtype, year, nr);
              const fRank = fylkeRank(boligData, boligtype, year, nr);
              const percentile = total > 0 ? Math.round(((total - rank) / total) * 100) : 0;

              // Bar chart: all years for selected type
              const sparkValues = years.map((y) => getPrice(nr, boligtype, y));

              return (
                <div className="mx-auto w-full max-w-md px-4 pb-6">
                  <SheetHeader>
                    <SheetTitle className="text-left sr-only">{selected.kommunenavn}</SheetTitle>
                  </SheetHeader>

                  {/* Identity */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground">
                      {(() => { const Icon = TYPE_ICONS[boligtype]; return <Icon className="h-3 w-3" />; })()}
                      {TYPE_LABELS[boligtype]}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{year}</span>
                  </div>
                  <p className="font-bold text-lg leading-snug">{selected.kommunenavn}</p>
                  {fylke && <p className="text-sm text-muted-foreground">{fylke}</p>}

                  {/* Hero metric */}
                  <div className="mt-4 pt-4 border-t">
                    {price != null ? (
                      <>
                        <div className="flex items-baseline gap-2">
                          <span className="text-3xl font-extrabold" style={{ color: "var(--kv-blue)" }}>
                            {price.toLocaleString("nb-NO")}
                          </span>
                          <span className="text-sm font-medium text-muted-foreground">kr/m²</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {count != null && (
                            <span className="text-xs text-muted-foreground">{count.toLocaleString("nb-NO")} salg i {year}</span>
                          )}
                          {yoyChange != null && (
                            <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${yoyChange >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                              {yoyChange >= 0 ? "+" : ""}{yoyChange.toFixed(1)}% fra {prevYear}
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Ingen prisdata for {TYPE_LABELS[boligtype].toLowerCase()}</p>
                    )}
                  </div>

                  {/* All dwelling types comparison */}
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Alle boligtyper i {selected.kommunenavn}</p>
                    <div className="space-y-2">
                      {TYPE_KEYS.map((t) => {
                        const p = getPrice(nr, t, year);
                        const c = getCount(nr, t, year);
                        const Icon = TYPE_ICONS[t];
                        const isActive = t === boligtype;
                        return (
                          <button
                            key={t}
                            onClick={() => setBoligtype(t)}
                            className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${isActive ? "bg-muted ring-1 ring-border" : "hover:bg-muted/50"}`}
                          >
                            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{TYPE_LABELS[t]}</p>
                              {p != null ? (
                                <p className="text-xs text-muted-foreground">{c?.toLocaleString("nb-NO") ?? "–"} salg</p>
                              ) : (
                                <p className="text-xs text-muted-foreground">Ingen data</p>
                              )}
                            </div>
                            <span className="text-sm font-bold tabular-nums" style={{ color: p ? "var(--kv-blue)" : undefined }}>
                              {p != null ? `${p.toLocaleString("nb-NO")} kr/m²` : "–"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Price trend bar chart */}
                  {sparkValues.some((v) => v != null) && (() => {
                    const maxVal = Math.max(...sparkValues.filter((v): v is number => v != null));
                    const first = sparkValues.find((v) => v != null);
                    const last = [...sparkValues].reverse().find((v) => v != null);
                    const totalChange = first && last ? ((last - first) / first) * 100 : null;
                    return (
                      <div className="mt-4 pt-4 border-t">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-muted-foreground">Prisutvikling ({years[0]}–{years[years.length - 1]})</p>
                          {totalChange != null && (
                            <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${totalChange >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                              {totalChange >= 0 ? "+" : ""}{totalChange.toFixed(0)}%
                            </span>
                          )}
                        </div>
                        <div className="flex items-end gap-[2px] h-12">
                          {sparkValues.map((v, i) => (
                            <div
                              key={years[i]}
                              className="flex-1 rounded-sm min-w-[2px] transition-all"
                              style={{
                                height: v != null ? `${Math.max(4, (v / maxVal) * 100)}%` : "0%",
                                background: "var(--kv-blue)",
                                opacity: years[i] === year ? 1 : 0.3,
                              }}
                              title={v != null ? `${years[i]}: ${v.toLocaleString("nb-NO")} kr/m²` : `${years[i]}: Ingen data`}
                            />
                          ))}
                        </div>
                        <div className="flex justify-between mt-0.5">
                          <span className="text-[10px] text-muted-foreground">{years[0]}</span>
                          <span className="text-[10px] text-muted-foreground">{years[years.length - 1]}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Rankings */}
                  {rank > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Rangering</p>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Nasjonalt</span>
                          <span className="text-xs font-semibold">#{rank} av {total} kommuner</span>
                        </div>
                        {price != null && median > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">vs. medianen</span>
                            <span className={`text-xs font-semibold ${price >= median ? "text-green-600" : "text-red-500"}`}>
                              {price >= median ? "+" : ""}{(((price - median) / median) * 100).toFixed(1)}%
                            </span>
                          </div>
                        )}
                        {fylke && fRank.total > 1 && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{fylke}</span>
                            <span className="text-xs font-semibold">#{fRank.rank} av {fRank.total}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Dyrere enn</span>
                          <span className="text-xs font-semibold">{percentile}% av kommuner</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Source */}
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-muted-foreground text-center">
                      Kilde: <a href="https://www.ssb.no/statbank/table/06035/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">SSB Tabell 06035</a>, {year}
                    </p>
                    <DataDisclaimer />
                  </div>
                </div>
              );
            })()}
          </SheetContent>
        </Sheet>

        {/* Info modal */}
        {showInfo && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 px-4" onClick={() => setShowInfo(false)}>
            <div className="bg-background rounded-2xl shadow-xl border w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-base">Om boligpriskartet</h2>
                <button onClick={() => setShowInfo(false)} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Kartet viser gjennomsnittlig <strong>kvadratmeterpris</strong> for selveierboliger i alle norske kommuner.
                  Data kommer fra SSB (Statistisk sentralbyrå), tabell 06035.
                </p>
                <p>
                  <strong>Farge</strong> viser prisnivå (blå = rimelig, rød = dyrt). <strong>Størrelse</strong> viser markedsaktivitet (antall salg).
                </p>
                <p>
                  Velg mellom eneboliger, småhus og blokkleiligheter, og se hvordan prisene har utviklet seg over tid.
                </p>
              </div>
              <p className="text-xs text-muted-foreground mt-4 pt-3 border-t">
                Kilde: <a href="https://www.ssb.no/statbank/table/06035/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">SSB Tabell 06035</a>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
