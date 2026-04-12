# Ladestasjoner

Shows all electric vehicle charging stations in Norway. Data is pre-fetched at build time from OpenStreetMap and served as a static JSON file; the frontend has a client-side fallback to Overpass if the static file is empty.

Route: `/lading`

---

## Data Sources

| Source | Endpoint | Data | Cache |
|--------|----------|------|-------|
| OpenStreetMap (Overpass API) | `overpass-api.de/api/interpreter` (primary) | All nodes tagged `amenity=charging_station` in Norway bounding box | Build-time static JSON |
| Overpass mirror 1 | `overpass.kumi.systems/api/interpreter` | Fallback if primary fails | Build-time |
| Overpass mirror 2 | `maps.mail.ru/osm/tools/overpass/api/interpreter` | Fallback if mirror 1 fails | Build-time |

The Overpass query covers the bounding box `57.5,4.0,71.5,31.5` (Norway lat/lon extents) using a 60-second query timeout.

### OSM tags extracted

| Tag | Field | Notes |
|-----|-------|-------|
| `name` or `operator` | `name` | Falls back to "Ladestasjon" if both absent |
| `operator` | `operator` | |
| `capacity` | `capacity` | Integer, null if absent |
| `socket:type2` | `connectors` | Included if value is not `"no"` |
| `socket:chademo` | `connectors` | Mapped to "CHAdeMO" |
| `socket:type2_combo` | `connectors` | Mapped to "CCS" |
| `socket:type1` | `connectors` | Mapped to "Type 1" |
| `socket:schuko` | `connectors` | Mapped to "Schuko" |
| `socket:type3c` | `connectors` | Mapped to "Type 3C" |
| `addr:street`, `addr:housenumber`, `addr:city` | `address` | Joined with spaces |

---

## Data Flow

### Build time

```
npm run prebuild
  → scripts/fetch-stations.mjs
      → Overpass query (bounding box: 57.5,4.0,71.5,31.5)
      → Up to 3 attempts across 3 mirror endpoints
      → 3-second wait between retries
      → If all fail: keeps existing public/data/stations.json unchanged
      → On success: writes public/data/stations.json
```

The script runs as a `prebuild` npm hook, so it executes automatically before every `npm run build`. Running `node scripts/fetch-stations.mjs` manually refreshes the file on demand.

### Runtime (client)

```
Component mounts
  → fetch /data/stations.json (static file)
  → If array is non-empty: set state, done
  → If empty or fetch fails:
      → Show message "Dataen er ikke ferdig cachet ennå..."
      → Fallback: fetch local-area stations from Overpass
          → Overpass query around Oslo (±0.45° lat/lon)
          → 10-second timeout
          → If this also fails: show error pill
```

The client-side fallback only fetches a small local area (roughly 50 km radius around Oslo) because Vercel's 10-second serverless timeout prevents runtime full-country Overpass queries.

### Norway boundary filter

The `isInNorwayApprox` function in `charging-map.tsx` filters out stations outside Norway's approximate borders. The logic uses latitude/longitude thresholds that vary by latitude to account for Norway's shape and the Finnish/Swedish border in Finnmark.

---

## Error Handling

- Build-time: if all three Overpass endpoints fail, the existing `stations.json` is kept unchanged. A console warning is printed but the build continues.
- Runtime: if `/data/stations.json` is empty, the component attempts a local-area Overpass fallback and shows an informational message to the user.
- If both static and fallback fetches fail: floating error pill with "Prøv igjen" retry button.
- Connector filter sheet and info sheet auto-close each other.

---

## Caching

| Level | TTL | Mechanism |
|-------|-----|-----------|
| Static file | Until next build | `public/data/stations.json` committed to repo and regenerated on each build |
| Client | Page session | Data held in React state |

There is no server-side API route for charging stations. The frontend loads the pre-built JSON directly from the Vercel CDN.

---

## Map Features

### Markers and clustering

All stations are rendered as `L.divIcon` markers with a lightning bolt (Zap icon) inside a circle. Markers are clustered using `react-leaflet-cluster` with green cluster bubbles (`#15803d`). Cluster sizes: 36px (< 100), 44px (100–499), 52px (500+).

Marker appearance:
- Normal tile layer: white circle background, green icon
- Gråtone tile layer: green circle background, white icon (inverted)
- Selected: `#24374c` border and icon color
- Icon size: 28px

`L.divIcon` instances are cached by `(isSelected, inverted)` key to avoid re-creating thousands of objects per render.

### Connector type filter

A filter sheet lets users show only stations with specific connector types: Type 2, CCS, CHAdeMO, Type 1, Schuko, Type 3C. Stations that have at least one of the selected connectors are shown; stations with none are hidden. All connectors are enabled by default.

### Card pattern

**Compact card** (floating, bottom-center):
- Operator name and address
- Capacity (number of charging points)
- "Vis mer" and "Kjør hit" (Google Maps) buttons

**Detail sheet** opened by "Vis mer":
- Full name, operator, address
- Capacity and connector type list with badges
- Google Maps directions link
- Source: OpenStreetMap attribution

### Tile layers

Toggle between Kart (Kartverket topo) and Gråtone (Kartverket topograatone) in the top-right. Default is Gråtone.

### Search

3-tier search: Fylke (3 results), Kommune (5 results), Adresse (2 results). 150ms debounce. Address lookups go through the cached `/api/sok` proxy. Abort controller. "Min posisjon" geolocation with `isInNorway()` fallback to Oslo.

---

## Known Limitations

- OSM data quality varies by operator. Some stations lack connector type tags, address tags, or capacity data.
- The static file is only updated when a new build is deployed. Newly opened or closed stations will not appear until the next build.
- The client-side fallback queries only a small area around Oslo, not the full country. It is intended as a graceful degradation path, not a full replacement.
- The `isInNorwayApprox` filter uses simplified longitude thresholds and may include a small number of Swedish or Finnish border stations, or exclude Norwegian stations very close to the border.
