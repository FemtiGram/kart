import { ElevationMapLoader } from "@/components/elevation-map-loader";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

export const metadata = {
  title: "Høydekart – Datakart",
  description:
    "Finn høyden over havet for ethvert punkt i Norge. Søk på adresse, se terrengkart og få sanntids værdata fra Kartverket og MET.no.",
};

const faqs = [
  {
    q: "Hvor nøyaktig er høydedataene?",
    a: "Nøyaktigheten avhenger av datakilden. For bygninger og veiadresser er presisjonen typisk ±1 meter (fra Kartverkets detaljerte terrengmodell). For stedsnavn og fjelltoppper kan usikkerheten være større avhengig av punktets plassering.",
  },
  {
    q: "Hvordan fungerer terrengkartet?",
    a: "Terrengkartet bruker OpenTopoMap som viser høydekurver, skyggereleff og topografiske detaljer. Dette gjør det lettere å se fjell, daler og bratthet sammenlignet med et vanlig veikart.",
  },
  {
    q: "Kan jeg bruke kartet til fjellturer?",
    a: "Kartet viser høyde og terreng, men er ikke et fullverdig turkart. For detaljert turplanlegging anbefaler vi UT.no eller Kartverkets Norgeskart. Høydekartet er nyttig for å sjekke høyder på spesifikke punkt.",
  },
  {
    q: "Hva viser værdataene?",
    a: "Når du klikker på et punkt vises aktuell temperatur, vindstyrke og nedbør. Dataene kommer fra MET.no (yr.no) og gjelder de nærmeste timene. Værdata oppdateres hvert 30. minutt.",
  },
  {
    q: "Hvor kommer dataene fra?",
    a: "Høydedata er fra Kartverkets høyde-API. Terrengkart er fra OpenTopoMap. Værdata er fra MET.no (Meteorologisk institutt). Adressesøk bruker Geonorge.",
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

export default function MapPage() {
  return (
    <>
      <ElevationMapLoader />
      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 pt-5 pb-12 md:pb-16 max-w-3xl">
          <h2 className="text-2xl font-extrabold tracking-tight mb-6" style={{ color: "#24374c" }}>
            Ofte stilte spørsmål om høydekartet
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
            Data fra <a href="https://www.kartverket.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Kartverket</a>, <a href="https://opentopomap.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">OpenTopoMap</a> og <a href="https://www.met.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">MET.no</a>.
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
