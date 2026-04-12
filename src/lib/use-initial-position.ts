"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Reads `?lat=<n>&lon=<n>&z=<n>` query params once on mount and fires a
 * callback with the initial position. Used by maps to support deep linking
 * from /kommune/[slug] profile pages where we know the kommune centroid
 * but the destination map has no concept of "select a kommune".
 *
 * Usage:
 *
 *   useInitialPosition((lat, lon, zoom) => {
 *     setCenter({ lat, lon, zoom, _t: Date.now() });
 *   });
 */
export function useInitialPosition(
  onPosition: (lat: number, lon: number, zoom: number) => void
) {
  const params = useSearchParams();
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    const lat = parseFloat(params.get("lat") ?? "");
    const lon = parseFloat(params.get("lon") ?? "");
    const z = parseInt(params.get("z") ?? "", 10);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      onPosition(lat, lon, Number.isFinite(z) ? z : 10);
      applied.current = true;
    }
  }, [params, onPosition]);
}
