"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import { Loader2, ExternalLink, Map as MapIcon, Layers, LocateFixed, Mountain, Wind, Droplets, Sun, Cloud, CloudSun, CloudRain, CloudSnow, CloudLightning, CloudFog, CloudHail, CloudDrizzle, Moon, SlidersHorizontal, Check, ChevronUp, Navigation } from "lucide-react";
import { FlyTo, DataDisclaimer, MapError, MAP_HEIGHT, TILE_LAYERS, useMapCore, useGeolocation } from "@/lib/map-utils";
import { CompactCard } from "@/components/compact-card";
import { InfoModal } from "@/components/info-modal";
import { TileToggle } from "@/components/tile-toggle";
import { MapLoading } from "@/components/map-loading";
import { DriveLink } from "@/components/drive-link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Toggle } from "@/components/ui/toggle";
import { MapSearchBar, type MapSearchBarHandle } from "@/components/map-search";
import { cabinIcon, CABIN_COLORS } from "@/components/map-icons";
import { SelectedHalo } from "@/components/selected-halo";
import { useHashSelection } from "@/lib/use-hash-selection";
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

const CABIN_LABELS: Record<Cabin["cabinType"], string> = {
  fjellhytte: "Fjellhytte",
  ubetjent: "Ubetjent hytte",
};


function PanToSelected({ cabin }: { cabin: Cabin | null }) {
  const map = useMap();
  useEffect(() => {
    if (!cabin) return;
    map.panTo([cabin.lat, cabin.lon], { animate: true, duration: 0.4 });
  }, [cabin, map]);
  return null;
}

