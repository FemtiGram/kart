import Link from "next/link";
import { MapPinned, GraduationCap, HeartPulse, DollarSign, TrendingUp, Wallet, Vote, BarChart3, ArrowRight } from "lucide-react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { CategoryHero } from "@/components/category-hero";
import { CategoryMapCard } from "@/components/category-map-card";

export const metadata = {
  title: "Samfunn i Norge — bolig, inntekt, helse, skoler og valg",
  description:
    "Utforsk hvordan livet ser ut i hver av Norges 357 kommuner: kvadratmeterpriser, median inntekt, kommunale gebyrer, fastlegekapasitet, skoletilbud, valgresultater og inflasjon — alt på interaktivt kart.",
  alternates: { canonical: "/samfunn" },
  openGraph: {
    title: "Samfunn i Norge — bolig, inntekt, helse, skoler og valg",
    description: "Utforsk hvordan livet ser ut i hver av Norges 357 kommuner.",
    type: "website",
    url: "/samfunn",
  },
};

const featured = {
  href: "/kommune",
  title: "Stedsprofil",
  description: "Hver av Norges 357 kommuner i ett sammendrag — fra boligpriser til skoletilbud, energi, vernet natur og politikk.",
  bullets: [
    "Alle 357 kommuner",
    "Auto-generert sammendrag i 3 setninger",
    "Lignende-kommuner-anbefaling",
  ],
  icon: MapPinned,
};

const maps = [
  {
    href: "/bolig",
    title: "Boligpriser",
    description: "Kvadratmeterpris for enebolig, småhus og blokkleilighet i hver kommune — med 10 års prisutvikling og direktelink til Finn.no.",
    bullets: [
      "Bobletkart farget etter percentil",
      "10 års historikk fra SSB",
      "Sammenlign to kommuner",
    ],
    icon: TrendingUp,
    badge: "Populært",
  },
  {
    href: "/lonn",
    title: "Inntektskart",
    description: "Median inntekt etter skatt per husholdning i hver kommune — hvor lever folk best?",
    bullets: [
      "Choropleth fra SSB InntektStruk13",
      "Rangering blant alle 357",
      "Sammenlign to kommuner",
    ],
    icon: DollarSign,
  },
  {
    href: "/kostnader",
    title: "Kostnader",
    description: "Kommunale gebyrer (vann, avløp, avfall, feiing) og eiendomsskatt for en standard 120 m² enebolig — hvor er det dyrest å bo?",
    bullets: [
      "SSB tabell 12842 + 14674",
      "Sammenlign to kommuner",
      "«Ingen eiendomsskatt» fremhevet",
    ],
    icon: Wallet,
  },
  {
    href: "/helse",
    title: "Helsetilbud",
    description: "Fastlegesituasjon per kommune: ledig kapasitet, andel uten fastlege, pasienter per lege — pluss sykehus og legevakt på kart.",
    bullets: [
      "SSB tabell 12005 (18 metrikker)",
      "Plain-Norwegian sammendrag",
      "OSM-overlay for sykehus",
    ],
    icon: HeartPulse,
  },
  {
    href: "/skoler",
    title: "Skoler og barnehager",
    description: "Alle grunnskoler, videregående og barnehager i Norge med antall elever, eierskap og koordinater.",
    bullets: [
      "Data fra UDIR (NSR + NBR)",
      "Klustring på lavt zoom",
      "Filter på skoletype",
    ],
    icon: GraduationCap,
  },
  {
    href: "/valg",
    title: "Valgkart",
    description: "Stortingsvalget 2025 og 2021, kommunestyrevalget 2023 og 2019 — vinnerparti, frammøte og endring per kommune.",
    bullets: [
      "Offisielle tall fra Valgdirektoratet",
      "4 valg å bytte mellom",
      "Sammenlign to kommuner",
    ],
    icon: Vote,
    badge: "Nytt",
  },
  {
    href: "/prisvekst",
    title: "Prisvekst",
    description: "Konsumprisindeksen i sanntid: hvilke kategorier driver inflasjonen, hvor langt er vi fra Norges Banks 2 %-mål, og hvordan ligger vi an mot Norden.",
    bullets: [
      "KPI + KPI-JAE fra SSB",
      "Norges Banks styringsrente",
      "Eurostat HICP for Norden",
    ],
    icon: BarChart3,
  },
];

