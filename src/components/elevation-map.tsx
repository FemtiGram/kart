"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useSearchParams } from "next/navigation";
import "leaflet/dist/leaflet.css";
import { Search, MapPin, Mountain, Loader2, X, ChevronUp, LocateFixed, Crosshair, Wind, Droplets, Sun, Cloud, CloudSun, CloudRain, CloudSnow, CloudLightning, CloudFog, CloudHail, CloudDrizzle, Moon, ExternalLink, Map as MapIcon, Info, Navigation, Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { LucideIcon } from "lucide-react";
import { DataDisclaimer, useDebounceRef, MAP_HEIGHT, TILE_URL_KART, KV_ATTRIBUTION, useGeolocation } from "@/lib/map-utils";
import { safeFlyTo } from "@/lib/safe-fly";
import { InfoModal } from "@/components/info-modal";
import { TileToggle } from "@/components/tile-toggle";
import { DriveLink } from "@/components/drive-link";
import { useInitialPosition } from "@/lib/use-initial-position";
import { isWithinNorway, parseCoordinates } from "@/lib/parse-coordinates";

function weatherIcon(symbolCode: string): LucideIcon {
  const c = symbolCode.toLowerCase();
  if (c.includes("thunder")) return CloudLightning;
  if (c.includes("snow") && c.includes("rain")) return CloudHail;
  if (c.includes("sleet")) return CloudHail;
  if (c.includes("snow")) return CloudSnow;
  if (c.includes("heavyrain") || c.includes("rain")) return CloudRain;
  if (c.includes("drizzle") || c.includes("lightrain")) return CloudDrizzle;
  if (c.includes("fog")) return CloudFog;
  if (c.includes("cloudy") && c.includes("partly")) return CloudSun;
  if (c.includes("cloudy")) return Cloud;
  if (c.includes("fair")) return CloudSun;
  if (c.includes("night")) return Moon;
  return Sun;
}

// Fix Leaflet default marker icons in Next.js
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});


const TILE_LAYERS = {
  kart: {
    label: "Kart",
    url: TILE_URL_KART,
    attribution: KV_ATTRIBUTION,
  },
  terreng: {
    label: "Terreng",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
  },
} as const;

type TileLayerKey = keyof typeof TILE_LAYERS;

import type { Address } from "@/lib/map-utils";

interface ElevationResult {
  datakilde: string;
  høyde: number | null;
  terrengtype?: string;
}

interface ElevationResponse {
  punkter?: Array<{ z: number | null; datakilde: string; terrengtype?: string }>;
}

interface WeatherResult {
  temperature: number;
  windSpeed: number;
  precipitation: number;
  symbolCode: string;
}

interface SelectedLocation {
  address: Address;
  elevation: ElevationResult | null;
  weather: WeatherResult | null;
  yrSearchName: string;
  mapsCoords?: { lat: number; lon: number };
}

/** A search dropdown row: an address from Geonorge, or a pasted coordinate pair. */
interface Suggestion extends Address {
  isCoordinate?: boolean;
}

/** Camera move for a new selection. With `zoom` the map flies there; without, it only pans enough to keep the point clear of the compact card. */
interface CameraMove {
  lat: number;
  lon: number;
  zoom?: number;
  _t: number;
}

/** Zoom used when jumping to a searched address, coordinate or the user's position. */
const SEARCH_ZOOM = 16;

/** Pixels at the bottom of the map covered by the compact card (card height + bottom offset). */
const CARD_CLEARANCE = 210;

/** Turns the høyde-API's `datakilde` code (e.g. "dtm1_33_…") into a readable label. Unknown formats are shown as-is. */
function formatDatakilde(code: string): string {
  const m = code.match(/^dtm(\d+)/i);
  return m ? `Kartverkets terrengmodell, ${m[1]} m oppløsning` : code;
}

/** fetch + JSON that rejects on HTTP errors, so a failed upstream ends up in the catch path instead of being rendered as data. */
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json() as Promise<T>;
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** Query string for a shareable link to a point, read back by useInitialPosition. */
function shareParams(lat: number, lon: number, zoom: number) {
  return new URLSearchParams({ lat: lat.toFixed(5), lon: lon.toFixed(5), z: String(Math.round(zoom)) }).toString();
}

