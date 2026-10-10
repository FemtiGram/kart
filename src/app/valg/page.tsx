import { Fragment } from "react";
import { ValgMapLoader } from "@/components/valg-map-loader";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { getElectionHistory } from "@/lib/valg-historikk";
import { partyShort, partyText } from "@/lib/party-colors";

export const metadata = {
  title: "Valgkart Norge — valgresultater per kommune 1945–2025",
  description:
    "Valgkart for alle 357 kommuner: vinnerparti, stemmefordeling og frammøte i stortingsvalget 2025 og 2021 og kommunevalget 2023 og 2019, pluss alle stortingsvalg siden 1945 på en animert tidslinje.",
  alternates: { canonical: "/valg" },
  openGraph: {
    title: "Valgkart Norge — valgresultater per kommune 1945–2025",
    description:
      "Alle stortingsvalg fra 1945 til 2025 på dagens kommunekart, pluss stortingsvalget 2025, 2021 og kommunestyrevalget 2023, 2019 i detalj. Vinnerparti, stemmefordeling og frammøte.",
    type: "website",
    url: "/valg",
  },
  keywords: [
    "valgkart",
    "stortingsvalg 2025",
    "kommunestyrevalg 2023",
    "stortingsvalg 1945–2025",
    "valghistorie",
    "historiske valgresultater",
    "valgresultater",
    "vinnerparti per kommune",
    "frammøte",
    "Norge",
    "Valgdirektoratet",
    "interaktivt kart",
  ],
};

