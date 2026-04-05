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
    // Fetch operational reservoirs — only those with known volume (most significant ones)
    const url = `${NVE_BASE}/Vannkraft1/MapServer/6/query?where=status%3D'D'+AND+volumOppdemt_Mm3+IS+NOT+NULL&outFields=OBJECTID,magasinNavn,vannkraftverkNavn,elvenavnHierarki,hoyesteRegulerteVannstand_moh,lavesteRegulerteVannstand_moh,volumOppdemt_Mm3,magasinArealHRV_km2,idriftsattAar,magasinFormal_Liste&returnGeometry=true&f=json&resultRecordCount=500`;
    const res = await fetch(url, {
      headers: { "User-Agent": "MapGram/1.0 github.com/FemtiGram/kart" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(9000),
    });

    if (!res.ok) {
      return Response.json({ error: `NVE API: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const features = data.features ?? [];
    const allFeatures: ReservoirFeature[] = [];

    for (const f of features) {
      const a = f.attributes;
      const rings = f.geometry?.rings;
      if (!rings?.length) continue;

      // Convert UTM polygon rings to WGS84, simplify by skipping every other point for large rings
      const wgsRings: [number, number][][] = rings.map(
        (ring: number[][]) => {
          const step = ring.length > 100 ? 5 : ring.length > 50 ? 3 : ring.length > 20 ? 2 : 1;
          const simplified: [number, number][] = [];
          for (let i = 0; i < ring.length; i += step) {
            const { lat, lon } = utmToLatLon(ring[i][0], ring[i][1]);
            simplified.push([lat, lon]);
          }
          // Always include last point to close the ring
          if (simplified.length > 0) {
            const last = ring[ring.length - 1];
            const { lat, lon } = utmToLatLon(last[0], last[1]);
            simplified.push([lat, lon]);
          }
          return simplified;
        }
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

    return Response.json({
      reservoirs: allFeatures,
      count: allFeatures.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
