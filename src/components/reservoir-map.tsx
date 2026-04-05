"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Polygon, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  Loader2,
  X,
  Search,
  MapPin,
  Info,
  Map as MapIcon,
  Layers,
  RotateCw,
  ChevronUp,
  Navigation,
  Waves,
  Gauge,
  Droplets,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FYLKER } from "@/lib/fylker";
import { FlyTo, useDebounceRef, useSearchAbort } from "@/lib/map-utils";
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

interface HydroStationData {
  station: { id: string; name: string; river: string | null; distanceKm: number } | null;
  discharge: number | null;
  waterLevel: number | null;
  percentile: { p25: number | null; p50: number | null; p75: number | null; p90: number | null; min: number | null; max: number | null } | null;
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

function fillColor(hrv: number | null, lrv: number | null): string {
  // Without live water level, color by regulation range (bigger range = more significant)
  if (hrv == null || lrv == null) return "#0891b2";
  const range = hrv - lrv;
  if (range > 30) return "#0369a1"; // large regulation
  if (range > 10) return "#0891b2"; // medium
  return "#22d3ee"; // small
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
  const [error, setError] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [selected, setSelected] = useState<Reservoir | null>(null);
  const [hydroData, setHydroData] = useState<HydroStationData | null>(null);
  const [loadingHydro, setLoadingHydro] = useState(false);
  const [center, setCenter] = useState<{ lat: number; lon: number; zoom?: number; _t?: number } | null>(null);
  const [tileLayer, setTileLayer] = useState<TileLayerKey>("kart");

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
      setLoading(false);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReservoirs(); }, [loadReservoirs]);

  // Fetch hydro data when info sheet opens
  useEffect(() => {
    if (!showInfoSheet || !selected) {
      setHydroData(null);
      return;
    }
    let cancelled = false;
    setLoadingHydro(true);
    fetch(`/api/hydro-station?lat=${selected.center.lat}&lon=${selected.center.lon}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setHydroData(data.error ? null : data);
          setLoadingHydro(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHydroData(null);
          setLoadingHydro(false);
        }
      });
    return () => { cancelled = true; };
  }, [showInfoSheet, selected]);

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
                    ) : (
                      <div>
                        <p className="font-medium">{s.kommunenavn}</p>
                        <p className="text-xs text-muted-foreground">Kommune</p>
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-2 max-w-xl mx-auto">
          {loading ? "Henter magasindata..." : `${stats.total} magasiner${stats.totalVolume > 0 ? ` · ${stats.totalVolume.toLocaleString("nb-NO")} Mm³ total kapasitet` : ""} — Kilde: NVE`}
        </p>
      </div>

      {/* Map */}
      <div className="relative grow">
        {loading && (
          <div className="absolute inset-0 z-[1000] bg-background flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center px-6">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--kv-blue)" }} />
              <p className="text-sm text-muted-foreground">Henter magasindata...</p>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute bottom-20 sm:top-3 sm:bottom-auto left-1/2 -translate-x-1/2 z-[1000] rounded-full px-4 py-2 shadow-lg" style={{ background: "#b91c1c" }}>
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-white">Kunne ikke hente magasindata.</p>
              <button onClick={loadReservoirs} className="inline-flex items-center gap-1 text-sm font-semibold text-white/90 hover:text-white transition-colors">
                <RotateCw className="h-3.5 w-3.5" /> Prøv igjen
              </button>
            </div>
          </div>
        )}

        <MapContainer center={[65, 14]} zoom={5} style={{ height: "100%", width: "100%" }}>
          {center && <FlyTo lat={center.lat} lon={center.lon} zoom={center.zoom} _t={center._t} />}
          <PanToSelected reservoir={selected} />
          <TileLayer
            key={tileLayer}
            url={TILE_LAYERS[tileLayer].url}
            attribution={TILE_LAYERS[tileLayer].attribution}
            maxZoom={17}
          />
          {reservoirs.map((r) => (
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
              <button
                onClick={() => { setSelected(null); setShowInfoSheet(false); }}
                className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Lukk"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex gap-4">
              {selected.hrv != null && selected.lrv != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold" style={{ color: "#0891b2" }}>
                    {Math.round(selected.hrv - selected.lrv)}
                  </span>
                  <span className="text-xs text-muted-foreground">m regulering</span>
                </div>
              )}
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
                  {selected.hrv != null && (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold" style={{ color: "#0891b2" }}>{selected.hrv}</span>
                      <span className="text-xs text-muted-foreground">m HRV</span>
                    </div>
                  )}
                  {selected.lrv != null && (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold" style={{ color: "#0891b2" }}>{selected.lrv}</span>
                      <span className="text-xs text-muted-foreground">m LRV</span>
                    </div>
                  )}
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
                  {selected.purpose && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Formål</span>
                      <span className="font-medium">{selected.purpose}</span>
                    </div>
                  )}
                  {selected.yearBuilt && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Idriftsatt</span>
                      <span className="font-medium">{selected.yearBuilt}</span>
                    </div>
                  )}
                  {selected.hrv != null && selected.lrv != null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Reguleringsområde</span>
                      <span className="font-medium">{Math.round(selected.hrv - selected.lrv)} m ({selected.lrv}–{selected.hrv} moh.)</span>
                    </div>
                  )}
                </div>

                {/* Live hydro station data */}
                {loadingHydro && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Henter vanndata...
                    </div>
                  </div>
                )}
                {!loadingHydro && hydroData?.station && (hydroData.discharge != null || hydroData.waterLevel != null) && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center gap-1.5 mb-3">
                      <Waves className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Målestasjon: {hydroData.station.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60">
                        ({hydroData.station.distanceKm} km)
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                      {hydroData.discharge != null && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl font-extrabold" style={{ color: "#0891b2" }}>{hydroData.discharge.toFixed(1)}</span>
                          <span className="text-xs text-muted-foreground">m³/s vannføring</span>
                        </div>
                      )}
                      {hydroData.waterLevel != null && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl font-extrabold" style={{ color: "#0891b2" }}>{hydroData.waterLevel.toFixed(2)}</span>
                          <span className="text-xs text-muted-foreground">m vannstand</span>
                        </div>
                      )}
                    </div>
                    {hydroData.percentile && hydroData.discharge != null && (
                      <div className="mt-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Gauge className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Vannføring vs. normalen</span>
                        </div>
                        <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{
                              width: `${Math.min(100, Math.max(0, hydroData.percentile.max ? (hydroData.discharge / hydroData.percentile.max) * 100 : 50))}%`,
                              background: hydroData.percentile.p75 && hydroData.discharge > hydroData.percentile.p75
                                ? "#dc2626"
                                : hydroData.percentile.p50 && hydroData.discharge > hydroData.percentile.p50
                                  ? "#ca8a04"
                                  : "#16a34a",
                            }}
                          />
                        </div>
                        <div className="flex justify-between mt-0.5 text-[10px] text-muted-foreground">
                          <span>Lavt</span>
                          <span>{hydroData.percentile.p50 != null ? `Median: ${hydroData.percentile.p50.toFixed(1)} m³/s` : ""}</span>
                          <span>Høyt</span>
                        </div>
                      </div>
                    )}
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
                    Kilde: <a href="https://nve.geodataonline.no/arcgis/rest/services/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">NVE Geodata</a> · Oppdateres hver time
                  </p>
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
              <p><strong>HRV</strong> (høyeste regulerte vannstand) og <strong>LRV</strong> (laveste regulerte vannstand) viser reguleringsområdet. Forskjellen mellom disse angir hvor mye magasinet kan tappes.</p>
              <p>Sanntids vanndata hentes fra NVE HydAPI og viser vannføring og vannstand fra nærmeste målestasjon.</p>
              <p className="text-xs text-muted-foreground">
                Kilde: <a href="https://nve.geodataonline.no/arcgis/rest/services/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">NVE Geodata</a> · <a href="https://hydapi.nve.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">NVE HydAPI</a>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
