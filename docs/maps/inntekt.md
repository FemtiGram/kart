# Inntektskart

Choropleth map showing median after-tax household income per municipality in Norway (2024 data). Municipalities are colored on a red-yellow-green diverging scale: low income is red, median is yellow, high income is green.

Route: `/lonn`

---

## Data Sources

| Source | Endpoint | Data | Cache |
|--------|----------|------|-------|
| SSB InntektStruk13 | `data.ssb.no/api/v0/no/table/InntektStruk13` | Median after-tax household income per municipality, 2024 | 24h server cache |
| Kartverket GeoJSON | Via `/api/kommuner` | Municipality boundary polygons (GeoJSON) | 30-day server cache |

### SSB InntektStruk13 query

Fetched via POST with a JSON-stat2 query:
- `Region`: all municipalities (filter `"all"`, values `["*"]`)
- `HusholdType`: all households (`"0000"`)
- `ContentsCode`: after-tax income (`"InntSkatt"`)
- `Tid`: year 2024

The response uses JSON-stat2 format. Parsing: `dimension.Region.category.index` maps 4-digit municipality code (`kommunenummer`) to position in the `value` array. County-level codes (not 4 digits) are filtered out.

Result: a flat object mapping `kommunenummer → income (NOK)`.

### Kartverket GeoJSON (kommuner)

Fetched from `raw.githubusercontent.com/robhop/fylker-og-kommuner/main/Kommuner-M.geojson` (a maintained community GeoJSON of Norwegian municipality boundaries, medium resolution). Each GeoJSON feature has a `kommunenummer` property used to join with SSB income data.

Cached for 30 days with `next: { revalidate: 2592000 }`.

---

## Data Flow

Both data sources are loaded in parallel on component mount:

```
Component mounts
  → fetch /api/income  (SSB income data)
  → fetch /api/kommuner  (GeoJSON municipality boundaries)
  → Both resolve → income data joined to GeoJSON features
  → GeoJSON layer rendered with per-municipality fill color
  → Skeleton shimmer shown while loading
```

Color assignment uses `interpolateColor()` from `src/lib/map-utils.tsx`, which maps a normalized value `t ∈ [0, 1]` through a red-yellow-green 3-stop gradient. The `t` value for each municipality is `(income - min) / (max - min)`. Municipalities with null income data use a neutral grey (`#e3ddd4`).

---

## Error Handling

- API route: if the SSB fetch returns non-OK, the route returns HTTP `res.status` with `{ error: "SSB fetch failed" }`.
- Client: if either `/api/income` or `/api/kommuner` fails, a floating error pill with "Prøv igjen" retry appears.
- GeoJSON features with no matching income entry are rendered in neutral grey rather than causing an error.

---

## Caching

| Level | TTL | Mechanism |
|-------|-----|-----------|
| Income data (`/api/income`) | 24 hours | `next: { revalidate: 86400 }` |
| GeoJSON boundaries (`/api/kommuner`) | 30 days | `next: { revalidate: 2592000 }` |
| Client | Page session | Data held in React state |

---

## Map Features

### Choropleth rendering

The GeoJSON layer is rendered using react-leaflet's `<GeoJSON>` component with a `style` function that assigns fill color per feature. On each re-render, the style function recalculates income color from the current min/max values across all municipalities.

Each GeoJSON feature has mouse event handlers for hover (highlight border) and click (select). Leaflet's `layer.setStyle()` is called directly for performance, avoiding a full React re-render on hover.

When a municipality is selected, `clearSelection()` resets all polygon styles to their income-based color before applying the selection highlight. This prevents stale highlighted polygons when navigating between selections.

### Card pattern

This map uses the standard compact card + detail sheet pattern, adapted for choropleth data.

**Compact card** (floating, bottom-center):
- Municipality name, county
- Key metric: median income formatted as NOK (e.g. "634 000 kr")
- Rank out of 356 municipalities
- "Vis mer" button (no "Kjør hit" — choropleth maps navigate to municipality center, not a specific address)

**Detail sheet** opened by "Vis mer":
- Full name, county, municipality number
- Median income (large number)
- Rank with progress bar (position within national distribution)
- Percentage above or below national median
- Source: SSB InntektStruk13 attribution

### Tile layer

"Bakgrunnskart" toggle instead of the Kart/Gråtone toggle used on marker maps. Options: Kart (Kartverket topo) and Gråtone (Kartverket topograatone). Default is Gråtone to make the choropleth colors stand out.

### Search

3-tier search: Fylke (3 results), Kommune (5 results), Adresse (2 results). 150ms debounce. Address lookups go through the cached `/api/sok` proxy. Abort controller. Selecting a kommune navigates using GeoJSON layer bounds (not the Geonorge `stedsnavn` API used on marker maps).

No "Min posisjon" button — choropleth maps do not have a location button since there is no single point to navigate to.

### Loading state

A skeleton shimmer overlay covers the map while income and GeoJSON data are loading. The shimmer uses the `.skeleton-shimmer` CSS class (sliding gradient, `#e5e7eb → #d1d5db`).

---

## Known Limitations

- Income data is from 2024 and updated annually at SSB. Figures reflect the previous year's tax returns.
- The 24-hour server cache means the data on the map may be up to 24 hours behind SSB's latest publication.
- Municipality mergers and splits can cause mismatches between the GeoJSON boundaries (which use current municipality codes) and SSB data (which uses the same codes). If codes diverge, affected municipalities show grey.
- The color scale uses the actual min and max within the loaded dataset. If a municipality has an extreme outlier income, the mid-range variation is compressed and less visually distinct.