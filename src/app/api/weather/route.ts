import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const lat = request.nextUrl.searchParams.get("lat");
  const lon = request.nextUrl.searchParams.get("lon");

  if (!lat || !lon) {
    return Response.json({ error: "lat and lon required" }, { status: 400 });
  }

  const res = await fetch(
    `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`,
    {
      headers: {
        "User-Agent": "KartverketExplorer/1.0 github.com/FemtiGram/kart",
      },
      next: { revalidate: 1800 }, // cache 30 min
    }
  );

  if (!res.ok) {
    return Response.json({ error: "Weather fetch failed" }, { status: res.status });
  }

  const data = await res.json();
  const current = data.properties.timeseries[0];
  const details = current.data.instant.details;
  const next = current.data.next_1_hours ?? current.data.next_6_hours;

  return Response.json({
    temperature: details.air_temperature,
    windSpeed: details.wind_speed,
    precipitation: next?.details.precipitation_amount ?? 0,
    symbolCode: next?.summary.symbol_code ?? "cloudy",
  });
}
