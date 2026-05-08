"use client";

import {
  useState,
  useDeferredValue,
  useMemo,
  useRef,
  useEffect,
} from "react";
import { Calculator, Search, MapPin, ChevronDown, AlertCircle } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, ReferenceDot } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface KommuneOption {
  knr: string;
  name: string;
  fylke: string | null;
}

interface YearEntry {
  price: number | null;
  count: number | null;
}
type BoligData = Record<string, Record<string, Record<string, YearEntry>>>;

const BOLIGTYPE_OPTIONS = [
  { value: "01", label: "Enebolig" },
  { value: "02", label: "Småhus" },
  { value: "03", label: "Blokkleilighet" },
] as const;

// SSB 06035 has data from 2002. Latest year is excluded so there's always at
// least one year of growth to show — the dropdown ends at "today minus 1".
const YEARS = Array.from({ length: 22 }, (_, i) => String(2002 + i));

type Boligtype = (typeof BOLIGTYPE_OPTIONS)[number]["value"];

interface PricePoint {
  year: string;
  price: number | null;
}

type Result =
  | { status: "missing"; reason: string }
  | {
      status: "ok";
      kommuneName: string;
      fylkeName: string | null;
      boligtypeLabel: string;
      purchaseYear: string;
      latestYear: string;
      pricePerM2Then: number;
      pricePerM2Now: number;
      growthPercent: number;
      growthFactor: number;
      purchasePrice: number;
      estimatedToday: number;
      area: number | null;
      priceSeries: PricePoint[];
      fylkeGrowthPercent: number | null;
      nationalGrowthPercent: number | null;
    };

const chartConfig: ChartConfig = {
  price: {
    label: "Pris per m²",
    color: "var(--kv-blue)",
  },
};

function ComparisonCell({
  label,
  sublabel,
  growth,
  highlight,
}: {
  label: string;
  sublabel: string;
  growth: number | null;
  highlight?: boolean;
}) {
  const formatted =
    growth == null
      ? "—"
      : `${growth >= 0 ? "+" : ""}${growth.toFixed(1)} %`;
  const valueColor = highlight
    ? "var(--kv-blue)"
    : growth == null
      ? "var(--muted-foreground)"
      : undefined;
  return (
    <div
      className={`rounded-xl border px-3 py-3 ${highlight ? "" : "bg-muted/30"}`}
      style={highlight ? { borderColor: "var(--kv-blue)" } : undefined}
    >
      <p className="text-xs font-semibold text-foreground">{label}</p>
      <p className="text-[11px] text-muted-foreground truncate">{sublabel}</p>
      <p
        className="text-xl font-extrabold tabular-nums mt-1"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {formatted}
      </p>
    </div>
  );
}

/** Lowercase + strip Norwegian/Sami diacritics so e.g. "kautokeino" matches "Guovdageaidnu - Kautokeino". */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replaceAll("æ", "ae")
    .replaceAll("ø", "o")
    .replaceAll("å", "a")
    .replaceAll("á", "a")
    .replaceAll("č", "c")
    .replaceAll("ŋ", "ng")
    .replaceAll("š", "s")
    .replaceAll("ŧ", "t")
    .replaceAll("ž", "z");
}

function formatThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Round to nearest 10 000 kr to avoid implying false precision. */
function roundForDisplay(n: number): number {
  return Math.round(n / 10000) * 10000;
}

function formatNok(n: number): string {
  return formatThousands(String(Math.round(n)));
}

