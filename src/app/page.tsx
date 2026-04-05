import Link from "next/link";
import { ArrowRight, Mountain, DollarSign, Shield, Zap, Home as HomeIcon, BatteryCharging, Waves } from "lucide-react";

const featured = {
  title: "Høydekart",
  description: "Søk etter adresse eller klikk i kartet. Få høyde over havet, værdata og veibeskrivelse.",
  href: "/map",
  icon: Mountain,
};

const groups = [
  {
    label: "Utforsk",
    items: [
      {
        title: "Energikart",
        description: "Norges fornybare kraftverk. Vindkraft og vannkraft på kart.",
        href: "/energi",
        icon: BatteryCharging,
      },
      {
        title: "Magasinkart",
        description: "Regulerte vannmagasiner med sanntids vanndata fra NVE.",
        href: "/magasin",
        icon: Waves,
      },
      {
        title: "Ladestasjoner",
        description: "Elbilladestasjoner i Norge. Kontakttyper, kapasitet og veibeskrivelse.",
        href: "/lading",
        icon: Zap,
      },
      {
        title: "Turisthytter",
        description: "DNT-hytter og fjellhytter. Type, høyde over havet og sengeplasser.",
        href: "/hytter",
        icon: HomeIcon,
      },
    ],
  },
  {
    label: "Statistikk",
    items: [
      {
        title: "Inntektskart",
        description: "Median inntekt etter skatt per husholdning i alle norske kommuner.",
        href: "/lonn",
        icon: DollarSign,
      },
      {
        title: "Verneområder",
        description: "Nasjonalparker, naturreservater og andre verneområder på kart.",
        href: "/vern",
        icon: Shield,
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
          MapGram
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
              <div className={`grid grid-cols-1 gap-4 ${group.items.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                {group.items.map((item) => (
                  <CardLink key={item.href} {...item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