export function CabinMap() {
  const { loading, setLoading, error, setError, tileLayer, setTileLayer } = useMapCore();
  const [cabins, setCabins] = useState<Cabin[]>([]);
  const [counting, setCounting] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [selected, setSelected] = useState<Cabin | null>(null);
  const [center, setCenter] = useState<{ lat: number; lon: number; zoom?: number; _t?: number } | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [filterTypes, setFilterTypes] = useState<Set<Cabin["cabinType"]>>(new Set(["fjellhytte", "ubetjent"]));
  const [filterDNT, setFilterDNT] = useState(false);
  const [filterFee, setFilterFee] = useState<"all" | "free" | "paid">("all");
  const [filterSeason, setFilterSeason] = useState<"all" | "helårs">("all");
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);

  const kommunerRef = useRef<KommuneEntry[]>([]);
  const searchBarRef = useRef<MapSearchBarHandle>(null);

  useEffect(() => {
    fetch("https://ws.geonorge.no/kommuneinfo/v1/kommuner")
      .then((r) => r.json())
      .then((data: KommuneEntry[]) => { kommunerRef.current = data; })
      .catch(() => {});
  }, []);

  const handleSearchSelect = useCallback(async (s: Suggestion) => {
    setSelected(null);
    if (s.type === "fylke") {
      searchBarRef.current?.setQuery(s.fylkesnavn);
      setCenter({ lat: s.lat, lon: s.lon, zoom: s.zoom });
      return;
    }
    if (s.type === "kommune") {
      searchBarRef.current?.setQuery(s.kommunenavn);
      const res = await fetch(
        `https://ws.geonorge.no/stedsnavn/v1/navn?sok=${encodeURIComponent(s.kommunenavn)}&kommunenummer=${s.kommunenummer}&treffPerSide=1`
      );
      const data = await res.json();
      const point = data.navn?.[0]?.representasjonspunkt;
      if (point) {
        setCenter({ lat: point.nord, lon: point.øst });
      }
    } else if (s.type === "adresse") {
      searchBarRef.current?.setQuery(`${s.addr.adressetekst}, ${s.addr.poststed}`);
      setCenter({ lat: s.addr.representasjonspunkt.lat, lon: s.addr.representasjonspunkt.lon });
    }
  }, []);

  const { locating, locateError, locate: handleLocate } = useGeolocation(
    useCallback((lat, lon) => {
      setSelected(null);
      if (isInNorway(lat, lon)) {
        setCenter({ lat, lon, zoom: 12, _t: Date.now() });
      } else {
        setCenter({ lat: 61.5, lon: 8.3, zoom: 9, _t: Date.now() });
      }
    }, []),
    useCallback(() => {
      setCenter({ lat: 61.5, lon: 8.3, zoom: 9, _t: Date.now() });
    }, []),
  );

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

  // Deep linking: sync selected cabin ↔ URL hash (#cabin-<id>)
  const restoreCabin = useCallback((id: string) => {
    const cabin = cabins.find((c) => String(c.id) === id);
    if (cabin) {
      setSelected(cabin);
      setCenter({ lat: cabin.lat, lon: cabin.lon, zoom: 14, _t: Date.now() });
      setShowInfoSheet(true);
    }
  }, [cabins]);
  useHashSelection({
    prefix: "cabin",
    selectedId: selected?.id ?? null,
    onRestore: restoreCabin,
    readyToRestore: !loading && cabins.length > 0,
  });

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
    return norwayCabins.filter((c) => {
      if (!filterTypes.has(c.cabinType)) return false;
      if (filterDNT && !c.isDNT) return false;
      if (filterFee === "free" && c.fee !== false) return false;
      if (filterFee === "paid" && c.fee === false) return false;
      if (filterSeason === "helårs" && c.season !== "Helårs") return false;
      return true;
    });
  }, [norwayCabins, filterTypes, filterDNT, filterFee, filterSeason]);

  const activeFilterCount = (2 - filterTypes.size) + (filterDNT ? 1 : 0) + (filterFee !== "all" ? 1 : 0) + (filterSeason !== "all" ? 1 : 0);

  const selectCabin = useCallback((c: Cabin) => {
    setSelected((prev) => (prev?.id === c.id ? null : c));
  }, []);

  // Memoize the marker list so clicks don't regenerate ~2300 Markers.
  // Deps exclude `selected` — see schools-map.tsx for rationale.
  const inverted = tileLayer === "gråtone";
  const cabinMarkers = useMemo(
    () =>
      filteredCabins.map((c) => (
        <Marker
          key={c.id}
          position={[c.lat, c.lon]}
          icon={cabinIcon(c.cabinType, false, inverted)}
          eventHandlers={{ click: () => selectCabin(c) }}
        />
      )),
    [filteredCabins, inverted, selectCabin]
  );

  const toggleType = (type: Cabin["cabinType"]) => {
    setFilterTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) { if (next.size > 1) next.delete(type); }
      else next.add(type);
      return next;
    });
  };

  return (
    <div className="flex flex-col" style={{ height: MAP_HEIGHT }}>
      {/* Search bar */}
      <div className="relative z-[1000] px-4 py-4 md:px-8 shrink-0 bg-background border-b">
        <div className="max-w-xl mx-auto relative flex flex-col gap-2">
            <MapSearchBar
              ref={searchBarRef}
              kommuneList={() => kommunerRef.current}
              onSelect={handleSearchSelect}
              placeholder="Søk etter fjellområde eller sted..."
            >
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
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70 mb-2">Hyttetype</p>
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
                              <span className="text-xs text-foreground/70 tabular-nums">{norwayCabins.filter((c) => c.cabinType === type).length}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70 mb-2">Organisasjon</p>
                      <div className="rounded-xl border overflow-hidden">
                        <button
                          onClick={() => setFilterDNT((v) => !v)}
                          className={`flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors ${filterDNT ? "bg-background" : "bg-muted/40 text-muted-foreground"}`}
                        >
                          <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${filterDNT ? "border-primary bg-primary" : "border-muted-foreground/30 bg-background"}`}>
                            {filterDNT && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                          </div>
                          <span className="font-medium flex-1 text-left">Kun DNT-hytter</span>
                          <span className="text-xs text-foreground/70 tabular-nums">{dntCount}</span>
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70 mb-2">Pris</p>
                      <div className="flex rounded-xl border overflow-hidden">
                        {([["all", "Alle"], ["free", "Gratis"], ["paid", "Betalt"]] as const).map(([val, label]) => (
                          <button
                            key={val}
                            onClick={() => setFilterFee(val)}
                            className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${filterFee === val ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted"}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70 mb-2">Sesong</p>
                      <div className="flex rounded-xl border overflow-hidden">
                        {([["all", "Alle"], ["helårs", "Kun helårs"]] as const).map(([val, label]) => (
                          <button
                            key={val}
                            onClick={() => setFilterSeason(val)}
                            className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${filterSeason === val ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted"}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={() => { setFilterTypes(new Set(["fjellhytte", "ubetjent"])); setFilterDNT(false); setFilterFee("all"); setFilterSeason("all"); }}
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
          <p className="text-xs text-foreground/70">
            {loading ? "Henter hytter..." : norwayCabins.length > 0 ? `${filteredCabins.length} av ${norwayCabins.length} hytter · Kilde: OpenStreetMap · oppdateres månedlig` : "Ingen hytter funnet"}
          </p>
        </div>
      </div>

      {/* Map */}
      <div className="relative grow">
        <MapLoading
          visible={loading || counting}
          loading={loading}
          counting={counting}
          count={loadedCount}
          countLabel="datapunkter lastet"
          loadingMessage="Henter hytter..."
        />
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
            {cabinMarkers}
          </MarkerClusterGroup>

          {selected && (
            <SelectedHalo lat={selected.lat} lon={selected.lon} />
          )}
        </MapContainer>

        {/* Legend + tile toggle */}
        <div className="absolute top-3 right-3 z-[999] flex flex-col gap-2 items-end">
          <TileToggle
            value={tileLayer}
            onChange={setTileLayer}
            options={[
              { value: "kart", label: "Kart", icon: <MapIcon className="h-3.5 w-3.5" /> },
              { value: "gråtone", label: "Gråtone", icon: <Layers className="h-3.5 w-3.5" /> },
            ]}
          />
        </div>

        {/* Compact info card */}
        <CompactCard visible={!!selected && !showInfoSheet} onClose={() => setSelected(null)}>
          {selected && (<>
            <CompactCard.Header
              title={selected.name}
              titleStat={selected.beds != null ? `${selected.beds} senger` : undefined}
              metric={selected.elevation ?? undefined}
              metricUnit="moh."
            />
            <CompactCard.Context>
              <CompactCard.ContextLeft>
                {selected.operator && selected.operator !== selected.name && (
                  <CompactCard.ContextText>{selected.operator}</CompactCard.ContextText>
                )}
              </CompactCard.ContextLeft>
              <CompactCard.ContextRight>
                <CompactCard.Badge color="white" bg={CABIN_COLORS[selected.cabinType]}>{CABIN_LABELS[selected.cabinType]}</CompactCard.Badge>
                {selected.isDNT && <CompactCard.Badge color="var(--foreground)" bg="var(--muted)">DNT</CompactCard.Badge>}
                {selected.fee === false && <CompactCard.Badge color="#166534" bg="#dcfce7">Gratis</CompactCard.Badge>}
              </CompactCard.ContextRight>
            </CompactCard.Context>
            <CompactCard.Actions>
              <CompactCard.Action primary onClick={() => { setShowInfoSheet(true); setShowFilter(false); }} icon={<ChevronUp className="h-3.5 w-3.5" />}>Vis mer</CompactCard.Action>
              <CompactCard.Action href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lon}`} icon={<Navigation className="h-3.5 w-3.5" />}>Kjør hit</CompactCard.Action>
            </CompactCard.Actions>
          </>)}
        </CompactCard>

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
                    className="text-xs font-semibold px-1.5 py-0.5 rounded-full text-white"
                    style={{ background: CABIN_COLORS[selected.cabinType] }}
                  >
                    {CABIN_LABELS[selected.cabinType]}
                  </span>
                  {selected.isDNT && (
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-muted text-foreground">DNT</span>
                  )}
                  {selected.fee === false && (
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-800">Gratis</span>
                  )}
                  {selected.fee === true && (
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">Betalt</span>
                  )}
                  {selected.season && (
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800">{selected.season}</span>
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
                      <span className="text-xs font-medium text-foreground/70">moh.</span>
                    </div>
                  )}
                  {selected.beds != null && (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold" style={{ color: "var(--kv-blue)" }}>{selected.beds}</span>
                      <span className="text-xs font-medium text-foreground/70">sengeplasser</span>
                    </div>
                  )}
                  {selected.shower === true && (
                    <div className="flex items-baseline gap-1.5">
                      <Droplets className="h-4 w-4 text-muted-foreground self-center" />
                      <span className="text-xs font-medium text-foreground/70">Dusj</span>
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
                            className="flex items-center gap-1 text-xs text-foreground/70 hover:text-foreground transition-colors shrink-0"
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
                    <DriveLink lat={selected.lat} lon={selected.lon} className="flex-1 w-auto" />
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
                  <p className="text-xs text-foreground/70 text-center">
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
      <InfoModal open={showInfo} onClose={() => setShowInfo(false)} title="Om hyttekartet">
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
          className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors mt-1"
        >
          <ExternalLink className="h-3 w-3" />
          DNT — Hytteoversikt
        </a>
      </InfoModal>
    </div>
  );
}
