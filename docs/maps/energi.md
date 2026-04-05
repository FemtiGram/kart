# Energikart

Shows four categories of energy infrastructure on one map: onshore wind farms, hydroelectric plants, offshore wind investigation zones, and oil and gas facilities with pipelines. Data comes from NVE ArcGIS services and the Sodir FactMaps API.

Route: `/energi`

---

## Data Sources

| Source | Endpoint | Data | Cache |
|--------|----------|------|-------|
| NVE Vindkraft2 layer 0 | `nve.geodataonline.no/arcgis/rest/services/Vindkraft2/MapServer/0` | Operational wind farms | 1h server |
| NVE Vindkraft2 layer 1 | `.../Vindkraft2/MapServer/1` | Wind farms under construction | 1h server |
| NVE Vindkraft2 layer 2 | `.../Vindkraft2/MapServer/2` | Approved wind farms | 1h server |
| NVE Vindkraft2 layer 8 | `.../Vindkraft2/MapServer/8` | Rejected wind farm applications | 1h server |
| NVE Vindkraft2 layer 4 | `.../Vindkraft2/MapServer/4` | Individual wind turbines | 1h server |
| NVE Vannkraft1 layer 0 | `.../Vannkraft1/MapServer/0` | Hydroelectric plants | 1h server |
| NVE Havvind2023 layer 0 | `.../Havvind2023/MapServer/0` | Offshore wind investigation zones (polygons) | 1h server |
| Sodir FactMapsWGS84 layer 307 | `factmaps.sodir.no/api/rest/services/Factmaps/FactMapsWGS84/MapServer/307` | Oil and gas facilities (1200+) | 1h server |
| Sodir FactMapsWGS84 layer 311 | `.../MapServer/311` | Pipelines (82) | 1h server |

All nine upstream requests are fetched server-side via `/api/energy` using `Promise.all`. Each has an 8-second `AbortSignal.timeout`.

### Fields used per type

**Wind farms** (`EnergyPlant`, type `"vind"`):
- `anleggNavn` — plant name
- `eier` — owner
- `kommune`, `fylkeNavn` — location
- `effekt_MW_idrift` / `effekt_MW` — capacity in MW
- `forventetProduksjon_Gwh` — expected annual production (GWh)
- `antallTurbiner` — turbine count
- Coordinates: `geometry.x`, `geometry.y` (UTM zone 33N, converted to WGS84)

**Wind turbines** (`WindTurbine`):
- `OBJECTID` — unique ID
- `anleggNavn` — parent plant name
- Coordinates: UTM zone 33N

**Hydro plants** (`EnergyPlant`, type `"vann"`):
- `vannkraftverkNavn`, `vannkraftverkEier` — name and owner
- `kommuneNavn`, `fylke` — location
- `maksYtelse_MW` — maximum output in MW
- `bruttoFallhoyde_m` — gross fall height in metres
- `idriftsattAar` — year commissioned
- `elvenavnHierarki` — river name
- `status` — only `"D"` (Drift / operational) is included; all other statuses are filtered out

**Offshore wind zones** (`HavvindZone`):
- `navn` — zone name
- `typeAnlegg` — installation type
- `areal_km2` — area in km²
- `minAvstandFastland_km` — minimum distance to shore
- `nettsideURL` — NVE info page URL
- `geometry.rings` — polygon rings (UTM zone 33N, converted with step-based simplification)

**Oil and gas facilities** (`OilGasFacility`):
- `fclName`, `fclKind`, `fclPhase` — name, type, lifecycle phase
- `fclFunctions` — comma-separated facility functions
- `fclCurrentOperatorName` — current operator
- `fclBelongsToName` — associated field name
- `fclWaterDepth` — water depth in metres
- `fclStartupDate` — startup date (year extracted from date string)
- `fclSurface` — `"Y"` if surface installation
- `fclFactPageUrl` — Sodir fact page URL
- Coordinates: DMS via `fclNsDeg/fclNsMin/fclNsSec` and `fclEwDeg/fclEwMin/fclEwSec`; longitude negated if `fclEwCode === "W"`
- Filtered: `fclNationCode2 !== "NO"` records excluded; `lat === 0 || lon === 0` records excluded

**Pipelines** (`Pipeline`):
- `pplName` — pipeline name
- `pplMedium` — transported medium (gas, oil, condensate, etc.)
- `pplCurrentPhase` — lifecycle phase
- `pplDimension` — outer diameter in inches
- `fclNameFrom`, `fclNameTo` — terminal facilities
- `pplBelongsToName` — owning company
- `geometry.paths` — polyline paths in WGS84 (`outSR=4326`); ArcGIS returns `[lon, lat]`, flipped to `[lat, lon]`

---

## Data Flow

```
Component mounts
  → fetch /api/energy
      → 9 parallel upstream requests (NVE x7, Sodir x2)
      → UTM→WGS84 conversion for NVE point and polygon geometries
      → DMS→decimal conversion for Sodir facility coordinates
      → Polygon simplification for offshore wind zones
      → Response: { plants, turbines, havvindZones, oilGasFacilities, pipelines, stats }
  → React state updated
  → Markers, polygons, and polylines rendered via react-leaflet
```

