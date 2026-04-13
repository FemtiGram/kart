"use client";

import { CircleMarker } from "react-leaflet";

/**
 * A brand-blue ring rendered at a lat/lon to indicate the currently-
 * selected marker. Designed to sit in the overlayPane (SVG) BENEATH the
 * markerPane so the actual marker icon stays on top. `interactive={false}`
 * ensures clicks pass through to the underlying marker.
 *
 * This is the "selection indicator" for all marker-based maps — rendered
 * as a single extra element outside the memoized marker list so clicks
 * update only this one node without invalidating the heavy marker tree.
 */
export function SelectedHalo({
  lat,
  lon,
  radius = 22,
}: {
  lat: number;
  lon: number;
  radius?: number;
}) {
  return (
    <CircleMarker
      center={[lat, lon]}
      radius={radius}
      pathOptions={{
        color: "#24374c",
        weight: 3,
        fillColor: "#24374c",
        fillOpacity: 0.15,
      }}
      interactive={false}
    />
  );
}
