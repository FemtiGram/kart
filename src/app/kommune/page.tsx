import Link from "next/link";
import type { Metadata } from "next";
import { getAllKommuner } from "@/lib/kommune-profiles";

export const metadata: Metadata = {
  title: "Kommuner",
  description:
    "Stedsprofil for alle 357 kommuner i Norge: befolkning, inntekt, boligpriser, energi, verneområder og infrastruktur. Basert på åpne data fra SSB, NVE, Kartverket og flere.",
};

export default function KommuneIndexPage() {
  const kommuner = getAllKommuner().sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "no")
  );

  // Group by fylke
  const byFylke: Record<string, typeof kommuner> = {};
  for (const k of kommuner) {
    const fylke = k.fylke ?? "Andre";
    (byFylke[fylke] ??= []).push(k);
  }
  const fylkeNames = Object.keys(byFylke).sort((a, b) =>
    a.localeCompare(b, "no")
  );

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

        <div className="mt-10 space-y-8">
          {fylkeNames.map((fylke) => (
            <div key={fylke}>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-foreground/70 mb-3">
                {fylke}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1">
                {byFylke[fylke].map((k) => (
                  <Link
                    key={k.knr}
                    href={`/kommune/${k.slug}`}
                    className="text-sm py-1 text-foreground/80 hover:text-foreground hover:underline transition-colors truncate"
                  >
                    {k.displayName}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
