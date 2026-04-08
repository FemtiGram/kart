@AGENTS.md

# Datakart — Project Guide for Claude

## What is this?
A portfolio project showcasing Norwegian open geodata on interactive maps. Built to impress during job interviews. Deployed on Vercel (free tier, 10s serverless timeout).

## Tech Stack
- **Framework:** Next.js 16.2.1 (Turbopack) — see AGENTS.md for version caveats
- **React:** 19.2.4
- **Maps:** Leaflet 1.9.4 + react-leaflet 5.0.0 + react-leaflet-cluster
- **Styling:** Tailwind CSS 4 + shadcn/ui (base-ui)
- **Tiles:** Kartverket WMTS (topo + topograatone + sjokartraster) + OpenTopoMap (terreng)
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
  bolig/page.tsx        — Housing prices bubble map
  map/page.tsx          — Elevation + weather map
  energi/page.tsx       — Energy (wind + hydro) map
  magasin/page.tsx      — Reservoir monitor map
  vindkraft/page.tsx    — Wind power plants map (standalone)
  api/
    bolig/route.ts      — SSB housing price data (table 06035)
    income/route.ts     — SSB income data
    kommuner/route.ts   — GeoJSON kommune boundaries (static file)
    protected-areas/    — SSB verne data
    weather/route.ts    — MET.no proxy (30min cache)
    wind-power/route.ts — NVE wind power proxy (1h cache)
    energy/route.ts     — NVE wind + hydro proxy (1h cache)
    reservoirs/route.ts — NVE reservoir polygons (1h cache)
    hydro-station/route.ts — NVE HydAPI live river data (requires API key)

src/components/
  navbar.tsx            — Shared nav with grouped dropdowns (Energi/Natur/Samfunn) + mobile sheet
  *-map.tsx             — Map components (one per page)
  *-map-loader.tsx      — Dynamic import wrappers (ssr: false)
  ui/                   — shadcn/ui primitives

src/lib/
  fylker.ts             — Hardcoded 15 counties with coords + zoom, isInNorway(), OSLO default
  map-utils.tsx         — FlyTo, interpolateColor, DataDisclaimer, shared types (Suggestion, Address), useDebounceRef, useSearchAbort
  utm.ts                — UTM zone 33N → WGS84 conversion (for NVE ArcGIS data)
  utils.ts              — cn() helper

scripts/
  fetch-stations.mjs    — Build-time: fetches ALL charging stations → public/data/stations.json
  fetch-cabins.mjs      — Build-time: fetches ALL cabins → public/data/cabins.json
  fetch-production.mjs  — Build-time: fetches yearly oil/gas production from Sodir → public/data/production.json
  fetch-reservoirs.mjs  — Build-time: fetches reservoir polygons from NVE → public/data/reservoirs.json
  fetch-kommuner.mjs    — Build-time: fetches kommune boundaries GeoJSON → public/data/kommuner.geojson

public/data/
  stations.json         — Pre-built charging station data (committed to repo)
  cabins.json           — Pre-built cabin data (committed to repo)
  production.json       — Pre-built Sodir yearly field production data (committed to repo)
  reservoirs.json       — Pre-built NVE reservoir polygons (committed to repo)
  kommuner.geojson      — Pre-built kommune boundary GeoJSON (committed to repo)
