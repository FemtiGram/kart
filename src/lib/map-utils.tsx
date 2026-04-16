"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useMap } from "react-leaflet";

// ─── Shared constants ───────────────────────────────────────

/** Standard map container height — viewport minus navbar (57px) and footer (56px). */
export const MAP_HEIGHT = "calc(100svh - 57px - 56px)";

/** Kartverket tile URLs and attribution — single source of truth for all maps. */
export const KV_ATTRIBUTION = '&copy; <a href="https://www.kartverket.no/">Kartverket</a>';
export const TILE_URL_KART = "https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png";
export const TILE_URL_GRAATONE = "https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png";

/** Standard Kart/Gråtone tile layers used by most maps. */
export const TILE_LAYERS = {
  kart: { label: "Kart", url: TILE_URL_KART, attribution: KV_ATTRIBUTION },
  gråtone: { label: "Gråtone", url: TILE_URL_GRAATONE, attribution: KV_ATTRIBUTION },
} as const;

export type TileLayerKey = keyof typeof TILE_LAYERS;

// ─── Shared types ────────────────────────────────────────────

export interface Address {
  adressetekst: string;
  poststed: string;
  kommunenavn: string;
  kommunenummer?: string;
  representasjonspunkt: { lat: number; lon: number };
}

export interface KommuneEntry {
  kommunenummer: string;
  kommunenavn: string;
}

export type Suggestion =
  | { type: "fylke"; fylkesnavn: string; lat: number; lon: number; zoom: number }
  | { type: "kommune"; kommunenummer: string; kommunenavn: string }
  | { type: "adresse"; addr: Address }
  | { type: "anlegg"; name: string; subtitle: string; lat: number; lon: number };

// ─── Shared map state hook ──────────────────────────────────

/**
 * Consolidates the loading / error / tileLayer state every map declares.
 * Elevation map is the only exception (granular per-action loading).
 */
export function useMapCore(defaultTile: TileLayerKey = "gråtone") {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tileLayer, setTileLayer] = useState<TileLayerKey>(defaultTile);
  return { loading, setLoading, error, setError, tileLayer, setTileLayer } as const;
}

// ─── Geolocation hook ───────────────────────────────────────

/**
 * Encapsulates navigator.geolocation with locating/error state + auto-dismiss.
 * Callers provide onSuccess(lat, lon) and optional onError() for map-specific
 * behavior (zoom levels, fallback locations, isInNorway checks).
 */
export function useGeolocation(
  onSuccess: (lat: number, lon: number) => void,
  onError?: () => void,
) {
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(false);

  const locate = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    setLocateError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onSuccess(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setLocating(false);
        setLocateError(true);
        setTimeout(() => setLocateError(false), 4000);
        onError?.();
      },
      { timeout: 15000, maximumAge: 60000 },
    );
  }, [onSuccess, onError]);

  return { locating, locateError, locate } as const;
}

// ─── Comparison (Sammenlign) hook ───────────────────────────

/**
 * State machine for the "Sammenlign" comparison flow shared by
 * bolig, income and kostnader maps.
 *
 * Generic over T — the shape of the "selected kommune" — so each
 * map can use its own domain type.
 *
 * @param selected       current primary selection from the parent
 * @param getId          extracts the unique id (kommunenummer/knr) from T
 * @param getFeatures    getter returning the GeoJSON features array for search filtering
 * @param hasData        predicate — does this kommunenummer have comparison-worthy data?
 */
