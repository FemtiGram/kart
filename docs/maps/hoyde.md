# Høydekart

Shows elevation and current weather for any point in Norway. Click the map or search an address to fetch elevation data from Kartverket and live weather from MET.no. Defaults to OpenTopoMap terrain tiles for context.

Route: `/map`

---

## Data Sources

| Source | Endpoint | Data | Cache |
|--------|----------|------|-------|
| Kartverket høyde-API | `ws.geonorge.no/hoydedata/v1/punkt?nord=...&ost=...&koordsys=4258&geoidmodell=nn2000` | Elevation in metres above sea level | Per-request (no cache) |
| MET.no locationforecast | Via `/api/weather?lat=...&lon=...` | Temperature, wind speed, precipitation, weather symbol | 30min server cache |
| Geonorge adresser API (via `/api/sok` proxy) | `/api/sok?q=...&n=6` → `ws.geonorge.no/adresser/v1/sok` | Address search results with coordinates | 1h edge cache + 24h stale-while-revalidate |

### Kartverket høyde-API

The API accepts `nord` (latitude) and `ost` (longitude) in coordinate system `koordsys=4258` (ETRS89 geographic, equivalent to WGS84 for this use). The geoid model `nn2000` provides Norwegian Normal Null 2000 elevations. The response includes `terrengpunkt.z` (elevation) and optionally a building or road description that is used to annotate the result.

### MET.no locationforecast

Proxied through `/api/weather` to add a 30-minute server-side cache and avoid sending the User-Agent header directly from the browser. Returns:
- `temperature` — air temperature in °C
- `windSpeed` — wind speed in m/s
- `precipitation` — next-1-hour or next-6-hour precipitation amount in mm
- `symbolCode` — MET.no weather symbol code (used to select a Lucide icon)

### Address search

Queries `/api/sok?q=...&n=6`, which proxies to the Geonorge `adresser` API. Proxying adds a 1-hour Vercel edge cache with 24-hour stale-while-revalidate, so repeat searches for common queries return in ~20ms from the CDN instead of 100–800ms from Geonorge. Each result includes:
- `adressetekst` — street address
- `poststed` — postal place name
- `kommunenavn` — municipality name
- `representasjonspunkt.lat` and `.lon` — coordinate for map navigation

---

## Data Flow

This map uses the per-request pattern. No data is preloaded on mount.

```
User clicks map or selects address from search
  → fetch Kartverket høyde-API (latitude, longitude)
  → fetch /api/weather (latitude, longitude) [in parallel]
  → State updated: elevation result + weather result
  → Marker placed at clicked location
  → Compact card shown with elevation + weather
```

```
User types in search box (150ms debounce, skipped during IME composition)
  → fetch /api/sok?q=...&n=6 (cached at Vercel edge)
  → Dropdown shows up to 6 address suggestions
  → User selects → map flies to address → triggers elevation + weather fetch
```

---

## Error Handling

- Elevation fetch failure: error shown inline in the card, no retry button (user can click again).
- Weather fetch failure: weather section shows "–" for all values.
- Address search failure: dropdown shows no results silently (loading spinner disappears).
- Geolocation ("Min posisjon") failure: floating error pill "Kunne ikke finne posisjon..."; falls back to default Norway overview if `isInNorway()` returns false.

---

## Caching

| Level | TTL | Mechanism |
|-------|-----|-----------|
| Elevation | None | Per-request, no server or client cache |
| Weather | 30 minutes | `next: { revalidate: 1800 }` in `/api/weather` |
| Address search | 1h edge + 24h SWR | `/api/sok` proxy sets `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` |

---

## Map Features

### Default tile layer

The elevation map defaults to OpenTopoMap terrain tiles ("Terreng") rather than Kartverket topo. OpenTopoMap shows contour lines and terrain shading which is more contextually useful when exploring elevation.

### Tile layers

Toggle between Terreng (OpenTopoMap) and Kart (Kartverket topo) in the top-right. The toggle is labeled "Terreng / Kart" rather than the "Kart / Gråtone" toggle used on other maps.

### Click interaction

Clicking anywhere on the map places a standard Leaflet marker and fetches elevation and weather for that point. The previous marker is replaced. The card shows:
- Elevation (m.o.h.)
- Smart location label: the API response may include a building name, road name, or place name which is shown as a subtitle
- Weather: temperature, wind speed, precipitation, symbol icon

### Address-only search

Unlike other maps, this map uses address-only search (6 results) rather than the standard 3-tier Fylke/Kommune/Adresse hierarchy. The reasoning: elevation is only meaningful at a specific point, so navigating to a county or municipality level is not useful. Selecting an address triggers an elevation + weather fetch for the address coordinates.

### Dev mode API log

When `NEXT_PUBLIC_DEV=true` or `window.__MAPGRAM_DEV = true` is set, a panel on `/map` shows a log of all API calls made during the session, with timestamps, endpoints, and response status. Controlled by the `isDevMode()` helper in `src/lib/map-utils.tsx`.

### Card pattern

**Compact card** (floating, bottom-center):
- Location label (building, road, or coordinates)
- Key metric: elevation in metres (large number)
- Weather row: temperature, wind, precipitation, symbol
- "Vis mer" and "Kjør hit" buttons

**Detail sheet** opened by "Vis mer":
- Coordinates (latitude, longitude, decimal degrees)
- Elevation with geoid model note (NN2000)
- Full weather breakdown with symbol icon
- yr.no forecast link for the coordinates
- Source: Kartverket and MET.no attribution

### Geolocation

"Min posisjon" button (LocateFixed icon). Uses browser Geolocation API with 15-second timeout and up to 60-second cached position acceptance. If the user's position is outside Norway (`isInNorway()` returns false), the map stays at the default Norway overview without fetching elevation.

---

## Known Limitations

- Elevation data from Kartverket is only available within Norway's territory. Clicking in the ocean or outside Norway's borders returns an error.
- The Kartverket høyde-API does not accept requests for every coordinate system; only `koordsys=4258` (WGS84/ETRS89 geographic) is used here.
- Address search does not include Fylke or Kommune suggestions; users must type enough of an address to get useful results.
- The dev mode API log is for development use only and should not be relied on in production.