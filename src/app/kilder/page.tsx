import { ExternalLink } from "lucide-react";

export const metadata = {
  title: "Datakilder og lisenser",
  description: "Oversikt over alle datakilder, lisenser og attribusjon brukt i Datakart",
  alternates: { canonical: "/kilder" },
};

const sources = [
  {
    name: "Kartverket",
    description: "Karttjenester (WMTS), adressesøk, høydedata, eiendomsgrenser fra matrikkelen, kommunegrenser og stedsnavn.",
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
    usedIn: ["Energikart", "Magasinkart", "Stedsprofil"],
  },
  {
    name: "Sokkeldirektoratet (Sodir)",
    description: "Olje- og gassanlegg, plattformer, undervannsinstallasjoner og rørledninger på norsk sokkel.",
    license: "NLOD 2.0",
    licenseUrl: "https://data.norge.no/nlod/no/2.0",
    attribution: "Inneholder data under norsk lisens for offentlige data (NLOD) tilgjengeliggjort av Sodir",
    url: "https://www.sodir.no",
    usedIn: ["Energikart"],
  },
  {
    name: "Statistisk sentralbyrå (SSB)",
    description: "Inntektsstatistikk, befolkningsstatistikk, boligpriser (tabell 06035 og 14545), fastlegedata (tabell 12005), kommunale gebyrer (tabell 12842), eiendomsskatt (tabell 14674), eierstatus (tabell 14891), boligtyper (tabell 06265), utdanningsnivå (tabell 09429), nasjonale prøver (tabell 12255), konsumprisindeks og arealstatistikk for verneområder.",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "\u00a9 Statistisk sentralbyrå (SSB)",
    url: "https://www.ssb.no",
    usedIn: ["Inntektskart", "Verneområder", "Boligkart", "Prisvekst", "Helsetilbud", "Kostnader", "Stedsprofil"],
  },
  {
    name: "Meteorologisk institutt (MET)",
    description: "Værdata og varsel via Locationforecast API.",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "\u00a9 MET Norway",
    url: "https://api.met.no",
    usedIn: ["Høydekart", "Turisthytter", "Stedsprofil"],
  },
  {
    name: "NOBIL / Enova",
    description: "Norges offisielle database for ladestasjoner. Inneholder kontakttyper, kapasitet, tilgjengelighet, operatør og sanntidsstatus.",
    license: "NLOD + CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    attribution: "\u00a9 NOBIL / Enova",
    url: "https://nobil.no",
    usedIn: ["Ladestasjoner", "Stedsprofil"],
  },
  {
    name: "OpenStreetMap",
    description: "Turisthytter og valgfri overlay av sykehus/legevakt hentet via Overpass API.",
    license: "ODbL 1.0",
    licenseUrl: "https://opendatacommons.org/licenses/odbl/",
    attribution: "\u00a9 OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/copyright",
    usedIn: ["Turisthytter", "Helsetilbud", "Stedsprofil"],
  },
  {
    name: "OpenTopoMap",
    description: "Terrengkart brukt som alternativ kartvisning.",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    attribution: "\u00a9 OpenTopoMap",
    url: "https://opentopomap.org",
    usedIn: ["Høydekart"],
  },
  {
    name: "Geonorge",
    description: "Adressesøk og kommuneinformasjon via offentlige API-er.",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "\u00a9 Kartverket / Geonorge",
    url: "https://www.geonorge.no",
    usedIn: ["Alle kart"],
  },
  {
    name: "Utdanningsdirektoratet (UDIR)",
    description: "Nasjonalt skoleregister (NSR) og Nasjonalt barnehageregister (NBR). Alle aktive skoler og barnehager med koordinater, eierskap, elev- og barnetall.",
    license: "NLOD 2.0",
    licenseUrl: "https://data.norge.no/nlod/no/2.0",
    attribution: "Inneholder data under norsk lisens for offentlige data (NLOD) tilgjengeliggjort av Utdanningsdirektoratet",
    url: "https://www.udir.no",
    usedIn: ["Skoler og barnehager", "Stedsprofil"],
  },
  {
    name: "Norges Bank",
    description: "Styringsrenten (policy rate) brukt som referanse mot inflasjonsmålet på 2 prosent.",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "\u00a9 Norges Bank",
    url: "https://www.norges-bank.no",
    usedIn: ["Prisvekst"],
  },
  {
    name: "Eurostat",
    description: "Harmonisert konsumprisindeks (HICP) for nordiske land brukt til sammenligning.",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "\u00a9 Eurostat",
    url: "https://ec.europa.eu/eurostat",
    usedIn: ["Prisvekst"],
  },
  {
    name: "Valgdirektoratet",
    description: "Offisielle valgresultater for stortingsvalg og kommunestyrevalg, fordelt p\u00e5 kommune. Inneholder vinnerparti, stemmefordeling, framm\u00f8te og endring fra forrige valg.",
    license: "NLOD 2.0",
    licenseUrl: "https://data.norge.no/nlod/no/2.0",
    attribution: "Inneholder data under norsk lisens for offentlige data (NLOD) tilgjengeliggjort av Valgdirektoratet",
    url: "https://valgresultat.no",
    usedIn: ["Valgkart", "Stedsprofil"],
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "DataCatalog",
  name: "Datakilder brukt i Datakart",
  description: "Oversikt over alle offentlige datakilder, lisenser og attribusjon brukt i Datakart.",
  url: "https://www.datakart.no/kilder",
  dataset: sources.map((s) => ({
    "@type": "Dataset",
    name: s.name,
    description: s.description,
    license: s.licenseUrl,
    url: s.url,
  })),
};

export default function KilderPage() {
  return (
    <div className="min-h-[calc(100svh-57px)] bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="container mx-auto px-6 md:px-16 py-12 md:py-20 max-w-3xl">
        <h1 className="text-headline" style={{ color: "var(--kv-blue)" }}>
          Datakilder og lisenser
        </h1>
        <p className="mt-3 text-muted-foreground text-base max-w-xl">
          Datakart er bygget utelukkende på fritt tilgjengelige, offentlige data. Ingen betalte API-er.
          Her er en oversikt over alle datakilder og deres lisenser.
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
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
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
          <h2 className="font-bold text-base" style={{ color: "var(--kv-blue)" }}>Om lisensene</h2>
          <div className="mt-4 flex flex-col gap-4 text-sm text-muted-foreground">
            <div>
              <p className="font-semibold text-foreground">NLOD 2.0 (Norsk lisens for offentlige data)</p>
              <p className="mt-1 leading-relaxed">
                Norges standardlisens for offentlige data. Tillater fri bruk, inkludert kommersiell,
                så lenge kilden krediteres. Kompatibel med CC BY 4.0.
              </p>
            </div>
            <div>
              <p className="font-semibold text-foreground">CC BY 4.0 (Creative Commons Attribution)</p>
              <p className="mt-1 leading-relaxed">
                Tillater kopiering, redistribusjon og bearbeidelse for ethvert formål, inkludert kommersiell bruk,
                så lenge opphavspersonen krediteres.
              </p>
            </div>
            <div>
              <p className="font-semibold text-foreground">ODbL 1.0 (Open Database License)</p>
              <p className="mt-1 leading-relaxed">
                Tillater fri bruk av databasen, inkludert kommersiell. Avledede databaser må
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
