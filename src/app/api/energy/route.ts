import { utmToLatLon } from "@/lib/utm";

const NVE_BASE = "https://nve.geodataonline.no/arcgis/rest/services";
const QUERY = "query?where=1%3D1&outFields=*&returnGeometry=true&f=json&resultRecordCount=2000";

type WindStatus = "operational" | "construction" | "approved" | "rejected";

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
  windStatus?: WindStatus;
  turbineCount?: number | null;
  fallHeight?: number | null;
  yearBuilt?: number | null;
  river?: string | null;
}

interface WindTurbine {
  id: number;
  lat: number;
  lon: number;
  plantName: string | null;
}

export async function GET() {
  try {
    // Fetch wind (4 layers), hydro, and turbines in parallel
    const [windRes, windConstructionRes, windApprovedRes, windRejectedRes, hydroRes, turbineRes] = await Promise.all([
      fetch(`${NVE_BASE}/Vindkraft2/MapServer/0/${QUERY}`, {
        headers: { "User-Agent": "MapGram/1.0 github.com/FemtiGram/kart" },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${NVE_BASE}/Vindkraft2/MapServer/1/${QUERY}`, {
        headers: { "User-Agent": "MapGram/1.0 github.com/FemtiGram/kart" },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${NVE_BASE}/Vindkraft2/MapServer/2/${QUERY}`, {
        headers: { "User-Agent": "MapGram/1.0 github.com/FemtiGram/kart" },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${NVE_BASE}/Vindkraft2/MapServer/8/${QUERY}`, {
        headers: { "User-Agent": "MapGram/1.0 github.com/FemtiGram/kart" },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${NVE_BASE}/Vannkraft1/MapServer/0/${QUERY}`, {
        headers: { "User-Agent": "MapGram/1.0 github.com/FemtiGram/kart" },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${NVE_BASE}/Vindkraft2/MapServer/4/${QUERY}`, {
        headers: { "User-Agent": "MapGram/1.0 github.com/FemtiGram/kart" },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      }),
    ]);

    const plants: EnergyPlant[] = [];
    const turbines: WindTurbine[] = [];

    // Helper to process wind features from any layer
    function processWindLayer(data: { features?: Array<{ geometry?: { x: number; y: number }; attributes: Record<string, unknown> }> }, status: WindStatus) {
      for (const f of data.features ?? []) {
        if (!f.geometry?.x || !f.geometry?.y) continue;
        const a = f.attributes;
        const { lat, lon } = utmToLatLon(f.geometry.x, f.geometry.y);
        plants.push({
          id: a.OBJECTID as number,
          name: (a.anleggNavn as string) ?? "Ukjent vindkraftverk",
          owner: (a.eier as string) ?? null,
          municipality: (a.kommune as string) ?? null,
          county: (a.fylkeNavn as string) ?? null,
          lat,
          lon,
          capacityMW: (a.effekt_MW_idrift as number) ?? (a.effekt_MW as number) ?? null,
          productionGWh: (a.forventetProduksjon_Gwh as number) ?? null,
          type: "vind",
          windStatus: status,
          turbineCount: (a.antallTurbiner as number) ?? null,
        });
      }
    }

    // Process wind farm layers
    if (windRes.ok) processWindLayer(await windRes.json(), "operational");
    if (windConstructionRes.ok) processWindLayer(await windConstructionRes.json(), "construction");
    if (windApprovedRes.ok) processWindLayer(await windApprovedRes.json(), "approved");
    if (windRejectedRes.ok) processWindLayer(await windRejectedRes.json(), "rejected");

    // Process individual turbines
    if (turbineRes.ok) {
      const turbineData = await turbineRes.json();
      for (const f of turbineData.features ?? []) {
        if (!f.geometry?.x || !f.geometry?.y) continue;
        const a = f.attributes;
        const { lat, lon } = utmToLatLon(f.geometry.x, f.geometry.y);
        turbines.push({
          id: a.OBJECTID as number,
          lat,
          lon,
          plantName: (a.anleggNavn as string) ?? null,
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
          id: 100000 + ((a.OBJECTID as number) ?? (a.vannkraftverkNr as number)),
          name: (a.vannkraftverkNavn as string) ?? "Ukjent vannkraftverk",
          owner: (a.vannkraftverkEier as string) ?? null,
          municipality: (a.kommuneNavn as string) ?? null,
          county: (a.fylke as string) ?? null,
          lat,
          lon,
          capacityMW: (a.maksYtelse_MW as number) ?? null,
          productionGWh: null, // not in hydro data
          type: "vann",
          fallHeight: (a.bruttoFallhoyde_m as number) ?? null,
          yearBuilt: (a.idriftsattAar as number) ?? null,
          river: (a.elvenavnHierarki as string) ?? null,
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
      turbines,
      stats: { windCount, hydroCount, totalCapacityMW: Math.round(totalCapacityMW) },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
