"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { Info, Pause, Play, X } from "lucide-react";
import { safeFlyTo } from "@/lib/safe-fly";
import { TYPE_META, OILGAS_COLOR } from "@/components/energy-map-helpers";
import type { EnergyPlant, OilGasFacility } from "@/components/energy-map-helpers";

// Playback runs at a constant pace so the visual density of each decade is
// honest: the post-war hydro boom looks busy because it was.
const YEARS_PER_SECOND = 6;
// Pop-in runs on wall-clock time, independent of playback speed.
const GROW_MS = 700;
const START_YEAR = 1900;
// The ripple ring is reserved for big plants so it marks the milestones.
const RIPPLE_MW = 200;

type Kind = "vann" | "vind" | "oilgas";

/** What a dot stands for, so a click can open it on the normal map. */
export type TimelineTarget =
  | { kind: "plant"; plant: EnergyPlant }
  | { kind: "oilgas"; facility: OilGasFacility };

interface Item {
  target: TimelineTarget;
  name: string;
  year: number;
  /** When during playback the dot appears: spread evenly across its year. */
  appearAt: number;
  lat: number;
  lon: number;
  mw: number;
  kind: Kind;
  radius: number;
  /** performance.now() when the dot appeared, null while hidden. */
  shownAt: number | null;
}

// On the main map wind and hydro are both blues; here they need to read
// apart at a glance, or the late wind build-out is lost in the hydro dots.
const KIND_COLOR: Record<Kind, string> = {
  vann: TYPE_META.vann.color,
  vind: "#c026d3",
  oilgas: OILGAS_COLOR,
};

const nb = (n: number) => Math.round(n).toLocaleString("nb-NO");

function radiusFor(kind: Kind, mw: number) {
  if (kind === "oilgas") return 3;
  return Math.min(16, 2.5 + Math.sqrt(mw) * 0.45);
}

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

// Dots shrink at country-wide zoom so the dense south doesn't merge into
// one blob on a phone: ~0.55× at zoom 3.5, full size from zoom 5.
function zoomFactor(zoom: number) {
  return Math.min(1, Math.max(0.55, 0.55 + (zoom - 3.5) * 0.3));
}

/** Leaflet's own helper for zoom-animated overlays; public on ImageOverlay's side, untyped here. */
type ZoomAnimMap = L.Map & { _latLngToNewLayerPoint(latlng: L.LatLng, zoom: number, center: L.LatLng): L.Point };

/**
 * One canvas over the map that repaints every visible dot each frame.
 * Leaflet's own canvas renderer only repaints around each changed marker,
 * which left slivers behind when hundreds were removed at once on scrub.
 */
class DotCanvas extends L.Layer {
  private canvas: HTMLCanvasElement | null = null;
  private zooming = false;
  constructor(private paint: (ctx: CanvasRenderingContext2D, map: L.Map) => void) {
    super();
  }
  onAdd(map: L.Map) {
    // Scaled along with the tiles during zoom (like Leaflet's own canvas
    // renderer) instead of hidden, so dots don't blink on every zoom.
    this.canvas = L.DomUtil.create("canvas", "leaflet-zoom-animated");
    this.canvas.style.pointerEvents = "none";
    map.getPanes().overlayPane.appendChild(this.canvas);
    map.on("move moveend resize viewreset", this.redraw, this);
    map.on("zoomanim", this.onZoomAnim, this);
    map.on("zoomend", this.onZoomEnd, this);
    this.redraw();
    return this;
  }
  onRemove(map: L.Map) {
    map.off("move moveend resize viewreset", this.redraw, this);
    map.off("zoomanim", this.onZoomAnim, this);
    map.off("zoomend", this.onZoomEnd, this);
    this.canvas?.remove();
    this.canvas = null;
    return this;
  }
  private onZoomAnim(e: L.ZoomAnimEvent) {
    const map = this._map as ZoomAnimMap;
    if (!map || !this.canvas) return;
    this.zooming = true;
    const scale = map.getZoomScale(e.zoom);
    const nw = map.containerPointToLatLng([0, 0]);
    L.DomUtil.setTransform(this.canvas, map._latLngToNewLayerPoint(nw, e.zoom, e.center), scale);
  }
  private onZoomEnd() {
    this.zooming = false;
    this.redraw();
  }
  redraw() {
    const map = this._map;
    const canvas = this.canvas;
    // Mid-zoom the canvas is a scaled snapshot; repainting would undo that.
    if (!map || !canvas || this.zooming) return;
    const size = map.getSize();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== size.x * dpr || canvas.height !== size.y * dpr) {
      canvas.width = size.x * dpr;
      canvas.height = size.y * dpr;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
    }
    // Pin the canvas to the viewport while the map pane pans underneath.
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);
    this.paint(ctx, map);
  }
}

