import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Map, Database, Compass, ArrowRight, ChevronRight } from "lucide-react";

const features = [
  {
    icon: Map,
    title: "Interaktive kart",
    description:
      "Utforsk Norge gjennom detaljerte topografiske kart og tematiske kartlag – drevet av åpne geodata.",
    href: "/map",
  },
  {
    icon: Database,
    title: "Åpne data",
    description:
      "Tilgang til tusenvis av fritt tilgjengelige datasett fra Kartverket og Geonorge.",
    href: "/data",
  },
  {
    icon: Compass,
    title: "Stedsnavn",
    description:
      "Søk og oppdage offisielle norske stedsnavn, deres opprinnelse og plassering på kart.",
    href: "/stedsnavn",
  },
];

const quickLinks = [
  { label: "Søk i stedsnavn", href: "/stedsnavn" },
  { label: "Last ned kartdata", href: "/data" },
  { label: "Høydedata API", href: "/data" },
  { label: "WMS-tjenester", href: "/map" },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* ── Hero ── */}
      <section
        className="relative flex flex-col items-start justify-end min-h-[560px] px-6 py-16 md:px-16 md:py-24 overflow-hidden"
        style={{ background: "var(--kv-blue)" }}
      >
        {/* Decorative map grid lines */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(0deg, #fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        {/* Green accent bar */}
        <div
          className="absolute left-0 top-0 h-1 w-full"
          style={{ background: "var(--kv-green)" }}
        />

        <div className="relative max-w-3xl">
          <p
            className="text-sm font-semibold uppercase tracking-widest mb-4 opacity-70"
            style={{ color: "#fff" }}
          >
            Norges kartmyndighet
          </p>
          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight text-white">
            Utforsk Norge
            <br />
            <span style={{ color: "var(--kv-green)" }}>i kart og data</span>
          </h1>
          <p className="mt-5 text-lg md:text-xl text-white/75 max-w-xl leading-relaxed">
            Et åpent utforskningsverktøy bygd på Kartverkets offentlige APIer —
            kart, stedsnavn, høydedata og mer.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href="/map" />}
              className="font-semibold"
              style={{
                background: "var(--kv-green)",
                color: "#fff",
                border: "none",
              }}
            >
              Åpne kartet <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              render={<Link href="/data" />}
              className="font-semibold border-white/30 text-white hover:bg-white/10 hover:text-white"
            >
              Utforsk data
            </Button>
          </div>
        </div>
      </section>

      {/* ── Quick links strip ── */}
      <div
        className="border-b"
        style={{ background: "var(--kv-blue-dark, #002d7a)" }}
      >
        <div className="container mx-auto px-6 md:px-16">
          <ul className="flex flex-wrap gap-x-0 divide-x divide-white/10">
            {quickLinks.map((ql) => (
              <li key={ql.label}>
                <Link
                  href={ql.href}
                  className="flex items-center gap-1.5 px-5 py-3.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
                  {ql.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Features ── */}
      <section className="container mx-auto px-6 md:px-16 py-20">
        <div className="mb-12">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Hva kan du gjøre?
          </h2>
          <p className="mt-2 text-muted-foreground max-w-lg">
            Alt er bygget på gratis, åpne offentlige data fra Kartverket og
            Geonorge.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {features.map(({ icon: Icon, title, description, href }) => (
            <Link
              key={title}
              href={href}
              className="group flex flex-col gap-5 rounded-xl border bg-card p-7 hover:border-primary/40 hover:shadow-md transition-all"
            >
              <div
                className="flex h-12 w-12 items-center justify-center rounded-lg"
                style={{ background: "var(--kv-blue-light, #e8edf8)" }}
              >
                <Icon
                  className="h-6 w-6"
                  style={{ color: "var(--kv-blue)" }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  {title}
                  <ArrowRight className="h-4 w-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── CTA banner ── */}
      <section
        className="mt-4"
        style={{ background: "var(--kv-green-light, #e6f7ec)" }}
      >
        <div className="container mx-auto px-6 md:px-16 py-14 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h2
              className="text-xl font-bold"
              style={{ color: "var(--kv-green-dark, #008a32)" }}
            >
              Klar til å utforske Norge?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              Start med det interaktive kartet eller gå rett til de åpne
              datasettene.
            </p>
          </div>
          <Button
            size="lg"
            nativeButton={false}
            render={<Link href="/map" />}
            className="shrink-0 font-semibold"
            style={{ background: "var(--kv-green)", color: "#fff", border: "none" }}
          >
            Kom i gang <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </section>
    </div>
  );
}
