"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, X, Zap, LocateFixed, ExternalLink, Search, MapPin, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  | { type: "kommune"; kommunenummer: string; kommunenavn: string }
  | { type: "adresse"; addr: Address };

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

const MIN_ZOOM_FOR_FETCH = 8;

function FlyTo({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], 12, { duration: 1.2 });
  }, [lat, lon, map]);
  return null;
}

function PanToSelected({ station }: { station: Station | null }) {
  const map = useMap();
  useEffect(() => {
    if (!station) return;
    map.panTo([station.lat, station.lon], { animate: true, duration: 0.4 });
  }, [station, map]);
  return null;
}

function ViewportLoader({ onLoad, onError, onLoading, onZoomLow }: {
  onLoad: (stations: Station[]) => void;
  onError: () => void;
  onLoading: (v: boolean) => void;
  onZoomLow: (v: boolean) => void;
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useMapEvents({
    moveend(e) {
      const map = e.target;
      const zoom = map.getZoom();
      if (zoom < MIN_ZOOM_FOR_FETCH) {
        onZoomLow(true);
        return;
      }
      onZoomLow(false);
      const { lat, lng } = map.getCenter();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onLoading(true);
        fetchStations(lat, lng)
          .then((data) => { onLoad(data); onLoading(false); })
          .catch(() => { onError(); onLoading(false); });
      }, 400);
    },
  });

  return null;
}