export function UtviklingCalculator({ kommuner }: { kommuner: KommuneOption[] }) {
  const [kommuneQuery, setKommuneQuery] = useState("");
  const [selectedKommune, setSelectedKommune] = useState<KommuneOption | null>(null);
  const [highlighted, setHighlighted] = useState(-1);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [boligtype, setBoligtype] = useState<Boligtype>("01");
  const [year, setYear] = useState<string>("");
  const [price, setPrice] = useState<string>(""); // raw digits only
  const [area, setArea] = useState<string>("");

  // Data fetched once on mount, then reused for every calculation
  const [boligData, setBoligData] = useState<BoligData | null>(null);
  const [dataError, setDataError] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  // Becomes true on first Beregn click. After that, any form change
  // triggers a live recompute — no need to click Beregn again.
  const [hasComputed, setHasComputed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bolig")
      .then((r) => {
        if (!r.ok) throw new Error("api error");
        return r.json();
      })
      .then((d: { data: BoligData }) => {
        if (cancelled) return;
        setBoligData(d.data);
      })
      .catch(() => {
        if (cancelled) return;
        setDataError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const deferred = useDeferredValue(kommuneQuery);
  const q = deferred.trim();

  const filtered = useMemo(() => {
    if (!q || selectedKommune?.name === q) return [];
    const needle = normalize(q);
    return kommuner
      .filter(
        (k) =>
          normalize(k.name).includes(needle) ||
          normalize(k.knr).includes(needle) ||
          (k.fylke && normalize(k.fylke).includes(needle))
      )
      .slice(0, 6);
  }, [kommuner, q, selectedKommune]);

  useEffect(() => {
    setHighlighted(filtered.length > 0 ? 0 : -1);
  }, [filtered]);

  const showDropdown = focused && filtered.length > 0;

  function pickKommune(k: KommuneOption) {
    setSelectedKommune(k);
    setKommuneQuery(k.name);
    setFocused(false);
  }

  function onKommuneKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      pickKommune(filtered[highlighted]);
    } else if (e.key === "Escape") {
      setKommuneQuery("");
      setSelectedKommune(null);
      setHighlighted(-1);
      inputRef.current?.blur();
    }
  }

  const canSubmit =
    !!selectedKommune &&
    !!year &&
    price.length > 0 &&
    parseInt(price) > 0 &&
    !!boligData;

  function computeResult(): Result {
    if (!selectedKommune || !boligData) {
      return { status: "missing", reason: "Mangler data." };
    }
    const kommuneData = boligData[selectedKommune.knr];
    if (!kommuneData) {
      return {
        status: "missing",
        reason: `Vi har ingen prisdata for ${selectedKommune.name}.`,
      };
    }
    const typeData = kommuneData[boligtype];
    const typeLabel = BOLIGTYPE_OPTIONS.find((o) => o.value === boligtype)!.label;
    if (!typeData) {
      return {
        status: "missing",
        reason: `Vi har ingen ${typeLabel.toLowerCase()}-data for ${selectedKommune.name}.`,
      };
    }
    const purchaseEntry = typeData[year];
    if (!purchaseEntry || purchaseEntry.price == null) {
      return {
        status: "missing",
        reason: `Vi har ingen ${typeLabel.toLowerCase()}-data for ${selectedKommune.name} i ${year}.`,
      };
    }
    // Latest year that has a non-null price for this kommune+type
    const yearsWithPrice = Object.keys(typeData)
      .filter((y) => typeData[y]?.price != null)
      .sort();
    const latestYear = yearsWithPrice[yearsWithPrice.length - 1];
    if (!latestYear || latestYear === year) {
      return {
        status: "missing",
        reason: `Mangler nyere data for ${selectedKommune.name} (${typeLabel.toLowerCase()}). Prøv et tidligere kjøpsår.`,
      };
    }
    const purchasePricePerM2 = purchaseEntry.price!;
    const latestPricePerM2 = typeData[latestYear].price!;
    const growthFactor = latestPricePerM2 / purchasePricePerM2;
    const growthPercent = (growthFactor - 1) * 100;
    const purchasePrice = parseInt(price);
    const estimatedToday = purchasePrice * growthFactor;
    const areaNum = area ? parseFloat(area) : null;

    // Build chart series from purchase year forward
    const purchaseYearNum = parseInt(year);
    const latestYearNum = parseInt(latestYear);
    const priceSeries: PricePoint[] = [];
    for (let y = purchaseYearNum; y <= latestYearNum; y++) {
      const ys = String(y);
      priceSeries.push({ year: ys, price: typeData[ys]?.price ?? null });
    }

    // Average growth comparison: per-kommune simple average of (latest/purchase - 1),
    // including only kommuner that have data in both years for the same boligtype.
    const fylkeKnrs = selectedKommune.fylke
      ? new Set(
          kommuner
            .filter((k) => k.fylke === selectedKommune.fylke)
            .map((k) => k.knr)
        )
      : null;

    let fylkeSum = 0;
    let fylkeCount = 0;
    let nationalSum = 0;
    let nationalCount = 0;
    for (const [knr, kData] of Object.entries(boligData)) {
      const t = kData[boligtype];
      if (!t) continue;
      const p1 = t[year]?.price;
      const p2 = t[latestYear]?.price;
      if (p1 == null || p2 == null) continue;
      const g = p2 / p1 - 1;
      nationalSum += g;
      nationalCount += 1;
      if (fylkeKnrs && fylkeKnrs.has(knr)) {
        fylkeSum += g;
        fylkeCount += 1;
      }
    }
    const fylkeGrowthPercent =
      fylkeKnrs && fylkeCount > 0 ? (fylkeSum / fylkeCount) * 100 : null;
    const nationalGrowthPercent =
      nationalCount > 0 ? (nationalSum / nationalCount) * 100 : null;

    return {
      status: "ok",
      kommuneName: selectedKommune.name,
      fylkeName: selectedKommune.fylke,
      boligtypeLabel: typeLabel,
      purchaseYear: year,
      latestYear,
      pricePerM2Then: purchasePricePerM2,
      pricePerM2Now: latestPricePerM2,
      growthPercent,
      growthFactor,
      purchasePrice,
      estimatedToday,
      area: areaNum,
      priceSeries,
      fylkeGrowthPercent,
      nationalGrowthPercent,
    };
  }

  // Live recompute after the first Beregn click. Any form change feeds
  // straight into a new result, so users can A/B between boligtyper or
  // years without clicking the button again.
  useEffect(() => {
    if (!hasComputed) return;
    if (!canSubmit) return;
    setResult(computeResult());
    // computeResult reads from these state values via closure; listing the
    // inputs explicitly is enough — including computeResult itself would
    // re-fire every render since it's defined inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasComputed, canSubmit, boligtype, year, price, area, selectedKommune?.knr]);

  return (
    <div className="bg-card rounded-2xl shadow-sm border px-5 py-5 sm:px-6 sm:py-6">
      <div className="flex items-center gap-2 mb-4">
        <Calculator
          className="h-5 w-5"
          style={{ color: "var(--kv-blue)" }}
          aria-hidden="true"
        />
        <h2
          className="text-lg font-bold tracking-tight"
          style={{ color: "var(--kv-blue)" }}
        >
          Beregn utvikling
        </h2>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          setHasComputed(true);
          setResult(computeResult());
        }}
        className="flex flex-col gap-5"
      >
        {/* Kommune autocomplete */}
        <div>
          <label
            htmlFor="utv-kommune"
            className="text-sm font-medium text-foreground mb-2 block"
          >
            Kommune
          </label>
          <div className="relative">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 z-10"
                style={{ color: "var(--kv-blue)" }}
              />
              <input
                ref={inputRef}
                id="utv-kommune"
                type="text"
                role="combobox"
                aria-expanded={showDropdown}
                aria-controls="utv-kommune-list"
                aria-autocomplete="list"
                value={kommuneQuery}
                onChange={(e) => {
                  setKommuneQuery(e.target.value);
                  if (selectedKommune && e.target.value !== selectedKommune.name) {
                    setSelectedKommune(null);
                  }
                }}
                onFocus={() => {
                  if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
                  setFocused(true);
                }}
                onBlur={() => {
                  blurTimerRef.current = setTimeout(() => setFocused(false), 150);
                }}
                onKeyDown={onKommuneKeyDown}
                placeholder="Søk etter din kommune..."
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="search"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {showDropdown && (
              <ul
                id="utv-kommune-list"
                role="listbox"
                className="absolute top-full mt-1 left-0 right-0 rounded-xl bg-background border shadow-lg overflow-hidden z-50"
              >
                {filtered.map((k, i) => (
                  <li key={k.knr}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={highlighted === i}
                      onMouseDown={() => pickKommune(k)}
                      onMouseEnter={() => setHighlighted(i)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left border-b last:border-0 transition-colors ${
                        highlighted === i ? "bg-muted" : "hover:bg-muted"
                      }`}
                    >
                      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {k.name}
                        </p>
                        {k.fylke && (
                          <p className="text-xs text-muted-foreground truncate">
                            {k.fylke}
                          </p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Boligtype */}
        <div>
          <p className="text-sm font-medium text-foreground mb-2">Boligtype</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {BOLIGTYPE_OPTIONS.map((opt) => {
              const active = boligtype === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setBoligtype(opt.value)}
                  className={`rounded-lg px-3 py-2.5 text-sm font-medium border transition-colors ${
                    active
                      ? "text-white border-transparent"
                      : "bg-background hover:bg-muted text-foreground border-border"
                  }`}
                  style={active ? { background: "var(--kv-blue)" } : undefined}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Year + Price (two columns on desktop) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="utv-year"
              className="text-sm font-medium text-foreground mb-2 block"
            >
              Kjøpsår
            </label>
            <div className="relative">
              <select
                id="utv-year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full appearance-none rounded-lg border border-border bg-background pl-3 pr-9 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Velg år...</option>
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="utv-price"
              className="text-sm font-medium text-foreground mb-2 block"
            >
              Kjøpesum (kr)
            </label>
            <input
              id="utv-price"
              type="text"
              inputMode="numeric"
              value={formatThousands(price)}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setPrice(digits);
              }}
              placeholder="3 000 000"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring tabular-nums"
            />
          </div>
        </div>

        {/* Area (optional) */}
        <div>
          <label
            htmlFor="utv-area"
            className="text-sm font-medium text-foreground mb-2 block"
          >
            Areal{" "}
            <span className="font-normal text-muted-foreground">
              (m², valgfri — gir ekstra kontekst)
            </span>
          </label>
          <input
            id="utv-area"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="80"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-xl px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
          style={{ background: "var(--kv-blue)" }}
        >
          {boligData ? "Beregn" : "Laster prisdata..."}
        </button>

        {dataError && (
          <p
            className="text-xs text-center"
            style={{ color: "var(--kv-negative-dark)" }}
          >
            Kunne ikke hente prisdata. Last siden på nytt og prøv igjen.
          </p>
        )}
      </form>

      {result && (
        <div className="mt-6 pt-6 border-t">
          {result.status === "missing" ? (
            <div
              className="rounded-xl border px-4 py-3 flex gap-2 items-start"
              style={{
                background: "var(--kv-warning-light)",
                borderColor: "var(--kv-warning)",
                color: "var(--kv-warning-dark)",
              }}
            >
              <AlertCircle
                className="h-4 w-4 mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <p className="text-sm">{result.reason}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {/* Hero estimate */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Estimert verdi i dag (snittutvikling)
                </p>
                <p
                  className="text-3xl sm:text-4xl font-extrabold tabular-nums leading-none"
                  style={{ color: "var(--kv-blue)" }}
                >
                  ≈ {formatNok(roundForDisplay(result.estimatedToday))} kr
                </p>
                <p className="text-sm text-muted-foreground mt-2 leading-snug">
                  Hvis {result.boligtypeLabel.toLowerCase()} i {result.kommuneName} fulgte snittutviklingen fra {result.purchaseYear} til {result.latestYear}.
                </p>
              </div>

              {/* Math breakdown */}
              <div className="rounded-xl bg-muted/50 px-4 py-3 text-sm">
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Kjøpesum ({result.purchaseYear})</span>
                  <span className="font-semibold tabular-nums">
                    {formatNok(result.purchasePrice)} kr
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">
                    Vekst {result.purchaseYear}–{result.latestYear}
                  </span>
                  <span
                    className="font-semibold tabular-nums"
                    style={{
                      color:
                        result.growthPercent >= 0
                          ? "var(--kv-positive-dark)"
                          : "var(--kv-negative-dark)",
                    }}
                  >
                    {result.growthPercent >= 0 ? "+" : ""}
                    {result.growthPercent.toFixed(1)} %
                  </span>
                </div>
                <div
                  className="flex justify-between py-2 mt-1 border-t font-semibold"
                  style={{ color: "var(--kv-blue)" }}
                >
                  <span>Estimert verdi</span>
                  <span className="tabular-nums">
                    ≈ {formatNok(roundForDisplay(result.estimatedToday))} kr
                  </span>
                </div>
              </div>

              {/* Trend chart — kr/m² over time for the selected kommune+type */}
              <div className="rounded-xl border px-4 py-4">
                <div className="flex items-baseline justify-between mb-3 gap-2 flex-wrap">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Snittpris per m² i {result.kommuneName}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    <span>{formatNok(result.pricePerM2Then)} kr</span>
                    <span aria-hidden="true" className="mx-2">
                      →
                    </span>
                    <span style={{ color: "var(--kv-blue)" }} className="font-semibold">
                      {formatNok(result.pricePerM2Now)} kr
                    </span>
                  </p>
                </div>
                <ChartContainer
                  config={chartConfig}
                  className="aspect-auto h-32 w-full"
                >
                  <AreaChart
                    data={result.priceSeries}
                    margin={{ top: 4, right: 8, bottom: 0, left: 4 }}
                  >
                    <defs>
                      <linearGradient
                        id="utvFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="var(--kv-blue)"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--kv-blue)"
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="year"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      interval="preserveStartEnd"
                      minTickGap={30}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={4}
                      tickFormatter={(v: number) =>
                        `${Math.round(v / 1000)}k`
                      }
                      domain={["dataMin - 1000", "dataMax + 1000"]}
                      width={42}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(label) => label as string}
                          formatter={(value) => [
                            value == null
                              ? "ingen data"
                              : `${formatNok(value as number)} kr/m²`,
                            "Snittpris",
                          ]}
                        />
                      }
                    />
                    <Area
                      dataKey="price"
                      type="monotone"
                      stroke="var(--kv-blue)"
                      strokeWidth={2}
                      fill="url(#utvFill)"
                      dot={false}
                      activeDot={{
                        r: 4,
                        fill: "var(--kv-blue)",
                        stroke: "white",
                        strokeWidth: 2,
                      }}
                      connectNulls
                    />
                    <ReferenceDot
                      x={result.purchaseYear}
                      y={result.pricePerM2Then}
                      r={4}
                      fill="white"
                      stroke="var(--kv-blue)"
                      strokeWidth={2}
                    />
                    <ReferenceDot
                      x={result.latestYear}
                      y={result.pricePerM2Now}
                      r={4}
                      fill="var(--kv-blue)"
                      stroke="white"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              </div>

              {/* Comparison strip — din kommune vs fylke vs landet */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Sammenlignet med snittutviklingen for {result.boligtypeLabel.toLowerCase()}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <ComparisonCell
                    label="Din kommune"
                    sublabel={result.kommuneName}
                    growth={result.growthPercent}
                    highlight
                  />
                  <ComparisonCell
                    label="Fylket"
                    sublabel={result.fylkeName ?? "—"}
                    growth={result.fylkeGrowthPercent}
                  />
                  <ComparisonCell
                    label="Hele landet"
                    sublabel="357 kommuner"
                    growth={result.nationalGrowthPercent}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Tallet er kun et omtrentlig anslag basert på snittprisutviklingen i kommunen din. Faktisk verdi avhenger av tilstand, beliggenhet, oppgraderinger og mye mer.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
