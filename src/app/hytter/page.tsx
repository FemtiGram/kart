import { CabinMapLoader } from "@/components/cabin-map-loader";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

export const metadata = {
  title: "Turisthytter – Datakart",
  description:
    "Over 2 300 turisthytter og fjellhytter i Norge på kart. Se type, sengeplasser, høyde og vær fra DNT og OpenStreetMap.",
};

const faqs = [
  {
    q: "Hvor mange turisthytter finnes i Norge?",
    a: "Kartet viser over 2 300 hytter hentet fra OpenStreetMap, inkludert DNT-hytter, private fjellhytter og ubetjente hytter. De fleste ligger i fjellområder i Sør- og Midt-Norge.",
  },
  {
    q: "Hva er forskjellen mellom fjellhytte og ubetjent hytte?",
    a: "En fjellhytte (betjent) har vertskap, servering og sengetøy — du trenger bare ta med deg selv. En ubetjent hytte er ulåst (med DNT-nøkkel) og har basisutstyr som senger, ved og kjøkkenutstyr, men ingen vertskap. Du må ta med egen mat og sovepose.",
  },
  {
    q: "Hva er DNT?",
    a: "Den Norske Turistforening (DNT) er Norges største friluftslivsorganisasjon med over 300 000 medlemmer. DNT drifter et nettverk av merkede stier og hytter over hele landet. Medlemskap gir tilgang til låste hytter og rabatt på betjente hytter.",
  },
  {
    q: "Kan jeg se været ved en hytte?",
    a: "Ja! Når du velger en hytte vises aktuelt vær med temperatur, vind og nedbør. Værdata hentes fra MET.no (Meteorologisk institutt) og gjelder for hyttens eksakte posisjon.",
  },
  {
    q: "Hvordan finner jeg hytter i et bestemt område?",
    a: "Bruk søkefeltet til å søke etter et stedsnavn, fylke eller kommune. Du kan også bruke «Min posisjon»-knappen for å finne hytter nær deg. Filteret lar deg velge mellom fjellhytter og ubetjente hytter.",
  },
  {
    q: "Hvor kommer dataene fra?",
    a: "Hyttedata er hentet fra OpenStreetMap via Overpass API ved hver utrulling av nettsiden. Værdata er fra MET.no. Posisjoner og detaljer er dugnadsdrevet og kan inneholde mangler.",
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

export default function HytterPage() {
  return (
    <>
      <CabinMapLoader />
      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 pt-5 pb-12 md:pb-16 max-w-3xl">
          <h2 className="text-2xl font-extrabold tracking-tight mb-6" style={{ color: "#24374c" }}>
            Ofte stilte spørsmål om turisthytter
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
            Data fra <a href="https://www.openstreetmap.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">OpenStreetMap</a> og <a href="https://www.met.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">MET.no</a>. Hyttedata oppdateres ved hver utrulling.
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
