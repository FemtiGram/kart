import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChevronDown, Mountain, DollarSign, Shield, Zap, Home as HomeIcon, BatteryCharging, Waves, Database, Globe, Code, TrendingUp, BarChart3, MapPinned, GraduationCap, HeartPulse, Wallet } from "lucide-react";
import { FadeIn, FadeInView, HoverLift } from "@/components/motion";

const featured = [
  {
    title: "Stedsprofil",
    description: "Alle 357 kommuner i ett sammendrag: befolkning, økonomi, energi, natur og infrastruktur.",
    href: "/kommune",
    icon: MapPinned,
    cta: "Utforsk kommuner",
  },
  {
    title: "Boligpriser",
    description: "Kvadratmeterpris for eneboliger, småhus og blokkleiligheter i alle kommuner.",
    href: "/bolig",
    icon: TrendingUp,
  },
  {
    title: "Skoler og barnehager",
    description: "Alle 3 100+ skoler og 5 500+ barnehager i Norge med elev- og barnetall, trinn og eierskap.",
    href: "/skoler",
    icon: GraduationCap,
  },
];

// Group items are shown as compact cards — icon + title + one-line
// description + arrow. Descriptions mirror the navbar dropdown wording
// so the two surfaces read consistently. Entries with `isNew: true`
// get a green "Ny" pill next to the title.
interface GroupItem {
  title: string;
  description: string;
  href: string;
  icon: typeof Mountain;
  isNew?: boolean;
}

const groups: Array<{ label: string; items: GroupItem[] }> = [
  {
    label: "Energi",
    items: [
      { title: "Energikart", description: "Vind, vann, olje og gass", href: "/energi", icon: BatteryCharging },
      { title: "Magasinkart", description: "Vannmagasiner og fyllingsgrad", href: "/magasin", icon: Waves },
      { title: "Ladestasjoner", description: "Elbil-lading i hele Norge", href: "/lading", icon: Zap },
    ],
  },
  {
    label: "Natur",
    items: [
      { title: "Høydekart", description: "Høydedata og værforhold", href: "/map", icon: Mountain },
      { title: "Turisthytter", description: "DNT-hytter og fjellstuer", href: "/hytter", icon: HomeIcon },
      { title: "Verneområder", description: "Nasjonalparker og naturreservater", href: "/vern", icon: Shield },
    ],
  },
  {
    label: "Samfunn",
    items: [
      { title: "Helsetilbud", description: "Fastleger, sykehus og legevakt", href: "/helse", icon: HeartPulse },
      { title: "Inntektskart", description: "Median inntekt per kommune", href: "/lonn", icon: DollarSign },
      { title: "Kostnader", description: "Gebyrer og eiendomsskatt", href: "/kostnader", icon: Wallet, isNew: true },
      { title: "Prisvekst", description: "Konsumprisindeksen i Norge", href: "/prisvekst", icon: BarChart3 },
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
          <div className="flex items-center gap-1.5 mt-4 font-medium text-foreground/70 group-hover:text-foreground transition-colors text-xs">
            {cta}
            <ArrowRight className="h-3.5 w-3.5 -translate-x-1 group-hover:translate-x-0 transition-transform" />
          </div>
        </Link>
      </HoverLift>
    </FadeInView>
  );
}

/**
 * Compact row card for the grouped sections: icon tile + title + a
 * one-line description underneath + arrow. Denser than CardLink but
 * still gives enough hint text so the grid reads at a glance. Used
 * under Energi/Natur/Samfunn; Aktuelt still uses the larger CardLink
 * so the flagship row keeps its selling space.
 */
function CompactCardLink({
  href,
  icon: Icon,
  title,
  description,
  isNew = false,
  index = 0,
}: {
  href: string;
  icon: typeof Mountain;
  title: string;
  description: string;
  isNew?: boolean;
  index?: number;
}) {
  return (
    <FadeInView delay={index * 0.04}>
      <HoverLift className="h-full">
        <Link
          href={href}
          className="group flex items-center gap-3 rounded-xl border border-border bg-card hover:shadow-md transition-shadow px-3.5 py-3 h-full"
        >
          <div
            className="flex items-center justify-center rounded-lg h-10 w-10 shrink-0"
            style={{ background: "#24374c" }}
          >
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm truncate">{title}</h3>
              {isNew && (
                <span
                  className="text-[10px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 shrink-0"
                  style={{
                    background: "var(--kv-positive-light)",
                    color: "var(--kv-positive-dark)",
                  }}
                >
                  Ny
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {description}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-foreground/50 shrink-0 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
        </Link>
      </HoverLift>
    </FadeInView>
  );
}

export default function Home() {
  return (
    <div className="bg-background">
      {/* Hero section */}
      <section className="relative h-[75svh] min-h-[500px] overflow-hidden">
        <Image
          src="/img/banner_1920.webp"
          alt="Lofoten, Norge"
          fill
          priority
          className="object-cover object-[center_30%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
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
          <FadeIn delay={0.2}>
            <a
              href="#utforsk"
              className="inline-flex items-center gap-2 mt-8 rounded-full bg-white text-[#24374c] font-semibold text-sm px-7 py-3 hover:bg-white/90 transition-colors w-fit shadow-xl"
            >
              Utforsk kartene
              <ChevronDown className="h-4 w-4" />
            </a>
          </FadeIn>
        </div>
      </section>

      {/* Content */}
      <div id="utforsk" className="relative container mx-auto px-6 md:px-16 py-16 md:py-24 max-w-5xl">
        {/* All card groups */}
        <div className="space-y-8">
          {/* Featured */}
          <div>
            <FadeInView>
              <p className="text-xs font-semibold uppercase tracking-widest text-foreground/70 mb-3">
                Aktuelt
              </p>
            </FadeInView>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {featured.map((item, i) => (
                <CardLink key={item.href} {...item} index={i} />
              ))}
            </div>
          </div>
          {groups.map((group) => (
            <div key={group.label}>
              <FadeInView>
                <p className="text-xs font-semibold uppercase tracking-widest text-foreground/70 mb-3">
                  {group.label}
                </p>
              </FadeInView>
              <div
                className={`grid grid-cols-2 gap-3 ${group.items.length === 4 ? "md:grid-cols-4" : "md:grid-cols-3"}`}
              >
                {group.items.map((item, i) => (
                  <CompactCardLink key={item.href} {...item} index={i} />
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
              { icon: Database, label: "12 datakilder", desc: "SSB, NVE, Kartverket, Geonorge, MET.no, Sodir, UDIR, NOBIL, Norges Bank, Eurostat, OpenStreetMap og Finn.no" },
              { icon: Globe, label: "13 interaktive visualiseringer", desc: "Kart og dashboards for bolig, skoler, helse, energi, natur, inntekt, kostnader og mer — pluss detaljerte kommuneprofiler" },
              { icon: Code, label: "Åpen kildekode", desc: "Next.js, React, Leaflet og Tailwind. Hostet på Vercel." },
            ].map((item, i) => (
              <FadeInView key={item.label} delay={i * 0.1}>
                <div className="flex gap-3">
                  <div className="flex items-center justify-center h-9 w-9 rounded-lg shrink-0" style={{ background: "#24374c" }}>
                    <item.icon className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{item.label}</p>
                    <p className="text-xs text-foreground/70 leading-relaxed mt-0.5">{item.desc}</p>
                  </div>
                </div>
              </FadeInView>
            ))}
          </div>

          <p className="text-xs text-foreground/70 mt-8">
            Laget av Anders Gram.
          </p>
        </FadeInView>
      </div>
    </div>
  );
}
