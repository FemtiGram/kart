"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import { Loader2, X, Zap, LocateFixed, ExternalLink, Search, MapPin, Info, Map as MapIcon, Layers, RotateCw, SlidersHorizontal, Check, ChevronUp, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { FYLKER, isInNorway, OSLO } from "@/lib/fylker";
import { FlyTo, useDebounceRef, useSearchAbort } from "@/lib/map-utils";
import type { Address, KommuneEntry, Suggestion } from "@/lib/map-utils";

interface Station {
  id: number;
  lat: number;
  lon: number;
  name: string;
  operator: string | null;
  capacity: number | null;
  connectors: string[];
  address: string | null;
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

const chargingIconCache = new Map<string, L.DivIcon>();
function chargingIcon(isSelected: boolean, inverted: boolean): L.DivIcon {
  const key = `${isSelected}-${inverted}`;
  const cached = chargingIconCache.get(key);
  if (cached) return cached;

  const size = 28;
  const bg = inverted ? (isSelected ? "#24374c" : "#15803d") : "white";
  const iconColor = inverted ? "white" : (isSelected ? "#24374c" : "#15803d");
  const border = isSelected ? "#24374c" : inverted ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.15)";
  const bolt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;

  const icon = L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;line-height:0;background:${bg};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.25);border:2.5px solid ${border}">${bolt}</div>`,
  });
  chargingIconCache.set(key, icon);
  return icon;
}

function PanToSelected({ station }: { station: Station | null }) {
  const map = useMap();
  useEffect(() => {
    if (!station) return;
    map.panTo([station.lat, station.lon], { animate: true, duration: 0.4 });
  }, [station, map]);
  return null;
}

