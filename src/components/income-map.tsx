"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoJsonObject, Feature } from "geojson";
import type { Layer } from "leaflet";
import { Search, MapPin, Loader2, X, Info } from "lucide-react";

interface IncomeAddress {
  adressetekst: string;
  poststed: string;
  kommunenavn: string;
  kommunenummer: string;
  representasjonspunkt: { lat: number; lon: number };
}

interface SelectedKommune {
  kommunenummer: string;
  kommunenavn: string;
  income: number | null;
  address?: string;
  coords: { lat: number; lon: number };
}

function interpolateColor(t: number): string {
  const r = Math.round(232 - t * 232);
  const g = Math.round(245 - t * (245 - 177));
  const b = Math.round(232 - t * (232 - 64));
  return `rgb(${r},${g},${b})`;
}

function incomeColor(income: number | undefined, min: number, max: number): string {
  if (income == null || income === 0) return "#e5e7eb";
  if (max === min) return "#00b140";
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

function FlyTo({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], 10, { duration: 1.0 });
  }, [lat, lon, map]);
  return null;
}

export function IncomeMap() {
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const [incomeData, setIncomeData] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<IncomeAddress[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState<SelectedKommune | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lon: number } | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const incomeRef = useRef<Record<string, number>>({});
  const layerRefs = useRef<Map<string, L.Path>>(new Map());
  const selectedKommuneRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/kommuner").then((r) => r.json()),
      fetch("/api/income").then((r) => r.json()),
    ])
      .then(([geo, income]) => {
        incomeRef.current = income;
        setGeoData(geo);
        setIncomeData(income);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

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
      layer.setStyle({ weight: 2.5, color: "#003da5", fillOpacity: 1 });
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

  const searchAddresses = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return; }
    setLoadingSuggestions(true);
    try {
      const res = await fetch(
        `https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(q)}&treffPerSide=6&utkoordsys=4326`
      );
      const data = await res.json();
      setSuggestions(data.adresser ?? []);
      setShowDropdown(true);
    } catch {
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchAddresses(val), 300);
  };

  const handleSelect = (addr: IncomeAddress) => {
    setShowDropdown(false);
    setQuery(`${addr.adressetekst}, ${addr.poststed}`);
    setSuggestions([]);
    highlightKommune(addr.kommunenummer);
    setSelected({
      kommunenummer: addr.kommunenummer,
      kommunenavn: addr.kommunenavn,
      income: incomeRef.current[addr.kommunenummer] ?? null,
      address: `${addr.adressetekst}, ${addr.poststed}`,
      coords: addr.representasjonspunkt,
    });
    setFlyTarget(addr.representasjonspunkt);
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
          l.setStyle({ weight: 1.5, color: "#003da5", fillOpacity: 1 });
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
              placeholder="Søk etter en adresse for å finne kommunen..."
              className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground text-[16px] sm:text-sm"
            />
          </div>
          <button
            onClick={() => setShowInfo((v) => !v)}
            className="shrink-0 p-2 rounded-xl border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Om dataene"
          >
            <Info className="h-4 w-4" />
          </button>

          {showDropdown && suggestions.length > 0 && (
            <ul className="absolute top-full mt-1 left-0 right-10 bg-background rounded-xl shadow-xl border overflow-hidden">
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
                        {addr.poststed}.{addr.kommunenavn}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>

      {/* Info modal */}
      {showInfo && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
          onClick={() => setShowInfo(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <h2 className="font-bold text-base">Om dataene</h2>
              <button
                onClick={() => setShowInfo(false)}
                className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Lukk"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Hva er medianinntekt?</strong> Medianinntekten er den midterste verdien når alle husholdninger i en kommune sorteres etter inntekt. Halvparten tjener mer, halvparten tjener mindre. Dette gir et mer representativt bilde enn gjennomsnittet, som lett påvirkes av svært høye enkeltinntekter.
              </p>
              <p>
                <strong className="text-foreground">Hvordan beregnes tallene?</strong> Rang og sammenligningen mot medianen beregnes lokalt i nettleseren basert på alle kommuner med tilgjengelige data. Nasjonal median er medianen av alle kommunemedianer, ikke et vektet snitt av alle husholdninger i Norge.
              </p>
              <p>
                <strong className="text-foreground">Datagrunnlag:</strong> Tall for 2024 fra SSB, tabell{" "}
                <a
                  href="https://www.ssb.no/statbank/table/InntektStruk13"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground transition-colors"
                >
                  InntektStruk13
                </a>
                . Ikke alle kommuner har fullstendige data. Feil og unøyaktigheter kan forekomme.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Map */}
      <div className="relative grow">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-[1000]">
            <p className="text-sm text-muted-foreground">Laster kartdata...</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-[1000]">
            <p className="text-sm text-destructive">Kunne ikke laste data. Prøv igjen senere.</p>
          </div>
        )}

        {!loading && !error && geoData && (
          <MapContainer
            center={[65, 14]}
            zoom={5}
            style={{ height: "100%", width: "100%" }}
            zoomControl={true}
          >
            {flyTarget && <FlyTo lat={flyTarget.lat} lon={flyTarget.lon} />}
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
            className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-96 z-[999] bg-white rounded-2xl shadow-xl px-4 py-4"
            style={{ border: "1.5px solid var(--kv-green-light, #b3e6c8)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-sm">{selected.kommunenavn}</p>
                {selected.address && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{selected.address}</p>
                )}
                <div className="mt-2">
                  {selected.income != null ? (() => {
                    const { rank, total, vsMedian } = computeStats(incomeData, selected.kommunenummer);
                    const pct = Math.max(0, Math.min(100, ((selected.income - min) / (max - min)) * 100));
                    const above = vsMedian >= 0;
                    return (
                      <>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl font-extrabold" style={{ color: "var(--kv-blue)" }}>
                            {formatKr(selected.income)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">median inntekt etter skatt per husholdning (2024)</p>

                        {/* Progress bar */}
                        <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background: "linear-gradient(to right, rgb(232,245,232), rgb(0,177,64))",
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
                            style={{ color: above ? "var(--kv-green)" : "#ef4444" }}
                          >
                            {above ? "+" : ""}{vsMedian.toFixed(1)}% vs. medianen
                          </span>
                        </div>
                      </>
                    );
                  })() : (
                    <p className="text-sm text-muted-foreground">Ingen inntektsdata</p>
                  )}
                </div>
              </div>
              <button
                onClick={clearSelection}
                className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Lukk"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Legend */}
        {!loading && values.length > 0 && (
          <div
            className="absolute top-3 left-3 z-[999] bg-white rounded-xl shadow-md px-3 py-2.5"
            style={{ border: "1px solid #e5e7eb" }}
          >
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">Inntekt etter skatt</p>
            <div
              className="h-3 w-24 rounded-sm"
              style={{ background: "linear-gradient(to right, rgb(232,245,232), rgb(0,177,64))" }}
            />
            <div className="flex justify-between mt-0.5">
              <span className="text-[10px] text-muted-foreground">{formatKr(min)}</span>
              <span className="text-[10px] text-muted-foreground">{formatKr(max)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