/**
 * The animation lives outside React: one rAF loop drives playback and the
 * pop-in, and stops itself once nothing is playing or growing. React only
 * hears about whole-year changes and play/pause.
 */
class TimelineEngine {
  private items: Item[];
  private layer: DotCanvas;
  private t = START_YEAR;
  private playing = false;
  private raf = 0;
  private last = 0;

  constructor(
    private map: L.Map,
    records: Omit<Item, "shownAt" | "radius" | "appearAt">[],
    private endYear: number,
    private reducedMotion: boolean,
    private onYear: (year: number) => void,
    private onPlaying: (playing: boolean) => void,
    private onOpen: (target: TimelineTarget) => void,
  ) {
    // Spread each year's plants across the year so they trickle in instead
    // of landing together when the counter ticks over.
    const perYear = new Map<number, number>();
    for (const r of records) perYear.set(r.year, (perYear.get(r.year) ?? 0) + 1);
    const seen = new Map<number, number>();
    this.items = records.map((r) => {
      const k = seen.get(r.year) ?? 0;
      seen.set(r.year, k + 1);
      return { ...r, appearAt: r.year + k / (perYear.get(r.year) ?? 1), radius: radiusFor(r.kind, r.mw), shownAt: null };
    });
    this.layer = new DotCanvas((ctx, m) => this.paint(ctx, m)).addTo(map);
    map.on("click", this.onClick, this);
    map.on("mousemove", this.onHover, this);
    this.kick();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.map.off("click", this.onClick, this);
    this.map.off("mousemove", this.onHover, this);
    this.map.getContainer().style.cursor = "";
    this.map.closePopup();
    this.layer.remove();
  }

