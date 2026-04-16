import { ProtectedAreasMapLoader } from "@/components/protected-areas-map-loader";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

export const metadata = {
  title: "Verneområder",
  description:
    "Utforsk vernet natur i alle norske kommuner. Nasjonalparker, naturreservater og landskapsvernområder med andel og rangering.",
  alternates: { canonical: "/vern" },
};

const faqs = [
  {
    q: "Hvor stor andel av Norge er vernet?",
    a: "Omtrent 17 % av Fastlands-Norge er vernet gjennom ulike verneformer. Andelen varierer enormt mellom kommuner — fra 0 % i noen bykommuner til over 80 % i kommuner med store nasjonalparker.",
  },
  {
    q: "Hva er forskjellen mellom nasjonalpark og naturreservat?",
    a: "En nasjonalpark verner store, relativt urørte naturområder og tillater vanligvis friluftsliv som turgåing og fiske. Et naturreservat har strengere vern og beskytter spesielt verdifull natur — ferdsel kan være begrenset, spesielt i hekketiden.",
  },
  {
    q: "Hva betyr landskapsvernområde?",
    a: "Et landskapsvernområde verner karakteristiske landskap, ofte med kulturhistorisk verdi. Vernet er mindre strengt enn nasjonalpark — jordbruk og beite kan fortsette, men større inngrep som hyttebygging er ikke tillatt.",
  },
  {
    q: "Hvilke kommuner har mest vernet natur?",
    a: "Kommuner med store nasjonalparker som Luster (Jotunheimen/Jostedalsbreen), Vang (Jotunheimen) og kommuner i Finnmark har ofte over 50 % vernet areal. Kartet viser prosentandel vernet for hver kommune.",
  },
  {
    q: "Hva betyr fargene på kartet?",
    a: "Grønt betyr høy andel vernet natur, gult er middels, og rødt er lav andel. Fargeskalaen går fra 0 % til 60 %+ vernet areal. Kommuner uten vernet natur vises i grått.",
  },
  {
    q: "Hvor kommer dataene fra?",
    a: "Vernedata er fra SSB (Statistisk sentralbyrå), tabell 08936. Kommunearealer beregnes fra GeoJSON-geometri. Dataene gjelder 2024.",
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

export default function VernPage() {
  return (
    <>
      <ProtectedAreasMapLoader />
      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 pt-5 pb-12 md:pb-16 max-w-3xl">
          <h2 className="text-2xl font-extrabold tracking-tight mb-6" style={{ color: "#24374c" }}>
            Ofte stilte spørsmål om vernet natur
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
