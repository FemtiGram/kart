import type { Metadata } from "next";
import { KostnaderMapLoader } from "@/components/kostnader-map-loader";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

export const metadata: Metadata = {
  title: "Kostnader",
  description:
    "Hva koster det å bo i hver norsk kommune? Kart over kommunale årsgebyr (vann, avløp, avfall, feiing) og eiendomsskatt for 357 kommuner. Data fra SSB tabell 12842 og 14674.",
  alternates: { canonical: "/kostnader" },
};

const faqs = [
  {
    q: "Hva viser kartet?",
    a: "To faste boutgifter som varierer mye mellom kommuner: kommunale årsgebyr (sum av vann, avløp, avfall og feiing) og eiendomsskatt. Begge tallene er per kommune, og kartet fargelegges grønt for kommuner med lave kostnader og rødt for kommuner med høye kostnader. Du kan velge hvilken av de to som skal brukes til fargeleggingen.",
  },
  {
    q: "Hvor kommer dataene fra?",
    a: "Gebyrene kommer fra SSB tabell 12842 «Kommunale gebyrer knyttet til bolig» — årlige satser som kommunene selv rapporterer til SSB via KOSTRA. Eiendomsskatten kommer fra SSB tabell 14674 «Eiendomsskatt» som også er KOSTRA-data. Begge tabellene er NLOD-lisensiert og oppdateres årlig.",
  },
  {
    q: "Hva inngår i «kommunale årsgebyr»?",
    a: "Summen av de fire årsgebyrene en typisk husholdning betaler til kommunen: vannforsyning, avløp, avfall (renovasjon) og feiing og tilsyn. Alle tall er eksklusiv merverdiavgift, som standard hos SSB. Noen kommuner har ikke kommunal avløpsordning — der står avløpstallet tomt og er ikke med i totalen.",
  },
  {
    q: "Hva betyr «Ingen eiendomsskatt»?",
    a: "Omtrent en tredjedel av norske kommuner har ikke innført eiendomsskatt på bolig. Disse vises med en lys grønn fargetone på kartet når du ser på eiendomsskatt-visningen. For alle andre kommuner viser vi den standardiserte SSB-beregningen: hva eiendomsskatten ville vært for en enebolig på 120 m². Det gjør tallene direkte sammenlignbare selv om kommunene bruker ulike takseringsmetoder.",
  },
  {
    q: "Hvorfor mangler noen kommuner eiendomsskatt-tall?",
    a: "SSB slutter å publisere den standardiserte 120 m²-beregningen for 2025 og nyere år, så vi bruker 2024-tallene for den verdien. Enkelte kommuner rapporterer heller ikke den verdien selv i 2024 — for dem vises bare skattesatsen i promille i detaljpanelet, og kommunen får en nøytral gråtone på kartet. Gebyrdataene er mer fullstendige og oppdateres årlig.",
  },
  {
    q: "Inkluderer tallene strøm eller andre utgifter?",
    a: "Nei — foreløpig kun kommunale gebyrer og eiendomsskatt, som er de to faste boutgiftene som varierer mest mellom kommuner og som SSB publiserer med god kvalitet. Nettleie og strømpris varierer også, men følger nettområder (NO1–NO5) og nettselskap, ikke kommunegrenser — det kommer i en senere versjon.",
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

export default function KostnaderPage() {
  return (
    <>
      <h1 className="sr-only">Bokostnader</h1>
      <KostnaderMapLoader />
      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 pt-5 pb-12 md:pb-16 max-w-3xl">
          <h2
            className="text-2xl font-extrabold tracking-tight mb-6"
            style={{ color: "var(--kv-blue)" }}
          >
            Ofte stilte spørsmål om kostnader
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
            <a
              href="https://www.ssb.no/statbank/table/12842"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              SSB tabell 12842
            </a>{" "}
            (kommunale gebyrer) og{" "}
            <a
              href="https://www.ssb.no/statbank/table/14674"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              SSB tabell 14674
            </a>{" "}
            (eiendomsskatt), lisens NLOD. Tallene er eksklusiv mva. og oppdateres
            årlig fra KOSTRA-innrapporteringen.
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
