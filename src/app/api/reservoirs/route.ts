import { utmToLatLon } from "@/lib/utm";

const NVE_BASE = "https://nve.geodataonline.no/arcgis/rest/services";

interface ReservoirFeature {
  id: number;
  name: string;
  plantName: string | null;
  river: string | null;
  hrv: number | null; // Highest regulated water level (m.o.h.)
  lrv: number | null; // Lowest regulated water level (m.o.h.)
  volumeMm3: number | null;
  areaKm2: number | null;
  yearBuilt: number | null;
  purpose: string | null;
  polygon: [number, number][][]; // rings of [lat, lon]
  center: { lat: number; lon: number };
}

export async function GET() {
  try {
    // Fetch all reservoirs — paginate since there may be many
    const allFeatures: ReservoirFeature[] = [];
    let offset = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const url = `${NVE_BASE}/Vannkraft1/MapServer/6/query?where=status%3D'D'&outFields=OBJECTID,magasinNavn,vannkraftverkNavn,elvenavnHierarki,hoyesteRegulerteVannstand_moh,lavesteRegulerteVannstand_moh,volumOppdemt_Mm3,magasinArealHRV_km2,idriftsattAar,magasinFormal_Liste&returnGeometry=true&f=json&resultRecordCount=${pageSize}&resultOffset=${offset}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "MapGram/1.0 github.com/FemtiGram/kart" },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(9000),
      });

      if (!res.ok) break;
      const data = await res.json();
      const features = data.features ?? [];

      for (const f of features) {
        const a = f.attributes;
        const rings = f.geometry?.rings;
        if (!rings?.length) continue;

        // Convert UTM polygon rings to WGS84
        const wgsRings: [number, number][][] = rings.map(
          (ring: number[][]) =>
            ring.map((coord: number[]) => {
              const { lat, lon } = utmToLatLon(coord[0], coord[1]);
              return [lat, lon] as [number, number];
            })
        );

        // Compute center from first ring's centroid
        const firstRing = wgsRings[0];
        const centerLat = firstRing.reduce((s, c) => s + c[0], 0) / firstRing.length;
        const centerLon = firstRing.reduce((s, c) => s + c[1], 0) / firstRing.length;

        allFeatures.push({
          id: a.OBJECTID,
          name: a.magasinNavn ?? "Ukjent magasin",
          plantName: a.vannkraftverkNavn ?? null,
          river: a.elvenavnHierarki ?? null,
          hrv: a.hoyesteRegulerteVannstand_moh ?? null,
          lrv: a.lavesteRegulerteVannstand_moh ?? null,
          volumeMm3: a.volumOppdemt_Mm3 ?? null,
          areaKm2: a.magasinArealHRV_km2 ?? null,
          yearBuilt: a.idriftsattAar ?? null,
          purpose: a.magasinFormal_Liste ?? null,
          polygon: wgsRings,
          center: { lat: centerLat, lon: centerLon },
        });
      }

      hasMore = !!data.exceededTransferLimit && features.length === pageSize;
      offset += pageSize;

      // Safety limit
      if (offset > 5000) break;
    }

    return Response.json({
      reservoirs: allFeatures,
      count: allFeatures.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
