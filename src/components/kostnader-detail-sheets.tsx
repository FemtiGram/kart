"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowLeftRight,
  Droplets,
  Droplet,
  Trash2,
  Flame,
  Wallet,
} from "lucide-react";
import { kommuneSlug } from "@/lib/kommune-slug";
import { SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataDisclaimer, interpolateColor } from "@/lib/map-utils";
import type {
  Selected,
  KostnaderData,
  KostnaderKommuneEntry,
} from "@/components/kostnader-map-helpers";
import {
  getFylke,
  computeRank,
} from "@/components/kostnader-map-helpers";

// ─── Detail sheet body ──────────────────────────────────────

export function DetailSheetBody({
  selected,
  kostnader,
  topRef,
}: {
  selected: Selected;
  kostnader: KostnaderData;
  topRef: React.RefObject<HTMLDivElement | null>;
}) {
  const entry = kostnader.kommuner[selected.knr];
  if (!entry) {
    return (
      <div
        ref={topRef}
        tabIndex={-1}
        className="mx-auto w-full max-w-md px-4 pb-6 outline-none"
      >
        <SheetHeader>
          <SheetTitle className="text-left">{selected.name}</SheetTitle>
        </SheetHeader>
        <p className="text-sm text-muted-foreground mt-3">
          Ingen kostnadsdata i SSB for denne kommunen.
        </p>
      </div>
    );
  }

  const fylke = getFylke(selected.knr);
  const gebyrRank = computeRank(kostnader, "gebyrerTotal", selected.knr, false);
  const eskattRank =
    entry.latest.eiendomsskatt120m2 != null
      ? computeRank(kostnader, "eiendomsskatt120m2", selected.knr, false)
      : null;

  return (
    <div
      ref={topRef}
      tabIndex={-1}
      className="mx-auto w-full max-w-md px-4 pb-6 outline-none"
    >
      <SheetHeader>
        <SheetTitle className="text-left sr-only">{selected.name}</SheetTitle>
      </SheetHeader>

      {/* Identity */}
      <p className="font-bold text-xl leading-snug">{selected.name}</p>
      <p className="text-sm text-muted-foreground">
        {fylke ? `${fylke} · ` : ""}SSB KOSTRA
      </p>

      {/* Primary stats — two cards */}
      <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-3">
        <PrimaryStat
          label="Årsgebyr"
          value={entry.latest.gebyrerTotal}
          valueFormatter={(v) =>
            `${v.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}\u00a0kr`
          }
          rank={gebyrRank}
        />
        {entry.hasEiendomsskatt === false ? (
          <div className="rounded-xl border bg-card px-3 py-2.5">
            <p
              className="text-xl font-extrabold leading-none whitespace-nowrap"
              style={{ color: "var(--kv-positive-dark)" }}
            >
              Ingen
            </p>
            <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Eiendomsskatt
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Ikke innført
            </p>
          </div>
        ) : (
          <PrimaryStat
            label="Eiendomsskatt"
            value={entry.latest.eiendomsskatt120m2}
            valueFormatter={(v) =>
              `${v.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}\u00a0kr`
            }
            rank={eskattRank ?? undefined}
            fallback={
              entry.latest.eiendomsskattPromille != null
                ? `${entry.latest.eiendomsskattPromille.toLocaleString("nb-NO", { maximumFractionDigits: 1 })}\u00a0‰`
                : undefined
            }
            fallbackLabel="Kun promille rapportert"
          />
        )}
      </div>

      {/* Gebyr breakdown — the four fees that make up the total */}
      {entry.gebyrer && (
        <div className="mt-4 pt-4 border-t">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70 mb-2">
            Fordeling av årsgebyr ({entry.gebyrer.year})
          </p>
          <div className="rounded-2xl border bg-card overflow-hidden">
            <GebyrRow
              icon={Droplet}
              label="Vann"
              value={entry.gebyrer.vann}
              first
            />
            <GebyrRow icon={Droplets} label="Avløp" value={entry.gebyrer.avlop} />
            <GebyrRow icon={Trash2} label="Avfall" value={entry.gebyrer.avfall} />
            <GebyrRow icon={Flame} label="Feiing" value={entry.gebyrer.feiing} />
          </div>
          <p className="mt-2 text-[11px] text-foreground/70">
            Tall i kr/år eksklusiv mva. Totalt for en typisk husholdning.
          </p>
        </div>
      )}

      {/* Stedsprofil link */}
      <div className="mt-4 pt-4 border-t">
        <Link
          href={`/kommune/${kommuneSlug(selected.knr, selected.name)}`}
          className="flex items-center justify-between rounded-xl border bg-muted/40 hover:bg-muted px-4 py-3 transition-colors"
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--kv-blue)" }}>
              Se full stedsprofil
            </p>
            <p className="text-xs text-foreground/70 mt-0.5">
              Boligpriser, skoler, natur og mer
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-foreground/70 shrink-0" />
        </Link>
      </div>

      {/* Sources */}
      <div className="mt-4 pt-4 border-t">
        <p className="text-xs text-foreground/70 text-center">
          Kilde:{" "}
          <a
            href="https://www.ssb.no/statbank/table/12842"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            SSB 12842
          </a>
          {" "}({kostnader.gebyrerYear}) og{" "}
          <a
            href="https://www.ssb.no/statbank/table/14674"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            SSB 14674
          </a>
          {" "}({kostnader.eiendomsskattYear})
        </p>
        <DataDisclaimer />
      </div>
    </div>
  );
}

