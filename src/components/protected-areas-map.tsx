"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, GeoJSON, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoJsonObject, Feature } from "geojson";
import type { Layer } from "leaflet";
import { Search, MapPin, Loader2, X, Map as MapIcon, ChevronUp, Info, ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FYLKER } from "@/lib/fylker";
import { FlyTo, DataDisclaimer, MapError, AnimatedCount, interpolateColor, useDebounceRef, useSearchAbort } from "@/lib/map-utils";

// ─── Geodesic area from GeoJSON coordinates ────────────────

const RAD = Math.PI / 180;
const R = 6371000; // Earth radius in meters

function ringArea(coords: number[][]): number {
  let area = 0;
  for (let i = 0, len = coords.length; i < len; i++) {
    const j = (i + 1) % len;
    area += (coords[j][0] - coords[i][0]) * RAD *
      (2 + Math.sin(coords[i][1] * RAD) + Math.sin(coords[j][1] * RAD));
  }
  return Math.abs(area * R * R / 2);
}

function featureAreaKm2(geometry: { type: string; coordinates: number[][][] | number[][][][] }): number {
  let total = 0;
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as number[][][];
    total = ringArea(rings[0]);
    for (let i = 1; i < rings.length; i++) total -= ringArea(rings[i]);
  } else if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates as number[][][][]) {
      total += ringArea(polygon[0]);
      for (let i = 1; i < polygon.length; i++) total -= ringArea(polygon[i]);
    }
  }
  return total / 1e6;
}

// ─── Fylke lookup ───────────────────────────────────────────

const FYLKE_MAP: Record<string, string> = {};
FYLKER.forEach((f) => { FYLKE_MAP[f.fylkesnummer] = f.fylkesnavn; });

function getFylke(kommunenummer: string): string | null {
  return FYLKE_MAP[kommunenummer.substring(0, 2)] ?? null;
}

// ─── Qualitative label ─────────────────────────────────────

function vernLabel(pct: number): { text: string; color: string } {
  if (pct === 0) return { text: "Ingen vernet natur", color: "#6b7280" };
  if (pct < 5) return { text: "Lav andel vernet natur", color: "#ef4444" };
  if (pct < 15) return { text: "Under landsgjennomsnittet", color: "#f59e0b" };
  if (pct < 25) return { text: "Rundt landsgjennomsnittet", color: "#16a34a" };
  if (pct < 50) return { text: "Godt over landsgjennomsnittet", color: "#16a34a" };
  return { text: "Blant de mest vernede i Norge", color: "#16a34a" };
}

// ─── Types ──────────────────────────────────────────────────

interface VerneData {
  total: number | null;
  np: number | null;
  nr: number | null;
  lv: number | null;
  nm: number | null;
}

interface IncomeAddress {
  adressetekst: string;
  poststed: string;
  kommunenavn: string;
  kommunenummer: string;
  representasjonspunkt: { lat: number; lon: number };
}

type Suggestion =
  | { type: "fylke"; fylkesnavn: string; lat: number; lon: number; zoom: number }
  | { type: "kommune"; kommunenummer: string; kommunenavn: string }
  | { type: "adresse"; addr: IncomeAddress };

interface SelectedKommune {
  kommunenummer: string;
  kommunenavn: string;
  vern: VerneData | null;
  totalAreaKm2: number;
  fylke: string | null;
  coords: { lat: number; lon: number };
}

const VERNE_LABELS: Record<string, string> = {
  np: "Nasjonalpark",
  nr: "Naturreservat",
  lv: "Landskapsvernområde",
  nm: "Andre vernekategorier",
};


/** Color by percentage of kommune that is protected. Caps at 60% for color scale. */
function vernePctColor(pct: number): string {
  if (pct <= 0) return "#e3ddd4";
  const t = Math.max(0, Math.min(1, pct / 60));
  return interpolateColor(t);
}

function fmt(val: number | null): string {
  if (val == null) return "—";
  return `${val.toFixed(2).replace(".", ",")} km²`;
}

