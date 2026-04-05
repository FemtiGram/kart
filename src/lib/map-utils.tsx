"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

// ─── Shared types ────────────────────────────────────────────

export interface Address {
  adressetekst: string;
  poststed: string;
  kommunenavn: string;
  representasjonspunkt: { lat: number; lon: number };
}

export interface KommuneEntry {
  kommunenummer: string;
  kommunenavn: string;
}

export type Suggestion =
  | { type: "fylke"; fylkesnavn: string; lat: number; lon: number; zoom: number }
  | { type: "kommune"; kommunenummer: string; kommunenavn: string }
  | { type: "adresse"; addr: Address };

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

// ─── Dev feature flag ───────────────────────────────────────

/** Check window.__MAPGRAM_DEV for runtime console toggle */
export function isDevMode(): boolean {
  if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).__MAPGRAM_DEV) return true;
  return process.env.NEXT_PUBLIC_DEV === "true";
}
