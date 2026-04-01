import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const lat = parseFloat(request.nextUrl.searchParams.get("lat") ?? "59.91");
  const lon = parseFloat(request.nextUrl.searchParams.get("lon") ?? "10.75");

  // ~50km bounding box
  const dlat = 0.45;
  const dlon = 0.45 / Math.cos((lat * Math.PI) / 180);
  const bbox = `${lat - dlat},${lon - dlon},${lat + dlat},${lon + dlon}`;

  const query = `
    [out:json][timeout:30];
    node["amenity"="charging_station"](${bbox});
    out body;
  `;

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    next: { revalidate: 21600 }, // 6h cache
  });

  if (!res.ok) {
    return Response.json({ error: "Overpass fetch failed" }, { status: res.status });
  }

  const data = await res.json();

  const stations = (data.elements as Array<{
    id: number;
    lat: number;
    lon: number;
    tags: Record<string, string>;
  }>).map((el) => {
    const t = el.tags;
    const connectors = ["type2", "chademo", "type2_combo", "type1", "schuko", "type3c"]
      .filter((s) => t[`socket:${s}`] && t[`socket:${s}`] !== "no")
      .map((s) => s.replace("type2_combo", "CCS").replace("type2", "Type 2").replace("chademo", "CHAdeMO").replace("type1", "Type 1").replace("schuko", "Schuko").replace("type3c", "Type 3C"));

    const address = [t["addr:street"], t["addr:housenumber"], t["addr:city"]]
      .filter(Boolean)
      .join(" ");

    return {
      id: el.id,
      lat: el.lat,
      lon: el.lon,
      name: t.name ?? t.operator ?? "Ladestasjon",
      operator: t.operator ?? null,
      capacity: t.capacity ? parseInt(t.capacity) : null,
      connectors,
      address: address || null,
    };
  });

  return Response.json(stations);
}
