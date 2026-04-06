import { utmToLatLon } from "@/lib/utm";

const NVE_BASE = "https://nve.geodataonline.no/arcgis/rest/services";
const SODIR_BASE = "https://factmaps.sodir.no/api/rest/services/Factmaps/FactMapsWGS84/MapServer";
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

interface OilGasFacility {
  id: number;
  name: string;
  kind: string;
  phase: string;
  functions: string | null;
  operator: string | null;
  fieldName: string | null;
  waterDepth: number | null;
  yearStartup: number | null;
  isSurface: boolean;
  factPageUrl: string | null;
  lat: number;
  lon: number;
}

interface Pipeline {
  id: number;
  name: string;
  medium: string | null;
  phase: string | null;
  dimension: number | null;
  fromFacility: string | null;
  toFacility: string | null;
  belongsTo: string | null;
  path: [number, number][];
}

interface HavvindZone {
  id: number;
  name: string;
  typeAnlegg: string;
  arealKm2: number | null;
  minDistanceKm: number | null;
  nveUrl: string | null;
  center: { lat: number; lon: number };
  polygon: [number, number][][];
}

export async function GET() {
  try {
    // Fetch wind (4 layers), hydro, and turbines in parallel
    const [windRes, windConstructionRes, windApprovedRes, windRejectedRes, hydroRes, turbineRes, havvindRes, sodirRes, pipelineRes] = await Promise.all([
      fetch(`${NVE_BASE}/Vindkraft2/MapServer/0/${QUERY}`, {
        headers: { "User-Agent": "Datakart/1.0 github.com/FemtiGram/kart" },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${NVE_BASE}/Vindkraft2/MapServer/1/${QUERY}`, {
        headers: { "User-Agent": "Datakart/1.0 github.com/FemtiGram/kart" },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${NVE_BASE}/Vindkraft2/MapServer/2/${QUERY}`, {
        headers: { "User-Agent": "Datakart/1.0 github.com/FemtiGram/kart" },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${NVE_BASE}/Vindkraft2/MapServer/8/${QUERY}`, {
        headers: { "User-Agent": "Datakart/1.0 github.com/FemtiGram/kart" },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${NVE_BASE}/Vannkraft1/MapServer/0/${QUERY}`, {
        headers: { "User-Agent": "Datakart/1.0 github.com/FemtiGram/kart" },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${NVE_BASE}/Vindkraft2/MapServer/4/${QUERY}`, {
        headers: { "User-Agent": "Datakart/1.0 github.com/FemtiGram/kart" },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${NVE_BASE}/Havvind2023/MapServer/0/${QUERY}`, {
        headers: { "User-Agent": "Datakart/1.0 github.com/FemtiGram/kart" },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${SODIR_BASE}/307/${QUERY}`, {
        headers: { "User-Agent": "Datakart/1.0 github.com/FemtiGram/kart" },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${SODIR_BASE}/311/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=json&resultRecordCount=500`, {
        headers: { "User-Agent": "Datakart/1.0 github.com/FemtiGram/kart" },
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

    // Process offshore wind zones (polygons)
    const havvindZones: HavvindZone[] = [];
    if (havvindRes.ok) {
      const havvindData = await havvindRes.json();
      for (const f of havvindData.features ?? []) {
        const a = f.attributes;
        const rings = f.geometry?.rings;
        if (!rings?.length) continue;

        // Convert UTM polygon rings to WGS84 with aggressive simplification (large ocean zones)
        const wgsRings: [number, number][][] = rings.map((ring: number[][]) => {
          const step = ring.length > 200 ? 10 : ring.length > 100 ? 5 : ring.length > 50 ? 3 : 1;
          const simplified: [number, number][] = [];
          for (let i = 0; i < ring.length; i += step) {
            const { lat, lon } = utmToLatLon(ring[i][0], ring[i][1]);
            simplified.push([lat, lon]);
          }
          if (simplified.length > 0) {
            const last = ring[ring.length - 1];
            const { lat, lon } = utmToLatLon(last[0], last[1]);
            simplified.push([lat, lon]);
          }
          return simplified;
        });

        const firstRing = wgsRings[0];
        const centerLat = firstRing.reduce((s, c) => s + c[0], 0) / firstRing.length;
        const centerLon = firstRing.reduce((s, c) => s + c[1], 0) / firstRing.length;

        havvindZones.push({
          id: a.OBJECTID,
          name: a.navn ?? "Ukjent havvindområde",
          typeAnlegg: a.typeAnlegg ?? "Ukjent",
          arealKm2: a.areal_km2 ?? null,
          minDistanceKm: a.minAvstandFastland_km ?? null,
          nveUrl: a.nettsideURL ?? null,
          center: { lat: centerLat, lon: centerLon },
          polygon: wgsRings,
        });
      }
    }

    // Process oil & gas facilities from Sodir
    const oilGasFacilities: OilGasFacility[] = [];
    if (sodirRes.ok) {
      const sodirData = await sodirRes.json();
      for (const f of sodirData.features ?? []) {
        const a = f.attributes;
        // Only Norwegian facilities
        if (a.fclNationCode2 !== "NO") continue;
        // Convert DMS to decimal degrees
        const lat = (a.fclNsDeg ?? 0) + (a.fclNsMin ?? 0) / 60 + (a.fclNsSec ?? 0) / 3600;
        const lon = (a.fclEwDeg ?? 0) + (a.fclEwMin ?? 0) / 60 + (a.fclEwSec ?? 0) / 3600;
        if (lat === 0 || lon === 0) continue;
        // Negate longitude if west
        const lonSigned = a.fclEwCode === "W" ? -lon : lon;

        oilGasFacilities.push({
          id: a.OBJECTID,
          name: a.fclName ?? "Ukjent anlegg",
          kind: a.fclKind ?? "Ukjent",
          phase: a.fclPhase ?? "UNKNOWN",
          functions: a.fclFunctions ?? null,
          operator: a.fclCurrentOperatorName ?? null,
          fieldName: a.fclBelongsToName ?? null,
          waterDepth: a.fclWaterDepth ?? null,
          yearStartup: a.fclStartupDate ? new Date(a.fclStartupDate).getFullYear() : null,
          isSurface: a.fclSurface === "Y",
          factPageUrl: a.fclFactPageUrl ?? null,
          lat,
          lon: lonSigned,
        });
      }
    }

    // Process pipelines
    const pipelines: Pipeline[] = [];
    if (pipelineRes.ok) {
      const pipelineData = await pipelineRes.json();
      for (const f of pipelineData.features ?? []) {
        const a = f.attributes;
        const paths = f.geometry?.paths;
        if (!paths?.length) continue;
        // Flatten all path segments into one array of [lat, lon]
        const coords: [number, number][] = [];
        for (const path of paths) {
          for (const pt of path) {
            coords.push([pt[1], pt[0]]); // ArcGIS returns [x=lon, y=lat] in WGS84
          }
        }
        if (coords.length < 2) continue;
        pipelines.push({
          id: a.OBJECTID,
          name: a.pplName ?? "Ukjent rørledning",
          medium: a.pplMedium ?? null,
          phase: a.pplCurrentPhase ?? null,
          dimension: a.pplDimension ?? null,
          fromFacility: a.fclNameFrom ?? null,
          toFacility: a.fclNameTo ?? null,
          belongsTo: a.pplBelongsToName ?? null,
          path: coords,
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
      havvindZones,
      oilGasFacilities,
      pipelines,
      stats: { windCount, hydroCount, havvindCount: havvindZones.length, oilGasCount: oilGasFacilities.length, pipelineCount: pipelines.length, totalCapacityMW: Math.round(totalCapacityMW) },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
