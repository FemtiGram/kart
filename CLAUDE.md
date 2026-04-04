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
  not-found.tsx         — 404 page (Norwegian)
  lading/page.tsx       — Charging stations map
  hytter/page.tsx       — Tourist cabins map
  lonn/page.tsx         — Income choropleth
  vern/page.tsx         — Protected areas choropleth
  map/page.tsx          — Elevation + weather map
  vindkraft/page.tsx    — Wind power plants map
  api/
    income/route.ts     — SSB income data
    kommuner/route.ts   — GeoJSON kommune boundaries
    protected-areas/    — SSB verne data
    weather/route.ts    — MET.no proxy (30min cache)
    wind-power/route.ts — NVE wind power proxy (1h cache)

src/components/
  navbar.tsx            — Shared nav with mobile sheet
  *-map.tsx             — Map components (one per page)
  *-map-loader.tsx      — Dynamic import wrappers (ssr: false)
  ui/                   — shadcn/ui primitives

src/lib/
  fylker.ts             — Hardcoded 15 counties with coords + zoom, isInNorway(), OSLO default
  utils.ts              — cn() helper

scripts/
  fetch-stations.mjs    — Build-time: fetches ALL charging stations → public/data/stations.json
  fetch-cabins.mjs      — Build-time: fetches ALL cabins → public/data/cabins.json

public/data/
  stations.json         — Pre-built charging station data (committed to repo)
  cabins.json           — Pre-built cabin data (committed to repo)
```

## Map Architecture Patterns

### Three data loading patterns:
1. **Build-time static** (charging, cabins) — Data fetched at build time via Overpass, saved as static JSON, loaded on mount
2. **Preload on mount** (income, vern) — Single API call loads ALL data, renders everything client-side
3. **Per-request** (elevation, weather) — Fetch on user interaction

### Build-time data pipeline:
- `scripts/fetch-stations.mjs` and `scripts/fetch-cabins.mjs` run as `prebuild` hook
- Each tries 3 Overpass mirrors with retry; if all fail, keeps existing data
- Frontend has client-side Overpass fallback if static file is empty
- **Vercel's 10s timeout prevents runtime Overpass calls for large bbox queries**
- **To seed data locally:** `node scripts/fetch-stations.mjs && node scripts/fetch-cabins.mjs`

### Each map component has:
- Search bar (Fylke → Kommune → Adresse, limits: 3/5/2)
- Tile layer toggle (Kart/Gråtone) — top-right
- Info card — bottom-center, border: `var(--kv-green-light, #b3e6c8)`
- Info modal — explaining data sources
- Source attribution + link in card footer
- Error handling — floating pill, bottom on mobile (bottom-20), top on desktop (sm:top-3)
- Geolocation with isInNorway() check — falls back to default if outside Norway
- **Exception:** Elevation map uses address-only search (needs specific point)
- **Exception:** Choropleth maps use "Bakgrunnskart" toggle instead of Kart/Gråtone

### Markers (charging + cabin maps):
- `L.divIcon` with inline SVG icons inside circles
- 2.5px border, rgba(0,0,0,0.15) default, #003da5 when selected
- **Inverted on gråtone:** colored background + white icon (better visibility)
- **Normal on kart:** white background + colored icon
- Charging: green ⚡ bolt (28px)
- Cabins: colored house icon — filled for betjent/selvbetjent, outline for ubetjent (26-30px)

### Choropleth maps (income, vern):
- Red → Yellow → Green 3-stop diverging color scale
- Red = low/bad, green = high/good
- Optional "Bakgrunnskart" toggle (gråtone base layer)
- Location permission dialog with localStorage preference
- Skeleton shimmer loading on initial data fetch

## Design References
- **UX Laws** — https://uxlaws.com — Consult when making UX/design decisions. Key principles to keep in mind: Fitts's Law (touch targets), Hick's Law (limit choices), Miller's Law (chunk info), Jakob's Law (familiar patterns), aesthetic-usability effect.

## Design Tokens (CSS Variables)
- `--kv-blue: #003da5` — primary brand, selected states, metric numbers
- `--kv-green: #00b140` — secondary brand, positive values
- `--kv-green-light: #b3e6c8` — card borders (ALL cards use this)
- Card style: `bg-white rounded-2xl shadow-xl px-4 py-4`
- Modal style: `bg-background rounded-2xl shadow-xl border w-full max-w-sm p-5`
- Floating pill: `bg-background/90 backdrop-blur-sm border rounded-full px-4 py-2 shadow-lg`
- Skeleton: `.skeleton-shimmer` class (sliding gradient, #e5e7eb → #d1d5db)

## Data Sources
| Data | Source | Cache |
|------|--------|-------|
| Charging stations | OpenStreetMap (Overpass) | Build-time static JSON + client fallback |
| Cabins | OpenStreetMap (Overpass) | Build-time static JSON + client fallback |
| Wind power plants | NVE Vindkraftdatabase | 1h server cache via API route |
| Income | SSB InntektStruk13 | Loaded once on mount |
| Protected areas | SSB tabell 08936 | Loaded once on mount |
| Weather | MET.no locationforecast | 30min server cache |
| Elevation | Kartverket høyde-API | Per-request |
| Kommune boundaries | Kartverket GeoJSON | Loaded once on mount |
| Address search | Geonorge adresser API | Per-query |
| Kommune list | Geonorge kommuneinfo API | Loaded once on mount |
| Fylker | Hardcoded in fylker.ts | Static (15 counties) |

## Working Efficiently
- **Use Edit, not Write** for changes to existing files — much cheaper
- **Don't re-read files** that were recently read in the same session
- **Batch related changes** into one commit instead of commit-per-line
- **Decide approach first**, then implement — avoid build-try-revert cycles
- **Keep map components consistent** — refer to the patterns above before making changes
- **Vercel free tier limit: 10s serverless timeout** — don't make API routes that call slow external services

## Model Selection (Opus vs Sonnet)
- **Use Opus** for: architecture decisions, multi-file refactors, complex bug diagnosis, new feature design, code review
- **Use Sonnet** for: simple edits (copy changes, renaming, import fixes), file creation from a template, repetitive changes across files, formatting/linting fixes, adding tests for existing code
- Slower is fine — prefer correctness over speed. Use Opus when judgment matters.
