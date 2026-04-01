"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, GeoJSON, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoJsonObject, Feature } from "geojson";
import type { Layer } from "leaflet";
import { Search, MapPin, Loader2, X, LocateFixed, Map as MapIcon, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  | { type: "kommune"; kommunenummer: string; kommunenavn: string }
  | { type: "adresse"; addr: IncomeAddress };

interface SelectedKommune {
  kommunenummer: string;
  kommunenavn: string;
  vern: VerneData | null;
  coords: { lat: number; lon: number };
}

const VERNE_LABELS: Record<string, string> = {
  np: "Nasjonalpark",
  nr: "Naturreservat",
  lv: "Landskapsvernområde",
  nm: "Andre vernekategorier",
};

function interpolateColor(t: number): string {
  const r = Math.round(236 - t * (236 - 20));
  const g = Math.round(253 - t * (253 - 83));
  const b = Math.round(245 - t * (245 - 45));
  return `rgb(${r},${g},${b})`;
}

function verneColor(total: number | null | undefined, max: number): string {
  if (!total || total === 0 || max === 0) return "#e5e7eb";
  const t = Math.max(0, Math.min(1, total / max));
  return interpolateColor(t);
}

function fmt(val: number | null): string {
  if (val == null) return "—";
  return `${val.toFixed(2).replace(".", ",")} km²`;
}

function computeVerneStats(verneData: Record<string, VerneData>, kommunenummer: string) {
  const entries = Object.entries(verneData).filter(([, v]) => (v.total ?? 0) > 0);
  const sorted = [...entries].sort(([, a], [, b]) => (b.total ?? 0) - (a.total ?? 0));
  const rank = sorted.findIndex(([k]) => k === kommunenummer) + 1;
  const total = sorted.length;
  const medianVal = sorted[Math.floor(total / 2)]?.[1]?.total ?? 0;
  const val = verneData[kommunenummer]?.total ?? 0;
  const vsMedian = medianVal > 0 ? ((val - medianVal) / medianVal) * 100 : 0;
  return { rank, total, medianVal, vsMedian };
}

function FlyTo({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], 10, { duration: 1.0 });
  }, [lat, lon, map]);
  return null;
}

