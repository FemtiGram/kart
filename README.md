# MapGram

Interactive maps built entirely on free, open Norwegian data. No API keys, no paid services — just public data from Kartverket, SSB, NVE, MET.no, and OpenStreetMap, visualized on maps that work on any device.

**What you can explore:**
- **Where to charge your EV** — every charging station in Norway, with connector types and capacity
- **Where to find a cabin** — mountain huts and DNT cabins with elevation, weather, and availability
- **Where the energy comes from** — wind farms and hydroelectric plants, including those under construction or rejected
- **How much people earn** — median household income per municipality, ranked and color-coded
- **What nature is protected** — national parks, nature reserves, and conservation areas by municipality
- **How high you are** — click anywhere for elevation data and live weather

All data updates automatically. The maps use clustering for smooth performance even with 15,000+ markers, and every info card expands into a detail sheet with source links.

**Live:** [maps.andersgram.no](https://maps.andersgram.no) · Auto-deploys on push to master.

---

## Maps

### Høydekart (`/map`)
- Click anywhere or search an address to see elevation (m.o.h.) and current weather
- Smart location resolving: buildings → streets → place names
- Weather from MET.no with yr.no link
- Defaults to OpenTopoMap terrain view, toggle to Kartverket topo
- Keyboard-navigable search dropdown

### Inntektskart (`/lonn`)
- Choropleth: median after-tax household income per municipality (2024)
- Red → Yellow → Green diverging scale
- Compact card + expandable sheet with rank, progress bar, % vs. median
- Data from SSB InntektStruk13

### Verneområder (`/vern`)
- Choropleth: protected nature areas per municipality (km²)
- Compact card + expandable sheet with category breakdown (nasjonalpark, naturreservat, etc.)
- Data from SSB table 08936

### Ladestasjoner (`/lading`)
- All ~15,000 EV charging stations in Norway
- Data pre-fetched at build time from OpenStreetMap (Overpass API)
- Marker clustering for smooth performance at all zoom levels
- Custom ⚡ markers that invert colors on gråtone map
- Compact card + expandable sheet with connector types, capacity, directions

### Turisthytter (`/hytter`)
- DNT cabins and mountain huts across Norway
- Data pre-fetched at build time from OpenStreetMap
- Marker clustering for smooth performance
- Color-coded by type: fjellhytte (red), ubetjent (green)
- Compact card + expandable sheet with elevation, beds, weather, DNT links

### Energikart (`/energi`)
- Wind power + hydroelectric plants on one map
- Data from NVE ArcGIS (Vindkraft2 + Vannkraft1), 1h server cache
- Marker clustering, blue for wind, cyan for hydro, sized by capacity (MW)
- Wind status filters: operational, under construction, approved, rejected
- Individual wind turbines visible at zoom 12+
- Compact card + expandable sheet per type (turbines + GWh for wind, fall height + river for hydro)
- Live river data for hydro plants: discharge (m³/s), water level, and percentile context from NVE HydAPI

### Vindkraft (`/vindkraft`)
- Standalone wind power map (also accessible independently)

---

## Design System

### Color Palette — "Cloud Dancer" (Pantone 2026)
Warm off-white base aligned with homepage primary `#24374c`.

| Token | Value | WCAG | Usage |
|-------|-------|------|-------|
| Primary | `#24374c` | AAA (12.2:1) | Selected states, navbar, logo, metric text |
| Green | `#15803d` | AA (5.0:1) | Charging icons, ubetjent markers |
| Background | warm off-white | — | Page background |
| Card | warm cream | — | Info cards, tile toggles |
| Border | warm beige | — | Card borders, dividers |
| Highlight | teal | AA | Available for interactive elements |

### Card Components
All maps use a **compact floating card + expandable bottom Sheet** pattern:
- **Compact card**: Identity + key metric + "Vis mer" / "Kjør hit" action buttons
- **Detail sheet**: Full identity, bigger metrics, details (weather/connectors/breakdown), source links
- Filter and info sheets auto-close each other

Card style: `384px · bg-card · rounded-2xl · 1.5px border · shadow-xl`

Landing page uses glass-morphism cards: `bg-white/10 · backdrop-blur · border-white/20 · rounded-xl`

### Shared Modules
- `src/lib/map-utils.tsx` — FlyTo, interpolateColor, shared types, useDebounceRef, useSearchAbort, isDevMode
- `src/lib/utm.ts` — UTM zone 33N → WGS84 conversion (for NVE ArcGIS data)

---

## Architecture

### Data Loading Patterns

| Pattern | Maps | How it works |
|---------|------|-------------|
| **Build-time static** | Charging, Cabins | `prebuild` scripts fetch from Overpass → `public/data/*.json` → frontend loads static file |
| **Preload on mount** | Income, Vern | Single API call loads all data, renders everything client-side |
| **Per-request** | Elevation, Weather | Fetch on user interaction (click/search) |

### Build-time Data Pipeline
```
npm run prebuild
  ├── scripts/fetch-stations.mjs  → public/data/stations.json (~7,000 stations)
  └── scripts/fetch-cabins.mjs    → public/data/cabins.json (~2,000 cabins)
```
- Tries 3 Overpass mirrors with retry
- If all fail, keeps existing data (graceful degradation)
- Frontend has client-side fallback to Overpass if static file is empty

### Error Handling
- All data-loading maps show a floating error pill with a **"Prøv igjen" retry button**
- Geolocation errors show a floating pill: "Kunne ikke finne posisjon..."
- Search requests abort previous in-flight request (race condition prevention)
- Debounce timers clean up on component unmount

### Search
All maps (except elevation) support a 3-tier search: **Fylke → Kommune → Adresse** (3/5/2 results).
Elevation uses address-only search (6 results) since it needs a specific point.

- **300ms debounce** — waits for typing to stop before fetching
- **Abort controller** — each keystroke cancels the previous in-flight address request
- **Keyboard navigation** — Arrow keys, Enter to select, Escape to close
- Fylke + kommune matches are instant (local filter); only address lookup hits the network
- Icon functions cache `L.divIcon` instances to avoid re-creating thousands of icons per keystroke

### Geolocation
- All maps start zoomed out showing all of Norway — no auto-locate on load
- "Min posisjon" button available on marker maps (charging, cabins, energy, elevation, vindkraft)
- Users outside Norway are redirected to Oslo (or Jotunheimen for cabins)
- 15s timeout with 60s cached position acceptance for slow networks

---

## APIs & Data Sources

All APIs are free and require no authentication.

| Data | Source | Cache |
|------|--------|-------|
| Charging stations | OpenStreetMap (Overpass) | Build-time static JSON |
| Tourist cabins | OpenStreetMap (Overpass) | Build-time static JSON |
| Wind + hydro power | NVE ArcGIS (Vindkraft2, Vannkraft1) | 1h server cache |
| River observations | NVE HydAPI (discharge, water level, percentiles) | Per-request |
| Income | SSB InntektStruk13 | Server-side, loaded once |
| Protected areas | SSB table 08936 | Server-side, loaded once |
| Weather | MET.no locationforecast | 30min server cache |
| Elevation | Kartverket høyde-API | Per-request |
| Kommune boundaries | Kartverket GeoJSON | Server-side, loaded once |
| Address search | Geonorge adresser API | Per-query |
| Kommune list | Geonorge kommuneinfo API | Loaded once on mount |

Map tiles: [Kartverket](https://cache.kartverket.no) (topo, topograatone) and [OpenTopoMap](https://opentopomap.org).

See `docs/api-sources.md` for a full catalog of Norwegian open APIs we could use.

---

## Tech Stack

- **Next.js 16** (Turbopack) + **React 19** + **TypeScript**
- **Leaflet** + **react-leaflet** + **react-leaflet-cluster** — interactive maps with marker clustering
- **Tailwind CSS 4** + **shadcn/ui** (Base UI) — styling
- **Lucide React** — icons
- **Vercel** — hosting (free tier, 10s serverless timeout)

---

## Getting Started

```bash
npm install

# Seed the static data files (requires internet access to Overpass API)
node scripts/fetch-stations.mjs
node scripts/fetch-cabins.mjs

npm run dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NVE_API_KEY` | For hydro data | API key from [NVE HydAPI](https://hydapi.nve.no/Users) — enables live river observations on hydro plant cards |

Set in Vercel dashboard → Project Settings → Environment Variables, or locally in `.env.local`.

Open [http://localhost:3000](http://localhost:3000).

### Dev Mode

Enable the API call log panel on `/map` — either via env var or browser console:

```env
# .env.local
NEXT_PUBLIC_DEV=true
```

```js
// Or toggle at runtime in browser console:
window.__MAPGRAM_DEV = true
```

---

## Project Structure

```
src/app/
  page.tsx              — Landing page (card grid)
  not-found.tsx         — 404 page
  lading/page.tsx       — Charging stations map
  hytter/page.tsx       — Tourist cabins map
  lonn/page.tsx         — Income choropleth
  vern/page.tsx         — Protected areas choropleth
  map/page.tsx          — Elevation + weather map
  energi/page.tsx       — Energy (wind + hydro) map
  vindkraft/page.tsx    — Wind power plants map
  api/
    income/route.ts     — SSB income data
    kommuner/route.ts   — GeoJSON kommune boundaries
    protected-areas/    — SSB protected areas data
    weather/route.ts    — MET.no proxy (30min cache)
    wind-power/route.ts — NVE wind power proxy (1h cache)
    energy/route.ts     — NVE wind + hydro proxy (1h cache)
    hydro-station/route.ts — NVE HydAPI live river data

src/components/
  navbar.tsx            — Shared nav with mobile sheet + "Mer" dropdown
  *-map.tsx             — Map components (one per page)
  *-map-loader.tsx      — Dynamic import wrappers (ssr: false)
  ui/                   — shadcn/ui primitives

src/lib/
  fylker.ts             — 15 counties + isInNorway() + OSLO default
  map-utils.tsx         — FlyTo, interpolateColor, shared types (Suggestion, Address), hooks
  utm.ts                — UTM zone 33N → WGS84 conversion
  utils.ts              — cn() helper

scripts/
  fetch-stations.mjs    — Build-time: ALL charging stations → public/data/stations.json
  fetch-cabins.mjs      — Build-time: ALL tourist cabins → public/data/cabins.json

docs/
  api-sources.md        — Catalog of Norwegian open APIs
  cabin-data-sources.md — OSM tags, DNT API status, data quality notes
  nve-arcgis-data.md    — NVE ArcGIS services catalog (energy, hazards, nature)

public/data/
  stations.json         — Pre-built charging station data
  cabins.json           — Pre-built cabin data
```
