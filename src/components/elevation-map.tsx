"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Search, MapPin, Mountain, Loader2, Layers, X, ChevronDown, ChevronUp } from "lucide-react";

// Fix Leaflet default marker icons in Next.js
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const DEV = process.env.NEXT_PUBLIC_DEV === "true";

const TILE_LAYERS = {
  kart: {
    label: "Kart",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  terreng: {
    label: "Terreng",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
  },
} as const;

type TileLayerKey = keyof typeof TILE_LAYERS;

interface Address {
  adressetekst: string;
  poststed: string;
  kommunenavn: string;
  representasjonspunkt: { lat: number; lon: number };
}

interface ElevationResult {
  datakilde: string;
  høyde: number;
  terrengtype?: string;
}

interface SelectedLocation {
  address: Address;
  elevation: ElevationResult | null;
}

interface DevLogEntry {
  id: number;
  time: string;
  url: string;
  duration: number;
  summary: string;
  ok: boolean;
}

let logId = 0;

function FlyTo({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], 13, { duration: 1.2 });
  }, [lat, lon, map]);
  return null;
}

export function ElevationMap() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Address[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selected, setSelected] = useState<SelectedLocation | null>(null);
  const [loadingElevation, setLoadingElevation] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [tileLayer, setTileLayer] = useState<TileLayerKey>("kart");
  const [devLog, setDevLog] = useState<DevLogEntry[]>([]);
  const [devOpen, setDevOpen] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const devFetch = useCallback(async (url: string, summary: (data: unknown) => string) => {
    const t0 = performance.now();
    const res = await fetch(url);
    const data = await res.json();
    const duration = Math.round(performance.now() - t0);
    if (DEV) {
      setDevLog((prev) => [
        {
          id: ++logId,
          time: new Date().toLocaleTimeString("no-NO"),
          url,
          duration,
          summary: summary(data),
          ok: res.ok,
        },
        ...prev.slice(0, 19),
      ]);
    }
    return data;
  }, []);

  const searchAddresses = useCallback(
    async (q: string) => {
      if (q.length < 2) { setSuggestions([]); return; }
      setLoadingSuggestions(true);
      try {
        const url = `https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(q)}&treffPerSide=6&utkoordsys=4326`;
        const data = await devFetch(url, (d: unknown) => {
          const result = d as { adresser?: unknown[] };
          return `${result.adresser?.length ?? 0} adresser funnet`;
        });
        setSuggestions((data as { adresser?: Address[] }).adresser ?? []);
        setShowDropdown(true);
      } catch {
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    },
    [devFetch]
  );

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchAddresses(val), 300);
  };

  const handleSelect = async (address: Address) => {
    setShowDropdown(false);
    setQuery(`${address.adressetekst}, ${address.poststed}`);
    setSuggestions([]);
    setLoadingElevation(true);
    setSelected({ address, elevation: null });

    try {
      const { lat, lon } = address.representasjonspunkt;
      const url = `https://ws.geonorge.no/hoydedata/v1/punkt?koordsys=4326&nord=${lat}&ost=${lon}`;
      const data = await devFetch(url, (d: unknown) => {
        const result = d as { punkter?: Array<{ z: number; datakilde: string }> };
        const p = result.punkter?.[0];
        return p ? `${p.z.toFixed(1)} moh. (${p.datakilde})` : "Ingen data";
      });
      const høyde = (data as { punkter?: Array<{ z: number; datakilde: string; terrengtype?: string }> }).punkter?.[0];
      setSelected({
        address,
        elevation: høyde
          ? { datakilde: høyde.datakilde, høyde: høyde.z, terrengtype: høyde.terrengtype }
          : null,
      });
    } catch {
      setSelected((prev) => prev && { ...prev, elevation: null });
    } finally {
      setLoadingElevation(false);
    }
  };

  const lat = selected?.address.representasjonspunkt.lat ?? 65;
  const lon = selected?.address.representasjonspunkt.lon ?? 14;

  return (
    <div className="flex flex-col" style={{ height: "calc(100svh - 57px)" }}>
      {/* Search bar */}
      <div className="relative z-[1000] px-4 py-4 md:px-8 shrink-0" style={{ background: "var(--kv-blue)" }}>
        <div className="max-w-xl mx-auto relative">
          <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 shadow-lg">
            {loadingSuggestions ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <input
              ref={inputRef}
              value={query}
              onChange={handleInput}
              onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              placeholder="Søk etter en adresse i Norge..."
              className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {showDropdown && suggestions.length > 0 && (
            <ul className="absolute top-full mt-1 left-0 right-0 bg-white rounded-xl shadow-xl border overflow-hidden">
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
                        {addr.poststed}, {addr.kommunenavn}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="relative grow">
        <MapContainer
          center={[65, 14]}
          zoom={5}
          style={{ height: "100%", width: "100%" }}
          zoomControl={true}
        >
          <TileLayer
            key={tileLayer}
            url={TILE_LAYERS[tileLayer].url}
            attribution={TILE_LAYERS[tileLayer].attribution}
            maxZoom={17}
          />
          {selected && (
            <>
              <FlyTo lat={lat} lon={lon} />
              <Marker position={[lat, lon]}>
                <Popup>
                  <strong>{selected.address.adressetekst}</strong>
                  <br />
                  {selected.address.poststed}, {selected.address.kommunenavn}
                  {selected.elevation && (
                    <><br /><span className="font-semibold">{selected.elevation.høyde.toFixed(1)} moh.</span></>
                  )}
                </Popup>
              </Marker>
            </>
          )}
        </MapContainer>

        {/* Tile layer toggle */}
        <div className="absolute top-3 right-3 z-[999] flex rounded-lg overflow-hidden shadow border bg-white">
          {(Object.keys(TILE_LAYERS) as TileLayerKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setTileLayer(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
                tileLayer === key
                  ? "text-white"
                  : "text-muted-foreground hover:bg-muted"
              }`}
              style={tileLayer === key ? { background: "var(--kv-blue)" } : {}}
            >
              <Layers className="h-3 w-3" />
              {TILE_LAYERS[key].label}
            </button>
          ))}
        </div>

        {/* Elevation card */}
        {selected && (
          <div
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[999] bg-white rounded-2xl shadow-xl px-6 py-4 min-w-[260px] max-w-sm w-full border"
            style={{ borderTop: "3px solid var(--kv-green)" }}
          >
            <div className="flex items-start gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                style={{ background: "var(--kv-blue-light, #e8edf8)" }}
              >
                <Mountain className="h-5 w-5" style={{ color: "var(--kv-blue)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{selected.address.adressetekst}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {selected.address.poststed}, {selected.address.kommunenavn}
                </p>
                <div className="mt-2">
                  {loadingElevation ? (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Henter høyde...
                    </div>
                  ) : selected.elevation ? (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-extrabold" style={{ color: "var(--kv-blue)" }}>
                        {selected.elevation.høyde.toFixed(1)}
                      </span>
                      <span className="text-sm text-muted-foreground font-medium">meter over havet</span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Ingen høydedata</p>
                  )}
                  {selected.elevation?.datakilde && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Kilde: {selected.elevation.datakilde}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {!selected && (
          <div className="absolute inset-0 flex items-end justify-center pb-8 pointer-events-none z-[998]">
            <div className="bg-white/90 backdrop-blur-sm rounded-xl px-5 py-3 shadow text-sm text-muted-foreground">
              Søk etter en adresse for å se høyden over havet
            </div>
          </div>
        )}

        {/* Dev panel */}
        {DEV && (
          <div className="absolute bottom-3 right-3 z-[1000] w-80 rounded-xl border shadow-xl overflow-hidden font-mono text-[11px]"
            style={{ background: "#0f172a", color: "#94a3b8", borderColor: "#1e293b" }}
          >
            <div
              className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
              style={{ background: "#1e293b", color: "#e2e8f0" }}
              onClick={() => setDevOpen((o) => !o)}
            >
              <span className="font-semibold tracking-wide">DEV · API Log</span>
              <div className="flex items-center gap-2">
                <span style={{ color: "#64748b" }}>{devLog.length} kall</span>
                {devOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </div>
            </div>
            {devOpen && (
              <div className="max-h-56 overflow-y-auto divide-y" style={{ borderColor: "#1e293b" }}>
                {devLog.length === 0 ? (
                  <p className="px-3 py-4 text-center" style={{ color: "#475569" }}>
                    Ingen kall ennå — søk etter en adresse
                  </p>
                ) : (
                  devLog.map((entry) => (
                    <div key={entry.id} className="px-3 py-2 flex flex-col gap-0.5">
                      <div className="flex items-center justify-between">
                        <span style={{ color: entry.ok ? "#4ade80" : "#f87171" }}>
                          {entry.ok ? "200 OK" : "ERR"}
                        </span>
                        <span style={{ color: "#475569" }}>{entry.time} · {entry.duration}ms</span>
                      </div>
                      <span className="truncate" style={{ color: "#7dd3fc" }}>{entry.url}</span>
                      <span style={{ color: "#cbd5e1" }}>{entry.summary}</span>
                    </div>
                  ))
                )}
              </div>
            )}
            {devOpen && devLog.length > 0 && (
              <button
                onClick={() => setDevLog([])}
                className="flex items-center gap-1 w-full justify-center py-1.5 text-[10px] transition-colors hover:opacity-80"
                style={{ background: "#1e293b", color: "#64748b" }}
              >
                <X className="h-3 w-3" /> Tøm logg
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