// ─── Primary stat card (inside detail sheet) ────────────────

function PrimaryStat({
  label,
  value,
  valueFormatter,
  rank,
  fallback,
  fallbackLabel,
}: {
  label: string;
  value: number | undefined;
  valueFormatter: (v: number) => string;
  rank?: { rank: number; total: number };
  fallback?: string;
  fallbackLabel?: string;
}) {
  // Lower-is-better: top quartile = green, bottom quartile = red.
  const q = rank && rank.total > 0 ? rank.rank / rank.total : 0.5;
  const color =
    value == null
      ? "var(--kv-muted-fill)"
      : q <= 0.25
        ? "var(--kv-positive)"
        : q >= 0.75
          ? "var(--kv-negative)"
          : "var(--kv-blue)";
  const displayValue =
    value != null ? valueFormatter(value) : fallback ?? "–";
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <p
        className="text-xl font-extrabold tabular-nums leading-none whitespace-nowrap"
        style={{ color: value != null ? color : "var(--kv-blue)" }}
      >
        {displayValue}
      </p>
      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {value != null && rank ? (
        <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
          #{rank.rank}/{rank.total}
        </p>
      ) : value == null && fallbackLabel ? (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{fallbackLabel}</p>
      ) : null}
    </div>
  );
}

// ─── Compare sheet body ─────────────────────────────────────