async function fetchStations(lat: number, lon: number): Promise<Station[]> {
  const res = await fetch(`/api/charging?lat=${lat}&lon=${lon}`);
  if (!res.ok) throw new Error("fetch failed");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export function ChargingMap() {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(false);
  const [showConnectorInfo, setShowConnectorInfo] = useState(false);
  const [selected, setSelected] = useState<Station | null>(null);
  const [center, setCenter] = useState<{ lat: number; lon: number } | null>(null);
  const [zoomLow, setZoomLow] = useState(true);

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

    const kommuneMatches: Suggestion[] = kommunerRef.current
      .filter((k) => k.kommunenavn.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 4)
      .map((k) => ({ type: "kommune", kommunenummer: k.kommunenummer, kommunenavn: k.kommunenavn }));

    let adresseMatches: Suggestion[] = [];
    try {
      const res = await fetch(`https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(q)}&treffPerSide=4&utkoordsys=4326`);
      const data = await res.json();
      adresseMatches = (data.adresser ?? []).map((a: Address) => ({ type: "adresse" as const, addr: a }));
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

  const handleSelect = async (s: Suggestion) => {
    setShowDropdown(false);
    setSuggestions([]);
    setSelected(null);
    if (s.type === "kommune") {
      setQuery(s.kommunenavn);
      // Use stedsnavn to find the urban center of the municipality, not the geographic centroid
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
        setCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => setLocating(false),
      { timeout: 6000 }
    );
  };

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
              placeholder="Søk etter adresse eller sted..."
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
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-muted-foreground">
            {locating ? "Finner posisjon..." : loading ? "Henter ladestasjoner..." : zoomLow ? "Zoom inn p\u00e5 kartet for \u00e5 se ladestasjoner" : stations.length > 0 ? `${stations.length} ladestasjoner i omr\u00e5det \u2014 Kilde: OpenStreetMap` : "Ingen ladestasjoner funnet i dette omr\u00e5det"}
          </p>
          <button
            disabled
            title="Krever sanntidsdata \u2014 kommer snart"
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
        {(loading || locating) && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-background/90 backdrop-blur-sm border rounded-full px-4 py-2 shadow-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {locating ? "Finner posisjon..." : "Henter ladestasjoner..."}
            </div>
          </div>
        )}
        {!loading && !locating && zoomLow && stations.length === 0 && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-background/90 backdrop-blur-sm border rounded-full px-4 py-2 shadow-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Search className="h-4 w-4" />
              Zoom inn eller s\u00f8k for \u00e5 se ladestasjoner
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-[1000]">
            <p className="text-sm text-destructive">Kunne ikke laste data. Pr\u00f8v igjen senere.</p>
          </div>
        )}

        <MapContainer
          center={[65, 14]}
          zoom={5}
          style={{ height: "100%", width: "100%" }}
        >
          {center && <FlyTo lat={center.lat} lon={center.lon} />}
          <PanToSelected station={selected} />
          <ViewportLoader
            onLoad={(data) => { setStations(data); setError(false); }}
            onError={() => setError(true)}
            onLoading={setLoading}
            onZoomLow={setZoomLow}
          />
          <TileLayer
            url="https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png"
            attribution='&copy; <a href="https://www.kartverket.no/">Kartverket</a>'
          />
          {stations.map((s) => (
            <CircleMarker
              key={s.id}
              center={[s.lat, s.lon]}
              radius={6}
              pathOptions={{
                color: selected?.id === s.id ? "#003da5" : "#00b140",
                fillColor: selected?.id === s.id ? "#003da5" : "#00b140",
                fillOpacity: 0.85,
                weight: 1.5,
              }}
              eventHandlers={{
                click() {
                  setSelected((prev) => (prev?.id === s.id ? null : s));
                },
              }}
            />
          ))}
        </MapContainer>

        {/* Info card */}
        {selected && (
          <div
            className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-96 z-[999] bg-white rounded-2xl shadow-xl px-4 py-4"
            style={{ border: "1.5px solid var(--kv-green-light, #b3e6c8)" }}
          >
            {/* Where is this */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <p className="font-bold text-base truncate leading-snug">{selected.name}</p>
                {selected.operator && selected.operator !== selected.name && (
                  <p className="text-xs text-muted-foreground truncate">{selected.operator}</p>
                )}
                {selected.address && (
                  <p className="text-sm text-muted-foreground truncate mt-0.5">{selected.address}</p>
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

            {/* How many points */}
            <div className="border-t pt-3 mb-3">
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
              <p className="text-xs text-muted-foreground/50 mt-0.5 italic">Sanntidsdata tilgjengelig snart</p>
            </div>

            {/* What type */}
            {selected.connectors.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground font-medium mb-1.5">Kontakttyper</p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.connectors.map((c) => (
                    <button
                      key={c}
                      onClick={() => setShowConnectorInfo(true)}
                      className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium hover:bg-muted-foreground/20 transition-colors"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
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
                  tag: "Hurtiglading \u00b7 DC",
                  desc: "Standard for de fleste nye elbiler (VW, BMW, Hyundai, Ford, Tesla med adapter). Finner du p\u00e5 de fleste hurtigladere langs veien.",
                  speed: "50\u2013350 kW",
                  time: "Ca. 20\u201345 min (10\u201380%)",
                },
                {
                  name: "CHAdeMO",
                  tag: "Hurtiglading \u00b7 DC",
                  desc: "Japansk standard brukt av eldre Nissan Leaf og Mitsubishi. Er p\u00e5 vei ut og erstattes av CCS.",
                  speed: "50\u2013100 kW",
                  time: "Ca. 20\u201340 min (10\u201380%)",
                },
                {
                  name: "Type 2",
                  tag: "Normallading \u00b7 AC",
                  desc: "Vanligste kontakt i Europa. Brukes b\u00e5de hjemme, p\u00e5 jobb og p\u00e5 offentlige ladere. St\u00f8ttes av nesten alle elbiler.",
                  speed: "3,6\u201322 kW",
                  time: "Ca. 3\u20138 timer (full lading)",
                },
                {
                  name: "Schuko",
                  tag: "Langsomlading \u00b7 AC",
                  desc: "Vanlig stikkontakt. Kan brukes i n\u00f8dstilfeller, men er ikke anbefalt til daglig lading \u2013 tar sv\u00e6rt lang tid.",
                  speed: "Ca. 2,3 kW",
                  time: "Ca. 12\u201320 timer (full lading)",
                },
              ].map((c) => (
                <div key={c.name} className="flex gap-3">
                  <span className="mt-0.5 text-xs font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground h-fit shrink-0">{c.name}</span>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">{c.tag}</p>
                    <p className="text-sm mt-0.5">{c.desc}</p>
                    <p className="text-xs text-muted-foreground mt-1">{c.speed} \u00b7 {c.time}</p>
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
