const HYDAPI_BASE = "https://hydapi.nve.no/api/v1";

interface StationMeta {
  stationId: string;
  stationName: string;
  latitude: number;
  longitude: number;
  riverName: string | null;
}

// Cache stations list in memory (refreshes on cold start)
let stationsCache: StationMeta[] | null = null;
let stationsCacheTime = 0;
const STATIONS_TTL = 24 * 60 * 60 * 1000; // 24h

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getHeaders(): Promise<Record<string, string>> {
  const key = process.env.NVE_API_KEY;
  if (!key) throw new Error("NVE_API_KEY not configured");
  return { accept: "application/json", "X-API-Key": key };
}

async function loadStations(): Promise<StationMeta[]> {
  if (stationsCache && Date.now() - stationsCacheTime < STATIONS_TTL) {
    return stationsCache;
  }

  const headers = await getHeaders();
  const res = await fetch(`${HYDAPI_BASE}/Stations?Active=OnlyActive`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Stations API: ${res.status}`);
  const json = await res.json();

  stationsCache = (json.data ?? [])
    .filter((s: Record<string, unknown>) => s.latitude && s.longitude)
    .map((s: Record<string, unknown>) => ({
      stationId: s.stationId as string,
      stationName: s.stationName as string,
      latitude: s.latitude as number,
      longitude: s.longitude as number,
      riverName: (s.riverName as string) ?? null,
    }));
  stationsCacheTime = Date.now();
  return stationsCache!;
}

function findNearestN(
  stations: StationMeta[],
  lat: number,
  lon: number,
  maxDistKm = 30,
  n = 5
): StationMeta[] {
  return stations
    .map((s) => ({ ...s, dist: haversine(lat, lon, s.latitude, s.longitude) }))
    .filter((s) => s.dist <= maxDistKm)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, n);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");

  if (isNaN(lat) || isNaN(lon)) {
    return Response.json({ error: "lat and lon required" }, { status: 400 });
  }

  try {
    const headers = await getHeaders();
    const stations = await loadStations();
    const candidates = findNearestN(stations, lat, lon);

    if (candidates.length === 0) {
      return Response.json({ station: null, message: "No station within 30 km" });
    }

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const refTime = `${yesterday.toISOString().split("T")[0]}/${now.toISOString().split("T")[0]}`;
    const dayOfYear = Math.floor(
      (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000
    );

    // Try each candidate station until we find one with actual observation data
    for (const candidate of candidates) {
      const [dischargeRes, waterLevelRes] = await Promise.allSettled([
        fetch(
          `${HYDAPI_BASE}/Observations?StationId=${candidate.stationId}&Parameter=1001&ResolutionTime=0&ReferenceTime=${refTime}`,
          { headers, signal: AbortSignal.timeout(6000) }
        ),
        fetch(
          `${HYDAPI_BASE}/Observations?StationId=${candidate.stationId}&Parameter=1000&ResolutionTime=0&ReferenceTime=${refTime}`,
          { headers, signal: AbortSignal.timeout(6000) }
        ),
      ]);

      // Extract latest discharge
      let discharge: number | null = null;
      let dischargeTime: string | null = null;
      if (dischargeRes.status === "fulfilled" && dischargeRes.value.ok) {
        const d = await dischargeRes.value.json();
        const observations = d.data?.[0]?.observations;
        if (observations?.length) {
          const latest = observations[observations.length - 1];
          discharge = latest.value;
          dischargeTime = latest.time;
        }
      }

      // Extract latest water level
      let waterLevel: number | null = null;
      if (waterLevelRes.status === "fulfilled" && waterLevelRes.value.ok) {
        const d = await waterLevelRes.value.json();
        const observations = d.data?.[0]?.observations;
        if (observations?.length) {
          waterLevel = observations[observations.length - 1].value;
        }
      }

      // Skip this station if it has no data at all
      if (discharge == null && waterLevel == null) continue;

      // Found a station with data — now fetch percentiles for context
      let percentileContext: {
        p25: number | null;
        p50: number | null;
        p75: number | null;
        p90: number | null;
        min: number | null;
        max: number | null;
      } | null = null;

      if (discharge != null) {
        try {
          const percentileRes = await fetch(
            `${HYDAPI_BASE}/Percentiles/${candidate.stationId}/1001`,
            { headers, signal: AbortSignal.timeout(6000) }
          );
          if (percentileRes.ok) {
            const d = await percentileRes.json();
            const percentiles = d.data?.[0]?.percentiles;
            if (percentiles?.length) {
              const today = percentiles.find(
                (p: { dayOfYear: number }) => p.dayOfYear === dayOfYear
              ) ?? percentiles[Math.min(dayOfYear - 1, percentiles.length - 1)];
              if (today) {
                percentileContext = {
                  p25: today.percentile25 ?? null,
                  p50: today.median ?? today.percentile50 ?? null,
                  p75: today.percentile75 ?? null,
                  p90: today.percentile90 ?? null,
                  min: today.minimum ?? null,
                  max: today.maximum ?? null,
                };
              }
            }
          }
        } catch { /* percentile is optional */ }
      }

      const distKm = haversine(lat, lon, candidate.latitude, candidate.longitude);

      return Response.json({
        station: {
          id: candidate.stationId,
          name: candidate.stationName,
          river: candidate.riverName,
          lat: candidate.latitude,
          lon: candidate.longitude,
          distanceKm: Math.round(distKm * 10) / 10,
        },
        discharge,
        dischargeTime,
        waterLevel,
        percentile: percentileContext,
      });
    }

    // None of the nearby stations had data
    return Response.json({
      station: {
        id: candidates[0].stationId,
        name: candidates[0].stationName,
        river: candidates[0].riverName,
        lat: candidates[0].latitude,
        lon: candidates[0].longitude,
        distanceKm: Math.round(haversine(lat, lon, candidates[0].latitude, candidates[0].longitude) * 10) / 10,
      },
      discharge: null,
      dischargeTime: null,
      waterLevel: null,
      percentile: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
