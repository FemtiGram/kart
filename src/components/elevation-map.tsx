"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Search, MapPin, Mountain, Loader2, X, ChevronUp, LocateFixed, Wind, Droplets, Sun, Cloud, CloudSun, CloudRain, CloudSnow, CloudLightning, CloudFog, CloudHail, CloudDrizzle, Moon, ExternalLink, Map as MapIcon, Info, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { LucideIcon } from "lucide-react";
import { FlyTo, DataDisclaimer, useDebounceRef } from "@/lib/map-utils";

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

// Fix Leaflet default marker icons in Next.js
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});


const TILE_LAYERS = {
  kart: {
    label: "Kart",
    url: "https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png",
    attribution: '&copy; <a href="https://www.kartverket.no/">Kartverket</a>',
  },
  terreng: {
    label: "Terreng",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
  },
} as const;

type TileLayerKey = keyof typeof TILE_LAYERS;

import type { Address } from "@/lib/map-utils";

interface ElevationResult {
  datakilde: string;
  høyde: number | null;
  terrengtype?: string;
}

interface WeatherResult {
  temperature: number;
  windSpeed: number;
  precipitation: number;
  symbolCode: string;
}

interface SelectedLocation {
  address: Address;
  elevation: ElevationResult | null;
  weather: WeatherResult | null;
  yrSearchName: string;
  mapsCoords?: { lat: number; lon: number };
}



