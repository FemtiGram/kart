import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, TrendingUp, Home, Shield, Zap, BatteryCharging, Mountain, Waves, Cloud, ExternalLink, Briefcase, Compass, GraduationCap, HeartPulse, Wallet, Users, ArrowRight, Sparkles, PieChart } from "lucide-react";
import {
  getAllKommuner,
  getProfileBySlug,
  getTotals,
  type KommuneProfile,
} from "@/lib/kommune-profiles";
import { KommuneWeather } from "@/components/kommune-weather";
import { KommuneMiniMap } from "@/components/kommune-mini-map-loader";
import { synthesizeHealth, type HealthTone } from "@/lib/health-summary";
import { Map as MapIcon } from "lucide-react";

// ─── Static params ───────────────────────────────────────────

export function generateStaticParams() {
  return getAllKommuner().map((k) => ({ slug: k.slug }));
}

// ─── Metadata ────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const profile = getProfileBySlug(slug);
  if (!profile) return { title: "Kommune ikke funnet" };

  const pop = profile.population ? fmtNumber(profile.population) : null;
  const blokk = profile.bolig["03"]?.price ?? null;
  const income = profile.income;

  const parts = [
    `${profile.displayName} kommune i tall`,
    pop ? `${pop} innbyggere` : null,
    income ? `median inntekt ${fmtNumber(income)} kr` : null,
    blokk ? `kvadratmeterpris ${fmtNumber(blokk)} kr` : null,
  ].filter(Boolean);

  const description = `${parts.join(", ")}. Boligmarked, energi, verneområder og infrastruktur.`;

  return {
    title: profile.displayName,
    description,
    alternates: { canonical: `/kommune/${profile.slug}` },
    openGraph: {
      title: `${profile.displayName} — Datakart`,
      description,
      type: "article",
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────

function fmtNumber(n: number | null | undefined): string {
  if (n == null) return "–";
  return new Intl.NumberFormat("nb-NO").format(Math.round(n));
}

function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return "–";
  return `${fmtNumber(n)} kr`;
}

function fmtRank(rank: number | null, total: number): string {
  if (rank == null) return "–";
  return `#${rank} av ${total}`;
}

/**
 * SSB's `Reservekapasitet fastlege` is an index where 100 = kapasitet and
 * listelengde are balanced, >100 = headroom, <100 = overbooked. Displayed
 * as a signed percentage so the reader can see at a glance whether there
 * is room on the lists (+5 %) or whether they are overbooked (−2 %).
 */
function formatKapasitet(rawValue: number): string {
  const delta = rawValue - 100;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return `${sign}${Math.abs(delta).toLocaleString("nb-NO", { maximumFractionDigits: 0 })}\u00a0%`;
}

function HealthSynthLine({
  tone,
  sentence,
}: {
  tone: HealthTone;
  sentence: string;
}) {
  // Uses the -dark variants for WCAG AA — base semantic tokens on tinted
  // backgrounds only hit ~3:1 and fail normal text contrast.
  const { bg, fg } =
    tone === "good"
      ? { bg: "var(--kv-positive-light)", fg: "var(--kv-positive-dark)" }
      : tone === "bad"
        ? { bg: "var(--kv-negative-light)", fg: "var(--kv-negative-dark)" }
        : tone === "mixed"
          ? { bg: "var(--kv-warning-light)", fg: "var(--kv-warning-dark)" }
          : { bg: "var(--kv-info-light)", fg: "var(--kv-info-dark)" };
  return (
    <div className="rounded-xl p-3" style={{ background: bg }}>
      <p className="text-sm font-medium leading-snug" style={{ color: fg }}>
        {sentence}
      </p>
    </div>
  );
}

// ─── Section: Hero ───────────────────────────────────────────

function Hero({ profile }: { profile: KommuneProfile }) {
  const { knr, name, displayName, fylke, area, population, ranks } = profile;
  const totals = getTotals();

  return (
    <div className="pb-2">
      <Link
        href="/kommune"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Alle kommuner
      </Link>
      <h1
        className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.1]"
        style={{ color: "var(--kv-blue)" }}
      >
        {name}
      </h1>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground/70">
        {fylke && <span>{fylke} fylke</span>}
        <span className="text-muted-foreground/40">·</span>
        <span>Kommunenummer {knr}</span>
        <span className="text-muted-foreground/40">·</span>
        <span>{fmtNumber(area)} km²</span>
      </div>
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Stat
          label="Innbyggere"
          value={fmtNumber(population)}
          context={fmtRank(ranks.population, totals.popTotal)}
        />
        <Stat
          label="Median inntekt"
          value={fmtCurrency(profile.income)}
          context={fmtRank(ranks.income, totals.incomeTotal)}
        />
      </div>
      {profile.snapshot && profile.snapshot.length > 0 && (
        <div className="mt-4 rounded-2xl border bg-card px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles
              className="h-4 w-4 shrink-0"
              style={{ color: "var(--kv-blue)" }}
            />
            <span className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
              Automatisk sammendrag
            </span>
          </div>
          <p className="text-sm leading-relaxed text-foreground">
            {profile.snapshot.join(" ")}
          </p>
          <p className="mt-3 text-[11px] text-muted-foreground leading-snug">
            Sammendraget er automatisk generert og kan inneholde feil.
          </p>
        </div>
      )}
      {displayName !== name && (
        <p className="mt-4 text-xs text-muted-foreground">
          Kommunen har både et norsk og samisk navn. Begge er offisielle.
        </p>
      )}
    </div>
  );
}

