"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Polygon, Marker, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import {
  Loader2,
  X,
  Search,
  MapPin,
  Info,
  Map as MapIcon,
  Layers,
  ChevronUp,
  Navigation,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FYLKER } from "@/lib/fylker";
import { FlyTo, DataDisclaimer, MapError, useDebounceRef, useSearchAbort } from "@/lib/map-utils";
import type { Suggestion } from "@/lib/map-utils";

interface Reservoir {
  id: number;
  name: string;
  plantName: string | null;
  river: string | null;
  hrv: number | null;
  lrv: number | null;
  volumeMm3: number | null;
  areaKm2: number | null;
  yearBuilt: number | null;
  purpose: string | null;
  polygon: [number, number][][];
  center: { lat: number; lon: number };
}

const TILE_LAYERS = {
  kart: {
    label: "Kart",
    url: "https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png",
    attribution: '&copy; <a href="https://www.kartverket.no/">Kartverket</a>',
  },
  gråtone: {
    label: "Gråtone",
    url: "https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png",
    attribution: '&copy; <a href="https://www.kartverket.no/">Kartverket</a>',
  },
} as const;

type TileLayerKey = keyof typeof TILE_LAYERS;

const RESERVOIR_COLOR = "#0891b2";

const reservoirIconCache = new Map<string, L.DivIcon>();
function reservoirIcon(isSelected: boolean, inverted: boolean): L.DivIcon {
  const key = `${isSelected}-${inverted}`;
  const cached = reservoirIconCache.get(key);
  if (cached) return cached;
  const size = 24;
  const bg = inverted ? (isSelected ? "#24374c" : RESERVOIR_COLOR) : "white";
  const iconColor = inverted ? "white" : (isSelected ? "#24374c" : RESERVOIR_COLOR);
  const border = isSelected ? "#24374c" : inverted ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.15)";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>`;
  const icon = L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;line-height:0;background:${bg};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.25);border:2.5px solid ${border}">${svg}</div>`,
  });
  reservoirIconCache.set(key, icon);
  return icon;
}

function fillColor(hrv: number | null, lrv: number | null): string {
  if (hrv == null || lrv == null) return RESERVOIR_COLOR;
  const range = hrv - lrv;
  if (range > 30) return "#0369a1";
  if (range > 10) return "#0891b2";
  return "#22d3ee";
}

function AnimatedCount({ target, duration = 600 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) return;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setCount(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return <>{count.toLocaleString("nb-NO")}</>;
}

function ZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => onZoom(map.getZoom());
    map.on("zoomend", handler);
    return () => { map.off("zoomend", handler); };
  }, [map, onZoom]);
  return null;
}

function PanToSelected({ reservoir }: { reservoir: Reservoir | null }) {
  const map = useMap();
  useEffect(() => {
    if (!reservoir) return;
    map.flyTo([reservoir.center.lat, reservoir.center.lon], 12, { duration: 1.2 });
  }, [reservoir, map]);
  return null;
}

