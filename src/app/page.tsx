import Link from "next/link";
import { ArrowRight, Mountain, DollarSign, Shield, Zap, Home as HomeIcon } from "lucide-react";

const featured = {
  title: "Høydekart",
  description: "Søk etter adresse eller klikk i kartet. Få høyde over havet, værdata og veibeskrivelse.",
  href: "/map",
  icon: Mountain,
};

const groups = [
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
  {
    label: "Utforsk",
    items: [
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
];

function CardLink({ href, icon: Icon, title, description, large }: {
  href: string; icon: typeof Mountain; title: string; description: string; large?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col justify-between rounded-xl border backdrop-blur-sm transition-all ${
        large
          ? "border-white/30 bg-white/15 p-6 hover:bg-white/25 hover:border-white/50"
          : "border-white/20 bg-white/10 p-5 hover:bg-white/20 hover:border-white/40"
      }`}
    >
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Icon className={`${large ? "h-6 w-6" : "h-5 w-5"} text-white/90`} />
          <h2 className={`font-bold text-white ${large ? "text-lg" : "text-base"}`}>{title}</h2>
        </div>
        <p className={`text-white/80 leading-relaxed ${large ? "text-base" : "text-sm"}`}>{description}</p>
      </div>
      <div className={`flex items-center gap-1.5 mt-4 font-medium text-white/70 group-hover:text-white/90 transition-colors ${large ? "text-sm" : "text-xs"}`}>
        Åpne kart
        <ArrowRight className="h-3.5 w-3.5 -translate-x-1 group-hover:translate-x-0 transition-transform" />
      </div>
    </Link>
  );
}

export default function Home() {
  return (
    <div className="relative min-h-[calc(100svh-57px)] flex items-center">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/background.webp')" }}
      />
      {/* Dark overlay for contrast */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Content */}
      <div className="relative z-10 container mx-auto px-6 md:px-16 py-20 max-w-5xl">
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white">
          MapGram
        </h1>
        <p className="mt-4 text-white/80 text-lg md:text-xl max-w-md">
          Prosjekter hvor jeg ser hva som er mulig med åpne geodata.
        </p>

        {/* Featured card */}
        <div className="mt-12">
          <CardLink {...featured} large />
        </div>

        {/* Grouped cards */}
        <div className="mt-6 space-y-6">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-3">
                {group.label}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
