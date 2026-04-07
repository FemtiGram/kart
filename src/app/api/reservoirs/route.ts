// Slim API route — only fetches live national fill level.
// Reservoir geometry is now static (public/data/reservoirs.json).

export async function GET() {
  try {
    const res = await fetch(
      "https://biapi.nve.no/magasinstatistikk/api/Magasinstatistikk/HentOffentligData",
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5000),
        next: { revalidate: 3600 },
      }
    );

    if (!res.ok) {
      return Response.json({ error: `NVE fill API: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const national = data
      .filter((r: { omrnr: number }) => r.omrnr === 0)
      .sort((a: { dato_Id: string }, b: { dato_Id: string }) => b.dato_Id.localeCompare(a.dato_Id));

    if (national.length === 0) {
      return Response.json({ nationalFill: null });
    }

    const latest = national[0];
    return Response.json({
      nationalFill: {
        fyllingsgrad: latest.fyllingsgrad,
        kapasitet_TWh: latest.kapasitet_TWh,
        fylling_TWh: latest.fylling_TWh,
        iso_uke: latest.iso_uke,
        endring: latest.endring_fyllingsgrad,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
