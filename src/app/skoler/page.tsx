import type { Metadata } from "next";
import { SchoolsMapLoader } from "@/components/schools-map-loader";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

export const metadata: Metadata = {
  title: "Skoler og barnehager",
  description:
    "Alle 3 100+ skoler og 5 500+ barnehager i Norge på kart. Grunnskoler, videregående og barnehager med elev-/barnetall, trinn og eierskap. Data fra Utdanningsdirektoratet (NSR + NBR).",
  alternates: { canonical: "/skoler" },
};

const faqs = [
  {
    q: "Hvor mange skoler og barnehager er det i Norge?",
    a: "Per i dag viser kartet 3 100+ aktive skoler (grunnskoler og videregående) og 5 500+ barnehager. Tallet endrer seg når Utdanningsdirektoratet oppdaterer registrene daglig fra Brønnøysundregistrene.",
  },
  {
    q: "Hva er forskjellen på Nasjonalt skoleregister og Nasjonalt barnehageregister?",
    a: "NSR (Nasjonalt skoleregister) inneholder grunnskoler, videregående skoler, kulturskoler, voksenopplæring og folkehøgskoler. NBR (Nasjonalt barnehageregister) inneholder alle aktive barnehager. Begge driftes av Utdanningsdirektoratet og oppdateres daglig.",
  },
  {
    q: "Hvorfor mangler noen skoler informasjon om elevtall?",
    a: "UDIR har ikke elevtall for alle skoler, særlig for nyere private skoler eller skoler under etablering. Vi viser elevtall der det finnes, ellers står det «–».",
  },
  {
    q: "Hva er forskjellen på offentlig og privat eierskap?",
    a: "Offentlige skoler og barnehager er kommunale, fylkeskommunale eller statlige. Private kan være ideelle, kommersielle eller religiøse. Begge typer er en del av det offentlige utdanningssystemet og finansieres delvis av staten.",
  },
  {
    q: "Hvor kommer dataene fra?",
    a: "All data hentes daglig fra Utdanningsdirektoratets åpne API-er (data-nsr.udir.no og data-nbr.udir.no) som igjen baserer seg på Brønnøysundregistrene. Koordinater oppgis av UDIR direkte.",
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

export default function SkolerPage() {
  return (
    <>
      <SchoolsMapLoader />
      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 pt-5 pb-12 md:pb-16 max-w-3xl">
          <h2
            className="text-2xl font-extrabold tracking-tight mb-6"
            style={{ color: "var(--kv-blue)" }}
          >
            Ofte stilte spørsmål om skoler og barnehager
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
              href="https://nsr.udir.no"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Nasjonalt skoleregister
            </a>{" "}
            og{" "}
            <a
              href="https://nbr.udir.no"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Nasjonalt barnehageregister
            </a>
            . Driftes av Utdanningsdirektoratet, oppdateres daglig fra
            Brønnøysundregistrene.
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
