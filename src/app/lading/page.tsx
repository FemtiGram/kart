import { ChargingMapLoader } from "@/components/charging-map-loader";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

export const metadata = {
  title: "Ladestasjoner",
  description:
    "Alle 5 000+ elbilladestasjoner i Norge på kart. Se kontakttyper, ladefart i kW, operatør og tilgjengelighet fra NOBIL-databasen.",
  alternates: { canonical: "/lading" },
};

const faqs = [
  {
    q: "Hvor mange ladestasjoner finnes i Norge?",
    a: "Per 2025 er det over 5 100 offentlige ladestasjoner registrert i NOBIL-databasen, med til sammen over 32 000 ladepunkter. Oslo har flest med over 1 400 stasjoner, etterfulgt av Vestland (570) og Akershus (540). De fleste stasjonene (97 %) er åpne 24 timer i døgnet.",
  },
  {
    q: "Hva er forskjellen på hurtiglading og normallading?",
    a: "Normallading (AC) bruker Type 2-kontakt og leverer typisk 7–22 kW — en full lading tar 4–8 timer. Hurtiglading (DC) bruker CCS eller CHAdeMO og leverer 50–350 kW, som gir 10–80 % på 20–40 minutter. I Norge har over 1 900 stasjoner hurtiglading (50 kW+), og over 1 500 har ultrahurtiglading på 150 kW eller mer.",
  },
  {
    q: "Hvilke kontakttyper er vanligst i Norge?",
    a: "Type 2 er den klart vanligste med over 17 500 kontakter — dette er standarden for normallading i Europa. CCS/Combo (hurtiglading) har over 11 600 kontakter og er standarden for nye elbiler. CHAdeMO (ca. 2 900 kontakter) brukes hovedsakelig av eldre Nissan Leaf og Mitsubishi. Tesla har i tillegg ca. 660 egne kontakter.",
  },
  {
    q: "Hvem drifter ladestasjoner i Norge?",
    a: "Oslo Kommune er største operatør med over 1 200 stasjoner (hovedsakelig normallading). Kople AS har ca. 890, Mer Norway ca. 370, og Recharge ca. 350. Tesla opererer ca. 190 Supercharger-stasjoner. Totalt er det over 50 ulike operatører i Norge.",
  },
  {
    q: "Koster det å parkere ved ladestasjoner?",
    a: "De aller fleste ladestasjoner i Norge (95 %) har gratis parkering. Parkeringsavgift forekommer hovedsakelig i parkeringshus og kjøpesentre i byene. Selve ladingen har vanligvis en kostnad per kWh som varierer mellom operatørene.",
  },
  {
    q: "Hvor kommer dataene fra?",
    a: "Alle ladestasjondata kommer fra NOBIL, Norges offisielle database for ladeinfrastruktur. NOBIL eies av Enova og oppdateres fortløpende av operatørene. Dataene inkluderer plassering, kontakttyper, ladefart, operatør og tilgjengelighet.",
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

export default function LadingPage() {
  return (
    <>
      <h1 className="sr-only">Ladestasjoner</h1>
      <ChargingMapLoader />
      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 pt-5 pb-12 md:pb-16 max-w-3xl">
          <h2 className="text-2xl font-extrabold tracking-tight mb-6" style={{ color: "#24374c" }}>
            Ofte stilte spørsmål om ladestasjoner
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
            Data fra <a href="https://nobil.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">NOBIL</a> / Enova. Tallene oppdateres ved hver utrulling av nettsiden.
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
