import { EnergyMapLoader } from "@/components/energy-map-loader";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

export const metadata = {
  title: "Energikart",
  description:
    "Norges kraftverk på kart. Over 1 700 vannkraftverk, vindkraftanlegg, planlagt havvind og olje- og gassanlegg med produksjonsdata.",
  alternates: { canonical: "/energi" },
};

const faqs = [
  {
    q: "Hvor mange kraftverk finnes i Norge?",
    a: "Over 1 700 vannkraftverk og et voksende antall vindkraftanlegg er registrert hos NVE. Kartet viser alle operative vannkraftverk, vindkraftanlegg (i drift, under bygging, godkjent og avslått), planlagte havvindområder og over 130 olje- og gassanlegg på norsk sokkel.",
  },
  {
    q: "Hva er forskjellen mellom MW og GWh?",
    a: "MW (megawatt) er installert kapasitet — hvor mye strøm kraftverket kan produsere på et gitt tidspunkt. GWh (gigawattimer) er faktisk produksjon over et år. Et 100 MW vindkraftverk som produserer 300 GWh/år har en kapasitetsfaktor på ca. 34 %, som er typisk for norske vindkraftverk.",
  },
  {
    q: "Hvorfor er noen kraftverk skjult på kartet?",
    a: "Kraftverk under 10 MW er skjult som standard for bedre ytelse — det finnes over 1 000 små kraftverk i Norge. Du kan vise dem ved å åpne filteret og slå på «Vis små kraftverk».",
  },
  {
    q: "Hva betyr fallhøyde for et vannkraftverk?",
    a: "Fallhøyde er høydeforskjellen mellom inntaket (der vannet tas inn) og utløpet (der det slippes ut). Høyere fall gir mer energi per kubikkmeter vann. Norges største fallhøyder er over 1 000 meter.",
  },
  {
    q: "Hva viser produksjonsdataene for olje og gass?",
    a: "For hvert felt vises årlig produksjon i millioner standard kubikkmeter oljeekvivalenter (Sm³ o.e.), fordelt på olje og gass. Dataene kommer fra Sokkeldirektoratet og dekker hele produksjonshistorikken.",
  },
  {
    q: "Hvor kommer dataene fra?",
    a: "Kraftverkdata kommer fra NVE (Norges vassdrags- og energidirektorat). Olje- og gassdata kommer fra Sokkeldirektoratet (Sodir). Begge oppdateres med 1 times mellomlagring.",
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

export default function EnergiPage() {
  return (
    <>
      <EnergyMapLoader />
      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 pt-5 pb-12 md:pb-16 max-w-3xl">
          <h2 className="text-2xl font-extrabold tracking-tight mb-6" style={{ color: "#24374c" }}>
            Ofte stilte spørsmål om energi i Norge
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
            Data fra <a href="https://www.nve.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">NVE</a> og <a href="https://www.sodir.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Sodir</a>. Oppdateres med 1 times mellomlagring.
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