export function ChargingMap() {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Henter ladestasjoner...");
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(false);
  const [error, setError] = useState(false);
  const [showConnectorInfo, setShowConnectorInfo] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [filterConnectors, setFilterConnectors] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Station | null>(null);
  const [center, setCenter] = useState<{ lat: number; lon: number; zoom?: number; _t?: number } | null>(null);
  const [tileLayer, setTileLayer] = useState<TileLayerKey>("gråtone");

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounceRef = useDebounceRef();
  const searchAbort = useSearchAbort();
  const kommunerRef = useRef<KommuneEntry[]>([]);

  // Load stations from pre-built static JSON, fallback to local-area Overpass
  const loadStations = useCallback(async () => {
    setError(false);
    setLoading(true);
    setLoadingMessage("Henter ladestasjoner...");

    function parseStations(elements: Array<{ id: number; lat: number; lon: number; tags: Record<string, string> }>) {
      return elements.map((el) => {
        const t = el.tags;
        const connectors = ["type2", "chademo", "type2_combo", "type1", "schuko", "type3c"]
          .filter((s) => t[`socket:${s}`] && t[`socket:${s}`] !== "no")
          .map((s) => s.replace("type2_combo", "CCS").replace("type2", "Type 2").replace("chademo", "CHAdeMO").replace("type1", "Type 1").replace("schuko", "Schuko").replace("type3c", "Type 3C"));
        const address = [t["addr:street"], t["addr:housenumber"], t["addr:city"]].filter(Boolean).join(" ");
        return { id: el.id, lat: el.lat, lon: el.lon, name: t.name ?? t.operator ?? "Ladestasjon", operator: t.operator ?? null, capacity: t.capacity ? parseInt(t.capacity) : null, connectors, address: address || null };
      });
    }

    async function fetchArea(lat: number, lon: number) {
      const dlat = 0.45;
      const dlon = 0.45 / Math.cos((lat * Math.PI) / 180);
      const bbox = `${lat - dlat},${lon - dlon},${lat + dlat},${lon + dlon}`;
      const query = `[out:json][timeout:8];node["amenity"="charging_station"](${bbox});out body;`;
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return parseStations(data.elements ?? []);
    }

    try {
      const r = await fetch("/data/stations.json");
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        setStations(data);
        setLoading(false);
      } else {
        setLoadingMessage("Dataen er ikke ferdig cachet ennå. Henter fra OpenStreetMap...");
        setLoading(false);
        try {
          const nearby = await fetchArea(OSLO.lat, OSLO.lon);
          if (nearby.length > 0) {
            setStations(nearby);
          } else {
            setError(true);
          }
        } catch {
          setError(true);
        }
      }
    } catch {
      setError(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStations(); }, [loadStations]);

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
      const signal = searchAbort.renew();
      const res = await fetch(`https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(q)}&treffPerSide=2&utkoordsys=4326`, { signal });
      const data = await res.json();
      adresseMatches = (data.adresser ?? []).map((a: Address) => ({ type: "adresse" as const, addr: a }));
    } catch { /* ignore — aborted or network error */ }

    setSuggestions([...fylkeMatches, ...kommuneMatches, ...adresseMatches]);
    setShowDropdown(true);
    setLoadingSuggestions(false);
  }, [searchAbort]);

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
    setLocateError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setSelected(null);
        const { latitude: lat, longitude: lon } = pos.coords;
        if (isInNorway(lat, lon)) {
          setCenter({ lat, lon, zoom: 12, _t: Date.now() });
        } else {
          setCenter({ lat: OSLO.lat, lon: OSLO.lon, zoom: OSLO.zoom, _t: Date.now() });
        }
      },
      () => {
        setLocating(false);
        setCenter({ lat: OSLO.lat, lon: OSLO.lon, zoom: OSLO.zoom, _t: Date.now() });
        setLocateError(true);
        setTimeout(() => setLocateError(false), 4000);
      },
      { timeout: 15000, maximumAge: 60000 }
    );
  };

  // All unique connector types across loaded stations
  const allConnectors = useMemo(() => {
    const set = new Set<string>();
    stations.forEach((s) => s.connectors.forEach((c) => set.add(c)));
    return [...set].sort();
  }, [stations]);

  const filteredStations = useMemo(() => {
    if (filterConnectors.size === 0) return stations;
    return stations.filter((s) => s.connectors.some((c) => filterConnectors.has(c)));
  }, [stations, filterConnectors]);

  const activeFilterCount = filterConnectors.size;

  const toggleConnector = (c: string) => {
    setFilterConnectors((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

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
                placeholder="Søk etter adresse eller sted..."
                className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground text-[16px] sm:text-sm"
              />
            </div>
            <Sheet open={showFilter} onOpenChange={(open) => { setShowFilter(open); if (open) setShowInfoSheet(false); }}>
              <SheetTrigger
                render={
                  <Button variant="secondary" size="lg" className="relative shadow-lg shrink-0" disabled={allConnectors.length === 0}>
                    <SlidersHorizontal className="h-4 w-4" />
                    <span className="sm:inline hidden">Filter</span>
                    {activeFilterCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                }
              />
              <SheetContent side="bottom" className="rounded-t-2xl max-h-[70svh]">
                <div className="mx-auto w-full max-w-md px-2">
                  <SheetHeader>
                    <SheetTitle className="text-left">Filtrer ladestasjoner</SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col gap-4 py-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Kontakttype</p>
                      <div className="rounded-xl border overflow-hidden">
                        {allConnectors.map((c) => {
                          const active = filterConnectors.has(c);
                          const count = stations.filter((s) => s.connectors.includes(c)).length;
                          return (
                            <button
                              key={c}
                              onClick={() => toggleConnector(c)}
                              className={`flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors border-b last:border-0 ${active ? "bg-background" : "bg-muted/40 text-muted-foreground"}`}
                            >
                              <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${active ? "border-primary bg-primary" : "border-muted-foreground/30 bg-background"}`}>
                                {active && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                              </div>
                              <span className="font-medium flex-1 text-left">{c}</span>
                              <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">Ingen valgt = vis alle. Velg én eller flere for å filtrere.</p>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={() => setFilterConnectors(new Set())}
                      >
                        Nullstill
                      </Button>
                      <Button className="flex-1" onClick={() => setShowFilter(false)}>
                        Vis {filteredStations.length} stasjoner
                      </Button>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
          <Button onClick={handleLocate} disabled={locating || loading} variant="secondary" size="lg" className="w-full shadow-lg">
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
            {loading ? loadingMessage : stations.length > 0 ? `${filteredStations.length}${filterConnectors.size > 0 ? ` av ${stations.length}` : ""} ladestasjoner${stations.length > 1000 ? " i Norge" : " i nærheten"} — Kilde: OpenStreetMap` : "Ingen ladestasjoner funnet"}
          </p>
          <button
            disabled
            title="Krever sanntidsdata — kommer snart"
            className="relative inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border bg-muted text-muted-foreground opacity-50 cursor-not-allowed shrink-0"
          >
            <Zap className="h-3 w-3" />
            Kun ledige
            <span className="absolute -top-1.5 -right-1.5 text-[9px] px-1 rounded-full bg-foreground text-background font-bold leading-4">Snart</span>
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="relative grow">
        {loading && (
          <div className="absolute inset-0 z-[1000] bg-background flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center px-6">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--kv-blue)" }} />
              <p className="text-sm text-muted-foreground">{loadingMessage}</p>
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
            <p className="text-sm text-muted-foreground">Kunne ikke finne posisjon — viser Oslo i stedet.</p>
          </div>
        )}
        {error && (
          <div className="absolute bottom-20 sm:top-3 sm:bottom-auto left-1/2 -translate-x-1/2 z-[1000] rounded-full px-4 py-2 shadow-lg" style={{ background: "#b91c1c" }}>
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-white">Kunne ikke hente ladestasjoner.</p>
              <button onClick={loadStations} className="inline-flex items-center gap-1 text-sm font-semibold text-white/90 hover:text-white transition-colors">
                <RotateCw className="h-3.5 w-3.5" /> Prøv igjen
              </button>
            </div>
          </div>
        )}

        <MapContainer
          center={[65, 14]}
          zoom={5}
          style={{ height: "100%", width: "100%" }}
        >
          {center && <FlyTo lat={center.lat} lon={center.lon} zoom={center.zoom} _t={center._t} />}
          <PanToSelected station={selected} />
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
                html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:#15803d;color:white;border-radius:50%;font-weight:700;font-size:${fontSize}px;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid rgba(255,255,255,0.6)">${count}</div>`,
                className: "",
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2],
              });
            }}
          >
            {filteredStations.map((s) => (
              <Marker
                key={s.id}
                position={[s.lat, s.lon]}
                icon={chargingIcon(selected?.id === s.id, tileLayer === "gråtone")}
                eventHandlers={{
                  click() {
                    setSelected((prev) => (prev?.id === s.id ? null : s));
                  },
                }}
              />
            ))}
          </MarkerClusterGroup>
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
            {/* Layer 1 — Identity */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-base truncate leading-snug">{selected.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[selected.operator !== selected.name ? selected.operator : null, selected.address].filter(Boolean).join(" · ")}
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

            {/* Layer 2 — Key metric */}
            <div className="mt-3">
              {selected.capacity != null ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold" style={{ color: "var(--kv-blue)" }}>
                    {selected.capacity}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">ladepunkter</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Kapasitet ukjent</p>
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
              <div className="mx-auto w-full max-w-md px-2">
                <SheetHeader>
                  <SheetTitle className="text-left sr-only">{selected.name}</SheetTitle>
                </SheetHeader>

                {/* Layer 1 — Identity */}
                <p className="font-bold text-lg leading-snug">{selected.name}</p>
                {selected.operator && selected.operator !== selected.name && (
                  <p className="text-sm text-muted-foreground">{selected.operator}</p>
                )}
                {selected.address && (
                  <p className="text-sm text-muted-foreground">{selected.address}</p>
                )}

                {/* Layer 2 — Key metric */}
                <div className="mt-4 pt-4 border-t">
                  {selected.capacity != null ? (
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold" style={{ color: "var(--kv-blue)" }}>
                        {selected.capacity}
                      </span>
                      <span className="text-sm font-medium text-muted-foreground">ladepunkter</span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Kapasitet ukjent</p>
                  )}
                  <p className="text-xs text-muted-foreground/50 mt-1 italic">Sanntidsdata tilgjengelig snart</p>
                </div>

                {/* Layer 3 — Details (connectors) */}
                {selected.connectors.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-muted-foreground font-medium mb-2">Kontakttyper</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.connectors.map((c) => (
                        <button
                          key={c}
                          onClick={() => setShowConnectorInfo(true)}
                          className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium hover:bg-muted-foreground/20 transition-colors"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Layer 4 — Links & source */}
                <div className="mt-4 pt-4 border-t flex flex-col gap-3">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border bg-muted/50 hover:bg-muted transition-colors w-full"
                  >
                    <Navigation className="h-4 w-4" /> Kjør hit
                  </a>
                  <p className="text-xs text-muted-foreground text-center">
                    Kilde: OpenStreetMap
                  </p>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>

      {/* Connector info modal */}
      {showConnectorInfo && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowConnectorInfo(false)}
        >
          <div
            className="bg-background rounded-2xl shadow-xl border w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-base">Kontakttyper forklart</h2>
              <button
                onClick={() => setShowConnectorInfo(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Lukk"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-4">
              {[
                {
                  name: "CCS",
                  tag: "Hurtiglading · DC",
                  desc: "Standard for de fleste nye elbiler (VW, BMW, Hyundai, Ford, Tesla med adapter). Finner du på de fleste hurtigladere langs veien.",
                  speed: "50–350 kW",
                  time: "Ca. 20–45 min (10–80%)",
                },
                {
                  name: "CHAdeMO",
                  tag: "Hurtiglading · DC",
                  desc: "Japansk standard brukt av eldre Nissan Leaf og Mitsubishi. Er på vei ut og erstattes av CCS.",
                  speed: "50–100 kW",
                  time: "Ca. 20–40 min (10–80%)",
                },
                {
                  name: "Type 2",
                  tag: "Normallading · AC",
                  desc: "Vanligste kontakt i Europa. Brukes både hjemme, på jobb og på offentlige ladere. Støttes av nesten alle elbiler.",
                  speed: "3,6–22 kW",
                  time: "Ca. 3–8 timer (full lading)",
                },
                {
                  name: "Schuko",
                  tag: "Langsomlading · AC",
                  desc: "Vanlig stikkontakt. Kan brukes i nødstilfeller, men er ikke anbefalt til daglig lading – tar svært lang tid.",
                  speed: "Ca. 2,3 kW",
                  time: "Ca. 12–20 timer (full lading)",
                },
              ].map((c) => (
                <div key={c.name} className="flex gap-3">
                  <span className="mt-0.5 text-xs font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground h-fit shrink-0">{c.name}</span>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">{c.tag}</p>
                    <p className="text-sm mt-0.5">{c.desc}</p>
                    <p className="text-xs text-muted-foreground mt-1">{c.speed} · {c.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
