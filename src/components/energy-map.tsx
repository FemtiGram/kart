"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Polygon, Polyline, useMap } from "react-leaflet";
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
  ChevronUp,
  Navigation,
  Waves,
  Gauge,
  Fuel,
  Anchor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { FYLKER, isInNorway, OSLO } from "@/lib/fylker";
import { FlyTo, DataDisclaimer, useDebounceRef, useSearchAbort } from "@/lib/map-utils";
import type { Address, KommuneEntry, Suggestion } from "@/lib/map-utils";

type EnergyType = "vind" | "vann" | "havvind" | "oilgas";
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

interface OilGasFacility {
  id: number;
  name: string;
  kind: string;
  phase: string;
  functions: string | null;
  operator: string | null;
  fieldName: string | null;
  waterDepth: number | null;
  yearStartup: number | null;
  isSurface: boolean;
  factPageUrl: string | null;
  lat: number;
  lon: number;
}

interface ProductionYear {
  year: number;
  oil: number;
  gas: number;
  ngl: number;
  condensate: number;
  oe: number;
  water: number;
}

type ProductionByField = Record<string, ProductionYear[]>;

interface Pipeline {
  id: number;
  name: string;
  medium: string | null;
  phase: string | null;
  dimension: number | null;
  fromFacility: string | null;
  toFacility: string | null;
  belongsTo: string | null;
  path: [number, number][];
}

interface HavvindZone {
  id: number;
  name: string;
  typeAnlegg: string;
  arealKm2: number | null;
  minDistanceKm: number | null;
  nveUrl: string | null;
  center: { lat: number; lon: number };
  polygon: [number, number][][];
}

const HAVVIND_COLOR = "#7c3aed";
const OILGAS_COLOR = "#d97706";

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
}

const FUNCTION_NO: Record<string, string> = {
  "oil producer": "Oljeprodusent",
  "gas producer": "Gassprodusent",
  "oil/gas producer": "Olje-/gassprodusent",
  "gas injection": "Gassinjeksjon",
  "water injection": "Vanninjeksjon",
  "processing": "Prosessering",
  "storage": "Lagring",
  "loading": "Lasting",
  "quarters": "Boligkvarter",
  "wellhead": "Brønnhode",
  "drilling": "Boring",
  "riser": "Stigerør",
  "flare": "Fakkel",
  "compression": "Kompresjon",
  "metering": "Måling",
};

function formatFunctions(raw: string): string {
  return raw.split(" - ").map((f) => {
    const key = f.trim().toLowerCase();
    return FUNCTION_NO[key] ?? titleCase(f.trim());
  }).join(", ");
}

function formatKind(raw: string): string {
  const map: Record<string, string> = {
    "MULTI WELL TEMPLATE": "Flerbrønnmal",
    "FIXED": "Fast plattform",
    "JACKET 4 LEGS": "Jacket (4 ben)",
    "JACKET 6 LEGS": "Jacket (6 ben)",
    "JACKET 8 LEGS": "Jacket (8 ben)",
    "CONDEEP 3 SHAFTS": "Condeep (3 skaft)",
    "CONDEEP 4 SHAFTS": "Condeep (4 skaft)",
    "SEMI SUBMERSIBLE": "Halvt nedsenkbar",
    "FPSO": "FPSO",
    "FSO": "FSO",
    "FSU": "FSU",
    "JACK-UP": "Jack-up",
    "TLP": "TLP",
    "SPAR": "Spar",
    "SUBSEA TEMPLATE": "Undervannsmal",
    "SINGLE WELL TEMPLATE": "Enkeltbrønnmal",
    "TENSION LEG": "Strekkstag",
    "DRILL SHIP": "Boreskip",
    "LOADING SYSTEM": "Lastesystem",
  };
  return map[raw] ?? titleCase(raw);
}

const TYPE_META: Record<EnergyType, { label: string; color: string; icon: typeof Wind }> = {
  vind: { label: "Vindkraft", color: "#0369a1", icon: Wind },
  vann: { label: "Vannkraft", color: "#0891b2", icon: Droplets },
  havvind: { label: "Havvind (planlagt)", color: HAVVIND_COLOR, icon: Wind },
  oilgas: { label: "Olje & gass", color: OILGAS_COLOR, icon: Fuel },
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

const oilgasIconCache = new Map<string, L.DivIcon>();
function oilgasIcon(isSelected: boolean, inverted: boolean, isSurface: boolean): L.DivIcon {
  const key = `${isSelected}-${inverted}-${isSurface}`;
  const cached = oilgasIconCache.get(key);
  if (cached) return cached;
  const size = isSurface ? 28 : 22;
  const iconSize = isSurface ? 14 : 10;
  const bg = inverted ? (isSelected ? "#24374c" : OILGAS_COLOR) : "white";
  const iconColor = inverted ? "white" : (isSelected ? "#24374c" : OILGAS_COLOR);
  const border = isSelected ? "#24374c" : inverted ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.15)";
  // Fuel/droplet icon for oil
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22h18"/><path d="M6 18V2"/><path d="m6 7 5-1v4l-5 1"/><circle cx="18" cy="16" r="4"/><path d="m18 13-1 5h2l-1-5"/></svg>`;
  const icon = L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;line-height:0;background:${bg};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.25);border:2.5px solid ${border}${!isSurface ? ";opacity:0.7" : ""}">${svg}</div>`,
  });
  oilgasIconCache.set(key, icon);
  return icon;
}

