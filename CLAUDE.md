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
  vindkraft/page.tsx    — Wind power plants map (unlisted deep link, not in nav/sitemap)
  kommune/page.tsx      — Kommuner index (searchable list grouped by fylke, keyboard nav)
  kommune/[slug]/page.tsx — Stedsprofil (dashboard per kommune, SSG at build time)
  kommune/[slug]/opengraph-image.tsx — Dynamic OG image per kommune
  skoler/page.tsx       — Schools and kindergartens map (NSR + NBR from UDIR)
  helse/page.tsx        — Fastlege choropleth (SSB 12005) with optional OSM overlay for sykehus/legevakt
  kostnader/page.tsx    — Cost-of-living choropleth: kommunale gebyrer (SSB 12842) + eiendomsskatt (SSB 14674) with Sammenlign feature
  kostnader/opengraph-image.tsx — Dynamic OG image for /kostnader
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
  *-map-loader.tsx      — Dynamic import wrappers (ssr: false), all include MapLoading skeleton
  energy-detail-sheets.tsx — Extracted detail sheets for energy plant, oil/gas, and havvind
  energy-map-helpers.tsx — Shared energy map helpers, icon factories, and re-exports shared TILE_LAYERS/TileLayerKey
  health-detail-sheet.tsx — Extracted detail sheet + sub-components for /helse
  health-map-helpers.ts — Shared types, constants, and helpers for /helse
  kostnader-detail-sheets.tsx — Extracted detail + comparison sheets for /kostnader
  kostnader-map-helpers.ts — Shared types, constants, and helpers for /kostnader
  inflation-dashboard.tsx — Prisvekst dashboard (Recharts charts, target badges, category breakdown)
  kommune-index.tsx     — Client component for /kommune index search + list (keyboard nav, Sami-aware)
  kommune-mini-map.tsx  — Interactive Leaflet map for Stedsprofil "Plassering" section (polygon + 6 layer pills)
  kommune-mini-map-loader.tsx — Dynamic wrapper for kommune-mini-map (ssr: false)
  kommune-weather.tsx   — Client weather card for Stedsprofil (fetches /api/weather)
  schools-map.tsx       — /skoler map: schools + kindergartens with independent cluster toggles
  schools-map-loader.tsx — Dynamic wrapper for schools-map (ssr: false)
  health-map.tsx        — /helse map: fastlege choropleth (3 metric segmented control) + optional OSM marker overlay with click-to-details compact card. Detail sheet in health-detail-sheet.tsx
  health-map-loader.tsx — Dynamic wrapper for health-map (ssr: false)
  kostnader-map.tsx     — /kostnader map: cost-of-living choropleth (2 metric segmented control: gebyrer total + eiendomsskatt 120 m²). "Ingen eiendomsskatt" rendered as positive light-green fill. Detail + comparison sheets in kostnader-detail-sheets.tsx
  kostnader-map-loader.tsx — Dynamic wrapper for kostnader-map (ssr: false)
  home-kommune-search.tsx — Client component on landing hero: diacritic-aware autocomplete over all 357 kommuner, keyboard nav, routes directly to /kommune/[slug]. Data loaded at build time via server-component prop passing
  footer.tsx            — Shared footer with three-column layout (brand / Utforsk grouped by theme / Ressurser)
  map-icons.tsx         — Shared L.divIcon factories: chargingIcon, cabinIcon, reservoirIcon, schoolIcon, kindergartenIcon, healthIcon + re-exports of energyIcon from energy-map-helpers
  ui/                   — shadcn/ui primitives (includes chart.tsx for Recharts wrappers)

