import type { Metadata } from "next";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { UtviklingCalculator } from "@/components/utvikling-calculator";
import { getAllKommuner } from "@/lib/kommune-profiles";
import { Info } from "lucide-react";

export const metadata: Metadata = {
  title: "Prisutvikling-kalkulator",
  description:
    "Se hvordan boligprisene har utviklet seg i din kommune siden du kjøpte. Basert på SSBs kvadratmeterpriser. Ikke et nøyaktig estimat — bruk en megler eller bank for det.",
  alternates: { canonical: "/bolig/utvikling" },
};

const faqs = [
  {
    q: "Hvorfor får jeg ikke et eksakt tall?",
    a: "Vi har ikke data om akkurat din bolig — bare gjennomsnittsprisene per kommune og boligtype fra SSB. Faktisk verdi avhenger av tilstand, beliggenhet i kommunen, oppgraderinger, etasje, parkering og en haug andre faktorer som ikke er med i tallet vi viser. Tallet du får er et omtrentlig anslag for «hvis boligen din fulgte snittutviklingen i kommunen».",
  },
  {
    q: "Hvordan beregnes dette?",
    a: "Vi henter gjennomsnittlig kvadratmeterpris fra SSB tabell 06035 for kommunen og boligtypen din, både for kjøpsåret og det siste tilgjengelige året. Forholdet mellom de to gir en vekstfaktor som vi multipliserer med kjøpesummen din. Eksempel: bodde du i Trondheim og prisene per m² gikk fra 35 000 kr i 2018 til 47 000 kr i siste år tilgjengelig, er vekstfaktoren 1,34. En kjøpesum på 3 000 000 kr blir da til omtrent 4 020 000 kr.",
  },
  {
    q: "Hva er forskjellen mellom dette og bankenes estimat?",
    a: "Banker som Bulder, Storebrand og DNB bruker Eiendomsverdi sin AVM (Automatic Valuation Model). Den er trent på millioner av faktiske transaksjoner og tar hensyn til konkrete egenskaper ved boligen din — størrelse, etasje, byggeår, oppgraderinger osv. — og gir et estimat med usikkerhetsintervall. Vår kalkulator har ikke tilgang til transaksjonsdata på din spesifikke bolig. Vi viser bare snittutviklingen i kommunen din. Skal du ta en faktisk beslutning basert på verdien, bør du bruke en av de profesjonelle tjenestene.",
  },
  {
    q: "Hvilke data ligger til grunn?",
    a: "Tabell 06035 «Selveierboliger. Gjennomsnittlig kvadratmeterpris» fra Statistisk sentralbyrå (SSB). Den oppdateres årlig og dekker alle norske kommuner med tilstrekkelig antall salg. Fordelt på tre boligtyper: enebolig, småhus og blokkleilighet. Data er offentlig og fritt tilgjengelig.",
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

export default function UtviklingPage() {
  const kommuner = getAllKommuner()
    .map((k) => ({ knr: k.knr, name: k.name, fylke: k.fylke }))
    .sort((a, b) => a.name.localeCompare(b.name, "no"));

  return (
    <>
      <div className="min-h-[calc(100svh-57px)] bg-background">
        <div className="container mx-auto px-6 md:px-16 py-8 md:py-12 max-w-3xl">
          <h1 className="text-headline" style={{ color: "var(--kv-blue)" }}>
            Prisutvikling-kalkulator
          </h1>
          <p className="mt-2 text-muted-foreground max-w-xl">
            Se hvordan boligprisene har utviklet seg i din kommune siden du
            kjøpte. Basert på SSBs kvadratmeterpriser per kommune og boligtype.
          </p>

          <div className="mt-8">
            <UtviklingCalculator kommuner={kommuner} />
          </div>

          {/* Disclaimer card */}
          <div
            className="mt-6 rounded-2xl border px-5 py-4 sm:px-6 sm:py-5 flex gap-3"
            style={{
              background: "var(--kv-warning-light)",
              borderColor: "var(--kv-warning)",
            }}
          >
            <Info
              className="h-5 w-5 mt-0.5 shrink-0"
              style={{ color: "var(--kv-warning-dark)" }}
              aria-hidden="true"
            />
            <div className="text-sm" style={{ color: "var(--kv-warning-dark)" }}>
              <p className="font-semibold mb-1">
                Dette er ikke et estimat på din spesifikke bolig.
              </p>
              <p className="leading-relaxed">
                Vi viser bare gjennomsnittsprisutviklingen i kommunen din.
                Faktisk verdi avhenger av tilstand, beliggenhet, oppgraderinger
                og mye mer. Trenger du et reelt estimat, bruk{" "}
                <a
                  href="https://bulder.no"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  Bulder
                </a>
                ,{" "}
                <a
                  href="https://www.storebrand.no"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  Storebrand
                </a>
                , eller en eiendomsmegler med tilgang til{" "}
                <a
                  href="https://eiendomsverdi.no"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  Eiendomsverdi
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <section className="bg-background border-t">
        <div className="container mx-auto px-6 md:px-16 pt-5 pb-12 md:pb-16 max-w-3xl">
          <h2
            className="text-2xl font-extrabold tracking-tight mb-6"
            style={{ color: "var(--kv-blue)" }}
          >
            Ofte stilte spørsmål
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
              href="https://www.ssb.no/statbank/table/06035/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              SSB tabell 06035
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
