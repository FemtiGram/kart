import Image from "next/image";
import { ChevronDown, BatteryCharging, Mountain, MapPinned, TrendingUp, Vote, Database, Globe, Code } from "lucide-react";
import { FadeIn, FadeInView } from "@/components/motion";
import { HomeKommuneSearch } from "@/components/home-kommune-search";
import { MinimalCard } from "@/components/minimal-card";
import { getAllKommuner } from "@/lib/kommune-profiles";
import { getHomeFacts, nb } from "@/lib/home-facts";
import thumbValg from "@/assets/thumbs/valg.webp";
import thumbBolig from "@/assets/thumbs/bolig.webp";
import thumbEnergi from "@/assets/thumbs/energikart.webp";
import thumbSted from "@/assets/thumbs/stedsprofil.webp";

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

/** Section header: small eyebrow, then one real sentence, both aligned with the cards below. */
function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-6 md:mb-8">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{eyebrow}</p>
      <h2 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight text-balance max-w-2xl" style={{ color: "var(--kv-blue)" }}>
        {title}
      </h2>
    </div>
  );
}

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

  // Every number on the data cards is derived from the build data
  // (home-facts.ts), never typed in — hand-maintained counts drift
  // ("1 700+ kraftverk" was 1 912). The two counts in "Om prosjektet" are
  // still hand-typed; that section is due for its own pass.
  const facts = getHomeFacts();

  // Curated by hand — these surface what the audience actually opens first.
  // Kept small (4) so the eye lands here and doesn't have to scan further.
  // Each card shows its map (build-time art) and one real fact from the data.
  const popular = [
    {
      href: "/bolig",
      title: "Boligpriser",
      description: facts.bolig
        ? `Enebolig ${facts.bolig.year}: fra ${nb(facts.bolig.min.price)} til ${nb(facts.bolig.max.price)} kr/m².`
        : "Kvadratmeterpris per kommune.",
      icon: TrendingUp,
      image: thumbBolig,
    },
    {
      href: "/kommune",
      title: "Stedsprofil",
      description: facts.pop
        ? `Fra ${facts.pop.min.name} (${nb(facts.pop.min.n)} innb.) til ${facts.pop.max.name} (${nb(facts.pop.max.n)}).`
        : `Alle ${facts.kommuner} kommuner i ett blikk.`,
      icon: MapPinned,
      image: thumbSted,
    },
    {
      href: "/valg",
      title: "Valgkart",
      description:
        facts.valg.winners.length >= 3
          ? `${facts.valg.winners[0].party} vant ${facts.valg.winners[0].count} kommuner, ${facts.valg.winners[1].party} ${facts.valg.winners[1].count}, ${facts.valg.winners[2].party} ${facts.valg.winners[2].count}.`
          : `Stortingsvalget ${facts.valg.year} per kommune.`,
      icon: Vote,
      image: thumbValg,
    },
    {
      href: "/energikart",
      title: "Energikart",
      description: `${nb(facts.plants)} kraftverk · ${nb(facts.totalMW)} MW installert.`,
      icon: BatteryCharging,
      image: thumbEnergi,
    },
  ];

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

      <div id="utforsk" className="relative container mx-auto px-6 md:px-16 py-14 md:py-20 max-w-5xl">
        {/* Mest populært — handpicked starting points */}
        <FadeIn>
          <SectionHeading eyebrow="Mest populært" title="Kartene flest åpner først." />
        </FadeIn>
        {/* 2 cols until lg — at md the 4-col cards get too narrow for
            un-truncated text */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {popular.map((p, i) => (
            <FadeIn key={p.href} delay={i * 0.05}>
              <MinimalCard {...p} compact />
            </FadeIn>
          ))}
        </div>

        {/* Three category cards — full browse */}
        <div className="mt-14 md:mt-20">
          <FadeIn>
            <SectionHeading eyebrow="Utforsk etter tema" title="Samfunn, energi og natur – tre innganger til hele landet." />
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
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight" style={{ color: "var(--kv-blue)" }}>Om prosjektet</h2>
          <p className="mt-3 text-muted-foreground leading-relaxed max-w-2xl">
            Datakart er et prosjekt der jeg utforsker hva som er mulig med åpne norske geodata. Alle kartene er bygget
            utelukkende på gratis, offentlige datakilder, uten betalte API-er.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
            {[
              { icon: Database, label: "13 datakilder", desc: "SSB, NVE, Kartverket, Geonorge, MET.no, Sodir, UDIR, NOBIL, Valgdirektoratet, Norges Bank, Eurostat, OpenStreetMap og OpenTopoMap" },
              { icon: Globe, label: "14 interaktive visualiseringer", desc: "Kart og dashboards for bolig, tomtegrenser, skoler, helse, energi, natur, inntekt, kostnader, valg og mer, pluss detaljerte kommuneprofiler" },
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
            Laget av{" "}
            <a
              href="https://andersgram.no"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Anders Gram
            </a>
            .
          </p>
        </FadeInView>
      </div>
    </div>
  );
}
