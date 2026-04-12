import { NextRequest } from "next/server";

/**
 * Proxy for Geonorge adresser API.
 *
 * Free-text search:
 *   GET /api/sok?q=oslo&n=6
 *
 * Reverse geocode (punktsok):
 *   GET /api/sok?lat=59.91&lon=10.75&radius=50&n=1
 *
 * Cached at the edge for 1h, stale-while-revalidate 24h. Popular queries
 * ("oslo", "bergen", ...) are served from Vercel's CDN in ~20ms instead of
 * hitting Geonorge's fuzzy-match path (which has wide tail latency).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = params.get("q");
  const lat = params.get("lat");
  const lon = params.get("lon");
  const n = Math.min(Math.max(parseInt(params.get("n") || "6", 10) || 6, 1), 20);

  let upstream: string;
  if (lat && lon) {
    const radius = Math.min(Math.max(parseInt(params.get("radius") || "50", 10) || 50, 1), 5000);
    upstream = `https://ws.geonorge.no/adresser/v1/punktsok?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&radius=${radius}&utkoordsys=4326&treffPerSide=${n}`;
  } else if (q && q.length >= 2 && q.length <= 200) {
    upstream = `https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(q)}&treffPerSide=${n}&utkoordsys=4326`;
  } else {
    return Response.json({ error: "Missing q or lat/lon" }, { status: 400 });
  }

  const res = await fetch(upstream, { next: { revalidate: 3600 } });
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