function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function ElevationMap() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Address[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selected, setSelected] = useState<SelectedLocation | null>(null);
  const [loadingElevation, setLoadingElevation] = useState(false);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [tileLayer, setTileLayer] = useState<TileLayerKey>("terreng");
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(false);
  const [showInfoSheet, setShowInfoSheet] = useState(false);

  const debounceRef = useDebounceRef();
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const [apiDown, setApiDown] = useState(false);
  const [apiBannerDismissed, setApiBannerDismissed] = useState(false);

  const devFetch = useCallback(async (url: string, _summary?: (data: unknown) => string) => {
    const res = await fetch(url);
    return res.json();
  }, []);

  useEffect(() => {
    const checkApis = async () => {
      const results = await Promise.allSettled([
        devFetch("https://ws.geonorge.no/adresser/v1/sok?sok=Oslo&treffPerSide=1", () => "Helsesjekk: Adresser API"),
        devFetch("/api/weather?lat=59.9&lon=10.7", () => "Helsesjekk: Vær-proxy"),
      ]);
      const anyFailed = results.some((r) => r.status === "rejected");
      if (anyFailed) setApiDown(true);
    };
    checkApis();
  }, [devFetch]);

  const searchAddresses = useCallback(
    async (q: string) => {
      if (q.length < 2) { setSuggestions([]); return; }
      setLoadingSuggestions(true);
      try {
        const url = `https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(q)}&treffPerSide=6&utkoordsys=4326`;
        const data = await devFetch(url, (d: unknown) => {
          const result = d as { adresser?: unknown[] };
          return `${result.adresser?.length ?? 0} adresser funnet`;
        });
        setSuggestions((data as { adresser?: Address[] }).adresser ?? []);
        setShowDropdown(true);
      } catch {
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    },
    [devFetch]
  );

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setHighlightedIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchAddresses(val), 300);
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
      const addr = suggestions[highlightedIndex];
      setQuery(`${addr.adressetekst}, ${addr.poststed}`);
      setShowDropdown(false);
      setHighlightedIndex(-1);
      handleMapClick(addr.representasjonspunkt.lat, addr.representasjonspunkt.lon);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }
  };

  const handleLocate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    setLocateError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        handleMapClick(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setLocating(false);
        handleMapClick(59.91, 10.75);
        setLocateError(true);
        setTimeout(() => setLocateError(false), 4000);
      },
      { timeout: 15000, maximumAge: 60000 }
    );
  };


  const isWithinNorway = (lat: number, lon: number) =>
    lat >= 57.0 && lat <= 81.0 && lon >= 4.0 && lon <= 32.0;

  const fetchNearestName = useCallback(async (lat: number, lon: number): Promise<{ name: string; roadCoords?: { lat: number; lon: number } }> => {
    type AdresseHit = { adressetekst: string; poststed: string; kommunenavn: string; representasjonspunkt?: { lat: number; lon: number } };
    type AdresseResponse = { adresser?: AdresseHit[] };

    const fetchAddr = async (radius: number) => {
      const data = await devFetch(
        `https://ws.geonorge.no/adresser/v1/punktsok?lat=${lat}&lon=${lon}&radius=${radius}&utkoordsys=4326&treffPerSide=1`,
        (d: unknown) => {
          const a = (d as AdresseResponse).adresser?.[0];
          return a ? `${a.adressetekst}, ${a.poststed}` : "Ingen adresse";
        }
      );
      return (data as AdresseResponse).adresser?.[0] ?? null;
    };

    // 1. Building — close address hit (≤ 50m)
    try {
      const hit = await fetchAddr(50);
      if (hit) return {
        name: `${hit.adressetekst}, ${hit.poststed}`,
        roadCoords: hit.representasjonspunkt,
      };
    } catch { /* fall through */ }

    // 2. Road — medium radius (≤ 400m), strip house number to get street name
    try {
      const hit = await fetchAddr(400);
      if (hit) {
        const street = hit.adressetekst.replace(/\s+\d+\w*$/, "").trim();
        return {
          name: `${street}, ${hit.poststed}`,
          roadCoords: hit.representasjonspunkt,
        };
      }
    } catch { /* fall through */ }

    // 3. Place name — stedsnavn within 5km (mountains, lakes, forests)
    try {
      const data = await devFetch(
        `https://ws.geonorge.no/stedsnavn/v1/punkt?nord=${lat}&ost=${lon}&koordsys=4326&radius=5000&treffPerSide=1`,
        (d: unknown) => {
          const result = d as { navn?: Array<{ stedsnavn?: Array<{ skrivemåte: string }> }> };
          return result.navn?.[0]?.stedsnavn?.[0]?.skrivemåte ?? "Ingen stedsnavn";
        }
      );
      const name = (data as { navn?: Array<{ stedsnavn?: Array<{ skrivemåte: string }> }> }).navn?.[0]?.stedsnavn?.[0]?.skrivemåte;
      if (name) return { name };
    } catch { /* fall through */ }

    // 4. Fallback to raw coordinates
    return { name: `${lat.toFixed(5)}, ${lon.toFixed(5)}` };
  }, [devFetch]);

  const fetchLocationData = useCallback(async (address: Address) => {
    const { lat, lon } = address.representasjonspunkt;
    setLoadingElevation(true);
    setLoadingWeather(true);

    // Fetch elevation and weather in parallel
    const [elevationData, weatherData] = await Promise.allSettled([
      devFetch(
        `https://ws.geonorge.no/hoydedata/v1/punkt?koordsys=4326&nord=${lat}&ost=${lon}`,
        (d: unknown) => {
          const result = d as { punkter?: Array<{ z: number | null; datakilde: string }> };
          const p = result.punkter?.[0];
          return p?.z != null ? `${p.z.toFixed(1)} moh. (${p.datakilde})` : "Ingen data";
        }
      ),
      devFetch(
        `/api/weather?lat=${lat}&lon=${lon}`,
        (d: unknown) => {
          const w = d as WeatherResult;
          return `${w.temperature}°C, ${w.symbolCode}`;
        }
      ),
    ]);

    const høyde = elevationData.status === "fulfilled"
      ? (elevationData.value as { punkter?: Array<{ z: number | null; datakilde: string; terrengtype?: string }> }).punkter?.[0]
      : null;

    setSelected((prev) => ({
      yrSearchName: prev?.yrSearchName ?? "",
      mapsCoords: prev?.mapsCoords ?? address.representasjonspunkt,
      address,
      elevation: høyde ? { datakilde: høyde.datakilde, høyde: høyde.z, terrengtype: høyde.terrengtype } : null,
      weather: weatherData.status === "fulfilled" ? (weatherData.value as WeatherResult) : null,
    }));

    setLoadingElevation(false);
    setLoadingWeather(false);
  }, [devFetch]);

  const handleMapClick = async (lat: number, lon: number) => {
    setShowDropdown(false);
    setSuggestions([]);

    if (!isWithinNorway(lat, lon)) {
      setQuery(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
      setSelected({ address: { adressetekst: "Utenfor Norge", poststed: "", kommunenavn: "", representasjonspunkt: { lat, lon } }, elevation: null, weather: null, yrSearchName: "", mapsCoords: { lat, lon } });
      return;
    }

    const address: Address = {
      adressetekst: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
      poststed: "",
      kommunenavn: "",
      representasjonspunkt: { lat, lon },
    };
    setQuery(address.adressetekst);
    setSelected({ address, elevation: null, weather: null, yrSearchName: "", mapsCoords: { lat, lon } });

    const [nearest] = await Promise.all([
      fetchNearestName(lat, lon),
      fetchLocationData(address),
    ]);
    setQuery(nearest.name);
    setSelected((prev) => prev && {
      ...prev,
      address: { ...prev.address, adressetekst: nearest.name },
      yrSearchName: nearest.name,
      mapsCoords: nearest.roadCoords ?? { lat, lon },
    });
  };

  const handleSelect = async (address: Address) => {
    setShowDropdown(false);
    setQuery(`${address.adressetekst}, ${address.poststed}`);
    setSuggestions([]);
    setSelected({ address, elevation: null, weather: null, yrSearchName: `${address.adressetekst}, ${address.poststed}`, mapsCoords: address.representasjonspunkt });
    fetchLocationData(address);
  };

  const lat = selected?.address.representasjonspunkt.lat ?? 65;
  const lon = selected?.address.representasjonspunkt.lon ?? 14;

  return (
    <div className="flex flex-col" style={{ height: "calc(100svh - 57px - 56px)" }}>
      {/* API health banner */}
      {apiDown && !apiBannerDismissed && (
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2.5 bg-yellow-50 border-b border-yellow-200 text-yellow-800 text-sm">
          <p>Eksterne APIer svarer ikke, søk og høydedata kan være utilgjengelig. Prøv igjen senere.</p>
          <button
            onClick={() => setApiBannerDismissed(true)}
            className="shrink-0 p-1 rounded hover:bg-yellow-100 transition-colors"
            aria-label="Lukk"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
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
                ref={inputRef}
                value={query}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                autoFocus
                onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder="Søk etter en adresse i Norge..."
                className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground text-[16px] sm:text-sm"
              />
            </div>
            <Button onClick={handleLocate} disabled={locating} variant="secondary" size="icon" className="shadow-lg shrink-0 h-11 w-11 rounded-xl">
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            </Button>
          </div>

          {showDropdown && suggestions.length > 0 && (
            <ul className="absolute top-full mt-1 left-0 right-0 bg-background rounded-xl shadow-xl border overflow-hidden">
              {suggestions.map((addr, i) => (
                <li key={i}>
                  <button
                    onMouseDown={() => handleSelect(addr)}
                    className={`w-full text-left px-4 py-3 text-sm flex items-start gap-3 transition-colors border-b last:border-0 ${highlightedIndex === i ? "bg-muted" : "hover:bg-muted"}`}
                  >
                    <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{addr.adressetekst}</p>
                      <p className="text-xs text-foreground/70">
                        {addr.poststed}, {addr.kommunenavn}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="relative grow [&_.leaflet-grab]:cursor-pointer [&_.leaflet-dragging_.leaflet-grab]:cursor-grabbing">
        {locateError && (
          <div className="absolute bottom-20 sm:top-3 sm:bottom-auto left-1/2 -translate-x-1/2 z-[1000] bg-background/90 backdrop-blur-sm border rounded-full px-4 py-2 shadow-lg">
            <p className="text-sm text-muted-foreground">Kunne ikke finne posisjon, viser Oslo i stedet.</p>
          </div>
        )}
        <MapContainer
          center={[65, 14]}
          zoom={5}
          style={{ height: "100%", width: "100%" }}
          zoomControl={true}
        >
          <MapClickHandler onMapClick={handleMapClick} />
          <TileLayer
            key={tileLayer}
            url={TILE_LAYERS[tileLayer].url}
            attribution={TILE_LAYERS[tileLayer].attribution}
            maxZoom={17}
          />
          {selected && (
            <>
              <FlyTo lat={lat} lon={lon} zoom={16} />
              <Marker position={[lat, lon]}>
                <Popup>
                  <strong>{selected.address.adressetekst}</strong>
                  <br />
                  {selected.address.poststed}, {selected.address.kommunenavn}
                  {selected.elevation?.høyde != null && (
                    <><br /><span className="font-semibold">{selected.elevation.høyde.toFixed(1)} moh.</span></>
                  )}
                </Popup>
              </Marker>
            </>
          )}
        </MapContainer>

        {/* Tile layer toggle */}
        <div className="absolute top-3 right-3 z-[999] flex rounded-lg border bg-card shadow-md overflow-hidden">
          {(["kart", "terreng"] as TileLayerKey[]).map((key, i) => (
            <button
              key={key}
              onClick={() => setTileLayer(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${i > 0 ? "border-l" : ""} ${tileLayer === key ? "text-white" : "text-muted-foreground hover:bg-muted"}`}
              style={tileLayer === key ? { background: "var(--kv-blue)" } : {}}
            >
              {key === "kart" ? <MapIcon className="h-3.5 w-3.5" /> : <Mountain className="h-3.5 w-3.5" />}
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
            {/* Layer 1 — Identity */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-base truncate leading-snug">{selected.address.adressetekst}</p>
                {selected.address.poststed && (
                  <p className="text-xs text-foreground/70 truncate">
                    {selected.address.poststed}, {selected.address.kommunenavn}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelected(null)}
                className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Lukk"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Layer 2 — Elevation */}
            <div className="mt-3">
              {loadingElevation ? (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Henter høyde...
                </div>
              ) : selected.elevation?.høyde != null ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold" style={{ color: "var(--kv-blue)" }}>
                    {selected.elevation.høyde.toFixed(1)}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">moh.</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Ingen høydedata</p>
              )}
            </div>

            {/* Action row */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setShowInfoSheet(true)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl text-white transition-colors hover:opacity-90"
                style={{ background: "var(--kv-blue)" }}
              >
                <ChevronUp className="h-3.5 w-3.5" /> Vis mer
              </button>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${selected.mapsCoords?.lat ?? selected.address.representasjonspunkt.lat},${selected.mapsCoords?.lon ?? selected.address.representasjonspunkt.lon}`}
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
                  <SheetTitle className="text-left sr-only">{selected.address.adressetekst}</SheetTitle>
                </SheetHeader>

                {/* Layer 1 — Identity */}
                <p className="font-bold text-lg leading-snug">{selected.address.adressetekst}</p>
                {selected.address.poststed && (
                  <p className="text-sm text-muted-foreground">
                    {selected.address.poststed}, {selected.address.kommunenavn}
                  </p>
                )}
                <p className="text-xs text-foreground/70 font-mono mt-0.5">
                  {selected.address.representasjonspunkt.lat.toFixed(5)}, {selected.address.representasjonspunkt.lon.toFixed(5)}
                </p>

                {/* Layer 2 — Elevation */}
                <div className="mt-4 pt-4 border-t">
                  {loadingElevation ? (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Henter høyde...
                    </div>
                  ) : selected.elevation?.høyde != null ? (
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold" style={{ color: "var(--kv-blue)" }}>
                        {selected.elevation.høyde.toFixed(1)}
                      </span>
                      <span className="text-sm font-medium text-muted-foreground">meter over havet</span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Ingen høydedata</p>
                  )}
                  {selected.elevation?.datakilde && (
                    <p className="text-xs text-foreground/70 mt-1">Kilde: {selected.elevation.datakilde}</p>
                  )}
                </div>

                {/* Layer 3 — Weather */}
                {(loadingWeather || selected.weather) && (
                  <div className="mt-4 pt-4 border-t">
                    {loadingWeather ? (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Henter vær...
                      </div>
                    ) : selected.weather && (() => {
                      const WeatherIcon = weatherIcon(selected.weather.symbolCode);
                      const yrUrl = `https://www.yr.no/nb/søk?q=${encodeURIComponent(selected.yrSearchName || selected.address.adressetekst)}`;
                      return (
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <WeatherIcon className="h-9 w-9 shrink-0" style={{ color: "var(--kv-blue)" }} />
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                              <span className="text-xl font-extrabold" style={{ color: "var(--kv-blue)" }}>
                                {selected.weather.temperature.toFixed(1)}°C
                              </span>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Wind className="h-3.5 w-3.5" />
                                  {selected.weather.windSpeed.toFixed(1)} m/s
                                </span>
                                <span className="flex items-center gap-1">
                                  <Droplets className="h-3.5 w-3.5" />
                                  {selected.weather.precipitation.toFixed(1)} mm
                                </span>
                              </div>
                            </div>
                          </div>
                          <a
                            href={yrUrl}
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

                {/* Layer 4 — Links & source */}
                <div className="mt-4 pt-4 border-t flex flex-col gap-3">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selected.mapsCoords?.lat ?? selected.address.representasjonspunkt.lat},${selected.mapsCoords?.lon ?? selected.address.representasjonspunkt.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border bg-muted/50 hover:bg-muted transition-colors w-full"
                  >
                    <Navigation className="h-4 w-4" /> Kjør hit
                  </a>
                  <p className="text-xs text-foreground/70 text-center">
                    Kilde: Kartverket, MET.no
                  </p>
                  <DataDisclaimer />
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {!selected && (
          <div className="absolute inset-0 flex items-end justify-center pb-8 pointer-events-none z-[998]">
            <div className="bg-card/90 backdrop-blur-sm rounded-xl px-5 py-3 shadow text-sm text-muted-foreground">
              Søk etter en adresse for å se høyden over havet
            </div>
          </div>
        )}

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
              <h2 className="font-bold text-base">Om høydekartet</h2>
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
                Søk etter en adresse eller klikk i kartet for å se <span className="font-medium text-foreground">høyde over havet</span> for et punkt i Norge.
              </p>
              <p>
                <span className="font-medium text-foreground">Høydedata</span> hentes fra Kartverkets høyde-API og er basert på den nasjonale terrengmodellen (DTM). Nøyaktigheten varierer, men er typisk ±2–5 meter.
              </p>
              <p>
                <span className="font-medium text-foreground">Værdata</span> hentes fra MET.no (Meteorologisk institutt) og viser gjeldende temperatur, vindstyrke og nedbør for det valgte punktet.
              </p>
              <p>
                Kartet bruker <span className="font-medium text-foreground">Kartverket</span> for bakgrunnskart og <span className="font-medium text-foreground">OpenTopoMap</span> for terrengvisning.
              </p>
              <div className="flex gap-3 mt-1">
                <a
                  href="https://www.kartverket.no/api-og-data/hoydedata"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Kartverket
                </a>
                <a
                  href="https://api.met.no/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  MET.no
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
