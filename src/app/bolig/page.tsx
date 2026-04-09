import { BoligMapLoader } from "@/components/bolig-map-loader";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

export const metadata = {
  title: "Boligpriser",
  description:
    "Gjennomsnittlig kvadratmeterpris for eneboliger, småhus og blokkleiligheter i alle norske kommuner. Sammenlign boligpriser, se prisutvikling og finn de dyreste og rimeligste områdene.",
};

const faqs = [
  {
    q: "Hva er gjennomsnittlig kvadratmeterpris i Norge?",
    a: "I 2024 er gjennomsnittlig kvadratmeterpris for eneboliger ca. 23 400 kr/m², småhus ca. 33 700 kr/m² og blokkleiligheter ca. 45 000 kr/m². Prisene varierer enormt mellom kommuner — fra under 10 000 kr/m² i de rimeligste distriktskommunene til over 100 000 kr/m² i Oslo.",
  },
  {
    q: "Hvilken kommune har høyest boligpriser?",
    a: "Oslo er dyrest uansett boligtype. Blokkleiligheter i Oslo koster i snitt ca. 103 000 kr/m², eneboliger ca. 73 000 kr/m² og småhus ca. 78 000 kr/m². Bærum, Stavanger, Bergen og Trondheim følger bak med priser mellom 40 000 og 66 000 kr/m² for blokkleiligheter.",
  },
  {
    q: "Hvor er det billigst å kjøpe bolig i Norge?",
    a: "De rimeligste kommunene for eneboliger er typisk i Innlandet og Trøndelag, med priser under 12 000 kr/m². Stor-Elvdal er blant de billigste med ca. 9 800 kr/m² for eneboliger. For blokkleiligheter er Bømlo blant de rimeligste med ca. 26 000 kr/m².",
  },
  {
    q: "Hva er forskjellen på enebolig, småhus og blokkleilighet?",
    a: "Eneboliger er frittstående hus med egen tomt. Småhus inkluderer rekkehus, tomannsboliger og kjedehus. Blokkleiligheter er leiligheter i bygninger med tre eller flere etasjer. Blokkleiligheter har høyest kvadratmeterpris, men lavere totalpris fordi de er mindre. I 2024 ble det solgt ca. 27 000 eneboliger, 10 000 småhus og 30 000 blokkleiligheter.",
  },
  {
    q: "Hvordan har boligprisene utviklet seg?",
    a: "Boligprisene i Norge har steget betydelig det siste tiåret. Kartet viser prisutvikling fra 2015 til 2024 for hver kommune. Du kan bytte mellom år i filteret øverst og se endringen i prisutvikling-grafen i detaljkortet for hver kommune.",
  },
  {
    q: "Hvor kommer dataene fra?",
    a: "Alle boligprisdata kommer fra Statistisk sentralbyrå (SSB), tabell 06035. Dette er offisiell statistikk basert på tinglyste boligomsetninger i fritt salg. Dataene dekker 264 kommuner for eneboliger, 130 for småhus og 154 for blokkleiligheter. Kommuner med svært få salg publiseres ikke av SSB av personvernhensyn.",
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

export default function BoligPage() {
  return (
    <>
      <BoligMapLoader />
      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 pt-5 pb-12 md:pb-16 max-w-3xl">
          <h2 className="text-2xl font-extrabold tracking-tight mb-6" style={{ color: "#24374c" }}>
            Ofte stilte spørsmål om boligpriser
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
          <p className="text-xs text-muted-foreground mt-8">
            Data fra <a href="https://www.ssb.no/statbank/table/06035/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">SSB Tabell 06035</a>. Tallene gjelder selveierboliger omsatt i fritt salg.
          </p>
        </div>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
