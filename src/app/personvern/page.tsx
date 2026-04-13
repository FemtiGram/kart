import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Personvern",
  description:
    "Personvernerklæring for Datakart. Hva vi samler, hvordan det brukes, og hvilke rettigheter du har.",
  alternates: { canonical: "/personvern" },
};

export default function PersonvernPage() {
  return (
    <div className="min-h-[calc(100svh-57px)] bg-background">
      <div className="container mx-auto px-6 md:px-16 py-12 md:py-16 max-w-3xl">
        <h1 className="text-headline" style={{ color: "var(--kv-blue)" }}>
          Personvern
        </h1>
        <p className="mt-4 text-muted-foreground">
          Datakart er en åpen tjeneste som samler og visualiserer offentlig
          tilgjengelige data om Norge. Vi har ingen brukerkontoer og lagrer
          ingen personopplysninger om deg. Denne siden forklarer hva vi
          samler inn automatisk og hvordan det brukes.
        </p>

        <section className="mt-10">
          <h2
            className="text-title"
            style={{ color: "var(--kv-blue)" }}
          >
            Hva samler vi?
          </h2>

          <h3 className="mt-6 text-subtitle">Google Analytics</h3>
          <p className="mt-2 text-foreground/80 leading-relaxed">
            Vi bruker Google Analytics (måle-ID{" "}
            <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
              G-T8XDP59WNK
            </span>
            ) for å telle besøkende og forstå hvilke kart og sider som er
            mest brukt. Dette inkluderer:
          </p>
          <ul className="mt-3 space-y-1 text-foreground/80 list-disc pl-6">
            <li>Anonymisert IP-adresse</li>
            <li>Nettleser og operativsystem</li>
            <li>Land og region (ikke nøyaktig plassering)</li>
            <li>Hvilke sider du besøker og hvor lenge</li>
            <li>Hvordan du kom til siden (søkemotor, lenke, osv.)</li>
          </ul>
          <p className="mt-3 text-foreground/80 leading-relaxed">
            Ingen personlig identifiserbar informasjon samles inn. Du kan
            blokkere Google Analytics i nettleseren din ved å bruke en
            annonseblokker eller &ldquo;Do Not Track&rdquo;-innstillinger.
          </p>

          <h3 className="mt-6 text-subtitle">Loggdata fra Vercel</h3>
          <p className="mt-2 text-foreground/80 leading-relaxed">
            Datakart hostes på Vercel. Vercel logger standard informasjon om
            forespørsler (IP-adresse, tidspunkt, URL, nettleser) for
            feilsøking og sikkerhet. Disse loggene slettes automatisk etter
            kort tid og brukes ikke til å profilere besøkende.
          </p>
        </section>

        <section className="mt-10">
          <h2
            className="text-title"
            style={{ color: "var(--kv-blue)" }}
          >
            Hva samler vi ikke?
          </h2>
          <ul className="mt-3 space-y-1 text-foreground/80 list-disc pl-6">
            <li>Vi har ingen brukerkontoer eller innlogging</li>
            <li>Vi lagrer ingen data om deg på våre servere</li>
            <li>Vi selger eller deler ikke data med tredjeparter</li>
            <li>Vi bruker ingen sporings-pixler fra sosiale medier</li>
            <li>Vi bruker ingen tredjeparts annonsenettverk</li>
          </ul>
        </section>

        <section className="mt-10">
          <h2
            className="text-title"
            style={{ color: "var(--kv-blue)" }}
          >
            Datakilder
          </h2>
          <p className="mt-2 text-foreground/80 leading-relaxed">
            All data som vises på Datakart kommer fra offentlig tilgjengelige
            kilder. Se <Link href="/kilder" className="underline hover:text-foreground">datakilder og lisenser</Link> for
            full oversikt. Når nettleseren din henter kartfliser, værdata
            eller adressesøk, sendes forespørsler direkte til disse
            tjenestene. De kan logge forespørslene dine etter sine egne
            retningslinjer.
          </p>
        </section>

        <section className="mt-10">
          <h2
            className="text-title"
            style={{ color: "var(--kv-blue)" }}
          >
            Informasjonskapsler (cookies)
          </h2>
          <p className="mt-2 text-foreground/80 leading-relaxed">
            Google Analytics setter noen informasjonskapsler for å skille
            unike besøkende og forstå hvordan siden brukes. Disse utløper
            automatisk etter maks to år. Datakart setter selv ingen
            informasjonskapsler.
          </p>
        </section>

        <section className="mt-10">
          <h2
            className="text-title"
            style={{ color: "var(--kv-blue)" }}
          >
            Dine rettigheter
          </h2>
          <p className="mt-2 text-foreground/80 leading-relaxed">
            Siden vi ikke lagrer personopplysninger om deg, har vi ingen data
            du kan be om innsyn i, retting av, eller sletting av. For
            spørsmål om Google Analytics-data som samles av Google, se{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Googles personvernerklæring
            </a>
            .
          </p>
        </section>

        <section className="mt-10">
          <h2
            className="text-title"
            style={{ color: "var(--kv-blue)" }}
          >
            Kontakt
          </h2>
          <p className="mt-2 text-foreground/80 leading-relaxed">
            Datakart er et personlig prosjekt laget av Anders Gram. Har du
            spørsmål om personvern, sikkerhet, eller selve tjenesten, kan du
            ta kontakt via{" "}
            <a
              href="https://github.com/FemtiGram/kart/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              GitHub
            </a>
            .
          </p>
        </section>

        <p className="mt-12 pt-6 border-t text-xs text-muted-foreground">
          Sist oppdatert: 13. april 2026
        </p>
      </div>
    </div>
  );
}
