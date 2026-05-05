import { ValgMapLoader } from "@/components/valg-map-loader";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

export const metadata = {
  title: "Valgkart Norge — stortingsvalg og kommunevalg per kommune",
  description:
    "Interaktivt valgkart med stortingsvalget 2025 og 2021, og kommunestyrevalget 2023 og 2019, fordelt på alle 357 norske kommuner. Se vinnerparti, stemmefordeling, frammøte og endring fra forrige valg. Offisielle tall fra Valgdirektoratet.",
  alternates: { canonical: "/valg" },
  openGraph: {
    title: "Valgkart Norge — stortingsvalg og kommunevalg per kommune",
    description:
      "Stortingsvalget 2025, 2021 og kommunestyrevalget 2023, 2019 fordelt på alle norske kommuner. Vinnerparti, stemmefordeling og frammøte på interaktivt kart.",
    type: "website",
    url: "/valg",
  },
  keywords: [
    "valgkart",
    "stortingsvalg 2025",
    "kommunestyrevalg 2023",
    "valgresultater",
    "vinnerparti per kommune",
    "frammøte",
    "Norge",
    "Valgdirektoratet",
    "interaktivt kart",
  ],
};

const faqs = [
  {
    q: "Hva viser kartet?",
    a: "Hver kommune er farget etter det partiet som fikk flest stemmer i kommunen. Du kan bytte mellom Stortingsvalg og Kommunestyrevalg, og mellom årene som er tilgjengelige (2019–2025). Klikk på en kommune for å se full stemmefordeling, frammøte og endring fra forrige sammenlignbare valg.",
  },
  {
    q: "Hvorfor stemmer ikke valgkartet med setefordelingen på Stortinget?",
    a: "Kartet viser kun det største partiet i hver kommune. Stortingsmandater fordeles per valgkrets (fylke) og inkluderer utjevningsmandater for å gi en mer proporsjonal fordeling på landsbasis. Et parti kan vinne i mange kommuner uten å få flest mandater, og omvendt. Bruk kartet til å se geografiske mønstre, ikke til å regne ut mandater.",
  },
  {
    q: "Hva betyr +/- prosenttallet ved hvert parti?",
    a: "Det er endringen i oppslutning fra forrige sammenlignbare valg, beregnet av Valgdirektoratet. For Stortingsvalg 2025 sammenlignes med Stortingsvalg 2021. For Kommunestyrevalg 2023 sammenlignes med Kommunestyrevalg 2019. Stortingsvalg og kommunestyrevalg sammenlignes aldri direkte med hverandre — de er ulike valgtyper.",
  },
  {
    q: "Hvorfor mangler noen kommuner data?",
    a: "Haram kommune (1580) vises som grå for 2019 og 2021, fordi kommunen ikke eksisterte som egen enhet i de valgene — Haram var slått sammen med Ålesund fra 2020 til 2024. Resultatene fra disse årene ligger derfor inne i Ålesunds tall, og kan ikke splittes geografisk i etterkant.",
  },
  {
    q: "Hvorfor finnes det ikke valg før 2019?",
    a: "Kommunereformen i 2020 reduserte antall kommuner fra 422 til 356, og mange kommuner ble slått sammen. Eldre valgresultater (2017, 2015 osv.) bruker kommunenumre som ikke kan tilordnes dagens 357 kommuner uten å aggregere stemmer på tvers av sammenslåinger. Det krever en separat omkartlegging som ikke er gjort ennå.",
  },
  {
    q: "Stemmer tallene helt?",
    a: "Tallene hentes fra Valgdirektoratets endelige offisielle resultater på byggetidspunktet og oppdateres ikke automatisk hvis Valgdirektoratet skulle gjøre etterkorrigeringer. Eldre kommunenumre (2019, 2021) er omkartlagt til dagens kommuneinndeling basert på navn og fylkestilhørighet — i sjeldne tilfeller kan dette gi mindre avvik for kommuner som har endret navn eller fylke. Vi anbefaler valgresultat.no som autoritativ kilde for konkrete tall.",
  },
  {
    q: "Hvor kommer dataene fra?",
    a: "Alle resultater er hentet fra Valgdirektoratet via valgresultat.no — den offisielle kilden for norske valgresultater. Kommunegrenser er fra Kartverket. Dataene bygges inn i siden ved bygging og oppdateres ikke i sanntid.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

// Dataset JSON-LD — tells Google's Dataset Search and AI search engines
// (Perplexity, ChatGPT, Google AI Overviews) precisely what data this page
// exposes, who maintains it, and where the source lives.
const datasetJsonLd = {
  "@context": "https://schema.org",
  "@type": "Dataset",
  name: "Valgresultater per kommune i Norge",
  description:
    "Offisielle valgresultater fra Stortingsvalg 2025 og 2021, og Kommunestyrevalg 2023 og 2019, brutt ned på alle 357 norske kommuner. Hver kommune har vinnerparti, stemmefordeling for alle partier, frammøte og endring fra forrige sammenlignbare valg.",
  inLanguage: "no",
  isAccessibleForFree: true,
  license: "https://creativecommons.org/licenses/by/4.0/",
  keywords: [
    "stortingsvalg",
    "kommunestyrevalg",
    "valgresultater",
    "vinnerparti",
    "frammøte",
    "kommune",
    "Norge",
  ],
  spatialCoverage: { "@type": "Place", name: "Norge" },
  temporalCoverage: "2019/2025",
  creator: {
    "@type": "Organization",
    name: "Valgdirektoratet",
    url: "https://valgresultat.no",
  },
  publisher: {
    "@type": "Organization",
    name: "Datakart",
    url: "https://datakart.no",
  },
  url: "https://datakart.no/valg",
  variableMeasured: [
    "Vinnerparti per kommune",
    "Stemmer per parti (antall og prosent)",
    "Frammøte per kommune",
    "Endring i oppslutning fra forrige valg",
  ],
};

export default function ValgPage() {
  return (
    <>
      <h1 className="sr-only">Valgkart — Stortingsvalg og kommunestyrevalg</h1>
      <ValgMapLoader />
      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 pt-5 pb-12 md:pb-16 max-w-3xl">
          <h2 className="text-2xl font-extrabold tracking-tight mb-6" style={{ color: "#24374c" }}>
            Ofte stilte spørsmål om valgkartet
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

          <div
            className="mt-8 rounded-xl border-l-4 px-4 py-3 text-sm leading-relaxed"
            style={{
              background: "var(--kv-warning-light)",
              borderColor: "var(--kv-warning)",
              color: "var(--kv-warning-dark)",
            }}
          >
            <p className="font-semibold mb-1">Om tallene</p>
            <p>
              Resultatene er offisielle og endelige tall fra <a href="https://valgresultat.no" target="_blank" rel="noopener noreferrer" className="underline">Valgdirektoratet</a> på byggetidspunktet. For valgene før 2024 er kommunenumrene omkartlagt til dagens inndeling — i de aller fleste tilfeller én-til-én, men kommuner som er slått sammen eller delt opp i mellomtiden kan ha små avvik. Sjekk alltid valgresultat.no for autoritative tall i konkrete saker.
            </p>
          </div>

          <p className="text-xs text-foreground/70 mt-6">
            Data fra <a href="https://valgresultat.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Valgdirektoratet</a>. Kommunegrenser fra <a href="https://www.kartverket.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Kartverket</a>.
          </p>
        </div>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetJsonLd) }}
      />
    </>
  );
}