function computeVerneStats(
  verneData: Record<string, VerneData>,
  kommuneAreas: Record<string, number>,
  kommunenummer: string,
) {
  // Percentage-based ranking (all kommuner with area data)
  const withPct = Object.entries(verneData)
    .filter(([k]) => kommuneAreas[k] > 0)
    .map(([k, v]) => ({ k, pct: ((v.total ?? 0) / kommuneAreas[k]) * 100 }))
    .sort((a, b) => b.pct - a.pct);

  const rank = withPct.findIndex((c) => c.k === kommunenummer) + 1;
  const total = withPct.length;

  // National average: sum vernet / sum total area
  const sumVern = Object.entries(verneData).reduce((s, [k, v]) => s + (kommuneAreas[k] > 0 ? (v.total ?? 0) : 0), 0);
  const sumArea = Object.values(kommuneAreas).reduce((s, a) => s + a, 0);
  const nationalPct = sumArea > 0 ? (sumVern / sumArea) * 100 : 0;

  // Fylke ranking
  const fylkesnr = kommunenummer.substring(0, 2);
  const fylkeKommuner = withPct.filter((c) => c.k.startsWith(fylkesnr));
  const fylkeRank = fylkeKommuner.findIndex((c) => c.k === kommunenummer) + 1;
  const fylkeTotal = fylkeKommuner.length;

  return { rank, total, nationalPct, fylkeRank, fylkeTotal };
}

