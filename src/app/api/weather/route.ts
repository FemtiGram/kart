import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const lat = parseFloat(request.nextUrl.searchParams.get("lat") ?? "");
  const lon = parseFloat(request.nextUrl.searchParams.get("lon") ?? "");
  const altitude = parseFloat(request.nextUrl.searchParams.get("altitude") ?? "");

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Response.json({ error: "lat and lon required" }, { status: 400 });
  }

  // MET asks for at most 4 decimals; rounding also makes nearby clicks share
  // a cache entry. `altitude` (whole metres) lets MET correct the temperature
  // for the real terrain height instead of its smoothed model terrain, which
  // can be hundreds of metres off in steep terrain.
  const params = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4) });
  if (Number.isFinite(altitude) && altitude > -500 && altitude < 9000) {
    params.set("altitude", String(Math.round(altitude)));
  }

  const res = await fetch(
    `https://api.met.no/weatherapi/locationforecast/2.0/compact?${params}`,
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
