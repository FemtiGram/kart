import { EiendomMapLoader } from "@/components/eiendom-map-loader";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

export const metadata = {
  title: "Tomtegrenser",
  description:
    "Se tomtegrenser, gårds- og bruksnummer og areal for alle eiendommer i Norge. Klikk i kartet og få eiendomsgrensene fra matrikkelen — gratis og uten innlogging.",
  alternates: { canonical: "/eiendom" },
};

const faqs = [
  {
    q: "Hvordan finner jeg tomtegrensene for en eiendom?",
    a: "Søk på adressen eller klikk direkte i kartet. Eiendommen på punktet hentes fra matrikkelen (Norges offisielle eiendomsregister) og tegnes opp med grenser, gårds- og bruksnummer og beregnet areal i kvadratmeter og mål.",
  },
  {
    q: "Er tomtegrensene nøyaktige?",
    a: "Det varierer. Grenser i tettbygde strøk er som regel nøyaktig innmålt, mens eldre grenser i utmark kan avvike med flere meter. Kartet viser matrikkelens nøyaktighetsklasse for hver eiendom, så du kan se hvor pålitelig grensen er. Ved tvist er det oppmålt grense som gjelder, ikke kartet.",
  },
  {
    q: "Hva betyr gårdsnummer og bruksnummer?",
    a: "Alle eiendommer i Norge identifiseres med gårdsnummer (gnr) og bruksnummer (bnr) innenfor sin kommune, for eksempel 217/382. Festetomter har i tillegg festenummer, og seksjonerte eiendommer har seksjonsnummer.",
  },
  {
    q: "Kan jeg se hvem som eier en eiendom?",
    a: "Nei, eierinformasjon er ikke del av Kartverkets åpne data. Bruk Kartverkets tjeneste «Se eiendom» (lenket fra hver eiendom i kartet) for å slå opp hjemmelshaver — det er gratis, men krever innlogging for enkelte detaljer.",
  },
  {
    q: "Hva er et mål?",
    a: "Ett mål (dekar) er 1000 kvadratmeter. Det er den vanligste enheten for tomtestørrelse i Norge. En typisk boligtomt er på 0,5–1,5 mål.",
  },
  {
    q: "Hvor kommer dataene fra?",
    a: "Eiendomsgrensene kommer fra matrikkelen via Kartverkets åpne eiendoms-API, lisensiert under NLOD. Arealet beregnes geometrisk fra grensene og kan avvike noe fra det offisielt registrerte arealet.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function EiendomPage() {
  return (
    <>
      <h1 className="sr-only">Tomtegrenser og eiendomsgrenser</h1>
      <EiendomMapLoader />
      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 pt-5 pb-12 md:pb-16 max-w-3xl">
          <h2 className="text-2xl font-extrabold tracking-tight mb-6" style={{ color: "#24374c" }}>
            Ofte stilte spørsmål om tomtegrenser
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
          <p className="text-xs text-foreground/70 mt-8">
            Data fra{" "}
            <a href="https://www.kartverket.no/api-og-data/eiendomsdata" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
              Kartverket / matrikkelen
            </a>{" "}
            under NLOD-lisens.
          </p>
        </div>
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