```

## Map Architecture Patterns

### Three data loading patterns:
1. **Build-time static** (charging, cabins, production, reservoirs, kommuner) — Data fetched at build time, saved as static JSON/GeoJSON, loaded on mount
2. **Preload on mount** (income, vern, bolig) — API call loads ALL data, renders everything client-side
3. **Per-request** (elevation, weather) — Fetch on user interaction

### Build-time data pipeline:
- `scripts/fetch-stations.mjs`, `scripts/fetch-cabins.mjs`, `scripts/fetch-production.mjs`, `scripts/fetch-reservoirs.mjs`, and `scripts/fetch-kommuner.mjs` run as `prebuild` hook
- Overpass scripts try 3 mirrors with retry; if all fail, keeps existing data
- Frontend has client-side Overpass fallback if static file is empty
- Production script fetches yearly CSV from Sodir FactPages (~205 KB, 130 fields)
- **Vercel's 10s timeout prevents runtime Overpass calls for large bbox queries**
- **To seed data locally:** `node scripts/fetch-stations.mjs && node scripts/fetch-cabins.mjs && node scripts/fetch-production.mjs && node scripts/fetch-reservoirs.mjs && node scripts/fetch-kommuner.mjs`

### Each map component has:
- Search bar (Fylke → Kommune → Adresse, limits: 3/5/2)
- Tile layer toggle (Kart/Gråtone) — top-right
- Compact info card + expandable detail sheet (see card pattern below)
- Info modal — explaining data sources
- Error handling — floating pill, bottom on mobile (bottom-20), top on desktop (sm:top-3)
- "Min posisjon" button with isInNorway() check — falls back to OSLO/Jotunheimen if outside Norway
- **Exception:** Elevation map uses address-only search (needs specific point, 6 results)
- **Exception:** Choropleth maps use "Bakgrunnskart" toggle instead of Kart/Gråtone
- **Exception:** Choropleth maps have no "Min posisjon" button

### Info card pattern (standard for all maps):
All maps use a **compact floating card + expandable bottom Sheet** pattern:

**Compact card** (floating, bottom-center):
- Layer 1: Identity (badges, name, subtitle)
- Layer 2: Key metric (big number + label)
- Action row: "Vis mer" button + "Kjør hit" directions link

**Detail sheet** (bottom Sheet, opened by "Vis mer"):
- Layer 1: Full identity (badges, name, owner/operator, location)
- Layer 2: Key metrics (bigger numbers, more detail)
- Layer 3: Details (weather, connectors, category breakdown, etc.)
- Layer 4: Links + source attribution

**Interaction rules:**
- Filter sheet and info sheet auto-close each other
- Closing the detail sheet returns to the compact card
- Closing the compact card deselects the item
- Choropleth maps use `clearSelection()` which also resets polygon styling

### Search architecture:
- **Debounce:** 300ms after last keystroke before triggering search
- **Abort controller:** Each new search aborts the previous in-flight address fetch (`useSearchAbort` from map-utils)
- **Suggestion sources:** Fylke (local filter on hardcoded list), Kommune (local filter on loaded list), Adresse (Geonorge API), Anlegg (energy map only — oil/gas facility name + field name)
- **Kommune data:** Marker maps load from `geonorge.no/kommuneinfo/v1/kommuner`; choropleth maps use GeoJSON properties they already have
- **Kommune center:** Marker maps resolve via `geonorge.no/stedsnavn` API; choropleth maps use GeoJSON layer bounds
- **Dropdown:** `onMouseDown` for selection (fires before `onBlur`), 150ms blur delay, keyboard nav (↑↓ Enter Escape)
- **Icon caching:** All icon functions (`chargingIcon`, `cabinIcon`, `energyIcon`, `bubbleIcon`) cache `L.divIcon` instances by args to avoid recreating 15,000 icons per re-render
- **Future refactor:** Split search bar + map markers into separate React components to avoid keystroke re-renders propagating to marker layer

### Markers (charging, cabin, energy maps):
- `L.divIcon` with inline SVG icons inside circles, cached by args to avoid re-creation
- `react-leaflet-cluster` for marker clustering at low zoom levels
- Cluster colors: green (#15803d) charging, amber (#b45309) cabins, blue (#0369a1) energy
- Cluster sizes scale by count: 36px (<100), 44px (100-499), 52px (500+)
- 2.5px border, rgba(0,0,0,0.15) default, #24374c when selected
- **Inverted on gråtone:** colored background + white icon (better visibility)
- **Normal on kart:** white background + colored icon
- Charging: green ⚡ bolt (28px)
- Cabins: colored house icon — filled for fjellhytte, outline for ubetjent (26-30px)
- Energy: blue wind icon or cyan water droplet, sized by capacity (26-32px)

### Bubble map (bolig):
- Blue → Orange → Red color scale based on **percentile** rank (not linear min/max)
- Bubble size encodes transaction volume: 10px (<50 sales) → 28px (500+)
- `react-leaflet-cluster` with price-colored cluster icons
- Filters: dwelling type (Enebolig/Småhus/Blokk) + year selector (2015–2024)
- MarkerClusterGroup uses `key={type+year}` to force re-cluster on filter change
- Kommune centers computed as centroids from GeoJSON polygon geometry
- Detail sheet: all types comparison, bar chart trend, national/fylke rankings

### Choropleth maps (income, vern):
- Red → Yellow → Green 3-stop diverging color scale
- Red = low/bad, green = high/good
- Optional "Bakgrunnskart" toggle (gråtone base layer)
- Skeleton shimmer loading on initial data fetch

### Energy map specifics:
- **Sjøkart overlay:** Optional Kartverket nautical chart layer (sjokartraster), toggled in tile switcher, off by default
- **Oil/gas search:** Facilities searchable by name and field name (Sodir data)
- **Oil/gas detail sections:** "Anleggsdetaljer" (type, felt, funksjoner, status) and "Produksjon" sections, each with toggleable info icon explaining the metrics
- **Production data:** Yearly oil/gas production per field joined by `fieldName`, shown as sparkline + totals in detail sheet
- **Pipeline hit areas:** Invisible 16px-wide polyline underneath visible line for easier clicking
- **URL deep linking:** Selection synced to URL hash (`#kraft-{id}`, `#anlegg-{id}`, `#havvind-{id}`). Shared links auto-select + expand detail sheet
- **Formatted labels:** Sodir kind/functions translated to Norwegian with title-casing
- **Animated loading counter:** All maps show a count-up animation after data loads (AnimatedCount component)

