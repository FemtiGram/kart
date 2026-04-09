import type { Metadata } from "next";
import ReservoirMap from "@/components/reservoir-map-loader";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

export const metadata: Metadata = {
  title: "Magasinkart — Datakart",
  description: "Utforsk over 500 regulerte vannmagasiner i Norge med nasjonal fyllingsgrad, kapasitet og polygon-visning fra NVE.",
};

const faqs = [
  {
    q: "Hvor mange vannmagasiner finnes i Norge?",
    a: "Norge har over 500 regulerte vannmagasiner registrert hos NVE, med en samlet kapasitet på over 26 000 millioner kubikkmeter (Mm³). Disse magasinene er grunnlaget for Norges vannkraftproduksjon som dekker ca. 90 % av landets strømbehov.",
  },
  {
    q: "Hva betyr fyllingsgrad?",
    a: "Fyllingsgrad viser hvor fullt et magasin er i prosent av total kapasitet. Nasjonal fyllingsgrad vises øverst på kartet og oppdateres ukentlig av NVE. Fyllingsgraden varierer naturlig gjennom året — lavest om våren før snøsmeltingen og høyest om høsten.",
  },
  {
    q: "Hva er HRV og LRV?",
    a: "HRV (Høyeste Regulerte Vannstand) og LRV (Laveste Regulerte Vannstand) er de lovlige grensene for hvor mye vannstanden i et magasin kan variere. Forskjellen mellom HRV og LRV kalles reguleringsområdet og bestemmer hvor mye energi magasinet kan lagre.",
  },
  {
    q: "Hvorfor er noen magasiner større enn andre på kartet?",
    a: "Magasinene vises som polygoner (flater) basert på deres faktiske geografiske utstrekning. Store magasiner som Blåsjø (Rogaland) og Mjøsa-regulanten er tydelig synlige, mens små magasiner krever innzooming.",
  },
  {
    q: "Hvordan påvirker magasinene strømprisene?",
    a: "Når fyllingsgraden er høy har Norge mye billig vannkraft tilgjengelig, som holder prisene nede. Lav fyllingsgrad — spesielt om vinteren — kan føre til høyere strømpriser fordi det er mindre vann tilgjengelig for kraftproduksjon.",
  },
  {
    q: "Hvor kommer dataene fra?",
    a: "Magasindata (polygoner, kapasitet, HRV/LRV) kommer fra NVE ArcGIS. Nasjonal fyllingsgrad hentes fra NVE BIapi og oppdateres ukentlig.",
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

export default function MagasinPage() {
  return (
    <>
      <ReservoirMap />
      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 pt-5 pb-12 md:pb-16 max-w-3xl">
          <h2 className="text-2xl font-extrabold tracking-tight mb-6" style={{ color: "#24374c" }}>
            Ofte stilte spørsmål om vannmagasiner
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
            Data fra <a href="https://www.nve.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">NVE</a>. Magasindata oppdateres med 1 times mellomlagring, fyllingsgrad ukentlig.
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
