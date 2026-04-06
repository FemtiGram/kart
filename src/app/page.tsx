import Link from "next/link";
import { ArrowRight, Mountain, DollarSign, Shield, Zap, Home as HomeIcon, BatteryCharging, Waves, Database, Globe, Code } from "lucide-react";

const featured = {
  title: "Energikart",
  description: "Norges komplette energibilde. Vindkraft, vannkraft, planlagt havvind og over 1200 olje- og gassanlegg med rørledninger — alt på ett kart.",
  href: "/energi",
  icon: BatteryCharging,
};

const groups = [
  {
    label: "Energi",
    items: [
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

function CardLink({ href, icon: Icon, title, description, large }: {
  href: string; icon: typeof Mountain; title: string; description: string; large?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col justify-between rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition-all ${
        large ? "p-6" : "p-5"
      }`}
    >
      <div>
        <div className="flex items-center gap-2.5 mb-2">
          <div className={`flex items-center justify-center rounded-lg ${large ? "h-10 w-10" : "h-8 w-8"}`} style={{ background: "#24374c" }}>
            <Icon className={`${large ? "h-5 w-5" : "h-4 w-4"} text-white`} />
          </div>
          <h2 className={`font-bold ${large ? "text-lg" : "text-base"}`}>{title}</h2>
        </div>
        <p className={`text-muted-foreground leading-relaxed ${large ? "text-base" : "text-sm"}`}>{description}</p>
      </div>
      <div className={`flex items-center gap-1.5 mt-4 font-medium text-muted-foreground group-hover:text-foreground transition-colors ${large ? "text-sm" : "text-xs"}`}>
        Åpne kart
        <ArrowRight className="h-3.5 w-3.5 -translate-x-1 group-hover:translate-x-0 transition-transform" />
      </div>
    </Link>
  );
}

export default function Home() {
  return (
    <div className="relative min-h-[calc(100svh-57px)] bg-background overflow-hidden">
      {/* Subtle background accents */}
      <div
        className="pointer-events-none absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full opacity-[0.07]"
        style={{ background: "radial-gradient(circle, #003da5 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute top-1/2 -left-48 h-[400px] w-[400px] rounded-full opacity-[0.04]"
        style={{ background: "radial-gradient(circle, #24374c 0%, transparent 70%)" }}
      />
      {/* Content */}
      <div className="relative container mx-auto px-6 md:px-16 py-16 md:py-24 max-w-5xl">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight" style={{ color: "#24374c" }}>
          Datakart
        </h1>
        <p className="mt-3 text-muted-foreground text-lg md:text-xl max-w-md">
          Prosjekter hvor jeg ser hva som er mulig med åpne geodata.
        </p>

        {/* Featured card */}
        <div className="mt-12">
          <CardLink {...featured} large />
        </div>

        {/* Grouped cards */}
        <div className="mt-8 space-y-8">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3">
                {group.label}
              </p>
              <div className={`grid grid-cols-1 gap-4 ${group.items.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                {group.items.map((item) => (
                  <CardLink key={item.href} {...item} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* About section */}
        <div className="mt-16 pt-12 border-t">
          <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: "#24374c" }}>Om prosjektet</h2>
          <p className="mt-3 text-muted-foreground leading-relaxed max-w-2xl">
            Datakart er et prosjekt der jeg utforsker hva som er mulig med åpne norske geodata. Alle kartene er bygget
            utelukkende på gratis, offentlige datakilder — uten betalte API-er eller autentisering.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
            <div className="flex gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg shrink-0" style={{ background: "#24374c" }}>
                <Database className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="font-semibold text-sm">7 datakilder</p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                  NVE, Sodir, SSB, Kartverket, MET.no, Geonorge og OpenStreetMap
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg shrink-0" style={{ background: "#24374c" }}>
                <Globe className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="font-semibold text-sm">7 interaktive kart</p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                  Energi, lading, magasin, hytter, høyde, inntekt og verneområder
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg shrink-0" style={{ background: "#24374c" }}>
                <Code className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="font-semibold text-sm">Åpen kildekode</p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                  Next.js, React, Leaflet og Tailwind. Hostet på Vercel.
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-8">
            Laget av Anders Gram.
          </p>
        </div>
      </div>
    </div>
  );
}
