# Magasinkart

Shows regulated water reservoirs as polygon overlays with volume and water level data. Each reservoir links to a hydroelectric power plant and can display live water observations from the nearest NVE monitoring station.

Route: `/magasin`

---

## Data Sources

| Source | Endpoint | Data | Cache |
|--------|----------|------|-------|
| NVE Vannkraft1 layer 6 | `nve.geodataonline.no/arcgis/rest/services/Vannkraft1/MapServer/6` | Reservoir polygons with HRV/LRV, volume, area | 1h server |
| NVE Magasinstatistikk | `biapi.nve.no/magasinstatistikk/api/Magasinstatistikk/HentOffentligData` | National weekly fill level (%) and TWh | 1h server |
| NVE HydAPI | `hydapi.nve.no` | Live discharge (m³/s), water level, percentiles | Per-request (requires `NVE_API_KEY`) |

### NVE Vannkraft1 layer 6 query

Only reservoirs with operational status (`status='D'`) and a known volume (`volumOppdemt_Mm3 IS NOT NULL`) are fetched. Up to 500 records.

Fields extracted:
- `magasinNavn` — reservoir name
- `vannkraftverkNavn` — linked power plant name
- `elvenavnHierarki` — river name
- `hoyesteRegulerteVannstand_moh` — highest regulated water level (m.a.s.l.)
- `lavesteRegulerteVannstand_moh` — lowest regulated water level (m.a.s.l.)
- `volumOppdemt_Mm3` — storage volume in million cubic metres
- `magasinArealHRV_km2` — surface area at HRV in km²
- `idriftsattAar` — year commissioned
- `magasinFormal_Liste` — purpose (e.g. power, irrigation, flood control)
- `geometry.rings` — polygon rings in UTM zone 33N

### Magasinstatistikk

Returns national weekly fill statistics for all Norwegian reservoirs. The API returns an array of objects; entries with `omrnr === 0` represent the national aggregate. The most recent entry is selected by descending `dato_Id` sort.

Fields used:
- `fyllingsgrad` — fill level as a percentage
- `kapasitet_TWh` — total national reservoir capacity in TWh
- `fylling_TWh` — current filling in TWh
- `iso_uke` — ISO week number
- `endring_fyllingsgrad` — week-on-week change in fill percentage

This fetch is wrapped in a `try/catch` and treated as non-critical: if it fails, `nationalFill` is returned as `null` and the map continues to work without the national summary panel.

---

## Data Flow

```
Component mounts
  → fetch /api/reservoirs
      → Parallel: NVE layer 6 query + Magasinstatistikk
      → UTM→WGS84 polygon conversion + simplification
      → Center point calculated from first ring centroid
      → Response: { reservoirs, count, nationalFill }
  → React state updated
  → Polygon overlays and cluster markers rendered

User clicks reservoir or cluster marker
  → Reservoir card shown with HRV, LRV, volume, area
  → If NVE_API_KEY is set: fetch nearest HydAPI station
      → Live discharge, water level, percentile data
      → Shown in detail sheet
```

---

## Coordinate System

All reservoir geometries come from NVE ArcGIS in UTM zone 33N (EPSG:32633). Each polygon ring is converted point-by-point to WGS84 using `utmToLatLon()` from `src/lib/utm.ts`.

Simplification uses a step based on ring vertex count:
- More than 100 vertices: every 5th point
- 51–100 vertices: every 3rd point
- 21–50 vertices: every 2nd point
- 20 or fewer: all points

The last point of each ring is always appended to close the polygon.

The center coordinate for each reservoir is computed as the arithmetic mean of all vertices in the first ring (centroid approximation).

---

## Error Handling

- API route: top-level `try/catch` returns HTTP 500 with error message on failure.
- If NVE layer 6 returns non-OK status: route returns HTTP 502 with the upstream status code.
- Magasinstatistikk failure is silently swallowed; `nationalFill` is `null` in the response.
- Client: floating error pill with "Prøv igjen" button if `/api/reservoirs` fails.

---

## Caching

| Level | TTL | Mechanism |
|-------|-----|-----------|
| Server (`/api/reservoirs`) | 1 hour | `next: { revalidate: 3600 }` on NVE fetch; same on Magasinstatistikk fetch |
| Client | Page session | Data held in React state |

---

## Map Features

### Polygon overlays and clustering

Each reservoir is shown in two ways depending on zoom level:
- **Zoom < 10**: clustered markers at the reservoir's center point. Cluster color: cyan.
- **Zoom >= 10**: polygon outlines rendered as `<Polygon>` components, colored by regulation range (HRV − LRV in metres). Markers are hidden.

Polygon color scale: small regulation range (low) → pale cyan; large range (high) → deep teal. Reservoirs with no volume data use a neutral grey.

### National fill summary

A small summary panel shows the latest national weekly fill statistics from Magasinstatistikk: fill percentage, filling in TWh, capacity in TWh, week number, and week-on-week change. Displayed as a card on the map, not in the info sheet.

### Card pattern

**Compact card** (floating, bottom-center):
- Reservoir name, linked power plant name
- Key metric: fill volume in Mm³ and area in km²
- HRV and LRV levels in m.a.s.l.
- "Vis mer" and "Kjør hit" buttons

**Detail sheet** opened by "Vis mer":
- Full identity: reservoir name, power plant, river, purpose, year commissioned
- HRV, LRV, volume, surface area
- Live HydAPI data (if `NVE_API_KEY` set): discharge (m³/s), water level (m.a.s.l.), percentile gauge showing position within historical range
- Source: NVE attribution

### Tile layers

Toggle between Kart (Kartverket topo) and Gråtone (Kartverket topograatone).

### Search

3-tier search: Fylke (3 results), Kommune (5 results), Adresse (2 results), plus reservoir names as `extraSuggestions`. 150ms debounce. Address lookups go through the cached `/api/sok` proxy. Abort controller. "Min posisjon" with `isInNorway()` fallback to Oslo.

---

## Known Limitations

- Only reservoirs with known volume data are fetched. Small or undocumented reservoirs are absent.
- Live HydAPI water level data requires `NVE_API_KEY`. Without it, the live data section is omitted from detail cards.
- The national fill summary reflects the most recent week published by NVE. Intra-week changes are not reflected until the next publication.
- Polygon simplification may make small reservoirs look less precise than their true shape.
- The centroid calculation uses a simple vertex average, not a true geometric centroid. For irregular reservoir shapes, the center marker may fall slightly outside the polygon.