function ZoomTracker({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend() {
      onZoom(map.getZoom());
    },
  });
  return null;
}

function CameraController({ move }: { move: CameraMove | null }) {
  const map = useMap();
  useEffect(() => {
    if (!move) return;
    if (move.zoom != null) {
      safeFlyTo(map, move.lat, move.lon, move.zoom, { duration: 1.2 });
    } else if (map.getSize().y > CARD_CLEARANCE + 120) {
      // A click mid-flight (after a search) would otherwise let the flyTo
      // carry on away from the point the user just picked
      map.stop();
      map.panInside([move.lat, move.lon], {
        paddingTopLeft: [24, 48],
        paddingBottomRight: [24, CARD_CLEARANCE],
      });
    }
  }, [move, map]);
  return null;
}

export function ElevationMap() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selected, setSelected] = useState<SelectedLocation | null>(null);
  const [camera, setCamera] = useState<CameraMove | null>(null);
  const zoomRef = useRef(5);
  const [copied, setCopied] = useState(false);
  // Deep links are honoured only if present when the map mounts, so the URL
  // updates this map makes itself (see the effect below) don't re-trigger
  // them. Read from the router, not window.location: on a client-side <Link>
  // navigation the address bar still shows the previous page during render.
  const searchParams = useSearchParams();
  const [landedWithParams] = useState(() => searchParams.has("lat"));
  const [loadingElevation, setLoadingElevation] = useState(false);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [tileLayer, setTileLayer] = useState<TileLayerKey>("terreng");
  const [showInfoSheet, setShowInfoSheet] = useState(false);

  const debounceRef = useDebounceRef();
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  // Bumped on every keystroke / new selection so slow responses for an
  // older query or point can't overwrite newer results.
  const searchSeq = useRef(0);
  const selectionSeq = useRef(0);
  // The query the visible suggestions were fetched for, so Enter doesn't pick
  // a stale top result while the search for the current text is pending.
  const suggestionsFor = useRef("");

  const searchAddresses = useCallback(async (q: string) => {
    const seq = searchSeq.current;
    if (q.length < 2) { setSuggestions([]); setLoadingSuggestions(false); return; }
    setLoadingSuggestions(true);
    try {
      const data = await getJson<{ adresser?: Address[] }>(`/api/sok?q=${encodeURIComponent(q)}&n=6`);
      if (seq !== searchSeq.current) return;
      suggestionsFor.current = q;
      setSuggestions(data.adresser ?? []);
      setShowDropdown(true);
    } catch {
      if (seq === searchSeq.current) setSuggestions([]);
    } finally {
      if (seq === searchSeq.current) setLoadingSuggestions(false);
    }
  }, []);

  /** Closes the dropdown and cancels any pending or in-flight search so it can't reopen after a selection. */
  const closeSearch = useCallback(() => {
    searchSeq.current++;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setShowDropdown(false);
    setSuggestions([]);
    setLoadingSuggestions(false);
  }, [debounceRef]);

  const updateQuery = (val: string) => {
    searchSeq.current++;
    setQuery(val);
    setHighlightedIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const coords = parseCoordinates(val);
    if (coords) {
      suggestionsFor.current = val;
      setLoadingSuggestions(false);
      setSuggestions([{
        adressetekst: `${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`,
        poststed: "",
        kommunenavn: "",
        representasjonspunkt: coords,
        isCoordinate: true,
      }]);
      setShowDropdown(true);
      return;
    }

    debounceRef.current = setTimeout(() => searchAddresses(val), 300);
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => updateQuery(e.target.value);

  // Pasted coordinates replace the field (which usually still holds the last
  // selected place) instead of being spliced into the middle of it.
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").trim();
    if (!parseCoordinates(text)) return;
    e.preventDefault();
    updateQuery(text);
  };

  const fetchNearestName = useCallback(async (lat: number, lon: number): Promise<{ name: string; roadCoords?: { lat: number; lon: number } }> => {
    type AdresseHit = { adressetekst: string; poststed: string; kommunenavn: string; representasjonspunkt?: { lat: number; lon: number } };

    const fetchAddr = async (radius: number) => {
      const data = await getJson<{ adresser?: AdresseHit[] }>(`/api/sok?lat=${lat}&lon=${lon}&radius=${radius}&n=1`);
      return data.adresser?.[0] ?? null;
    };

    // 1. Building — close address hit (≤ 50m)
    try {
      const hit = await fetchAddr(50);
      if (hit) return {
        name: `${hit.adressetekst}, ${hit.poststed}`,
        roadCoords: hit.representasjonspunkt,
      };
    } catch { /* fall through */ }

    // 2. Road — medium radius (≤ 400m), strip house number to get street name
    try {
      const hit = await fetchAddr(400);
      if (hit) {
        const street = hit.adressetekst.replace(/\s+\d+\w*$/, "").trim();
        return {
          name: `${street}, ${hit.poststed}`,
          roadCoords: hit.representasjonspunkt,
        };
      }
    } catch { /* fall through */ }

    // 3. Place name — stedsnavn within 5km (mountains, lakes, forests)
    try {
      const data = await getJson<{ navn?: Array<{ stedsnavn?: Array<{ skrivemåte: string }> }> }>(
        `https://ws.geonorge.no/stedsnavn/v1/punkt?nord=${lat}&ost=${lon}&koordsys=4326&radius=5000&treffPerSide=1`
      );
      const name = data.navn?.[0]?.stedsnavn?.[0]?.skrivemåte;
      if (name) return { name };
    } catch { /* fall through */ }

    // 4. Fallback to raw coordinates
    return { name: `${lat.toFixed(5)}, ${lon.toFixed(5)}` };
  }, []);

  /**
   * Fetches elevation, then weather for a point. The elevation (the number
   * people came for) is shown as soon as it arrives; the weather request
   * follows with it as `altitude`, so MET corrects the temperature for the
   * real terrain height rather than its smoothed model terrain.
   * Returns the selection sequence number so callers can detect staleness.
   */
  const fetchLocationData = useCallback((address: Address) => {
    const seq = ++selectionSeq.current;
    const { lat, lon } = address.representasjonspunkt;
    setLoadingElevation(true);
    setLoadingWeather(true);

    getJson<ElevationResponse>(`https://ws.geonorge.no/hoydedata/v1/punkt?koordsys=4326&nord=${lat}&ost=${lon}`)
      .then((d) => d.punkter?.[0] ?? null, () => null)
      .then((p) => {
        if (seq !== selectionSeq.current) return;
        setSelected((prev) => prev && {
          ...prev,
          elevation: p ? { datakilde: p.datakilde, høyde: p.z, terrengtype: p.terrengtype } : null,
        });
        setLoadingElevation(false);

        const altitude = p?.z != null ? `&altitude=${Math.round(p.z)}` : "";
        getJson<WeatherResult>(`/api/weather?lat=${lat}&lon=${lon}${altitude}`)
          .catch(() => null)
          .then((w) => {
            if (seq !== selectionSeq.current) return;
            setSelected((prev) => prev && { ...prev, weather: w });
            setLoadingWeather(false);
          });
      });

    return seq;
  }, []);

  /**
   * Selects an arbitrary point (map click, geolocation, deep link, pasted
   * coordinates) and resolves a human-readable name for it. Pass `flyZoom`
   * to fly the camera there; map clicks omit it so the user keeps their
   * current zoom level.
   */
  const handleMapClick = useCallback(async (lat: number, lon: number, flyZoom?: number) => {
    closeSearch();
    setCamera({ lat, lon, zoom: flyZoom, _t: Date.now() });

    if (!isWithinNorway(lat, lon)) {
      selectionSeq.current++;
      setLoadingElevation(false);
      setLoadingWeather(false);
      setQuery(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
      setSelected({ address: { adressetekst: "Utenfor Norge", poststed: "", kommunenavn: "", representasjonspunkt: { lat, lon } }, elevation: null, weather: null, yrSearchName: "", mapsCoords: { lat, lon } });
      return;
    }

    const address: Address = {
      adressetekst: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
      poststed: "",
      kommunenavn: "",
      representasjonspunkt: { lat, lon },
    };
    setQuery(address.adressetekst);
    setSelected({ address, elevation: null, weather: null, yrSearchName: "", mapsCoords: { lat, lon } });

    const seq = fetchLocationData(address);
    const nearest = await fetchNearestName(lat, lon);
    if (seq !== selectionSeq.current) return;
    setQuery(nearest.name);
    setSelected((prev) => prev && {
      ...prev,
      address: { ...prev.address, adressetekst: nearest.name },
      yrSearchName: nearest.name,
      mapsCoords: nearest.roadCoords ?? { lat, lon },
    });
  }, [closeSearch, fetchNearestName, fetchLocationData]);

  const { locating, locateError, locate: handleLocate } = useGeolocation(
    useCallback((lat, lon) => {
      handleMapClick(lat, lon, SEARCH_ZOOM);
    }, [handleMapClick]),
    useCallback(() => {
      handleMapClick(59.91, 10.75, SEARCH_ZOOM);
    }, [handleMapClick]),
  );

  // Same lookup from both buttons; the GA event tells the big empty-state CTA
  // apart from the small one by the search field. gtag only exists in
  // production (layout.tsx).
  const locateFrom = (source: "cta" | "searchbar") => {
    (window as { gtag?: (...args: unknown[]) => void }).gtag?.("event", "min_posisjon", { source });
    handleLocate();
  };

  // Deep link (shared link, or /kommune/[slug]): ?lat=&lon=&z= triggers an
  // elevation+weather fetch at that point and flies to the requested zoom.
  useInitialPosition((lat, lon, zoom) => {
    if (landedWithParams) handleMapClick(lat, lon, zoom);
  });

  // Mirror the selection in the URL so it can be shared or bookmarked.
  // replaceState keeps every click out of the back-button history. Written
  // on selection changes only, not on every zoom: Next's router treats a
  // replaceState as navigation and would drop a <Link> click still pending.
  const wroteUrl = useRef(false);
  const selectedLat = selected?.address.representasjonspunkt.lat;
  const selectedLon = selected?.address.representasjonspunkt.lon;
  useEffect(() => {
    if (selectedLat == null || selectedLon == null) {
      if (wroteUrl.current) window.history.replaceState(null, "", window.location.pathname);
      wroteUrl.current = false;
      return;
    }
    const zoom = camera?.zoom ?? zoomRef.current;
    window.history.replaceState(null, "", `?${shareParams(selectedLat, selectedLon, zoom)}`);
    wroteUrl.current = true;
  }, [selectedLat, selectedLon, camera]);

  const handleShare = async () => {
    if (!selected) return;
    const { lat, lon } = selected.address.representasjonspunkt;
    const url = `${window.location.origin}${window.location.pathname}?${shareParams(lat, lon, zoomRef.current)}`;
    const høyde = selected.elevation?.høyde;
    const text = høyde != null
      ? `${selected.address.adressetekst} ligger ${høyde.toFixed(1)} meter over havet`
      : selected.address.adressetekst;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Høyde over havet", text, url });
      } catch { /* share sheet dismissed */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. insecure context) — let the user copy it by hand
      window.prompt("Kopier lenken:", url);
    }
  };

  const handleSelect = (address: Address) => {
    closeSearch();
    setQuery(`${address.adressetekst}, ${address.poststed}`);
    const { lat, lon } = address.representasjonspunkt;
    setCamera({ lat, lon, zoom: SEARCH_ZOOM, _t: Date.now() });
    setSelected({ address, elevation: null, weather: null, yrSearchName: `${address.adressetekst}, ${address.poststed}`, mapsCoords: address.representasjonspunkt });
    fetchLocationData(address);
  };

  const selectSuggestion = (s: Suggestion) => {
    setHighlightedIndex(-1);
    if (s.isCoordinate) {
      handleMapClick(s.representasjonspunkt.lat, s.representasjonspunkt.lon, SEARCH_ZOOM);
    } else {
      handleSelect(s);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // Enter with nothing highlighted picks the top result, but only if the
      // list is for what's in the box now
      const i = highlightedIndex >= 0 ? highlightedIndex : suggestionsFor.current === query ? 0 : -1;
      if (i < 0 || !suggestions[i]) return;
      e.preventDefault();
      selectSuggestion(suggestions[i]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }
  };

  const lat = selected?.address.representasjonspunkt.lat ?? 65;
  const lon = selected?.address.representasjonspunkt.lon ?? 14;

  const coordText = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  const placeContext = selected?.address.poststed
    ? `${selected.address.poststed}, ${selected.address.kommunenavn}`
    : selected && selected.address.adressetekst !== coordText ? coordText : "";
  const CardWeatherIcon = selected?.weather ? weatherIcon(selected.weather.symbolCode) : null;

  return (
    <div className="flex flex-col" style={{ height: MAP_HEIGHT }}>
      {/* Search bar */}
      <div className="relative z-[1000] px-4 py-4 md:px-8 shrink-0 bg-background border-b">
        <div className="max-w-xl mx-auto relative flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 min-w-0 items-center gap-2 bg-background border rounded-xl px-4 py-3">
              {loadingSuggestions ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={handleInput}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                autoFocus={typeof window !== "undefined" && window.innerWidth >= 640}
                onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder="Adresse eller koordinater"
                className="flex-1 min-w-0 text-ellipsis bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring text-sm text-foreground placeholder:text-muted-foreground text-[16px] sm:text-sm"
              />
            </div>
            <Button onClick={() => locateFrom("searchbar")} disabled={locating} variant="secondary" size="icon" aria-label="Min posisjon" className="shadow-lg shrink-0 h-11 w-11 rounded-xl">
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            </Button>
            <Button onClick={() => setShowInfo(true)} variant="secondary" size="icon" aria-label="Om data" className="shadow-lg shrink-0 h-11 w-11 rounded-xl">
              <Info className="h-4 w-4" />
            </Button>
          </div>

          {showDropdown && suggestions.length > 0 && (
            <ul className="absolute top-full mt-1 left-0 right-0 bg-background rounded-xl shadow-xl border overflow-hidden">
              {suggestions.map((s, i) => (
                <li key={i}>
                  <button
                    onMouseDown={() => selectSuggestion(s)}
                    className={`w-full text-left px-4 py-3 text-sm flex items-start gap-3 transition-colors border-b last:border-0 ${highlightedIndex === i ? "bg-muted" : "hover:bg-muted"}`}
                  >
                    {s.isCoordinate ? (
                      <Crosshair className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium">{s.adressetekst}</p>
                      <p className="text-xs text-foreground/70">
                        {s.isCoordinate ? "Gå til koordinatene" : `${s.poststed}, ${s.kommunenavn}`}
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
      <div className="relative grow [&_.leaflet-grab]:cursor-pointer [&_.leaflet-dragging_.leaflet-grab]:cursor-grabbing">
        {locateError && (
          <div className="absolute bottom-20 sm:top-3 sm:bottom-auto left-1/2 -translate-x-1/2 z-[1000] bg-background/90 backdrop-blur-sm border rounded-full px-4 py-2 shadow-lg">
            <p className="text-sm text-muted-foreground">Kunne ikke finne posisjon, viser Oslo i stedet.</p>
          </div>
        )}
        <MapContainer
          center={[65, 14]}
          zoom={5}
          style={{ height: "100%", width: "100%" }}
          zoomControl={true}
        >
          <MapClickHandler onMapClick={handleMapClick} />
          <CameraController move={camera} />
          <ZoomTracker onZoom={(z) => { zoomRef.current = z; }} />
          <TileLayer
            key={tileLayer}
            url={TILE_LAYERS[tileLayer].url}
            attribution={TILE_LAYERS[tileLayer].attribution}
            maxZoom={17}
          />
          {selected && (
            <Marker position={[lat, lon]}>
              <Popup>
                <strong>{selected.address.adressetekst}</strong>
                {selected.address.poststed && (
                  <><br />{selected.address.poststed}, {selected.address.kommunenavn}</>
                )}
                {selected.elevation?.høyde != null && (
                  <><br /><span className="font-semibold">{selected.elevation.høyde.toFixed(1)} moh.</span></>
                )}
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Tile layer toggle */}
        <div className="absolute top-3 right-3 z-[999]">
          <TileToggle
            value={tileLayer}
            onChange={setTileLayer}
            options={[
              { value: "kart", label: "Kart", icon: <MapIcon className="h-3.5 w-3.5" /> },
              { value: "terreng", label: "Terreng", icon: <Mountain className="h-3.5 w-3.5" /> },
            ]}
          />
        </div>

        {/* Compact info card */}
        {selected && !showInfoSheet && (
          <div
            className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-96 z-[999] bg-card rounded-2xl shadow-xl px-4 py-4"
            style={{ border: "1.5px solid var(--border)" }}
          >
            <button
              onClick={() => setSelected(null)}
              className="absolute top-0 right-0 p-2.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Lukk"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Row 1 — name left, elevation right */}
            <div className="flex items-start justify-between gap-3 pr-6">
              <p className="min-w-0 text-xl font-extrabold leading-tight break-words" style={{ color: "var(--kv-blue)" }}>
                {selected.address.adressetekst}
              </p>
              <div className="shrink-0 text-right">
                {loadingElevation ? (
                  <Loader2 className="h-5 w-5 mt-0.5 animate-spin text-muted-foreground" aria-label="Henter høyde" />
                ) : selected.elevation?.høyde != null ? (
                  <p className="text-xl font-extrabold leading-tight whitespace-nowrap" style={{ color: "var(--kv-blue)" }}>
                    {selected.elevation.høyde.toFixed(1)}
                    <span className="text-sm font-medium text-muted-foreground"> moh.</span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground mt-0.5">Ingen høydedata</p>
                )}
              </div>
            </div>

            {/* Row 2 — place left, weather right */}
            <div className="flex items-center justify-between gap-3 mt-1 min-h-4">
              <p className="min-w-0 text-xs text-muted-foreground truncate">{placeContext}</p>
              {selected.weather && CardWeatherIcon && (
                <span className="shrink-0 flex items-center gap-1 text-xs text-foreground">
                  <CardWeatherIcon className="h-3.5 w-3.5" style={{ color: "var(--kv-blue)" }} />
                  {selected.weather.temperature.toFixed(1)}°C · {selected.weather.windSpeed.toFixed(1)} m/s
                </span>
              )}
            </div>

            {/* Action row */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setShowInfoSheet(true)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl text-white transition-colors hover:opacity-90"
                style={{ background: "var(--kv-blue)" }}
              >
                <ChevronUp className="h-3.5 w-3.5" /> Vis mer
              </button>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${selected.mapsCoords?.lat ?? selected.address.representasjonspunkt.lat},${selected.mapsCoords?.lon ?? selected.address.representasjonspunkt.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border bg-muted/50 hover:bg-muted transition-colors"
              >
                <Navigation className="h-3.5 w-3.5" /> Kjør hit
              </a>
              <button
                onClick={handleShare}
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border bg-muted/50 hover:bg-muted transition-colors"
              >
                {copied ? <><Check className="h-3.5 w-3.5" /> Kopiert</> : <><Share2 className="h-3.5 w-3.5" /> Del</>}
              </button>
            </div>
          </div>
        )}

        {/* Info detail sheet */}
        <Sheet open={showInfoSheet && !!selected} onOpenChange={(open) => { setShowInfoSheet(open); }}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[85svh] overflow-y-auto">
            {selected && (
              <div className="mx-auto w-full max-w-md px-4 pb-6">
                <SheetHeader>
                  <SheetTitle className="text-left sr-only">{selected.address.adressetekst}</SheetTitle>
                </SheetHeader>

                {/* Layer 1 — Identity */}
                <p className="font-bold text-lg leading-snug">{selected.address.adressetekst}</p>
                {selected.address.poststed && (
                  <p className="text-sm text-muted-foreground">
                    {selected.address.poststed}, {selected.address.kommunenavn}
                  </p>
                )}
                <p className="text-xs text-foreground/70 font-mono mt-0.5">
                  {selected.address.representasjonspunkt.lat.toFixed(5)}, {selected.address.representasjonspunkt.lon.toFixed(5)}
                </p>

                {/* Layer 2 — Elevation */}
                <div className="mt-4 pt-4 border-t">
                  {loadingElevation ? (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Henter høyde...
                    </div>
                  ) : selected.elevation?.høyde != null ? (
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold" style={{ color: "var(--kv-blue)" }}>
                        {selected.elevation.høyde.toFixed(1)}
                      </span>
                      <span className="text-sm font-medium text-muted-foreground">meter over havet</span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Ingen høydedata</p>
                  )}
                  {selected.elevation?.datakilde && (
                    <p className="text-xs text-foreground/70 mt-1">Kilde: {formatDatakilde(selected.elevation.datakilde)}</p>
                  )}
                </div>

                {/* Layer 3 — Weather */}
                {(loadingWeather || selected.weather) && (
                  <div className="mt-4 pt-4 border-t">
                    {loadingWeather ? (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Henter vær...
                      </div>
                    ) : selected.weather && (() => {
                      const WeatherIcon = weatherIcon(selected.weather.symbolCode);
                      const yrUrl = `https://www.yr.no/nb/søk?q=${encodeURIComponent(selected.yrSearchName || selected.address.adressetekst)}`;
                      return (
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <WeatherIcon className="h-9 w-9 shrink-0" style={{ color: "var(--kv-blue)" }} />
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                              <span className="text-xl font-extrabold" style={{ color: "var(--kv-blue)" }}>
                                {selected.weather.temperature.toFixed(1)}°C
                              </span>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Wind className="h-3.5 w-3.5" />
                                  {selected.weather.windSpeed.toFixed(1)} m/s
                                </span>
                                <span className="flex items-center gap-1">
                                  <Droplets className="h-3.5 w-3.5" />
                                  {selected.weather.precipitation.toFixed(1)} mm
                                </span>
                              </div>
                            </div>
                          </div>
                          <a
                            href={yrUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-foreground/70 hover:text-foreground transition-colors shrink-0"
                          >
                            yr.no <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Layer 4 — Links & source */}
                <div className="mt-4 pt-4 border-t flex flex-col gap-3">
                  <DriveLink
                    lat={selected.mapsCoords?.lat ?? selected.address.representasjonspunkt.lat}
                    lon={selected.mapsCoords?.lon ?? selected.address.representasjonspunkt.lon}
                  />
                  <p className="text-xs text-foreground/70 text-center">
                    Kilde: Kartverket, MET.no
                  </p>
                  <DataDisclaimer />
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Empty state: the most common search is "hvor høyt over havet er
            jeg nå", so the position lookup is the main call to action. */}
        {!selected && (
          <div className="absolute inset-x-3 bottom-6 flex justify-center pointer-events-none z-[998]">
            <div className="pointer-events-auto w-full max-w-sm bg-card/95 backdrop-blur-sm rounded-2xl border shadow-lg px-4 py-3">
              <button
                onClick={() => locateFrom("cta")}
                disabled={locating}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                style={{ background: "var(--kv-blue)" }}
              >
                {locating ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Finner posisjonen din...</>
                ) : (
                  <><LocateFixed className="h-4 w-4" /> Hvor høyt over havet er jeg?</>
                )}
              </button>
              <p className="mt-2 text-xs text-muted-foreground text-center text-balance">
                Nettleseren spør om du vil dele posisjonen. Du kan også søke eller klikke i kartet.
              </p>
            </div>
          </div>
        )}

      </div>

      {/* Info modal */}
      <InfoModal open={showInfo} onClose={() => setShowInfo(false)} title="Om høydekartet">
        <p>
          Søk etter en adresse, lim inn koordinater eller klikk i kartet for å se <span className="font-medium text-foreground">høyde over havet</span> for et punkt i Norge.
        </p>
        <p>
          <span className="font-medium text-foreground">Høydedata</span> hentes fra Kartverkets høyde-API og er basert på den nasjonale terrengmodellen (DTM). Der det finnes laserskannede data, er avviket typisk under én meter. Der terrengmodellen er grovere, kan avviket være noen meter.
        </p>
        <p>
          <span className="font-medium text-foreground">Værdata</span> hentes fra MET.no (Meteorologisk institutt) og viser gjeldende temperatur, vindstyrke og nedbør for det valgte punktet. Temperaturen er justert for høyden på punktet.
        </p>
        <p>
          Kartet bruker <span className="font-medium text-foreground">Kartverket</span> for bakgrunnskart og <span className="font-medium text-foreground">OpenTopoMap</span> for terrengvisning.
        </p>
        <div className="flex gap-3 mt-1">
          <a
            href="https://www.kartverket.no/api-og-data/hoydedata"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Kartverket
          </a>
          <a
            href="https://api.met.no/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            MET.no
          </a>
        </div>
      </InfoModal>
    </div>
  );
}
