import { utmToLatLon } from "@/lib/utm";

const NVE_BASE = "https://nve.geodataonline.no/arcgis/rest/services";
const QUERY = "query?where=1%3D1&outFields=*&returnGeometry=true&f=json&resultRecordCount=2000";

interface EnergyPlant {
  id: number;
  name: string;
  owner: string | null;
  municipality: string | null;
  county: string | null;
  lat: number;
  lon: number;
  capacityMW: number | null;
  productionGWh: number | null;
  type: "vind" | "vann";
  turbineCount?: number | null;
  fallHeight?: number | null;
  yearBuilt?: number | null;
  river?: string | null;
}

export async function GET() {
  try {
    // Fetch wind and hydro in parallel
    const [windRes, hydroRes] = await Promise.all([
      fetch(`${NVE_BASE}/Vindkraft2/MapServer/0/${QUERY}`, {
        headers: { "User-Agent": "MapGram/1.0 github.com/FemtiGram/kart" },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${NVE_BASE}/Vannkraft1/MapServer/0/${QUERY}`, {
        headers: { "User-Agent": "MapGram/1.0 github.com/FemtiGram/kart" },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      }),
    ]);

    const plants: EnergyPlant[] = [];

    // Process wind farms
    if (windRes.ok) {
      const windData = await windRes.json();
      for (const f of windData.features ?? []) {
        if (!f.geometry?.x || !f.geometry?.y) continue;
        const a = f.attributes;
        const { lat, lon } = utmToLatLon(f.geometry.x, f.geometry.y);
        plants.push({
          id: a.OBJECTID,
          name: a.anleggNavn ?? "Ukjent vindkraftverk",
          owner: a.eier ?? null,
          municipality: a.kommune ?? null,
          county: a.fylkeNavn ?? null,
          lat,
          lon,
          capacityMW: a.effekt_MW_idrift ?? a.effekt_MW ?? null,
          productionGWh: a.forventetProduksjon_Gwh ?? null,
          type: "vind",
          turbineCount: a.antallTurbiner ?? null,
        });
      }
    }

    // Process hydro plants
    if (hydroRes.ok) {
      const hydroData = await hydroRes.json();
      for (const f of hydroData.features ?? []) {
        if (!f.geometry?.x || !f.geometry?.y) continue;
        const a = f.attributes;
        // Only include operational plants (status "D" = Drift)
        if (a.status !== "D") continue;
        const { lat, lon } = utmToLatLon(f.geometry.x, f.geometry.y);
        plants.push({
          id: 100000 + (a.OBJECTID ?? a.vannkraftverkNr),
          name: a.vannkraftverkNavn ?? "Ukjent vannkraftverk",
          owner: a.vannkraftverkEier ?? null,
          municipality: a.kommuneNavn ?? null,
          county: a.fylke ?? null,
          lat,
          lon,
          capacityMW: a.maksYtelse_MW ?? null,
          productionGWh: null, // not in hydro data
          type: "vann",
          fallHeight: a.bruttoFallhoyde_m ?? null,
          yearBuilt: a.idriftsattAar ?? null,
          river: a.elvenavnHierarki ?? null,
        });
      }
    }

    // Summary stats
    const windCount = plants.filter((p) => p.type === "vind").length;
    const hydroCount = plants.filter((p) => p.type === "vann").length;
    const totalCapacityMW = plants.reduce(
      (sum, p) => sum + (p.capacityMW ?? 0),
      0
    );

    return Response.json({
      plants,
      stats: { windCount, hydroCount, totalCapacityMW: Math.round(totalCapacityMW) },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
