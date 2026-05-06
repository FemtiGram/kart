import Image from "next/image";
import { ChevronDown, BatteryCharging, Mountain, MapPinned, TrendingUp, Vote, Database, Globe, Code } from "lucide-react";
import { FadeIn, FadeInView } from "@/components/motion";
import { HomeKommuneSearch } from "@/components/home-kommune-search";
import { MinimalCard } from "@/components/minimal-card";
import { getAllKommuner } from "@/lib/kommune-profiles";

const categories = [
  {
    href: "/samfunn",
    title: "Samfunn",
    description: "Bolig, inntekt, helse, skoler og valg — kommune for kommune.",
    icon: MapPinned,
  },
  {
    href: "/energi",
    title: "Energi",
    description: "Hvor kommer Norges strøm fra, og hvor kan du lade elbilen?",
    icon: BatteryCharging,
  },
  {
    href: "/natur",
    title: "Natur",
    description: "Fjell, fjellhytter og verneområder fra Lindesnes til Nordkapp.",
    icon: Mountain,
  },
];

// Curated by hand — these surface what the audience actually opens first.
// Kept small (4) so the eye lands here and doesn't have to scan further.
const popular = [
  {
    href: "/bolig",
    title: "Boligpriser",
    description: "Kvadratmeterpris per kommune.",
    icon: TrendingUp,
  },
  {
    href: "/kommune",
    title: "Stedsprofil",
    description: "Alle 357 kommuner i ett blikk.",
    icon: MapPinned,
  },
  {
    href: "/valg",
    title: "Valgkart",
    description: "Stortingsvalget 2025 per kommune.",
    icon: Vote,
  },
  {
    href: "/energikart",
    title: "Energikart",
    description: "1 700+ kraftverk i Norge.",
    icon: BatteryCharging,
  },
];

export default function Home() {
  // Trimmed kommune list for the hero search — only the fields the
  // autocomplete needs so the client bundle stays small (~30 KB vs ~3.7 MB
  // for the full profile set).
  const kommuneSearchList = getAllKommuner().map((k) => ({
    knr: k.knr,
    displayName: k.displayName,
    name: k.name,
    slug: k.slug,
    fylke: k.fylke,
  }));

  return (
    <div className="bg-background">
      {/* Hero section — note: no `overflow-hidden` here. The dropdown of
          HomeKommuneSearch needs to extend below the hero bottom edge,
          and the `<Image fill object-cover>` clips itself to its own box
          so the banner doesn't bleed. `isolate` + a high z-index pins
          the hero's stacking context above the content that follows. */}
      <section className="relative h-[75svh] min-h-[500px] isolate z-10">
        <div className="absolute inset-0 overflow-hidden">
          <Image
            src="/img/banner_1920.webp"
            alt="Lofoten, Norge"
            fill
            priority
            className="object-cover object-[center_30%]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        </div>
        <div className="relative h-full flex flex-col justify-end px-6 md:px-16 pb-16 md:pb-24 max-w-5xl mx-auto">
          <FadeIn>
            <h1 className="text-display text-white drop-shadow-lg">
              Datakart
            </h1>
          </FadeIn>
          <FadeIn delay={0.1}>
            <p className="mt-4 text-white/90 text-lg md:text-2xl max-w-lg drop-shadow-md">
              Utforsk Norge gjennom åpne geodata
            </p>
          </FadeIn>
          <FadeIn delay={0.15}>
            <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-3 w-full">
              <HomeKommuneSearch kommuner={kommuneSearchList} />
              <a
                href="#utforsk"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/30 text-white font-semibold text-sm h-12 px-6 hover:bg-white/20 transition-colors shrink-0 shadow-xl"
              >
                Utforsk kartene
                <ChevronDown className="h-4 w-4" />
              </a>
            </div>
          </FadeIn>
        </div>
      </section>

      <div id="utforsk" className="relative container mx-auto px-6 md:px-16 py-16 md:py-24 max-w-5xl">
        {/* Mest populært — handpicked starting points */}
        <FadeIn>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
            Mest populært
          </p>
        </FadeIn>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {popular.map((p, i) => (
            <FadeIn key={p.href} delay={i * 0.05}>
              <MinimalCard {...p} compact />
            </FadeIn>
          ))}
        </div>

        {/* Three category cards — full browse */}
        <div className="mt-14">
          <FadeIn>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
              Utforsk per kategori
            </p>
          </FadeIn>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {categories.map((c, i) => (
              <FadeIn key={c.href} delay={i * 0.08}>
                <MinimalCard {...c} />
              </FadeIn>
            ))}
          </div>
        </div>

        {/* About section */}
        <FadeInView className="mt-16 pt-12 border-t">
          <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--kv-blue)" }}>Om prosjektet</h2>
          <p className="mt-3 text-muted-foreground leading-relaxed max-w-2xl">
            Datakart er et prosjekt der jeg utforsker hva som er mulig med åpne norske geodata. Alle kartene er bygget
            utelukkende på gratis, offentlige datakilder, uten betalte API-er eller autentisering.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
            {[
              { icon: Database, label: "12 datakilder", desc: "SSB, NVE, Kartverket, Geonorge, MET.no, Sodir, UDIR, NOBIL, Norges Bank, Eurostat, OpenStreetMap og Finn.no" },
              { icon: Globe, label: "14 interaktive visualiseringer", desc: "Kart og dashboards for bolig, skoler, helse, energi, natur, inntekt, kostnader, valg og mer — pluss detaljerte kommuneprofiler" },
              { icon: Code, label: "Åpen kildekode", desc: "Next.js, React, Leaflet og Tailwind. Hostet på Vercel." },
            ].map((item, i) => (
              <FadeInView key={item.label} delay={i * 0.1}>
                <div className="flex gap-3">
                  <div className="flex items-center justify-center h-9 w-9 rounded-lg shrink-0" style={{ background: "var(--kv-blue)" }}>
                    <item.icon className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{item.label}</p>
                    <p className="text-xs text-foreground/80 leading-relaxed mt-0.5">{item.desc}</p>
                  </div>
                </div>
              </FadeInView>
            ))}
          </div>

          <p className="text-xs text-foreground/80 mt-8">
            Laget av Anders Gram.
          </p>
        </FadeInView>
      </div>
    </div>
  );
}
