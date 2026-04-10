import { InflationDashboard } from "@/components/inflation-dashboard";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

export const metadata = {
  title: "Prisvekst",
  description:
    "Norsk inflasjon og konsumprisindeks (KPI) med kategorifordeling, kjerneinflasjon, styringsrente og nordisk sammenligning. Oppdatert månedlig fra SSB.",
};

const faqs = [
  {
    q: "Hva er konsumprisindeksen (KPI)?",
    a: "KPI måler den gjennomsnittlige prisendringen på varer og tjenester som norske husholdninger kjøper. Indeksen dekker alt fra mat og transport til bolig og klær. En 12-månedersendring på 3 % betyr at det generelle prisnivået har økt 3 % det siste året.",
  },
  {
    q: "Hva er forskjellen mellom KPI og KPI-JAE?",
    a: "KPI er den samlede konsumprisindeksen. KPI-JAE (justert for avgiftsendringer og energipriser) fjerner effekten av strømpriser, drivstoff og endringer i avgifter. Norges Bank bruker KPI-JAE som sin viktigste målestokk for å vurdere underliggende prisvekst og sette styringsrenten.",
  },
  {
    q: "Hvordan påvirker styringsrenten inflasjonen?",
    a: "Når Norges Bank hever styringsrenten, blir det dyrere å låne penger. Det bremser forbruk og investeringer, som demper prisveksten. Norges Banks inflasjonsmål er 2 % over tid. Hvis inflasjonen er høyere, heves renten — hvis den er lavere, kan renten senkes.",
  },
  {
    q: "Hvilke kategorier bidrar mest til prisveksten?",
    a: "Bolig og energi (strøm, fyring) har typisk størst vekt i KPI og påvirker tallene mest. Mat og alkoholfrie drikkevarer er den nest største kategorien. Transport (drivstoff, kollektiv) kan svinge mye. Oversikten på denne siden viser aktuell prisvekst for alle 12 hovedkategorier.",
  },
  {
    q: "Hvordan ligger Norge an sammenlignet med andre land?",
    a: "Den nordiske sammenligningen bruker Eurostats harmoniserte konsumprisindeks (HICP), som beregnes likt i alle land. Dette gjør det mulig å sammenligne inflasjon direkte mellom Norge, Sverige, Danmark, Finland og EU-gjennomsnittet.",
  },
  {
    q: "Hvor kommer dataene fra?",
    a: "Konsumprisdata kommer fra Statistisk sentralbyrå (SSB), tabellene 03013 og 05327. Styringsrenten hentes fra Norges Bank. Nordisk sammenligning bruker Eurostats HICP-indeks. Alle data oppdateres automatisk.",
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

export default function PrisvekstPage() {
  return (
    <>
      <div className="min-h-[calc(100svh-57px)] bg-background">
        <div className="container mx-auto px-6 md:px-16 py-8 md:py-12 max-w-4xl">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ color: "#24374c" }}>
            Prisvekst i Norge
          </h1>
          <p className="mt-2 text-muted-foreground max-w-xl">
            Konsumprisindeksen (KPI) viser endringer i prisnivået for varer og tjenester. Oppdateres månedlig fra SSB, Norges Bank og Eurostat.
          </p>
          <div className="mt-8">
            <InflationDashboard />
          </div>
        </div>
      </div>
      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 pt-5 pb-12 md:pb-16 max-w-3xl">
          <h2 className="text-2xl font-extrabold tracking-tight mb-6" style={{ color: "#24374c" }}>
            Ofte stilte spørsmål om prisvekst
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
            Data fra <a href="https://www.ssb.no/statbank/table/03013/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">SSB</a>, <a href="https://www.norges-bank.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Norges Bank</a> og <a href="https://ec.europa.eu/eurostat" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Eurostat</a>.
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
