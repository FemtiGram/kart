@AGENTS.md

# Datakart — Project Guide for Claude

## What is this?
A portfolio project showcasing Norwegian open geodata on interactive maps. Built to impress during job interviews. Deployed on Vercel (free tier, 10s serverless timeout).

## Tech Stack
- **Framework:** Next.js 16.2.1 (Turbopack) — see AGENTS.md for version caveats
- **React:** 19.2.4
- **Maps:** Leaflet 1.9.4 + react-leaflet 5.0.0 + react-leaflet-cluster
- **Styling:** Tailwind CSS 4 + shadcn/ui (base-ui)
- **Charts:** Recharts (via shadcn/ui chart components)
- **Animation:** motion.dev (~3KB) — subtle entrance/scroll/hover animations on landing page (src/components/motion.tsx)
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
  prisvekst/page.tsx    — Inflation dashboard (KPI, categories, trends)
  vindkraft/page.tsx    — Wind power plants map (standalone)
  kommune/page.tsx      — Kommuner index (searchable list grouped by fylke, keyboard nav)
  kommune/[slug]/page.tsx — Stedsprofil (dashboard per kommune, SSG at build time)
  kommune/[slug]/opengraph-image.tsx — Dynamic OG image per kommune
  skoler/page.tsx       — Schools and kindergartens map (NSR + NBR from UDIR)
  personvern/page.tsx   — Privacy policy page
  api/
    bolig/route.ts      — SSB housing price data (table 06035)
    income/route.ts     — SSB income data
    kommuner/route.ts   — GeoJSON kommune boundaries (static file)
    protected-areas/    — SSB verne data
    weather/route.ts    — MET.no proxy (30min cache)
    wind-power/route.ts — NVE wind power proxy (1h cache)
    energy/route.ts     — NVE wind + hydro proxy (1h cache)
    reservoirs/route.ts — NVE reservoir polygons (1h cache)
    charging-status/route.ts — Enova real-time WebSocket token (requires ENOVA_RT_API_KEY)
    hydro-station/route.ts — NVE HydAPI live river data (requires API key)
    inflation/route.ts  — SSB KPI + KPI-JAE + Norges Bank rate + Eurostat HICP
    sok/route.ts        — Geonorge adresser proxy (free-text + punktsok), 1h edge cache + SWR

src/components/
  navbar.tsx            — Shared nav with grouped dropdowns (Energi/Natur/Samfunn) + mobile sheet
  *-map.tsx             — Map components (one per page)
  *-map-loader.tsx      — Dynamic import wrappers (ssr: false)
  inflation-dashboard.tsx — Prisvekst dashboard (Recharts charts, target badges, category breakdown)
  kommune-index.tsx     — Client component for /kommune index search + list (keyboard nav, Sami-aware)
  kommune-mini-map.tsx  — Interactive Leaflet map for Stedsprofil "Plassering" section (polygon + 6 layer pills)
  kommune-mini-map-loader.tsx — Dynamic wrapper for kommune-mini-map (ssr: false)
  kommune-weather.tsx   — Client weather card for Stedsprofil (fetches /api/weather)
  schools-map.tsx       — /skoler map: schools + kindergartens with independent cluster toggles
  schools-map-loader.tsx — Dynamic wrapper for schools-map (ssr: false)
  map-icons.tsx         — Shared L.divIcon factories: chargingIcon, cabinIcon, reservoirIcon, schoolIcon, kindergartenIcon + re-exports of energyIcon from energy-map-helpers
  ui/                   — shadcn/ui primitives (includes chart.tsx for Recharts wrappers)

