import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const lat = parseFloat(request.nextUrl.searchParams.get("lat") ?? "61.5");
  const lon = parseFloat(request.nextUrl.searchParams.get("lon") ?? "8.0");

  // ~50km bounding box
  const dlat = 0.45;
  const dlon = 0.45 / Math.cos((lat * Math.PI) / 180);
  const bbox = `${lat - dlat},${lon - dlon},${lat + dlat},${lon + dlon}`;

  const query = `
    [out:json][timeout:10];
    (
      node["tourism"="alpine_hut"](${bbox});
      node["tourism"="wilderness_hut"](${bbox});
      way["tourism"="alpine_hut"](${bbox});
      way["tourism"="wilderness_hut"](${bbox});
    );
    out center body;
  `;

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(12000),
    next: { revalidate: 86400 }, // 24h cache — cabin data rarely changes
  });

  if (!res.ok) {
    return Response.json({ error: "Overpass fetch failed" }, { status: res.status });
  }

  const data = await res.json();

  const cabins = (data.elements as Array<{
    id: number;
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags: Record<string, string>;
  }>).map((el) => {
    const t = el.tags;
    const lat = el.lat ?? el.center?.lat ?? 0;
    const lon = el.lon ?? el.center?.lon ?? 0;

    const isDNT = /turistforening|dnt/i.test(t.operator ?? "");
    const tourism = t.tourism;

    let cabinType: "betjent" | "selvbetjent" | "ubetjent" | "privat" = "privat";
    if (isDNT) {
      if (tourism === "alpine_hut") cabinType = "betjent";
      if (tourism === "wilderness_hut") cabinType = "ubetjent";
      // Check for self-service tag
      if (t["reservation"] === "required" || t["self_service"] === "yes" || /selvbetjent/i.test(t.description ?? "")) {
        cabinType = "selvbetjent";
      }
    } else {
      cabinType = tourism === "alpine_hut" ? "betjent" : "ubetjent";
    }

    return {
      id: el.id,
      lat,
      lon,
      name: t.name ?? "Ukjent hytte",
      operator: t.operator ?? null,
      cabinType,
      isDNT,
      elevation: t.ele ? parseInt(t.ele) : null,
      beds: t.beds ? parseInt(t.beds) : null,
      website: t.website ?? t["contact:website"] ?? null,
      description: t.description ?? null,
    };
  }).filter((c) => c.lat !== 0 && c.lon !== 0);

  return Response.json(cabins);
}