  /** Topmost visible dot under a container point (with a small touch slop). */
  private hit(pt: L.Point): Item | null {
    const f = zoomFactor(this.map.getZoom());
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.shownAt == null) continue;
      const p = this.map.latLngToContainerPoint([it.lat, it.lon]);
      if (p.distanceTo(pt) <= Math.max(1.75, it.radius * f) + 4) return it;
    }
    return null;
  }

  private onHover(e: L.LeafletMouseEvent) {
    this.map.getContainer().style.cursor = this.hit(e.containerPoint) ? "pointer" : "";
  }

  private onClick(e: L.LeafletMouseEvent) {
    const it = this.hit(e.containerPoint);
    if (!it) return;
    this.setPlaying(false);
    const el = L.DomUtil.create("div");
    const title = L.DomUtil.create("div", "font-bold text-sm leading-snug", el);
    title.textContent = it.name;
    const meta = L.DomUtil.create("div", "text-xs text-muted-foreground mt-0.5", el);
    meta.textContent = [
      it.kind === "oilgas" ? "Olje & gass" : TYPE_META[it.kind].label,
      `${it.kind === "oilgas" ? "oppstart" : "i drift fra"} ${it.year}`,
      it.mw > 0 ? `${nb(it.mw)} MW` : null,
    ].filter(Boolean).join(" · ");
    const btn = L.DomUtil.create("button", "mt-2 w-full rounded-lg px-3 py-1.5 text-xs font-semibold text-white", el);
    btn.style.background = "var(--kv-blue)";
    btn.textContent = "Åpne i kartet";
    btn.addEventListener("click", () => this.onOpen(it.target));
    L.popup({ closeButton: false, offset: [0, -it.radius] })
      .setLatLng([it.lat, it.lon])
      .setContent(el)
      .openOn(this.map);
  }

  toggle() {
    if (this.playing) return this.setPlaying(false);
    if (this.t >= this.endYear) this.t = START_YEAR;
    this.setPlaying(true);
    this.kick();
  }

  scrub(year: number) {
    this.setPlaying(false);
    // Land at the end of the chosen year so all its plants are shown.
    this.t = year + 0.999;
    this.kick();
  }

  private setPlaying(p: boolean) {
    this.playing = p;
    this.onPlaying(p);
  }

  private kick() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.playing) {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      const stop = this.endYear + 0.999;
      this.t = Math.min(stop, this.t + dt * YEARS_PER_SECOND);
      if (this.t >= stop) this.setPlaying(false);
    }
    this.last = now;
    let growing = false;
    for (const it of this.items) {
      const visible = this.t >= it.appearAt;
      if (visible && it.shownAt == null) it.shownAt = now;
      else if (!visible) it.shownAt = null;
      if (it.shownAt != null && now - it.shownAt < GROW_MS) growing = true;
    }
    this.onYear(Math.min(this.endYear, Math.floor(this.t)));
    this.layer.redraw();
    if (this.playing || (growing && !this.reducedMotion)) this.raf = requestAnimationFrame(this.frame);
  };

  private paint(ctx: CanvasRenderingContext2D, m: L.Map) {
    const now = performance.now();
    const size = m.getSize();
    const f = zoomFactor(m.getZoom());
    for (const it of this.items) {
      if (it.shownAt == null) continue;
      const pt = m.latLngToContainerPoint([it.lat, it.lon]);
      const r = Math.max(1.75, it.radius * f);
      const pad = r * 3;
      if (pt.x < -pad || pt.y < -pad || pt.x > size.x + pad || pt.y > size.y + pad) continue;
      const p = this.reducedMotion ? 1 : Math.min(1, (now - it.shownAt) / GROW_MS);
      const e = easeOutCubic(p);
      const fade = Math.min(1, p * 2);
      const color = KIND_COLOR[it.kind];
      if (p < 1 && it.mw >= RIPPLE_MW) {
        ctx.globalAlpha = (1 - p) * 0.5;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r * (1 + e * 1.6), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(0.5, r * e), 0, Math.PI * 2);
      ctx.globalAlpha = fade * 0.8;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = fade;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = it.kind === "oilgas" ? 0.5 : 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

interface Props {
  map: L.Map | null;
  plants: EnergyPlant[];
  oilGas: OilGasFacility[];
  onClose: () => void;
  onOpen: (target: TimelineTarget) => void;
}

export function EnergyTimeline({ map, plants, oilGas, onClose, onOpen }: Props) {
  const endYear = useMemo(() => new Date().getFullYear(), []);
  const reducedMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  // Plants without a year can't be placed on the timeline. Wind is limited to
  // plants in operation — approved/rejected projects never got a start year.
  const records = useMemo(() => {
    const out: Omit<Item, "shownAt" | "radius" | "appearAt">[] = [];
    for (const p of plants) {
      if (p.yearBuilt == null || p.yearBuilt < START_YEAR || p.yearBuilt > endYear) continue;
      if (p.type !== "vann" && p.type !== "vind") continue;
      if (p.type === "vind" && p.windStatus !== "operational") continue;
      out.push({ target: { kind: "plant", plant: p }, name: p.name, year: p.yearBuilt, lat: p.lat, lon: p.lon, mw: p.capacityMW ?? 0, kind: p.type });
    }
    for (const f of oilGas) {
      if (f.yearStartup == null || f.yearStartup < START_YEAR || f.yearStartup > endYear) continue;
      out.push({ target: { kind: "oilgas", facility: f }, name: f.name, year: f.yearStartup, lat: f.lat, lon: f.lon, mw: 0, kind: "oilgas" });
    }
    // Sorted by year, small before big, so large plants paint on top.
    return out.sort((a, b) => a.year - b.year || a.mw - b.mw);
  }, [plants, oilGas, endYear]);

  // Cumulative totals per year, for the counter and the area chart.
  const series = useMemo(() => {
    const n = endYear - START_YEAR + 1;
    const vannMW = new Array<number>(n).fill(0);
    const vindMW = new Array<number>(n).fill(0);
    const count = { vann: new Array<number>(n).fill(0), vind: new Array<number>(n).fill(0), oilgas: new Array<number>(n).fill(0) };
    for (const r of records) {
      const i = r.year - START_YEAR;
      if (r.kind === "vann") vannMW[i] += r.mw;
      if (r.kind === "vind") vindMW[i] += r.mw;
      count[r.kind][i] += 1;
    }
    for (let i = 1; i < n; i++) {
      vannMW[i] += vannMW[i - 1];
      vindMW[i] += vindMW[i - 1];
      count.vann[i] += count.vann[i - 1];
      count.vind[i] += count.vind[i - 1];
      count.oilgas[i] += count.oilgas[i - 1];
    }
    return { vannMW, vindMW, count };
  }, [records, endYear]);

  const engineRef = useRef<TimelineEngine | null>(null);
  const onOpenRef = useRef(onOpen);
  useEffect(() => { onOpenRef.current = onOpen; }, [onOpen]);
  const [year, setYear] = useState(START_YEAR);
  const [playing, setPlaying] = useState(false);
  const [showNote, setShowNote] = useState(false);

  useEffect(() => {
    if (!map) return;
    const engine = new TimelineEngine(map, records, endYear, reducedMotion, setYear, setPlaying, (t) => onOpenRef.current(t));
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [map, records, endYear, reducedMotion]);

  // Frame mainland Norway plus the North Sea fields beside (desktop) or
  // above (mobile) the panel. Whole zoom levels are either too tight or
  // too loose for that, so allow quarter steps while the timeline is open.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!map) return;
    const prevSnap = map.options.zoomSnap;
    L.Util.setOptions(map, { zoomSnap: 0.25 });
    // The page hides its search header on mobile while the timeline is open,
    // so the map just grew; Leaflet only notices window resizes by itself.
    map.invalidateSize();
    const panel = panelRef.current;
    const wide = map.getSize().x >= 640;
    const padTL = L.point(wide ? (panel?.offsetWidth ?? 0) + 32 : 16, 48);
    const padBR = L.point(16, wide ? 16 : (panel?.offsetHeight ?? 0) + 24);
    const bounds = L.latLngBounds([57.8, 2], [71.2, 31]);
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
  }, [map]);

  const togglePlay = () => engineRef.current?.toggle();
  const scrub = (value: number) => engineRef.current?.scrub(value);

  const i = year - START_YEAR;
  const totalMW = series.vannMW[i] + series.vindMW[i];

  return (
    <div
      ref={panelRef}
      className="absolute bottom-3 left-3 right-3 sm:bottom-4 sm:right-auto sm:left-4 sm:w-[26rem] z-[999] bg-card rounded-2xl shadow-xl px-4 py-3 sm:py-4"
      style={{ border: "1.5px solid var(--border)" }}
      role="region"
      aria-label="Tidslinje for energiutbygging"
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
          onClick={togglePlay}
          className="h-10 w-10 sm:h-11 sm:w-11 shrink-0 rounded-full text-white flex items-center justify-center shadow-md hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{ background: "var(--kv-blue)" }}
          aria-label={playing ? "Pause" : "Spill av"}
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
        </button>
        <span
          className="text-2xl sm:text-3xl font-extrabold tabular-nums leading-none"
          style={{ color: "var(--kv-blue)" }}
          aria-live="off"
        >
          {year}
        </span>
        <div className="ml-auto text-right">
          <p className="text-lg sm:text-xl font-extrabold tabular-nums leading-none whitespace-nowrap" style={{ color: "var(--kv-blue)" }}>
            {nb(totalMW)} <span className="text-xs font-semibold text-muted-foreground">MW</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1 whitespace-nowrap">
            <span className="sm:hidden">installert</span>
            <span className="hidden sm:inline">vann + vind installert</span>
          </p>
        </div>
      </div>

      {/* On mobile the chart sits right under the slider thumb, doubling as
          the scrub track instead of taking a row of its own. */}
      <AreaChart series={series} year={year} endYear={endYear} className="h-8 mt-2 sm:h-12 sm:mt-3" />

      <input
        type="range"
        min={START_YEAR}
        max={endYear}
        step={1}
        value={year}
        onChange={(e) => scrub(Number(e.target.value))}
        className="relative block w-full -mt-2 sm:mt-1 cursor-pointer"
        style={{ accentColor: "var(--kv-blue)" }}
        aria-label="Velg år"
        aria-valuetext={`${year}: ${nb(totalMW)} MW installert`}
      />
      <div className="hidden sm:flex justify-between text-xs text-muted-foreground tabular-nums -mt-0.5">
        <span>{START_YEAR}</span>
        <span>{endYear}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1 mt-2 sm:mt-3 text-xs">
        {(["vann", "vind", "oilgas"] as Kind[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOR[k] }} />
            <span className="text-foreground">{TYPE_META[k].label}</span>
            <span className="text-muted-foreground tabular-nums">{nb(series.count[k][i])}</span>
          </span>
        ))}
        <button
          onClick={() => setShowNote((v) => !v)}
          className="sm:hidden ml-auto -my-2 -mr-2 p-2 rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Om tallene"
          aria-expanded={showNote}
        >
          <Info className="h-4 w-4" />
        </button>
      </div>
      <p className={`${showNote ? "block" : "hidden"} sm:block text-xs text-muted-foreground mt-2`}>
        Årstall er første driftsår. Effekt er dagens installerte effekt, så senere oppgraderinger telles fra start.
      </p>
    </div>
  );
}