const faqs = [
  {
    q: "Hva viser kartet?",
    a: "Hver kommune er farget etter det partiet som fikk flest stemmer i kommunen. Du kan bytte mellom Stortingsvalg og Kommunestyrevalg (2019–2025), og klikke på en kommune for å se full stemmefordeling, frammøte og endring fra forrige sammenlignbare valg. Knappen «Tidslinje» spiller av alle stortingsvalg fra 1945 til 2025 på dagens kommunekart.",
  },
  {
    q: "Hvorfor stemmer ikke valgkartet med setefordelingen på Stortinget?",
    a: "Kartet viser kun det største partiet i hver kommune. Stortingsmandater fordeles per valgkrets (fylke) og inkluderer utjevningsmandater for å gi en mer proporsjonal fordeling på landsbasis. Et parti kan vinne i mange kommuner uten å få flest mandater, og omvendt. Bruk kartet til å se geografiske mønstre, ikke til å regne ut mandater.",
  },
  {
    q: "Hva betyr +/- prosenttallet ved hvert parti?",
    a: "Det er endringen i oppslutning fra forrige sammenlignbare valg, beregnet av Valgdirektoratet. For Stortingsvalg 2025 sammenlignes med Stortingsvalg 2021. For Kommunestyrevalg 2023 sammenlignes med Kommunestyrevalg 2019. Stortingsvalg og kommunestyrevalg sammenlignes aldri direkte med hverandre — de er ulike valgtyper.",
  },
  {
    q: "Hvorfor mangler noen kommuner data?",
    a: "Haram kommune (1580) vises som grå for 2019 og 2021, fordi kommunen ikke eksisterte som egen enhet i de valgene — Haram var slått sammen med Ålesund fra 2020 til 2024. Resultatene fra disse årene ligger derfor inne i Ålesunds tall, og kan ikke splittes geografisk i etterkant.",
  },
  {
    q: "Kan jeg se eldre valg?",
    a: "Ja, for stortingsvalg. Tidslinjen viser alle 21 stortingsvalg fra 1945 til 2025, regnet om til dagens 357 kommuner. Detaljvisningen med stemmefordeling og frammøte per kommune dekker stortingsvalget 2021 og 2025 og kommunestyrevalget 2019 og 2023. Eldre kommunestyrevalg finnes ikke per kommune i en form som kan regnes om på samme måte.",
  },
  {
    q: "Hvordan kan valg fra 1945 vises på dagens kommunekart?",
    a: "I 1945 hadde Norge 744 kommuner, i dag 357. Stemmene fra hver historisk kommune (SSB tabell 08092) er fulgt gjennom alle kommuneendringer siden 1945 (SSBs kommuneklassifisering) og lagt sammen i dagens kommuner. Der en gammel kommune senere ble delt, går stemmene til den delen som beholdt navnet. Kommuner som ikke fantes ennå, viser resultatet for kommunen de var en del av. Kartet viser prosentandeler, så små grensejusteringer flytter bare brøkdeler av et prosentpoeng. Bondepartiet vises som Senterpartiet, Anders Langes parti som Fremskrittspartiet, Sosialistisk Folkeparti som SV og Rød Valgallianse som Rødt.",
  },
  {
    q: "Stemmer tallene helt?",
    a: "Tallene hentes fra Valgdirektoratets endelige offisielle resultater på byggetidspunktet og oppdateres ikke automatisk hvis Valgdirektoratet skulle gjøre etterkorrigeringer. Eldre kommunenumre (2019, 2021) er omkartlagt til dagens kommuneinndeling basert på navn og fylkestilhørighet — i sjeldne tilfeller kan dette gi mindre avvik for kommuner som har endret navn eller fylke. Vi anbefaler valgresultat.no som autoritativ kilde for konkrete tall.",
  },
  {
    q: "Hvor kommer dataene fra?",
    a: "Resultatene for 2019–2025 er hentet fra Valgdirektoratet via valgresultat.no, den offisielle kilden for norske valgresultater. Tidslinjen 1945–2025 bygger på SSBs valgstatistikk (tabell 08092) og SSBs oversikt over kommuneendringer. For 2021 og 2025 stemmer de to kildene overens innenfor avrunding. Kommunegrenser er fra Kartverket.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

// Dataset JSON-LD — tells Google's Dataset Search and AI search engines
// (Perplexity, ChatGPT, Google AI Overviews) precisely what data this page
// exposes, who maintains it, and where the source lives.
const datasetJsonLd = {
  "@context": "https://schema.org",
  "@type": "Dataset",
  name: "Valgresultater per kommune i Norge",
  description:
    "Offisielle valgresultater fra Stortingsvalg 2025 og 2021, og Kommunestyrevalg 2023 og 2019, brutt ned på alle 357 norske kommuner, med vinnerparti, stemmefordeling, frammøte og endring fra forrige valg. I tillegg alle stortingsvalg fra 1945 til 2025, regnet om til dagens kommuner.",
  inLanguage: "no",
  isAccessibleForFree: true,
  license: "https://creativecommons.org/licenses/by/4.0/",
  keywords: [
    "stortingsvalg",
    "kommunestyrevalg",
    "valgresultater",
    "valghistorie",
    "vinnerparti",
    "frammøte",
    "kommune",
    "Norge",
  ],
  spatialCoverage: { "@type": "Place", name: "Norge" },
  temporalCoverage: "1945/2025",
  creator: [
    { "@type": "Organization", name: "Valgdirektoratet", url: "https://valgresultat.no" },
    { "@type": "Organization", name: "Statistisk sentralbyrå (SSB)", url: "https://www.ssb.no" },
  ],
  publisher: {
    "@type": "Organization",
    name: "Datakart",
    url: "https://www.datakart.no",
  },
  url: "https://www.datakart.no/valg",
  variableMeasured: [
    "Vinnerparti per kommune",
    "Stemmer per parti (antall og prosent)",
    "Frammøte per kommune",
    "Endring i oppslutning fra forrige valg",
    "Største parti per kommune i alle stortingsvalg 1945–2025",
  ],
};

const pct = (v: number) => `${v.toFixed(1).replace(".", ",")} %`;

export default function ValgPage() {
  const { elections: history, kommuner } = getElectionHistory();
  const first = history[0];
  const last = history[history.length - 1];
  return (
    <>
      <h1 className="sr-only">Valgkart — Stortingsvalg og kommunestyrevalg</h1>
      <ValgMapLoader />
      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 pt-5 pb-12 md:pb-16 max-w-3xl">
          {/* Crawlable version of the timeline: the map is client-rendered,
              these numbers come from the same historikk.json at build time. */}
          <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--kv-blue)" }}>
            Stortingsvalg {first.year}–{last.year}
          </h2>
          <p className="mt-2 text-foreground/80 leading-relaxed">
            Største parti nasjonalt og hvem som vant flest kommuner i alle {history.length} stortingsvalg siden krigen, regnet om til dagens {kommuner} kommuner. Trykk «Tidslinje» i kartet for å se utviklingen kommune for kommune.
          </p>
          <div className="mt-4 overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full text-[13px] sm:text-sm">
              <caption className="sr-only">Største parti og flest vunne kommuner per stortingsvalg {first.year}–{last.year}</caption>
              <thead>
                <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-2.5 sm:px-4 py-2.5">Valg</th>
                  <th scope="col" className="px-2.5 sm:px-4 py-2.5">Største parti</th>
                  <th scope="col" className="px-2.5 sm:px-4 py-2.5">Flest kommuner</th>
                </tr>
              </thead>
              <tbody>
                {history.map((e) => (
                  <tr key={e.year} className="border-b last:border-0">
                    <th scope="row" className="px-2.5 sm:px-4 py-2 text-left align-top font-bold tabular-nums" style={{ color: "var(--kv-blue)" }}>{e.year}</th>
                    <td className="px-2.5 sm:px-4 py-2 whitespace-nowrap align-top">
                      <span className="font-semibold" style={{ color: partyText(e.winner.party) }}>{partyShort(e.winner.party)}</span>{" "}
                      <span className="tabular-nums text-foreground/80">{pct(e.winner.share)}</span>
                    </td>
                    <td className="px-2.5 sm:px-4 py-2 text-foreground/80 align-top">
                      {e.wins.map((w, i) => (
                        <Fragment key={w.party}>
                          {i > 0 && " · "}
                          <span className="whitespace-nowrap">
                            <span className="font-semibold" style={{ color: partyText(w.party) }}>{partyShort(w.party)}</span>{" "}
                            <span className="tabular-nums">{w.count}</span>
                          </span>
                        </Fragment>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Kilde: SSB tabell 08092. Bondepartiet vises som Sp, Anders Langes parti som FrP, SF som SV og RV som Rødt. «Fellesliste» er felles lister for flere partier.
          </p>

          <h2 className="mt-12 text-2xl font-extrabold tracking-tight mb-6" style={{ color: "var(--kv-blue)" }}>
            Ofte stilte spørsmål om valgkartet
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

          <div
            className="mt-8 rounded-xl border-l-4 px-4 py-3 text-sm leading-relaxed"
            style={{
              background: "var(--kv-warning-light)",
              borderColor: "var(--kv-warning)",
              color: "var(--kv-warning-dark)",
            }}
          >
            <p className="font-semibold mb-1">Om tallene</p>
            <p>
              Resultatene er offisielle og endelige tall fra <a href="https://valgresultat.no" target="_blank" rel="noopener noreferrer" className="underline">Valgdirektoratet</a> og <a href="https://www.ssb.no/statbank/table/08092" target="_blank" rel="noopener noreferrer" className="underline">SSB</a> på byggetidspunktet. Eldre valg er regnet om til dagens kommuneinndeling. Kommuner som er slått sammen eller delt opp i mellomtiden kan derfor ha små avvik, særlig i valgene før 1965. Sjekk alltid valgresultat.no eller SSB for autoritative tall i konkrete saker.
            </p>
          </div>

          <p className="text-xs text-foreground/70 mt-6">
            Data fra <a href="https://valgresultat.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Valgdirektoratet</a> og <a href="https://www.ssb.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">SSB</a>. Kommunegrenser fra <a href="https://www.kartverket.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Kartverket</a>.
          </p>
        </div>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetJsonLd) }}
      />
    </>
  );
}
