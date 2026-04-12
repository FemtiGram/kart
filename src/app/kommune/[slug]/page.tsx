import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, TrendingUp, Home, Shield, Zap, BatteryCharging, Mountain, Waves, Cloud } from "lucide-react";
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
    <div className="border-b pb-8 mb-8">
      <Link
        href="/kommune"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Alle kommuner
      </Link>
      <h1 className="text-headline" style={{ color: "var(--kv-blue)" }}>
        {name}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground/70">
        {fylke && <span>{fylke} fylke</span>}
        <span className="text-muted-foreground/40">·</span>
        <span>Kommunenummer {knr}</span>
        <span className="text-muted-foreground/40">·</span>
        <span>{fmtNumber(area)} km²</span>
      </div>
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Stat
          label="Innbyggere"
          value={fmtNumber(population)}
          rank={fmtRank(ranks.population, totals.popTotal)}
        />
        <Stat
          label="Median inntekt"
          value={fmtCurrency(profile.income)}
          rank={fmtRank(ranks.income, totals.incomeTotal)}
        />
        {profile.affordability != null && (
          <Stat
            label="År inntekt for 50 m²"
            value={`${profile.affordability.toLocaleString("nb-NO")} år`}
            rank={fmtRank(
              ranks.affordability,
              totals.boligTotal
            )}
            rankLabel="(lavere er bedre)"
          />
        )}
      </div>
      {displayName !== name && (
        <p className="mt-4 text-xs text-muted-foreground">
          Kommunen har både et norsk og samisk navn. Begge er offisielle.
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  rank,
  rankLabel,
}: {
  label: string;
  value: string;
  rank: string;
  rankLabel?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
        {label}
      </p>
      <p
        className="mt-1 text-2xl font-extrabold tabular-nums"
        style={{ color: "var(--kv-blue)" }}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {rank}
        {rankLabel && <span className="ml-1">{rankLabel}</span>}
      </p>
    </div>
  );
}

// ─── Section: Bolig ──────────────────────────────────────────

function BoligSection({ profile }: { profile: KommuneProfile }) {
  const types = [
    { code: "01", label: "Enebolig", icon: Home },
    { code: "02", label: "Småhus", icon: Home },
    { code: "03", label: "Blokkleilighet", icon: Home },
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
            if (!entry) return (
              <div key={code} className="rounded-2xl border bg-card p-4 opacity-60">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">{label}</p>
                <p className="mt-1 text-2xl font-extrabold text-muted-foreground">–</p>
                <p className="mt-1 text-xs text-muted-foreground">Ingen salg registrert</p>
              </div>
            );
            return (
              <div key={code} className="rounded-2xl border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">{label}</p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums" style={{ color: "var(--kv-blue)" }}>
                  {fmtCurrency(entry.price)}<span className="text-sm font-normal text-muted-foreground">/m²</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.count ? `${fmtNumber(entry.count)} salg (2024)` : "Ingen salg"}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Ingen boligsalg registrert i SSB-data for denne kommunen.</p>
      )}
    </Section>
  );
}

// ─── Section: Natur ──────────────────────────────────────────

function NaturSection({ profile }: { profile: KommuneProfile }) {
  const totals = getTotals();
  return (
    <Section
      title="Natur og verneområder"
      icon={Shield}
      href={`/vern#kommune-${profile.knr}`}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">Verneområde</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums" style={{ color: "var(--kv-blue)" }}>
            {profile.vernePct != null ? `${profile.vernePct.toLocaleString("nb-NO")} %` : "–"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {profile.verneAreaKm2 != null ? `${fmtNumber(profile.verneAreaKm2)} km² vernet` : "Ingen data"} · {fmtRank(profile.ranks.verne, totals.kommuner)}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">DNT-hytter og fjellhytter</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums" style={{ color: "var(--kv-blue)" }}>
            {fmtNumber(profile.cabins.total)}
          </p>
          {profile.cabins.top.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground truncate">
              Største: {profile.cabins.top[0].name}
              {profile.cabins.top[0].beds ? ` (${profile.cabins.top[0].beds} senger)` : ""}
            </p>
          )}
        </div>
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
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">Installert effekt</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums" style={{ color: "var(--kv-blue)" }}>
            {fmtNumber(energy.totalMW)}<span className="text-sm font-normal text-muted-foreground"> MW</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{fmtRank(ranks.energy, totals.kommuner)}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">Kraftverk</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums" style={{ color: "var(--kv-blue)" }}>
            {fmtNumber(energy.plantCount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {energy.hydroCount} vann · {energy.windCount} vind
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">Magasiner</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums" style={{ color: "var(--kv-blue)" }}>
            {fmtNumber(reservoirs.total)}
          </p>
          {reservoirs.top[0] && (
            <p className="mt-1 text-xs text-muted-foreground truncate">
              Største: {reservoirs.top[0].name}
            </p>
          )}
        </div>
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

function InfraSection({ profile }: { profile: KommuneProfile }) {
  const { centroid } = profile;
  const ladingHref = `/lading?lat=${centroid.lat.toFixed(4)}&lon=${centroid.lon.toFixed(4)}&z=11`;
  return (
    <Section title="Infrastruktur" icon={BatteryCharging} href={ladingHref}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">Ladestasjoner</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums" style={{ color: "var(--kv-blue)" }}>
            {fmtNumber(profile.charging.total)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {fmtNumber(profile.charging.fast)} hurtiglading (≥ 50 kW)
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">Fjellhytter</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums" style={{ color: "var(--kv-blue)" }}>
            {fmtNumber(profile.cabins.total)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            DNT og ubetjente
          </p>
        </div>
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
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center h-8 w-8 rounded-lg"
            style={{ background: "var(--kv-blue)" }}
          >
            <Icon className="h-4 w-4 text-white" />
          </div>
          <h2 className="text-xl font-bold" style={{ color: "var(--kv-blue)" }}>
            {title}
          </h2>
        </div>
        {href && (
          <Link
            href={href}
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
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
        <KartSection profile={profile} />
        <BoligSection profile={profile} />
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
