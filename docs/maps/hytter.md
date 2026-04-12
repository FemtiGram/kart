# Turisthytter

Shows mountain huts and wilderness cabins across Norway. Data is pre-fetched at build time from OpenStreetMap. Each cabin can be selected to see capacity, elevation, season, operator, and weather.

Route: `/hytter`

---

## Data Sources

| Source | Endpoint | Data | Cache |
|--------|----------|------|-------|
| OpenStreetMap (Overpass API) | `overpass-api.de/api/interpreter` (primary) | All nodes and ways tagged `tourism=alpine_hut` or `tourism=wilderness_hut` in Norway | Build-time static JSON |
| Overpass mirror 1 | `overpass.kumi.systems/api/interpreter` | Fallback | Build-time |
| Overpass mirror 2 | `maps.mail.ru/osm/tools/overpass/api/interpreter` | Fallback | Build-time |
| MET.no locationforecast | Via `/api/weather` | Current weather at selected cabin | 30min server cache |

The Overpass query covers the bounding box `57.5,4.0,71.5,31.5` and uses `out center body` to obtain centroid coordinates for way elements (polygons representing large cabin buildings).

### OSM tags extracted

| Tag | Field | Notes |
|-----|-------|-------|
| `name` | `name` | Falls back to "Ukjent hytte" |
| `operator` | `operator` | |
| `tourism` | `cabinType` | `alpine_hut` → "fjellhytte", `wilderness_hut` → "ubetjent" |
| `operator` (regex match) | `isDNT` | True if operator contains "turistforening" or "dnt" (case-insensitive) |
| `ele` | `elevation` | Integer metres, null if absent |
| `beds` or `capacity` | `beds` | Integer, prefers `beds` |
| `website` or `contact:website` | `website` | |
| `description` | `description` | |
| `fee` | `fee` | Boolean: true if "yes", false if "no", null otherwise |
| `opening_hours` | `season` | Normalized: "Helårs" for 24/7 or year-round patterns |
| `phone` or `contact:phone` | `phone` | |
| `shower` | `shower` | Boolean |

Cabin records with `lat === 0 && lon === 0` are filtered out (malformed way elements without center coordinates).

---

## Data Flow

### Build time

```
npm run prebuild
  → scripts/fetch-cabins.mjs
      → Overpass query (nodes + ways, bounding box: 57.5,4.0,71.5,31.5)
      → Up to 3 attempts across 3 mirror endpoints
      → 3-second wait between retries
      → If all fail: keeps existing public/data/cabins.json unchanged
      → On success: writes public/data/cabins.json
```

### Runtime (client)

```
Component mounts
  → fetch /data/cabins.json (static file)
  → If array is non-empty: set state, done
  → If empty or fetch fails:
      → Show fallback message
      → Attempt local-area Overpass query around Jotunheimen
      → If that also fails: show error pill

User selects cabin marker
  → fetch /api/weather?lat=...&lon=...
  → Weather data shown in compact card and detail sheet
```

The client fallback for cabins uses Jotunheimen as the fallback center since that is the densest cabin area in Norway.

---

## Error Handling

- Build-time: if all three Overpass endpoints fail, `cabins.json` is kept unchanged. The build continues.
- Runtime: client-side fallback queries a local area if the static file is empty.
- Weather fetch failures are handled per-cabin: missing weather data is shown as "–" rather than an error state.
- Floating error pill with "Prøv igjen" retry if both static file and fallback fail.

---

## Caching

| Level | TTL | Mechanism |
|-------|-----|-----------|
| Static cabin data | Until next build | `public/data/cabins.json` regenerated on each build |
| Weather | 30 minutes | `next: { revalidate: 1800 }` in `/api/weather` |
| Client | Page session | Data held in React state |

---

## Map Features

### Cabin types

Two visual categories:
- **Fjellhytte** (`tourism=alpine_hut`): serviced mountain huts, typically staffed with meals and beds
- **Ubetjent** (`tourism=wilderness_hut`): self-service wilderness cabins, unstaffed

DNT-operated cabins (`isDNT: true`) are visually distinguished from privately operated ones.

### Markers and clustering

All cabins use `L.divIcon` markers with a house icon. Clustered using `react-leaflet-cluster` with amber cluster bubbles (`#b45309`). Cluster sizes: 36px (< 100), 44px (100–499), 52px (500+).

Marker appearance:
- Fjellhytte: filled house icon
- Ubetjent: outline house icon
- Normal tile layer: white background, colored icon
- Gråtone tile layer: colored background, white icon (inverted)
- Icon size: 26–30px depending on type

`L.divIcon` instances are cached by `(cabinType, isDNT, isSelected, inverted)` key.

### Card pattern

**Compact card** (floating, bottom-center):
- Badges: cabin type, DNT status, season
- Name, operator
- Key metric: elevation (m.a.s.l.), bed count
- Current weather: temperature, wind speed, symbol
- "Vis mer" and "Kjør hit" buttons

**Detail sheet** opened by "Vis mer":
- Full identity: name, operator, type, DNT status
- Elevation, beds, fee status, shower availability
- Season / opening hours
- Full weather: temperature, wind, precipitation, symbol icon
- Website link, phone number, yr.no forecast link
- Source: OpenStreetMap and MET.no attribution

### Tile layers

Toggle between Kart (Kartverket topo) and Gråtone (Kartverket topograatone). Default is Kart.

### Search

3-tier search: Fylke (3 results), Kommune (5 results), Adresse (2 results). 150ms debounce. Address lookups go through the cached `/api/sok` proxy. Abort controller. "Min posisjon" with `isInNorway()` fallback to Jotunheimen.

---

## Known Limitations

- OSM data quality for cabins varies widely. Many cabins lack elevation, bed count, opening hours, or website tags.
- The `isDNT` detection is a regex match on the `operator` field and may produce false positives or miss non-standard spellings.
- Opening hours normalization handles only common OSM `opening_hours` patterns. Complex conditional expressions are passed through unchanged.
- The static file is only updated on each build. New cabins added to OSM after the last build will not appear until the next deployment.
- Weather is fetched per-cabin on demand. It is only shown after a cabin is selected, not pre-loaded for all cabins.