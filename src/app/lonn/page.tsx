import { IncomeMapLoader } from "@/components/income-map-loader";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

export const metadata = {
  title: "Inntektskart – Datakart",
  description:
    "Median inntekt etter skatt per husholdning i alle norske kommuner. Se rangering, sammenlign kommuner og finn inntektsforskjellene på kart.",
};

const faqs = [
  {
    q: "Hva betyr median inntekt etter skatt?",
    a: "Median inntekt er den midterste verdien — halvparten tjener mer, halvparten mindre. Etter skatt betyr at det er det husholdningen faktisk har å bruke. Medianen brukes i stedet for gjennomsnittet fordi den ikke påvirkes av noen få svært høye eller lave inntekter.",
  },
  {
    q: "Hvilke kommuner har høyest inntekt?",
    a: "Kommuner i Akershus-regionen (Bærum, Asker, Nordre Follo) og oljehovedstaden Stavanger ligger typisk høyest. Forskjellene mellom kommunene kan være over 200 000 kr i median husholdningsinntekt.",
  },
  {
    q: "Hva betyr fargene på kartet?",
    a: "Rødt betyr lav inntekt, gult er middels, og grønt er høy inntekt — relativt til alle kommuner i Norge. Fargen viser hvor kommunen ligger på skalaen fra lavest til høyest median inntekt.",
  },
  {
    q: "Hvorfor mangler noen kommuner data?",
    a: "SSB publiserer ikke data for kommuner med svært få husholdninger av personvernhensyn. Disse kommunene vises i beige/grått på kartet.",
  },
  {
    q: "Er dette inntekt per person eller per husholdning?",
    a: "Dataene viser median inntekt etter skatt per husholdning — altså samlet inntekt for alle som bor sammen. En husholdning kan være én person, et par, eller en familie.",
  },
  {
    q: "Hvor kommer dataene fra?",
    a: "Inntektsdata er fra SSB (Statistisk sentralbyrå), tabell InntektStruk13. Dataene gjelder 2024 og oppdateres årlig. Kommunegrenser er fra Kartverket.",
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

export default function LonnPage() {
  return (
    <>
      <IncomeMapLoader />
      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 py-12 md:py-16 max-w-3xl">
          <h2 className="text-2xl font-extrabold tracking-tight mb-6" style={{ color: "#24374c" }}>
            Ofte stilte spørsmål om inntekt i Norge
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
            Data fra <a href="https://www.ssb.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">SSB</a> (Statistisk sentralbyrå). Kommunegrenser fra <a href="https://www.kartverket.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Kartverket</a>.
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
