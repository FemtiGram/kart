import { EiendomMapLoader } from "@/components/eiendom-map-loader";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

// Search Console (90 days to Oct 2026): "tomtegrenser" 588 impressions at
// position ~10, plus "se tomtegrenser", "tomtegrense kart", "tomte grenser
// kart" and rule questions. The page was titled just "Tomtegrenser" and had
// no crawlable text besides the FAQ.
const TITLE = "Se tomtegrenser i kart for hele Norge";
const DESCRIPTION =
  "Se tomtegrenser i kart: søk på adressen eller klikk på tomten og få eiendomsgrensen, gnr/bnr og tomteareal fra matrikkelen. Gratis og uten innlogging.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/eiendom" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "/eiendom",
  },
  keywords: [
    "tomtegrenser",
    "se tomtegrenser",
    "tomtegrenser kart",
    "eiendomsgrenser",
    "gårdsnummer og bruksnummer",
    "tomteareal",
    "matrikkelen",
    "Kartverket",
  ],
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
    q: "Hvor nær tomtegrensen kan jeg bygge?",
    a: "Hovedregelen i plan- og bygningsloven § 29-4 er at bygninger skal stå minst 4 meter fra nabogrensen, med mindre reguleringsplanen sier noe annet. Mindre frittliggende bygg, som garasje eller bod på inntil 50 m², kan ofte stå ned til 1 meter fra grensen. Reglene har flere vilkår og unntak, så sjekk reguleringsplanen og spør kommunen før du bygger.",
  },
  {
    q: "Hva gjør jeg hvis tomtegrensen er uklar?",
    a: "Kommunen kan påvise grensen i terrenget (grensepåvisning) eller holde en oppmålingsforretning, som gir grensen en sikker innmåling i matrikkelen. Det koster et gebyr som varierer mellom kommunene. Er du og naboen uenige om hvor grensen går, kan saken bringes inn for jordskifteretten.",
  },
  {
    q: "Er dette de samme grensene som i Norgeskart og Se eiendom?",
    a: "Ja, grensene kommer fra matrikkelen, som også er kilden til Kartverkets egne karttjenester. Her får du grensen, gårds- og bruksnummer og arealet med ett klikk, uten innlogging.",
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
      <h1 className="sr-only">Se tomtegrenser i kart – eiendomsgrenser for hele Norge</h1>
      <EiendomMapLoader />
      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 pt-5 pb-12 md:pb-16 max-w-3xl">
          <h2 className="text-2xl font-extrabold tracking-tight mb-3" style={{ color: "var(--kv-blue)" }}>
            Se tomtegrenser i kart
          </h2>
          <p className="text-foreground/80 leading-relaxed">
            Søk opp en adresse, eller zoom inn og klikk på en tomt, så tegnes eiendomsgrensen opp i kartet. Du får gårds- og
            bruksnummer (gnr/bnr), tomtearealet i kvadratmeter og mål, og hvor nøyaktig grensen er målt. Grensene kommer
            direkte fra matrikkelen, Norges offisielle eiendomsregister, og dekker registrerte eiendommer i hele landet.
          </p>
          <p className="text-foreground/80 leading-relaxed mt-3">
            Kartet er gratis og krever ingen innlogging. Vil du vite hvem som eier eiendommen, går du videre til Kartverkets
            «Se eiendom» fra kortet i kartet.
          </p>

          <h2 className="text-2xl font-extrabold tracking-tight mt-10 mb-6" style={{ color: "var(--kv-blue)" }}>
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
