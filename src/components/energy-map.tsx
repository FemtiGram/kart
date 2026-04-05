"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import {
  Loader2,
  X,
  Wind,
  Droplets,
  LocateFixed,
  ExternalLink,
  Search,
  MapPin,
  Info,
  Map as MapIcon,
  Layers,
  RotateCw,
  SlidersHorizontal,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { FYLKER, isInNorway, OSLO } from "@/lib/fylker";
import { FlyTo, useDebounceRef, useSearchAbort } from "@/lib/map-utils";
import type { Address, KommuneEntry, Suggestion } from "@/lib/map-utils";

type EnergyType = "vind" | "vann";
type WindStatus = "operational" | "construction" | "approved" | "rejected";

interface EnergyPlant {
  id: number;
  name: string;
  owner: string | null;
  municipality: string | null;
  county: string | null;
  lat: number;
  lon: number;
  capacityMW: number | null;
  productionGWh: number | null;
  type: EnergyType;
  windStatus?: WindStatus;
  turbineCount?: number | null;
  fallHeight?: number | null;
  yearBuilt?: number | null;
  river?: string | null;
}

interface WindTurbine {
  id: number;
  lat: number;
  lon: number;
  plantName: string | null;
}

const TYPE_META: Record<EnergyType, { label: string; color: string; icon: typeof Wind }> = {
  vind: { label: "Vindkraft", color: "#0369a1", icon: Wind },
  vann: { label: "Vannkraft", color: "#0891b2", icon: Droplets },
};

const WIND_STATUS_META: Record<WindStatus, { label: string; color: string }> = {
  operational: { label: "I drift", color: "#0369a1" },
  construction: { label: "Under bygging", color: "#ca8a04" },
  approved: { label: "Godkjent", color: "#16a34a" },
  rejected: { label: "Avslått", color: "#dc2626" },
};

const MW_THRESHOLD = 10; // Default: only show plants >= 10 MW

const TILE_LAYERS = {
  kart: {
    label: "Kart",
    url: "https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png",
    attribution:
      '&copy; <a href="https://www.kartverket.no/">Kartverket</a>',
  },
  gråtone: {
    label: "Gråtone",
    url: "https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png",
    attribution:
      '&copy; <a href="https://www.kartverket.no/">Kartverket</a>',
  },
} as const;

type TileLayerKey = keyof typeof TILE_LAYERS;

const energyIconCache = new Map<string, L.DivIcon>();
function energyIcon(
  isSelected: boolean,
  inverted: boolean,
  type: EnergyType,
  capacityMW: number | null,
  windStatus?: WindStatus
): L.DivIcon {
  const sizeBucket = capacityMW != null && capacityMW > 200 ? "lg" : capacityMW != null && capacityMW >= 50 ? "md" : "sm";
  const statusKey = windStatus ?? "operational";
  const key = `${type}-${sizeBucket}-${isSelected}-${inverted}-${statusKey}`;
  const cached = energyIconCache.get(key);
  if (cached) return cached;

  const size = sizeBucket === "lg" ? 32 : sizeBucket === "md" ? 30 : 26;
  const iconSize = Math.round(size * 0.5);
  const color = type === "vind" && windStatus && windStatus !== "operational"
    ? WIND_STATUS_META[windStatus].color
    : TYPE_META[type].color;

  const bg = inverted ? (isSelected ? "#24374c" : color) : "white";
  const iconColor = inverted ? "white" : isSelected ? "#24374c" : color;
  const border = isSelected
    ? "#24374c"
    : inverted
      ? "rgba(255,255,255,0.3)"
      : "rgba(0,0,0,0.15)";

  const svgIcon =
    type === "vind"
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>`;

  const icon = L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;line-height:0;background:${bg};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.25);border:2.5px solid ${border}">${svgIcon}</div>`,
  });
  energyIconCache.set(key, icon);
  return icon;
}

const turbineIconCache = new Map<string, L.DivIcon>();
function turbineIcon(inverted: boolean): L.DivIcon {
  const key = `${inverted}`;
  const cached = turbineIconCache.get(key);
  if (cached) return cached;
  const size = 16;
  const color = inverted ? "white" : "#0369a1";
  const bg = inverted ? "#0369a1" : "white";
  const icon = L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${bg};border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.2);border:1.5px solid ${inverted ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.1)"}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/></svg></div>`,
  });
  turbineIconCache.set(key, icon);
  return icon;
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

