"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, X, Search, MapPin, ExternalLink, Info, Map as MapIcon, Layers, LocateFixed, Mountain, Wind, Droplets, Sun, Cloud, CloudSun, CloudRain, CloudSnow, CloudLightning, CloudFog, CloudHail, CloudDrizzle, Moon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FYLKER } from "@/lib/fylker";

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

interface Address {
  adressetekst: string;
  poststed: string;
  kommunenavn: string;
  representasjonspunkt: { lat: number; lon: number };
}

interface KommuneEntry {
  kommunenummer: string;
  kommunenavn: string;
}

type Suggestion =
  | { type: "fylke"; fylkesnavn: string; lat: number; lon: number; zoom: number }
  | { type: "kommune"; kommunenummer: string; kommunenavn: string }
  | { type: "adresse"; addr: Address };

interface Cabin {
  id: number;
  lat: number;
  lon: number;
  name: string;
  operator: string | null;
  cabinType: "betjent" | "selvbetjent" | "ubetjent" | "privat";
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
  betjent: "#b91c1c",
  selvbetjent: "#2563eb",
  ubetjent: "#16a34a",
  privat: "#737373",
};

const CABIN_LABELS: Record<Cabin["cabinType"], string> = {
  betjent: "Betjent",
  selvbetjent: "Selvbetjent",
  ubetjent: "Ubetjent",
  privat: "Annen hytte",
};

// SVG cabin icons — filled for betjent/selvbetjent, outline for ubetjent/privat
function cabinIcon(type: Cabin["cabinType"], isSelected: boolean, inverted: boolean): L.DivIcon {
  const baseColor = isSelected ? "#003da5" : CABIN_COLORS[type];
  const size = type === "betjent" || type === "selvbetjent" ? 30 : 26;
  const filled = type === "betjent" || type === "selvbetjent";
  const bg = inverted ? baseColor : "white";
  const iconColor = inverted ? "white" : baseColor;
  const border = isSelected ? "#003da5" : inverted ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.15)";

  const housePath = filled
    ? `<path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1z" fill="${iconColor}" stroke="${iconColor}" stroke-width="1.5"/>`
    : `<path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1z" fill="none" stroke="${iconColor}" stroke-width="2"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size * 0.5}" height="${size * 0.5}">${housePath}</svg>`;

  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${bg};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.25);border:2.5px solid ${border}">${svg}</div>`,
  });
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

