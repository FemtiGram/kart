# Kartverket Explorer

An interactive web application built on top of Kartverket's and Geonorge's open public APIs. Search for any Norwegian address or click anywhere on the map to get elevation data, current weather, and directions — all powered by free, open geodata.

---

## Features

### Høydekart (`/map`)
- Search any Norwegian address with autocomplete
- Click anywhere on the map to explore
- Use your current location via the browser's geolocation API
- Displays elevation in meters above sea level
- Current weather conditions (temperature, wind, precipitation)
- Resolves the nearest place name (mountains, lakes, peaks) or road address for map clicks
- Links to yr.no weather forecast and Google Maps directions
- Toggle between street map and terrain view (hypsometric elevation colours)

---

## APIs Used

All APIs are free and require no authentication.

| API | Provider | Used for |
|-----|----------|----------|
| [Adresser v1](https://ws.geonorge.no/adresser/v1/) | Geonorge | Address autocomplete and reverse geocoding |
| [Høydedata v1](https://ws.geonorge.no/hoydedata/v1/) | Geonorge | Elevation in meters above sea level |
| [Stedsnavn v1](https://ws.geonorge.no/stedsnavn/v1/) | Geonorge | Nearest place names (mountains, lakes, etc.) |
| [Locationforecast 2.0](https://api.met.no/weatherapi/locationforecast/2.0/) | MET Norway / Yr | Current weather conditions |

Map tiles provided by [OpenStreetMap](https://www.openstreetmap.org) and [OpenTopoMap](https://opentopomap.org).

---

## Tech Stack

- [Next.js 16](https://nextjs.org) — App Router, Turbopack
- [React 19](https://react.dev)
- [TypeScript](https://www.typescriptlang.org)
- [Tailwind CSS v4](https://tailwindcss.com)
- [Base UI](https://base-ui.com) — headless component primitives
- [react-leaflet](https://react-leaflet.js.org) — interactive map
- [Lucide React](https://lucide.dev) — icons

---

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Dev Mode

To enable the API call log panel, create a `.env.local` file:

```env
NEXT_PUBLIC_DEV=true
```

---

## Project Structure

```
src/
├── app/
│   ├── api/weather/          # Server-side proxy for MET Norway API
│   ├── map/                  # Elevation & weather map page
│   └── page.tsx              # Homepage / project list
└── components/
    ├── elevation-map.tsx          # Main map component
    ├── elevation-map-loader.tsx   # Dynamic import wrapper (ssr: false)
    ├── navbar.tsx
    ├── footer.tsx
    └── ui/                   # Base UI / shadcn components
```