function PanToSelected({ plant }: { plant: EnergyPlant | null }) {
  const map = useMap();
  useEffect(() => {
    if (!plant) return;
    map.panTo([plant.lat, plant.lon], { animate: true, duration: 0.4 });
  }, [plant, map]);
  return null;
}

export function EnergyMap() {
  const [plants, setPlants] = useState<EnergyPlant[]>([]);
  const [turbines, setTurbines] = useState<WindTurbine[]>([]);
  const [zoomLevel, setZoomLevel] = useState(5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filterTypes, setFilterTypes] = useState<Set<EnergyType>>(new Set(["vind", "vann"]));
  const [filterWindStatus, setFilterWindStatus] = useState<Set<WindStatus>>(new Set(["operational"]));
  const [showSmall, setShowSmall] = useState(false);
  const [selected, setSelected] = useState<EnergyPlant | null>(null);
  const [center, setCenter] = useState<{
    lat: number;
    lon: number;
    zoom?: number;
    _t?: number;
  } | null>(null);
  const [tileLayer, setTileLayer] = useState<TileLayerKey>("gråtone");

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounceRef = useDebounceRef();
  const searchAbort = useSearchAbort();
  const kommunerRef = useRef<KommuneEntry[]>([]);

  const loadPlants = useCallback(async () => {
    setError(false);
    setLoading(true);

    try {
      const res = await fetch("/api/energy");
      const data = await res.json();
      if (data.error || !data.plants) {
        setError(true);
        setLoading(false);
        return;
      }
      setPlants(data.plants);
      setTurbines(data.turbines ?? []);
      setLoading(false);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlants();
  }, [loadPlants]);

  useEffect(() => {
    fetch("https://ws.geonorge.no/kommuneinfo/v1/kommuner")
      .then((r) => r.json())
      .then((data: KommuneEntry[]) => {
        kommunerRef.current = data;
      })
      .catch(() => {});
  }, []);

  const search = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setSuggestions([]);
        return;
      }
      setLoadingSuggestions(true);

      const fylkeMatches: Suggestion[] = FYLKER.filter((f) =>
        f.fylkesnavn.toLowerCase().includes(q.toLowerCase())
      )
        .slice(0, 3)
        .map((f) => ({
          type: "fylke",
          fylkesnavn: f.fylkesnavn,
          lat: f.lat,
          lon: f.lon,
          zoom: f.zoom,
        }));

      const kommuneMatches: Suggestion[] = kommunerRef.current
        .filter((k) =>
          k.kommunenavn.toLowerCase().includes(q.toLowerCase())
        )
        .slice(0, 5)
        .map((k) => ({
          type: "kommune",
          kommunenummer: k.kommunenummer,
          kommunenavn: k.kommunenavn,
        }));

      let adresseMatches: Suggestion[] = [];
      try {
        const signal = searchAbort.renew();
        const res = await fetch(
          `https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(q)}&treffPerSide=2&utkoordsys=4326`,
          { signal }
        );
        const data = await res.json();
        adresseMatches = (data.adresser ?? []).map((a: Address) => ({
          type: "adresse" as const,
          addr: a,
        }));
      } catch {
        /* aborted or network error */
      }

      setSuggestions([
        ...fylkeMatches,
        ...kommuneMatches,
        ...adresseMatches,
      ]);
      setShowDropdown(true);
      setLoadingSuggestions(false);
    },
    [searchAbort]
  );

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
      setCenter({
        lat: s.addr.representasjonspunkt.lat,
        lon: s.addr.representasjonspunkt.lon,
      });
    }
  };

  const handleLocate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setSelected(null);
        const { latitude: lat, longitude: lon } = pos.coords;
        if (isInNorway(lat, lon)) {
          setCenter({ lat, lon, zoom: 10, _t: Date.now() });
        } else {
          setCenter({
            lat: OSLO.lat,
            lon: OSLO.lon,
            zoom: OSLO.zoom,
            _t: Date.now(),
          });
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

  // Filtering
  const filteredPlants = useMemo(() => {
    return plants.filter((p) => {
      if (!filterTypes.has(p.type)) return false;
      if (p.type === "vind" && p.windStatus && !filterWindStatus.has(p.windStatus)) return false;
      if (!showSmall && (p.capacityMW ?? 0) < MW_THRESHOLD) return false;
      return true;
    });
  }, [plants, filterTypes, filterWindStatus, showSmall]);

  const toggleType = (t: EnergyType) => {
    setFilterTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) { if (next.size > 1) next.delete(t); }
      else next.add(t);
      return next;
    });
  };

  const toggleWindStatus = (s: WindStatus) => {
    setFilterWindStatus((prev) => {
      const next = new Set(prev);
      if (next.has(s)) { if (next.size > 1) next.delete(s); }
      else next.add(s);
      return next;
    });
  };

  const activeFilterCount = (filterTypes.size < 2 ? 1 : 0) + (showSmall ? 1 : 0) + (filterWindStatus.size !== 1 || !filterWindStatus.has("operational") ? 1 : 0);

  // Stats
  const windCount = useMemo(() => filteredPlants.filter((p) => p.type === "vind").length, [filteredPlants]);
  const hydroCount = useMemo(() => filteredPlants.filter((p) => p.type === "vann").length, [filteredPlants]);
  const totalCapacity = useMemo(
    () => Math.round(filteredPlants.reduce((sum, p) => sum + (p.capacityMW ?? 0), 0)),
    [filteredPlants]
  );

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
                onFocus={() =>
                  suggestions.length > 0 && setShowDropdown(true)
                }
                onBlur={() =>
                  setTimeout(() => setShowDropdown(false), 150)
                }
                onKeyDown={handleKeyDown}
                placeholder="Søk etter adresse eller sted..."
                className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground text-[16px] sm:text-sm"
              />
            </div>
            <Sheet open={showFilter} onOpenChange={setShowFilter}>
              <SheetTrigger
                render={
                  <Button variant="secondary" size="lg" className="relative shadow-lg shrink-0">
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
                    <SheetTitle className="text-left">Filtrer energikilder</SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col gap-4 py-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Type</p>
                      <div className="rounded-xl border overflow-hidden">
                        {(["vind", "vann"] as EnergyType[]).map((t) => {
                          const active = filterTypes.has(t);
                          const meta = TYPE_META[t];
                          const count = plants.filter((p) => p.type === t && (showSmall || (p.capacityMW ?? 0) >= MW_THRESHOLD)).length;
                          return (
                            <button
                              key={t}
                              onClick={() => toggleType(t)}
                              className={`flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors border-b last:border-0 ${active ? "bg-background" : "bg-muted/40 text-muted-foreground"}`}
                            >
                              <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${active ? "border-primary bg-primary" : "border-muted-foreground/30 bg-background"}`}>
                                {active && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                              </div>
                              <div className="h-3 w-3 rounded-full shrink-0" style={{ background: meta.color }} />
                              <span className="font-medium flex-1 text-left">{meta.label}</span>
                              <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {filterTypes.has("vind") && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Vindkraftstatus</p>
                        <div className="rounded-xl border overflow-hidden">
                          {(["operational", "construction", "approved", "rejected"] as WindStatus[]).map((s) => {
                            const active = filterWindStatus.has(s);
                            const meta = WIND_STATUS_META[s];
                            const count = plants.filter((p) => p.type === "vind" && p.windStatus === s).length;
                            return (
                              <button
                                key={s}
                                onClick={() => toggleWindStatus(s)}
                                className={`flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors border-b last:border-0 ${active ? "bg-background" : "bg-muted/40 text-muted-foreground"}`}
                              >
                                <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${active ? "border-primary bg-primary" : "border-muted-foreground/30 bg-background"}`}>
                                  {active && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                                </div>
                                <div className="h-3 w-3 rounded-full shrink-0" style={{ background: meta.color }} />
                                <span className="font-medium flex-1 text-left">{meta.label}</span>
                                <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Størrelse</p>
                      <div className="rounded-xl border overflow-hidden">
                        <button
                          onClick={() => setShowSmall((v) => !v)}
                          className={`flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors ${showSmall ? "bg-background" : "bg-muted/40 text-muted-foreground"}`}
                        >
                          <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${showSmall ? "border-primary bg-primary" : "border-muted-foreground/30 bg-background"}`}>
                            {showSmall && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                          </div>
                          <span className="font-medium flex-1 text-left">Vis små kraftverk (&lt;{MW_THRESHOLD} MW)</span>
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">Skjuler {plants.filter((p) => (p.capacityMW ?? 0) < MW_THRESHOLD).length} små kraftverk som standard for bedre ytelse.</p>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={() => { setFilterTypes(new Set(["vind", "vann"])); setFilterWindStatus(new Set(["operational"])); setShowSmall(false); }}
                      >
                        Nullstill
                      </Button>
                      <Button className="flex-1" onClick={() => setShowFilter(false)}>
                        Vis {filteredPlants.length} kraftverk
                      </Button>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
          <Button
            onClick={handleLocate}
            disabled={locating || loading}
            variant="secondary"
            size="lg"
            className="w-full shadow-lg"
          >
            {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
            Min posisjon
          </Button>

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
                        <p className="text-xs text-muted-foreground">
                          Fylke
                        </p>
                      </div>
                    ) : s.type === "kommune" ? (
                      <div>
                        <p className="font-medium">{s.kommunenavn}</p>
                        <p className="text-xs text-muted-foreground">
                          Kommune
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-medium">
                          {s.addr.adressetekst}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {s.addr.poststed}, {s.addr.kommunenavn}
                        </p>
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
            {loading
              ? "Henter kraftverk..."
              : plants.length > 0
                ? `${filteredPlants.length} kraftverk (${windCount} vind, ${hydroCount} vann) — ${totalCapacity} MW — Kilde: NVE`
                : "Ingen kraftverk funnet"}
          </p>
          <button
            onClick={() => setShowInfo(true)}
            className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <Info className="h-3 w-3" />
            Om data
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="relative grow">
        {loading && (
          <div className="absolute inset-0 z-[1000] bg-background flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center px-6">
              <Loader2
                className="h-8 w-8 animate-spin"
                style={{ color: "var(--kv-blue)" }}
              />
              <p className="text-sm text-muted-foreground">
                Henter kraftverk...
              </p>
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
          <div
            className="absolute bottom-20 sm:top-3 sm:bottom-auto left-1/2 -translate-x-1/2 z-[1000] rounded-full px-4 py-2 shadow-lg"
            style={{ background: "#b91c1c" }}
          >
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-white">
                Kunne ikke hente kraftverk.
              </p>
              <button
                onClick={loadPlants}
                className="inline-flex items-center gap-1 text-sm font-semibold text-white/90 hover:text-white transition-colors"
              >
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
          {center && (
            <FlyTo lat={center.lat} lon={center.lon} zoom={center.zoom} _t={center._t} />
          )}
          <PanToSelected plant={selected} />
          <ZoomTracker onZoom={setZoomLevel} />
          <TileLayer
            key={tileLayer}
            url={TILE_LAYERS[tileLayer].url}
            attribution={TILE_LAYERS[tileLayer].attribution}
            maxZoom={17}
          />
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={50}
            spiderfyOnMaxZoom
            showCoverageOnHover={false}
            iconCreateFunction={(cluster: { getChildCount: () => number }) => {
              const count = cluster.getChildCount();
              let size = 36;
              let fontSize = 13;
              if (count >= 50) { size = 44; fontSize = 14; }
              if (count >= 200) { size = 52; fontSize = 15; }
              return L.divIcon({
                html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:#0369a1;color:white;border-radius:50%;font-weight:700;font-size:${fontSize}px;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid rgba(255,255,255,0.6)">${count}</div>`,
                className: "",
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2],
              });
            }}
          >
            {filteredPlants.map((p) => (
              <Marker
                key={`${p.type}-${p.id}`}
                position={[p.lat, p.lon]}
                icon={energyIcon(
                  selected?.id === p.id && selected?.type === p.type,
                  tileLayer === "gråtone",
                  p.type,
                  p.capacityMW,
                  p.windStatus
                )}
                eventHandlers={{
                  click() {
                    setSelected((prev) =>
                      prev?.id === p.id && prev?.type === p.type ? null : p
                    );
                  },
                }}
              />
            ))}
          </MarkerClusterGroup>
          {zoomLevel >= 12 && turbines.map((t) => (
            <Marker
              key={`turbine-${t.id}`}
              position={[t.lat, t.lon]}
              icon={turbineIcon(tileLayer === "gråtone")}
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
              style={
                tileLayer === key
                  ? { background: "var(--kv-blue)" }
                  : {}
              }
            >
              {key === "kart" ? (
                <MapIcon className="h-3.5 w-3.5" />
              ) : (
                <Layers className="h-3.5 w-3.5" />
              )}
              {TILE_LAYERS[key].label}
            </button>
          ))}
        </div>

        {/* Info card */}
        {selected && (
          <div
            className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-96 z-[999] bg-card rounded-2xl shadow-xl px-4 py-4"
            style={{ border: "1.5px solid var(--border)" }}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white"
                    style={{ background: selected.type === "vind" && selected.windStatus ? WIND_STATUS_META[selected.windStatus].color : TYPE_META[selected.type].color }}
                  >
                    {TYPE_META[selected.type].label}
                  </span>
                  {selected.windStatus && selected.windStatus !== "operational" && (
                    <span
                      className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white"
                      style={{ background: WIND_STATUS_META[selected.windStatus].color }}
                    >
                      {WIND_STATUS_META[selected.windStatus].label}
                    </span>
                  )}
                </div>
                <p className="font-bold text-base truncate leading-snug">
                  {selected.name}
                </p>
                {selected.owner &&
                  selected.owner !== selected.name && (
                    <p className="text-xs text-muted-foreground truncate">
                      {selected.owner}
                    </p>
                  )}
                {(selected.municipality || selected.county) && (
                  <p className="text-sm text-muted-foreground truncate mt-0.5">
                    {[selected.municipality, selected.county]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lon}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border mt-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors w-fit"
                >
                  <ExternalLink className="h-3 w-3" /> Veibeskrivelse
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

            <div className="border-t pt-3">
              <div className={`grid gap-3 ${selected.type === "vind" ? "grid-cols-3" : "grid-cols-2"}`}>
                <div>
                  <span className="text-2xl font-extrabold" style={{ color: TYPE_META[selected.type].color }}>
                    {selected.capacityMW != null ? Math.round(selected.capacityMW) : "—"}
                  </span>
                  <p className="text-xs text-muted-foreground">MW</p>
                </div>
                {selected.type === "vind" && (
                  <div>
                    <span className="text-2xl font-extrabold" style={{ color: TYPE_META[selected.type].color }}>
                      {selected.turbineCount ?? "—"}
                    </span>
                    <p className="text-xs text-muted-foreground">turbiner</p>
                  </div>
                )}
                <div>
                  <span className="text-2xl font-extrabold" style={{ color: TYPE_META[selected.type].color }}>
                    {selected.type === "vind"
                      ? (selected.productionGWh != null ? Math.round(selected.productionGWh) : "—")
                      : (selected.fallHeight != null ? Math.round(selected.fallHeight) : "—")}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {selected.type === "vind" ? "GWh/år" : "m fallhøyde"}
                  </p>
                </div>
              </div>
              {selected.type === "vann" && selected.river && (
                <p className="text-xs text-muted-foreground mt-2">Elv: {selected.river}</p>
              )}
              {selected.type === "vann" && selected.yearBuilt && (
                <p className="text-xs text-muted-foreground mt-1">Idriftsatt: {selected.yearBuilt}</p>
              )}
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
              <h2 className="font-bold text-base">Om energidata</h2>
              <button
                onClick={() => setShowInfo(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Lukk"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3 text-sm">
              <p>
                Kartet viser fornybare kraftverk i Norge — vindkraft
                og vannkraft. Data hentes fra{" "}
                <strong>NVE</strong> (Norges vassdrags- og
                energidirektorat).
              </p>
              <p>
                <strong>MW (megawatt)</strong> er installert kapasitet.
                Kraftverk under {MW_THRESHOLD} MW er skjult som standard — bruk filteret for å vise alle.
              </p>
              <p>
                Norge har over 1700 vannkraftverk som dekker ~90% av
                landets strømproduksjon, pluss et voksende antall
                vindkraftverk.
              </p>
              <p className="text-xs text-muted-foreground">
                Data oppdateres hver time. Kilde:{" "}
                <a
                  href="https://nve.geodataonline.no/arcgis/rest/services/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  NVE Geodata
                </a>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
