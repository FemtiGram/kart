import Link from "next/link";
import { ArrowRight, Mountain, DollarSign, Shield, Zap, Home as HomeIcon, BatteryCharging, Waves, Database, Globe, Code, TrendingUp, BarChart3 } from "lucide-react";
import { FadeIn, FadeInView, HoverLift } from "@/components/motion";

const featured = [
  {
    title: "Boligpriser",
    description: "Kvadratmeterpris for eneboliger, småhus og blokkleiligheter i alle kommuner.",
    href: "/bolig",
    icon: TrendingUp,
  },
  {
    title: "Prisvekst",
    description: "Konsumprisindeksen med kategorifordeling og nordisk sammenligning.",
    href: "/prisvekst",
    icon: BarChart3,
    cta: "Åpne oversikt",
  },
];

const groups = [
  {
    label: "Energi",
    items: [
      {
        title: "Energikart",
        description: "Vindkraft, vannkraft, havvind og olje- og gassanlegg med produksjonsdata.",
        href: "/energi",
        icon: BatteryCharging,
      },
      {
        title: "Magasinkart",
        description: "Regulerte vannmagasiner med nasjonal fyllingsgrad og polygon-visning.",
        href: "/magasin",
        icon: Waves,
      },
      {
        title: "Ladestasjoner",
        description: "Alle elbilladestasjoner i Norge med kontakttyper, kapasitet og veibeskrivelse.",
        href: "/lading",
        icon: Zap,
      },
    ],
  },
  {
    label: "Natur",
    items: [
      {
        title: "Høydekart",
        description: "Klikk hvor som helst for høyde over havet, vær og terrengkart.",
        href: "/map",
        icon: Mountain,
      },
      {
        title: "Turisthytter",
        description: "DNT-hytter og fjellhytter med sengeplasser, høyde og vær.",
        href: "/hytter",
        icon: HomeIcon,
      },
      {
        title: "Verneområder",
        description: "Nasjonalparker, naturreservater og andre verneområder.",
        href: "/vern",
        icon: Shield,
      },
    ],
  },
  {
    label: "Samfunn",
    items: [
      {
        title: "Inntektskart",
        description: "Median inntekt etter skatt per husholdning i alle kommuner.",
        href: "/lonn",
        icon: DollarSign,
      },
    ],
  },
];

function CardLink({ href, icon: Icon, title, description, cta = "Åpne kart", index = 0 }: {
  href: string; icon: typeof Mountain; title: string; description: string; cta?: string; index?: number;
}) {
  return (
    <FadeInView delay={index * 0.08}>
      <HoverLift className="h-full">
        <Link
          href={href}
          className="group flex flex-col justify-between rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition-shadow p-5 h-full"
        >
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="flex items-center justify-center rounded-lg h-8 w-8" style={{ background: "#24374c" }}>
                <Icon className="h-4 w-4 text-white" />
              </div>
              <h2 className="font-bold text-base">{title}</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
          </div>
          <div className="flex items-center gap-1.5 mt-4 font-medium text-muted-foreground group-hover:text-foreground transition-colors text-xs">
            {cta}
            <ArrowRight className="h-3.5 w-3.5 -translate-x-1 group-hover:translate-x-0 transition-transform" />
          </div>
        </Link>
      </HoverLift>
    </FadeInView>
  );
}

export default function Home() {
  return (
    <div className="relative min-h-[calc(100svh-57px)] bg-background overflow-hidden">
      {/* Subtle background accents */}
      <div
        className="pointer-events-none absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full opacity-[0.07]"
        style={{ background: "radial-gradient(circle, var(--kv-blue) 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute top-1/2 -left-48 h-[400px] w-[400px] rounded-full opacity-[0.04]"
        style={{ background: "radial-gradient(circle, #24374c 0%, transparent 70%)" }}
      />
      {/* Content */}
      <div className="relative container mx-auto px-6 md:px-16 py-16 md:py-24 max-w-5xl">
        <FadeIn>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight" style={{ color: "#24374c" }}>
            Datakart
          </h1>
        </FadeIn>
        <FadeIn delay={0.1}>
          <p className="mt-3 text-muted-foreground text-lg md:text-xl max-w-md">
            Prosjekter hvor jeg ser hva som er mulig med åpne geodata.
          </p>
        </FadeIn>

        {/* All card groups */}
        <div className="mt-12 space-y-8">
          {/* Featured */}
          <div>
            <FadeInView>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Aktuelt
              </p>
            </FadeInView>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {featured.map((item, i) => (
                <CardLink key={item.href} {...item} index={i} />
              ))}
            </div>
          </div>
          {groups.map((group) => (
            <div key={group.label}>
              <FadeInView>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  {group.label}
                </p>
              </FadeInView>
              <div className={`grid grid-cols-1 gap-4 ${group.items.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                {group.items.map((item, i) => (
                  <CardLink key={item.href} {...item} index={i} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* About section */}
        <FadeInView className="mt-16 pt-12 border-t">
          <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: "#24374c" }}>Om prosjektet</h2>
          <p className="mt-3 text-muted-foreground leading-relaxed max-w-2xl">
            Datakart er et prosjekt der jeg utforsker hva som er mulig med åpne norske geodata. Alle kartene er bygget
            utelukkende på gratis, offentlige datakilder, uten betalte API-er eller autentisering.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
            {[
              { icon: Database, label: "7 datakilder", desc: "NVE, Sodir, SSB, Kartverket, MET.no, Geonorge og OpenStreetMap" },
              { icon: Globe, label: "9 interaktive visualiseringer", desc: "Energi, boligpriser, lading, magasin, hytter, høyde, inntekt og verneområder" },
              { icon: Code, label: "Åpen kildekode", desc: "Next.js, React, Leaflet og Tailwind. Hostet på Vercel." },
            ].map((item, i) => (
              <FadeInView key={item.label} delay={i * 0.1}>
                <div className="flex gap-3">
                  <div className="flex items-center justify-center h-9 w-9 rounded-lg shrink-0" style={{ background: "#24374c" }}>
                    <item.icon className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{item.label}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{item.desc}</p>
                  </div>
                </div>
              </FadeInView>
            ))}
          </div>

          <p className="text-xs text-muted-foreground mt-8">
            Laget av Anders Gram.
          </p>
        </FadeInView>
      </div>
    </div>
  );
}
