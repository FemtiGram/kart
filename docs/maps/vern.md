# Verneområder

Choropleth map showing the total area of protected nature per municipality in Norway (2024 data). Municipalities are colored by protected area in km², with a breakdown by protection category in the detail sheet.

Route: `/vern`

---

## Data Sources

| Source | Endpoint | Data | Cache |
|--------|----------|------|-------|
| SSB table 08936 | `data.ssb.no/api/pxwebapi/v2/tables/08936/data` | Protected area in km² per municipality by category, 2024 | 24h server cache |
| Kartverket GeoJSON | Via `/api/kommuner` | Municipality boundary polygons (GeoJSON) | 30-day server cache |

### SSB table 08936 query

Fetched via GET with query parameters:
- `outputFormat=json-stat2`
- `valuecodes[ContentsCode]=VernetAreal`
- `valuecodes[Tid]=2024`
- `valuecodes[Region]=*` with `codelist[Region]=agg_KommGjeldende`
- `valuecodes[VerneOmrader]=*` — all protection categories
- `heading=ContentsCode,Tid,VerneOmrader`, `stub=Region`

The JSON-stat2 response uses a multi-dimensional array. The API route calculates dimension strides generically from the `id` and `size` arrays to support any dimension ordering returned by SSB.

### Protection categories

The `VerneOmrader` dimension contains five codes:

| Code | Label |
|------|-------|
| `0` | Total protected area (all categories combined) |
| `NP` | Nasjonalpark (national park) |
| `NR` | Naturreservat (nature reserve) |
| `LV` | Landskapsvernområde (landscape protection area) |
| `NM` | Andre vernekategorier (other protection categories) |

Each municipality gets an object with keys `total`, `np`, `nr`, `lv`, `nm`, all in km².

### GeoJSON boundaries

Same source as the income map: `/api/kommuner` route fetching from `raw.githubusercontent.com/robhop/fylker-og-kommuner/main/Kommuner-M.geojson`, cached 30 days.

---

## Data Flow

Both data sources are loaded in parallel on component mount, same pattern as the income map:

```
Component mounts
  → fetch /api/protected-areas  (SSB verne data)
  → fetch /api/kommuner  (GeoJSON municipality boundaries)
  → Both resolve → protection data joined to GeoJSON features by kommunenummer
  → GeoJSON layer rendered with per-municipality fill color
  → Skeleton shimmer shown while loading
```

Color assignment: the `total` km² value for each municipality is normalized against the maximum value across all municipalities (`t = total / max`). The same `interpolateColor()` function is used as in the income map, but only the upper half of the scale is used (green = most protected, no red for zero). Municipalities with null or zero data use neutral grey.

---

## Error Handling

- API route: if the SSB fetch returns non-OK, returns HTTP `res.status` with `{ error: "SSB fetch failed" }`.
- Client: floating error pill with "Prøv igjen" if either fetch fails.
- Municipalities with no matching verne entry are rendered in neutral grey.

---

## Caching

| Level | TTL | Mechanism |
|-------|-----|-----------|
| Protection data (`/api/protected-areas`) | 24 hours | `next: { revalidate: 86400 }` |
| GeoJSON boundaries (`/api/kommuner`) | 30 days | `next: { revalidate: 2592000 }` |
| Client | Page session | Data held in React state |

---

## Map Features

### Choropleth rendering

Same rendering approach as the income map: react-leaflet `<GeoJSON>` with a `style` function per feature, direct `layer.setStyle()` for hover and selection, `clearSelection()` to reset polygon styles before applying new selection highlight.

### Card pattern

**Compact card** (floating, bottom-center):
- Municipality name
- Key metric: total protected area in km²
- "Vis mer" button

**Detail sheet** opened by "Vis mer":
- Full municipality name, municipality number
- Total protected area (km²) with formatted number
- Category breakdown as a list:
  - Nasjonalpark (NP)
  - Naturreservat (NR)
  - Landskapsvernområde (LV)
  - Andre vernekategorier (NM)
- Each category shows km² value and percentage of total municipal area (if derivable)
- Source: SSB table 08936 attribution

### Tile layer

"Bakgrunnskart" toggle: Kart (Kartverket topo) or Gråtone (Kartverket topograatone). Default is Gråtone.

### Search

3-tier search: Fylke (3 results), Kommune (5 results), Adresse (2 results). 150ms debounce. Address lookups go through the cached `/api/sok` proxy. Abort controller. Selecting a kommune uses GeoJSON layer bounds. No "Min posisjon" button.

### Loading state

Skeleton shimmer overlay while loading, using `.skeleton-shimmer` CSS class.

---

## Known Limitations

- Data is from 2024. Protected area boundaries and classifications can change due to new designations or boundary revisions.
- The color scale normalizes against the maximum value in the loaded dataset. Municipalities with large national parks (e.g. Oppdal, Lom) anchor the top of the scale, compressing variation among municipalities with smaller protected areas.
- The `total` field from SSB may differ slightly from the sum of `np + nr + lv + nm` due to overlapping protection categories at SSB's aggregation level.
- Municipality code mismatches between GeoJSON and SSB (from mergers or splits) result in grey polygons for affected municipalities.