const havvindIconCache = new Map<string, L.DivIcon>();
function havvindIcon(isSelected: boolean, inverted: boolean): L.DivIcon {
  const key = `${isSelected}-${inverted}`;
  const cached = havvindIconCache.get(key);
  if (cached) return cached;
  const size = 28;
  const bg = inverted ? (isSelected ? "#24374c" : HAVVIND_COLOR) : "white";
  const iconColor = inverted ? "white" : (isSelected ? "#24374c" : HAVVIND_COLOR);
  const border = isSelected ? "#24374c" : inverted ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.15)";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/></svg>`;
  const icon = L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;line-height:0;background:${bg};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.25);border:2.5px solid ${border}">${svg}</div>`,
  });
  havvindIconCache.set(key, icon);
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
  const [havvindZones, setHavvindZones] = useState<HavvindZone[]>([]);
  const [oilGasFacilities, setOilGasFacilities] = useState<OilGasFacility[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [productionData, setProductionData] = useState<ProductionByField>({});
  const [productionFetchedAt, setProductionFetchedAt] = useState<string | null>(null);
  const [selectedOilGas, setSelectedOilGas] = useState<OilGasFacility | null>(null);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [zoomLevel, setZoomLevel] = useState(5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [filterTypes, setFilterTypes] = useState<Set<EnergyType>>(new Set(["vind", "vann", "havvind", "oilgas"]));
  const [filterWindStatus, setFilterWindStatus] = useState<Set<WindStatus>>(new Set(["operational"]));
  const [showSmall, setShowSmall] = useState(false);
  const [selected, setSelected] = useState<EnergyPlant | null>(null);
  const [selectedHavvind, setSelectedHavvind] = useState<HavvindZone | null>(null);
  const [hydroStation, setHydroStation] = useState<{
    station: { id: string; name: string; river: string | null; distanceKm: number } | null;
    discharge: number | null;
    waterLevel: number | null;
    percentile: { p25: number | null; p50: number | null; p75: number | null; p90: number | null; min: number | null; max: number | null } | null;
  } | null>(null);
  const [loadingHydro, setLoadingHydro] = useState(false);
  const [center, setCenter] = useState<{
    lat: number;
    lon: number;
    zoom?: number;
    _t?: number;
  } | null>(null);
  const [tileLayer, setTileLayer] = useState<TileLayerKey>("gråtone");
  const [showSjokart, setShowSjokart] = useState(false);
  const [showProdInfo, setShowProdInfo] = useState(false);

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
      setHavvindZones(data.havvindZones ?? []);
      setOilGasFacilities(data.oilGasFacilities ?? []);
      setPipelines(data.pipelines ?? []);
      setLoading(false);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlants();
    fetch("/data/production.json")
      .then((r) => r.json())
      .then((d) => {
        setProductionData(d.fields ?? d);
        if (d.fetchedAt) setProductionFetchedAt(d.fetchedAt);
      })
      .catch(() => {});
  }, [loadPlants]);

  // Sync selection → URL hash
  useEffect(() => {
    if (selected) {
      history.replaceState(null, "", `#kraft-${selected.id}`);
    } else if (selectedOilGas) {
      history.replaceState(null, "", `#anlegg-${selectedOilGas.id}`);
    } else if (selectedHavvind) {
      history.replaceState(null, "", `#havvind-${selectedHavvind.id}`);
    } else {
      history.replaceState(null, "", window.location.pathname);
    }
  }, [selected, selectedOilGas, selectedHavvind]);

  // Read URL hash on data load → auto-select
  useEffect(() => {
    if (loading) return;
    const hash = window.location.hash;
    if (!hash) return;
    const match = hash.match(/^#(kraft|anlegg|havvind)-(\d+)$/);
    if (!match) return;
    const [, type, idStr] = match;
    const id = parseInt(idStr, 10);
    if (type === "kraft") {
      const plant = plants.find((p) => p.id === id);
      if (plant) { setSelected(plant); setShowInfoSheet(true); setCenter({ lat: plant.lat, lon: plant.lon, zoom: 12 }); }
    } else if (type === "anlegg") {
      const fac = oilGasFacilities.find((f) => f.id === id);
      if (fac) { setSelectedOilGas(fac); setShowInfoSheet(true); setCenter({ lat: fac.lat, lon: fac.lon, zoom: 12 }); }
    } else if (type === "havvind") {
      const zone = havvindZones.find((z) => z.id === id);
      if (zone) { setSelectedHavvind(zone); setShowInfoSheet(true); setCenter({ lat: zone.center.lat, lon: zone.center.lon, zoom: 9 }); }
    }
  }, [loading, plants, oilGasFacilities, havvindZones]);

  useEffect(() => {
    fetch("https://ws.geonorge.no/kommuneinfo/v1/kommuner")
      .then((r) => r.json())
      .then((data: KommuneEntry[]) => {
        kommunerRef.current = data;
      })
      .catch(() => {});
  }, []);

  // Fetch live hydro station data when info sheet opens for a hydro plant
  useEffect(() => {
    if (!showInfoSheet || !selected || selected.type !== "vann") {
      setHydroStation(null);
      return;
    }
    let cancelled = false;
    setLoadingHydro(true);
    fetch(`/api/hydro-station?lat=${selected.lat}&lon=${selected.lon}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setHydroStation(data.error ? null : data);
          setLoadingHydro(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHydroStation(null);
          setLoadingHydro(false);
        }
      });
    return () => { cancelled = true; };
  }, [showInfoSheet, selected]);

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

      const ql = q.toLowerCase();
      const facilityMatches: Suggestion[] = oilGasFacilities
        .filter((f) => f.name.toLowerCase().includes(ql) || (f.fieldName && f.fieldName.toLowerCase().includes(ql)))
        .slice(0, 5)
        .map((f) => ({
          type: "anlegg",
          name: f.name,
          subtitle: [f.kind, f.fieldName].filter(Boolean).join(" · "),
          lat: f.lat,
          lon: f.lon,
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
        ...facilityMatches,
        ...fylkeMatches,
        ...kommuneMatches,
        ...adresseMatches,
      ]);
      setShowDropdown(true);
      setLoadingSuggestions(false);
    },
    [searchAbort, oilGasFacilities]
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
    setSelectedHavvind(null);
    setSelectedOilGas(null);
    if (s.type === "anlegg") {
      setQuery(s.name);
      setCenter({ lat: s.lat, lon: s.lon, zoom: 12 });
      return;
    }
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
    } else if (s.type === "adresse") {
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

  const filteredHavvindZones = useMemo(() => {
    if (!filterTypes.has("havvind")) return [];
    return havvindZones;
  }, [havvindZones, filterTypes]);

  const filteredOilGas = useMemo(() => {
    if (!filterTypes.has("oilgas")) return [];
    return oilGasFacilities;
  }, [oilGasFacilities, filterTypes]);

  const filteredPipelines = useMemo(() => {
    if (!filterTypes.has("oilgas")) return [];
    return pipelines;
  }, [pipelines, filterTypes]);

  const activeFilterCount = (filterTypes.size < 4 ? 1 : 0) + (showSmall ? 1 : 0) + (filterWindStatus.size !== 1 || !filterWindStatus.has("operational") ? 1 : 0);

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
                placeholder="Søk etter anlegg, felt, sted..."
                className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground text-[16px] sm:text-sm"
              />
            </div>
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
                    <SheetTitle className="text-left">Filtrer energikilder</SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col gap-4 py-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Type</p>
                      <div className="rounded-xl border overflow-hidden">
                        {(["vind", "vann", "havvind", "oilgas"] as EnergyType[]).map((t) => {
                          const active = filterTypes.has(t);
                          const meta = TYPE_META[t];
                          const count = t === "havvind" ? havvindZones.length : t === "oilgas" ? oilGasFacilities.length : plants.filter((p) => p.type === t && (showSmall || (p.capacityMW ?? 0) >= MW_THRESHOLD)).length;
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
                        onClick={() => { setFilterTypes(new Set(["vind", "vann", "havvind", "oilgas"])); setFilterWindStatus(new Set(["operational"])); setShowSmall(false); }}
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
            <Button onClick={handleLocate} disabled={locating || loading} variant="secondary" size="icon" className="shadow-lg shrink-0 h-11 w-11 rounded-xl">
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            </Button>
          </div>

          {showDropdown && suggestions.length > 0 && (
            <ul className="absolute top-full mt-1 left-0 right-0 bg-background rounded-xl shadow-xl border overflow-hidden">
              {suggestions.map((s, i) => (
                <li key={i}>
                  <button
                    onMouseDown={() => handleSelect(s)}
                    className={`w-full text-left px-4 py-3 text-sm flex items-start gap-3 transition-colors border-b last:border-0 ${highlightedIndex === i ? "bg-muted" : "hover:bg-muted"}`}
                  >
                    {s.type === "anlegg" ? <Anchor className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" /> : <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />}
                    {s.type === "anlegg" ? (
                      <div>
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.subtitle}</p>
                      </div>
                    ) : s.type === "fylke" ? (
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
                    ) : s.type === "adresse" ? (
                      <div>
                        <p className="font-medium">
                          {s.addr.adressetekst}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {s.addr.poststed}, {s.addr.kommunenavn}
                        </p>
                      </div>
                    ) : null}
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
                ? `${filteredPlants.length} kraftverk${filteredOilGas.length > 0 ? ` + ${filteredOilGas.length} anlegg` : ""}${filteredHavvindZones.length > 0 ? ` + ${filteredHavvindZones.length} havvind` : ""} — Kilde: NVE / Sodir`
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
          {showSjokart && (
            <TileLayer
              key="sjokart"
              url="https://cache.kartverket.no/v1/wmts/1.0.0/sjokartraster/default/webmercator/{z}/{y}/{x}.png"
              attribution='&copy; <a href="https://www.kartverket.no/">Kartverket</a>'
              maxZoom={17}
              opacity={0.7}
            />
          )}
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
                    setSelectedHavvind(null);
                    setSelectedOilGas(null);
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
          {/* Havvind zone markers */}
          {filteredHavvindZones.map((z) => (
            <Marker
              key={`havvind-${z.id}`}
              position={[z.center.lat, z.center.lon]}
              icon={havvindIcon(selectedHavvind?.id === z.id, tileLayer === "gråtone")}
              eventHandlers={{
                click() {
                  setSelectedHavvind((prev) => prev?.id === z.id ? null : z);
                  setSelected(null);
                  setSelectedOilGas(null);
                  setShowInfoSheet(false);
                },
              }}
            />
          ))}
          {/* Havvind zone polygons at zoom >= 7 */}
          {zoomLevel >= 7 && filteredHavvindZones.map((z) => (
            <Polygon
              key={`havvind-poly-${z.id}`}
              positions={z.polygon}
              pathOptions={{
                fillColor: HAVVIND_COLOR,
                fillOpacity: selectedHavvind?.id === z.id ? 0.35 : 0.12,
                color: selectedHavvind?.id === z.id ? "#5b21b6" : HAVVIND_COLOR,
                weight: selectedHavvind?.id === z.id ? 2.5 : 1.5,
                dashArray: selectedHavvind?.id === z.id ? undefined : "6 4",
              }}
              eventHandlers={{
                click() {
                  setSelectedHavvind((prev) => prev?.id === z.id ? null : z);
                  setSelected(null);
                  setSelectedOilGas(null);
                  setShowInfoSheet(false);
                },
              }}
            />
          ))}
          {/* Oil & gas facility markers with clustering */}
          {filteredOilGas.length > 0 && (
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
                  html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${OILGAS_COLOR};color:white;border-radius:50%;font-weight:700;font-size:${fontSize}px;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid rgba(255,255,255,0.6)">${count}</div>`,
                  className: "",
                  iconSize: [size, size],
                  iconAnchor: [size / 2, size / 2],
                });
              }}
            >
              {filteredOilGas.map((f) => (
                <Marker
                  key={`oilgas-${f.id}`}
                  position={[f.lat, f.lon]}
                  icon={oilgasIcon(selectedOilGas?.id === f.id, tileLayer === "gråtone", f.isSurface)}
                  eventHandlers={{
                    click() {
                      setSelectedOilGas((prev) => prev?.id === f.id ? null : f);
                      setSelected(null);
                      setSelectedHavvind(null);
                      setShowInfoSheet(false);
                    },
                  }}
                />
              ))}
            </MarkerClusterGroup>
          )}
          {/* Pipelines at zoom >= 8 */}
          {zoomLevel >= 8 && filteredPipelines.map((p) => (
            <span key={`pipe-${p.id}`}>
              {/* Invisible wide hit area */}
              <Polyline
                positions={p.path}
                pathOptions={{ color: "transparent", weight: 16, opacity: 0 }}
                eventHandlers={{
                  click() {
                    setSelectedPipeline(p);
                    setShowInfo(true);
                  },
                }}
              />
              {/* Visible line */}
              <Polyline
                positions={p.path}
                pathOptions={{
                  color: p.medium === "Gas" ? "#facc15" : p.medium === "Oil" ? OILGAS_COLOR : "#a3a3a3",
                  weight: Math.max(1.5, Math.min(3, (p.dimension ?? 20) / 15)),
                  opacity: 0.6,
                  dashArray: p.phase === "DECOMMISSIONED" ? "6 4" : undefined,
                }}
                interactive={false}
              />
            </span>
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
          <button
            onClick={() => setShowSjokart(!showSjokart)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors border-l ${showSjokart ? "text-white" : "text-muted-foreground hover:bg-muted"}`}
            style={showSjokart ? { background: "var(--kv-blue)" } : {}}
          >
            <Anchor className="h-3.5 w-3.5" />
            Sjøkart
          </button>
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
                <div className="flex items-center gap-1.5 mb-0.5">
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
                <p className="font-bold text-base truncate leading-snug">{selected.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[selected.owner !== selected.name ? selected.owner : null, selected.municipality].filter(Boolean).join(" · ")}
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
            <div className={`grid gap-3 mt-3 ${selected.type === "vind" ? "grid-cols-3" : "grid-cols-2"}`}>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold" style={{ color: TYPE_META[selected.type].color }}>
                  {selected.capacityMW != null ? Math.round(selected.capacityMW) : "—"}
                </span>
                <span className="text-xs text-muted-foreground">MW</span>
              </div>
              {selected.type === "vind" && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold" style={{ color: TYPE_META[selected.type].color }}>
                    {selected.turbineCount ?? "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">turbiner</span>
                </div>
              )}
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold" style={{ color: TYPE_META[selected.type].color }}>
                  {selected.type === "vind"
                    ? (selected.productionGWh != null ? Math.round(selected.productionGWh) : "—")
                    : (selected.fallHeight != null ? Math.round(selected.fallHeight) : "—")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {selected.type === "vind" ? "GWh/år" : "m fallhøyde"}
                </span>
              </div>
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

        {/* Oil & gas compact card */}
        {selectedOilGas && !showInfoSheet && (
          <div
            className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-96 z-[999] bg-card rounded-2xl shadow-xl px-4 py-4"
            style={{ border: "1.5px solid var(--border)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white" style={{ background: OILGAS_COLOR }}>
                    Olje & gass
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {selectedOilGas.isSurface ? "Overflate" : "Undervanns"}
                  </span>
                </div>
                <p className="font-bold text-base truncate leading-snug">{selectedOilGas.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[selectedOilGas.operator, selectedOilGas.fieldName].filter(Boolean).join(" · ")}
                </p>
              </div>
              <button
                onClick={() => setSelectedOilGas(null)}
                className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Lukk"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              {selectedOilGas.waterDepth != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold" style={{ color: OILGAS_COLOR }}>
                    {Math.round(selectedOilGas.waterDepth)}
                  </span>
                  <span className="text-xs text-muted-foreground">m dybde</span>
                </div>
              )}
              {selectedOilGas.yearStartup != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold" style={{ color: OILGAS_COLOR }}>
                    {selectedOilGas.yearStartup}
                  </span>
                  <span className="text-xs text-muted-foreground">oppstart</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { setShowInfoSheet(true); setShowFilter(false); }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border bg-muted/50 hover:bg-muted transition-colors"
              >
                <ChevronUp className="h-3.5 w-3.5" /> Vis mer
              </button>
            </div>
          </div>
        )}

        {/* Oil & gas detail sheet */}
        <Sheet open={showInfoSheet && !!selectedOilGas && !selected && !selectedHavvind} onOpenChange={(open) => { setShowInfoSheet(open); }}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[85svh] overflow-y-auto">
            {selectedOilGas && (
              <div className="mx-auto w-full max-w-md px-4 pb-6">
                <SheetHeader>
                  <SheetTitle className="text-left sr-only">{selectedOilGas.name}</SheetTitle>
                </SheetHeader>

                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white" style={{ background: OILGAS_COLOR }}>
                    Olje & gass
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {selectedOilGas.isSurface ? "Overflate" : "Undervanns"}
                  </span>
                  {selectedOilGas.phase === "IN SERVICE" && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-green-100 text-green-800">I drift</span>
                  )}
                  {selectedOilGas.phase === "REMOVED" && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-red-100 text-red-800">Fjernet</span>
                  )}
                </div>
                <p className="font-bold text-lg leading-snug">{selectedOilGas.name}</p>
                {selectedOilGas.operator && (
                  <p className="text-sm text-muted-foreground">{selectedOilGas.operator}</p>
                )}

                <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t">
                  {selectedOilGas.waterDepth != null && (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold" style={{ color: OILGAS_COLOR }}>
                        {Math.round(selectedOilGas.waterDepth)}
                      </span>
                      <span className="text-xs text-muted-foreground">m dybde</span>
                    </div>
                  )}
                  {selectedOilGas.yearStartup != null && (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold" style={{ color: OILGAS_COLOR }}>
                        {selectedOilGas.yearStartup}
                      </span>
                      <span className="text-xs text-muted-foreground">oppstart</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t flex flex-col gap-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium">{formatKind(selectedOilGas.kind)}</span>
                  </div>
                  {selectedOilGas.fieldName && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Felt</span>
                      <span className="font-medium">{titleCase(selectedOilGas.fieldName)}</span>
                    </div>
                  )}
                  {selectedOilGas.functions && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Funksjoner</span>
                      <span className="font-medium text-right max-w-[200px]">{formatFunctions(selectedOilGas.functions)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <span className="font-medium">{selectedOilGas.phase === "IN SERVICE" ? "I drift" : selectedOilGas.phase === "REMOVED" ? "Fjernet" : selectedOilGas.phase === "DECOMMISSIONED" ? "Nedlagt" : selectedOilGas.phase}</span>
                  </div>
                </div>

                {/* Production data */}
                {(() => {
                  const fieldProd = selectedOilGas.fieldName ? productionData[selectedOilGas.fieldName] : null;
                  if (!fieldProd || fieldProd.length === 0) return null;
                  const totalOe = fieldProd.reduce((s, y) => s + y.oe, 0);
                  const totalOil = fieldProd.reduce((s, y) => s + y.oil, 0);
                  const totalGas = fieldProd.reduce((s, y) => s + y.gas, 0);
                  const latest = fieldProd[fieldProd.length - 1];
                  const maxOe = Math.max(...fieldProd.map((y) => y.oe));
                  return (
                    <div className="mt-4 pt-4 border-t">
                      <button
                        onClick={() => setShowProdInfo((v) => !v)}
                        className="flex items-center gap-1.5 mb-3 group"
                      >
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">Produksjon — {selectedOilGas.fieldName}</p>
                        <Info className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                      </button>
                      {showProdInfo && (
                        <div className="bg-muted/50 border rounded-xl p-3 mb-3">
                          <ul className="text-[11px] text-muted-foreground space-y-1">
                            <li><strong>Sm³</strong> — Standardkubikkmeter, målt ved 15°C og 1 atm</li>
                            <li><strong>o.e.</strong> — Oljeekvivalenter, samlet mål for olje + gass + NGL + kondensat</li>
                            <li><strong>Olje</strong> — Netto salgbar råolje (mill Sm³)</li>
                            <li><strong>Gass</strong> — Netto salgbar naturgass (mrd Sm³)</li>
                          </ul>
                          <p className="text-[10px] text-muted-foreground/60 mt-2">Kilde: Sokkeldirektoratet, årlig feltproduksjon{productionFetchedAt && ` · Hentet ${new Date(productionFetchedAt).toLocaleDateString("nb-NO")}`}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-2xl font-extrabold" style={{ color: OILGAS_COLOR }}>{totalOe.toFixed(1)}</span>
                          <p className="text-[10px] text-muted-foreground">mill Sm³ o.e. totalt</p>
                        </div>
                        <div>
                          <span className="text-2xl font-extrabold" style={{ color: OILGAS_COLOR }}>{latest.oe.toFixed(2)}</span>
                          <p className="text-[10px] text-muted-foreground">mill Sm³ o.e. ({latest.year})</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm mt-2">
                        <span className="text-muted-foreground">Olje</span>
                        <span className="font-medium">{totalOil.toFixed(1)} mill Sm³</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Gass</span>
                        <span className="font-medium">{totalGas.toFixed(1)} mrd Sm³</span>
                      </div>
                      {/* Sparkline */}
                      <div className="mt-3 flex items-end gap-[2px] h-10">
                        {fieldProd.map((y) => (
                          <div
                            key={y.year}
                            className="flex-1 rounded-sm min-w-[2px] transition-all"
                            style={{
                              height: `${Math.max(4, (y.oe / maxOe) * 100)}%`,
                              background: OILGAS_COLOR,
                              opacity: y.year === latest.year ? 1 : 0.4,
                            }}
                            title={`${y.year}: ${y.oe.toFixed(3)} mill Sm³ o.e.`}
                          />
                        ))}
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{fieldProd[0].year}</span>
                        <span className="text-[10px] text-muted-foreground">{latest.year}</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="mt-4 pt-4 border-t flex flex-col gap-3">
                  {selectedOilGas.factPageUrl && (
                    <a
                      href={selectedOilGas.factPageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border bg-muted/50 hover:bg-muted transition-colors w-full"
                    >
                      <ExternalLink className="h-4 w-4" /> Les mer på Sodir
                    </a>
                  )}
                  <p className="text-xs text-muted-foreground text-center">
                    Kilde: <a href="https://www.sodir.no/en/facts/data-and-analyses/open-data/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Sokkeldirektoratet (Sodir)</a>
                  </p>
                  <DataDisclaimer />
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Havvind compact card */}
        {selectedHavvind && !showInfoSheet && (
          <div
            className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-96 z-[999] bg-card rounded-2xl shadow-xl px-4 py-4"
            style={{ border: "1.5px solid var(--border)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white" style={{ background: HAVVIND_COLOR }}>
                    Havvind · Utredning
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {selectedHavvind.typeAnlegg}
                  </span>
                </div>
                <p className="font-bold text-base truncate leading-snug">{selectedHavvind.name}</p>
                <p className="text-xs text-muted-foreground">Planlagt område — ikke bygget ennå</p>
              </div>
              <button
                onClick={() => setSelectedHavvind(null)}
                className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Lukk"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              {selectedHavvind.arealKm2 != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold" style={{ color: HAVVIND_COLOR }}>
                    {selectedHavvind.arealKm2.toLocaleString("nb-NO")}
                  </span>
                  <span className="text-xs text-muted-foreground">km²</span>
                </div>
              )}
              {selectedHavvind.minDistanceKm != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold" style={{ color: HAVVIND_COLOR }}>
                    {selectedHavvind.minDistanceKm}
                  </span>
                  <span className="text-xs text-muted-foreground">km til land</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { setShowInfoSheet(true); setShowFilter(false); }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border bg-muted/50 hover:bg-muted transition-colors"
              >
                <ChevronUp className="h-3.5 w-3.5" /> Vis mer
              </button>
            </div>
          </div>
        )}

        {/* Havvind detail sheet */}
        <Sheet open={showInfoSheet && !!selectedHavvind && !selected} onOpenChange={(open) => { setShowInfoSheet(open); }}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[85svh] overflow-y-auto">
            {selectedHavvind && (
              <div className="mx-auto w-full max-w-md px-4 pb-6">
                <SheetHeader>
                  <SheetTitle className="text-left sr-only">{selectedHavvind.name}</SheetTitle>
                </SheetHeader>

                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white" style={{ background: HAVVIND_COLOR }}>
                    Havvind · Utredning
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {selectedHavvind.typeAnlegg}
                  </span>
                </div>
                <p className="font-bold text-lg leading-snug">{selectedHavvind.name}</p>
                <p className="text-sm text-muted-foreground">Planlagt utredningsområde — ingen turbiner er bygget ennå</p>

                <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t">
                  {selectedHavvind.arealKm2 != null && (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold" style={{ color: HAVVIND_COLOR }}>
                        {selectedHavvind.arealKm2.toLocaleString("nb-NO")}
                      </span>
                      <span className="text-xs text-muted-foreground">km² areal</span>
                    </div>
                  )}
                  {selectedHavvind.minDistanceKm != null && (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold" style={{ color: HAVVIND_COLOR }}>
                        {selectedHavvind.minDistanceKm}
                      </span>
                      <span className="text-xs text-muted-foreground">km til land</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t flex flex-col gap-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium">{selectedHavvind.typeAnlegg}</span>
                  </div>
                  {selectedHavvind.arealKm2 != null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Areal</span>
                      <span className="font-medium">{selectedHavvind.arealKm2.toLocaleString("nb-NO")} km²</span>
                    </div>
                  )}
                  {selectedHavvind.minDistanceKm != null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Avstand til fastland</span>
                      <span className="font-medium">{selectedHavvind.minDistanceKm} km</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t flex flex-col gap-3">
                  {selectedHavvind.nveUrl && (
                    <a
                      href={selectedHavvind.nveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border bg-muted/50 hover:bg-muted transition-colors w-full"
                    >
                      <ExternalLink className="h-4 w-4" /> Les mer på NVE
                    </a>
                  )}
                  <p className="text-xs text-muted-foreground text-center">
                    Kilde: <a href="https://nve.geodataonline.no/arcgis/rest/services/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">NVE Geodata</a> · Havvind 2023
                  </p>
                  <DataDisclaimer />
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Info detail sheet */}
        <Sheet open={showInfoSheet && !!selected} onOpenChange={(open) => { setShowInfoSheet(open); if (!open) { /* keep selected so compact card reappears */ } }}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[85svh] overflow-y-auto">
            {selected && (
              <div className="mx-auto w-full max-w-md px-4 pb-6">
                <SheetHeader>
                  <SheetTitle className="text-left sr-only">{selected.name}</SheetTitle>
                </SheetHeader>

                {/* Layer 1 — Identity */}
                <div className="flex items-center gap-1.5 mb-1">
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
                <p className="font-bold text-lg leading-snug">{selected.name}</p>
                {selected.owner && selected.owner !== selected.name && (
                  <p className="text-sm text-muted-foreground">{selected.owner}</p>
                )}
                {(selected.municipality || selected.county) && (
                  <p className="text-sm text-muted-foreground">
                    {[selected.municipality, selected.county].filter(Boolean).join(", ")}
                  </p>
                )}

                {/* Layer 2 — Key metrics */}
                <div className={`grid gap-4 mt-4 pt-4 border-t ${selected.type === "vind" ? "grid-cols-3" : "grid-cols-2"}`}>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-extrabold" style={{ color: TYPE_META[selected.type].color }}>
                      {selected.capacityMW != null ? Math.round(selected.capacityMW) : "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">MW kapasitet</span>
                  </div>
                  {selected.type === "vind" && (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold" style={{ color: TYPE_META[selected.type].color }}>
                        {selected.turbineCount ?? "—"}
                      </span>
                      <span className="text-xs text-muted-foreground">turbiner</span>
                    </div>
                  )}
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-extrabold" style={{ color: TYPE_META[selected.type].color }}>
                      {selected.type === "vind"
                        ? (selected.productionGWh != null ? Math.round(selected.productionGWh) : "—")
                        : (selected.fallHeight != null ? Math.round(selected.fallHeight) : "—")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {selected.type === "vind" ? "GWh/år" : "m fallhøyde"}
                    </span>
                  </div>
                </div>

                {/* Layer 3 — Details */}
                {selected.type === "vann" && (
                  <div className="mt-4 pt-4 border-t flex flex-col gap-2">
                    {selected.river && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Elv</span>
                        <span className="font-medium">{selected.river}</span>
                      </div>
                    )}
                    {selected.yearBuilt && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Idriftsatt</span>
                        <span className="font-medium">{selected.yearBuilt}</span>
                      </div>
                    )}

                    {/* Live hydro station data */}
                    {loadingHydro && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Henter vanndata...
                      </div>
                    )}
                    {!loadingHydro && hydroStation?.station && (
                      <div className="mt-2 pt-3 border-t">
                        <div className="flex items-center gap-1.5 mb-3">
                          <Waves className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Målestasjon: {hydroStation.station.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground/60">
                            ({hydroStation.station.distanceKm} km unna)
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {hydroStation.discharge != null && (
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-2xl font-extrabold" style={{ color: "#0891b2" }}>
                                {hydroStation.discharge.toFixed(1)}
                              </span>
                              <span className="text-xs text-muted-foreground">m³/s vannføring</span>
                            </div>
                          )}
                          {hydroStation.waterLevel != null && (
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-2xl font-extrabold" style={{ color: "#0891b2" }}>
                                {hydroStation.waterLevel.toFixed(2)}
                              </span>
                              <span className="text-xs text-muted-foreground">m vannstand</span>
                            </div>
                          )}
                        </div>
                        {hydroStation.percentile && hydroStation.discharge != null && (
                          <div className="mt-3">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Gauge className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">Vannføring vs. normalen for denne tiden av året</span>
                            </div>
                            <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className="absolute inset-y-0 left-0 rounded-full"
                                style={{
                                  width: `${Math.min(100, Math.max(0, hydroStation.percentile.max ? (hydroStation.discharge / hydroStation.percentile.max) * 100 : 50))}%`,
                                  background: hydroStation.percentile.p75 && hydroStation.discharge > hydroStation.percentile.p75
                                    ? "#dc2626"
                                    : hydroStation.percentile.p50 && hydroStation.discharge > hydroStation.percentile.p50
                                      ? "#ca8a04"
                                      : "#16a34a",
                                }}
                              />
                            </div>
                            <div className="flex justify-between mt-0.5 text-[10px] text-muted-foreground">
                              <span>Lavt</span>
                              <span>{hydroStation.percentile.p50 != null ? `Median: ${hydroStation.percentile.p50.toFixed(1)} m³/s` : ""}</span>
                              <span>Høyt</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
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
                    Kilde: <a href="https://nve.geodataonline.no/arcgis/rest/services/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">NVE Geodata</a> · Oppdateres hver time
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
          onClick={() => { setShowInfo(false); setSelectedPipeline(null); }}
        >
          <div
            className="bg-background rounded-2xl shadow-xl border w-full max-w-sm p-5 max-h-[85svh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-base">{selectedPipeline ? "Rørledning" : "Om energidata"}</h2>
              <button
                onClick={() => { setShowInfo(false); setSelectedPipeline(null); }}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Lukk"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {selectedPipeline ? (
              <div className="flex flex-col gap-4 text-sm">
                {/* Pipeline detail */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white" style={{ background: selectedPipeline.medium === "Gas" ? "#ca8a04" : OILGAS_COLOR }}>
                      {selectedPipeline.medium ?? "Ukjent"}
                    </span>
                    {selectedPipeline.phase && (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {selectedPipeline.phase === "IN SERVICE" ? "I drift" : selectedPipeline.phase === "DECOMMISSIONED" ? "Nedlagt" : selectedPipeline.phase}
                      </span>
                    )}
                  </div>
                  <p className="font-bold text-base leading-snug mt-1">{selectedPipeline.name}</p>
                </div>

                <div className="flex flex-col gap-2 pt-3 border-t">
                  {selectedPipeline.fromFacility && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Fra</span>
                      <span className="font-medium">{selectedPipeline.fromFacility}</span>
                    </div>
                  )}
                  {selectedPipeline.toFacility && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Til</span>
                      <span className="font-medium">{selectedPipeline.toFacility}</span>
                    </div>
                  )}
                  {selectedPipeline.dimension != null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Diameter</span>
                      <span className="font-medium">{selectedPipeline.dimension}" ({Math.round(selectedPipeline.dimension * 25.4)} mm)</span>
                    </div>
                  )}
                  {selectedPipeline.belongsTo && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">System</span>
                      <span className="font-medium">{selectedPipeline.belongsTo}</span>
                    </div>
                  )}
                </div>

                {/* General pipeline legend */}
                <div className="pt-3 border-t">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Fargeforklaring</p>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-0.5 rounded-full" style={{ background: OILGAS_COLOR }} />
                      <span className="text-xs text-muted-foreground">Oljerørledning</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-0.5 rounded-full" style={{ background: "#facc15" }} />
                      <span className="text-xs text-muted-foreground">Gassrørledning</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-0.5 rounded-full bg-neutral-400" />
                      <span className="text-xs text-muted-foreground">Annet (vann, kjemikalier etc.)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-0.5 rounded-full border border-dashed border-neutral-400" />
                      <span className="text-xs text-muted-foreground">Nedlagt</span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground pt-2 border-t">
                  Kilde: <a href="https://www.sodir.no/en/facts/data-and-analyses/open-data/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Sokkeldirektoratet (Sodir)</a>
                </p>
                <DataDisclaimer />
              </div>
            ) : (
              <div className="flex flex-col gap-3 text-sm">
                <p>
                  Kartet viser Norges energiinfrastruktur — fornybar og fossil — med data fra{" "}
                  <strong>NVE</strong> og <strong>Sodir</strong>.
                </p>
                <div className="bg-muted/50 rounded-xl p-3">
                  <p className="font-semibold mb-1">Vindkraft og vannkraft</p>
                  <p className="text-muted-foreground">Over 1700 vannkraftverk og et voksende antall vindkraftverk. <strong>MW</strong> er installert kapasitet. Kraftverk under {MW_THRESHOLD} MW er skjult som standard.</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-3">
                  <p className="font-semibold mb-1">Havvind (planlagt)</p>
                  <p className="text-muted-foreground">20 utredningsområder for offshore vindkraft. Disse er ikke bygget ennå — kun planlagte soner fra NVEs 2023-utredning.</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-3">
                  <p className="font-semibold mb-1">Olje og gass</p>
                  <p className="text-muted-foreground">Over 1200 anlegg på norsk sokkel — plattformer, FPSO-er, undervannsinstallasjoner. Rørledninger vises ved innzooming og kan klikkes for detaljer.</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Data oppdateres hver time. Kilde:{" "}
                  <a href="https://nve.geodataonline.no/arcgis/rest/services/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">NVE Geodata</a>{" · "}
                  <a href="https://www.sodir.no/en/facts/data-and-analyses/open-data/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Sodir</a>
                </p>
                <DataDisclaimer />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
