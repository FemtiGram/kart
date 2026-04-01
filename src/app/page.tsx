import Link from "next/link";
import { ArrowRight } from "lucide-react";

const projects = [
  {
    title: "Høydekart",
    description: "Søk etter en norsk adresse og finn høyden over havet — drevet av Kartverkets åpne APIer.",
    href: "/map",
  },
];

export default function Home() {
  return (
    <div className="container mx-auto px-6 md:px-16 py-20 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ color: "var(--kv-blue)" }}>
        Kartverket Explorer
      </h1>
      <p className="mt-3 text-muted-foreground text-lg">
        Prosjekter bygd på Kartverkets åpne geodata.
      </p>

      <ul className="mt-12 flex flex-col gap-4">
        {projects.map((p) => (
          <li key={p.href}>
            <Link
              href={p.href}
              className="group flex items-start justify-between gap-4 rounded-xl border bg-card p-6 hover:border-primary/40 hover:shadow-md transition-all"
            >
              <div>
                <h2 className="font-bold text-lg">{p.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 mt-0.5 text-muted-foreground opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