### Shared components:
- **DataDisclaimer:** Shared disclaimer component in map-utils.tsx, shown after every Kilde attribution in all detail sheets
- **MapError:** Shared error toast with retry button, used across all maps
- **Navigation:** Grouped dropdown nav (Energi/Natur/Samfunn) with matching landing page structure

### WCAG contrast:
- No `/60` or `/40` opacity modifiers on text elements
- Metric numbers use `#0e7490` (cyan-700, 4.6:1) not `#0891b2` (cyan-600, 2.1:1)
- Badges use `text-foreground` on `bg-muted`, not `text-muted-foreground`

## SEO & AI Discoverability

Every new page MUST be rigged for Google Search and AI search (ChatGPT, Perplexity, Google AI Overviews). This is a hard requirement — not optional polish.

### Checklist for every new page:
1. **`export const metadata`** — unique `title` (uses layout template `%s — Datakart`) and `description` (specific, keyword-rich, Norwegian). Description should answer "what does this page show?" in one sentence.
2. **`opengraph-image.tsx`** — dynamic OG image (Next.js ImageResponse). Shows page title + key stat on branded background. Required for social sharing and rich previews.
3. **`sitemap.ts`** — add the route with appropriate `priority` and `changeFrequency`.
4. **JSON-LD** — the root layout has WebSite schema. Add page-specific schema (e.g., `Dataset`, `Map`) if the page has structured data that search engines can index.
5. **Semantic HTML** — use proper heading hierarchy (h1 → h2 → h3). Screen readers and crawlers use this.
6. **Norwegian language** — all user-facing text in Norwegian (bokmål). `<html lang="no">` is set in layout. Descriptions, labels, and error messages should be Norwegian.

### What exists today:
- `src/app/layout.tsx` — global metadata (title template, description, metadataBase, openGraph, twitter card), JSON-LD WebSite schema
- `src/app/sitemap.ts` — all pages with priority/frequency
- `src/app/robots.ts` — allows all crawlers, points to sitemap
- `src/app/*/opengraph-image.tsx` — dynamic OG images per page
- Google Analytics (G-T8XDP59WNK) — dedicated property for datakart.no
- Google Search Console — site verified, sitemap submitted

### AI search optimization:
- **Structured data matters** — AI systems extract facts from JSON-LD and meta descriptions. Make descriptions factual and specific ("Gjennomsnittlig kvadratmeterpris for 264 kommuner") not vague ("Utforsk boligdata").
- **Content in HTML** — map data rendered client-side is invisible to crawlers. The page `description` and any static text (info modals, about sections) IS crawlable — make it count.
- **Answer the query** — think about what someone would search for ("boligpriser norge kart", "kvadratmeterpris oslo") and make sure the description and title contain those terms naturally.
- **Attribution page** — `/kilder` lists all data sources with links. This builds trust signals for both users and AI systems.

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
| Charging stations | NOBIL / Enova (datadump API) | Build-time static JSON (requires NOBIL_API_KEY) |
| Cabins | OpenStreetMap (Overpass) | Build-time static JSON + client fallback |
| Wind + hydro power | NVE ArcGIS (Vindkraft2 layers 0/1/2/4/8, Vannkraft1 layer 0) | 1h server cache via API route |
| Oil/gas facilities | Sodir FactMaps (layer 307 + pipelines 311) | 1h server cache via API route |
| Oil/gas production | Sodir FactPages (yearly field production CSV) | Build-time static JSON |
| Reservoirs | NVE ArcGIS (Vannkraft1 layer 6 — Magasin) | 1h server cache via API route |
| River observations | NVE HydAPI (discharge, water level, percentiles) | Per-request (requires NVE_API_KEY) |
| Housing prices | SSB tabell 06035 (Selveierboliger) | 24h server cache via API route |
| Income | SSB InntektStruk13 | Loaded once on mount |
| Protected areas | SSB tabell 08936 | Loaded once on mount |
| Weather | MET.no locationforecast | 30min server cache |
| Elevation | Kartverket høyde-API | Per-request |
| Kommune boundaries | GitHub (robhop/fylker-og-kommuner) | Build-time static GeoJSON |
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
