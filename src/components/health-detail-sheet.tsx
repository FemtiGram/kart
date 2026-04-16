"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { kommuneSlug } from "@/lib/kommune-slug";
import { SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataDisclaimer } from "@/lib/map-utils";
import {
  synthesizeHealth,
  type HealthTone,
} from "@/lib/health-summary";
import type {
  Selected,
  FastlegeData,
  OsmHealthData,
} from "@/components/health-map-helpers";
import {
  getFylke,
  computeRank,
  formatMetric,
  METRIC_DESCRIPTION,
} from "@/components/health-map-helpers";

// ─── Detail sheet body ──────────────────────────────────────

export function DetailSheetBody({
  selected,
  fastlege,
  topRef,
}: {
  selected: Selected;
  fastlege: FastlegeData;
  osm: OsmHealthData | null;
  topRef: React.RefObject<HTMLDivElement | null>;
}) {
  // topRef is forwarded to the root <div> below and passed to the parent
  // Sheet's `initialFocus` prop. base-ui focuses it when the sheet opens,
  // which means the sheet starts at the top instead of scrolling to
  // whichever link happens to be the first tabbable inside the content.
  const entry = fastlege.kommuner[selected.knr];
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
          Ingen fastlegedata i SSB for denne kommunen.
        </p>
      </div>
    );
  }

  const fylke = getFylke(selected.knr);

  // Rankings for the three primary metrics
  const ranks = {
    reservekapasitet: computeRank(fastlege, "KOSreservekapasi0000", selected.knr, true),
    andelUtenLege: computeRank(fastlege, "KOSandelpasiente0000", selected.knr, false),
    listelengde: computeRank(fastlege, "KOSgjsnlisteleng0000", selected.knr, false),
  };

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
        {fylke ? `${fylke} · ` : ""}SSB {fastlege.latestYear}
      </p>

      {/* Plain-language synthesis — does the reasoning about the three
          metrics for the reader so they don't have to. */}
      <HealthSynthesisBanner
        metrics={{
          reservekapasitet: entry.latest.KOSreservekapasi0000,
          andelUtenLege: entry.latest.KOSandelpasiente0000,
          listelengde: entry.latest.KOSgjsnlisteleng0000,
        }}
      />

      {/* Three primary stats */}
      <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-3">
        <PrimaryStat
          label="Ledig kapasitet"
          value={entry.latest.KOSreservekapasi0000}
          valueFormatter={(v) => {
            const delta = v - 100;
            const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
            return `${sign}${Math.abs(delta).toLocaleString("nb-NO", { maximumFractionDigits: 0 })}\u00a0%`;
          }}
          rank={ranks.reservekapasitet}
          higherIsBetter
        />
        <PrimaryStat
          label="Uten fastlege"
          value={entry.latest.KOSandelpasiente0000}
          valueFormatter={(v) =>
            `${v.toLocaleString("nb-NO", { maximumFractionDigits: 1 })}\u00a0%`
          }
          rank={ranks.andelUtenLege}
          higherIsBetter={false}
        />
        <PrimaryStat
          label="Pasienter per lege"
          value={entry.latest.KOSgjsnlisteleng0000}
          valueFormatter={(v) =>
            v.toLocaleString("nb-NO", { maximumFractionDigits: 0 })
          }
          rank={ranks.listelengde}
          higherIsBetter={false}
        />
      </div>

      {/* Trend bar chart — mirrors the bolig detail sheet pattern. Bars
          represent raw SSB values (85–120 band rebased to 0 for contrast)
          so the trend shape reads clearly. Current year is opaque, the
          rest dimmed. Tooltips convert back to signed % for legibility. */}
      {entry.trend.KOSreservekapasi0000 && entry.trend.KOSreservekapasi0000.length > 1 && (
        <KapasitetTrend
          trend={entry.trend.KOSreservekapasi0000}
          latestYear={fastlege.latestYear}
        />
      )}

      {/* All 18 metrics in a stat list — each row shows the SSB label,
          a one-line plain-language description, and the value. Rows use
          items-start so a wrapping description doesn't push the number
          off its baseline. */}
      <div className="mt-4 pt-4 border-t">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70 mb-2">
          Alle fastlege-metrikker ({fastlege.latestYear})
        </p>
        <div className="rounded-2xl border bg-card overflow-hidden">
          {fastlege.metrics.map((m, i) => {
            const value = entry.latest[m.code];
            const description = METRIC_DESCRIPTION[m.code];
            return (
              <div
                key={m.code}
                className={`flex items-start justify-between gap-3 px-4 py-3 text-sm ${i > 0 ? "border-t" : ""} ${m.primary ? "bg-muted/30" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-foreground/80 font-medium">{m.label}</p>
                  {description && (
                    <p className="text-[11px] text-foreground/70 leading-tight mt-0.5">
                      {description}
                    </p>
                  )}
                </div>
                <span
                  className="tabular-nums font-semibold shrink-0"
                  style={{ color: "var(--kv-blue)" }}
                >
                  {formatMetric(value, m)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

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

      {/* Source */}
      <div className="mt-4 pt-4 border-t">
        <p className="text-xs text-foreground/70 text-center">
          Kilde:{" "}
          <a
            href="https://www.ssb.no/statbank/table/12005"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            SSB tabell 12005
          </a>
          , {fastlege.latestYear}
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
  higherIsBetter,
}: {
  label: string;
  value: number | undefined;
  valueFormatter: (v: number) => string;
  rank: { rank: number; total: number };
  higherIsBetter: boolean;
}) {
  void higherIsBetter; // rank quartile already decides color
  const q = rank.rank / rank.total;
  const color =
    value == null
      ? "var(--kv-muted-fill)"
      : q <= 0.25
        ? "var(--kv-positive)"
        : q >= 0.75
          ? "var(--kv-negative)"
          : "var(--kv-blue)";
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <p
        className="text-xl font-extrabold tabular-nums leading-none whitespace-nowrap"
        style={{ color }}
      >
        {value != null ? valueFormatter(value) : "–"}
      </p>
      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
        {label}
      </p>
      <p className="mt-0.5 text-[10px] text-foreground/70 tabular-nums">
        #{rank.rank}/{rank.total}
      </p>
    </div>
  );
}

// ─── Synthesis banner ───────────────────────────────────────

function HealthSynthesisBanner({
  metrics,
}: {
  metrics: {
    reservekapasitet: number | undefined;
    andelUtenLege: number | undefined;
    listelengde: number | undefined;
  };
}) {
  const synth = synthesizeHealth(metrics);
  if (!synth) return null;
  const color = toneColor(synth.tone);
  return (
    <div
      className="mt-3 rounded-xl p-3"
      style={{ background: color.bg }}
    >
      <p className="text-sm font-medium leading-snug" style={{ color: color.fg }}>
        {synth.sentence}
      </p>
    </div>
  );
}

function toneColor(tone: HealthTone): { bg: string; fg: string } {
  // Text-on-tinted-bg: base semantic tokens (e.g. --kv-warning) only clear
  // ~3:1 against their -light backgrounds, which fails WCAG AA for normal
  // text. The -dark variants step to the 800-family and all clear ≥6.8:1.
  switch (tone) {
    case "good":
      return { bg: "var(--kv-positive-light)", fg: "var(--kv-positive-dark)" };
    case "bad":
      return { bg: "var(--kv-negative-light)", fg: "var(--kv-negative-dark)" };
    case "mixed":
      return { bg: "var(--kv-warning-light)", fg: "var(--kv-warning-dark)" };
    default:
      return { bg: "var(--kv-info-light)", fg: "var(--kv-info-dark)" };
  }
}

// ─── Kapasitet trend bar chart ──────────────────────────────
//
// Mirrors the bolig-map detail sheet pattern: a tight row of flex bars
// sized to the series max, most recent year opaque and the rest dim.
// Raw SSB values sit in the 85–120 band, which would all render near
// full-height if we normalized by `max`; we subtract a baseline so the
// year-to-year shape is actually legible. Tooltip restores the signed
// percentage format for anyone hovering an individual bar.

function KapasitetTrend({
  trend,
  latestYear,
}: {
  trend: Array<{ year: string; value: number }>;
  latestYear: string;
}) {
  const minRaw = Math.min(...trend.map((p) => p.value));
  const maxRaw = Math.max(...trend.map((p) => p.value));
  // Rebase to the series min for contrast; if the range is too narrow
  // (flat kommune) fall back to 1 so every bar renders at min height.
  const range = Math.max(1, maxRaw - minRaw);
  const first = trend[0];
  const last = trend[trend.length - 1];
  const totalChange = last.value - first.value;
  return (
    <div className="mt-4 pt-4 border-t">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-foreground/70">
          Ledig kapasitet ({first.year}–{latestYear})
        </p>
        {totalChange !== 0 && (
          <span
            className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold"
            style={{
              background:
                totalChange >= 0
                  ? "var(--kv-positive-light)"
                  : "var(--kv-negative-light)",
              color:
                totalChange >= 0
                  ? "var(--kv-positive-dark)"
                  : "var(--kv-negative-dark)",
            }}
          >
            {totalChange > 0 ? "+" : "−"}
            {Math.abs(totalChange).toLocaleString("nb-NO", { maximumFractionDigits: 0 })}
          </span>
        )}
      </div>
      <div className="flex items-end gap-[2px] h-12">
        {trend.map((p) => {
          const heightPct = Math.max(4, ((p.value - minRaw) / range) * 100);
          const delta = p.value - 100;
          const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
          const tooltip = `${p.year}: ${sign}${Math.abs(delta)} %`;
          return (
            <div
              key={p.year}
              className="flex-1 rounded-sm min-w-[2px] transition-all"
              style={{
                height: `${heightPct}%`,
                background: "var(--kv-blue)",
                opacity: p.year === latestYear ? 1 : 0.3,
              }}
              title={tooltip}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] text-foreground/70">{first.year}</span>
        <span className="text-[10px] text-foreground/70">{latestYear}</span>
      </div>
    </div>
  );
}
