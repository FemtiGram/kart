import { ElevationMapLoader } from "@/components/elevation-map-loader";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

// Matched to what people search (Search Console, 90 days to Oct 2026): the
// biggest query is "hvor høyt over havet er jeg nå" (1 247 impressions), and
// "where am I standing" searches far outnumber "høyde over havet adresse"
// (103). The old address-led title got 2–6 % CTR at position ~4.5 on them.
const TITLE = "Hvor høyt over havet er jeg? Høydekart for Norge";
const DESCRIPTION =
  "Se hvor mange meter over havet du er nå: trykk på posisjonsknappen, søk opp en adresse eller klikk i kartet. Høyde over havet (moh.) fra Kartverket.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/map" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "/map",
    locale: "nb_NO",
    siteName: "Datakart",
  },
  keywords: [
    "hvor høyt over havet er jeg",
    "meter over havet nå",
    "høyde over havet min posisjon",
    "høyde over havet",
    "moh",
    "meter over havet",
    "høydekart",
    "høyde adresse",
    "høyde koordinater",
    "terrengkart",
    "Kartverket",
    "Norge",
  ],
};

// Plain <a> (full page load), not <Link>: the map only reads ?lat=&lon=&z=
// when the page loads.
const peaks = [
  { name: "Galdhøpiggen", href: "/map?lat=61.6364&lon=8.3125&z=14" },
  { name: "Glittertind", href: "/map?lat=61.6512&lon=8.5576&z=14" },
];

const faqs = [
  {
    q: "Hvordan ser jeg hvor høyt over havet jeg er nå?",
    a: "Trykk på posisjonsknappen ved siden av søkefeltet og la nettleseren bruke posisjonen din. Kartet går dit du står og viser høyden over havet i meter (moh.), sammen med været akkurat der. Høyden er terrenghøyden fra Kartverkets høydemodell, ikke GPS-høyden fra telefonen, som er mindre nøyaktig i høyden enn i kartposisjonen.",
  },
  {
    q: "Hvordan finner jeg ut hvor mange meter over havet adressen min ligger?",
    a: "Skriv adressen i søkefeltet over kartet og velg treffet. Høyden vises i kortet nederst i kartet, oppgitt i meter over havet (moh.). Du kan også klikke hvor som helst i kartet, eller trykke på posisjonsknappen for å se høyden der du står.",
  },
  {
    q: "Hva betyr moh.?",
    a: "moh. er en forkortelse for meter over havet. Høydene i kartet kommer fra Kartverkets nasjonale høydemodell.",
  },
  {
    q: "Hvor nøyaktig er høydedataene?",
    a: "Nøyaktigheten avhenger av datakilden. Der Kartverket har laserskannede data, er avviket typisk under én meter. Der terrengmodellen er grovere, kan avviket være noen meter. For fjelltopper og stedsnavn kan høyden også avvike fordi punktet du velger ikke ligger nøyaktig på toppen. Kilden for hvert punkt vises når du trykker «Vis mer».",
  },
  {
    q: "Kan jeg finne høyden for et sett med koordinater?",
    a: "Ja. Lim inn koordinatene i søkefeltet, for eksempel «61.6363, 8.3125», og velg treffet. Du kan også klikke hvor som helst i kartet for å se høyden over havet for akkurat det punktet.",
  },
  {
    q: "Kan jeg dele et punkt med andre?",
    a: "Ja. Trykk «Del» i kortet nederst i kartet, så får du en lenke som åpner kartet på det samme punktet, med høyde og vær. Lenken kan du sende på melding, e-post eller i sosiale medier.",
  },
  {
    q: "Hvordan fungerer terrengkartet?",
    a: "Terrengkartet bruker OpenTopoMap som viser høydekurver, skyggerelieff og topografiske detaljer. Dette gjør det lettere å se fjell, daler og bratthet sammenlignet med et vanlig veikart.",
  },
  {
    q: "Kan jeg bruke kartet til fjellturer?",
    a: "Kartet viser høyde og terreng, men er ikke et fullverdig turkart. For detaljert turplanlegging anbefaler vi UT.no eller Kartverkets Norgeskart. Høydekartet er nyttig for å sjekke høyder på spesifikke punkt.",
  },
  {
    q: "Hva viser værdataene?",
    a: "Når du velger et punkt, vises aktuell temperatur, vindstyrke og nedbør fra MET.no (yr.no) for de nærmeste timene. Temperaturen er justert for høyden på punktet du har valgt, slik at den blir mer presis i bratt terreng. Værdata oppdateres hvert 30. minutt.",
  },
  {
    q: "Hvor kommer dataene fra?",
    a: "Høydedata er fra Kartverkets høyde-API. Terrengkart er fra OpenTopoMap. Værdata er fra MET.no (Meteorologisk institutt). Adressesøk bruker Geonorge.",
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

export default function MapPage() {
  return (
    <>
      <h1 className="sr-only">Hvor høyt over havet er jeg? Høyde over havet for hele Norge</h1>
      <ElevationMapLoader />
      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 pt-5 pb-12 md:pb-16 max-w-3xl">
          <h2 className="text-2xl font-extrabold tracking-tight mb-3" style={{ color: "var(--kv-blue)" }}>
            Hvor høyt over havet ligger du?
          </h2>
          <p className="text-foreground/80 leading-relaxed">
            Trykk på posisjonsknappen, så ser du hvor mange meter over havet du er akkurat nå. Du kan også søke opp en
            adresse, lime inn koordinater eller klikke hvor som helst i kartet. Høyden vises i meter over havet (moh.) fra
            Kartverkets nasjonale høydemodell, og kortet viser været akkurat nå fra MET.no, med temperaturen justert for
            høyden på punktet.
          </p>
          <p className="text-foreground/80 leading-relaxed mt-3">
            Med «Del» får du en lenke som åpner kartet på samme punkt, for eksempel hytta, huset eller toppen du har vært på.
          </p>

          <h2 className="text-2xl font-extrabold tracking-tight mt-10 mb-3" style={{ color: "var(--kv-blue)" }}>
            Norges høyeste fjell
          </h2>
          <p className="text-foreground/80 leading-relaxed">
            Galdhøpiggen i Lom er Norges høyeste fjell med 2469 moh. Nummer to er Glittertind, også i Lom, som ble målt på
            nytt i 2020 til 2452 moh. Tidligere målinger ga Glittertind en større høyde, fordi isen på toppen var tykkere.
          </p>
          <ul className="flex flex-wrap gap-2 mt-4">
            {peaks.map((p) => (
              <li key={p.name}>
                <a
                  href={p.href}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl border bg-muted/50 hover:bg-muted transition-colors"
                >
                  Se {p.name} i kartet
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground mt-3">
            Høyden du ser når du klikker i kartet kommer fra terrengmodellen, og kan avvike litt fra den offisielle høyden
            på et toppunkt.
          </p>

          <h2 className="text-2xl font-extrabold tracking-tight mt-10 mb-6" style={{ color: "var(--kv-blue)" }}>
            Ofte stilte spørsmål om høyde over havet
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
            Data fra <a href="https://www.kartverket.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Kartverket</a>, <a href="https://opentopomap.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">OpenTopoMap</a> og <a href="https://www.met.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">MET.no</a>.
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
