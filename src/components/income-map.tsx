"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MapContainer, GeoJSON, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoJsonObject, Feature } from "geojson";
import type { Layer } from "leaflet";
import { Loader2, X, Info, LocateFixed, Map as MapIcon, ChevronUp, Navigation, ExternalLink, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMapSearch, MapSearchBar } from "@/components/map-search";
import { FlyTo, DataDisclaimer, MapError, AnimatedCount, interpolateColor } from "@/lib/map-utils";
import { FYLKER } from "@/lib/fylker";

import type { Suggestion } from "@/lib/map-utils";

interface SelectedKommune {
  kommunenummer: string;
  kommunenavn: string;
  income: number | null;
  address?: string;
  coords: { lat: number; lon: number };
}



function incomeColor(income: number | undefined, min: number, max: number): string {
  if (income == null || income === 0) return "var(--kv-muted-fill)";
  if (max === min) return "var(--kv-positive)";
  const t = Math.max(0, Math.min(1, (income - min) / (max - min)));
  return interpolateColor(t);
}

function formatKr(value: number): string {
  return new Intl.NumberFormat("no-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(value);
}

function computeStats(incomeData: Record<string, number>, kommunenummer: string) {
  const entries = Object.entries(incomeData).filter(([, v]) => v > 0);
  const sorted = [...entries].sort(([, a], [, b]) => b - a);
  const rank = sorted.findIndex(([k]) => k === kommunenummer) + 1;
  const total = sorted.length;
  const medianIncome = sorted[Math.floor(total / 2)]?.[1] ?? 0;
  const income = incomeData[kommunenummer] ?? 0;
  const vsMedian = medianIncome > 0 ? ((income - medianIncome) / medianIncome) * 100 : 0;
  return { rank, total, medianIncome, vsMedian };
}

function getFylke(kommunenummer: string): string | null {
  const prefix = kommunenummer.slice(0, 2);
  return FYLKER.find((f) => f.fylkesnummer === prefix)?.fylkesnavn ?? null;
}

export function IncomeMap() {
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const [incomeData, setIncomeData] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [counting, setCounting] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [error, setError] = useState(false);

  const [selected, setSelected] = useState<SelectedKommune | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lon: number; zoom?: number } | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showBase, setShowBase] = useState(false);
  const [showInfoSheet, setShowInfoSheet] = useState(false);

  // Comparison
  const [compareMode, setCompareMode] = useState(false);
  const [compareQuery, setCompareQuery] = useState("");
  const [compareHighlight, setCompareHighlight] = useState(-1);
  const [compareTarget, setCompareTarget] = useState<SelectedKommune | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  // Refs for GeoJSON click handlers (closures capture stale state otherwise)
  const compareModeRef = useRef(false);
  const selectedRef = useRef<SelectedKommune | null>(null);
  compareModeRef.current = compareMode;
  selectedRef.current = selected;

  const incomeRef = useRef<Record<string, number>>({});
  const geoFeaturesRef = useRef<Array<{ kommunenummer: string; kommunenavn: string }>>([]);
  const layerRefs = useRef<Map<string, L.Path>>(new Map());
  const selectedKommuneRef = useRef<string | null>(null);
  const setQueryRef = useRef<(q: string) => void>(() => {});

  const loadData = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const [geo, income] = await Promise.all([
        fetch("/api/kommuner").then((r) => r.json()),
        fetch("/api/income").then((r) => r.json()),
      ]);
      incomeRef.current = income;
      geoFeaturesRef.current = (geo.features ?? []).map((f: { properties: { kommunenummer: string; kommunenavn: string } }) => ({
        kommunenummer: f.properties.kommunenummer,
        kommunenavn: f.properties.kommunenavn,
      }));
      setGeoData(geo);
      setIncomeData(income);
      const kommuneCount = Object.keys(income).filter((k) => income[k] > 0).length;
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

  const values = Object.values(incomeData).filter((v) => v > 0);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;

  const highlightKommune = useCallback((kommunenummer: string) => {
    if (selectedKommuneRef.current && selectedKommuneRef.current !== kommunenummer) {
      const prev = layerRefs.current.get(selectedKommuneRef.current);
      if (prev) {
        const income = incomeRef.current[selectedKommuneRef.current];
        prev.setStyle({
          weight: 0.5,
          color: "white",
          fillOpacity: income ? 0.85 : 0.3,
        });
      }
    }
    const layer = layerRefs.current.get(kommunenummer);
    if (layer) {
      layer.setStyle({ weight: 2.5, color: "#24374c", fillOpacity: 1 });
      layer.bringToFront();
    }
    selectedKommuneRef.current = kommunenummer;
  }, []);

  const compareResults = useMemo(() => {
    if (!compareMode || compareQuery.length < 1) return [];
    const q = compareQuery.toLowerCase();
    return geoFeaturesRef.current
      .filter((f) => f.kommunenavn.toLowerCase().includes(q) && f.kommunenummer !== selected?.kommunenummer && incomeRef.current[f.kommunenummer] > 0)
      .slice(0, 6);
  }, [compareMode, compareQuery, selected?.kommunenummer]);

  const clearSelection = useCallback(() => {
    if (selectedKommuneRef.current) {
      const layer = layerRefs.current.get(selectedKommuneRef.current);
      if (layer) {
        const income = incomeRef.current[selectedKommuneRef.current];
        layer.setStyle({ weight: 0.5, color: "white", fillOpacity: income ? 0.85 : 0.3 });
      }
      selectedKommuneRef.current = null;
    }
    setSelected(null);
    setCompareMode(false);
    setCompareQuery("");
    setCompareTarget(null);
    setShowCompare(false);
    setQueryRef.current("");
  }, []);


  const handleSearchSelect = useCallback((s: Suggestion) => {
    if (s.type === "fylke") {
      setQueryRef.current(s.fylkesnavn);
      setFlyTarget({ lat: s.lat, lon: s.lon, zoom: s.zoom });
      return;
    }
    if (s.type === "kommune") {
      setQueryRef.current(s.kommunenavn);
      highlightKommune(s.kommunenummer);
      setSelected({ kommunenummer: s.kommunenummer, kommunenavn: s.kommunenavn, income: incomeRef.current[s.kommunenummer] ?? null, coords: { lat: 0, lon: 0 } });
      const layer = layerRefs.current.get(s.kommunenummer) as L.Polygon | undefined;
      const center = layer?.getBounds().getCenter();
      if (center) setFlyTarget({ lat: center.lat, lon: center.lng });
    } else if (s.type === "adresse") {
      const addr = s.addr;
      const nr = addr.kommunenummer ?? "";
      setQueryRef.current(addr.kommunenavn);
      if (nr) highlightKommune(nr);
      setSelected({ kommunenummer: nr, kommunenavn: addr.kommunenavn, income: incomeRef.current[nr] ?? null, coords: addr.representasjonspunkt });
      setFlyTarget(addr.representasjonspunkt);
    }
  }, [highlightKommune]);

  const searchProps = useMapSearch({
    kommuneList: geoFeaturesRef.current,
    onSelect: handleSearchSelect,
  });
  setQueryRef.current = searchProps.setQuery;

  const geoStyle = (feature?: Feature) => {
    const nr = feature?.properties?.kommunenummer;
    return {
      fillColor: incomeColor(incomeRef.current[nr], min, max),
      weight: 0.5,
      color: "white",
      fillOpacity: incomeRef.current[nr] ? 0.85 : 0.3,
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
          l.setStyle({ weight: 0.5, color: "white", fillOpacity: incomeRef.current[nr] ? 0.85 : 0.3 });
        }
      },
      click() {
        if (compareModeRef.current && selectedRef.current && selectedRef.current.kommunenummer !== nr && incomeRef.current[nr] > 0) {
          setCompareTarget({ kommunenummer: nr, kommunenavn: navn, income: incomeRef.current[nr] ?? null, coords: { lat: 0, lon: 0 } });
          setShowCompare(true);
          setCompareMode(false);
          setCompareQuery("");
          return;
        }
        highlightKommune(nr);
        setSelected({
          kommunenummer: nr,
          kommunenavn: navn,
          income: incomeRef.current[nr] ?? null,
          coords: { lat: 0, lon: 0 },
        });
        selectedKommuneRef.current = nr;
      },
    });
  };

  return (
    <div className="flex flex-col" style={{ height: "calc(100svh - 57px - 56px)" }}>
      {/* Search bar */}
      <div className="relative z-[1000] px-4 py-4 md:px-8 shrink-0 bg-background border-b">
        <div className="max-w-xl mx-auto relative">
          <MapSearchBar search={searchProps} placeholder="Søk etter en adresse for å finne kommunen..." />
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
                <p className="text-sm text-muted-foreground">Henter inntektsdata...</p>
              )}
            </div>
          </div>
        )}
        {error && <MapError message="Kunne ikke laste data." onRetry={loadData} />}

        {!loading && !error && geoData && (
          <MapContainer
            center={[65, 14]}
            zoom={5}
            style={{ height: "100%", width: "100%" }}
            zoomControl={true}
          >
            {showBase && (
              <TileLayer
                url="https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png"
                attribution='&copy; <a href="https://www.kartverket.no/">Kartverket</a>'
              />
            )}
            {flyTarget && <FlyTo lat={flyTarget.lat} lon={flyTarget.lon} zoom={flyTarget.zoom} />}
            <GeoJSON
              key={Object.keys(incomeData).length}
              data={geoData}
              style={geoStyle}
              onEachFeature={onEachFeature}
            />
          </MapContainer>
        )}

        {/* Compact info card */}
        {selected && !showInfoSheet && !showCompare && (
          <div
            className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-96 z-[999] bg-card rounded-2xl shadow-xl px-4 py-4"
            style={{ border: "1.5px solid var(--border)" }}
          >
            <div className="relative">
              <button
                onClick={clearSelection}
                className="absolute -top-1 -right-1 shrink-0 p-2.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Lukk"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="flex items-baseline justify-between gap-2 pr-7">
                <p className="text-xl font-extrabold leading-snug truncate min-w-0" style={{ color: "var(--kv-blue)" }}>{selected.kommunenavn}</p>
                {selected.income != null && (
                  <div className="flex items-baseline gap-1 shrink-0">
                    <span className="text-xl font-extrabold" style={{ color: "var(--kv-blue)" }}>{formatKr(selected.income)}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 mt-1 pr-7">
                <p className="text-xs text-foreground/70">{getFylke(selected.kommunenummer)}</p>
                {selected.income != null && (() => {
                  const { vsMedian } = computeStats(incomeData, selected.kommunenummer);
                  return (
                    <span className={`text-xs font-semibold shrink-0 ${vsMedian >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {vsMedian >= 0 ? "+" : ""}{vsMedian.toFixed(1)}% vs medianen
                    </span>
                  );
                })()}
              </div>
            </div>

            {compareMode ? (
              <div className="mt-3">
                <p className="text-[10px] text-foreground/70 mb-1.5">Velg en kommune å sammenligne med, eller klikk på kartet.</p>
                <div className="relative">
                  <input
                    autoFocus
                    value={compareQuery}
                    onChange={(e) => { setCompareQuery(e.target.value); setCompareHighlight(-1); }}
                    onKeyDown={(e) => {
                      if (compareResults.length === 0) return;
                      if (e.key === "ArrowDown") { e.preventDefault(); setCompareHighlight((i) => Math.min(i + 1, compareResults.length - 1)); }
                      else if (e.key === "ArrowUp") { e.preventDefault(); setCompareHighlight((i) => Math.max(i - 1, 0)); }
                      else if (e.key === "Enter" && compareHighlight >= 0) {
                        e.preventDefault();
                        const k = compareResults[compareHighlight];
                        setCompareTarget({ kommunenummer: k.kommunenummer, kommunenavn: k.kommunenavn, income: incomeRef.current[k.kommunenummer] ?? null, coords: { lat: 0, lon: 0 } });
                        setShowCompare(true);
                        setCompareMode(false);
                        setCompareQuery("");
                        setCompareHighlight(-1);
                      }
                      else if (e.key === "Escape") { setCompareMode(false); setCompareQuery(""); setCompareHighlight(-1); }
                    }}
                    placeholder="Sammenlign med..."
                    className="w-full bg-muted border rounded-xl px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground text-[16px] sm:text-sm"
                  />
                  {compareResults.length > 0 && (
                    <ul className="absolute top-full mt-1 left-0 right-0 bg-background rounded-xl shadow-xl border overflow-hidden z-50">
                      {compareResults.map((k, i) => (
                        <li key={k.kommunenummer}>
                          <button
                            onMouseDown={() => {
                              setCompareTarget({ kommunenummer: k.kommunenummer, kommunenavn: k.kommunenavn, income: incomeRef.current[k.kommunenummer] ?? null, coords: { lat: 0, lon: 0 } });
                              setShowCompare(true);
                              setCompareMode(false);
                              setCompareQuery("");
                              setCompareHighlight(-1);
                            }}
                            className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-b last:border-0 ${compareHighlight === i ? "bg-muted" : "hover:bg-muted"}`}
                          >
                            <p className="font-medium">{k.kommunenavn}</p>
                            <p className="text-[10px] text-foreground/70">{getFylke(k.kommunenummer)}</p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <button
                  onClick={() => { setCompareMode(false); setCompareQuery(""); }}
                  className="mt-2 text-xs text-foreground/70 hover:text-foreground transition-colors"
                >
                  Avbryt
                </button>
              </div>
            ) : (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setShowInfoSheet(true)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl text-white transition-colors hover:opacity-90"
                  style={{ background: "var(--kv-blue)" }}
                >
                  <ChevronUp className="h-3.5 w-3.5" /> Vis mer
                </button>
                {selected.income != null && (
                  <button
                    onClick={() => setCompareMode(true)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" /> Sammenlign
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Info detail sheet */}
        <Sheet open={showInfoSheet && !!selected} onOpenChange={(open) => { setShowInfoSheet(open); if (!open && !selected) clearSelection(); }}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[85svh] overflow-y-auto">
            {selected && (
              <div className="mx-auto w-full max-w-md px-4 pb-6">
                <SheetHeader>
                  <SheetTitle className="text-left sr-only">{selected.kommunenavn}</SheetTitle>
                </SheetHeader>

                {/* Layer 1 — Identity */}
                <p className="font-bold text-lg leading-snug">{selected.kommunenavn}</p>
                {selected.address && (
                  <p className="text-sm text-muted-foreground">{selected.address}</p>
                )}

                {/* Layer 2 — Key metric */}
                <div className="mt-4 pt-4 border-t">
                  {selected.income != null ? (
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold" style={{ color: "var(--kv-blue)" }}>{formatKr(selected.income)}</span>
                      <span className="text-sm font-medium text-muted-foreground">median inntekt</span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Ingen inntektsdata</p>
                  )}
                  <p className="text-xs text-foreground/70 mt-1">median inntekt etter skatt per husholdning (2024)</p>
                </div>

                {/* Layer 3 — Progress + rank */}
                {selected.income != null && (() => {
                  const { rank, total, vsMedian } = computeStats(incomeData, selected.kommunenummer);
                  const values = Object.values(incomeData).filter((v) => v > 0);
                  const min = values.length ? Math.min(...values) : 0;
                  const max = values.length ? Math.max(...values) : 1;
                  const pct = Math.max(0, Math.min(100, ((selected.income - min) / (max - min)) * 100));
                  const above = vsMedian >= 0;
                  return (
                    <div className="mt-4 pt-4 border-t">
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: interpolateColor(pct / 100) }}
                        />
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-[10px] text-foreground/70">{formatKr(min)}</span>
                        <span className="text-[10px] text-foreground/70">{formatKr(max)}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-xs text-foreground/70">#{rank} av {total} kommuner</span>
                        <span className="text-xs font-semibold" style={{ color: above ? "var(--kv-positive)" : "var(--kv-negative)" }}>
                          {above ? "+" : ""}{vsMedian.toFixed(1)}% vs. medianen
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Layer 4 — Source */}
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-foreground/70 text-center">
                    Kilde: <a href="https://www.ssb.no/inntekt-og-forbruk/inntekt-og-formue/statistikk/inntekts-og-formuesstatistikk-for-husholdninger" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">SSB InntektStruk13</a>, 2024
                  </p>
                  <DataDisclaimer />
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Comparison sheet */}
        <Sheet open={showCompare && !!selected && !!compareTarget} onOpenChange={(open) => { if (!open) { setShowCompare(false); setCompareTarget(null); } }}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[85svh] overflow-y-auto">
            {selected && compareTarget && (() => {
              const a = selected;
              const b = compareTarget;
              const statsA = computeStats(incomeData, a.kommunenummer);
              const statsB = computeStats(incomeData, b.kommunenummer);
              const incomeA = incomeData[a.kommunenummer];
              const incomeB = incomeData[b.kommunenummer];
              const diff = incomeA && incomeB ? incomeA - incomeB : null;
              const allValues = Object.values(incomeData).filter((v) => v > 0);
              const minVal = allValues.length ? Math.min(...allValues) : 0;
              const maxVal = allValues.length ? Math.max(...allValues) : 1;
              const pctA = incomeA ? Math.max(0, Math.min(100, ((incomeA - minVal) / (maxVal - minVal)) * 100)) : 0;
              const pctB = incomeB ? Math.max(0, Math.min(100, ((incomeB - minVal) / (maxVal - minVal)) * 100)) : 0;

              return (
                <div className="mx-auto w-full max-w-lg px-4 pb-6">
                  <SheetHeader>
                    <SheetTitle className="text-left sr-only">Sammenligning</SheetTitle>
                  </SheetHeader>

                  <div className="flex items-center gap-1.5 mb-3">
                    <ArrowLeftRight className="h-4 w-4" style={{ color: "var(--kv-blue)" }} />
                    <p className="text-xs font-semibold text-foreground/70">Sammenligning · Median inntekt 2024</p>
                  </div>

                  {/* Header: two kommune names */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="font-bold text-base leading-snug">{a.kommunenavn}</p>
                      <p className="text-xs text-foreground/70">{getFylke(a.kommunenummer)}</p>
                    </div>
                    <div>
                      <p className="font-bold text-base leading-snug">{b.kommunenavn}</p>
                      <p className="text-xs text-foreground/70">{getFylke(b.kommunenummer)}</p>
                    </div>
                  </div>

                  {/* Hero: income side by side */}
                  <div className="mt-4 pt-4 border-t">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-2xl font-extrabold" style={{ color: "var(--kv-blue)" }}>
                          {incomeA ? formatKr(incomeA) : "–"}
                        </span>
                        <p className="text-[10px] text-foreground/70">median inntekt</p>
                      </div>
                      <div>
                        <span className="text-2xl font-extrabold" style={{ color: "var(--kv-blue)" }}>
                          {incomeB ? formatKr(incomeB) : "–"}
                        </span>
                        <p className="text-[10px] text-foreground/70">median inntekt</p>
                      </div>
                    </div>
                    {diff != null && (
                      <div className="mt-2">
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${diff > 0 ? "bg-green-50 text-green-700" : diff < 0 ? "bg-orange-50 text-orange-700" : "bg-muted text-muted-foreground"}`}>
                          {a.kommunenavn} tjener {diff > 0 ? `${formatKr(diff)} mer` : diff < 0 ? `${formatKr(Math.abs(diff))} mindre` : "likt"}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Percentile bars */}
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs font-semibold text-foreground/70 mb-3">Plassering blant alle kommuner</p>
                    <div className="space-y-3">
                      {[
                        { name: a.kommunenavn, stats: statsA, pct: pctA, income: incomeA },
                        { name: b.kommunenavn, stats: statsB, pct: pctB, income: incomeB },
                      ].map((item) => (
                        <div key={item.name}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">{item.name}</span>
                            <span className="text-xs text-foreground/70">#{item.stats.rank} av {item.stats.total}</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${item.pct}%`, background: interpolateColor(item.pct / 100) }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* vs median comparison */}
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs font-semibold text-foreground/70 mb-2">Sammenlignet med mediankommunen</p>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { name: a.kommunenavn, stats: statsA },
                        { name: b.kommunenavn, stats: statsB },
                      ].map((item) => (
                        <div key={item.name}>
                          <p className="text-xs font-medium mb-0.5">{item.name}</p>
                          <span className="text-sm font-bold" style={{ color: item.stats.vsMedian >= 0 ? "var(--kv-positive)" : "var(--kv-negative)" }}>
                            {item.stats.vsMedian >= 0 ? "+" : ""}{item.stats.vsMedian.toFixed(1)}%
                          </span>
                          <p className="text-[10px] text-foreground/70">vs. medianen ({formatKr(item.stats.medianIncome)})</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Source */}
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-foreground/70 text-center">
                      Kilde: <a href="https://www.ssb.no/inntekt-og-forbruk/inntekt-og-formue/statistikk/inntekts-og-formuesstatistikk-for-husholdninger" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">SSB InntektStruk13</a>, 2024
                    </p>
                    <DataDisclaimer />
                  </div>
                </div>
              );
            })()}
          </SheetContent>
        </Sheet>

        {/* Legend + base layer toggle */}
        {!loading && values.length > 0 && (
          <div className="absolute top-3 right-3 z-[999] flex flex-col gap-2 items-end">
            <div
              className="hidden sm:block bg-card rounded-xl shadow-md px-3 py-2.5"
              style={{ border: "1px solid var(--kv-muted-fill)" }}
            >
              <p className="text-xs font-semibold text-foreground/70 mb-1.5">Inntekt etter skatt</p>
              <div
                className="h-3 w-24 rounded-sm"
                style={{ background: "linear-gradient(to right, var(--kv-negative), #facc15, var(--kv-positive))" }}
              />
              <div className="flex justify-between mt-0.5">
                <span className="text-[10px] text-foreground/70">{formatKr(min)}</span>
                <span className="text-[10px] text-foreground/70">{formatKr(max)}</span>
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
              <h2 className="font-bold text-base">Om inntektskartet</h2>
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
                Kartet viser <span className="font-medium text-foreground">median inntekt etter skatt per husholdning</span> i hver kommune. Jo mørkere grønn farge, desto høyere inntekt.
              </p>
              <p>
                <span className="font-medium text-foreground">Medianinntekt</span> er den midterste verdien når alle husholdninger sorteres etter inntekt. Halvparten tjener mer, halvparten mindre. Dette gir et mer representativt bilde enn gjennomsnittet, som påvirkes av svært høye enkeltinntekter.
              </p>
              <p>
                <span className="font-medium text-foreground">Rangering</span> viser kommunens plassering blant alle kommuner med data. Prosentavviket sammenlignes med medianen av alle kommunemedianer.
              </p>
              <p>
                Tallene beregnes lokalt i nettleseren. Ikke alle kommuner har fullstendige data.
              </p>
              <a
                href="https://www.ssb.no/inntekt-og-forbruk/inntekt-og-formue/statistikk/inntekts-og-formuesstatistikk-for-husholdninger"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors mt-1"
              >
                <ExternalLink className="h-3 w-3" />
                Åpne SSB InntektStruk13
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