src/lib/
  fylker.ts             — Hardcoded 15 counties with coords + zoom, isInNorway(), OSLO default
  map-utils.tsx         — Shared map infrastructure: TILE_LAYERS + KV_ATTRIBUTION (tile URL constants), useMapCore (loading/error/tile state), useGeolocation (navigator + fallback), useCompare<T> (Sammenlign state machine), FlyTo, interpolateColor, DataDisclaimer, shared types (Suggestion, Address, KommuneEntry, TileLayerKey), useDebounceRef, useSearchAbort
  use-hash-selection.ts — URL hash deep linking hook for selection state (#kommune-<id>, #station-<id>, etc.)
  use-initial-position.ts — Reads ?lat=&lon=&z= on mount and fires a callback (deep linking from Stedsprofil to maps)
  kommune-profiles.ts   — Reads public/data/kommune-profiles.json, exports getProfileBySlug / getAllKommuner / getTotals. Module-level cache is **mtime-invalidated** — re-stats the file on each load and reloads when the JSON's mtime changes, so rebuilding profiles via `build-kommune-profiles.mjs` in a running dev server is picked up automatically.
  kommune-slug.ts       — Pure function that mirrors the build-time slugify logic (knr-name) for client-side URL construction
  health-summary.ts     — Shared `synthesizeHealth()` helper used on /helse and Stedsprofil — turns 3 fastlege metrics into a plain-Norwegian one-line sentence with good/mixed/bad/neutral tone
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
  fetch-health.mjs      — Build-time: Overpass query (scoped to Norway via `area["ISO3166-1"="NO"]`) for `amenity=hospital` and `amenity=clinic`, classifies into sykehus / legevakt / privatklinikker → public/data/health.json
  build-kommune-profiles.mjs — Build-time: composes SSB population/income/bolig/vern/fastlege (12005) + kommunale gebyrer (12842) + eiendomsskatt (14674) + eierstatus (11084) + boligtyper (06265) + utdanningsnivå (09429) + NVE plants + UDIR schools/barnehager + static files via point-in-polygon and kommunenummer grouping into one profile per kommune → public/data/kommune-profiles.json + public/data/fastlege.json + public/data/kostnader.json. Also calls `generateSnapshot()` from `generate-snapshot.mjs` for each profile so the 3-sentence narrative is baked into the output JSON.
  generate-snapshot.mjs — Pure (no fetches) helper imported by build-kommune-profiles.mjs. Takes a profile + rank totals and returns a `string[]` of 3 sentences: rule-based notability scoring picks the top 3 distinct themes from ~12 candidates (bolig / gebyr / income / vern / hytter / sykehus / fastlege / skoler / demografi-eier / demografi-boliger / demografi-utdanning / geografisk filler). Templates are deliberately factual — never LLM-generated.

public/data/
  stations.json         — Pre-built charging station data (committed to repo)
  cabins.json           — Pre-built cabin data (committed to repo)
  production.json       — Pre-built Sodir yearly field production data (committed to repo)
  reservoirs.json       — Pre-built NVE reservoir polygons (committed to repo)
  kommuner.geojson      — Pre-built kommune boundary GeoJSON (committed to repo)
  finn-locations.json   — Pre-built kommune → Finn.no location code map (committed to repo)
  schools.json          — Pre-built NSR + NBR data (schools and barnehager with coordinates)
  health.json           — Pre-built OSM health data (sykehus + legevakt + privatklinikker, optional overlay on /helse)
  fastlege.json         — Pre-built SSB 12005 fastlege data — all 357 kommuner, 18 metrics latest year + trend for 3 primary. Consumed by /helse choropleth
  kostnader.json        — Pre-built cost-of-living data — all 357 kommuner, gebyrerTotal (SSB 12842) + eiendomsskatt120m2 / Promille (SSB 14674) + full gebyr breakdown per kommune. Consumed by /kostnader choropleth
  kommune-profiles.json — Pre-built per-kommune profile data for Stedsprofil (committed to repo)
```

## Map Architecture Patterns

### Four data loading patterns:
1. **Build-time static** (charging, cabins, production, reservoirs, kommuner) — Data fetched at build time, saved as static JSON/GeoJSON, loaded on mount
2. **Preload on mount** (income, vern, bolig) — API call loads ALL data, renders everything client-side
3. **Per-request** (elevation, weather) — Fetch on user interaction
4. **Real-time WebSocket** (charging status) — API route fetches temporary WSS URL from Enova, client connects and receives live updates. Status stored in ref (not state) to avoid re-rendering all markers. Auto-reconnects every 30s (JWT expires ~60s).

### Build-time data pipeline:
- `scripts/fetch-stations.mjs`, `scripts/fetch-cabins.mjs`, `scripts/fetch-production.mjs`, `scripts/fetch-reservoirs.mjs`, `scripts/fetch-kommuner.mjs`, `scripts/fetch-finn-locations.mjs`, `scripts/fetch-schools.mjs`, `scripts/fetch-health.mjs`, and `scripts/build-kommune-profiles.mjs` run as `prebuild` hook
- Overpass scripts try 3 mirrors with retry; if all fail, keeps existing data
- Frontend has client-side Overpass fallback if static file is empty
- Production script fetches yearly CSV from Sodir FactPages (~205 KB, 130 fields)
- **Vercel's 10s timeout prevents runtime Overpass calls for large bbox queries**
- **To seed data locally:** `node scripts/fetch-stations.mjs && node scripts/fetch-cabins.mjs && node scripts/fetch-production.mjs && node scripts/fetch-reservoirs.mjs && node scripts/fetch-kommuner.mjs && node scripts/fetch-finn-locations.mjs && node scripts/fetch-schools.mjs && node scripts/fetch-health.mjs && node scripts/build-kommune-profiles.mjs`

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
- **Income comparison:** "Sammenlign" button on compact card opens inline search or accepts map click for second kommune. Two-column comparison sheet shows income diff, percentile bars, and vs-median stats (same pattern as bolig comparison). Uses the shared `useCompare<T>` hook from `map-utils.tsx` which manages comparison state, refs for GeoJSON click handlers, and inline search filtering.

### Helsetilbud map (helse):
- **Kommune choropleth** built from SSB 12005 (`fastlege.json`). Segmented-control metric selector at the top — same visual pattern as /bolig's boligtype toggle. Three primary metrics:
  - `KOSreservekapasi0000` — "Ledig kapasitet" — SSB's `reservekapasitet` index is centered on 100 (100 = kapasitet matches listelengde). Diverging color scale **clamped to [85, 115]** via a custom `colorFor()` — below 100 red (overbooket), above 100 green (ledig plass). Displayed everywhere as signed percent: the raw 105 renders as `+5 %`, raw 98 as `−2 %`.
  - `KOSandelpasiente0000` — "Uten fastlege" — linear scale, `invertColor: true` so 0 % = green.
  - `KOSgjsnlisteleng0000` — "Pasienter per lege" — linear scale, `invertColor: true` so shorter lists = green.
- **Plain-language synthesis** via `synthesizeHealth()` in `src/lib/health-summary.ts`. Input: the 3 primary metric values. Output: `{ tone: "good"|"mixed"|"bad"|"neutral", sentence }`. Used identically on /helse detail sheet AND Stedsprofil Helsetilbud — same wording in both places.
- **Optional OSM overlay** toggled via the map legend's "OSM-markører" button. When active, sykehus + legevakt markers from `health.json` render on top of the choropleth. Clicking a marker **steals the compact card slot** from any active kommune selection and shows an OSM compact card (type, operator, OSM timestamp, Ring + Se i OSM actions). Toggling the overlay off clears any pending OSM selection. Privatklinikker are in the data file but not in the overlay.
- **Detail sheet** on "Vis mer" uses `initialFocus={detailSheetTopRef}` on the base-ui Dialog Popup — this is critical because base-ui's default focus trap focuses the first tabbable link which is near the bottom, scrolling the hero off-screen. Structural fix, not a scroll-reset race.
- **Trend bar chart** mirrors the bolig detail sheet's inline div pattern (`flex items-end gap-[2px] h-12`). Raw SSB values are rebased to `value - min` per series so the year-to-year shape is visible within the narrow 85–120 band. Latest-year bar at full opacity, others at 0.3.
- **18-metric stat table** in the detail sheet — each row shows the SSB label, a one-line plain-Norwegian description from `METRIC_DESCRIPTION` (in `health-map-helpers.ts`), and the formatted value. Primary metric rows get a muted background tint.

### Kostnader map (kostnader):
- **Kommune choropleth** built from `kostnader.json` (SSB 12842 + 14674). Two-metric segmented control via a bottom sheet (same pattern as /helse):
  - `gebyrerTotal` — sum of vann + avløp + avfall + feiing årsgebyr in kr/year. Every kommune has this.
  - `eiendomsskatt120m2` — SSB's standardized annual bill for a 120 m² enebolig. ~250/357 kommuner have this number; the rest either have the tax but not the standardized calc (fall back to promille in the detail sheet) or don't levy it on homes at all.
- **"Ingen eiendomsskatt" as a positive fill**: kommuner with `hasEiendomsskatt === false` render in `--kv-positive-light` with full opacity — distinct from "no data" (muted gray) — because "no property tax" is good news for the reader, not missing data. Dedicated legend swatch explains this on the eiendomsskatt metric view.
- **Sammenlign (comparison) sheet** uses the shared `useCompare<T>` hook from `map-utils.tsx` for the full comparison state machine (same as bolig/lonn). The combined-total diff (`gebyrerTotal + eiendomsskatt120m2`) is the hero of the compare sheet — answers "how much more or less would you pay per year in X vs Y?" Kommuner without eiendomsskatt contribute 0 to the combined total (correct behavior — they save you that money).
- **Detail sheet** shows 2 primary stat cards + the four-fee breakdown (Vann/Avløp/Avfall/Feiing) as a mini stat list. Eiendomsskatt card has three render states: "Ingen" (positive-dark text on card), kr/år for a 120 m² house, or promille-only fallback with an italic "Kun promille rapportert" note.
- **Year mismatch is intentional**: gebyrer uses the latest year with ≥150 kommuner populated (typically current year's preliminary SSB release); eiendomsskatt uses the latest year where `KOSskattenebolig0000` has coverage (stopped publishing after 2024). Both years are surfaced in the header strip and detail-sheet footer so the reader can see which data vintage they're looking at.

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

### Shared map hooks (src/lib/map-utils.tsx):
- **TILE_LAYERS / TILE_URL_KART / TILE_URL_GRAATONE / KV_ATTRIBUTION** — Single source of truth for Kartverket tile URLs and attribution. All 12 maps import from here instead of defining local copies. Elevation map composes its custom `terreng` layer from the shared kart URL.
- **useMapCore(defaultTile?)** — Returns `{ loading, setLoading, error, setError, tileLayer, setTileLayer }`. Used by 11/12 maps (elevation is the exception — it has granular per-action loading). Choropleths destructure only `loading`/`error` and manage `showBase` locally.
- **useGeolocation(onSuccess, onError?)** — Returns `{ locating, locateError, locate }`. Handles navigator.geolocation with auto-dismiss error toast (4s). Used by 6 marker maps. Each caller provides its own success/error callbacks for map-specific zoom and fallback (OSLO vs Jotunheimen vs handleMapClick).
- **useCompare<T>(selected, getId, getFeatures, hasData)** — Full comparison state machine for "Sammenlign" feature. Returns compare state, refs for GeoJSON closures, filtered search results, and action functions (activateCompare, selectTarget, cancelCompare, resetCompare, closeCompareSheet, handleCompareClick). Used by bolig, income, and kostnader maps. Generic over T so each map uses its own selected-kommune type.

## Stedsprofil (kommune pages)

Not a map — a portrait of a place. One pre-rendered dashboard per kommune at `/kommune/[slug]`, all 357 generated via `generateStaticParams`. Sits alongside the maps as a cross-cutting "what is this place?" view.

### Data pipeline
- `scripts/build-kommune-profiles.mjs` runs in `prebuild`. Fetches SSB population (07459), income (InntektStruk13), housing prices (06035), protected areas (08936), fastlege (12005), kommunale gebyrer (12842), eiendomsskatt (14674), eierstatus (11084), boligtyper (06265), utdanningsnivå (09429), and NVE hydro + operational wind. Reads the pre-built static files (`stations.json`, `cabins.json`, `reservoirs.json`, `schools.json`, `health.json`, `kommuner.geojson`, `finn-locations.json`) for the join.
- **Point-in-polygon** (inline ray-casting + bbox pre-filter, no turf dependency) assigns cabins, reservoirs, plants, and OSM health markers to kommuner. Charging stations, schools, and kindergartens skip PIP — NOBIL and UDIR both provide `kommunenummer` / `municipalityId` directly.
- Output: `public/data/kommune-profiles.json` (~3.9 MB after fastlege + demografi added) and `public/data/fastlege.json` (~340 KB, flat 357-kommuner × 18-metric table consumed by the /helse choropleth). Imported at build time by `src/lib/kommune-profiles.ts`; only the current kommune's subset (~5–10 KB) is inlined into each pre-rendered HTML page.
- **Rankings** (pop, income, bolig, boligEnebolig, verne, energy, reservekapasitet, andelUtenLege, listelengde, gebyrTotal) are computed once at build time and stored per profile, not at runtime. `boligEnebolig` uses the 01→02→03 priority so the enebolig price shown in the snapshot stays consistent with its rank label.
- Simplified kommune outline (~40 points) is stored per profile for the Plassering mini-map, so no client-side GeoJSON fetch is needed.
- **Snapshot** is generated at build time via `scripts/generate-snapshot.mjs`. Rule-based notability scoring picks the 3 most distinctive facts per kommune from ~12 candidate templates across themes `economy / boforhold / utdanning / services / health / nature / energy / geography`. Baked into `profile.snapshot: string[]` so it's pre-rendered HTML with zero runtime cost. Never LLM — templates only, deliberately factual voice.
- `src/lib/kommune-profiles.ts` caches the JSON in a module-level variable **with mtime invalidation** — it re-stats the file on each `load()` call and reloads when the mtime changes. Rebuilding profiles no longer requires a dev-server restart.

### Page sections (top to bottom)
1. **Hero** — kommune name (H1, 4xl/5xl), metadata row (fylke · knr · km²), 2 stat cards (Innbyggere, Median inntekt), followed by an **Automatisk sammendrag** card: Sparkles icon + 3-sentence narrative generated at build time from `profile.snapshot`, plus a "kan inneholde feil" disclaimer. Deliberately not LLM — rule-based templates.
2. **Utforsk muligheter i <kommune>** — two Finn.no external-link cards (boliger + ledige jobber) with kommune-level location filter. Jobs use a separate URL format `/job/search?location=2.20001.<fylke>.<kommune>` derived from the boliger code at render time.
3. **Plassering** — interactive Leaflet map with kommune polygon highlighted, 6 toggleable layer pills below the map (Skoler, Barnehager, Kraftverk, Lading, Hytter, Magasiner). Default empty. Real `L.divIcon` markers with hover tooltips. **Defaults to Gråtone tile** with a Kart/Gråtone toggle top-right, blue polygon (`#2563eb` stroke + 18% fill) so the kommune pops against the muted basemap. `scrollWheelZoom={false}` so page scrolling isn't hijacked.
4. **Boligmarked** — 3 dwelling-type cards (Enebolig/Småhus/Blokk) with kr/m², `YoyBadge` showing `±X % fra <prevYear>` (same format as the /bolig chip), and sales count with the latest SSB year. Deep-links to `/bolig#kommune-<knr>`.
5. **Hva koster det å bo her?** — Eiendomsskatt card (kr for a standardized 120 m² enebolig, with "Ingen" pill when a kommune has not introduced property tax on homes) + `GebyrCard` (dedicated card that replaces the truncating generic Stat — 2×2 grid showing Vann/Avløp/Avfall/Feiing with `kr` suffix so no fee gets cut off). Sources: SSB 12842 + 14674.
6. **Demografi** — three stacked-bar cards (Eierforhold / Boligtyper / Utdanningsnivå) with blue-gradient segments and a legend showing each category's exact percent. Not derived — reads straight from `profile.demografi` (SSB 11084 + 06265 + 09429). Mirrors the raw data the snapshot generator samples from, so the reader can see the full distribution, not just the surfaced outlier.
7. **Skoler og barnehager** — 3 stat cards (Grunnskoler, Videregående, Barnehager) with totalStudents/totalChildren context. Største skoler list with top 5. Deep-links to `/skoler?lat=&lon=&z=12`.
8. **Helsetilbud** — Plain-language synthesis line (from `synthesizeHealth()`) + 3 stat cards (Ledig kapasitet, Uten fastlege, Pasienter per lege) with ranks, plus an "Utvikling siden 2018" delta. Deep-links to `/helse#kommune-<knr>`. Source: SSB 12005.
9. **Natur og verneområder** — verne % + DNT/fjellhytter count. Deep-links to `/vern#kommune-<knr>`.
10. **Energi** — installert MW, kraftverk count by type, magasiner, top 5 plants list. Deep-links to `/energi?lat=&lon=&z=10`.
11. **Infrastruktur** — charging stations (total + ≥50 kW), cabins. Deep-links to `/lading?lat=&lon=&z=11`.
12. **Vær akkurat nå** — client-fetched MET.no for the kommune centroid. Deep-links to `/map?lat=&lon=&z=12`.
13. **Lignende kommuner** — 3 compact cards showing kommuner with the closest combined (population rank, income rank) distance using Manhattan on rank-space. Uses `findSimilar()` helper inline in `kommune/[slug]/page.tsx`. Each card links to that kommune's Stedsprofil — discovery feature for users to jump to comparable places.

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
- `src/app/*/opengraph-image.tsx` — dynamic OG images per page (including root landing page and per-slug for kommune pages)
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

Three-tier convention: `-light` for the background tint, base for icons/borders/solid fills against white, and `-dark` for text on the matching `-light` background (the base tokens only reach ~3:1 on their own tint — use `-dark` for anything small).

- `--kv-positive: #16a34a` — good/up/available (green)
- `--kv-positive-light: #f0fdf4` — positive badge background
- `--kv-positive-dark: #166534` — positive text on positive-light bg (≥6.8:1 AA)
- `--kv-negative: #dc2626` — bad/down/error (red)
- `--kv-negative-light: #fef2f2` — negative badge background
- `--kv-negative-dark: #991b1b` — negative text on negative-light bg (≥7.6:1 AA)
- `--kv-warning: #d97706` — caution/moderate (amber)
- `--kv-warning-light: #fffbeb` — warning badge background
- `--kv-warning-dark: #92400e` — warning text on warning-light bg (≥6.8:1 AA)
- `--kv-info: #2563eb` — informational (blue, e.g. "heads up" banners)
- `--kv-info-light: #eff6ff` — info badge background
- `--kv-info-dark: #1e40af` — info text on info-light bg (≥8.0:1 AA)
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
| Fastlege data | SSB tabell 12005 (Fastlegelister og fastlegekonsultasjoner) — 18 metrics per kommune 2015–2025 | Build-time static JSON |
| Kommunale gebyrer | SSB tabell 12842 (vann, avløp, avfall, feiing) — årsgebyr ekskl. mva. per kommune | Build-time static JSON |
| Eiendomsskatt | SSB tabell 14674 (KOSTRA-data) — has-skatt flag + standardized 120 m² bill + promille per kommune | Build-time static JSON |
| Sykehus + legevakt | OpenStreetMap (Overpass, `amenity=hospital`/`clinic`, classified via name + tags, scoped to Norway via `area["ISO3166-1"="NO"]`) | Build-time static JSON |
| Eierstatus (boforhold) | SSB tabell 11084 — % selveier / andelseier / leier per kommune | Build-time static JSON |
| Boligtyper | SSB tabell 06265 — antall boliger per bygningstype (enebolig/småhus/blokk/...) per kommune, konvertert til prosent på byggetidspunktet | Build-time static JSON |
| Utdanningsnivå | SSB tabell 09429 — % grunnskole / vgs / fagskole / UH kort / UH lang per kommune | Build-time static JSON |
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