export function ProtectedAreasMap() {
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const [verneData, setVerneData] = useState<Record<string, VerneData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selected, setSelected] = useState<SelectedKommune | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lon: number } | null>(null);
  const [asked, setAsked] = useState(false);
  const [locating, setLocating] = useState(false);
  const [showBase, setShowBase] = useState(false);
  const [cardExpanded, setCardExpanded] = useState(false);

  const verneRef = useRef<Record<string, VerneData>>({});
  const geoFeaturesRef = useRef<Array<{ kommunenummer: string; kommunenavn: string }>>([]);
  const layerRefs = useRef<Map<string, L.Path>>(new Map());
  const selectedKommuneRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/kommuner").then((r) => r.json()),
      fetch("/api/protected-areas").then((r) => r.json()),
    ])
      .then(([geo, verne]) => {
        verneRef.current = verne;
        geoFeaturesRef.current = (geo.features ?? []).map((f: { properties: { kommunenummer: string; kommunenavn: string } }) => ({
          kommunenummer: f.properties.kommunenummer,
          kommunenavn: f.properties.kommunenavn,
        }));
        setGeoData(geo);
        setVerneData(verne);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  const max = Math.max(...Object.values(verneData).map((v) => v.total ?? 0));

  const highlightKommune = useCallback((kommunenummer: string) => {
    if (selectedKommuneRef.current && selectedKommuneRef.current !== kommunenummer) {
      const prev = layerRefs.current.get(selectedKommuneRef.current);
      if (prev) {
        const total = verneRef.current[selectedKommuneRef.current]?.total;
        prev.setStyle({ weight: 0.5, color: "white", fillOpacity: total ? 0.9 : 0.3 });
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
        const total = verneRef.current[selectedKommuneRef.current]?.total;
        layer.setStyle({ weight: 0.5, color: "white", fillOpacity: total ? 0.9 : 0.3 });
      }
      selectedKommuneRef.current = null;
    }
    setSelected(null);
    setQuery("");
  }, []);

  useEffect(() => {
    const pref = localStorage.getItem("mapgram-use-location");
    if (pref !== null) handleLocationChoice(pref === "yes");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLocationChoice = (useLocation: boolean) => {
    setAsked(true);
    try { localStorage.setItem("mapgram-use-location", useLocation ? "yes" : "no"); } catch {}
    if (!useLocation || !navigator.geolocation) {
      setFlyTarget({ lat: 65, lon: 14 });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        setLocating(false);
        setFlyTarget({ lat, lon });
        try {
          const res = await fetch(
            `https://ws.geonorge.no/kommuneinfo/v1/punkt?nord=${lat}&ost=${lon}&koordsys=4258`
          );
          const data = await res.json();
          if (data.kommunenummer) {
            highlightKommune(data.kommunenummer);
            setSelected({
              kommunenummer: data.kommunenummer,
              kommunenavn: data.kommunenavn,
              vern: verneRef.current[data.kommunenummer] ?? null,
              coords: { lat, lon },
            });
          }
        } catch { /* ignore */ }
      },
      () => {
        setLocating(false);
        setFlyTarget({ lat: 65, lon: 14 });
      },
      { timeout: 6000 }
    );
  };

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return; }
    setLoadingSuggestions(true);

    const kommuneMatches: Suggestion[] = geoFeaturesRef.current
      .filter((f) => f.kommunenavn.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 4)
      .map((f) => ({ type: "kommune", kommunenummer: f.kommunenummer, kommunenavn: f.kommunenavn }));

    let adresseMatches: Suggestion[] = [];
    try {
      const res = await fetch(`https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(q)}&treffPerSide=4&utkoordsys=4326`);
      const data = await res.json();
      adresseMatches = (data.adresser ?? []).map((a: IncomeAddress) => ({ type: "adresse" as const, addr: a }));
    } catch { /* ignore */ }

    setSuggestions([...kommuneMatches, ...adresseMatches]);
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
    if (s.type === "kommune") {
      setQuery(s.kommunenavn);
      highlightKommune(s.kommunenummer);
      setSelected({ kommunenummer: s.kommunenummer, kommunenavn: s.kommunenavn, vern: verneRef.current[s.kommunenummer] ?? null, coords: { lat: 0, lon: 0 } });
      const layer = layerRefs.current.get(s.kommunenummer) as L.Polygon | undefined;
      const center = layer?.getBounds().getCenter();
      if (center) setFlyTarget({ lat: center.lat, lon: center.lng });
    } else {
      const addr = s.addr;
      setQuery(addr.kommunenavn);
      highlightKommune(addr.kommunenummer);
      setSelected({ kommunenummer: addr.kommunenummer, kommunenavn: addr.kommunenavn, vern: verneRef.current[addr.kommunenummer] ?? null, coords: addr.representasjonspunkt });
      setFlyTarget(addr.representasjonspunkt);
    }
  };

  const geoStyle = (feature?: Feature) => {
    const nr = feature?.properties?.kommunenummer;
    const total = verneRef.current[nr]?.total;
    return {
      fillColor: verneColor(total, max),
      weight: 0.5,
      color: "white",
      fillOpacity: total ? 0.9 : 0.3,
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
          const total = verneRef.current[nr]?.total;
          l.setStyle({ weight: 0.5, color: "white", fillOpacity: total ? 0.9 : 0.3 });
        }
      },
      click() {
        highlightKommune(nr);
        setSelected({
          kommunenummer: nr,
          kommunenavn: navn,
          vern: verneRef.current[nr] ?? null,
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
                    {s.type === "kommune" ? (
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
              <div className="h-8 w-32 rounded-lg bg-muted animate-pulse" />
              <div className="h-8 w-24 rounded-lg bg-muted animate-pulse" />
            </div>
            <div className="flex-1 rounded-xl bg-muted animate-pulse" />
            <div className="flex gap-3 justify-center">
              <div className="h-6 w-20 rounded-md bg-muted animate-pulse" />
              <div className="h-6 w-28 rounded-md bg-muted animate-pulse" />
            </div>
          </div>
        )}
        {!loading && !asked && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-[1000]">
            <div className="bg-background rounded-2xl shadow-xl border px-6 py-6 max-w-sm w-full mx-4 flex flex-col items-center gap-4 text-center">
              <LocateFixed className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-semibold text-base">Bruk din posisjon?</p>
                <p className="text-sm text-muted-foreground mt-1">Vi kan vise kommunen du befinner deg i, eller du kan søke manuelt.</p>
              </div>
              <div className="flex gap-3 w-full">
                <Button onClick={() => handleLocationChoice(true)} className="flex-1" size="lg">
                  <LocateFixed className="h-4 w-4" /> Ja, bruk posisjon
                </Button>
                <Button onClick={() => handleLocationChoice(false)} variant="secondary" className="flex-1" size="lg">
                  Nei takk
                </Button>
              </div>
            </div>
          </div>
        )}
        {!loading && asked && locating && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-[1000]">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Finner posisjon...
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-[1000]">
            <p className="text-sm text-destructive">Kunne ikke laste data. Prøv igjen senere.</p>
          </div>
        )}

        {!loading && !error && geoData && (
          <MapContainer center={[65, 14]} zoom={5} style={{ height: "100%", width: "100%" }}>
            {showBase && (
              <TileLayer
                url="https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png"
                attribution='&copy; <a href="https://www.kartverket.no/">Kartverket</a>'
              />
            )}
            {flyTarget && <FlyTo lat={flyTarget.lat} lon={flyTarget.lon} />}
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
          <div className="bg-white/90 rounded-xl border px-3 py-2 shadow text-xs">
            <p className="font-semibold text-muted-foreground mb-1.5">Vernet areal (km²)</p>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-24 rounded-full" style={{ background: "linear-gradient(to right, #ecfdf5, #145327)" }} />
            </div>
            <div className="flex justify-between mt-0.5 text-muted-foreground/70">
              <span>0</span>
              <span>{Math.round(max)}</span>
            </div>
          </div>
          <button
            onClick={() => setShowBase((b) => !b)}
            className={`flex items-center gap-1.5 rounded-lg border bg-white shadow-md px-3 py-1.5 text-xs font-semibold transition-colors ${showBase ? "text-white" : "text-muted-foreground hover:bg-muted"}`}
            style={showBase ? { background: "var(--kv-blue)" } : {}}
          >
            <MapIcon className="h-3.5 w-3.5" />
            Bakgrunnskart
          </button>
        </div>

        {/* Info card */}
        {selected && (
          <div
            className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-96 z-[999] bg-white rounded-2xl shadow-xl px-4 py-4"
            style={{ border: "1.5px solid #86efac" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-base">{selected.kommunenavn}</p>
                {selected.vern?.total ? (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    <span className="font-semibold" style={{ color: "#145327" }}>
                      {selected.vern.total.toFixed(2).replace(".", ",")} km²
                    </span>{" "}vernet
                  </p>
                ) : null}
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
              {selected.vern?.total ? (() => {
                const { rank, total, vsMedian } = computeVerneStats(verneData, selected.kommunenummer);
                const pct = Math.max(0, Math.min(100, (selected.vern.total! / max) * 100));
                const above = vsMedian >= 0;
                return (
                  <>
                    <div className="border-t mt-3 pt-3 mb-3">
                      {/* Progress bar */}
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: "linear-gradient(to right, #ecfdf5, #145327)",
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-[10px] text-muted-foreground">0 km²</span>
                        <span className="text-[10px] text-muted-foreground">{fmt(max)}</span>
                      </div>

                      {/* Rank + vs median */}
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          #{rank} av {total} kommuner
                        </span>
                        <span
                          className="text-xs font-semibold"
                          style={{ color: above ? "#145327" : "#ef4444" }}
                        >
                          {above ? "+" : ""}{vsMedian.toFixed(1)}% vs. medianen
                        </span>
                      </div>
                    </div>

                    <div className="border-t pt-3 flex flex-col gap-1.5">
                      {(["np", "nr", "lv", "nm"] as const).map((key) => {
                        const val = selected.vern![key];
                        if (!val) return null;
                        return (
                          <div key={key} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{VERNE_LABELS[key]}</span>
                            <span className="font-medium tabular-nums">{fmt(val)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })() : (
                <p className="text-sm text-muted-foreground border-t mt-3 pt-3">Ingen registrerte verneområder.</p>
              )}

              <p className="text-xs text-muted-foreground/50 mt-3 italic">Kilde: SSB tabell 08936, 2024</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
