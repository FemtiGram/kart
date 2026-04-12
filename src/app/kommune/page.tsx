import type { Metadata } from "next";
import { getAllKommuner } from "@/lib/kommune-profiles";
import { KommuneIndex } from "@/components/kommune-index";

export const metadata: Metadata = {
  title: "Kommuner",
  description:
    "Stedsprofil for alle 357 kommuner i Norge: befolkning, inntekt, boligpriser, energi, verneområder og infrastruktur. Basert på åpne data fra SSB, NVE, Kartverket og flere.",
};

export default function KommuneIndexPage() {
  const kommuner = getAllKommuner()
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "no"))
    .map((k) => ({
      knr: k.knr,
      displayName: k.displayName,
      name: k.name,
      slug: k.slug,
      fylke: k.fylke,
    }));

  return (
    <div className="min-h-[calc(100svh-57px)] bg-background">
      <div className="container mx-auto px-6 md:px-16 py-8 md:py-12 max-w-4xl">
        <h1 className="text-headline" style={{ color: "var(--kv-blue)" }}>
          Kommuner i Norge
        </h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Stedsprofil for alle {kommuner.length} kommuner. Hver profil samler
          befolkning, inntekt, boligmarked, energi, verneområder og infrastruktur
          fra åpne datakilder.
        </p>
        <KommuneIndex kommuner={kommuner} />
      </div>
    </div>
  );
}
