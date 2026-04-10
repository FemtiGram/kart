import { ExternalLink } from "lucide-react";

export const metadata = {
  title: "Datakilder og lisenser – Datakart",
  description: "Oversikt over alle datakilder, lisenser og attribusjon brukt i Datakart",
};

const sources = [
  {
    name: "Kartverket",
    description: "Karttjenester (WMTS), adressesok, hoydedata, kommunegrenser og stedsnavn.",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "\u00a9 Kartverket",
    url: "https://www.kartverket.no",
    usedIn: ["Alle kart"],
  },
  {
    name: "NVE (Norges vassdrags- og energidirektorat)",
    description: "Vindkraft, vannkraft, havvind, magasiner, hydrologiske data og magasinstatistikk.",
    license: "NLOD 2.0",
    licenseUrl: "https://data.norge.no/nlod/no/2.0",
    attribution: "Inneholder data under norsk lisens for offentlige data (NLOD) tilgjengeliggjort av NVE",
    url: "https://www.nve.no",
    usedIn: ["Energikart", "Magasinkart"],
  },
  {
    name: "Sokkeldirektoratet (Sodir)",
    description: "Olje- og gassanlegg, plattformer, undervannsinstallasjoner og rorledninger pa norsk sokkel.",
    license: "NLOD 2.0",
    licenseUrl: "https://data.norge.no/nlod/no/2.0",
    attribution: "Inneholder data under norsk lisens for offentlige data (NLOD) tilgjengeliggjort av Sodir",
    url: "https://www.sodir.no",
    usedIn: ["Energikart"],
  },
  {
    name: "Statistisk sentralbyra (SSB)",
    description: "Inntektsstatistikk per kommune og arealstatistikk for verneomrader.",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "\u00a9 Statistisk sentralbyra (SSB)",
    url: "https://www.ssb.no",
    usedIn: ["Inntektskart", "Verneomrader"],
  },
  {
    name: "Meteorologisk institutt (MET)",
    description: "Vardata og varsel via Locationforecast API.",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "\u00a9 MET Norway",
    url: "https://api.met.no",
    usedIn: ["Hoydekart", "Turisthytter"],
  },
  {
    name: "NOBIL / Enova",
    description: "Norges offisielle database for ladestasjoner. Inneholder kontakttyper, kapasitet, tilgjengelighet, operatør og sanntidsstatus.",
    license: "NLOD + CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    attribution: "\u00a9 NOBIL / Enova",
    url: "https://nobil.no",
    usedIn: ["Ladestasjoner"],
  },
  {
    name: "OpenStreetMap",
    description: "Turisthytter hentet via Overpass API.",
    license: "ODbL 1.0",
    licenseUrl: "https://opendatacommons.org/licenses/odbl/",
    attribution: "\u00a9 OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/copyright",
    usedIn: ["Turisthytter"],
  },
  {
    name: "OpenTopoMap",
    description: "Terrengkart brukt som alternativ kartvisning.",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    attribution: "\u00a9 OpenTopoMap",
    url: "https://opentopomap.org",
    usedIn: ["Hoydekart"],
  },
  {
    name: "Geonorge",
    description: "Adressesok og kommuneinformasjon via offentlige APIer.",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "\u00a9 Kartverket / Geonorge",
    url: "https://www.geonorge.no",
    usedIn: ["Alle kart"],
  },
];

export default function KilderPage() {
  return (
    <div className="min-h-[calc(100svh-57px)] bg-background">
      <div className="container mx-auto px-6 md:px-16 py-12 md:py-20 max-w-3xl">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ color: "#24374c" }}>
          Datakilder og lisenser
        </h1>
        <p className="mt-3 text-muted-foreground text-base max-w-xl">
          Datakart er bygget utelukkende pa fritt tilgjengelige, offentlige data. Ingen betalte API-er,
          ingen autentisering. Her er en oversikt over alle datakilder og deres lisenser.
        </p>

        <div className="mt-10 flex flex-col gap-6">
          {sources.map((source) => (
            <div
              key={source.name}
              className="rounded-2xl border bg-card p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-bold text-base">{source.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{source.description}</p>
                </div>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label={`Besok ${source.name}`}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>

              <div className="mt-3 pt-3 border-t flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Lisens</span>
                  <a
                    href={source.licenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-right hover:underline"
                    style={{ color: "var(--kv-blue)" }}
                  >
                    {source.license}
                  </a>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Attribusjon</span>
                  <span className="font-medium text-right text-xs max-w-[220px]">{source.attribution}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Brukes i</span>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {source.usedIn.map((map) => (
                      <span
                        key={map}
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-foreground/70"
                      >
                        {map}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t">
          <h2 className="font-bold text-base" style={{ color: "#24374c" }}>Om lisensene</h2>
          <div className="mt-4 flex flex-col gap-4 text-sm text-muted-foreground">
            <div>
              <p className="font-semibold text-foreground">NLOD 2.0 (Norsk lisens for offentlige data)</p>
              <p className="mt-1 leading-relaxed">
                Norges standardlisens for offentlige data. Tillater fri bruk, inkludert kommersiell,
                sa lenge kilden krediteres. Kompatibel med CC BY 4.0.
              </p>
            </div>
            <div>
              <p className="font-semibold text-foreground">CC BY 4.0 (Creative Commons Attribution)</p>
              <p className="mt-1 leading-relaxed">
                Tillater kopiering, redistribusjon og bearbeidelse for ethvert formal, inkludert kommersiell bruk,
                sa lenge opphavspersonen krediteres.
              </p>
            </div>
            <div>
              <p className="font-semibold text-foreground">ODbL 1.0 (Open Database License)</p>
              <p className="mt-1 leading-relaxed">
                Tillater fri bruk av databasen, inkludert kommersiell. Avledede databaser ma
                tilgjengeliggjores under ODbL. Produserte verk (som kart og applikasjoner) er unntatt
                fra delingsplikt.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
