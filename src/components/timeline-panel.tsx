"use client";

import { useEffect, useRef, type ReactNode } from "react";
import L from "leaflet";
import { Pause, Play, X } from "lucide-react";
import { safeFlyTo } from "@/lib/safe-fly";

/** Mainland Norway plus the North Sea fields. */
export const NORWAY_BOUNDS = L.latLngBounds([57.8, 2], [71.2, 31]);

/**
 * Frame `bounds` beside the panel (desktop) or above it (mobile). Whole
 * zoom levels are either too tight or too loose for that, so quarter steps
 * are allowed for the opening flight only.
 */
function useFrameAroundPanel(map: L.Map | null, bounds: L.LatLngBounds, panelRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!map) return;
    const prevSnap = map.options.zoomSnap;
    L.Util.setOptions(map, { zoomSnap: 0.25 });
    // Pages hide their search header on mobile while a timeline is open, so
    // the map just grew; Leaflet only notices window resizes by itself.
    map.invalidateSize();
    const panel = panelRef.current;
    const wide = map.getSize().x >= 640;
    // Hiding that header while the page is scrolled even slightly makes
    // Chrome's scroll anchoring push the map's top out of view. The map sits
    // at the top of every timeline page, so start from there.
    if (!wide && window.scrollY > 0) window.scrollTo({ top: 0 });
    const padTL = L.point(wide ? (panel?.offsetWidth ?? 0) + 32 : 16, 48);
    const padBR = L.point(16, wide ? 16 : (panel?.offsetHeight ?? 0) + 24);
    const zoom = Math.max(3, map.getBoundsZoom(bounds, false, padTL.add(padBR)));
    // Shift the centre so the bounds sit in the unpadded part of the map.
    const offset = padTL.subtract(padBR).divideBy(2);
    const centerPx = map.project(bounds.getCenter(), zoom).subtract(offset);
    const center = map.unproject(centerPx, zoom);
    // Restore whole-level snapping once the flight lands, or every wheel
    // notch afterwards only zooms a quarter step.
    const restore = () => L.Util.setOptions(map, { zoomSnap: prevSnap });
    map.once("moveend", restore);
    safeFlyTo(map, center.lat, center.lng, zoom, { duration: 0.8 });
    return () => { map.off("moveend", restore); restore(); };
  }, [map, bounds, panelRef]);
}

interface Props {
  map: L.Map | null;
  bounds?: L.LatLngBounds;
  /** Accessible name for the panel region. */
  label: string;
  year: number | string;
  playing: boolean;
  onTogglePlay: () => void;
  onClose: () => void;
  /** Right-hand side of the header row (the headline number). */
  aside?: ReactNode;
  children: ReactNode;
}

/**
 * Shared chrome for map timelines (/energikart, /valg): floating panel with
 * close button, play/pause and the big year, framed so the map content sits
 * beside it on desktop and above it on mobile.
 */
export function TimelinePanel({ map, bounds = NORWAY_BOUNDS, label, year, playing, onTogglePlay, onClose, aside, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFrameAroundPanel(map, bounds, panelRef);

  return (
    <div
      ref={panelRef}
      className="absolute bottom-3 left-3 right-3 sm:bottom-4 sm:right-auto sm:left-4 sm:w-[26rem] z-[999] bg-card rounded-2xl shadow-xl px-4 py-3 sm:py-4"
      style={{ border: "1.5px solid var(--border)" }}
      role="region"
      aria-label={label}
    >
      <button
        onClick={onClose}
        className="absolute top-2 right-2 p-2.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Lukk tidslinje"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-3 pr-8">
        <button
          onClick={onTogglePlay}
          className="h-10 w-10 sm:h-11 sm:w-11 shrink-0 rounded-full text-white flex items-center justify-center shadow-md hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{ background: "var(--kv-blue)" }}
          aria-label={playing ? "Pause" : "Spill av"}
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
        </button>
        <span className="text-2xl sm:text-3xl font-extrabold tabular-nums leading-none" style={{ color: "var(--kv-blue)" }}>
          {year}
        </span>
        {aside && <div className="ml-auto text-right">{aside}</div>}
      </div>

      {children}
    </div>
  );
}