Individual turbines are only rendered at zoom >= 12. Offshore wind zone polygons are only rendered at zoom >= 7. Pipelines are only rendered at zoom >= 8.

---

## Coordinate Systems

| Data | Source CRS | Conversion |
|------|-----------|------------|
| NVE wind farms, turbines, hydro plants | UTM zone 33N (EPSG:32633) | `utmToLatLon()` in `src/lib/utm.ts` |
| NVE offshore wind polygon rings | UTM zone 33N | Same conversion with step-based simplification |
| Sodir facilities | DMS (degrees/minutes/seconds fields) | `deg + min/60 + sec/3600`, longitude negated if west |
| Sodir pipelines | WGS84 (requested via `outSR=4326`) | Coordinate axis flip only: `[lon, lat]` → `[lat, lon]` |

Polygon simplification keeps every Nth point based on ring size:
- More than 200 vertices: every 10th point
- 101–200 vertices: every 5th point
- 51–100 vertices: every 3rd point
- 50 or fewer: all points

The last point of each ring is always appended to ensure closure.

---

## Error Handling

- The API route uses a top-level `try/catch`. Any unhandled exception returns `{ error: message }` with HTTP 500.
- Each upstream layer is checked with `.ok` individually. A failing layer is silently skipped rather than failing the whole response, so partial data is always returned.
- The client displays a floating error pill if the `/api/energy` fetch fails, with a "Prøv igjen" retry button. Positioned at `bottom-20` on mobile, `sm:top-3` on desktop.

---

## Caching

| Level | TTL | Mechanism |
|-------|-----|-----------|
| Server (`/api/energy`) | 1 hour | `next: { revalidate: 3600 }` on each upstream fetch |
| Client | Page session | Data held in React state; fresh fetch on every mount |

---

## Map Features

### Filter system

A filter sheet (opened via the sliders button) provides:
- Four energy type toggles: Vindkraft, Vannkraft, Havvind, Olje & gass (all on by default)
- Wind status sub-filter: Drift, Under bygging, Konsesjon gitt, Avslått (active when Vindkraft is enabled)
- Minimum MW capacity threshold to hide small plants

### Markers and clustering

**Wind and hydro plants**: clustered together in one `MarkerClusterGroup`. Cluster color: blue (`#0369a1`). Cluster bubble sizes: 36px (< 100), 44px (100–499), 52px (500+). Individual marker icon size scales by capacity: 26px, 28px, or 32px. Markers invert on gråtone tile layer (colored background, white icon).

**Oil and gas facilities**: separate `MarkerClusterGroup` from energy plants.

**Offshore wind zones**: polygon outlines with semi-transparent fill. Not clustered. Visible at zoom >= 7 only.

**Individual turbines**: small markers rendered at zoom >= 12. Clicking shows the parent plant name.

### Card pattern

**Compact card** (floating, bottom-center):
- Badges: energy type, wind status (for wind farms)
- Name, owner, municipality/county
- Key metric: capacity in MW, or facility kind/phase for oil/gas
- "Vis mer" and "Kjør hit" buttons

**Detail sheet** opened by "Vis mer":
- Wind plants: capacity (MW), expected production (GWh), turbine count, year built, owner, location
- Hydro plants: capacity (MW), gross fall height (m), river name, year commissioned, owner, location; live HydAPI discharge (m³/s), water level, and percentile gauge from nearest NVE monitoring station
- Oil/gas facilities: kind, functions, operator, field, water depth, year startup, Sodir fact page link
- Offshore wind zones: area (km²), distance to shore (km), zone type, NVE info page link
- Source attribution in footer

### Tile layers

Toggle between Kart (Kartverket topo) and Gråtone (Kartverket topograatone) in the top-right corner. Default is Kart.

### Search

3-tier search: Fylke (3 results), Kommune (5 results), Adresse (2 results). 300ms debounce. Abort controller cancels previous in-flight address request. "Min posisjon" geolocation button with `isInNorway()` check; falls back to Oslo if outside Norway.

---

## Known Limitations

- NVE ArcGIS caps responses at 2000 records per request. Layers that exceed this limit will be silently truncated.
- Hydro plants from NVE Vannkraft1 layer 0 do not include expected production in GWh; that field is absent from the layer schema.
- Live HydAPI river data on hydro plant detail cards requires the `NVE_API_KEY` environment variable. Without it, the live data section is omitted.
- Offshore wind zone polygons are aggressively simplified for large ocean polygons. Fine coastal detail may be lost.
- Individual turbine markers are informational only; clicking a turbine shows the parent plant name but does not open a full detail card.
- The 8-second timeout on each upstream fetch means slow NVE or Sodir responses drop that data type silently rather than waiting past Vercel's 10-second serverless limit.
