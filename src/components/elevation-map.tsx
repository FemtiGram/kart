"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Search, MapPin, Mountain, Loader2, X, ChevronDown, ChevronUp, LocateFixed, Wind, Droplets, Sun, Cloud, CloudSun, CloudRain, CloudSnow, CloudLightning, CloudFog, CloudHail, CloudDrizzle, Moon, ExternalLink, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

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

const DEV = process.env.NEXT_PUBLIC_DEV === "true";

const TILE_LAYERS = {
  kart: {
    label: "Kart",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  terreng: {
    label: "Terreng",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
  },
} as const;

type TileLayerKey = keyof typeof TILE_LAYERS;

interface Address {
  adressetekst: string;
  poststed: string;
  kommunenavn: string;
  representasjonspunkt: { lat: number; lon: number };
}

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

interface DevLogEntry {
  id: number;
  time: string;
  url: string;
  duration: number;
  summary: string;
  ok: boolean;
}


function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyTo({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], 16, { duration: 1.2 });
  }, [lat, lon, map]);
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
  const [tileLayer, setTileLayer] = useState<TileLayerKey>("kart");
  const [locating, setLocating] = useState(false);
  const [devLog, setDevLog] = useState<DevLogEntry[]>([]);
  const logIdRef = useRef(0);
  const [devOpen, setDevOpen] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const devFetch = useCallback(async (url: string, summary: (data: unknown) => string) => {
    const t0 = performance.now();
    const res = await fetch(url);
    const data = await res.json();
    const duration = Math.round(performance.now() - t0);
    if (DEV) {
      setDevLog((prev) => [
        {
          id: ++logIdRef.current,
          time: new Date().toLocaleTimeString("no-NO"),
          url,
          duration,
          summary: summary(data),
          ok: res.ok,
        },
        ...prev.slice(0, 19),
      ]);
    }
    return data;
  }, []);

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
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchAddresses(val), 300);
  };

  const handleLocate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        handleMapClick(pos.coords.latitude, pos.coords.longitude);
      },
      () => setLocating(false)
    );
  };

  const isWithinNorway = (lat: number, lon: number) =>
    lat >= 57.0 && lat <= 81.0 && lon >= 4.0 && lon <= 32.0;

  const fetchNearestName = useCallback(async (lat: number, lon: number): Promise<{ name: string; roadCoords?: { lat: number; lon: number } }> => {
    // Try stedsnavn first (covers mountains, lakes, peaks etc.)
    try {
      const data = await devFetch(
        `https://ws.geonorge.no/stedsnavn/v1/punkt?nord=${lat}&ost=${lon}&koordsys=4326&radius=5000&treffPerSide=1`,
        (d: unknown) => {
          const result = d as { navn?: Array<{ stedsnavn?: Array<{ skrivemåte: string }> }> };
          return result.navn?.[0]?.stedsnavn?.[0]?.skrivemåte ?? "Ingen stedsnavn";
        }
      );
      const name = (data as { navn?: Array<{ stedsnavn?: Array<{ skrivemåte: string }> }> }).navn?.[0]?.stedsnavn?.[0]?.skrivemåte;
      if (name) {
        // Still fetch nearest road for Maps navigation
        try {
          const roadData = await devFetch(
            `https://ws.geonorge.no/adresser/v1/punktsok?lat=${lat}&lon=${lon}&radius=5000&utkoordsys=4326&treffPerSide=1`,
            (d: unknown) => {
              const r = d as { adresser?: Array<{ adressetekst: string; representasjonspunkt?: { lat: number; lon: number } }> };
              return r.adresser?.[0]?.adressetekst ?? "Ingen vei";
            }
          );
          const road = (roadData as { adresser?: Array<{ representasjonspunkt?: { lat: number; lon: number } }> }).adresser?.[0];
          return { name, roadCoords: road?.representasjonspunkt };
        } catch { /* ignore */ }
        return { name };
      }
    } catch { /* fall through */ }

    // Fall back to nearest address
    try {
      const data = await devFetch(
        `https://ws.geonorge.no/adresser/v1/punktsok?lat=${lat}&lon=${lon}&radius=2000&utkoordsys=4326&treffPerSide=1`,
        (d: unknown) => {
          const result = d as { adresser?: Array<{ adressetekst: string; poststed: string }> };
          const a = result.adresser?.[0];
          return a ? `${a.adressetekst}, ${a.poststed}` : "Ingen adresse";
        }
      );
      const addr = (data as { adresser?: Array<{ adressetekst: string; poststed: string; representasjonspunkt?: { lat: number; lon: number } }> }).adresser?.[0];
      if (addr) return { name: `${addr.adressetekst}, ${addr.poststed}`, roadCoords: addr.representasjonspunkt };
    } catch { /* fall through */ }

    return { name: `${lat.toFixed(4)}, ${lon.toFixed(4)}` };
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
    setSelected((prev) => prev && { ...prev, yrSearchName: nearest.name, mapsCoords: nearest.roadCoords ?? { lat, lon } });
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
    <div className="flex flex-col" style={{ height: "calc(100svh - 57px)" }}>
      {/* Search bar */}
      <div className="relative z-[1000] px-4 py-4 md:px-8 shrink-0 bg-background border-b">
        <div className="max-w-xl mx-auto relative flex flex-col sm:flex-row sm:items-center gap-2">
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
              autoFocus
              onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              placeholder="Søk etter en adresse i Norge..."
              className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground text-[16px] sm:text-sm"
            />
          </div>
          <Button
            onClick={handleLocate}
            disabled={locating}
            variant="secondary"
            size="lg"
            className="w-full sm:w-auto shadow-lg"
          >
            {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
            Min posisjon
          </Button>

          {showDropdown && suggestions.length > 0 && (
            <ul className="absolute top-full mt-1 left-0 right-0 bg-background rounded-xl shadow-xl border overflow-hidden">
              {suggestions.map((addr, i) => (
                <li key={i}>
                  <button
                    onMouseDown={() => handleSelect(addr)}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-muted flex items-start gap-3 transition-colors border-b last:border-0"
                  >
                    <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{addr.adressetekst}</p>
                      <p className="text-xs text-muted-foreground">
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
              <FlyTo lat={lat} lon={lon} />
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
        <div className="absolute top-3 right-3 z-[999] flex rounded-lg border bg-white shadow-md overflow-hidden">
          {(["kart", "terreng"] as TileLayerKey[]).map((key, i) => (
            <button
              key={key}
              onClick={() => setTileLayer(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${i > 0 ? "border-l" : ""} ${tileLayer === key ? "text-white" : "text-muted-foreground hover:bg-muted"}`}
              style={tileLayer === key ? { background: "var(--kv-blue)" } : {}}
            >
              {key === "kart" ? <Map className="h-3.5 w-3.5" /> : <Mountain className="h-3.5 w-3.5" />}
              {TILE_LAYERS[key].label}
            </button>
          ))}
        </div>

        {/* Elevation card */}
        {selected && (
          <div
            className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-96 z-[999] bg-white rounded-2xl shadow-xl px-4 py-4"
            style={{ border: "1.5px solid var(--kv-green-light, #b3e6c8)" }}
          >
            <div className="flex items-start">
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{selected.address.adressetekst}</p>
                    {selected.address.poststed && (
                      <p className="text-xs text-muted-foreground truncate">
                        {selected.address.poststed}, {selected.address.kommunenavn}
                      </p>
                    )}
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${selected.mapsCoords?.lat ?? selected.address.representasjonspunkt.lat},${selected.mapsCoords?.lon ?? selected.address.representasjonspunkt.lon}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 w-fit"
                    >
                      Veibeskrivelse <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label="Lukk"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2">
                  {loadingElevation ? (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Henter høyde...
                    </div>
                  ) : selected.elevation?.høyde != null ? (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-extrabold" style={{ color: "var(--kv-blue)" }}>
                        {selected.elevation.høyde.toFixed(1)}
                      </span>
                      <span className="text-sm text-muted-foreground font-medium">meter over havet</span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Ingen høydedata</p>
                  )}
                  {selected.elevation?.datakilde && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Kilde: {selected.elevation.datakilde}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Weather row */}
            {(loadingWeather || selected.weather) && (
              <div className="mt-3 pt-3 border-t">
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
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      >
                        yr.no <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {!selected && (
          <div className="absolute inset-0 flex items-end justify-center pb-8 pointer-events-none z-[998]">
            <div className="bg-white/90 backdrop-blur-sm rounded-xl px-5 py-3 shadow text-sm text-muted-foreground">
              Søk etter en adresse for å se høyden over havet
            </div>
          </div>
        )}

        {/* Dev panel */}
        {DEV && (
          <div className="absolute bottom-3 right-3 z-[1000] w-80 rounded-xl border shadow-xl overflow-hidden font-mono text-[11px]"
            style={{ background: "#0f172a", color: "#94a3b8", borderColor: "#1e293b" }}
          >
            <div
              className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
              style={{ background: "#1e293b", color: "#e2e8f0" }}
              onClick={() => setDevOpen((o) => !o)}
            >
              <span className="font-semibold tracking-wide">DEV · API Log</span>
              <div className="flex items-center gap-2">
                <span style={{ color: "#64748b" }}>{devLog.length} kall</span>
                {devOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </div>
            </div>
            {devOpen && (
              <div className="max-h-56 overflow-y-auto divide-y" style={{ borderColor: "#1e293b" }}>
                {devLog.length === 0 ? (
                  <p className="px-3 py-4 text-center" style={{ color: "#475569" }}>
                    Ingen kall ennå — søk etter en adresse
                  </p>
                ) : (
                  devLog.map((entry) => (
                    <div key={entry.id} className="px-3 py-2 flex flex-col gap-0.5">
                      <div className="flex items-center justify-between">
                        <span style={{ color: entry.ok ? "#4ade80" : "#f87171" }}>
                          {entry.ok ? "200 OK" : "ERR"}
                        </span>
                        <span style={{ color: "#475569" }}>{entry.time} · {entry.duration}ms</span>
                      </div>
                      <span className="truncate" style={{ color: "#7dd3fc" }}>{entry.url}</span>
                      <span style={{ color: "#cbd5e1" }}>{entry.summary}</span>
                    </div>
                  ))
                )}
              </div>
            )}
            {devOpen && devLog.length > 0 && (
              <button
                onClick={() => setDevLog([])}
                className="flex items-center gap-1 w-full justify-center py-1.5 text-[10px] transition-colors hover:opacity-80"
                style={{ background: "#1e293b", color: "#64748b" }}
              >
                <X className="h-3 w-3" /> Tøm logg
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
