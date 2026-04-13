import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, TrendingUp, Home, Shield, Zap, BatteryCharging, Mountain, Waves, Cloud, ExternalLink, Briefcase, Compass, GraduationCap } from "lucide-react";
import {
  getAllKommuner,
  getProfileBySlug,
  getTotals,
  type KommuneProfile,
} from "@/lib/kommune-profiles";
import { KommuneWeather } from "@/components/kommune-weather";
import { KommuneMiniMap } from "@/components/kommune-mini-map-loader";
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

function YoyBadge({ value }: { value: number }) {
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
      {value.toFixed(1)} %
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
            const prices = trend.map((t) => t.price);
            const last = prices[prices.length - 1];
            const prev = prices[prices.length - 2];
            const yoy =
              prev != null && last != null
                ? ((last - prev) / prev) * 100
                : null;
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
                      ? `${fmtNumber(entry.count)} salg i 2024`
                      : "Ingen salg"}
                  </span>
                  {yoy != null && <YoyBadge value={yoy} />}
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
    <section className="pt-12 mt-12 border-t first:border-t-0 first:pt-0 first:mt-0">
      <div className="flex items-center justify-between mb-5 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex items-center justify-center h-9 w-9 rounded-lg shrink-0"
            style={{ background: "var(--kv-blue)" }}
          >
            <Icon className="h-4 w-4 text-white" />
          </div>
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
        <SkoleSection profile={profile} />
        <NaturSection profile={profile} />
        <EnergiSection profile={profile} />
        <InfraSection profile={profile} />
        <VaerSection profile={profile} />
        <p className="text-xs text-muted-foreground mt-12 pt-6 border-t">
          Kilder: Kartverket, SSB, NVE, NOBIL/Enova, OpenStreetMap. Tallene er oppdatert så ofte kildene tillater det — typisk 1–2 ganger i året for boligpriser og inntekt.
        </p>
      </div>
    </div>
  );
}