export function ProtectedAreasMap() {
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const [verneData, setVerneData] = useState<Record<string, VerneData>>({});
  const [loading, setLoading] = useState(true);
  const [counting, setCounting] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [error, setError] = useState(false);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selected, setSelected] = useState<SelectedKommune | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lon: number; zoom?: number } | null>(null);
  const [showBase, setShowBase] = useState(false);
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const verneRef = useRef<Record<string, VerneData>>({});
  const kommuneAreasRef = useRef<Record<string, number>>({});
  const geoFeaturesRef = useRef<Array<{ kommunenummer: string; kommunenavn: string }>>([]);
  const layerRefs = useRef<Map<string, L.Path>>(new Map());
  const selectedKommuneRef = useRef<string | null>(null);
  const debounceRef = useDebounceRef();
  const searchAbort = useSearchAbort();

  const loadData = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const [geo, verne] = await Promise.all([
        fetch("/api/kommuner").then((r) => r.json()),
        fetch("/api/protected-areas").then((r) => r.json()),
      ]);
      verneRef.current = verne;
      const areas: Record<string, number> = {};
      geoFeaturesRef.current = (geo.features ?? []).map((f: { properties: { kommunenummer: string; kommunenavn: string }; geometry: { type: string; coordinates: number[][][] | number[][][][] } }) => {
        areas[f.properties.kommunenummer] = featureAreaKm2(f.geometry);
        return { kommunenummer: f.properties.kommunenummer, kommunenavn: f.properties.kommunenavn };
      });
      kommuneAreasRef.current = areas;
      setGeoData(geo);
      setVerneData(verne);
      const kommuneCount = Object.keys(verne).filter((k) => (verne[k]?.total ?? 0) > 0).length;
      setLoadedCount(kommuneCount);
      setCounting(true);
      setLoading(false);
      setTimeout(() => setCounting(false), 800);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const getPct = useCallback((nr: string) => {
    const total = verneRef.current[nr]?.total ?? 0;
    const area = kommuneAreasRef.current[nr] ?? 0;
    return area > 0 ? (total / area) * 100 : 0;
  }, []);

  const highlightKommune = useCallback((kommunenummer: string) => {
    if (selectedKommuneRef.current && selectedKommuneRef.current !== kommunenummer) {
      const prev = layerRefs.current.get(selectedKommuneRef.current);
      if (prev) {
        const p = getPct(selectedKommuneRef.current);
        prev.setStyle({ weight: 0.5, color: "white", fillColor: vernePctColor(p), fillOpacity: p > 0 ? 0.9 : 0.3 });
      }
    }
    const layer = layerRefs.current.get(kommunenummer);
    if (layer) {
      layer.setStyle({ weight: 2.5, color: "#24374c", fillOpacity: 1 });
      layer.bringToFront();
    }
    selectedKommuneRef.current = kommunenummer;
  }, []);

  const clearSelection = useCallback(() => {
    if (selectedKommuneRef.current) {
      const layer = layerRefs.current.get(selectedKommuneRef.current);
      if (layer) {
        const p = getPct(selectedKommuneRef.current);
        layer.setStyle({ weight: 0.5, color: "white", fillColor: vernePctColor(p), fillOpacity: p > 0 ? 0.9 : 0.3 });
      }
      selectedKommuneRef.current = null;
    }
    setSelected(null);
    setQuery("");
  }, []);


  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return; }
    setLoadingSuggestions(true);

    const fylkeMatches: Suggestion[] = FYLKER
      .filter((f) => f.fylkesnavn.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 3)
      .map((f) => ({ type: "fylke", fylkesnavn: f.fylkesnavn, lat: f.lat, lon: f.lon, zoom: f.zoom }));

    const kommuneMatches: Suggestion[] = geoFeaturesRef.current
      .filter((f) => f.kommunenavn.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 5)
      .map((f) => ({ type: "kommune", kommunenummer: f.kommunenummer, kommunenavn: f.kommunenavn }));

    let adresseMatches: Suggestion[] = [];
    try {
      const signal = searchAbort.renew();
      const res = await fetch(`https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(q)}&treffPerSide=2&utkoordsys=4326`, { signal });
      const data = await res.json();
      adresseMatches = (data.adresser ?? []).map((a: IncomeAddress) => ({ type: "adresse" as const, addr: a }));
    } catch { /* ignore — aborted or network error */ }

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

  const handleSelect = (s: Suggestion) => {
    setShowDropdown(false);
    setSuggestions([]);
    if (s.type === "fylke") {
      setQuery(s.fylkesnavn);
      setFlyTarget({ lat: s.lat, lon: s.lon, zoom: s.zoom });
      return;
    }
    if (s.type === "kommune") {
      setQuery(s.kommunenavn);
      highlightKommune(s.kommunenummer);
      setSelected({ kommunenummer: s.kommunenummer, kommunenavn: s.kommunenavn, vern: verneRef.current[s.kommunenummer] ?? null, totalAreaKm2: kommuneAreasRef.current[s.kommunenummer] ?? 0, fylke: getFylke(s.kommunenummer), coords: { lat: 0, lon: 0 } });
      const layer = layerRefs.current.get(s.kommunenummer) as L.Polygon | undefined;
      const center = layer?.getBounds().getCenter();
      if (center) setFlyTarget({ lat: center.lat, lon: center.lng });
    } else {
      const addr = s.addr;
      setQuery(addr.kommunenavn);
      highlightKommune(addr.kommunenummer);
      setSelected({ kommunenummer: addr.kommunenummer, kommunenavn: addr.kommunenavn, vern: verneRef.current[addr.kommunenummer] ?? null, totalAreaKm2: kommuneAreasRef.current[addr.kommunenummer] ?? 0, fylke: getFylke(addr.kommunenummer), coords: addr.representasjonspunkt });
      setFlyTarget(addr.representasjonspunkt);
    }
  };

  const geoStyle = (feature?: Feature) => {
    const nr = feature?.properties?.kommunenummer;
    const p = nr ? getPct(nr) : 0;
    return {
      fillColor: vernePctColor(p),
      weight: 0.5,
      color: "white",
      fillOpacity: p > 0 ? 0.9 : 0.3,
    };
  };

  const onEachFeature = (feature: Feature, layer: Layer) => {
    const nr = feature.properties?.kommunenummer;
    const navn = feature.properties?.kommunenavn ?? "";
    if (nr) layerRefs.current.set(nr, layer as L.Path);

    layer.on({
      mouseover(e) {
        const l = e.target as L.Path;
        if (nr !== selectedKommuneRef.current) {
          l.setStyle({ weight: 1.5, color: "#24374c", fillOpacity: 1 });
          l.bringToFront();
        }
      },
      mouseout(e) {
        const l = e.target as L.Path;
        if (nr !== selectedKommuneRef.current) {
          const p = getPct(nr);
          l.setStyle({ weight: 0.5, color: "white", fillColor: vernePctColor(p), fillOpacity: p > 0 ? 0.9 : 0.3 });
        }
      },
      click() {
        highlightKommune(nr);
        setSelected({
          kommunenummer: nr,
          kommunenavn: navn,
          vern: verneRef.current[nr] ?? null,
          totalAreaKm2: kommuneAreasRef.current[nr] ?? 0,
          fylke: getFylke(nr),
          coords: { lat: 0, lon: 0 },
        });
        selectedKommuneRef.current = nr;
      },
    });
  };

  return (
    <div className="flex flex-col" style={{ height: "calc(100svh - 57px)" }}>
      {/* Search bar */}
      <div className="relative z-[1000] px-4 py-4 md:px-8 shrink-0 bg-background border-b">
        <div className="max-w-xl mx-auto relative flex items-center gap-2">
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
              placeholder="Søk etter en kommune eller adresse..."
              className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground text-[16px] sm:text-sm"
            />
            {query && (
              <button onClick={clearSelection} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {showDropdown && suggestions.length > 0 && (
            <ul className="absolute top-full mt-1 left-0 right-0 bg-background rounded-xl shadow-xl border overflow-hidden z-10">
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
                    ) : s.type === "adresse" ? (
                      <div>
                        <p className="font-medium">{s.addr.adressetekst}</p>
                        <p className="text-xs text-muted-foreground">{s.addr.poststed}, {s.addr.kommunenavn}</p>
                      </div>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
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
                <p className="text-sm text-muted-foreground">Henter verneområdedata...</p>
              )}
            </div>
          </div>
        )}
        {error && <MapError message="Kunne ikke laste data." onRetry={loadData} />}

        {!loading && !error && geoData && (
          <MapContainer center={[65, 14]} zoom={5} style={{ height: "100%", width: "100%" }}>
            {showBase && (
              <TileLayer
                url="https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png"
                attribution='&copy; <a href="https://www.kartverket.no/">Kartverket</a>'
              />
            )}
            {flyTarget && <FlyTo lat={flyTarget.lat} lon={flyTarget.lon} zoom={flyTarget.zoom} />}
            <GeoJSON
              key={Object.keys(verneData).length}
              data={geoData}
              style={geoStyle}
              onEachFeature={onEachFeature}
            />
          </MapContainer>
        )}

        {/* Legend + base layer toggle */}
        <div className="absolute top-3 right-3 z-[999] flex flex-col gap-2 items-end">
          <div className="bg-card/90 rounded-xl border px-3 py-2 shadow text-xs">
            <p className="font-semibold text-muted-foreground mb-1.5">Andel vernet (%)</p>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-24 rounded-full" style={{ background: "linear-gradient(to right, #ef4444, #facc15, #16a34a)" }} />
            </div>
            <div className="flex justify-between mt-0.5 text-muted-foreground/70">
              <span>0%</span>
              <span>60%+</span>
            </div>
          </div>
          <button
            onClick={() => setShowBase((b) => !b)}
            className={`flex items-center gap-1.5 rounded-lg border bg-card shadow-md px-3 py-1.5 text-xs font-semibold transition-colors ${showBase ? "text-white" : "text-muted-foreground hover:bg-muted"}`}
            style={showBase ? { background: "var(--kv-blue)" } : {}}
          >
            <MapIcon className="h-3.5 w-3.5" />
            Bakgrunnskart
          </button>
        </div>

        {/* Compact info card */}
        {selected && !showInfoSheet && (() => {
          const vernTotal = selected.vern?.total ?? 0;
          const pct = selected.totalAreaKm2 > 0 ? (vernTotal / selected.totalAreaKm2) * 100 : 0;
          const label = vernLabel(pct);
          return (
            <div
              className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-96 z-[999] bg-card rounded-2xl shadow-xl px-4 py-4"
              style={{ border: "1.5px solid var(--border)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-base leading-snug">{selected.kommunenavn}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{selected.fylke ?? ""}</p>
                </div>
                <button
                  onClick={clearSelection}
                  className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Lukk"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {vernTotal > 0 ? (
                <div className="mt-3">
                  <p className="text-2xl font-extrabold tabular-nums" style={{ color: label.color }}>
                    {pct.toFixed(1).replace(".", ",")}%
                  </p>
                  <p className="text-xs text-muted-foreground">{label.text}</p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Ingen registrerte verneområder</p>
              )}

              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setShowInfoSheet(true)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border bg-muted/50 hover:bg-muted transition-colors"
                >
                  <ChevronUp className="h-3.5 w-3.5" /> Vis mer
                </button>
              </div>
            </div>
          );
        })()}

        {/* Info detail sheet */}
        <Sheet open={showInfoSheet && !!selected} onOpenChange={(open) => { setShowInfoSheet(open); if (!open && !selected) clearSelection(); }}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[85svh] overflow-y-auto">
            {selected && (() => {
              const vernTotal = selected.vern?.total ?? 0;
              const pct = selected.totalAreaKm2 > 0 ? (vernTotal / selected.totalAreaKm2) * 100 : 0;
              const label = vernLabel(pct);
              const stats = computeVerneStats(verneData, kommuneAreasRef.current, selected.kommunenummer);
              const aboveNational = pct >= stats.nationalPct;

              return (
                <div className="mx-auto w-full max-w-md px-4 pb-6">
                  <SheetHeader>
                    <SheetTitle className="text-left sr-only">{selected.kommunenavn}</SheetTitle>
                  </SheetHeader>

                  {/* Layer 1 — Identity */}
                  <p className="font-bold text-lg leading-snug">{selected.kommunenavn}</p>
                  <p className="text-sm text-muted-foreground">{selected.fylke ?? ""}</p>

                  {/* Layer 2 — Key metric: percentage + context */}
                  {vernTotal > 0 ? (
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-extrabold tabular-nums" style={{ color: label.color }}>
                          {pct.toFixed(1).replace(".", ",")}%
                        </p>
                        <p className="text-sm text-muted-foreground">av kommunen er vernet</p>
                      </div>
                      <p className="text-xs mt-1" style={{ color: label.color }}>{label.text}</p>

                      {/* National comparison */}
                      <div className="mt-4 flex items-center gap-3">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden relative">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(pct, 100)}%`, background: label.color }}
                          />
                          {/* National average marker */}
                          <div
                            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3.5 rounded-full bg-foreground/50"
                            style={{ left: `${Math.min(stats.nationalPct, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-muted-foreground">0%</span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <span className="inline-block w-2 h-0.5 rounded-full bg-foreground/50" />
                          Snitt {stats.nationalPct.toFixed(1).replace(".", ",")}%
                        </span>
                      </div>

                      {/* Comparison badge */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span
                          className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-lg"
                          style={{
                            background: aboveNational ? "#dcfce7" : "#fef2f2",
                            color: aboveNational ? "#16a34a" : "#ef4444",
                          }}
                        >
                          {aboveNational ? "↑" : "↓"} {Math.abs(pct - stats.nationalPct).toFixed(1).replace(".", ",")} prosentpoeng {aboveNational ? "over" : "under"} landsgjennomsnittet
                        </span>
                      </div>

                      {/* Rankings */}
                      <div className="mt-4 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Nasjonalt</span>
                          <span className="font-medium tabular-nums">#{stats.rank} av {stats.total}</span>
                        </div>
                        {selected.fylke && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{selected.fylke}</span>
                            <span className="font-medium tabular-nums">#{stats.fylkeRank} av {stats.fylkeTotal}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm text-muted-foreground">Ingen registrerte verneområder i denne kommunen.</p>
                    </div>
                  )}

                  {/* Layer 3 — Category breakdown */}
                  {vernTotal > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Fordeling</p>
                      <div className="flex flex-col gap-2">
                        {(["np", "nr", "lv", "nm"] as const).map((key) => {
                          const val = selected.vern![key];
                          if (!val) return null;
                          const catPct = selected.totalAreaKm2 > 0 ? (val / selected.totalAreaKm2) * 100 : 0;
                          return (
                            <div key={key}>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">{VERNE_LABELS[key]}</span>
                                <span className="font-medium tabular-nums">{fmt(val)}</span>
                              </div>
                              <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${Math.min(catPct * 2, 100)}%`, background: label.color, opacity: 0.6 }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground mt-3">
                        Totalt areal: {selected.totalAreaKm2.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0")} km²,
                        herav {vernTotal.toFixed(2).replace(".", ",")} km² vernet
                      </p>
                    </div>
                  )}

                  {/* Layer 4 — Source */}
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-muted-foreground text-center">
                      Kilde: <a href="https://www.ssb.no/natur-og-miljo/areal/statistikk/arealbruk-og-arealressurser" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">SSB tabell 08936</a>
                    </p>
                    <DataDisclaimer />
                  </div>
                </div>
              );
            })()}
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
              <h2 className="font-bold text-base">Om verneområdekartet</h2>
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
                Kartet viser <span className="font-medium text-foreground">vernet areal per kommune</span> i Norge, målt i km². Jo mørkere grønn farge, desto mer vernet areal har kommunen.
              </p>
              <p>
                Dataene er hentet fra <span className="font-medium text-foreground">SSB tabell 08936</span> og inkluderer fire vernekategorier:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li><span className="font-medium text-foreground">Nasjonalpark</span> — store naturområder med lite inngrep</li>
                <li><span className="font-medium text-foreground">Naturreservat</span> — strengt vernet for å bevare naturtyper, arter eller geologiske forekomster</li>
                <li><span className="font-medium text-foreground">Landskapsvernområde</span> — vern av natur- eller kulturlandskap</li>
                <li><span className="font-medium text-foreground">Andre vernekategorier</span> — biotopvern, naturminner m.m.</li>
              </ul>
              <p>
                <span className="font-medium text-foreground">Rangering</span> viser kommunens plassering blant alle kommuner med vernet areal. Prosentavviket sammenlignes med medianverdien.
              </p>
              <a
                href="https://www.ssb.no/statbank/table/08936/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mt-1"
              >
                <ExternalLink className="h-3 w-3" />
                Åpne SSB tabell 08936
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
