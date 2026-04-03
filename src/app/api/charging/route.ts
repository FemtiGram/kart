export async function GET() {
  // Fetch ALL charging stations in Norway in a single query
  // Bounding box covers mainland Norway + Svalbard
  const query = `
    [out:json][timeout:30];
    node["amenity"="charging_station"](57.5,4.0,71.5,31.5);
    out body;
  `;

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(45000),
    next: { revalidate: 86400 }, // 24h cache — stations rarely change
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