src/lib/
  fylker.ts             — Hardcoded 15 counties with coords + zoom, isInNorway(), OSLO default
  map-utils.tsx         — FlyTo, interpolateColor, DataDisclaimer, shared types (Suggestion, Address, KommuneEntry), useDebounceRef, useSearchAbort
  use-hash-selection.ts — URL hash deep linking hook for selection state (#kommune-<id>, #station-<id>, etc.)
  use-initial-position.ts — Reads ?lat=&lon=&z= on mount and fires a callback (deep linking from Stedsprofil to maps)
  kommune-profiles.ts   — Reads public/data/kommune-profiles.json at build time, exports getProfileBySlug / getAllKommuner / getTotals
  kommune-slug.ts       — Pure function that mirrors the build-time slugify logic (knr-name) for client-side URL construction
  utm.ts                — UTM zone 33N → WGS84 conversion (for NVE ArcGIS data)
  utils.ts              — cn() helper

scripts/
  fetch-stations.mjs    — Build-time: fetches ALL charging stations → public/data/stations.json
  fetch-cabins.mjs      — Build-time: fetches ALL cabins → public/data/cabins.json
  fetch-production.mjs  — Build-time: fetches yearly oil/gas production from Sodir → public/data/production.json
  fetch-reservoirs.mjs  — Build-time: fetches reservoir polygons from NVE → public/data/reservoirs.json
  fetch-kommuner.mjs    — Build-time: fetches kommune boundaries GeoJSON → public/data/kommuner.geojson
  fetch-finn-locations.mjs — Build-time: scrapes Finn.no realestate page, extracts hierarchical location codes, matches each kommune → public/data/finn-locations.json
  fetch-schools.mjs     — Build-time: lists active schools (NSR) and barnehager (NBR) from UDIR, fetches per-orgnr detail for coordinates and stats in a 20-wide pool → public/data/schools.json
  build-kommune-profiles.mjs — Build-time: composes SSB population/income/bolig/vern + NVE plants + UDIR schools/barnehager + static files via point-in-polygon and kommunenummer grouping into one profile per kommune → public/data/kommune-profiles.json

public/data/
  stations.json         — Pre-built charging station data (committed to repo)
  cabins.json           — Pre-built cabin data (committed to repo)
  production.json       — Pre-built Sodir yearly field production data (committed to repo)
  reservoirs.json       — Pre-built NVE reservoir polygons (committed to repo)
  kommuner.geojson      — Pre-built kommune boundary GeoJSON (committed to repo)
  finn-locations.json   — Pre-built kommune → Finn.no location code map (committed to repo)
  schools.json          — Pre-built NSR + NBR data (schools and barnehager with coordinates)
  kommune-profiles.json — Pre-built per-kommune profile data for Stedsprofil (committed to repo)
```

## Map Architecture Patterns

### Four data loading patterns:
1. **Build-time static** (charging, cabins, production, reservoirs, kommuner) — Data fetched at build time, saved as static JSON/GeoJSON, loaded on mount
2. **Preload on mount** (income, vern, bolig) — API call loads ALL data, renders everything client-side
3. **Per-request** (elevation, weather) — Fetch on user interaction
4. **Real-time WebSocket** (charging status) — API route fetches temporary WSS URL from Enova, client connects and receives live updates. Status stored in ref (not state) to avoid re-rendering all markers. Auto-reconnects every 30s (JWT expires ~60s).

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

**Compact card** (floating, bottom-center) — horizontal Z-pattern layout:
- Row 1 left: Name (`text-xl font-extrabold`, brand blue) + supporting stat (e.g. "312 salg", "4 punkt")
- Row 1 right: Key metric (`text-xl font-extrabold`, brand blue) + unit (e.g. "kr/m²", "kW", "moh.")
- Row 2 left: Context (fylke, operator, type · year) in `text-xs text-muted-foreground`
- Row 2 right: Badge or secondary stat (yoy change, "Idriftsatt 1987", type badge) in `text-xs`
- Row 2 spacing: `mt-1` (4px) from row 1
- X button: absolute top-right, `p-2.5` for WCAG touch target (36px)
- Action row: buttons with `flex-1` for equal width, `mt-3` spacing
- Name and metric share the same font size for visual balance

**Detail sheet** (bottom Sheet, opened by "Vis mer"):
- Header follows same Z-pattern as compact card (name+stat left, metric right)
- Remaining sections: details, charts, rankings, source attribution

**Interaction rules:**
- Filter sheet and info sheet auto-close each other
- Closing the detail sheet returns to the compact card
- Closing the compact card deselects the item
- Choropleth maps use `clearSelection()` which also resets polygon styling

**Mobile optimizations:**
- Legends (kr/m², inntekt, vern) hidden on mobile (`hidden sm:block`) to save map space
- Badges use `text-xs` (12px) minimum — no `text-[10px]` on compact cards
- Cabin badges use sentence case ("Ubetjent hytte") not uppercase

### Search architecture:
- **Component:** `MapSearchBar` (`src/components/map-search.tsx`) is a self-contained `forwardRef` component. All search state (query, suggestions, dropdown, debounce, abort, composition, spinner grace) lives inside the component so **keystrokes never re-render the parent map**. Parents pass `kommuneList` (a getter), `extraSuggestions` (optional), `onSelect`, and `placeholder`, and receive a ref exposing `setQuery()` / `focus()` for imperative control.
- **Address proxy:** All address lookups go through `/api/sok?q=...&n=...` (or `?lat=...&lon=...&radius=...&n=1` for reverse geocode). The route forwards to `ws.geonorge.no/adresser/v1/` with a 1h Vercel edge cache + 24h stale-while-revalidate. Popular queries ("oslo", "bergen") return from the CDN in ~20ms instead of 100–800ms direct.
- **Debounce:** 150ms after last keystroke. Below the ~200ms perception threshold, so typing feels instant. Cached CDN responses make this cheap.
- **IME composition:** `onCompositionStart` / `onCompositionEnd` (via `isComposingRef`) skip the debounced search during IME input so Japanese/Chinese typing doesn't fire mid-composition searches.
- **Spinner grace:** 200ms grace before the loading spinner shows. Cached responses arrive in 20–50ms so the spinner never flashes for repeat queries (no flicker).
- **useDeferredValue:** The suggestions list uses `useDeferredValue` to let React deprioritize dropdown renders under concurrent mode — keeps input at 60fps even under render pressure.
- **Abort controller:** Each new search aborts the previous in-flight address fetch (`useSearchAbort` from map-utils).
- **Suggestion sources:** Fylke (local filter on hardcoded list), Kommune (local filter on a `kommuneList` getter, which reads the parent's ref), Adresse (proxied Geonorge), plus `extraSuggestions` for per-map additions (oil/gas facilities on energy map, reservoir names on magasin map).
- **Kommune data:** Marker maps load from `geonorge.no/kommuneinfo/v1/kommuner`; choropleth maps use GeoJSON properties they already have.
- **Kommune center:** Marker maps resolve via `geonorge.no/stedsnavn` API; choropleth maps use GeoJSON layer bounds.
- **Dropdown:** `onMouseDown` for selection (fires before `onBlur`), 150ms blur delay, keyboard nav (↑↓ Enter Escape), `Anchor` icon for `anlegg` results and `MapPin` for everything else.
- **Input attributes:** `autoComplete="off"`, `autoCorrect="off"`, `autoCapitalize="off"`, `spellCheck={false}`, `enterKeyHint="search"`, `text-[16px] sm:text-sm` to prevent iOS zoom. `autoFocus` gated to desktop (`window.innerWidth >= 640`).
- **Icon caching:** All icon functions (`chargingIcon`, `cabinIcon`, `energyIcon`, `bubbleIcon`) cache `L.divIcon` instances by args to avoid recreating 15,000 icons per re-render.

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
- **Comparison feature:** "Sammenlign" button on compact card opens inline search or accepts map click for second kommune. Two-column comparison sheet shows kr/m² diff, all types table, side-by-side trends, and rankings

### Choropleth maps (income, vern):
- Red → Yellow → Green 3-stop diverging color scale
- Red = low/bad, green = high/good
- Optional "Bakgrunnskart" toggle (gråtone base layer)
- Skeleton shimmer loading on initial data fetch
- **Income comparison:** "Sammenlign" button on compact card opens inline search or accepts map click for second kommune. Two-column comparison sheet shows income diff, percentile bars, and vs-median stats (same pattern as bolig comparison). Uses refs (`compareModeRef`, `selectedRef`) for GeoJSON click handlers to avoid stale closures.

### Inflation dashboard (prisvekst):
- **Not a map** — standalone dashboard page at `/prisvekst`
- Hero stat cards: KPI, KPI-JAE, Styringsrente with contextual target badges ("Over målet", "Nær målet") relative to Norges Bank's 2% target
- Category breakdown: 12 KPI categories with expandable detail rows
- Trend chart: Recharts `AreaChart` with gradient fill, 2.5% reference line, KPI/KPI-JAE/Rente toggle
- Yearly chart: Recharts `BarChart` with color-coded bars (green/amber/red by threshold)
- Nordic comparison: horizontal bars for NO/SE/DK/FI/EU (Eurostat HICP)
- FAQ section with JSON-LD FAQPage schema

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

## Stedsprofil (kommune pages)

Not a map — a portrait of a place. One pre-rendered dashboard per kommune at `/kommune/[slug]`, all 357 generated via `generateStaticParams`. Sits alongside the maps as a cross-cutting "what is this place?" view.

### Data pipeline
- `scripts/build-kommune-profiles.mjs` runs in `prebuild`. Fetches SSB population (07459), income (InntektStruk13), housing prices (06035), protected areas (08936), and NVE hydro + operational wind. Reads the pre-built static files (`stations.json`, `cabins.json`, `reservoirs.json`, `schools.json`, `kommuner.geojson`, `finn-locations.json`) for the join.
- **Point-in-polygon** (inline ray-casting + bbox pre-filter, no turf dependency) assigns cabins, reservoirs, and plants to kommuner. Charging stations, schools, and kindergartens skip PIP — NOBIL and UDIR both provide `kommunenummer` / `municipalityId` directly.
- Output: `public/data/kommune-profiles.json` (~3.2 MB after schools added). Imported at build time by `src/lib/kommune-profiles.ts`; only the current kommune's subset (~5–10 KB) is inlined into each pre-rendered HTML page.
- **Rankings** (pop, income, bolig, verne, energy) are computed once at build time and stored per profile, not at runtime.
- Simplified kommune outline (~40 points) is stored per profile for the Plassering mini-map, so no client-side GeoJSON fetch is needed.

### Page sections (top to bottom)
1. **Hero** — kommune name (H1, 4xl/5xl), metadata row (fylke · knr · km²), 2 stat cards (Innbyggere, Median inntekt)
2. **Utforsk muligheter i <kommune>** — two Finn.no external-link cards (boliger + ledige jobber) with kommune-level location filter. Jobs use a separate URL format `/job/search?location=2.20001.<fylke>.<kommune>` derived from the boliger code at render time.
3. **Plassering** — interactive Leaflet map with kommune polygon highlighted, 6 toggleable layer pills below the map (Skoler, Barnehager, Kraftverk, Lading, Hytter, Magasiner). Default empty. Real `L.divIcon` markers with hover tooltips. Kart/Gråtone tile toggle top-right. `scrollWheelZoom={false}` so page scrolling isn't hijacked.
4. **Boligmarked** — 3 dwelling-type cards (Enebolig/Småhus/Blokk) with kr/m², yoy badge, sales count. Deep-links to `/bolig#kommune-<knr>`.
5. **Skoler og barnehager** — 3 stat cards (Grunnskoler, Videregående, Barnehager) with totalStudents/totalChildren context. Største skoler list with top 5. Deep-links to `/skoler?lat=&lon=&z=12`.
6. **Natur og verneområder** — verne % + DNT/fjellhytter count. Deep-links to `/vern#kommune-<knr>`.
7. **Energi** — installert MW, kraftverk count by type, magasiner, top 5 plants list. Deep-links to `/energi?lat=&lon=&z=10`.
8. **Infrastruktur** — charging stations (total + ≥50 kW), cabins. Deep-links to `/lading?lat=&lon=&z=11`.
9. **Vær akkurat nå** — client-fetched MET.no for the kommune centroid. Deep-links to `/map?lat=&lon=&z=12`.

### Card pattern (different from the maps!)
Stedsprofil cards are **vertically stacked** (value on top, label caption, context row). Intentionally distinct from the horizontal Z-pattern used on map compact cards:
- **Row 1:** big value (`text-2xl font-extrabold`, brand blue, `leading-none whitespace-nowrap`)
- **Row 2:** label (`text-xs font-semibold uppercase`, muted)
- **Row 3 (optional):** context left + badge/rank right (`text-xs text-muted-foreground`)

The big number reads first so the eye lands on the data, not the label. `whitespace-nowrap` prevents truncation on long prices like "102 899 kr/m²" in Oslo.

### Deep linking (both directions)
- **Into Stedsprofil:** map detail sheets in bolig/lonn/vern have a "Se full stedsprofil" card linking to `/kommune/<knr>-<slug>`.
- **Out of Stedsprofil:** each section's "Se fullt kart →" uses either:
  - `#kommune-<knr>` (for bolig/vern) — restores the kommune selection via `useHashSelection`
  - `?lat=<lat>&lon=<lon>&z=<z>` (for energi/lading/map) — flies the map to the centroid via the new `useInitialPosition` hook in `src/lib/use-initial-position.ts`

### Index page `/kommune`
- Searchable flat list (when query present) or grouped-by-fylke list (default)
- Client-side search via `src/components/kommune-index.tsx`
- Search matches `name` (full), `knr`, and `fylke`, normalized for Norwegian + Sami diacritics (so "kautokeino" finds "Guovdageaidnu - Kautokeino")
- Keyboard nav: ↑↓ Home End Enter Escape; first match auto-highlighted
- `role="listbox"` + `aria-activedescendant` for screen readers

### Bolig detail sheet — Finn.no integration
- `public/data/finn-locations.json` maps each `kommunenummer` → Finn's hierarchical location code (e.g. `1.20012.20194` for Eigersund, `0.20061` for Oslo as a special 2-level code)
- Generated at build time by `scripts/fetch-finn-locations.mjs` — scrapes the embedded JSON from Finn's realestate search page, disambiguates colliding names (e.g. the two "Herøy" / two "Våler") using the learned SSB-fylke → Finn-fylke prefix mapping
- Covers 356/357 kommuner (Drammen missing from Finn's taxonomy, falls back to `?q=` text search)
- Bolig detail sheet surfaces a "Boliger til salgs" card next to "Se full stedsprofil", linking to `finn.no/realestate/homes/search.html?q=<name>&location=<code>`

### WCAG contrast:
- No `/60` or `/40` opacity modifiers on text elements
- Metric numbers use `#0e7490` (cyan-700, 4.6:1) not `#0891b2` (cyan-600, 2.1:1)
- Badges use `text-foreground` on `bg-muted`, not `text-muted-foreground`

## SEO & AI Discoverability

Every new page MUST be rigged for Google Search and AI search (ChatGPT, Perplexity, Google AI Overviews). This is a hard requirement — not optional polish.

### Checklist for every new page:
1. **`export const metadata`** — unique `title` (uses layout template `%s — Datakart`) and `description` (specific, keyword-rich, Norwegian). Description should answer "what does this page show?" in one sentence.
2. **`alternates.canonical`** in metadata — required to avoid Google's "Duplicate without user-selected canonical" warning. Every page sets its own canonical path; the root layout defaults to `/`. Kommune pages set canonical dynamically via `generateMetadata`.
3. **`opengraph-image.tsx`** — dynamic OG image (Next.js ImageResponse). Shows page title + key stat on branded background. Required for social sharing and rich previews. For dynamic routes like `/kommune/[slug]`, the OG image is also generated dynamically per slug.
4. **`sitemap.ts`** — add the route with appropriate `priority` and `changeFrequency`. Dynamic routes should enumerate all slugs (`/kommune/[slug]` adds all 357 kommune URLs).
5. **JSON-LD** — the root layout has WebSite schema. Add page-specific schema (e.g., `Dataset`, `Map`, `Place`) if the page has structured data that search engines can index. Kommune pages emit `@type: Place` with `geo`, `containedInPlace`, and `additionalProperty` per stat.
6. **Semantic HTML** — use proper heading hierarchy (h1 → h2 → h3). Screen readers and crawlers use this.
7. **Norwegian language** — all user-facing text in Norwegian (bokmål). `<html lang="no">` is set in layout. Descriptions, labels, and error messages should be Norwegian.

### What exists today:
- `src/app/layout.tsx` — global metadata (title template, description, metadataBase, canonical default, openGraph, twitter card), JSON-LD WebSite schema
- `src/app/sitemap.ts` — all pages with priority/frequency + 357 kommune URLs pulled from `getAllKommuner()`
- `src/app/robots.ts` — allows all crawlers, points to sitemap
- `src/app/*/opengraph-image.tsx` — dynamic OG images per page (including per-slug for kommune pages)
- Canonical URLs site-wide via `alternates.canonical` (resolves against `metadataBase`)
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

### Brand colors (one primary blue — use everywhere)
- `--kv-blue: #24374c` — THE brand color. Headers, icons, metric numbers, selected states, buttons
- `--kv-blue-dark: #0f1923` — dark variant (OG image backgrounds)
- `--kv-blue-light: #eae8e3` — warm off-white (page backgrounds)

### Semantic colors (use these, NOT hardcoded Tailwind colors)
- `--kv-positive: #16a34a` — good/up/available (green)
- `--kv-positive-light: #f0fdf4` — positive badge background
- `--kv-negative: #dc2626` — bad/down/error (red)
- `--kv-negative-light: #fef2f2` — negative badge background
- `--kv-warning: #d97706` — caution/moderate (amber)
- `--kv-warning-light: #fffbeb` — warning badge background
- `--kv-metric: #24374c` — hero numbers (same as brand blue)
- `--kv-muted-fill: #e3ddd4` — empty/no-data fills on maps

### Rules
- **DO NOT** use hardcoded hex for positive/negative — use `var(--kv-positive)` and `var(--kv-negative)`
- **DO NOT** mix multiple greens/reds — one green (#16a34a), one red (#dc2626)
- **DO NOT** use `#003da5` — this was the old brand blue, replaced by `#24374c`
- **Tailwind semantic classes OK** for backgrounds: `bg-green-50`, `bg-red-50` (these are light tints, not brand colors)
- **Metric numbers** always use `style={{ color: "var(--kv-blue)" }}` or `var(--kv-metric)`

### Component patterns
- Card style: `bg-card rounded-2xl shadow-sm border px-4 py-4` (hover: `shadow-md`)
- Modal style: `bg-background rounded-2xl shadow-xl border w-full max-w-sm p-5`
- Floating pill: `bg-background/90 backdrop-blur-sm border rounded-full px-4 py-2 shadow-lg`
- Primary CTA button: `text-white rounded-xl` with `style={{ background: "var(--kv-blue)" }}`
- Secondary button: `border bg-muted/50 hover:bg-muted rounded-xl`

## Data Sources
| Data | Source | Cache |
|------|--------|-------|
| Charging stations | NOBIL / Enova (datadump API) | Build-time static JSON (requires NOBIL_API_KEY) |
| Charging status | NOBIL Real-time (Enova WebSocket) | Live via WebSocket (requires ENOVA_RT_API_KEY) |
| Cabins | OpenStreetMap (Overpass) | Build-time static JSON + client fallback |
| Wind + hydro power | NVE ArcGIS (Vindkraft2 layers 0/1/2/4/8, Vannkraft1 layer 0) | 1h server cache via API route |
| Oil/gas facilities | Sodir FactMaps (layer 307 + pipelines 311) | 1h server cache via API route |
| Oil/gas production | Sodir FactPages (yearly field production CSV) | Build-time static JSON |
| Reservoirs | NVE ArcGIS (Vannkraft1 layer 6 — Magasin) | 1h server cache via API route |
| River observations | NVE HydAPI (discharge, water level, percentiles) | Per-request (requires NVE_API_KEY) |
| Housing prices | SSB tabell 06035 (Selveierboliger) | 24h server cache via API route |
| Population (Stedsprofil) | SSB tabell 07459 | Build-time static JSON |
| Income | SSB InntektStruk13 | Loaded once on mount |
| Protected areas | SSB tabell 08936 | Loaded once on mount |
| Schools | Utdanningsdirektoratet NSR (`data-nsr.udir.no/v3`) — list + per-orgnr detail calls for coords | Build-time static JSON |
| Kindergartens | Utdanningsdirektoratet NBR (`data-nbr.udir.no/v3`) — same shape as NSR | Build-time static JSON |
| Finn.no location codes | Scraped from `finn.no/realestate/homes/search.html` (embedded JSON) | Build-time static JSON |
| Weather | MET.no locationforecast | 30min server cache |
| Elevation | Kartverket høyde-API | Per-request |
| Kommune boundaries | GitHub (robhop/fylker-og-kommuner) | Build-time static GeoJSON |
| Address search | Geonorge adresser API (via `/api/sok` proxy) | 1h edge cache + 24h SWR |
| Kommune list | Geonorge kommuneinfo API | Loaded once on mount |
| Inflation (KPI) | SSB tabell 03013 + 05327 | Loaded once on mount |
| Policy rate | Norges Bank API | Loaded once on mount |
| Nordic HICP | Eurostat | Loaded once on mount |
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
