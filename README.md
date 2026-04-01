# Kartverket Explorer

An interactive web application built on top of Kartverket's, Geonorge's, and SSB's open public APIs. Search for any Norwegian address or click anywhere on the map to get elevation data, current weather, and directions. Explore income statistics across all Norwegian municipalities — all powered by free, open data.

---

## Features

### Høydekart (`/map`)
- Search any Norwegian address with autocomplete
- Click anywhere on the map to explore
- Smart location resolving: clicks near a building show the address, near a road show the street name, further out show the place name (mountains, lakes, peaks)
- Use your current location via the browser's geolocation API
- Displays elevation in meters above sea level
- Current weather conditions (temperature, wind, precipitation)
- Links to yr.no weather forecast and Google Maps directions
- Toggle between street map and terrain view
- API health check banner if external services are unavailable

### Inntektskart (`/lonn`)
- Choropleth map of Norway showing median after-tax household income per municipality (2024)
- Search any address to find and highlight its municipality
- Click or hover any municipality to see its data
- Card shows: income, national rank, % vs. national median, and position on the full scale
- Data sourced from SSB (Statistics Norway), cached server-side for 24 hours
- Municipality boundaries from Kartverket via GeoNorge, cached for 30 days

---

## APIs Used

All APIs are free and require no authentication.

| API | Provider | Used for |
|-----|----------|----------|
| [Adresser v1](https://ws.geonorge.no/adresser/v1/) | Geonorge | Address autocomplete and reverse geocoding |
| [Høydedata v1](https://ws.geonorge.no/hoydedata/v1/) | Geonorge | Elevation in meters above sea level |
| [Stedsnavn v1](https://ws.geonorge.no/stedsnavn/v1/) | Geonorge | Nearest place names (mountains, lakes, etc.) |
| [Locationforecast 2.0](https://api.met.no/weatherapi/locationforecast/2.0/) | MET Norway / Yr | Current weather conditions |
| [InntektStruk13](https://data.ssb.no/api/v0/no/table/InntektStruk13) | SSB | Median household income per municipality |
| [Kommuner GeoJSON](https://github.com/robhop/fylker-og-kommuner) | Kartverket / robhop | Municipality boundary polygons |

Map tiles provided by [OpenStreetMap](https://www.openstreetmap.org) and [OpenTopoMap](https://opentopomap.org).

---

## Tech Stack

- [Next.js 16](https://nextjs.org) — App Router, Turbopack
- [React 19](https://react.dev)
- [TypeScript](https://www.typescriptlang.org)
- [Tailwind CSS v4](https://tailwindcss.com)
- [Base UI](https://base-ui.com) — headless component primitives
- [react-leaflet](https://react-leaflet.js.org) — interactive maps and choropleth
- [Lucide React](https://lucide.dev) — icons

---

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Dev Mode

To enable the API call log panel on `/map`, create a `.env.local` file:

```env
NEXT_PUBLIC_DEV=true
```

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── weather/      # Server-side proxy for MET Norway API (30 min cache)
│   │   ├── income/       # Server-side proxy for SSB income data (24h cache)
│   │   └── kommuner/     # Server-side proxy for municipality GeoJSON (30 day cache)
│   ├── map/              # Elevation & weather map page
│   ├── lonn/             # Municipality income choropleth page
│   └── page.tsx          # Homepage
└── components/
    ├── elevation-map.tsx          # Main elevation map component
    ├── elevation-map-loader.tsx   # Dynamic import wrapper (ssr: false)
    ├── income-map.tsx             # Municipality income choropleth component
    ├── income-map-loader.tsx      # Dynamic import wrapper (ssr: false)
    ├── navbar.tsx
    ├── footer.tsx
    └── ui/                        # Base UI / shadcn components
```
