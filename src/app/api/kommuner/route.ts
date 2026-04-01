export async function GET() {
  const res = await fetch(
    "https://raw.githubusercontent.com/robhop/fylker-og-kommuner/main/Kommuner-M.geojson",
    { next: { revalidate: 2592000 } } // 30-day cache
  );

  if (!res.ok) {
    return Response.json({ error: "GeoJSON fetch failed" }, { status: res.status });
  }

  const data = await res.json();
  return Response.json(data);
}
