# Datakart

Interactive maps built entirely on free, open Norwegian geodata. No paid APIs, no authentication required — just public data from Kartverket, SSB, NVE, MET.no, and OpenStreetMap.

Live at: [datakart.no](https://datakart.no)

---

## Features

| Feature | Route | Description | Docs |
|-----|-------|-------------|------|
| Stedsprofil | `/kommune/[slug]` | One dashboard per kommune (357 pages) combining population, income, housing, schools, energy, natur, charging, weather, and an interactive locator map with 6 toggleable layers | |
| Boligpriser | `/bolig` | Housing prices (kr/m²) per municipality — bubble map with kommune comparison and Finn.no deep-links | |
| Skoler og barnehager | `/skoler` | All 3 100+ skoler and 5 500+ barnehager in Norge with student/child counts, type and ownership. Data from Utdanningsdirektoratet (NSR + NBR) | |
| Energikart | `/energi` | Wind, hydro, offshore wind, oil and gas | [docs/maps/energi.md](docs/maps/energi.md) |
| Magasinkart | `/magasin` | Regulated water reservoirs with live fill levels | [docs/maps/magasin.md](docs/maps/magasin.md) |
| Ladestasjoner | `/lading` | All EV charging stations in Norway | [docs/maps/lading.md](docs/maps/lading.md) |
| Turisthytter | `/hytter` | Mountain huts and wilderness cabins | [docs/maps/hytter.md](docs/maps/hytter.md) |
| Høydekart | `/map` | Click anywhere for elevation (m.o.h.) and live weather | [docs/maps/hoyde.md](docs/maps/hoyde.md) |
| Inntektskart | `/lonn` | Choropleth: median household income per municipality with kommune comparison | [docs/maps/inntekt.md](docs/maps/inntekt.md) |
| Verneområder | `/vern` | Choropleth: protected nature area per municipality (km²) | [docs/maps/vern.md](docs/maps/vern.md) |
| Prisvekst | `/prisvekst` | Inflation dashboard: KPI, categories, trends, Nordic comparison | |

---

## Tech Stack

- **Next.js 16** (Turbopack) + **React 19** + **TypeScript**
- **Leaflet 1.9** + **react-leaflet 5** + **react-leaflet-cluster** — interactive maps with clustering
- **Recharts** (via shadcn/ui chart components) — charts
- **Motion** (motion.dev) — subtle page animations
- **Tailwind CSS 4** + **shadcn/ui** (Base UI) — styling
- **Lucide React** — icons
- **Vercel** — hosting (free tier, 10-second serverless timeout)

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NOBIL_API_KEY` | Required | API key from [NOBIL](https://nobil.no) — charging station data for the build-time fetch script |
| `ENOVA_RT_API_KEY` | Optional | API key from [data.enova.no](https://data.enova.no) (NOBIL Real-time product) — enables live charging station availability |
| `NVE_API_KEY` | Optional | API key from [NVE HydAPI](https://hydapi.nve.no/Users) — enables live river discharge and water level data on hydro plant and reservoir cards |
Set in Vercel under Project Settings → Environment Variables, or locally in `.env.local`.

---

## Running Locally

```bash
npm install

# Seed the pre-built static data files
node scripts/fetch-stations.mjs
node scripts/fetch-cabins.mjs
node scripts/fetch-production.mjs
node scripts/fetch-reservoirs.mjs
node scripts/fetch-kommuner.mjs
node scripts/fetch-finn-locations.mjs
node scripts/fetch-schools.mjs
node scripts/build-kommune-profiles.mjs

npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The seed scripts are also run automatically as a `prebuild` hook when deploying. If Overpass is unreachable, the existing files in `public/data/` are kept.

---

## Data Sources

| Data | Source | Refresh |
|------|--------|---------|
| Charging stations | NOBIL / Enova (datadump API) | Build-time static JSON |
| Charging status | NOBIL Real-time (Enova WebSocket) | Live via WebSocket |
| Tourist cabins | OpenStreetMap (Overpass API) | Build-time static JSON |
| Wind and hydro power | NVE ArcGIS (Vindkraft2, Vannkraft1) | 1-hour server cache |
| Reservoirs | NVE ArcGIS (Vannkraft1 layer 6) | 1-hour server cache |
| Offshore wind zones | NVE ArcGIS (Havvind2023) | 1-hour server cache |
| Oil and gas facilities | Sodir FactMaps (WGS84 MapServer) | 1-hour server cache |
| River observations | NVE HydAPI | Per-request |
| Housing prices | SSB table 06035 (Selveierboliger) | 24-hour server cache |
| Population | SSB table 07459 | Build-time static JSON |
| Income | SSB InntektStruk13 | 24-hour server cache |
| Schools | Utdanningsdirektoratet NSR (`data-nsr.udir.no`) | Build-time static JSON |
| Kindergartens | Utdanningsdirektoratet NBR (`data-nbr.udir.no`) | Build-time static JSON |
| Finn.no location codes | Scraped from `finn.no/realestate/homes/search.html` | Build-time static JSON |
| Inflation (KPI) | SSB tables 03013 + 05327 | Loaded once on mount |
| Policy rate | Norges Bank API | Loaded once on mount |
| Nordic inflation | Eurostat HICP | Loaded once on mount |
| Protected areas | SSB table 08936 | 24-hour server cache |
| Weather | MET.no locationforecast | 30-minute server cache |
| Elevation | Kartverket høyde-API | Per-request |
| Municipality boundaries | GitHub (robhop/fylker-og-kommuner) | Build-time static GeoJSON |
| Address search | Geonorge adresser API (via `/api/sok` proxy) | 1-hour edge cache + 24-hour stale-while-revalidate |

Map tiles: [Kartverket WMTS](https://cache.kartverket.no) (topo, topograatone) and [OpenTopoMap](https://opentopomap.org).

---

## Developer and AI Guide

See [CLAUDE.md](CLAUDE.md) for architecture decisions, code patterns, component conventions, and instructions for working with this codebase.
