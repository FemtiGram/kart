"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import { Loader2, X, ExternalLink, Info, Map as MapIcon, Layers, LocateFixed, Mountain, Wind, Droplets, Sun, Cloud, CloudSun, CloudRain, CloudSnow, CloudLightning, CloudFog, CloudHail, CloudDrizzle, Moon, SlidersHorizontal, Check, ChevronUp, Navigation } from "lucide-react";
import { FlyTo, DataDisclaimer, MapError, AnimatedCount } from "@/lib/map-utils";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Toggle } from "@/components/ui/toggle";
import { useMapSearch, MapSearchBar } from "@/components/map-search";
import { isInNorway } from "@/lib/fylker";

function isInNorwayApprox(lat: number, lon: number): boolean {
  if (lat < 57.5 || lat > 71.5 || lon < 4.0 || lon > 31.5) return false;
  if (lat > 68) return true;
  if (lat > 63) return lon < 16;
  return lon < 12.5;
}

interface WeatherResult {
  temperature: number;
  windSpeed: number;
  precipitation: number;
  symbolCode: string;
}

function weatherIcon(symbolCode: string): LucideIcon {
  const c = symbolCode.toLowerCase();
  if (c.includes("thunder")) return CloudLightning;
  if (c.includes("snow") && c.includes("rain")) return CloudHail;
  if (c.includes("sleet")) return CloudHail;
  if (c.includes("snow")) return CloudSnow;
  if (c.includes("heavyrain") || c.includes("rain")) return CloudRain;
  if (c.includes("drizzle") || c.includes("lightrain")) return CloudDrizzle;
  if (c.includes("fog")) return CloudFog;
  if (c.includes("cloudy") && c.includes("partly")) return CloudSun;
  if (c.includes("cloudy")) return Cloud;
  if (c.includes("fair")) return CloudSun;
  if (c.includes("night")) return Moon;
  return Sun;
}

import type { KommuneEntry, Suggestion } from "@/lib/map-utils";

interface Cabin {
  id: number;
  lat: number;
  lon: number;
  name: string;
  operator: string | null;
  cabinType: "fjellhytte" | "ubetjent";
  isDNT: boolean;
  elevation: number | null;
  beds: number | null;
  website: string | null;
  description: string | null;
  fee: boolean | null;
  season: string | null;
  phone: string | null;
  shower: boolean | null;
}

const CABIN_COLORS: Record<Cabin["cabinType"], string> = {
  fjellhytte: "#b91c1c",
  ubetjent: "#15803d",
};

const CABIN_LABELS: Record<Cabin["cabinType"], string> = {
  fjellhytte: "Fjellhytte",
  ubetjent: "Ubetjent hytte",
};

// SVG cabin icons — filled for fjellhytte, outline for ubetjent
const cabinIconCache = new Map<string, L.DivIcon>();
function cabinIcon(type: Cabin["cabinType"], isSelected: boolean, inverted: boolean): L.DivIcon {
  const key = `${type}-${isSelected}-${inverted}`;
  const cached = cabinIconCache.get(key);
  if (cached) return cached;

  const baseColor = isSelected ? "#24374c" : CABIN_COLORS[type];
  const size = type === "fjellhytte" ? 30 : 26;
  const filled = type === "fjellhytte";
  const bg = inverted ? baseColor : "white";
  const iconColor = inverted ? "white" : baseColor;
  const border = isSelected ? "#24374c" : inverted ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.15)";

  const housePath = filled
    ? `<path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1z" fill="${iconColor}" stroke="${iconColor}" stroke-width="1.5"/>`
    : `<path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1z" fill="none" stroke="${iconColor}" stroke-width="2"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 1 24 24" width="${size * 0.5}" height="${size * 0.5}">${housePath}</svg>`;

  const icon = L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;line-height:0;background:${bg};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.25);border:2.5px solid ${border}">${svg}</div>`,
  });
  cabinIconCache.set(key, icon);
  return icon;
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


function PanToSelected({ cabin }: { cabin: Cabin | null }) {
  const map = useMap();
  useEffect(() => {
    if (!cabin) return;
    map.panTo([cabin.lat, cabin.lon], { animate: true, duration: 0.4 });
  }, [cabin, map]);
  return null;
}