export function useCompare<T>(
  selected: T | null,
  getId: (item: T) => string,
  getFeatures: () => { properties: { kommunenummer: string; navn: string } }[],
  hasData: (knr: string) => boolean,
) {
  const [compareMode, setCompareMode] = useState(false);
  const [compareQuery, setCompareQuery] = useState("");
  const [compareHighlight, setCompareHighlight] = useState(-1);
  const [compareTarget, setCompareTarget] = useState<T | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  // Refs so GeoJSON click closures always see the latest values.
  const compareModeRef = useRef(false);
  const selectedRef = useRef<T | null>(null);
  useEffect(() => { compareModeRef.current = compareMode; }, [compareMode]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  /** Filtered kommune list for the inline comparison search. */
  const compareResults = useMemo(() => {
    if (!compareMode || compareQuery.length < 1) return [];
    const q = compareQuery.toLowerCase();
    const selId = selected ? getId(selected) : null;
    return getFeatures()
      .filter(
        (f) =>
          f.properties.navn.toLowerCase().includes(q) &&
          f.properties.kommunenummer !== selId &&
          hasData(f.properties.kommunenummer),
      )
      .slice(0, 6);
  }, [compareMode, compareQuery, selected, getId, getFeatures, hasData]);

  /** Call from the "Sammenlign" button. */
  const activateCompare = useCallback(() => setCompareMode(true), []);

  /** Call when the user picks kommune B (search or map click). */
  const selectTarget = useCallback((target: T) => {
    setCompareTarget(target);
    setShowCompare(true);
    setCompareMode(false);
    setCompareQuery("");
    setCompareHighlight(-1);
  }, []);

  /** Call from the "Avbryt" button or Escape. */
  const cancelCompare = useCallback(() => {
    setCompareMode(false);
    setCompareQuery("");
    setCompareHighlight(-1);
  }, []);

  /** Call inside the parent's clearSelection. */
  const resetCompare = useCallback(() => {
    setCompareMode(false);
    setCompareQuery("");
    setCompareHighlight(-1);
    setCompareTarget(null);
    setShowCompare(false);
  }, []);

  /** Call from the comparison Sheet's onOpenChange(false). */
  const closeCompareSheet = useCallback(() => {
    setShowCompare(false);
    setCompareTarget(null);
  }, []);

  /**
   * Call inside a GeoJSON click handler (or marker click) to check
   * whether we're in compare mode and handle the B-pick.
   * Returns true if the click was consumed (caller should `return`).
   */
  const handleCompareClick = useCallback(
    (knr: string, buildTarget: () => T): boolean => {
      if (
        !compareModeRef.current ||
        !selectedRef.current ||
        getId(selectedRef.current) === knr ||
        !hasData(knr)
      )
        return false;
      selectTarget(buildTarget());
      return true;
    },
    [getId, hasData, selectTarget],
  );

  return {
    compareMode,
    compareQuery,
    setCompareQuery,
    compareHighlight,
    setCompareHighlight,
    compareTarget,
    showCompare,
    compareResults,
    compareModeRef,
    selectedRef,
    activateCompare,
    selectTarget,
    cancelCompare,
    resetCompare,
    closeCompareSheet,
    handleCompareClick,
  } as const;
}

// ─── FlyTo map component ────────────────────────────────────

export function FlyTo({ lat, lon, zoom = 10, _t }: { lat: number; lon: number; zoom?: number; _t?: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], zoom, { duration: 1.2 });
  }, [lat, lon, zoom, _t, map]);
  return null;
}

// ─── Color interpolation (choropleth) ───────────────────────

/** Red → Yellow → Green 3-stop diverging scale (t: 0–1) */
export function interpolateColor(t: number): string {
  if (t <= 0.5) {
    const s = t * 2;
    const r = Math.round(239 + s * (250 - 239));
    const g = Math.round(68 + s * (204 - 68));
    const b = Math.round(68 + s * (21 - 68));
    return `rgb(${r},${g},${b})`;
  }
  const s = (t - 0.5) * 2;
  const r = Math.round(250 - s * (250 - 22));
  const g = Math.round(204 - s * (204 - 163));
  const b = Math.round(21 + s * (74 - 21));
  return `rgb(${r},${g},${b})`;
}

// ─── Debounce cleanup hook ──────────────────────────────────

/** Returns a ref for debounce timers that auto-cleans on unmount */
export function useDebounceRef() {
  const ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (ref.current) clearTimeout(ref.current);
    };
  }, []);
  return ref;
}

// ─── Search abort ref ───────────────────────────────────────

/** Returns a ref holding an AbortController; aborts previous on each call to .renew() */
export function useSearchAbort() {
  const ref = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => { ref.current?.abort(); };
  }, []);
  return {
    get signal() {
      return ref.current?.signal;
    },
    renew() {
      ref.current?.abort();
      ref.current = new AbortController();
      return ref.current.signal;
    },
  };
}

// ─── Animated count ────────────────────────────────────────

export function AnimatedCount({ target, duration = 600 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) return;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setCount(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return <>{count.toLocaleString("nb-NO")}</>;
}

// ─── Error toast ────────────────────────────────────────────

export function MapError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="absolute bottom-20 sm:top-3 sm:bottom-auto left-1/2 -translate-x-1/2 z-[1000] w-[calc(100%-2rem)] max-w-sm">
      <div className="bg-red-700 rounded-2xl px-5 py-4 shadow-xl">
        <p className="text-sm font-semibold text-white">{message}</p>
        <button
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-white bg-white/20 hover:bg-white/30 transition-colors rounded-xl px-4 py-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
          Prøv igjen
        </button>
      </div>
    </div>
  );
}

// ─── Disclaimer ─────────────────────────────────────────────

export function DataDisclaimer() {
  return (
    <p className="text-[10px] text-foreground/70 text-center mt-2">
      Data kan inneholde feil og bør ikke brukes som eneste kilde for beslutninger.
    </p>
  );
}

// ─── Dev feature flag ───────────────────────────────────────

/** Check window.__MAPGRAM_DEV for runtime console toggle */
export function isDevMode(): boolean {
  if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).__MAPGRAM_DEV) return true;
  return process.env.NEXT_PUBLIC_DEV === "true";
}
