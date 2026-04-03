# MapGram

A portfolio project showcasing Norwegian open geodata on interactive maps. Built to explore what's possible with free, public data — and to impress during job interviews.

**Live:** Deployed on Vercel, auto-deploys on push to master.

---

## Maps

### Høydekart (`/map`)
- Click anywhere or search an address to see elevation (m.o.h.) and current weather
- Smart location resolving: buildings → streets → place names
- Weather from MET.no with yr.no link
- Toggle between Kartverket topo and OpenTopoMap terrain

### Inntektskart (`/lonn`)
- Choropleth: median after-tax household income per municipality (2024)
- Red → Yellow → Green diverging scale
- Rank, % vs. national median, progress bar
- Data from SSB InntektStruk13

### Verneområder (`/vern`)
- Choropleth: protected nature areas per municipality (km²)
- Breakdown by category: nasjonalpark, naturreservat, landskapsvernområde, andre
- Data from SSB table 08936

### Ladestasjoner (`/lading`)
- All ~7,000 EV charging stations in Norway
- Data pre-fetched at build time from OpenStreetMap (Overpass API)
- Custom ⚡ markers that invert colors on gråtone map
- Connector types, capacity, directions

### Turisthytter (`/hytter`)
- DNT cabins and mountain huts across Norway
- Data pre-fetched at build time from OpenStreetMap
- Color-coded by type: betjent (red), selvbetjent (blue), ubetjent (green)
- Elevation, bed count, season, fee info, weather
- Links to DNT.no cabin search

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

### Search Hierarchy
All maps (except elevation) support: **Fylke → Kommune → Adresse** (3/5/2 results).
Elevation uses address-only search (needs a specific point).

### Geolocation
- Users outside Norway are redirected to Oslo (charging) or Jotunheimen (cabins)
- Choropleth maps ask permission and auto-select the user's kommune
- Location preference persisted in localStorage

---

## APIs & Data Sources

All APIs are free and require no authentication.

| Data | Source | Cache |
|------|--------|-------|
| Charging stations | OpenStreetMap (Overpass) | Build-time static JSON |
| Tourist cabins | OpenStreetMap (Overpass) | Build-time static JSON |
| Income | SSB InntektStruk13 | Server-side, loaded once |
| Protected areas | SSB table 08936 | Server-side, loaded once |
| Weather | MET.no locationforecast | 30min server cache |
| Elevation | Kartverket høyde-API | Per-request |
| Kommune boundaries | Kartverket GeoJSON | Server-side, loaded once |
| Address search | Geonorge adresser API | Per-query |
| Kommune list | Geonorge kommuneinfo API | Loaded once on mount |

Map tiles: [Kartverket](https://cache.kartverket.no) (topo, topograatone) and [OpenTopoMap](https://opentopomap.org).

---

## Tech Stack

- **Next.js 16** (Turbopack) + **React 19** + **TypeScript**
- **Leaflet** + **react-leaflet** — interactive maps
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

Open [http://localhost:3000](http://localhost:3000).

### Dev Mode

Enable the API call log panel on `/map`:

```env
# .env.local
NEXT_PUBLIC_DEV=true
```

---

## Project Structure

```
src/app/
  page.tsx              — Landing page (card grid, 5 maps)
  not-found.tsx         — 404 page
  lading/page.tsx       — Charging stations map
  hytter/page.tsx       — Tourist cabins map
  lonn/page.tsx         — Income choropleth
  vern/page.tsx         — Protected areas choropleth
  map/page.tsx          — Elevation + weather map
  api/
    income/route.ts     — SSB income data
    kommuner/route.ts   — GeoJSON kommune boundaries
    protected-areas/    — SSB protected areas data
    weather/route.ts    — MET.no proxy (30min cache)

src/components/
  navbar.tsx            — Shared nav with mobile sheet
  *-map.tsx             — Map components (one per page)
  *-map-loader.tsx      — Dynamic import wrappers (ssr: false)
  ui/                   — shadcn/ui primitives

src/lib/
  fylker.ts             — 15 counties + isInNorway() + OSLO default
  utils.ts              — cn() helper

scripts/
  fetch-stations.mjs    — Build-time: ALL charging stations → public/data/stations.json
  fetch-cabins.mjs      — Build-time: ALL tourist cabins → public/data/cabins.json

public/data/
  stations.json         — Pre-built charging station data
  cabins.json           — Pre-built cabin data
```
