import Link from "next/link";
import { Mountain, Home, Shield, ArrowRight } from "lucide-react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { CategoryHero } from "@/components/category-hero";
import { MinimalCard } from "@/components/minimal-card";

export const metadata = {
  title: "Natur i Norge — fjell, hytter og verneområder",
  description:
    "Utforsk norsk natur på interaktivt kart: høydedata for hele landet, DNT-hytter og fjellstuer, og over 5 000 verneområder. Værmelding for valgt punkt fra MET Norway.",
  alternates: { canonical: "/natur" },
  openGraph: {
    title: "Natur i Norge — fjell, hytter og verneområder",
    description: "Utforsk norsk natur på interaktivt kart.",
    type: "website",
    url: "/natur",
  },
};

const maps = [
  {
    href: "/map",
    title: "Høydekart",
    description: "Klikk hvor som helst i Norge for høyde over havet og oppdatert værmelding fra MET.",
    icon: Mountain,
  },
  {
    href: "/hytter",
    title: "Turisthytter",
    description: "DNT-hytter, fjellstuer og ubetjente hytter i hele Norge.",
    icon: Home,
  },
  {
    href: "/vern",
    title: "Verneområder",
    description: "Andel vernet areal per kommune — nasjonalparker og naturreservater.",
    icon: Shield,
  },
];

const faqs = [
  {
    q: "Hvor mye av Norge er vernet?",
    a: "Cirka 17 % av landarealet er formelt vernet — som nasjonalparker, naturreservater eller landskapsvernområder. Andelen varierer dramatisk per kommune: noen kommuner har under 1 % vernet, mens kommuner som Lom og Vågå har over 40 %.",
  },
  {
    q: "Hva er forskjellen mellom DNT-hytte og fjellstue?",
    a: "DNT-hytter drives av Den Norske Turistforening og dekker hele landet. Fjellstuer er gamle statlige overnattingssteder langs hovedfjellovergangene — historisk for posten og reisende. Mange fjellstuer er nå i privat eller DNT-drift, og blandes ofte med vanlige DNT-hytter.",
  },
  {
    q: "Hvorfor er værmeldingen forskjellig fra yr.no?",
    a: "Det er den ikke — begge bruker MET Norways prognoseimotor. Vi henter samme datapunkt som yr.no via deres åpne API. Forskjeller skyldes at vi viser nærmeste regulære grid-rute, mens yr.no kan ha mer presise lokasjoner for kjente steder.",
  },
];

const collectionJsonLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Natur i Norge — Datakart",
  description:
    "Samling av interaktive kart over norsk natur: høydedata, fjellhytter og verneområder.",
  inLanguage: "no",
  url: "https://datakart.no/natur",
  hasPart: maps.map((m) => ({
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

export default function NaturCategoryPage() {
  return (
    <>
      <CategoryHero
        eyebrow="DATAKART · Kategori"
        title="Natur"
        intro="Fra Lindesnes i sør til Nordkapp er Norge dominert av fjell, vidder, fjorder og urørt natur. Disse kartene gir deg verktøyene til å planlegge fjellturen, finne nærmeste DNT-hytte, sjekke været på toppen, eller utforske hvor mye av landet vi har valgt å verne for fremtidige generasjoner."
      />

      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 py-10 md:py-12 max-w-4xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {maps.map((m) => (
              <MinimalCard key={m.href} {...m} />
            ))}
          </div>

          <div className="mt-10 rounded-2xl border bg-muted/40 px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold">Også relevant: stedsprofil og energi</p>
              <p className="text-xs text-foreground/80 mt-0.5">
                Stedsprofilen viser hyttebestand og verneandel per kommune. Energikart viser kraftverk i naturområder.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link
                href="/kommune"
                className="inline-flex items-center gap-1 rounded-xl border bg-card hover:bg-muted px-3 py-1.5 text-xs font-semibold transition-colors"
              >
                Stedsprofil <ArrowRight className="h-3 w-3" />
              </Link>
              <Link
                href="/energi"
                className="inline-flex items-center gap-1 rounded-xl border bg-card hover:bg-muted px-3 py-1.5 text-xs font-semibold transition-colors"
              >
                Energi <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 pt-5 pb-12 md:pb-16 max-w-3xl">
          <h2 className="text-2xl font-extrabold tracking-tight mb-6" style={{ color: "var(--kv-blue)" }}>
            Ofte stilte spørsmål om norsk natur
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
            Data fra <a href="https://www.kartverket.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Kartverket</a>, <a href="https://www.met.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">MET Norway</a>, <a href="https://www.ssb.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">SSB</a> og <a href="https://www.openstreetmap.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">OpenStreetMap</a>.
          </p>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
    </>
  );
}