function AreaChart({
  series,
  year,
  endYear,
  className,
}: {
  series: { vannMW: number[]; vindMW: number[] };
  year: number;
  endYear: number;
  className?: string;
}) {
  const W = 300;
  const H = 48;
  const n = endYear - START_YEAR + 1;
  const max = series.vannMW[n - 1] + series.vindMW[n - 1] || 1;
  const x = (idx: number) => (idx / (n - 1)) * W;
  const y = (v: number) => H - (v / max) * H;

  const { vannPath, vindPath } = useMemo(() => {
    let vann = `M0,${H}`;
    let vindTop = "";
    let vindBottom = "";
    for (let k = 0; k < n; k++) {
      vann += ` L${x(k)},${y(series.vannMW[k])}`;
      vindTop += ` L${x(k)},${y(series.vannMW[k] + series.vindMW[k])}`;
    }
    for (let k = n - 1; k >= 0; k--) vindBottom += ` L${x(k)},${y(series.vannMW[k])}`;
    return {
      vannPath: `${vann} L${W},${H} Z`,
      vindPath: `M0,${H}${vindTop}${vindBottom} Z`,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, n, max]);

  const cursor = x(year - START_YEAR);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`block w-full ${className ?? ""}`} aria-hidden="true">
      <defs>
        <clipPath id="timeline-progress">
          <rect x={0} y={0} width={cursor} height={H} />
        </clipPath>
      </defs>
      <g opacity={0.15}>
        <path d={vannPath} fill={KIND_COLOR.vann} />
        <path d={vindPath} fill={KIND_COLOR.vind} />
      </g>
      <g clipPath="url(#timeline-progress)">
        <path d={vannPath} fill={KIND_COLOR.vann} />
        <path d={vindPath} fill={KIND_COLOR.vind} />
      </g>
      <line x1={cursor} x2={cursor} y1={0} y2={H} stroke="var(--kv-blue)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