export function CabinMap() {
  const [cabins, setCabins] = useState<Cabin[]>([]);
  const [loading, setLoading] = useState(true);
  const [counting, setCounting] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Cabin | null>(null);
  const [center, setCenter] = useState<{ lat: number; lon: number; zoom?: number; _t?: number } | null>(null);
  const [tileLayer, setTileLayer] = useState<TileLayerKey>("gråtone");
  const [showInfo, setShowInfo] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [filterTypes, setFilterTypes] = useState<Set<Cabin["cabinType"]>>(new Set(["fjellhytte", "ubetjent"]));
  const [filterDNT, setFilterDNT] = useState(false);
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);

  const kommunerRef = useRef<KommuneEntry[]>([]);
  const setQueryRef = useRef<(q: string) => void>(() => {});

  useEffect(() => {
    fetch("https://ws.geonorge.no/kommuneinfo/v1/kommuner")
      .then((r) => r.json())
      .then((data: KommuneEntry[]) => { kommunerRef.current = data; })
      .catch(() => {});
  }, []);

  const handleSearchSelect = useCallback(async (s: Suggestion) => {
    setSelected(null);
    if (s.type === "fylke") {
      setQueryRef.current(s.fylkesnavn);
      setCenter({ lat: s.lat, lon: s.lon, zoom: s.zoom });
      return;
    }
    if (s.type === "kommune") {
      setQueryRef.current(s.kommunenavn);
      const res = await fetch(
        `https://ws.geonorge.no/stedsnavn/v1/navn?sok=${encodeURIComponent(s.kommunenavn)}&kommunenummer=${s.kommunenummer}&treffPerSide=1`
      );
      const data = await res.json();
      const point = data.navn?.[0]?.representasjonspunkt;
      if (point) {
        setCenter({ lat: point.nord, lon: point.øst });
      }
    } else if (s.type === "adresse") {
      setQueryRef.current(`${s.addr.adressetekst}, ${s.addr.poststed}`);
      setCenter({ lat: s.addr.representasjonspunkt.lat, lon: s.addr.representasjonspunkt.lon });
    }
  }, []);

  const searchProps = useMapSearch({
    kommuneList: kommunerRef.current,
    onSelect: handleSearchSelect,
  });
  setQueryRef.current = searchProps.setQuery;

  const handleLocate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    setLocateError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setSelected(null);
        const { latitude: lat, longitude: lon } = pos.coords;
        if (isInNorway(lat, lon)) {
          setCenter({ lat, lon, zoom: 12, _t: Date.now() });
        } else {
          setCenter({ lat: 61.5, lon: 8.3, zoom: 9, _t: Date.now() });
        }
      },
      () => {
        setLocating(false);
        setCenter({ lat: 61.5, lon: 8.3, zoom: 9, _t: Date.now() });
        setLocateError(true);
        setTimeout(() => setLocateError(false), 4000);
      },
      { timeout: 15000, maximumAge: 60000 }
    );
  };

  // Load cabins from pre-built static JSON, fallback to live Overpass
  const loadCabins = useCallback(async () => {
    setError(false);
    setLoading(true);

    const OVERPASS_QUERY = '[out:json][timeout:15];(node["tourism"="alpine_hut"](57.5,4.0,71.5,31.5);node["tourism"="wilderness_hut"](57.5,4.0,71.5,31.5);way["tourism"="alpine_hut"](57.5,4.0,71.5,31.5);way["tourism"="wilderness_hut"](57.5,4.0,71.5,31.5););out center body;';

    function parseCabins(elements: Array<{ id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags: Record<string, string> }>) {
      return elements.map((el) => {
        const t = el.tags || {};
        const lat = el.lat ?? el.center?.lat ?? 0;
        const lon = el.lon ?? el.center?.lon ?? 0;
        const isDNT = /turistforening|dnt/i.test(t.operator ?? "");
        const cabinType: Cabin["cabinType"] = t.tourism === "alpine_hut" ? "fjellhytte" : "ubetjent";
        const rawHours = t.opening_hours ?? null;
        let season: string | null = null;
        if (rawHours) {
          const h = rawHours.toLowerCase();
          season = (h === "24/7" || h.includes("jan-dec") || h.includes("mo-su")) ? "Helårs" : rawHours.charAt(0).toUpperCase() + rawHours.slice(1);
        }
        return { id: el.id, lat, lon, name: t.name ?? "Ukjent hytte", operator: t.operator ?? null, cabinType, isDNT, elevation: t.ele ? parseInt(t.ele) : null, beds: t.beds ? parseInt(t.beds) : t.capacity ? parseInt(t.capacity) : null, website: t.website ?? t["contact:website"] ?? null, description: t.description ?? null, fee: t.fee === "yes" ? true : t.fee === "no" ? false : null, season, phone: t.phone ?? t["contact:phone"] ?? null, shower: t.shower === "yes" ? true : t.shower === "no" ? false : null };
      }).filter((c) => c.lat !== 0 && c.lon !== 0);
    }

    let loadedCabinCount = 0;
    try {
      const r = await fetch("/data/cabins.json");
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        setCabins(data);
        loadedCabinCount = data.length;
      } else {
        try {
          const res = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
            signal: AbortSignal.timeout(15000),
          });
          if (res.ok) {
            const osm = await res.json();
            const parsed = parseCabins(osm.elements ?? []);
            if (parsed.length > 0) {
              setCabins(parsed);
              loadedCabinCount = parsed.length;
            } else {
              setError(true);
            }
          } else {
            setError(true);
          }
        } catch {
          setError(true);
        }
      }
      if (loadedCabinCount > 0) {
        setLoadedCount(loadedCabinCount);
        setCounting(true);
      }
      setLoading(false);
      if (loadedCabinCount > 0) {
        setTimeout(() => setCounting(false), 800);
      }
    } catch {
      setError(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCabins(); }, [loadCabins]);

  // Fetch weather when a cabin is selected
  useEffect(() => {
    if (!selected) { setWeather(null); return; }
    setLoadingWeather(true);
    fetch(`/api/weather?lat=${selected.lat}&lon=${selected.lon}`)
      .then((r) => r.json())
      .then((data) => { setWeather(data); setLoadingWeather(false); })
      .catch(() => setLoadingWeather(false));
  }, [selected?.id]);

  const norwayCabins = useMemo(() => {
    return cabins.filter((c) => isInNorwayApprox(c.lat, c.lon));
  }, [cabins]);

  const dntCount = norwayCabins.filter((c) => c.isDNT).length;

  const filteredCabins = useMemo(() => {
    return norwayCabins.filter((c) => filterTypes.has(c.cabinType) && (!filterDNT || c.isDNT));
  }, [norwayCabins, filterTypes, filterDNT]);

  const activeFilterCount = (2 - filterTypes.size) + (filterDNT ? 1 : 0);

  const toggleType = (type: Cabin["cabinType"]) => {
    setFilterTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) { if (next.size > 1) next.delete(type); }
      else next.add(type);
      return next;
    });
  };

  return (
    <div className="flex flex-col" style={{ height: "calc(100svh - 57px)" }}>
      {/* Search bar */}
      <div className="relative z-[1000] px-4 py-4 md:px-8 shrink-0 bg-background border-b">
        <div className="max-w-xl mx-auto relative flex flex-col gap-2">
            <MapSearchBar search={searchProps} placeholder="Søk etter fjellområde eller sted...">
            <Sheet open={showFilter} onOpenChange={(open) => { setShowFilter(open); if (open) setShowInfoSheet(false); }}>
              <SheetTrigger
                render={
                  <Button variant="secondary" size="icon" className="relative shadow-lg shrink-0 h-11 w-11 rounded-xl">
                    <SlidersHorizontal className="h-4 w-4" />
                    {activeFilterCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                }
              />
              <SheetContent side="bottom" className="rounded-t-2xl max-h-[70svh] overflow-y-auto">
                <div className="mx-auto w-full max-w-md px-2">
                  <SheetHeader>
                    <SheetTitle className="text-left">Filtrer hytter</SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col gap-4 py-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Hyttetype</p>
                      <div className="rounded-xl border overflow-hidden">
                        {(["fjellhytte", "ubetjent"] as const).map((type) => {
                          const active = filterTypes.has(type);
                          return (
                            <button
                              key={type}
                              onClick={() => toggleType(type)}
                              className={`flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors border-b last:border-0 ${active ? "bg-background" : "bg-muted/40 text-muted-foreground"}`}
                            >
                              <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${active ? "border-primary bg-primary" : "border-muted-foreground/30 bg-background"}`}>
                                {active && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                              </div>
                              <div className="h-3 w-3 rounded-full shrink-0" style={{ background: CABIN_COLORS[type] }} />
                              <span className="font-medium flex-1 text-left">{CABIN_LABELS[type]}</span>
                              <span className="text-xs text-muted-foreground tabular-nums">{norwayCabins.filter((c) => c.cabinType === type).length}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Organisasjon</p>
                      <div className="rounded-xl border overflow-hidden">
                        <button
                          onClick={() => setFilterDNT((v) => !v)}
                          className={`flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors ${filterDNT ? "bg-background" : "bg-muted/40 text-muted-foreground"}`}
                        >
                          <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${filterDNT ? "border-primary bg-primary" : "border-muted-foreground/30 bg-background"}`}>
                            {filterDNT && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                          </div>
                          <span className="font-medium flex-1 text-left">Kun DNT-hytter</span>
                          <span className="text-xs text-muted-foreground tabular-nums">{dntCount}</span>
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={() => { setFilterTypes(new Set(["fjellhytte", "ubetjent"])); setFilterDNT(false); }}
                      >
                        Nullstill
                      </Button>
                      <Button className="flex-1" onClick={() => setShowFilter(false)}>
                        Vis {filteredCabins.length} hytter
                      </Button>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <Button onClick={handleLocate} disabled={locating || loading} variant="secondary" size="icon" className="shadow-lg shrink-0 h-11 w-11 rounded-xl">
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            </Button>
            </MapSearchBar>
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-muted-foreground">
            {loading ? "Henter hytter..." : norwayCabins.length > 0 ? `${filteredCabins.length} av ${norwayCabins.length} hytter · Kilde: OpenStreetMap` : "Ingen hytter funnet"}
          </p>
        </div>
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
                <p className="text-sm text-muted-foreground">Henter hytter...</p>
              )}
            </div>
          </div>
        )}
        {locating && (
          <div className="absolute bottom-20 sm:top-3 sm:bottom-auto left-1/2 -translate-x-1/2 z-[1000] bg-background/90 backdrop-blur-sm border rounded-full px-4 py-2 shadow-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Finner posisjon...
            </div>
          </div>
        )}
        {locateError && (
          <div className="absolute bottom-20 sm:top-3 sm:bottom-auto left-1/2 -translate-x-1/2 z-[1000] bg-background/90 backdrop-blur-sm border rounded-full px-4 py-2 shadow-lg">
            <p className="text-sm text-muted-foreground">Kunne ikke finne posisjon — viser Jotunheimen i stedet.</p>
          </div>
        )}
        {error && <MapError message="Kunne ikke hente hytter." onRetry={loadCabins} />}

        <MapContainer
          center={[65, 14]}
          zoom={5}
          style={{ height: "100%", width: "100%" }}
        >
          {center && <FlyTo lat={center.lat} lon={center.lon} zoom={center.zoom} _t={center._t} />}
          <PanToSelected cabin={selected} />
          <TileLayer
            key={tileLayer}
            url={TILE_LAYERS[tileLayer].url}
            attribution={TILE_LAYERS[tileLayer].attribution}
            maxZoom={17}
          />
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={60}
            spiderfyOnMaxZoom
            showCoverageOnHover={false}
            iconCreateFunction={(cluster: { getChildCount: () => number }) => {
              const count = cluster.getChildCount();
              let size = 36;
              let fontSize = 13;
              if (count >= 100) { size = 44; fontSize = 14; }
              if (count >= 500) { size = 52; fontSize = 15; }
              return L.divIcon({
                html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:#b45309;color:white;border-radius:50%;font-weight:700;font-size:${fontSize}px;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid rgba(255,255,255,0.6)">${count}</div>`,
                className: "",
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2],
              });
            }}
          >
            {filteredCabins.map((c) => (
              <Marker
                key={c.id}
                position={[c.lat, c.lon]}
                icon={cabinIcon(c.cabinType, selected?.id === c.id, tileLayer === "gråtone")}
                eventHandlers={{
                  click() {
                    setSelected((prev) => (prev?.id === c.id ? null : c));
                  },
                }}
              />
            ))}
          </MarkerClusterGroup>
        </MapContainer>

        {/* Legend + tile toggle */}
        <div className="absolute top-3 right-3 z-[999] flex flex-col gap-2 items-end">
          <div className="flex rounded-lg border bg-card shadow-md overflow-hidden">
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

        </div>

        {/* Compact info card */}
        {selected && !showInfoSheet && (
          <div
            className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-96 z-[999] bg-card rounded-2xl shadow-xl px-4 py-4"
            style={{ border: "1.5px solid var(--border)" }}
          >
            {/* Layer 1 — Identity */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white"
                    style={{ background: CABIN_COLORS[selected.cabinType] }}
                  >
                    {CABIN_LABELS[selected.cabinType]}
                  </span>
                  {selected.isDNT && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-muted text-foreground">DNT</span>
                  )}
                  {selected.fee === false && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-green-100 text-green-800">Gratis</span>
                  )}
                </div>
                <p className="font-bold text-base truncate leading-snug">{selected.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {selected.operator !== selected.name ? selected.operator : null}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Lukk"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Layer 2 — Key metrics */}
            <div className="mt-3 flex items-center gap-6">
              {selected.elevation != null && (
                <div className="flex items-baseline gap-1.5">
                  <Mountain className="h-3.5 w-3.5 text-muted-foreground self-center" />
                  <span className="text-2xl font-extrabold" style={{ color: "var(--kv-blue)" }}>{selected.elevation}</span>
                  <span className="text-xs font-medium text-muted-foreground">moh.</span>
                </div>
              )}
              {selected.beds != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold" style={{ color: "var(--kv-blue)" }}>{selected.beds}</span>
                  <span className="text-xs font-medium text-muted-foreground">senger</span>
                </div>
              )}
              {selected.elevation == null && selected.beds == null && (
                <p className="text-sm text-muted-foreground">Ingen tilleggsdata</p>
              )}
            </div>

            {/* Action row */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { setShowInfoSheet(true); setShowFilter(false); }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border bg-muted/50 hover:bg-muted transition-colors"
              >
                <ChevronUp className="h-3.5 w-3.5" /> Vis mer
              </button>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lon}`}
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
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white"
                    style={{ background: CABIN_COLORS[selected.cabinType] }}
                  >
                    {CABIN_LABELS[selected.cabinType]}
                  </span>
                  {selected.isDNT && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-muted text-foreground">DNT</span>
                  )}
                  {selected.fee === false && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-green-100 text-green-800">Gratis</span>
                  )}
                  {selected.fee === true && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">Betalt</span>
                  )}
                  {selected.season && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800">{selected.season}</span>
                  )}
                </div>
                <p className="font-bold text-lg leading-snug">{selected.name}</p>
                {selected.operator && selected.operator !== selected.name && (
                  <p className="text-sm text-muted-foreground">{selected.operator}</p>
                )}

                {/* Layer 2 — Key metrics */}
                <div className="mt-4 pt-4 border-t flex items-center gap-6">
                  {selected.elevation != null && (
                    <div className="flex items-baseline gap-1.5">
                      <Mountain className="h-4 w-4 text-muted-foreground self-center" />
                      <span className="text-3xl font-extrabold" style={{ color: "var(--kv-blue)" }}>{selected.elevation}</span>
                      <span className="text-xs font-medium text-muted-foreground">moh.</span>
                    </div>
                  )}
                  {selected.beds != null && (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold" style={{ color: "var(--kv-blue)" }}>{selected.beds}</span>
                      <span className="text-xs font-medium text-muted-foreground">sengeplasser</span>
                    </div>
                  )}
                  {selected.shower === true && (
                    <div className="flex items-baseline gap-1.5">
                      <Droplets className="h-4 w-4 text-muted-foreground self-center" />
                      <span className="text-xs font-medium text-muted-foreground">Dusj</span>
                    </div>
                  )}
                </div>

                {/* Layer 3 — Weather + details */}
                {(loadingWeather || weather) && (
                  <div className="mt-4 pt-4 border-t">
                    {loadingWeather ? (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Henter vær...
                      </div>
                    ) : weather && (() => {
                      const WeatherIcon = weatherIcon(weather.symbolCode);
                      return (
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <WeatherIcon className="h-9 w-9 shrink-0" style={{ color: "var(--kv-blue)" }} />
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                              <span className="text-xl font-extrabold" style={{ color: "var(--kv-blue)" }}>
                                {weather.temperature.toFixed(1)}°C
                              </span>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Wind className="h-3.5 w-3.5" />
                                  {weather.windSpeed.toFixed(1)} m/s
                                </span>
                                <span className="flex items-center gap-1">
                                  <Droplets className="h-3.5 w-3.5" />
                                  {weather.precipitation.toFixed(1)} mm
                                </span>
                              </div>
                            </div>
                          </div>
                          <a
                            href={`https://www.yr.no/nb/søk?q=${encodeURIComponent(selected.name)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                          >
                            yr.no <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {selected.description && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm text-muted-foreground">{selected.description}</p>
                  </div>
                )}

                {/* Layer 4 — Links & source */}
                <div className="mt-4 pt-4 border-t flex flex-col gap-3">
                  <div className="flex gap-2">
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lon}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <Navigation className="h-4 w-4" /> Kjør hit
                    </a>
                    {selected.website && !selected.website.includes("ut.no") && (
                      <a
                        href={selected.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <ExternalLink className="h-4 w-4" /> Nettside
                      </a>
                    )}
                  </div>
                  {selected.isDNT && (
                    <a
                      href={`https://www.dnt.no/sok/?q=${encodeURIComponent(selected.name)}&tab=cabins`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border bg-muted/50 hover:bg-muted transition-colors w-full"
                    >
                      <ExternalLink className="h-4 w-4" /> Finn på DNT.no
                    </a>
                  )}
                  <p className="text-xs text-muted-foreground text-center">
                    Kilde: OpenStreetMap
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
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowInfo(false)}
        >
          <div
            className="bg-background rounded-2xl shadow-xl border w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-base">Om hyttekartet</h2>
              <button
                onClick={() => setShowInfo(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Lukk"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3 text-sm text-muted-foreground">
              <p>
                Kartet viser <span className="font-medium text-foreground">turisthytter i Norge</span> fra OpenStreetMap, inkludert DNT-hytter og andre fjellhytter.
              </p>
              <p>Hyttene er fargekodet etter type:</p>
              <div className="flex flex-col gap-1.5 ml-1">
                <div className="flex items-start gap-2">
                  <div className="h-3 w-3 rounded-full mt-0.5 shrink-0" style={{ background: CABIN_COLORS.fjellhytte }} />
                  <div>
                    <span className="font-medium text-foreground">Fjellhytte</span>
                    <span className="text-muted-foreground"> — betjent eller selvbetjent hytte (alpine_hut)</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="h-3 w-3 rounded-full mt-0.5 shrink-0" style={{ background: CABIN_COLORS.ubetjent }} />
                  <div>
                    <span className="font-medium text-foreground">Ubetjent hytte</span>
                    <span className="text-muted-foreground"> — åpen hytte med basisutstyr (wilderness_hut)</span>
                  </div>
                </div>
              </div>
              <p>
                Data som sengeplasser og høyde hentes fra OpenStreetMap og kan være utdatert. Sjekk alltid <a href="https://www.dnt.no/hytter/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">dnt.no</a> for oppdatert informasjon.
              </p>
              <a
                href="https://www.dnt.no/hytter/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mt-1"
              >
                <ExternalLink className="h-3 w-3" />
                DNT — Hytteoversikt
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
