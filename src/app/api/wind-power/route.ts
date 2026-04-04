interface NVEWindFarm {
  VindkraftAnleggId: number;
  Navn: string;
  HovedEierNavn: string | null;
  Kommune: string;
  Fylke: string;
  InstallertEffekt_MW: number | null;
  NormalAArsproduksjon_GWh: number | null;
  AntallOperativeTurbiner: number | null;
  Turbiner: Array<{ AntallTurbiner: number }>;
  IdriftsettelseForsteByggetrinn: string | null;
}

interface KommunePoint {
  nord: number;
  øst: number;
}

export async function GET() {
  try {
    const res = await fetch(
      "https://api.nve.no/web/WindPowerPlant/GetWindPowerPlantsInOperation",
      {
        headers: {
          "User-Agent": "MapGram/1.0 github.com/FemtiGram/kart",
          Accept: "application/json",
        },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) {
      return Response.json(
        { error: "NVE API returned " + res.status },
        { status: res.status }
      );
    }

    const raw: NVEWindFarm[] = await res.json();

    // NVE API has no coordinates — geocode by kommune name via Geonorge
    const uniqueKommuner = [...new Set(raw.map((f) => f.Kommune).filter(Boolean))];
    const koordinater = new Map<string, { lat: number; lon: number }>();

    // Parallel geocode all unique kommuner (typically ~30-40)
    await Promise.all(
      uniqueKommuner.map(async (kommune) => {
        try {
          const r = await fetch(
            `https://ws.geonorge.no/stedsnavn/v1/navn?sok=${encodeURIComponent(kommune)}&treffPerSide=1`,
            { signal: AbortSignal.timeout(5000) }
          );
          const data = await r.json();
          const punkt: KommunePoint | undefined =
            data.navn?.[0]?.representasjonspunkt;
          if (punkt) {
            koordinater.set(kommune, { lat: punkt.nord, lon: punkt.øst });
          }
        } catch {
          /* skip this kommune */
        }
      })
    );

    // Slight offset for multiple farms in the same kommune
    const kommuneCount = new Map<string, number>();

    const windFarms = raw
      .map((item) => {
        const coords = koordinater.get(item.Kommune);
        if (!coords) return null;

        // Offset duplicates so markers don't stack
        const count = kommuneCount.get(item.Kommune) ?? 0;
        kommuneCount.set(item.Kommune, count + 1);
        const offsetLat = count * 0.015;
        const offsetLon = count * 0.02;

        const turbineCount =
          item.AntallOperativeTurbiner ??
          item.Turbiner?.reduce((sum, t) => sum + (t.AntallTurbiner ?? 0), 0) ??
          null;

        return {
          id: item.VindkraftAnleggId,
          name: item.Navn ?? "Ukjent",
          owner: item.HovedEierNavn ?? null,
          municipality: item.Kommune ?? null,
          county: item.Fylke ?? null,
          lat: coords.lat + offsetLat,
          lon: coords.lon + offsetLon,
          capacityMW: item.InstallertEffekt_MW ?? null,
          turbineCount,
          productionGWh: item.NormalAArsproduksjon_GWh ?? null,
          status: "I drift",
        };
      })
      .filter(Boolean);

    return Response.json({ windFarms });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error fetching wind data";
    return Response.json({ error: message }, { status: 500 });
  }
}