const faqs = [
  {
    q: "Hva er Stedsprofil?",
    a: "Stedsprofil er en automatisk generert oppsummering av hver av Norges 357 kommuner — alt fra befolkningstall og boligpriser til skoletilbud, helse, energi og politikk samlet på én side. Hver profil bygges på offentlige data fra SSB, NVE, UDIR, Kartverket og andre kilder.",
  },
  {
    q: "Hvorfor er noen kommuner uten data?",
    a: "SSB publiserer ikke alle tall for kommuner med svært få husholdninger, av personvernhensyn. Disse vises i grått på choropleth-kartene. For bolig spesifikt mangler tall i kommuner med få salg per år. For helse vises latest-year data (2025), men noen mindre kommuner har ikke alle 18 metrikker rapportert.",
  },
  {
    q: "Hvor ofte oppdateres tallene?",
    a: "Det varierer per kilde: skoler og ladestasjoner er bygd inn ved hver utrulling. Bolig- og inntektsdata oppdateres typisk én gang i året (SSB publiserer i april–juni for året før). KPI publiseres månedlig. Valgresultater er statiske etter at de er endelige. Hver detalj-side viser kildens publiseringsår.",
  },
];

const collectionJsonLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Samfunn i Norge — Datakart",
  description:
    "Samling av interaktive kart over norsk samfunn: boligpriser, inntekt, helse, skoler, valgresultater, kostnader, prisvekst og 357 stedsprofiler.",
  inLanguage: "no",
  url: "https://datakart.no/samfunn",
  hasPart: [featured, ...maps].map((m) => ({
    "@type": "WebPage",
    name: m.title,
    url: `https://datakart.no${m.href}`,
    description: m.description,
  })),
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function SamfunnCategoryPage() {
  return (
    <>
      <CategoryHero
        eyebrow="DATAKART · Kategori"
        title="Samfunn"
        intro="Hvor er det dyrest å kjøpe hus? Hvor mange fastleger har egentlig din kommune ledig kapasitet hos? Hvilket parti vant der du bor? Disse kartene viser hvordan livet i Norge ser ut — kommune for kommune — basert på offisielle data fra SSB, UDIR, Valgdirektoratet og Norges Bank."
      />

      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 py-10 md:py-12 max-w-4xl">
          {/* Featured: Stedsprofil */}
          <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
              Anbefalt — alle kommuner i ett sammendrag
            </p>
            <CategoryMapCard {...featured} />
          </div>

          {/* All other maps */}
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
            Tematiske kart
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {maps.map((m) => (
              <CategoryMapCard key={m.href} {...m} />
            ))}
          </div>

          <div className="mt-10 rounded-2xl border bg-muted/40 px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold">Også relevant: energi og natur</p>
              <p className="text-xs text-foreground/80 mt-0.5">
                Stedsprofilen kombinerer alle tre kategorier — boligpriser, kraftverk og verneområder samlet per kommune.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link
                href="/energi"
                className="inline-flex items-center gap-1 rounded-xl border bg-card hover:bg-muted px-3 py-1.5 text-xs font-semibold transition-colors"
              >
                Energi <ArrowRight className="h-3 w-3" />
              </Link>
              <Link
                href="/natur"
                className="inline-flex items-center gap-1 rounded-xl border bg-card hover:bg-muted px-3 py-1.5 text-xs font-semibold transition-colors"
              >
                Natur <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 pt-5 pb-12 md:pb-16 max-w-3xl">
          <h2 className="text-2xl font-extrabold tracking-tight mb-6" style={{ color: "var(--kv-blue)" }}>
            Ofte stilte spørsmål om samfunnsdata
          </h2>
          <Accordion>
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger>{f.q}</AccordionTrigger>
                <AccordionContent>
                  <p className="text-foreground/80 leading-relaxed">{f.a}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <p className="text-xs text-foreground/80 mt-8">
            Data fra <a href="https://www.ssb.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">SSB</a>, <a href="https://www.udir.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">UDIR</a>, <a href="https://valgresultat.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Valgdirektoratet</a> og <a href="https://www.norges-bank.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Norges Bank</a>.
          </p>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
    </>
  );
}