export function CompareSheetBody({
  a,
  b,
  kostnader,
}: {
  a: Selected;
  b: Selected;
  kostnader: KostnaderData;
}) {
  const entryA = kostnader.kommuner[a.knr];
  const entryB = kostnader.kommuner[b.knr];

  // Combined annual: gebyr total (always present for the set we compare)
  // plus the 120 m² eiendomsskatt (0 if "Ingen"; null if truly unknown).
  function combined(entry: KostnaderKommuneEntry | undefined): number | null {
    if (!entry) return null;
    const g = entry.latest.gebyrerTotal ?? null;
    if (g == null) return null;
    if (entry.hasEiendomsskatt === false) return g;
    const e = entry.latest.eiendomsskatt120m2;
    if (e == null) return null;
    return g + e;
  }

  const totalA = combined(entryA);
  const totalB = combined(entryB);
  const diff = totalA != null && totalB != null ? totalA - totalB : null;

  // Percentile shared across both columns: use all kommuner's combined
  // totals (skipping ones with missing eiendomsskatt data).
  const allCombined = Object.values(kostnader.kommuner)
    .map(combined)
    .filter((v): v is number => v != null);
  const minVal = allCombined.length ? Math.min(...allCombined) : 0;
  const maxVal = allCombined.length ? Math.max(...allCombined) : 1;
  const pct = (v: number | null): number =>
    v == null || maxVal === minVal
      ? 0
      : Math.max(0, Math.min(100, ((v - minVal) / (maxVal - minVal)) * 100));

  function rank(v: number | null): { rank: number; total: number } {
    if (v == null) return { rank: 0, total: allCombined.length };
    const sorted = [...allCombined].sort((x, y) => x - y);
    return { rank: sorted.indexOf(v) + 1, total: sorted.length };
  }

  const rankA = rank(totalA);
  const rankB = rank(totalB);

  const fylkeA = getFylke(a.knr);
  const fylkeB = getFylke(b.knr);

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-6">
      <SheetHeader>
        <SheetTitle className="text-left sr-only">Sammenligning</SheetTitle>
      </SheetHeader>

      <div className="flex items-center gap-1.5 mb-3">
        <ArrowLeftRight className="h-4 w-4" style={{ color: "var(--kv-blue)" }} />
        <p className="text-xs font-semibold text-foreground/70">
          Sammenligning · Faste kostnader per år
        </p>
      </div>

      {/* Kommune name header */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="font-bold text-base leading-snug">{a.name}</p>
          <p className="text-xs text-foreground/70">{fylkeA ?? ""}</p>
        </div>
        <div>
          <p className="font-bold text-base leading-snug">{b.name}</p>
          <p className="text-xs text-foreground/70">{fylkeB ?? ""}</p>
        </div>
      </div>

      {/* Combined total hero */}
      <div className="mt-4 pt-4 border-t">
        <p className="text-xs font-semibold text-foreground/70 mb-2">
          Gebyrer + eiendomsskatt
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span
              className="text-2xl font-extrabold tabular-nums"
              style={{ color: "var(--kv-blue)" }}
            >
              {totalA != null
                ? `${totalA.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}\u00a0kr`
                : "–"}
            </span>
            <p className="text-[10px] text-muted-foreground">per år</p>
          </div>
          <div>
            <span
              className="text-2xl font-extrabold tabular-nums"
              style={{ color: "var(--kv-blue)" }}
            >
              {totalB != null
                ? `${totalB.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}\u00a0kr`
                : "–"}
            </span>
            <p className="text-[10px] text-muted-foreground">per år</p>
          </div>
        </div>
        {diff != null && diff !== 0 && (
          <div className="mt-2">
            <span
              className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold"
              style={{
                background:
                  diff < 0 ? "var(--kv-positive-light)" : "var(--kv-negative-light)",
                color:
                  diff < 0 ? "var(--kv-positive-dark)" : "var(--kv-negative-dark)",
              }}
            >
              {a.name} er{" "}
              {Math.abs(diff).toLocaleString("nb-NO", { maximumFractionDigits: 0 })}
              {"\u00a0"}kr{" "}
              {diff < 0 ? "billigere" : "dyrere"} enn {b.name}
            </span>
          </div>
        )}
      </div>

      {/* Per-metric side-by-side */}
      <div className="mt-4 pt-4 border-t">
        <p className="text-xs font-semibold text-foreground/70 mb-2">
          Kommunale årsgebyr
        </p>
        <div className="grid grid-cols-2 gap-4">
          <MetricCell
            value={entryA?.latest.gebyrerTotal ?? null}
            unit="kr"
          />
          <MetricCell
            value={entryB?.latest.gebyrerTotal ?? null}
            unit="kr"
          />
        </div>
      </div>

      <div className="mt-4 pt-4 border-t">
        <p className="text-xs font-semibold text-foreground/70 mb-2">
          Eiendomsskatt (enebolig 120 m²)
        </p>
        <div className="grid grid-cols-2 gap-4">
          <EiendomsskattCompareCell entry={entryA} />
          <EiendomsskattCompareCell entry={entryB} />
        </div>
      </div>

      {/* Rank bars */}
      <div className="mt-4 pt-4 border-t">
        <p className="text-xs font-semibold text-foreground/70 mb-3">
          Plassering blant kommuner (lavere er billigere)
        </p>
        <div className="space-y-3">
          {[
            { name: a.name, value: totalA, rank: rankA },
            { name: b.name, value: totalB, rank: rankB },
          ].map((item) => {
            const p = pct(item.value);
            const hasValue = item.value != null;
            const width = hasValue ? Math.max(6, p) : 100;
            const bg = hasValue
              ? interpolateColor(1 - p / 100)
              : "var(--kv-muted-fill)";
            return (
              <div key={item.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{item.name}</span>
                  {hasValue && item.rank.rank > 0 ? (
                    <span className="text-xs text-foreground/70 tabular-nums">
                      #{item.rank.rank} av {item.rank.total}
                    </span>
                  ) : (
                    <span className="text-xs text-foreground/70">Ingen sum</span>
                  )}
                </div>
                <div
                  className="relative h-2.5 w-full rounded-full overflow-hidden"
                  style={{ background: "var(--kv-muted-fill)", opacity: 0.5 }}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${width}%`,
                      background: bg,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Source */}
      <div className="mt-4 pt-4 border-t">
        <p className="text-xs text-foreground/70 text-center">
          Kilde:{" "}
          <a
            href="https://www.ssb.no/statbank/table/12842"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            SSB 12842
          </a>
          {" "}({kostnader.gebyrerYear}) og{" "}
          <a
            href="https://www.ssb.no/statbank/table/14674"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            SSB 14674
          </a>
          {" "}({kostnader.eiendomsskattYear})
        </p>
        <DataDisclaimer />
      </div>
    </div>
  );
}

// ─── MetricCell ─────────────────────────────────────────────

export function MetricCell({
  value,
  unit,
}: {
  value: number | null;
  unit: "kr" | "‰";
}) {
  return (
    <div>
      <span
        className="text-lg font-extrabold tabular-nums"
        style={{ color: "var(--kv-blue)" }}
      >
        {value != null
          ? `${value.toLocaleString("nb-NO", { maximumFractionDigits: unit === "‰" ? 1 : 0 })}\u00a0${unit}`
          : "–"}
      </span>
    </div>
  );
}

// ─── EiendomsskattCompareCell ───────────────────────────────

export function EiendomsskattCompareCell({
  entry,
}: {
  entry: KostnaderKommuneEntry | undefined;
}) {
  if (!entry) {
    return <MetricCell value={null} unit="kr" />;
  }
  if (entry.hasEiendomsskatt === false) {
    return (
      <div>
        <span
          className="text-lg font-extrabold leading-none"
          style={{ color: "var(--kv-positive-dark)" }}
        >
          Ingen
        </span>
        <p className="text-[10px] text-muted-foreground mt-0.5">Ikke innført</p>
      </div>
    );
  }
  if (entry.latest.eiendomsskatt120m2 != null) {
    return <MetricCell value={entry.latest.eiendomsskatt120m2} unit="kr" />;
  }
  if (entry.latest.eiendomsskattPromille != null) {
    return (
      <div>
        <MetricCell value={entry.latest.eiendomsskattPromille} unit="‰" />
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Kun promille rapportert
        </p>
      </div>
    );
  }
  return <MetricCell value={null} unit="kr" />;
}

// ─── Gebyr breakdown row ────────────────────────────────────

export function GebyrRow({
  icon: Icon,
  label,
  value,
  first,
}: {
  icon: typeof Wallet;
  label: string;
  value: number | null;
  first?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-3 text-sm ${first ? "" : "border-t"}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">{label}</span>
      </div>
      <span
        className="tabular-nums font-semibold shrink-0"
        style={{ color: "var(--kv-blue)" }}
      >
        {value != null
          ? `${value.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}\u00a0kr`
          : "–"}
      </span>
    </div>
  );
}
