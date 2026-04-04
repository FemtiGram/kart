export async function GET() {
  try {
    const res = await fetch(
      "https://api.nve.no/web/WindPowerPlant/GetWindPowerPlantsInOperation",
      {
        headers: {
          "User-Agent": "MapGram/1.0 github.com/FemtiGram/kart",
          Accept: "application/json",
        },
        next: { revalidate: 3600 }, // cache 1 hour
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) {
      return Response.json(
        { error: "NVE API returned " + res.status },
        { status: res.status }
      );
    }

    const raw: Array<Record<string, unknown>> = await res.json();

    const windFarms = raw
      .map((item) => ({
        id: item.OrkAntKonsId ?? item.Id ?? item.id,
        name:
          (item.Navn as string) ??
          (item.Name as string) ??
          (item.navn as string) ??
          "Ukjent",
        owner:
          (item.Eier as string) ??
          (item.Owner as string) ??
          (item.eier as string) ??
          null,
        municipality:
          (item.Kommune as string) ??
          (item.KommuneNavn as string) ??
          (item.kommune as string) ??
          null,
        county:
          (item.Fylke as string) ??
          (item.FylkeNavn as string) ??
          (item.fylke as string) ??
          null,
        lat:
          (item.Breddegrad as number) ??
          (item.Latitude as number) ??
          (item.lat as number) ??
          null,
        lon:
          (item.Lengdegrad as number) ??
          (item.Longitude as number) ??
          (item.lon as number) ??
          null,
        capacityMW:
          (item.MaksYtelse as number) ??
          (item.InstallertEffektMW as number) ??
          (item.InstalledCapacityMW as number) ??
          null,
        turbineCount:
          (item.AntallTurbiner as number) ??
          (item.TurbineCount as number) ??
          null,
        productionGWh:
          (item.Produksjon as number) ??
          (item.ForventetArligProduksjon as number) ??
          (item.AnnualProductionGWh as number) ??
          null,
        status: "I drift" as const,
      }))
      .filter(
        (wf) =>
          wf.lat != null &&
          wf.lon != null &&
          typeof wf.lat === "number" &&
          typeof wf.lon === "number"
      );

    return Response.json({ windFarms });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error fetching wind data";
    return Response.json({ error: message }, { status: 500 });
  }
}
