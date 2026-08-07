import { NextRequest } from "next/server";

/**
 * Proxy for Kartverket's åpne eiendoms-API (Matrikkelen).
 *
 * Parcel polygons at a point:
 *   GET /api/eiendom?lat=59.927&lon=10.741
 *
 * Returns the upstream GeoJSON FeatureCollection unchanged: one feature
 * per teig near the point, each with matrikkelnummer, kommunenummer and
 * a Polygon in ETRS89 (lat/lon). Owner data is NOT in the open API.
 *
 * Boundaries change rarely, so responses are edge-cached like /api/sok.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lat = parseFloat(params.get("lat") ?? "");
  const lon = parseFloat(params.get("lon") ?? "");

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Response.json({ error: "Missing lat/lon" }, { status: 400 });
  }
  // Rough Norway bounds — the upstream has no data outside anyway
  if (lat < 57 || lat > 81.5 || lon < 4 || lon > 32) {
    return Response.json({ error: "Utenfor Norge" }, { status: 400 });
  }

  const upstream =
    `https://ws.geonorge.no/eiendom/v1/punkt/omrader` +
    `?nord=${lat.toFixed(6)}&ost=${lon.toFixed(6)}&koordsys=4258&utkoordsys=4258&radius=1&maksTreff=10`;

  const res = await fetch(upstream, {
    headers: { "User-Agent": "Datakart/1.0 github.com/FemtiGram/kart" },
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    return Response.json({ error: "Upstream error" }, { status: res.status });
  }

  const data = await res.json();
  return Response.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