function FlyTo({ lat, lon, zoom = 10 }: { lat: number; lon: number; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], zoom, { duration: 1.2 });
  }, [lat, lon, zoom, map]);
  return null;
}

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
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Cabin | null>(null);
  const [center, setCenter] = useState<{ lat: number; lon: number; zoom?: number; _t?: number } | null>(null);
  const [tileLayer, setTileLayer] = useState<TileLayerKey>("gråtone");
  const [showInfo, setShowInfo] = useState(false);
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kommunerRef = useRef<KommuneEntry[]>([]);

  useEffect(() => {
    fetch("https://ws.geonorge.no/kommuneinfo/v1/kommuner")
      .then((r) => r.json())
      .then((data: KommuneEntry[]) => { kommunerRef.current = data; })
      .catch(() => {});
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return; }
    setLoadingSuggestions(true);

    const fylkeMatches: Suggestion[] = FYLKER
      .filter((f) => f.fylkesnavn.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 3)
      .map((f) => ({ type: "fylke", fylkesnavn: f.fylkesnavn, lat: f.lat, lon: f.lon, zoom: f.zoom }));

    const kommuneMatches: Suggestion[] = kommunerRef.current
      .filter((k) => k.kommunenavn.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 5)
      .map((k) => ({ type: "kommune", kommunenummer: k.kommunenummer, kommunenavn: k.kommunenavn }));

    let adresseMatches: Suggestion[] = [];
    try {
      const res = await fetch(`https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(q)}&treffPerSide=2&utkoordsys=4326`);
      const data = await res.json();
      adresseMatches = (data.adresser ?? []).map((a: Address) => ({ type: "adresse" as const, addr: a }));
    } catch { /* ignore */ }

    setSuggestions([...fylkeMatches, ...kommuneMatches, ...adresseMatches]);
    setShowDropdown(true);
    setLoadingSuggestions(false);
  }, []);

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

  const handleSelect = async (s: Suggestion) => {
    setShowDropdown(false);
    setSuggestions([]);
    setSelected(null);
    if (s.type === "fylke") {
      setQuery(s.fylkesnavn);
      setCenter({ lat: s.lat, lon: s.lon, zoom: s.zoom });
      return;
    }
    if (s.type === "kommune") {
      setQuery(s.kommunenavn);
      const res = await fetch(
        `https://ws.geonorge.no/stedsnavn/v1/navn?sok=${encodeURIComponent(s.kommunenavn)}&kommunenummer=${s.kommunenummer}&treffPerSide=1`
      );
      const data = await res.json();
      const point = data.navn?.[0]?.representasjonspunkt;
      if (point) {
        setCenter({ lat: point.nord, lon: point.øst });
      }
    } else {
      setQuery(`${s.addr.adressetekst}, ${s.addr.poststed}`);
      setCenter({ lat: s.addr.representasjonspunkt.lat, lon: s.addr.representasjonspunkt.lon });
    }
  };

  const handleLocate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setSelected(null);
        setCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude, zoom: 12, _t: Date.now() });
      },
      () => setLocating(false),
      { timeout: 6000 }
    );
  };

  // Load cabins from pre-built static JSON, fallback to live Overpass
  useEffect(() => {
    const OVERPASS_QUERY = '[out:json][timeout:15];(node["tourism"="alpine_hut"](57.5,4.0,71.5,31.5);node["tourism"="wilderness_hut"](57.5,4.0,71.5,31.5);way["tourism"="alpine_hut"](57.5,4.0,71.5,31.5);way["tourism"="wilderness_hut"](57.5,4.0,71.5,31.5););out center body;';

    function parseCabins(elements: Array<{ id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags: Record<string, string> }>) {
      return elements.map((el) => {
        const t = el.tags || {};
        const lat = el.lat ?? el.center?.lat ?? 0;
        const lon = el.lon ?? el.center?.lon ?? 0;
        const isDNT = /turistforening|dnt/i.test(t.operator ?? "");
        const tourism = t.tourism;
        let cabinType: Cabin["cabinType"] = "privat";
        if (isDNT) {
          if (tourism === "alpine_hut") cabinType = "betjent";
          if (tourism === "wilderness_hut") cabinType = "ubetjent";
          if (t["reservation"] === "required" || t["self_service"] === "yes" || /selvbetjent/i.test(t.description ?? "")) cabinType = "selvbetjent";
        } else {
          cabinType = tourism === "alpine_hut" ? "betjent" : "ubetjent";
        }
        const rawHours = t.opening_hours ?? null;
        let season: string | null = null;
        if (rawHours) {
          const h = rawHours.toLowerCase();
          season = (h === "24/7" || h.includes("jan-dec") || h.includes("mo-su")) ? "Helårs" : rawHours.charAt(0).toUpperCase() + rawHours.slice(1);
        }
        return { id: el.id, lat, lon, name: t.name ?? "Ukjent hytte", operator: t.operator ?? null, cabinType, isDNT, elevation: t.ele ? parseInt(t.ele) : null, beds: t.beds ? parseInt(t.beds) : t.capacity ? parseInt(t.capacity) : null, website: t.website ?? t["contact:website"] ?? null, description: t.description ?? null, fee: t.fee === "yes" ? true : t.fee === "no" ? false : null, season, phone: t.phone ?? t["contact:phone"] ?? null, shower: t.shower === "yes" ? true : t.shower === "no" ? false : null };
      }).filter((c) => c.lat !== 0 && c.lon !== 0);
    }

    function flyToStart() {
      const pref = localStorage.getItem("mapgram-use-location");
      if (pref === "yes" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => setCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude, zoom: 10 }),
          () => setCenter({ lat: 61.5, lon: 8.3, zoom: 9 }),
          { timeout: 6000 }
        );
      } else {
        setCenter({ lat: 61.5, lon: 8.3, zoom: 9 });
      }
    }

    fetch("/data/cabins.json")
      .then((r) => r.json())
      .then(async (data) => {
        if (Array.isArray(data) && data.length > 0) {
          setCabins(data);
        } else {
          // Static file empty — fallback to live Overpass
          try {
            const res = await fetch("https://overpass-api.de/api/interpreter", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
            });
            if (res.ok) {
              const osm = await res.json();
              setCabins(parseCabins(osm.elements ?? []));
            }
          } catch { /* ignore — show empty state */ }
        }
        setLoading(false);
        flyToStart();
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  // Fetch weather when a cabin is selected
  useEffect(() => {
    if (!selected) { setWeather(null); return; }
    setLoadingWeather(true);
    fetch(`/api/weather?lat=${selected.lat}&lon=${selected.lon}`)
      .then((r) => r.json())
      .then((data) => { setWeather(data); setLoadingWeather(false); })
      .catch(() => setLoadingWeather(false));
  }, [selected?.id]);

  const dntCount = cabins.filter((c) => c.isDNT).length;

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
              value={query}
              onChange={handleInput}
              onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              onKeyDown={handleKeyDown}
              placeholder="Søk etter fjellområde eller sted..."
              className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground text-[16px] sm:text-sm"
            />
          </div>
          <Button onClick={handleLocate} disabled={locating || loading} variant="secondary" size="lg" className="w-full sm:w-auto shadow-lg">
            {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
            Min posisjon
          </Button>

          {showDropdown && suggestions.length > 0 && (
            <ul className="absolute top-full mt-1 left-0 right-0 sm:right-auto sm:w-[calc(100%-theme(spacing.2)-theme(spacing.36))] bg-background rounded-xl shadow-xl border overflow-hidden">
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
                        <p className="text-xs text-muted-foreground">Fylke</p>
                      </div>
                    ) : s.type === "kommune" ? (
                      <div>
                        <p className="font-medium">{s.kommunenavn}</p>
                        <p className="text-xs text-muted-foreground">Kommune</p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-medium">{s.addr.adressetekst}</p>
                        <p className="text-xs text-muted-foreground">{s.addr.poststed}, {s.addr.kommunenavn}</p>
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-muted-foreground">
            {loading ? "Henter hytter..." : cabins.length > 0 ? `${cabins.length} hytter (${dntCount} DNT) i Norge — Kilde: OpenStreetMap` : "Ingen hytter funnet"}
          </p>
        </div>
      </div>

      {/* Map */}
      <div className="relative grow">
        {loading && (
          <div className="absolute inset-0 z-[1000] bg-background p-4 flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="h-8 w-32 rounded-lg skeleton-shimmer" />
              <div className="h-8 w-24 rounded-lg skeleton-shimmer" />
            </div>
            <div className="flex-1 rounded-xl skeleton-shimmer" />
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
        {error && (
          <div className="absolute bottom-20 sm:top-3 sm:bottom-auto left-1/2 -translate-x-1/2 z-[1000] bg-destructive/10 backdrop-blur-sm border border-destructive/30 rounded-full px-4 py-2 shadow-lg">
            <p className="text-sm text-destructive">Kunne ikke laste data. Prøv igjen senere.</p>
          </div>
        )}

        <MapContainer
          center={[61.5, 8.3]}
          zoom={9}
          style={{ height: "100%", width: "100%" }}
        >
          {center && <FlyTo lat={center.lat} lon={center.lon} zoom={center.zoom} />}
          <PanToSelected cabin={selected} />
          <TileLayer
            key={tileLayer}
            url={TILE_LAYERS[tileLayer].url}
            attribution={TILE_LAYERS[tileLayer].attribution}
            maxZoom={17}
          />
          {cabins.map((c) => (
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
        </MapContainer>

        {/* Legend + tile toggle */}
        <div className="absolute top-3 right-3 z-[999] flex flex-col gap-2 items-end">
          <div className="flex rounded-lg border bg-white shadow-md overflow-hidden">
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

          {/* Color legend */}
          <div className="bg-white/90 rounded-xl border px-3 py-2 shadow text-xs">
            <p className="font-semibold text-muted-foreground mb-1.5">Hyttetype</p>
            <div className="flex flex-col gap-1">
              {(["betjent", "selvbetjent", "ubetjent", "privat"] as const).map((type) => (
                <div key={type} className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ background: CABIN_COLORS[type] }} />
                  <span className="text-muted-foreground">{CABIN_LABELS[type]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Info card */}
        {selected && (
          <div
            className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-96 z-[999] bg-white rounded-2xl shadow-xl px-4 py-4"
            style={{ border: "1.5px solid var(--kv-green-light, #b3e6c8)" }}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white"
                    style={{ background: CABIN_COLORS[selected.cabinType] }}
                  >
                    {CABIN_LABELS[selected.cabinType]}
                  </span>
                  {selected.isDNT && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                      DNT
                    </span>
                  )}
                  {selected.fee === false && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-green-100 text-green-800">
                      Gratis
                    </span>
                  )}
                  {selected.fee === true && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      Betalt
                    </span>
                  )}
                  {selected.season && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                      {selected.season}
                    </span>
                  )}
                </div>
                <p className="font-bold text-base truncate leading-snug mt-1">{selected.name}</p>
                {selected.operator && selected.operator !== selected.name && (
                  <p className="text-xs text-muted-foreground truncate">{selected.operator}</p>
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

            {/* Stats row */}
            <div className="border-t pt-3 mb-3 flex items-center gap-6">
              {selected.elevation != null && (
                <div className="flex items-baseline gap-1.5">
                  <Mountain className="h-3.5 w-3.5 text-muted-foreground self-center" />
                  <span className="text-2xl font-extrabold" style={{ color: "var(--kv-blue)" }}>
                    {selected.elevation}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">moh.</span>
                </div>
              )}
              {selected.beds != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold" style={{ color: "var(--kv-blue)" }}>
                    {selected.beds}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">sengeplasser</span>
                </div>
              )}
              {selected.shower === true && (
                <div className="flex items-baseline gap-1.5">
                  <Droplets className="h-3.5 w-3.5 text-muted-foreground self-center" />
                  <span className="text-xs font-medium text-muted-foreground">Dusj</span>
                </div>
              )}
              {selected.elevation == null && selected.beds == null && (
                <p className="text-sm text-muted-foreground">Ingen tilleggsdata tilgjengelig</p>
              )}
            </div>

            {/* Weather */}
            {(loadingWeather || weather) && (
              <div className="border-t pt-3 mb-3">
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

            {/* Links */}
            <div className="border-t pt-3 flex flex-wrap gap-2">
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <ExternalLink className="h-3 w-3" /> Veibeskrivelse
              </a>
              {selected.website && !selected.website.includes("ut.no") && (
                <a
                  href={selected.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <ExternalLink className="h-3 w-3" /> Nettside
                </a>
              )}
              {selected.isDNT && (
                <a
                  href={`https://www.dnt.no/sok/?q=${encodeURIComponent(selected.name)}&tab=cabins`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <ExternalLink className="h-3 w-3" /> DNT.no
                </a>
              )}
              <button
                onClick={() => setShowInfo(true)}
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Info className="h-3 w-3" /> Om data
              </button>
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
                {(["betjent", "selvbetjent", "ubetjent", "privat"] as const).map((type) => (
                  <div key={type} className="flex items-start gap-2">
                    <div className="h-3 w-3 rounded-full mt-0.5 shrink-0" style={{ background: CABIN_COLORS[type] }} />
                    <div>
                      <span className="font-medium text-foreground">{CABIN_LABELS[type]}</span>
                      <span className="text-muted-foreground">
                        {type === "betjent" && " — full servering og vertskap"}
                        {type === "selvbetjent" && " — du lager mat selv, utstyr tilgjengelig"}
                        {type === "ubetjent" && " — åpen hytte med basisutstyr"}
                        {type === "privat" && " — andre hytter og overnattingssteder"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p>
                Høyde og sengeplasser vises når data er tilgjengelig i OpenStreetMap. Ikke alle hytter har komplett informasjon.
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
