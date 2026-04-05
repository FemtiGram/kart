"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, GeoJSON, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoJsonObject, Feature } from "geojson";
import type { Layer } from "leaflet";
import { Search, MapPin, Loader2, X, Info, LocateFixed, Map as MapIcon, ChevronDown, ChevronUp, ExternalLink, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FYLKER } from "@/lib/fylker";
import { FlyTo, interpolateColor, useDebounceRef, useSearchAbort } from "@/lib/map-utils";

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
  income: number | null;
  address?: string;
  coords: { lat: number; lon: number };
}


function incomeColor(income: number | undefined, min: number, max: number): string {
  if (income == null || income === 0) return "#e3ddd4";
  if (max === min) return "#16a34a";
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

export function IncomeMap() {
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const [incomeData, setIncomeData] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selected, setSelected] = useState<SelectedKommune | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lon: number; zoom?: number } | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showBase, setShowBase] = useState(false);
  const [cardExpanded, setCardExpanded] = useState(false);

  const incomeRef = useRef<Record<string, number>>({});
  const geoFeaturesRef = useRef<Array<{ kommunenummer: string; kommunenavn: string }>>([]);
  const layerRefs = useRef<Map<string, L.Path>>(new Map());
  const selectedKommuneRef = useRef<string | null>(null);
  const debounceRef = useDebounceRef();
  const searchAbort = useSearchAbort();
  const inputRef = useRef<HTMLInputElement>(null);

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
      setLoading(false);
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
      const res = await fetch(
        `https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(q)}&treffPerSide=2&utkoordsys=4326`,
        { signal }
      );
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
      setSelected({ kommunenummer: s.kommunenummer, kommunenavn: s.kommunenavn, income: incomeRef.current[s.kommunenummer] ?? null, coords: { lat: 0, lon: 0 } });
      const layer = layerRefs.current.get(s.kommunenummer) as L.Polygon | undefined;
      const center = layer?.getBounds().getCenter();
      if (center) setFlyTarget({ lat: center.lat, lon: center.lng });
    } else {
      const addr = s.addr;
      setQuery(addr.kommunenavn);
      highlightKommune(addr.kommunenummer);
      setSelected({ kommunenummer: addr.kommunenummer, kommunenavn: addr.kommunenavn, income: incomeRef.current[addr.kommunenummer] ?? null, coords: addr.representasjonspunkt });
      setFlyTarget(addr.representasjonspunkt);
    }
  };

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
              ref={inputRef}
              value={query}
              onChange={handleInput}
              autoFocus
              onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              onKeyDown={handleKeyDown}
              placeholder="Søk etter en adresse for å finne kommunen..."
              className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground text-[16px] sm:text-sm"
            />
          </div>

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
            <div className="flex gap-3 justify-center">
              <div className="h-6 w-20 rounded-md skeleton-shimmer" />
              <div className="h-6 w-28 rounded-md skeleton-shimmer" />
            </div>
          </div>
        )}
        {error && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] rounded-full px-4 py-2 shadow-lg" style={{ background: "#b91c1c" }}>
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-white">Kunne ikke laste data.</p>
              <button onClick={loadData} className="inline-flex items-center gap-1 text-sm font-semibold text-white/90 hover:text-white transition-colors">
                <RotateCw className="h-3.5 w-3.5" /> Prøv igjen
              </button>
            </div>
          </div>
        )}

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

        {/* Info card */}
        {selected && (
          <div
            className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-96 z-[999] bg-card rounded-2xl shadow-xl px-4 py-4"
            style={{ border: "1.5px solid var(--border)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-sm">{selected.kommunenavn}</p>
                {selected.address && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{selected.address}</p>
                )}
                {selected.income != null && (
                  <p className="text-sm mt-1">
                    <span className="font-semibold" style={{ color: "var(--kv-blue)" }}>{formatKr(selected.income)}</span>
                    <span className="text-muted-foreground text-xs ml-1">median inntekt</span>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setCardExpanded((e) => !e)}
                  className="sm:hidden p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label={cardExpanded ? "Skjul detaljer" : "Vis detaljer"}
                >
                  {cardExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </button>
                <button
                  onClick={clearSelection}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Lukk"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className={`${cardExpanded ? "block" : "hidden"} sm:block`}>
              {selected.income != null ? (() => {
                const { rank, total, vsMedian } = computeStats(incomeData, selected.kommunenummer);
                const pct = Math.max(0, Math.min(100, ((selected.income - min) / (max - min)) * 100));
                const above = vsMedian >= 0;
                return (
                  <>
                    <p className="text-xs text-muted-foreground mt-2">median inntekt etter skatt per husholdning (2024)</p>

                    {/* Progress bar */}
                    <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: "linear-gradient(to right, #ef4444, #facc15, #16a34a)",
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{formatKr(min)}</span>
                      <span className="text-[10px] text-muted-foreground">{formatKr(max)}</span>
                    </div>

                    {/* Rank + vs median */}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        #{rank} av {total} kommuner
                      </span>
                      <span
                        className="text-xs font-semibold"
                        style={{ color: above ? "#16a34a" : "#ef4444" }}
                      >
                        {above ? "+" : ""}{vsMedian.toFixed(1)}% vs. medianen
                      </span>
                    </div>
                  </>
                );
              })() : (
                <p className="text-sm text-muted-foreground mt-2">Ingen inntektsdata</p>
              )}

              <div className="flex items-center justify-between mt-3">
                <a
                  href="https://www.ssb.no/inntekt-og-forbruk/inntekt-og-formue/statistikk/inntekts-og-formuesstatistikk-for-husholdninger"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground/50 italic hover:text-muted-foreground transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Kilde: SSB InntektStruk13, 2024
                </a>
                <button
                  onClick={() => setShowInfo(true)}
                  className="p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Om dataene"
                >
                  <Info className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Legend + base layer toggle */}
        {!loading && values.length > 0 && (
          <div className="absolute top-3 right-3 z-[999] flex flex-col gap-2 items-end">
            <div
              className="bg-card rounded-xl shadow-md px-3 py-2.5"
              style={{ border: "1px solid #e3ddd4" }}
            >
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Inntekt etter skatt</p>
              <div
                className="h-3 w-24 rounded-sm"
                style={{ background: "linear-gradient(to right, #ef4444, #facc15, #16a34a)" }}
              />
              <div className="flex justify-between mt-0.5">
                <span className="text-[10px] text-muted-foreground">{formatKr(min)}</span>
                <span className="text-[10px] text-muted-foreground">{formatKr(max)}</span>
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
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mt-1"
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
