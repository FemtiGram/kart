import Link from "next/link";
import { BatteryCharging, Waves, Zap, ArrowRight } from "lucide-react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { CategoryHero } from "@/components/category-hero";
import { CategoryMapCard } from "@/components/category-map-card";

export const metadata = {
  title: "Energi i Norge — kraftverk, magasiner og lading",
  description:
    "Utforsk Norges energilandskap på interaktivt kart: 1 700+ vannkraftverk, vindkraftanlegg, vannmagasiner, ladestasjoner og oljeanlegg. Offisielle data fra NVE, Sodir og Enova.",
  alternates: { canonical: "/energi" },
  openGraph: {
    title: "Energi i Norge — kraftverk, magasiner og lading",
    description: "Utforsk Norges energilandskap på interaktivt kart.",
    type: "website",
    url: "/energi",
  },
};

const maps = [
  {
    href: "/energikart",
    title: "Energikart",
    description: "Hver vannkraftstasjon, vindturbinpark og olje- og gassanlegg på sokkelen — med produksjonshistorikk og fallhøyde.",
    bullets: [
      "1 700+ kraftverk fra NVE",
      "Olje- og gassanlegg fra Sodir",
      "Planlagt og operativ havvind",
    ],
    icon: BatteryCharging,
  },
  {
    href: "/magasin",
    title: "Magasinkart",
    description: "Vannmagasinene som driver halvparten av landets strømproduksjon, med fyllingsgrad og kapasitet.",
    bullets: [
      "Polygoner med areal og volum",
      "Sanntid fyllingsgrad fra NVE",
      "Vassdragsregioner",
    ],
    icon: Waves,
  },
  {
    href: "/lading",
    title: "Ladestasjoner",
    description: "Hver hurtiglader og vanlig elbil-lader i Norge, med live status om uttak er ledige akkurat nå.",
    bullets: [
      "Alle 11 000+ stasjoner fra Enova",
      "Sanntid status via WebSocket",
      "Effekt og operatør per uttak",
    ],
    icon: Zap,
  },
];

const faqs = [
  {
    q: "Hvor stor andel av Norges strøm kommer fra fornybart?",
    a: "Over 95 % av norsk strømproduksjon er fornybar — hovedsakelig vannkraft (88 %), supplert av vindkraft (cirka 10 %) og litt solenergi og termisk. Olje- og gassektoren bidrar i hovedsak til eksport av energi og statsinntekter, ikke til innenlands strømforsyning.",
  },
  {
    q: "Hvorfor er vannkraft så dominerende i Norge?",
    a: "Topografien er ideell: bratte fjell skaper høye fallhøyder, og innsjøer kan brukes som naturlige magasiner. Dette gjør Norge til Europas største produsent av vannkraft. Magasinene fungerer også som et nasjonalt batteri som kan reguleres opp og ned for å balansere variabel produksjon fra vind og sol.",
  },
  {
    q: "Hvor finner jeg ladestasjoner langs ruta?",
    a: "Bruk Ladestasjon-kartet og søk på adresse. Filtreringen lar deg vise kun hurtigladere over 50 kW, og live-statusen viser om uttaket er ledig akkurat nå.",
  },
];

const collectionJsonLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Energi i Norge — Datakart",
  description:
    "Samling av interaktive kart over norsk energi: kraftverk, vannmagasiner, ladestasjoner og olje- og gassanlegg.",
  inLanguage: "no",
  url: "https://datakart.no/energi",
  hasPart: maps.map((m) => ({
    "@type": "WebPage",
    name: m.title,
    url: `https://datakart.no${m.href}`,
    description: m.description,
  })),
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function EnergiCategoryPage() {
  return (
    <>
      <CategoryHero
        eyebrow="DATAKART · Kategori"
        title="Energi"
        intro="Norge produserer mer fornybar strøm per innbygger enn noe annet land i verden — og samtidig er vi en av Europas største olje- og gasseksportører. Disse kartene viser begge sider av bildet: hvor kraftverkene står, hvor magasinene holder vannet, hvor du kan lade elbilen, og hvor felter på sokkelen pumper opp olje og gass."
      />

      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 py-10 md:py-12 max-w-4xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {maps.map((m) => (
              <CategoryMapCard key={m.href} {...m} />
            ))}
          </div>

          <div className="mt-10 rounded-2xl border bg-muted/40 px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold">
                Også relevant: vernet natur og stedsprofil
              </p>
              <p className="text-xs text-foreground/70 mt-0.5">
                Mange kraftverk ligger i eller ved verneområder. Stedsprofilen viser energisituasjonen per kommune.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link
                href="/natur"
                className="inline-flex items-center gap-1 rounded-xl border bg-card hover:bg-muted px-3 py-1.5 text-xs font-semibold transition-colors"
              >
                Natur <ArrowRight className="h-3 w-3" />
              </Link>
              <Link
                href="/kommune"
                className="inline-flex items-center gap-1 rounded-xl border bg-card hover:bg-muted px-3 py-1.5 text-xs font-semibold transition-colors"
              >
                Stedsprofil <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 pt-5 pb-12 md:pb-16 max-w-3xl">
          <h2 className="text-2xl font-extrabold tracking-tight mb-6" style={{ color: "var(--kv-blue)" }}>
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
            Data fra <a href="https://www.nve.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">NVE</a>, <a href="https://www.sodir.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Sodir</a> og <a href="https://www.enova.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Enova</a>.
          </p>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
    </>
  );
}
