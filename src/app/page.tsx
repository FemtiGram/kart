import Link from "next/link";
import { ArrowRight } from "lucide-react";

const projects = [
  {
    title: "Høydekart",
    description: "Søk etter adresse eller klikk i kartet. Få høyde over havet, værdata og veibeskrivelse.",
    href: "/map",
  },
  {
    title: "Inntektskart",
    description: "Utforsk median inntekt etter skatt per husholdning i alle norske kommuner.",
    href: "/lonn",
  },
  {
    title: "Ladestasjoner",
    description: "Se alle elbilladestasjoner i Norge på kart. Klikk en stasjon for å se kontakttyper og kapasitet.",
    href: "/lading",
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
      <div className="relative z-10 container mx-auto px-6 md:px-16 py-20 max-w-2xl">
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white">
          MapGram
        </h1>
        <p className="mt-4 text-white/70 text-lg md:text-xl max-w-md">
          Prosjekter hvor jeg ser hva som er mulig med åpne geodata.
        </p>

        <ul className="mt-12 flex flex-col gap-4">
          {projects.map((p) => (
            <li key={p.href}>
              <Link
                href={p.href}
                className="group flex items-start justify-between gap-4 rounded-xl border border-white/20 bg-white/10 backdrop-blur-sm p-6 hover:bg-white/20 hover:border-white/40 transition-all"
              >
                <div>
                  <h2 className="font-bold text-lg text-white">{p.title}</h2>
                  <p className="mt-1 text-sm text-white/60">{p.description}</p>
                </div>
                <ArrowRight className="h-5 w-5 shrink-0 mt-0.5 text-white/60 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
