import { utmToLatLon } from "@/lib/utm";

// NVE migrated their ArcGIS REST endpoint from `nve.geodataonline.no` to
// `kart.nve.no/enterprise/...` in 2026 — same layer numbering but all
// attribute names are now lowercase (e.g. `anleggnavn` instead of
// `anleggNavn`).
interface ArcGISFeature {
  attributes: {
    objectid: number;
    anleggnavn: string;
    eier: string | null;
    kommune: string | null;
    fylkenavn: string | null;
    effekt_mw: number | null;
    effekt_mw_idrift: number | null;
    forventetproduksjon_gwh: number | null;
    antallturbiner: number | null;
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
      "https://kart.nve.no/enterprise/rest/services/Vindkraft2/MapServer/0/query" +
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
          id: a.objectid,
          name: a.anleggnavn ?? "Ukjent",
          owner: a.eier ?? null,
          municipality: a.kommune ?? null,
          county: a.fylkenavn ?? null,
          lat,
          lon,
          capacityMW: a.effekt_mw_idrift ?? a.effekt_mw ?? null,
          turbineCount: a.antallturbiner ?? null,
          productionGWh: a.forventetproduksjon_gwh ?? null,
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