export function ReservoirMap() {
  const [reservoirs, setReservoirs] = useState<Reservoir[]>([]);
  const [loading, setLoading] = useState(true);
  const [counting, setCounting] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [error, setError] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [selected, setSelected] = useState<Reservoir | null>(null);
  const [nationalFill, setNationalFill] = useState<{ fyllingsgrad: number; kapasitet_TWh: number; fylling_TWh: number; iso_uke: number; endring: number } | null>(null);
  const [center, setCenter] = useState<{ lat: number; lon: number; zoom?: number; _t?: number } | null>(null);
  const [tileLayer, setTileLayer] = useState<TileLayerKey>("gråtone");
  const [zoomLevel, setZoomLevel] = useState(5);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounceRef = useDebounceRef();
  const searchAbort = useSearchAbort();

  const loadReservoirs = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const res = await fetch("/api/reservoirs");
      const data = await res.json();
      if (data.error || !data.reservoirs) {
        setError(true);
        setLoading(false);
        return;
      }
      setReservoirs(data.reservoirs);
      setNationalFill(data.nationalFill ?? null);
      setLoadedCount(data.reservoirs.length);
      setCounting(true);
      setLoading(false);
      setTimeout(() => setCounting(false), 800);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReservoirs(); }, [loadReservoirs]);

  // Search
  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return; }
    setLoadingSuggestions(true);

    const fylkeMatches: Suggestion[] = FYLKER
      .filter((f) => f.fylkesnavn.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 3)
      .map((f) => ({ type: "fylke", fylkesnavn: f.fylkesnavn, lat: f.lat, lon: f.lon, zoom: f.zoom }));

    // Search reservoir names locally
    const reservoirMatches = reservoirs
      .filter((r) => r.name.toLowerCase().includes(q.toLowerCase()) || (r.plantName?.toLowerCase().includes(q.toLowerCase())))
      .slice(0, 5);

    let adresseMatches: Suggestion[] = [];
    try {
      const signal = searchAbort.renew();
      const res = await fetch(`https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(q)}&treffPerSide=2&utkoordsys=4326`, { signal });
      const data = await res.json();
      adresseMatches = (data.adresser ?? []).map((a: { adressetekst: string; poststed: string; kommunenavn: string; representasjonspunkt: { lat: number; lon: number } }) => ({ type: "adresse" as const, addr: a }));
    } catch { /* aborted or network error */ }

    // Convert reservoir matches to suggestion-like entries using fylke type
    const resSuggestions: Suggestion[] = reservoirMatches.map((r) => ({
      type: "fylke" as const,
      fylkesnavn: `${r.name} (magasin)`,
      lat: r.center.lat,
      lon: r.center.lon,
      zoom: 13,
    }));

    setSuggestions([...fylkeMatches, ...resSuggestions, ...adresseMatches]);
    setShowDropdown(true);
    setLoadingSuggestions(false);
  }, [reservoirs, searchAbort]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setHighlightedIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[highlightedIndex]);
      setHighlightedIndex(-1);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }
  };

  const handleSelect = (s: Suggestion) => {
    setShowDropdown(false);
    setSuggestions([]);
    if (s.type === "fylke") {
      setQuery(s.fylkesnavn);
      setCenter({ lat: s.lat, lon: s.lon, zoom: s.zoom, _t: Date.now() });
    } else if (s.type === "adresse") {
      setQuery(`${s.addr.adressetekst}, ${s.addr.poststed}`);
      setCenter({ lat: s.addr.representasjonspunkt.lat, lon: s.addr.representasjonspunkt.lon, _t: Date.now() });
    }
  };

  const stats = useMemo(() => {
    const total = reservoirs.length;
    const withVolume = reservoirs.filter((r) => r.volumeMm3 != null);
    const totalVolume = withVolume.reduce((s, r) => s + (r.volumeMm3 ?? 0), 0);
    return { total, totalVolume: Math.round(totalVolume) };
  }, [reservoirs]);

  return (
    <div className="flex flex-col" style={{ height: "calc(100svh - 57px)" }}>
      {/* Search bar */}
      <div className="relative z-[1000] px-4 py-4 md:px-8 shrink-0 bg-background border-b">
        <div className="max-w-xl mx-auto relative flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 bg-background border rounded-xl px-4 py-3">
              {loadingSuggestions ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <input
                value={query}
                onChange={handleInput}
                onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                onKeyDown={handleKeyDown}
                placeholder="Søk etter magasin eller sted..."
                className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground text-[16px] sm:text-sm"
              />
            </div>
          </div>

          {showDropdown && suggestions.length > 0 && (
            <ul className="absolute top-full mt-1 left-0 right-0 bg-background rounded-xl shadow-xl border overflow-hidden">
              {suggestions.map((s, i) => (
                <li key={i}>
                  <button
                    onMouseDown={() => handleSelect(s)}
                    className={`w-full text-left px-4 py-3 text-sm flex items-start gap-3 transition-colors border-b last:border-0 ${highlightedIndex === i ? "bg-muted" : "hover:bg-muted"}`}
                  >
                    <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    {s.type === "fylke" ? (
                      <div>
                        <p className="font-medium">{s.fylkesnavn}</p>
                        <p className="text-xs text-muted-foreground">{s.fylkesnavn.includes("magasin") ? "Magasin" : "Fylke"}</p>
                      </div>
                    ) : s.type === "adresse" ? (
                      <div>
                        <p className="font-medium">{s.addr.adressetekst}</p>
                        <p className="text-xs text-muted-foreground">{s.addr.poststed}, {s.addr.kommunenavn}</p>
                      </div>
                    ) : s.type === "kommune" ? (
                      <div>
                        <p className="font-medium">{s.kommunenavn}</p>
                        <p className="text-xs text-muted-foreground">Kommune</p>
                      </div>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-2 max-w-xl mx-auto">
          {loading ? "Henter magasindata..." : `${stats.total} magasiner${stats.totalVolume > 0 ? ` · ${stats.totalVolume.toLocaleString("nb-NO")} Mm³ total kapasitet` : ""} · Kilde: NVE`}
        </p>
      </div>

      {/* Map */}
      <div className="relative grow">
        {(loading || counting) && (
          <div className="absolute inset-0 z-[1000] bg-background flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center px-6">
              <Loader2
                className="h-8 w-8 animate-spin"
                style={{ color: "var(--kv-blue)" }}
              />
              {counting ? (
                <>
                  <p className="text-2xl font-extrabold tabular-nums" style={{ color: "var(--kv-blue)" }}>
                    <AnimatedCount target={loadedCount} duration={700} />
                  </p>
                  <p className="text-sm text-muted-foreground">
                    datapunkter lastet
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Henter magasindata...</p>
              )}
            </div>
          </div>
        )}
        {error && <MapError message="Kunne ikke hente magasindata." onRetry={loadReservoirs} />}

        <MapContainer center={[65, 14]} zoom={5} style={{ height: "100%", width: "100%" }}>
          {center && <FlyTo lat={center.lat} lon={center.lon} zoom={center.zoom} _t={center._t} />}
          <PanToSelected reservoir={selected} />
          <ZoomTracker onZoom={setZoomLevel} />
          <TileLayer
            key={tileLayer}
            url={TILE_LAYERS[tileLayer].url}
            attribution={TILE_LAYERS[tileLayer].attribution}
            maxZoom={17}
          />
          {/* Point markers with clustering at low zoom */}
          {zoomLevel < 10 && (
            <MarkerClusterGroup
              chunkedLoading
              maxClusterRadius={60}
              spiderfyOnMaxZoom
              showCoverageOnHover={false}
              iconCreateFunction={(cluster: { getChildCount: () => number }) => {
                const count = cluster.getChildCount();
                let size = 36;
                let fontSize = 13;
                if (count >= 50) { size = 44; fontSize = 14; }
                if (count >= 200) { size = 52; fontSize = 15; }
                return L.divIcon({
                  html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${RESERVOIR_COLOR};color:white;border-radius:50%;font-weight:700;font-size:${fontSize}px;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid rgba(255,255,255,0.6)">${count}</div>`,
                  className: "",
                  iconSize: [size, size],
                  iconAnchor: [size / 2, size / 2],
                });
              }}
            >
              {reservoirs.map((r) => (
                <Marker
                  key={r.id}
                  position={[r.center.lat, r.center.lon]}
                  icon={reservoirIcon(selected?.id === r.id, tileLayer === "gråtone")}
                  eventHandlers={{
                    click() {
                      setSelected((prev) => (prev?.id === r.id ? null : r));
                      setShowInfoSheet(false);
                    },
                  }}
                />
              ))}
            </MarkerClusterGroup>
          )}
          {/* Polygon overlays at high zoom */}
          {zoomLevel >= 10 && reservoirs.map((r) => (
            <Polygon
              key={r.id}
              positions={r.polygon}
              pathOptions={{
                fillColor: fillColor(r.hrv, r.lrv),
                fillOpacity: selected?.id === r.id ? 0.8 : 0.5,
                color: selected?.id === r.id ? "#24374c" : "#0369a1",
                weight: selected?.id === r.id ? 2.5 : 1,
              }}
              eventHandlers={{
                click() {
                  setSelected((prev) => (prev?.id === r.id ? null : r));
                  setShowInfoSheet(false);
                },
              }}
            />
          ))}
        </MapContainer>

        {/* Tile layer toggle */}
        <div className="absolute top-3 right-3 z-[999] flex rounded-lg border bg-card shadow-md overflow-hidden">
          {(["kart", "gråtone"] as TileLayerKey[]).map((key, i) => (
            <button
              key={key}
              onClick={() => setTileLayer(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${i > 0 ? "border-l" : ""} ${tileLayer === key ? "text-white" : "text-muted-foreground hover:bg-muted"}`}
              style={tileLayer === key ? { background: "var(--kv-blue)" } : {}}
            >
              {key === "kart" ? <MapIcon className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}
              {TILE_LAYERS[key].label}
            </button>
          ))}
        </div>

        {/* Floating info button */}
        <button
          onClick={() => setShowInfo(true)}
          className="absolute top-3 left-3 z-[999] flex items-center justify-center h-8 w-8 rounded-full bg-card border shadow-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Om magasindata"
        >
          <Info className="h-4 w-4" />
        </button>

        {/* Compact info card */}
        {selected && !showInfoSheet && (
          <div
            className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-96 z-[999] bg-card rounded-2xl shadow-xl px-4 py-4"
            style={{ border: "1.5px solid var(--border)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white bg-cyan-700">
                  Magasin
                </span>
                <p className="font-bold text-base truncate leading-snug mt-1">{selected.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {selected.plantName ?? selected.river}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => { setSelected(null); setShowInfoSheet(false); }}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Lukk"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-3 flex gap-4">
              {selected.volumeMm3 != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold" style={{ color: "#0891b2" }}>
                    {selected.volumeMm3.toFixed(1)}
                  </span>
                  <span className="text-xs text-muted-foreground">Mm³</span>
                </div>
              )}
              {selected.areaKm2 != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold" style={{ color: "#0891b2" }}>
                    {selected.areaKm2.toFixed(2)}
                  </span>
                  <span className="text-xs text-muted-foreground">km²</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setShowInfoSheet(true)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border bg-muted/50 hover:bg-muted transition-colors"
              >
                <ChevronUp className="h-3.5 w-3.5" /> Vis mer
              </button>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${selected.center.lat},${selected.center.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border bg-muted/50 hover:bg-muted transition-colors"
              >
                <Navigation className="h-3.5 w-3.5" /> Kjør hit
              </a>
            </div>
          </div>
        )}

        {/* Info detail sheet */}
        <Sheet open={showInfoSheet && !!selected} onOpenChange={(open) => { setShowInfoSheet(open); }}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[85svh] overflow-y-auto">
            {selected && (
              <div className="mx-auto w-full max-w-md px-4 pb-6">
                <SheetHeader>
                  <SheetTitle className="text-left sr-only">{selected.name}</SheetTitle>
                </SheetHeader>

                {/* Layer 1 — Identity */}
                <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white bg-cyan-700">
                  Magasin
                </span>
                <p className="font-bold text-lg leading-snug mt-1">{selected.name}</p>
                {selected.plantName && (
                  <p className="text-sm text-muted-foreground">Kraftverk: {selected.plantName}</p>
                )}
                {selected.river && (
                  <p className="text-sm text-muted-foreground">{selected.river}</p>
                )}

                {/* Layer 2 — Key metrics */}
                <div className="mt-4 pt-4 border-t flex flex-wrap gap-x-6 gap-y-2">
                  {selected.volumeMm3 != null && (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold" style={{ color: "#0891b2" }}>{selected.volumeMm3.toFixed(1)}</span>
                      <span className="text-xs text-muted-foreground">Mm³ volum</span>
                    </div>
                  )}
                  {selected.areaKm2 != null && (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold" style={{ color: "#0891b2" }}>{selected.areaKm2.toFixed(2)}</span>
                      <span className="text-xs text-muted-foreground">km² areal</span>
                    </div>
                  )}
                </div>

                {/* Layer 3 — Details */}
                <div className="mt-4 pt-4 border-t flex flex-col gap-2">
                  {selected.plantName && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Kraftverk</span>
                      <span className="font-medium">{selected.plantName}</span>
                    </div>
                  )}
                  {selected.hrv != null && selected.lrv != null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Regulering</span>
                      <span className="font-medium">{selected.lrv}–{selected.hrv} moh. ({Math.round(selected.hrv - selected.lrv)} m)</span>
                    </div>
                  )}
                  {selected.yearBuilt && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Idriftsatt</span>
                      <span className="font-medium">{selected.yearBuilt}</span>
                    </div>
                  )}
                  {selected.purpose && selected.purpose !== "Kraftproduksjon" && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Formål</span>
                      <span className="font-medium">{selected.purpose}</span>
                    </div>
                  )}
                </div>

                {/* National fill level */}
                {nationalFill && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Norges magasiner · uke {nationalFill.iso_uke}</span>
                      <span className="text-sm font-bold" style={{ color: nationalFill.fyllingsgrad > 0.5 ? "#0369a1" : nationalFill.fyllingsgrad > 0.3 ? "#ca8a04" : "#dc2626" }}>
                        {(nationalFill.fyllingsgrad * 100).toFixed(1)}%
                        {nationalFill.endring !== 0 && (
                          <span className="text-xs font-normal ml-1" style={{ color: nationalFill.endring > 0 ? "#16a34a" : "#dc2626" }}>
                            {nationalFill.endring > 0 ? "▲" : "▼"} {Math.abs(nationalFill.endring * 100).toFixed(1)}%
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="relative h-3 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${nationalFill.fyllingsgrad * 100}%`,
                          background: nationalFill.fyllingsgrad > 0.5 ? "#0369a1" : nationalFill.fyllingsgrad > 0.3 ? "#ca8a04" : "#dc2626",
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {nationalFill.fylling_TWh.toFixed(1)} av {nationalFill.kapasitet_TWh.toFixed(1)} TWh
                    </p>
                  </div>
                )}

                {/* Layer 4 — Links & source */}
                <div className="mt-4 pt-4 border-t flex flex-col gap-3">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selected.center.lat},${selected.center.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border bg-muted/50 hover:bg-muted transition-colors w-full"
                  >
                    <Navigation className="h-4 w-4" /> Kjør hit
                  </a>
                  <p className="text-xs text-muted-foreground text-center">
                    Kilde: <a href="https://nve.geodataonline.no/arcgis/rest/services/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">NVE Geodata</a>
                  </p>
                  <DataDisclaimer />
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>

      {/* Info modal */}
      {showInfo && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 px-4" onClick={() => setShowInfo(false)}>
          <div className="bg-background rounded-2xl shadow-xl border w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-base">Om magasindata</h2>
              <button onClick={() => setShowInfo(false)} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Lukk">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3 text-sm">
              <p>Kartet viser regulerte vannmagasiner i Norge. Disse samler vann for kraftproduksjon og er en viktig del av Norges energisystem.</p>
              <div className="bg-muted/50 rounded-xl p-3">
                <p className="font-semibold mb-1">Hva betyr «m regulering»?</p>
                <p className="text-muted-foreground">Regulering er forskjellen mellom <strong>HRV</strong> (høyeste regulerte vannstand) og <strong>LRV</strong> (laveste regulerte vannstand), målt i meter. Det viser hvor mye vannstanden i magasinet kan varieres, jo høyere tall, desto mer vann kan lagres og tappes for kraftproduksjon.</p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3">
                <p className="font-semibold mb-1">Volum (Mm³)</p>
                <p className="text-muted-foreground">Magasinets totale lagringskapasitet i millioner kubikkmeter vann.</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Kilde: <a href="https://nve.geodataonline.no/arcgis/rest/services/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">NVE Geodata</a> · <a href="https://www.nve.no/energi/energisystem/magasinstatistikk/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">NVE Magasinstatistikk</a>
              </p>
              <DataDisclaimer />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
