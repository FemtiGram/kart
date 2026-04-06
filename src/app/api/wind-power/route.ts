import { utmToLatLon } from "@/lib/utm";

interface ArcGISFeature {
  attributes: {
    OBJECTID: number;
    anleggNavn: string;
    eier: string | null;
    kommune: string | null;
    fylkeNavn: string | null;
    effekt_MW: number | null;
    effekt_MW_idrift: number | null;
    forventetProduksjon_Gwh: number | null;
    antallTurbiner: number | null;
    status: string | null;
  };
  geometry: {
    x: number;
    y: number;
  };
}

export async function GET() {
  try {
    // Use NVE ArcGIS service — has exact coordinates (UTM zone 33N)
    const url =
      "https://nve.geodataonline.no/arcgis/rest/services/Vindkraft2/MapServer/0/query" +
      "?where=1%3D1&outFields=*&returnGeometry=true&f=json&resultRecordCount=200";

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Datakart/1.0 github.com/FemtiGram/kart",
      },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return Response.json(
        { error: "NVE ArcGIS returned " + res.status },
        { status: res.status }
      );
    }

    const data = await res.json();
    const features: ArcGISFeature[] = data.features ?? [];

    const windFarms = features
      .filter((f) => f.geometry?.x != null && f.geometry?.y != null)
      .map((f) => {
        const a = f.attributes;
        const { lat, lon } = utmToLatLon(f.geometry.x, f.geometry.y);
        return {
          id: a.OBJECTID,
          name: a.anleggNavn ?? "Ukjent",
          owner: a.eier ?? null,
          municipality: a.kommune ?? null,
          county: a.fylkeNavn ?? null,
          lat,
          lon,
          capacityMW: a.effekt_MW_idrift ?? a.effekt_MW ?? null,
          turbineCount: a.antallTurbiner ?? null,
          productionGWh: a.forventetProduksjon_Gwh ?? null,
          status: "I drift",
        };
      });

    return Response.json({ windFarms });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error fetching wind data";
    return Response.json({ error: message }, { status: 500 });
  }
}
