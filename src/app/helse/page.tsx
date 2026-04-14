import type { Metadata } from "next";
import { HealthMapLoader } from "@/components/health-map-loader";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

export const metadata: Metadata = {
  title: "Helsetilbud",
  description:
    "Fastlegedata per kommune i Norge — reservekapasitet, andel uten fastlege og gjennomsnittlig listelengde. Fra SSB tabell 12005, oppdatert 2025. Sykehus og legevakt fra OpenStreetMap som valgfritt lag.",
  alternates: { canonical: "/helse" },
};

const faqs = [
  {
    q: "Hvor kommer dataene fra?",
    a: "Fargeleggingen av kommunene bygger på SSB tabell 12005 — «Fastlegelister og fastlegekonsultasjoner» — som Statistisk sentralbyrå publiserer med utgangspunkt i det administrative systemet for fastlegeordningen. Dataene er offisielle og NLOD-lisensiert. Som valgfritt lag kan du også slå på sykehus og legevakt fra OpenStreetMap, men disse markørene er dugnadsbasert og brukes bare som kontekst.",
  },
  {
    q: "Hva betyr «Ledig kapasitet»?",
    a: "Ledig kapasitet viser hvor mye plass det er på fastlegelistene i kommunen, som en signert prosent. 0 % betyr at kapasiteten og antall pasienter er i balanse. Positive verdier som +5 % betyr at det er 5 % mer kapasitet enn pasienter — altså ledig plass. Negative verdier som −2 % betyr at listene er overbooket. Tallet kommer fra SSB-indikatoren «Reservekapasitet fastlege», som er kapasiteten delt på antall pasienter på liste ganger 100. Vi trekker fra 100 for å gjøre den mer lesbar.",
  },
  {
    q: "Hva viser «uten fastlege»?",
    a: "Andelen av innbyggerne i kommunen som står på en fastlegeliste uten fast lege — altså en liste uten en navngitt lege. Dette er den tydeligste indikatoren på fastlegekrisen: når andelen stiger, betyr det at færre får et fast legeforhold. En andel på 0 betyr at alle har en fastlege.",
  },
  {
    q: "Hva er gjennomsnittlig listelengde?",
    a: "Gjennomsnittlig antall pasienter per fastlege i kommunen. Kortere liste betyr mer tid per pasient, men også at fastlegen har mindre grunnlag å leve av. SSB publiserer både rå listelengde og en versjon som er korrigert for kommunale timer (for eksempel på sykehjem) — vi viser den rå versjonen på kartet, men begge finnes i detaljpanelet.",
  },
  {
    q: "Hva med sykehus og legevakt?",
    a: "Det finnes dessverre ingen åpen, offisiell liste over norske sykehus og legevakter med koordinater. Nasjonalt register for enheter i spesialisthelsetjenesten (RESH) og Fastlegeregisteret (FLR) er begge bak innlogging. Vi tilbyr derfor sykehus og legevakt fra OpenStreetMap som et valgfritt kartlag, men dataene er dugnadsbasert og ikke komplette. Ring 113 ved akutt nød og bruk helsenorge.no for offisiell informasjon.",
  },
  {
    q: "Hvor ofte oppdateres dataene?",
    a: "SSB tabell 12005 publiseres årlig — vi bygger kartet på nytt med siste publiserte år hver gang siden distribueres. OpenStreetMap-laget oppdateres samtidig fra den åpne Overpass-API-en.",
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

export default function HelsePage() {
  return (
    <>
      <HealthMapLoader />
      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 pt-5 pb-12 md:pb-16 max-w-3xl">
          <h2
            className="text-2xl font-extrabold tracking-tight mb-6"
            style={{ color: "var(--kv-blue)" }}
          >
            Ofte stilte spørsmål om helsetilbud
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
            Fastlegedata fra{" "}
            <a
              href="https://www.ssb.no/statbank/table/12005"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              SSB tabell 12005
            </a>
            , lisens NLOD. Valgfritt OSM-lag fra{" "}
            <a
              href="https://www.openstreetmap.org"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              OpenStreetMap
            </a>{" "}
            (ODbL). Ved akutt nød, ring{" "}
            <a
              href="tel:113"
              className="underline font-semibold"
              style={{ color: "var(--kv-negative)" }}
            >
              113
            </a>
            . For offisielle opplysninger om helsetilbud, se{" "}
            <a
              href="https://www.helsenorge.no"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              helsenorge.no
            </a>
            .
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