/**
 * Vertical stat card: big value reads first, label as a caption below,
 * optional context row at the bottom. Avoids truncating large numbers.
 */
function Stat({
  label,
  value,
  context,
  contextRight,
}: {
  label: string;
  value: string;
  context?: string;
  contextRight?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-card px-5 py-4">
      <p
        className="text-2xl font-extrabold tabular-nums leading-none whitespace-nowrap"
        style={{ color: "var(--kv-blue)" }}
      >
        {value}
      </p>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
        {label}
      </p>
      {(context || contextRight) && (
        <div className="mt-1 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
          <span className="truncate">{context ?? ""}</span>
          {contextRight && <span className="shrink-0">{contextRight}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Yoy helper ──────────────────────────────────────────────

function YoyBadge({ value, fromYear }: { value: number; fromYear?: string }) {
  const positive = value >= 0;
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums shrink-0"
      style={{
        background: positive ? "var(--kv-positive-light)" : "var(--kv-negative-light)",
        color: positive ? "var(--kv-positive)" : "var(--kv-negative)",
      }}
    >
      {positive ? "+" : ""}
      {value.toFixed(1)} %{fromYear ? ` fra ${fromYear}` : ""}
    </span>
  );
}

// ─── Section: Bolig ──────────────────────────────────────────

function BoligSection({ profile }: { profile: KommuneProfile }) {
  const types = [
    { code: "01", label: "Enebolig" },
    { code: "02", label: "Småhus" },
    { code: "03", label: "Blokkleilighet" },
  ];
  const hasAny = types.some((t) => profile.bolig[t.code]);

  return (
    <Section
      title="Boligmarked"
      icon={TrendingUp}
      href={`/bolig#kommune-${profile.knr}`}
    >
      {hasAny ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {types.map(({ code, label }) => {
            const entry = profile.bolig[code];
            if (!entry) {
              return (
                <div
                  key={code}
                  className="rounded-2xl border bg-card px-5 py-4 opacity-60"
                >
                  <p className="text-2xl font-extrabold text-muted-foreground leading-none">
                    –
                  </p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                    {label}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ingen salg registrert
                  </p>
                </div>
              );
            }
            const trend = entry.trend ?? [];
            const lastEntry = trend[trend.length - 1];
            const prevEntry = trend[trend.length - 2];
            const yoy =
              prevEntry && lastEntry
                ? ((lastEntry.price - prevEntry.price) / prevEntry.price) * 100
                : null;
            const prevYear = prevEntry?.year;
            return (
              <div key={code} className="rounded-2xl border bg-card px-5 py-4">
                <p
                  className="text-2xl font-extrabold tabular-nums leading-none whitespace-nowrap"
                  style={{ color: "var(--kv-blue)" }}
                >
                  {fmtNumber(entry.price)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    kr/m²
                  </span>
                </p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                  {label}
                </p>
                <div className="mt-1 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                  <span className="truncate">
                    {entry.count
                      ? `${fmtNumber(entry.count)} salg${lastEntry?.year ? ` i ${lastEntry.year}` : ""}`
                      : "Ingen salg"}
                  </span>
                  {yoy != null && <YoyBadge value={yoy} fromYear={prevYear} />}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Ingen boligsalg registrert i SSB-data for denne kommunen.
        </p>
      )}
    </Section>
  );
}

// ─── Section: Hva koster det å bo her? ──────────────────────
//
// Cost-of-living surface built from two SSB KOSTRA tables:
//   - 14674 (eiendomsskatt): whether the kommune levies it at all, and
//            the standardized bill for a 120 m² enebolig — the best
//            apples-to-apples number across kommuner.
//   - 12842 (kommunale gebyrer): annual fees for vann, avløp, avfall,
//            feiing. The four together range from ~8k to 20k+ kr/year
//            between kommuner and are almost never surfaced in one place.

function KostnadSection({ profile }: { profile: KommuneProfile }) {
  const totals = getTotals();
  const { eiendomsskatt, gebyrer } = profile.cost;
  const hasAny = eiendomsskatt != null || gebyrer != null;

  if (!hasAny) {
    return (
      <Section title="Hva koster det å bo her?" icon={Wallet}>
        <p className="text-sm text-muted-foreground">
          Ingen eiendomsskatt- eller gebyrdata i SSB for denne kommunen.
        </p>
      </Section>
    );
  }

  return (
    <Section title="Hva koster det å bo her?" icon={Wallet}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {eiendomsskatt && <EiendomsskattCard data={eiendomsskatt} />}
        {gebyrer && (
          <GebyrCard
            gebyrer={gebyrer}
            rank={fmtRank(profile.ranks.gebyrTotal, totals.kommuner)}
          />
        )}
      </div>
      <p className="mt-4 text-xs text-foreground/70">
        Kilde:{" "}
        <a
          href="https://www.ssb.no/statbank/table/14674"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          SSB 14674
        </a>{" "}
        (eiendomsskatt) og{" "}
        <a
          href="https://www.ssb.no/statbank/table/12842"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          SSB 12842
        </a>{" "}
        (kommunale gebyrer). Tallene er eksklusiv mva. og oppdateres årlig.
      </p>
    </Section>
  );
}

/**
 * Eiendomsskatt has two meaningfully-different empty states:
 *   1. The kommune has not introduced property tax at all — show a
 *      positive "Ingen eiendomsskatt" pill, since that's good news for
 *      the reader and a headline stat in its own right.
 *   2. The kommune has it, but no standardized 120 m² figure is
 *      reported — fall back to the promille with a short note.
 */
function EiendomsskattCard({
  data,
}: {
  data: NonNullable<KommuneProfile["cost"]["eiendomsskatt"]>;
}) {
  if (!data.has) {
    return (
      <div className="rounded-2xl border bg-card px-5 py-4">
        <p
          className="text-2xl font-extrabold leading-none whitespace-nowrap"
          style={{ color: "var(--kv-positive-dark)" }}
        >
          Ingen
        </p>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
          Eiendomsskatt
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Kommunen har ikke innført eiendomsskatt på bolig
        </p>
      </div>
    );
  }
  const value =
    data.annualFor120m2 != null
      ? `${fmtNumber(data.annualFor120m2)} kr`
      : data.promille != null
        ? `${data.promille.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} ‰`
        : "–";
  const context =
    data.annualFor120m2 != null
      ? `For en enebolig på 120 m²${data.promille != null ? ` · ${data.promille.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} ‰` : ""}`
      : "Promille av takst";
  return (
    <Stat label="Eiendomsskatt" value={value} context={context} />
  );
}

/**
 * Compact "vann · avløp · avfall · feiing" line for the gebyrer card's
 * context row. Skips any fee the kommune does not report (rural kommuner
 * sometimes have no sewer hookup, for instance).
 */
/**
 * Dedicated card for kommunale årsgebyr. The old Stat card truncated the
 * four-fee breakdown because the generic Stat uses `truncate` on its
 * context row — losing feiing (and sometimes avfall) on narrower mobile
 * widths. This card gives each fee its own labelled cell in a 2×2 grid
 * so all four stay visible regardless of viewport.
 */
function GebyrCard({
  gebyrer,
  rank,
}: {
  gebyrer: NonNullable<KommuneProfile["cost"]["gebyrer"]>;
  rank?: string;
}) {
  const fees: Array<{ label: string; value: number | null }> = [
    { label: "Vann", value: gebyrer.vann },
    { label: "Avløp", value: gebyrer.avlop },
    { label: "Avfall", value: gebyrer.avfall },
    { label: "Feiing", value: gebyrer.feiing },
  ];
  return (
    <div className="rounded-2xl border bg-card px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p
          className="text-2xl font-extrabold tabular-nums leading-none whitespace-nowrap"
          style={{ color: "var(--kv-blue)" }}
        >
          {gebyrer.total != null ? `${fmtNumber(gebyrer.total)} kr` : "–"}
        </p>
        {rank && (
          <span className="text-xs text-muted-foreground shrink-0">{rank}</span>
        )}
      </div>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
        Kommunale årsgebyr
      </p>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {fees.map((fee) => (
          <div key={fee.label} className="flex justify-between gap-2">
            <span className="text-muted-foreground">{fee.label}</span>
            <span className="tabular-nums text-foreground">
              {fee.value != null ? `${fmtNumber(fee.value)} kr` : "–"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section: Utforsk muligheter (external Finn.no links) ──

/**
 * Finn.no's jobs section supports kommune-level location filtering, but uses
 * a different URL endpoint and code format than the boliger section:
 *
 *   Boliger: `/realestate/homes/search.html?location=1.<fylke>.<kommune>`
 *            Oslo special: `0.20061` (2 segments, Oslo is both fylke + kommune)
 *
 *   Jobs:    `/job/search?location=2.20001.<fylke>.<kommune>` (4 segments,
 *            20001 = Norge prefix). Oslo: `2.20001.20061.20061`.
 *
 * Both formats use the same fylke and kommune IDs internally, so we can
 * derive the jobs code from the boliger code.
 */
function jobsCodeFromBoligerCode(boligerCode: string | null): string | null {
  if (!boligerCode) return null;
  const parts = boligerCode.split(".");
  if (parts[0] === "0") {
    // Oslo special: "0.20061" → "2.20001.20061.20061"
    const id = parts[1];
    if (!id) return null;
    return `2.20001.${id}.${id}`;
  }
  // Regular: "1.<fylke>.<kommune>" → "2.20001.<fylke>.<kommune>"
  const fylke = parts[1];
  const kommune = parts[2];
  if (!fylke || !kommune) return null;
  return `2.20001.${fylke}.${kommune}`;
}

function MuligheterSection({ profile }: { profile: KommuneProfile }) {
  const name = profile.displayName;
  const code = profile.finnLocationCode;
  const jobCode = jobsCodeFromBoligerCode(code);
  const boligUrl = code
    ? `https://www.finn.no/realestate/homes/search.html?q=${encodeURIComponent(name)}&location=${code}`
    : `https://www.finn.no/realestate/homes/search.html?q=${encodeURIComponent(name)}`;
  const jobUrl = jobCode
    ? `https://www.finn.no/job/search?location=${jobCode}`
    : `https://www.finn.no/job/search?q=${encodeURIComponent(name)}`;
  return (
    <Section title={`Utforsk muligheter i ${name}`} icon={Compass}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FinnCard
          href={boligUrl}
          icon={Home}
          title={`Boliger til salgs i ${name}`}
          subtitle="Se aktuelle boligannonser på Finn.no"
        />
        <FinnCard
          href={jobUrl}
          icon={Briefcase}
          title={`Ledige jobber i ${name}`}
          subtitle="Se utlyste stillinger på Finn.no"
        />
      </div>
    </Section>
  );
}

function FinnCard({
  href,
  icon: Icon,
  title,
  subtitle,
}: {
  href: string;
  icon: typeof TrendingUp;
  title: string;
  subtitle: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between rounded-2xl border bg-card hover:bg-muted/60 px-5 py-4 transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Icon
          className="h-5 w-5 shrink-0"
          style={{ color: "var(--kv-blue)" }}
        />
        <div className="min-w-0">
          <p
            className="text-sm font-semibold truncate"
            style={{ color: "var(--kv-blue)" }}
          >
            {title}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground truncate">
            {subtitle}
          </p>
        </div>
      </div>
      <ExternalLink className="h-4 w-4 text-foreground/70 shrink-0 ml-3" />
    </a>
  );
}

// ─── Section: Natur ──────────────────────────────────────────

function NaturSection({ profile }: { profile: KommuneProfile }) {
  const totals = getTotals();
  const verneContext =
    profile.verneAreaKm2 != null
      ? `${fmtNumber(profile.verneAreaKm2)} km² vernet`
      : "Ingen data";
  const topCabin = profile.cabins.top[0];
  const cabinContext = topCabin
    ? `Største: ${topCabin.name}${topCabin.beds ? ` (${topCabin.beds} senger)` : ""}`
    : "Ingen hytter registrert";
  return (
    <Section
      title="Natur og verneområder"
      icon={Shield}
      href={`/vern#kommune-${profile.knr}`}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Stat
          label="Verneområde"
          value={
            profile.vernePct != null
              ? `${profile.vernePct.toLocaleString("nb-NO")} %`
              : "–"
          }
          context={verneContext}
          contextRight={fmtRank(profile.ranks.verne, totals.kommuner)}
        />
        <Stat
          label="DNT og fjellhytter"
          value={fmtNumber(profile.cabins.total)}
          context={cabinContext}
        />
      </div>
    </Section>
  );
}

// ─── Section: Energi ─────────────────────────────────────────

function EnergiSection({ profile }: { profile: KommuneProfile }) {
  const { energy, reservoirs, ranks, centroid } = profile;
  const totals = getTotals();
  const energiHref = `/energi?lat=${centroid.lat.toFixed(4)}&lon=${centroid.lon.toFixed(4)}&z=10`;
  if (energy.plantCount === 0 && reservoirs.total === 0) {
    return (
      <Section title="Energi" icon={Zap} href={energiHref}>
        <p className="text-sm text-muted-foreground">Ingen kraftverk eller magasiner registrert i kommunen.</p>
      </Section>
    );
  }
  return (
    <Section title="Energi" icon={Zap} href={energiHref}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat
          label="Installert effekt"
          value={`${fmtNumber(energy.totalMW)} MW`}
          context={fmtRank(ranks.energy, totals.kommuner)}
        />
        <Stat
          label="Kraftverk"
          value={fmtNumber(energy.plantCount)}
          context={`${energy.hydroCount} vann · ${energy.windCount} vind`}
        />
        <Stat
          label="Magasiner"
          value={fmtNumber(reservoirs.total)}
          context={
            reservoirs.top[0]
              ? `Største: ${reservoirs.top[0].name}`
              : "Ingen magasiner"
          }
        />
      </div>
      {energy.top.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70 mb-2">Største kraftverk</p>
          <div className="rounded-2xl border bg-card overflow-hidden">
            {energy.top.map((p, i) => (
              <div key={p.id} className={`flex items-center justify-between px-4 py-3 text-sm ${i > 0 ? "border-t" : ""}`}>
                <div className="flex items-center gap-3 min-w-0">
                  {p.type === "vann" ? <Waves className="h-4 w-4 shrink-0 text-muted-foreground" /> : <Mountain className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className="font-medium truncate">{p.name}</span>
                </div>
                <span className="tabular-nums text-foreground/70 shrink-0 ml-3">
                  {p.capacityMW != null ? `${fmtNumber(p.capacityMW)} MW` : "–"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

// ─── Section: Demografi ──────────────────────────────────────
//
// Three stacked-bar cards built from SSB tables 11084 (eierstatus),
// 06265 (boligtyper) and 09429 (utdanningsnivå). Same percentages the
// automatisk sammendrag samples from, but shown in full so the reader
// can see the whole distribution, not just the one surfaced outlier.

const DEMO_SHADES = [
  "#1e3a8a",
  "#1e40af",
  "#2563eb",
  "#3b82f6",
  "#60a5fa",
  "#93c5fd",
];

interface Segment {
  label: string;
  value: number;
}

function StackedCard({
  label,
  segments,
  year,
}: {
  label: string;
  segments: Segment[];
  year: string;
}) {
  // Filter out zero-width segments so the bar and legend stay tidy
  // (e.g. a kommune with no blokk entries drops that row entirely).
  const visible = segments.filter((s) => s.value > 0);
  return (
    <div className="rounded-2xl border bg-card px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
        {label}
      </p>
      <div className="mt-3 flex h-2 rounded-full overflow-hidden bg-muted">
        {visible.map((s, i) => (
          <div
            key={s.label}
            style={{
              width: `${s.value}%`,
              background: DEMO_SHADES[i % DEMO_SHADES.length],
            }}
            title={`${s.label}: ${s.value.toFixed(1)} %`}
          />
        ))}
      </div>
      <div className="mt-3 space-y-1.5 text-xs">
        {visible.map((s, i) => (
          <div
            key={s.label}
            className="flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  background: DEMO_SHADES[i % DEMO_SHADES.length],
                }}
              />
              <span className="truncate text-foreground">{s.label}</span>
            </div>
            <span className="tabular-nums shrink-0 font-medium text-foreground">
              {s.value.toFixed(1)} %
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">SSB ({year})</p>
    </div>
  );
}

function DemografiSection({ profile }: { profile: KommuneProfile }) {
  const { eierstatus, boliger, utdanning } = profile.demografi;
  if (!eierstatus && !boliger && !utdanning) return null;

  return (
    <Section title="Demografi" icon={PieChart}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {eierstatus && (
          <StackedCard
            label="Eierforhold"
            segments={[
              { label: "Selveier", value: eierstatus.selveier },
              { label: "Andels-/aksjeeier", value: eierstatus.andelseier },
              { label: "Leier", value: eierstatus.leier },
            ]}
            year={eierstatus.year}
          />
        )}
        {boliger && (
          <StackedCard
            label="Boligtyper"
            segments={[
              { label: "Enebolig", value: boliger.enebolig },
              { label: "Rekkehus", value: boliger.rekkehus },
              { label: "Tomannsbolig", value: boliger.tomannsbolig },
              { label: "Blokk", value: boliger.blokk },
              {
                label: "Annet",
                value: boliger.bofellesskap + boliger.annet,
              },
            ]}
            year={boliger.year}
          />
        )}
        {utdanning && (
          <StackedCard
            label="Utdanningsnivå"
            segments={[
              { label: "Grunnskole", value: utdanning.grunnskole },
              { label: "Videregående", value: utdanning.vgs },
              { label: "Fagskole", value: utdanning.fagskole },
              { label: "Høyere (kort)", value: utdanning.hoyereKort },
              { label: "Høyere (lang)", value: utdanning.hoyereLang },
            ]}
            year={utdanning.year}
          />
        )}
      </div>
      <p className="mt-4 text-xs text-foreground/70">
        Kilder:{" "}
        <a
          href="https://www.ssb.no/statbank/table/11084"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          SSB 11084
        </a>{" "}
        (eierstatus),{" "}
        <a
          href="https://www.ssb.no/statbank/table/06265"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          SSB 06265
        </a>{" "}
        (boligtyper) og{" "}
        <a
          href="https://www.ssb.no/statbank/table/09429"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          SSB 09429
        </a>{" "}
        (utdanningsnivå).
      </p>
    </Section>
  );
}

// ─── Section: Infrastruktur ──────────────────────────────────

function SkoleSection({ profile }: { profile: KommuneProfile }) {
  const { schools, kindergartens, centroid } = profile;
  const href = `/skoler?lat=${centroid.lat.toFixed(4)}&lon=${centroid.lon.toFixed(4)}&z=12`;
  if (schools.total === 0 && kindergartens.total === 0) {
    return (
      <Section title="Skoler og barnehager" icon={GraduationCap} href={href}>
        <p className="text-sm text-muted-foreground">
          Ingen skoler eller barnehager registrert i kommunen.
        </p>
      </Section>
    );
  }
  return (
    <Section title="Skoler og barnehager" icon={GraduationCap} href={href}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat
          label="Grunnskoler"
          value={fmtNumber(schools.grunnskoleCount)}
          context={
            schools.totalStudents > 0
              ? `${fmtNumber(schools.totalStudents)} elever totalt`
              : "Ingen elevtall"
          }
        />
        <Stat
          label="Videregående"
          value={fmtNumber(schools.vgsCount)}
          context={schools.vgsCount > 0 ? "Inkl. fagskoler" : "Ingen VGS"}
        />
        <Stat
          label="Barnehager"
          value={fmtNumber(kindergartens.total)}
          context={
            kindergartens.totalChildren > 0
              ? `${fmtNumber(kindergartens.totalChildren)} barn totalt`
              : "Ingen barnetall"
          }
        />
      </div>
      {schools.top.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70 mb-2">
            Største skoler
          </p>
          <div className="rounded-2xl border bg-card overflow-hidden">
            {schools.top.map((s, i) => (
              <Link
                key={s.id}
                href={`/skoler#skole-${s.id}`}
                className={`flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/50 transition-colors ${i > 0 ? "border-t" : ""}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <GraduationCap className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="font-medium truncate">{s.name}</span>
                </div>
                <span className="tabular-nums text-foreground/70 shrink-0 ml-3">
                  {s.students != null ? `${fmtNumber(s.students)} elever` : "–"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

// ─── Section: Helsetilbud ────────────────────────────────────
//
// Powered by SSB table 12005 — authoritative fastlege data per kommune.
// Three primary stats: reservekapasitet, andel på liste uten fastlege,
// gjennomsnittlig listelengde. Each links to /helse with the matching
// metric pre-selected.

function HelseSection({ profile }: { profile: KommuneProfile }) {
  const { health } = profile;
  const totals = getTotals();
  const href = `/helse#kommune-${profile.knr}`;

  const reservekapasitet = health.latest.KOSreservekapasi0000;
  const andelUtenLege = health.latest.KOSandelpasiente0000;
  const listelengde = health.latest.KOSgjsnlisteleng0000;
  const fastlegeCount = health.latest.KOSantallavtaler0001;

  const hasAny =
    reservekapasitet != null ||
    andelUtenLege != null ||
    listelengde != null;

  if (!hasAny) {
    return (
      <Section title="Helsetilbud" icon={HeartPulse} href={href}>
        <p className="text-sm text-muted-foreground">
          Ingen fastlegedata i SSB for denne kommunen.
        </p>
      </Section>
    );
  }

  // Trend delta on reservekapasitet — is the kommune's situation improving
  // or getting worse since 2018? 7 years back is a good crisis-era anchor.
  const series = health.trend.KOSreservekapasi0000 ?? [];
  const start = series.find((p) => p.year === "2018")?.value ?? series[0]?.value;
  const end = series[series.length - 1]?.value;
  const trendDelta =
    start != null && end != null ? end - start : null;

  const synth = synthesizeHealth({
    reservekapasitet,
    andelUtenLege,
    listelengde,
  });

  return (
    <Section title="Helsetilbud" icon={HeartPulse} href={href}>
      {synth && <HealthSynthLine tone={synth.tone} sentence={synth.sentence} />}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
        <Stat
          label="Ledig kapasitet"
          value={
            reservekapasitet != null
              ? formatKapasitet(reservekapasitet)
              : "–"
          }
          contextRight={fmtRank(profile.ranks.reservekapasitet, totals.kommuner)}
        />
        <Stat
          label="Uten fastlege"
          value={
            andelUtenLege != null
              ? `${andelUtenLege.toLocaleString("nb-NO", { maximumFractionDigits: 1 })}\u00a0%`
              : "–"
          }
          contextRight={fmtRank(profile.ranks.andelUtenLege, totals.kommuner)}
        />
        <Stat
          label="Pasienter per lege"
          value={
            listelengde != null ? fmtNumber(listelengde) : "–"
          }
          context={
            fastlegeCount != null
              ? `${fmtNumber(fastlegeCount)} fastleger totalt`
              : undefined
          }
          contextRight={fmtRank(profile.ranks.listelengde, totals.kommuner)}
        />
      </div>

      {trendDelta != null && series.length >= 3 && (
        <p className="mt-3 text-xs text-foreground/70">
          <span className="font-semibold">Utvikling siden 2018:</span>{" "}
          <span
            style={{
              color:
                trendDelta > 0
                  ? "var(--kv-positive)"
                  : trendDelta < 0
                    ? "var(--kv-negative)"
                    : undefined,
            }}
          >
            {trendDelta > 0 ? "↗" : trendDelta < 0 ? "↘" : "→"}{" "}
            {trendDelta > 0 ? "+" : ""}
            {trendDelta.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}{" "}
            prosentpoeng ledig kapasitet
          </span>
        </p>
      )}

      <p className="mt-3 text-xs text-foreground/70">
        Kilde:{" "}
        <a
          href="https://www.ssb.no/statbank/table/12005"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          SSB 12005
        </a>{" "}
        · {health.year}
      </p>
    </Section>
  );
}

function InfraSection({ profile }: { profile: KommuneProfile }) {
  const { centroid } = profile;
  const ladingHref = `/lading?lat=${centroid.lat.toFixed(4)}&lon=${centroid.lon.toFixed(4)}&z=11`;
  return (
    <Section title="Infrastruktur" icon={BatteryCharging} href={ladingHref}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Stat
          label="Ladestasjoner"
          value={fmtNumber(profile.charging.total)}
          context={`${fmtNumber(profile.charging.fast)} hurtiglading (≥ 50 kW)`}
        />
        <Stat
          label="Fjellhytter"
          value={fmtNumber(profile.cabins.total)}
          context="DNT og ubetjente"
        />
      </div>
    </Section>
  );
}

// ─── Section: Kart ───────────────────────────────────────────

function KartSection({ profile }: { profile: KommuneProfile }) {
  return (
    <Section title="Plassering" icon={MapIcon}>
      <KommuneMiniMap
        outline={profile.outline}
        bbox={profile.bbox}
        name={profile.displayName}
        layers={{
          energy: profile.energy.all.filter(
            (p) => p.lat != null && p.lon != null
          ),
          charging: profile.charging.all.filter(
            (s) => s.lat != null && s.lon != null
          ),
          cabin: profile.cabins.all.filter(
            (c) => c.lat != null && c.lon != null
          ),
          reservoir: profile.reservoirs.all.filter(
            (r) => r.lat != null && r.lon != null
          ),
          school: profile.schools.all.filter(
            (s) => s.lat != null && s.lon != null
          ),
          kindergarten: profile.kindergartens.all.filter(
            (k) => k.lat != null && k.lon != null
          ),
        }}
        totals={{
          energy: profile.energy.plantCount,
          charging: profile.charging.total,
          cabin: profile.cabins.total,
          reservoir: profile.reservoirs.total,
          school: profile.schools.total,
          kindergarten: profile.kindergartens.total,
        }}
      />
    </Section>
  );
}

// ─── Section: Vær (live, client-fetched) ────────────────────

function VaerSection({ profile }: { profile: KommuneProfile }) {
  const { centroid } = profile;
  const mapHref = `/map?lat=${centroid.lat.toFixed(4)}&lon=${centroid.lon.toFixed(4)}&z=12`;
  return (
    <Section title="Vær akkurat nå" icon={Cloud} href={mapHref}>
      <KommuneWeather
        lat={profile.centroid.lat}
        lon={profile.centroid.lon}
        name={profile.displayName}
      />
    </Section>
  );
}

// ─── Section: Lignende kommuner ─────────────────────────────
//
// Find the 3 kommuner with the closest combined population + income
// ranks, so a reader landing on one profile can discover similar
// places as a jumping-off point. Rank-space distance (Manhattan on
// pop-rank and income-rank) is cheap and scale-free — it doesn't
// matter that population is in raw count and income in kroner, both
// are already normalized to [1, 357].

function findSimilar(profile: KommuneProfile, k: number): KommuneProfile[] {
  const pr = profile.ranks.population;
  const ir = profile.ranks.income;
  if (pr == null || ir == null) return [];
  const all = getAllKommuner();
  return all
    .filter(
      (p) =>
        p.knr !== profile.knr &&
        p.ranks.population != null &&
        p.ranks.income != null
    )
    .map((p) => ({
      p,
      score:
        Math.abs((p.ranks.population as number) - pr) +
        Math.abs((p.ranks.income as number) - ir),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, k)
    .map((s) => s.p);
}

function SimilarSection({ profile }: { profile: KommuneProfile }) {
  const similar = findSimilar(profile, 3);
  if (similar.length === 0) return null;
  return (
    <Section title="Lignende kommuner" icon={Users}>
      <p className="text-xs text-foreground/70 mb-4">
        Kommuner med tilsvarende befolkning og inntekt
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {similar.map((s) => (
          <SimilarCard key={s.knr} profile={s} />
        ))}
      </div>
    </Section>
  );
}

function SimilarCard({ profile }: { profile: KommuneProfile }) {
  return (
    <Link
      href={`/kommune/${profile.slug}`}
      className="group flex flex-col rounded-2xl border bg-card hover:bg-muted/60 px-5 py-4 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className="font-bold text-base leading-snug truncate"
          style={{ color: "var(--kv-blue)" }}
        >
          {profile.displayName}
        </p>
        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
      </div>
      {profile.fylke && (
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {profile.fylke}
        </p>
      )}
      <div className="mt-3 pt-3 border-t flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Innbyggere
          </p>
          <p className="text-sm font-extrabold tabular-nums" style={{ color: "var(--kv-blue)" }}>
            {fmtNumber(profile.population)}
          </p>
        </div>
        <div className="min-w-0 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Inntekt
          </p>
          <p className="text-sm font-extrabold tabular-nums" style={{ color: "var(--kv-blue)" }}>
            {profile.income != null
              ? `${Math.round(profile.income / 1000).toLocaleString("nb-NO")}k`
              : "–"}
          </p>
        </div>
      </div>
    </Link>
  );
}

// ─── Section wrapper ─────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  href,
  children,
}: {
  title: string;
  icon: typeof TrendingUp;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-16 first:mt-12">
      <div className="flex items-center justify-between mb-5 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Icon className="h-5 w-5 shrink-0" style={{ color: "var(--kv-blue)" }} />
          <h2 className="text-title truncate" style={{ color: "var(--kv-blue)" }}>
            {title}
          </h2>
        </div>
        {href && (
          <Link
            href={href}
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            Se fullt kart →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

// ─── JSON-LD ─────────────────────────────────────────────────

function buildJsonLd(profile: KommuneProfile) {
  const additionalProperty: Array<{
    "@type": "PropertyValue";
    name: string;
    value: number | string;
    unitText?: string;
  }> = [];
  if (profile.population != null) {
    additionalProperty.push({
      "@type": "PropertyValue",
      name: "Innbyggere",
      value: profile.population,
    });
  }
  if (profile.income != null) {
    additionalProperty.push({
      "@type": "PropertyValue",
      name: "Median inntekt etter skatt",
      value: profile.income,
      unitText: "NOK",
    });
  }
  const blokk = profile.bolig["03"]?.price ?? null;
  if (blokk != null) {
    additionalProperty.push({
      "@type": "PropertyValue",
      name: "Kvadratmeterpris blokkleilighet",
      value: blokk,
      unitText: "NOK/m²",
    });
  }
  if (profile.vernePct != null) {
    additionalProperty.push({
      "@type": "PropertyValue",
      name: "Andel vernet areal",
      value: profile.vernePct,
      unitText: "%",
    });
  }
  if (profile.energy.totalMW > 0) {
    additionalProperty.push({
      "@type": "PropertyValue",
      name: "Installert kraftverkeffekt",
      value: profile.energy.totalMW,
      unitText: "MW",
    });
  }

  return {
    "@context": "https://schema.org",
    "@type": "Place",
    name: profile.displayName,
    alternateName: profile.name !== profile.displayName ? profile.name : undefined,
    identifier: profile.knr,
    description: `${profile.displayName} kommune i ${profile.fylke ?? "Norge"}${profile.population ? `, ${profile.population.toLocaleString("nb-NO")} innbyggere` : ""}.`,
    url: `https://datakart.no/kommune/${profile.slug}`,
    containedInPlace: profile.fylke
      ? { "@type": "AdministrativeArea", name: `${profile.fylke} fylke` }
      : undefined,
    geo: {
      "@type": "GeoCoordinates",
      latitude: profile.centroid.lat,
      longitude: profile.centroid.lon,
    },
    area: {
      "@type": "QuantitativeValue",
      value: profile.area,
      unitText: "km²",
    },
    additionalProperty,
  };
}

// ─── Page ────────────────────────────────────────────────────

export default async function KommunePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = getProfileBySlug(slug);
  if (!profile) notFound();

  return (
    <div className="min-h-[calc(100svh-57px)] bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(profile)) }}
      />
      <div className="container mx-auto px-6 md:px-16 py-8 md:py-12 max-w-4xl">
        <Hero profile={profile} />
        <MuligheterSection profile={profile} />
        <KartSection profile={profile} />
        <BoligSection profile={profile} />
        <KostnadSection profile={profile} />
        <DemografiSection profile={profile} />
        <SkoleSection profile={profile} />
        <HelseSection profile={profile} />
        <NaturSection profile={profile} />
        <EnergiSection profile={profile} />
        <InfraSection profile={profile} />
        <VaerSection profile={profile} />
        <SimilarSection profile={profile} />
        <p className="text-xs text-muted-foreground mt-12 pt-6 border-t">
          Kilder: Kartverket, SSB, NVE, Utdanningsdirektoratet (UDIR),
          NOBIL/Enova, MET Norway og OpenStreetMap. Tallene er oppdatert så
          ofte kildene tillater det — typisk 1–2 ganger i året for
          boligpriser og inntekt, daglig for skoler og barnehager.{" "}
          <Link href="/kilder" className="underline hover:text-foreground">
            Se alle datakilder
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
