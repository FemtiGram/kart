# MapGram

An interactive web application exploring what's possible with Norway's open geodata. Built on top of Kartverket, Geonorge, SSB, MET, and Nobil APIs — all free, all open.

**Live:** Deployed on Vercel, auto-deploys on push to master.

---

## Features

### Høydekart (`/map`)
- Search any Norwegian address with autocomplete
- Click anywhere on the map to explore
- Smart location resolving: clicks near a building show the address, near a road show the street name, further out show the place name (mountains, lakes, peaks)
- Browser geolocation with persisted preference across pages
- Elevation in meters above sea level
- Current weather conditions (temperature, wind, precipitation)
- Links to yr.no forecast and Google Maps directions
- Toggle between Kartverket topo map and OpenTopoMap terrain view
- API health check banner if external services are unavailable

### Inntektskart (`/lonn`)
- Choropleth map showing median after-tax household income per municipality (2024)
- Search any address or municipality to highlight it
- Info card with income, national rank, % vs. median, and progress bar
- Collapsible card on mobile
- Optional grayscale base layer (Kartverket topograatone) for geographic context
- Data from SSB, cached server-side for 24 hours

### Verneområder (`/vern`)
- Choropleth map showing protected nature areas per municipality
- Breakdown by category: nasjonalpark, naturreservat, landskapsvernområde, andre
- Info card with total area, rank, % vs. median, and progress bar
- Optional grayscale base layer
- Data from SSB table 08936 (2024)

### Ladestasjoner (`/lading`)
- All EV charging stations in Norway on a map
- Click a station to see connector types, capacity, and operator
- Data from Nobil API via ENOVA

---

## APIs Used

All APIs are free and require no authentication.

| API | Provider | Used for |
|-----|----------|----------|
| [Adresser v1](https://ws.geonorge.no/adresser/v1/) | Geonorge | Address autocomplete and reverse geocoding |
| [Høydedata v1](https://ws.geonorge.no/hoydedata/v1/) | Geonorge | Elevation in meters above sea level |
| [Stedsnavn v1](https://ws.geonorge.no/stedsnavn/v1/) | Geonorge | Nearest place names (mountains, lakes, etc.) |
| [Kommuneinfo v1](https://ws.geonorge.no/kommuneinfo/v1/) | Geonorge | Reverse geocode coordinates to municipality |
| [Locationforecast 2.0](https://api.met.no/weatherapi/locationforecast/2.0/) | MET Norway / Yr | Current weather conditions |
| [InntektStruk13](https://data.ssb.no/api/v0/no/table/InntektStruk13) | SSB | Median household income per municipality |
| [Table 08936](https://data.ssb.no/api/pxwebapi/v2/tables/08936/) | SSB | Protected areas per municipality |
| [Kommuner GeoJSON](https://github.com/robhop/fylker-og-kommuner) | Kartverket / robhop | Municipality boundary polygons |
| [Nobil API](https://nobil.no/api) | ENOVA | EV charging station data |

Map tiles from [Kartverket](https://cache.kartverket.no) (topo, topograatone) and [OpenTopoMap](https://opentopomap.org) (terrain view).

---

## Tech Stack

- [Next.js 16](https://nextjs.org) — App Router, Turbopack
- [React 19](https://react.dev)
- [TypeScript](https://www.typescriptlang.org)
- [Tailwind CSS v4](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com) + [Base UI](https://base-ui.com) — component primitives
- [react-leaflet](https://react-leaflet.js.org) — interactive maps and choropleth
- [Lucide React](https://lucide.dev) — icons
- [Vercel](https://vercel.com) — hosting and deployment

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
│   │   ├── weather/          # Proxy for MET Norway API (30 min cache)
│   │   ├── income/           # Proxy for SSB income data (24h cache)
│   │   ├── kommuner/         # Proxy for municipality GeoJSON (30 day cache)
│   │   ├── protected-areas/  # Proxy for SSB protected areas data (24h cache)
│   │   └── charging/         # Proxy for Nobil charging station data
│   ├── map/                  # Elevation & weather map page
│   ├── lonn/                 # Municipality income choropleth page
│   ├── vern/                 # Protected areas choropleth page
│   ├── lading/               # EV charging station map page
│   └── page.tsx              # Landing page
└── components/
    ├── elevation-map.tsx              # Elevation map component
    ├── income-map.tsx                 # Income choropleth component
    ├── protected-areas-map.tsx        # Protected areas choropleth component
    ├── charging-map.tsx               # Charging station map component
    ├── *-map-loader.tsx               # Dynamic import wrappers (ssr: false)
    ├── navbar.tsx                     # Navigation with Sheet for mobile
    ├── footer.tsx
    └── ui/                            # shadcn/ui components
```
