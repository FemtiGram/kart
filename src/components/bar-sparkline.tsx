"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

export interface SparklinePoint {
  year: number | string;
  /** null renders as an empty slot with an "Ingen data" tooltip. */
  value: number | null;
}

interface BarSparklineProps {
  data: SparklinePoint[];
  color: string;
  /** Tooltip text for a value, e.g. "9.84 mill Sm³ o.e." */
  formatValue: (value: number) => string;
  /** Accessible name for the chart. */
  label: string;
  /** Bar drawn at full opacity while nothing is hovered. Defaults to the last point. */
  highlightYear?: number | string;
  dimOpacity?: number;
  /** Value at full height. Defaults to the series max; pass a shared max to put charts on one scale. */
  max?: number;
  /** Value at zero height. Raise it for series in a narrow band (e.g. 85–120) so the shape is legible. */
  baseline?: number;
  /** Height utility for the bar row, e.g. "h-10". */
  className?: string;
}

/**
 * Inline year-by-year bar chart. Hover (mouse), drag (touch) or arrow keys
 * reveal a tooltip with the exact value. The active bar is resolved from the
 * pointer's x position across the whole row, so the 2px gaps and very short
 * bars never drop the hover.
 */
export function BarSparkline({
  data,
  color,
  formatValue,
  label,
  highlightYear,
  dimOpacity = 0.4,
  max,
  baseline = 0,
  className = "h-10",
}: BarSparklineProps) {
  const [active, setActive] = useState<number | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const top = max ?? Math.max(...data.flatMap((d) => (d.value != null ? [d.value] : [])));
  const range = top - baseline || 1;
  const highlightIdx = highlightYear != null
    ? data.findIndex((d) => d.year === highlightYear)
    : data.length - 1;
  const shownIdx = active ?? highlightIdx;

  const indexAt = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - rect.left) / rect.width) * data.length);
    return Math.min(data.length - 1, Math.max(0, i));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = data.length - 1;
    let move: (cur: number) => number;
    if (e.key === "ArrowLeft") move = (cur) => Math.max(0, cur - 1);
    else if (e.key === "ArrowRight") move = (cur) => Math.min(last, cur + 1);
    else if (e.key === "Home") move = () => 0;
    else if (e.key === "End") move = () => last;
    else if (e.key === "Escape") { setActive(null); return; }
    else return;
    e.preventDefault();
    setActive((a) => move(a ?? highlightIdx));
  };

  // Center the tooltip over the active bar, clamped so it never spills past the
  // chart edges. Runs before paint, so there's no flash at left: 0.
  useLayoutEffect(() => {
    const row = rowRef.current;
    const tip = tipRef.current;
    if (!row || !tip || active == null) return;
    const center = ((active + 0.5) / data.length) * row.clientWidth;
    const maxLeft = row.clientWidth - tip.offsetWidth;
    tip.style.left = `${Math.min(Math.max(0, center - tip.offsetWidth / 2), maxLeft)}px`;
  }, [active, data.length]);

  const point = active != null ? data[active] : null;
  const pointText = point && (point.value != null ? formatValue(point.value) : "Ingen data");

  return (
    <div
      ref={rowRef}
      tabIndex={0}
      aria-label={`${label}. Bruk piltastene for å se enkeltår.`}
      className={cn(
        "relative flex items-end gap-[2px] rounded-sm outline-none touch-pan-y focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      onPointerDown={(e) => setActive(indexAt(e))}
      onPointerMove={(e) => setActive(indexAt(e))}
      // Touch fires pointerleave right after lifting the finger — keep the
      // tooltip until blur so the value stays readable after a tap.
      onPointerLeave={(e) => { if (e.pointerType === "mouse") setActive(null); }}
      onPointerCancel={() => setActive(null)}
      onFocus={() => setActive((a) => a ?? highlightIdx)}
      onBlur={() => setActive(null)}
      onKeyDown={onKeyDown}
    >
      {data.map((d, i) => (
        <div
          key={d.year}
          className="flex-1 rounded-sm min-w-[2px] transition-all"
          style={{
            height: d.value != null ? `${Math.max(4, ((d.value - baseline) / range) * 100)}%` : "0%",
            background: color,
            opacity: i === shownIdx ? 1 : dimOpacity,
          }}
        />
      ))}

      {point && (
        <div
          ref={tipRef}
          aria-hidden
          className="pointer-events-none absolute bottom-full mb-1.5 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md"
        >
          <span className="font-semibold">{point.year}</span> · {pointText}
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {point ? `${point.year}: ${pointText}` : ""}
      </span>
    </div>
  );
}
