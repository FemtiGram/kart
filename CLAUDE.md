@AGENTS.md

# MapGram — Project Guide for Claude

## What is this?
A portfolio project showcasing Norwegian open geodata on interactive maps. Built to impress during job interviews. Deployed on Vercel (free tier, 10s serverless timeout).

## Tech Stack
- **Framework:** Next.js 16.2.1 (Turbopack) — see AGENTS.md for version caveats
- **React:** 19.2.4
- **Maps:** Leaflet 1.9.4 + react-leaflet 5.0.0
- **Styling:** Tailwind CSS 4 + shadcn/ui (base-ui)
- **Tiles:** Kartverket WMTS (topo + topograatone)
- **Icons:** lucide-react

## Project Structure

```
src/app/
  page.tsx              — Landing page (card grid)
  lading/page.tsx       — Charging stations map
  hytter/page.tsx       — Tourist cabins map
  lonn/page.tsx         — Income choropleth
  vern/page.tsx         — Protected areas choropleth
  map/page.tsx          — Elevation + weather map
  api/
    cabins/route.ts     — Overpass → cabin data (viewport-based)
    income/route.ts     — SSB income data
    kommuner/route.ts   — GeoJSON kommune boundaries
    protected-areas/    — SSB verne data
    weather/route.ts    — MET.no proxy (30min cache)

src/components/
  navbar.tsx            — Shared nav with mobile sheet
  *-map.tsx             — Map components (one per page)
  *-map-loader.tsx      — Dynamic import wrappers (ssr: false)
  ui/                   — shadcn/ui primitives

src/lib/
  fylker.ts             — Hardcoded 15 counties with coords + zoom
  utils.ts              — cn() helper

scripts/
  fetch-stations.mjs    — Build-time: fetches ALL charging stations → public/data/stations.json

public/data/
  stations.json         — Pre-built charging station data (committed to repo)
```

## Map Architecture Patterns

### Two map types:
1. **Viewport maps** (cabin) — Load data per viewport via Overpass API, client-side cache by ID
2. **Preload maps** (charging, income, vern) — Load ALL data on mount, render everything

### Charging stations use a special pattern:
- Data is fetched at **build time** by `scripts/fetch-stations.mjs` (prebuild hook)
- Saved as static JSON in `public/data/stations.json`
- Frontend fetches this file on mount — no API route needed
- The script tries 3 Overpass mirrors with retry; if all fail, keeps existing data
- **Vercel's 10s timeout prevents runtime Overpass calls for large bbox queries**

### Each map component has:
- Search bar (Fylke → Kommune → Adresse, limits: 3/5/2)
- Tile layer toggle (Kart/Gråtone) — top-right
- Info card — bottom-center, border: `var(--kv-green-light, #b3e6c8)`
- Info modal — explaining data sources
- Source attribution + link in card footer
- Error handling — floating pill, only shown when no data on screen
- **Exception:** Elevation map uses address-only search (needs specific point)

### Markers:
- `L.divIcon` with inline SVG icons inside white circles
- 2.5px border, rgba(0,0,0,0.15) default, #003da5 when selected
- Charging: green ⚡ bolt (28px)
- Cabins: colored house icon — filled for betjent/selvbetjent, outline for ubetjent (26-30px)

### Choropleth maps (income, vern):
- Red → Yellow → Green diverging color scale
- Red = low/bad, green = high/good
- Optional "Bakgrunnskart" toggle (gråtone base layer)
- Location permission dialog with localStorage preference
- Skeleton loading on initial data fetch

## Design Tokens (CSS Variables)
- `--kv-blue: #003da5` — primary brand, selected states, metric numbers
- `--kv-green: #00b140` — secondary brand, positive values
- `--kv-green-light: #b3e6c8` — card borders
- Card style: `bg-white rounded-2xl shadow-xl px-4 py-4`
- Modal style: `bg-background rounded-2xl shadow-xl border w-full max-w-sm p-5`
- Floating pill: `bg-background/90 backdrop-blur-sm border rounded-full px-4 py-2 shadow-lg`

## Data Sources
| Data | Source | Cache |
|------|--------|-------|
| Charging stations | OpenStreetMap (Overpass) | Build-time static JSON |
| Cabins | OpenStreetMap (Overpass) | 24h server cache, client ID cache |
| Income | SSB InntektStruk13 | Loaded once on mount |
| Protected areas | SSB tabell 08936 | Loaded once on mount |
| Weather | MET.no locationforecast | 30min server cache |
| Elevation | Kartverket høyde-API | Per-request |
| Kommune boundaries | Kartverket GeoJSON | Loaded once on mount |
| Address search | Geonorge adresser API | Per-query |
| Kommune list | Geonorge kommuneinfo API | Loaded once on mount |

## Working Efficiently
- **Use Edit, not Write** for changes to existing files — much cheaper
- **Don't re-read files** that were recently read in the same session
- **Batch related changes** into one commit instead of commit-per-line
- **Decide approach first**, then implement — avoid build-try-revert cycles
- **Keep map components consistent** — refer to the patterns above before making changes
- **Vercel free tier limit: 10s serverless timeout** — don't make API routes that call slow external services
