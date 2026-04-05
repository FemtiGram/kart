"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Loader2,
  X,
  Wind,
  LocateFixed,
  ExternalLink,
  Search,
  MapPin,
  Info,
  Map as MapIcon,
  Layers,
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FYLKER, isInNorway, OSLO } from "@/lib/fylker";
import { FlyTo, useDebounceRef, useSearchAbort } from "@/lib/map-utils";
import type { Address, KommuneEntry, Suggestion } from "@/lib/map-utils";

interface WindFarm {
  id: unknown;
  name: string;
  owner: string | null;
  municipality: string | null;
  county: string | null;
  lat: number;
  lon: number;
  capacityMW: number | null;
  turbineCount: number | null;
  productionGWh: number | null;
  status: string;
}

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

function windFarmIcon(
  isSelected: boolean,
  inverted: boolean,
  capacityMW: number | null
): L.DivIcon {
  // Size by capacity: small < 50MW, medium 50-200MW, large > 200MW
  const size =
    capacityMW != null && capacityMW > 200
      ? 32
      : capacityMW != null && capacityMW >= 50
        ? 30
        : 26;
  const iconSize = Math.round(size * 0.5);

  const bg = inverted
    ? isSelected
      ? "#24374c"
      : "#0369a1"
    : "white";
  const iconColor = inverted
    ? "white"
    : isSelected
      ? "#24374c"
      : "#0369a1";
  const border = isSelected
    ? "#24374c"
    : inverted
      ? "rgba(255,255,255,0.3)"
      : "rgba(0,0,0,0.15)";

  // Simple wind turbine SVG (three blades on a pole)
  const turbine = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/></svg>`;

  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;line-height:0;background:${bg};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.25);border:2.5px solid ${border}">${turbine}</div>`,
  });
}

function PanToSelected({ farm }: { farm: WindFarm | null }) {
  const map = useMap();
  useEffect(() => {
    if (!farm) return;
    map.panTo([farm.lat, farm.lon], { animate: true, duration: 0.4 });
  }, [farm, map]);
  return null;
}

export function WindPowerMap() {
  const [farms, setFarms] = useState<WindFarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [locating, setLocating] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [selected, setSelected] = useState<WindFarm | null>(null);
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

  const loadWindFarms = useCallback(async () => {
    setError(false);
    setLoading(true);

    const t0 = Date.now();
    try {
      const res = await fetch("/api/wind-power");
      const data = await res.json();
      if (data.error || !data.windFarms) {
        setError(true);
        setLoading(false);
        return;
      }
      setFarms(data.windFarms);
      const elapsed = Date.now() - t0;
      if (elapsed < 3000)
        await new Promise((r) => setTimeout(r, 3000 - elapsed));
      setLoading(false);

      // Fly to user location or Oslo
      const pref = localStorage.getItem("mapgram-use-location");
      if (pref === "yes" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude: lat, longitude: lon } = pos.coords;
            if (isInNorway(lat, lon)) {
              setCenter({ lat, lon });
            } else {
              setCenter({ lat: OSLO.lat, lon: OSLO.lon });
            }
          },
          () => setCenter({ lat: OSLO.lat, lon: OSLO.lon }),
          { timeout: 15000, maximumAge: 60000 }
        );
      } else {
        setCenter({ lat: OSLO.lat, lon: OSLO.lon });
      }
    } catch {
      setError(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWindFarms();
  }, [loadWindFarms]);

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
      () => setLocating(false),
      { timeout: 15000, maximumAge: 60000 }
    );
  };

  // Stats for display
  const totalCapacity = useMemo(
    () =>
      farms.reduce(
        (sum, f) => sum + (f.capacityMW ?? 0),
        0
      ),
    [farms]
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
              ? "Henter vindkraftverk..."
              : farms.length > 0
                ? `${farms.length} vindkraftverk — ${Math.round(totalCapacity)} MW totalt — Kilde: NVE`
                : "Ingen vindkraftverk funnet"}
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
                Henter vindkraftverk...
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
        {error && (
          <div
            className="absolute bottom-20 sm:top-3 sm:bottom-auto left-1/2 -translate-x-1/2 z-[1000] rounded-full px-4 py-2 shadow-lg"
            style={{ background: "#b91c1c" }}
          >
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-white">
                Kunne ikke hente vindkraftverk.
              </p>
              <button
                onClick={loadWindFarms}
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
            <FlyTo lat={center.lat} lon={center.lon} zoom={center.zoom} />
          )}
          <PanToSelected farm={selected} />
          <TileLayer
            key={tileLayer}
            url={TILE_LAYERS[tileLayer].url}
            attribution={TILE_LAYERS[tileLayer].attribution}
            maxZoom={17}
          />
          {farms.map((f, idx) => (
            <Marker
              key={String(f.id ?? idx)}
              position={[f.lat, f.lon]}
              icon={windFarmIcon(
                selected?.id === f.id,
                tileLayer === "gråtone",
                f.capacityMW
              )}
              eventHandlers={{
                click() {
                  setSelected((prev) =>
                    prev?.id === f.id ? null : f
                  );
                },
              }}
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
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    {selected.status}
                  </span>
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
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <span
                    className="text-2xl font-extrabold"
                    style={{ color: "var(--kv-blue)" }}
                  >
                    {selected.capacityMW != null
                      ? Math.round(selected.capacityMW)
                      : "—"}
                  </span>
                  <p className="text-xs text-muted-foreground">MW</p>
                </div>
                <div>
                  <span
                    className="text-2xl font-extrabold"
                    style={{ color: "var(--kv-blue)" }}
                  >
                    {selected.turbineCount ?? "—"}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    turbiner
                  </p>
                </div>
                <div>
                  <span
                    className="text-2xl font-extrabold"
                    style={{ color: "var(--kv-blue)" }}
                  >
                    {selected.productionGWh != null
                      ? Math.round(selected.productionGWh)
                      : "—"}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    GWh/år
                  </p>
                </div>
              </div>
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
              <h2 className="font-bold text-base">Om vindkraftdata</h2>
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
                Kartet viser alle vindkraftverk i drift i Norge. Data
                hentes fra{" "}
                <strong>NVE Vindkraftdatabase</strong> (Norges
                vassdrags- og energidirektorat).
              </p>
              <p>
                <strong>MW (megawatt)</strong> er installert kapasitet
                — maks effekt kraftverket kan produsere.
              </p>
              <p>
                <strong>GWh/år</strong> er forventet årlig produksjon,
                som avhenger av vindforhold.
              </p>
              <p className="text-xs text-muted-foreground">
                Data oppdateres hver time. Kilde:{" "}
                <a
                  href="https://api.nve.no/doc/vindkraftdatabase/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  api.nve.no
                </a>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
