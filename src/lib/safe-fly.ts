import type { FitBoundsOptions, LatLngBoundsExpression, Map as LeafletMap, ZoomPanOptions } from "leaflet";

// Leaflet's flyTo draws its zoom/pan curve in units of max(width, height) of
// the map container. On a 0×0 container that is a divide by zero, and the
// first animation frame — which runs synchronously inside flyTo — throws
// "Invalid LatLng object: (NaN, NaN)", taking the whole page down with it.
// flyToBounds ends up in the same code. A 0×0 map happens when the page
// loads in a hidden webview (e.g. a collapsed desktop-app browser pane):
// every deep link that flies on load crashed there.
//
// Leaflet also caches the container size and only re-reads it on window
// resize, via requestAnimationFrame, which never fires in a hidden document.
// So re-read it first, and jump instead of animating when the map has no
// area: there is nothing to watch, and the map is already in place when it
// becomes visible.

type CameraMap = Pick<LeafletMap, "invalidateSize" | "getSize" | "flyTo" | "setView" | "flyToBounds" | "fitBounds">;

function hasArea(map: CameraMap): boolean {
  map.invalidateSize();
  const { x, y } = map.getSize();
  return x > 0 && y > 0;
}

/** `map.flyTo` that can't crash the page: skips non-finite targets, jumps when the map has no area. */
export function safeFlyTo(map: CameraMap, lat: number, lon: number, zoom: number, options?: ZoomPanOptions) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(zoom)) return;
  if (hasArea(map)) map.flyTo([lat, lon], zoom, options);
  else map.setView([lat, lon], zoom, { animate: false });
}

/** `map.flyToBounds` that can't crash the page: fits without animating when the map has no area. */
export function safeFlyToBounds(map: CameraMap, bounds: LatLngBoundsExpression, options?: FitBoundsOptions) {
  if (hasArea(map)) map.flyToBounds(bounds, options);
  else map.fitBounds(bounds, { ...options, animate: false });
}
