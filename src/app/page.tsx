import Link from "next/link";
import { ArrowRight, Mountain, DollarSign, Shield, Zap } from "lucide-react";

const projects = [
  {
    title: "Høydekart",
    description: "Søk etter adresse eller klikk i kartet. Få høyde over havet, værdata og veibeskrivelse.",
    href: "/map",
    icon: Mountain,
  },
  {
    title: "Inntektskart",
    description: "Utforsk median inntekt etter skatt per husholdning i alle norske kommuner.",
    href: "/lonn",
    icon: DollarSign,
  },
  {
    title: "Verneområder",
    description: "Se nasjonalparker, naturreservater og andre verneområder i Norge på kart.",
    href: "/vern",
    icon: Shield,
  },
  {
    title: "Ladestasjoner",
    description: "Se elbilladestasjoner i Norge. Kontakttyper, kapasitet og veibeskrivelse.",
    href: "/lading",
    icon: Zap,
  },
];

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
        <p className="mt-4 text-white/70 text-lg md:text-xl max-w-md">
          Prosjekter hvor jeg ser hva som er mulig med åpne geodata.
        </p>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => {
            const Icon = p.icon;
            return (
              <Link
                key={p.href}
                href={p.href}
                className="group flex flex-col justify-between rounded-xl border border-white/20 bg-white/10 backdrop-blur-sm p-5 hover:bg-white/20 hover:border-white/40 transition-all"
              >
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="h-5 w-5 text-white/80" />
                    <h2 className="font-bold text-base text-white">{p.title}</h2>
                  </div>
                  <p className="text-sm text-white/60 leading-relaxed">{p.description}</p>
                </div>
                <div className="flex items-center gap-1.5 mt-4 text-xs font-medium text-white/50 group-hover:text-white/80 transition-colors">
                  Åpne kart
                  <ArrowRight className="h-3.5 w-3.5 -translate-x-1 group-hover:translate-x-0 transition-transform" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
