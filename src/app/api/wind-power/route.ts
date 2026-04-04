// UTM zone 33N (EPSG:25833) to WGS84 conversion
// Based on Karney's method, simplified for Norway's latitude range
function utmToLatLon(easting: number, northing: number): { lat: number; lon: number } {
  const k0 = 0.9996;
  const a = 6378137;
  const f = 1 / 298.257223563;
  const e = Math.sqrt(2 * f - f * f);
  const e2 = e * e;
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const lon0 = (15 * Math.PI) / 180; // zone 33 central meridian

  const x = easting - 500000;
  const y = northing;

  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 * e1 * e1) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 * e1 * e1 * e1) / 32) * Math.sin(4 * mu) +
    ((151 * e1 * e1 * e1) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 * e1 * e1 * e1) / 512) * Math.sin(8 * mu);

  const sinPhi = Math.sin(phi1);
  const cosPhi = Math.cos(phi1);
  const tanPhi = Math.tan(phi1);
  const ep2 = e2 / (1 - e2);
  const N1 = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const T1 = tanPhi * tanPhi;
  const C1 = ep2 * cosPhi * cosPhi;
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinPhi * sinPhi, 1.5);
  const D = x / (N1 * k0);

  const lat =
    phi1 -
    ((N1 * tanPhi) / R1) *
      (D * D / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D * D * D * D) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) *
          D * D * D * D * D * D) /
          720);

  const lon =
    lon0 +
    (D -
      ((1 + 2 * T1 + C1) * D * D * D) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) *
        D * D * D * D * D) /
        120) /
      cosPhi;

  return {
    lat: (lat * 180) / Math.PI,
    lon: (lon * 180) / Math.PI,
  };
}

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
        "User-Agent": "MapGram/1.0 github.com/FemtiGram/kart",
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
