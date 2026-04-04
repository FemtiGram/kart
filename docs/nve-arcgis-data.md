# NVE ArcGIS Data Sources

Comprehensive catalog of geospatial services available from NVE (Norwegian Water Resources and Energy Directorate) via their ArcGIS REST endpoint. Documented for potential use in the MapGram portfolio project.

**Base URL:** `https://nve.geodataonline.no/arcgis/rest/services/`

**Coordinate system:** UTM zone 33N (EPSG:25833) — must be reprojected to WGS84 (EPSG:4326) for Leaflet.

---

## Table of Contents

- [Energy](#energy)
  - [Vindkraft2 — Wind Power](#vindkraft2--wind-power) (currently used)
  - [Vannkraft1 — Hydropower](#vannkraft1--hydropower)
  - [Solkraft — Solar Power](#solkraft--solar-power)
  - [Smakraftverk — Small-Scale Hydropower](#smakraftverk--small-scale-hydropower)
  - [Havvind / Havvind2023 — Offshore Wind](#havvind--havvind2023--offshore-wind)
- [Natural Hazards](#natural-hazards)
  - [Flood Risk](#flood-risk)
  - [Avalanche and Landslides](#avalanche-and-landslides)
  - [Quick Clay Landslide Risk](#quick-clay-landslide-risk)
- [Nature and Water](#nature-and-water)
  - [Bre1 / Bre2 — Glaciers](#bre1--bre2--glaciers)
  - [HydrologiskeData2 / HydrologiskeData3 — Hydrological Data](#hydrologiskedata2--hydrologiskedata3--hydrological-data)
  - [Innsjodatabase2 — Lake Database](#innsjodatabase2--lake-database)
  - [Nedborfelt1 / Nedborfelt2 — Drainage Basins](#nedborfelt1--nedborfelt2--drainage-basins)
  - [Elvenett1 — River Network](#elvenett1--river-network)
  - [VerneplanforVassdrag — Protected Waterways](#verneplanforvassdrag--protected-waterways)
- [Infrastructure](#infrastructure)
  - [Nettanlegg2 / Nettanlegg4 — Power Grid](#nettanlegg2--nettanlegg4--power-grid)
- [Planning and Resources](#planning-and-resources)
  - [NasjonalRammeVindkraft — National Wind Framework](#nasjonalrammevindkraft--national-wind-framework)
  - [Vindressurser — Wind Resources](#vindressurser--wind-resources)
  - [Bratthet — Steepness](#bratthet--steepness)
  - [seNorgeGrid / seNorgeGrid_png — Climate Grids](#senorgegrid--senorgegrid_png--climate-grids)
  - [klimagrid — Climate Grid](#klimagrid--climate-grid)
- [NVE REST APIs (non-ArcGIS)](#nve-rest-apis-non-arcgis)

---

## Energy

### Vindkraft2 — Wind Power

**Service URL:** `Vindkraft2/MapServer`
**Status:** CURRENTLY USED in MapGram (`/vindkraft` page, layer 0)

| Layer | Name | Description |
|-------|------|-------------|
| 0 | Vindkraft_utbygd | Built wind power plants |
| 1 | Vindkraft_under_bygging | Under construction |
| 2 | Vindkraft_konsesjon_gitt_ikke_utbygd | License granted, not yet built |
| 3 | Vindkraftomrade | Wind power areas (polygons) |
| 4 | Vindturbin | Individual wind turbines |
| 5 | Vindkraft_konsesjonsbehandling | License processing |
| 6 | Vindkraft_under_behandling | Under review |
| 7 | Vindkraft_konsesjon_gitt | License granted |
| 8 | Vindkraft_avslatt | Rejected applications |
| 9 | Vindkraft_planlegging_avsluttet | Planning ended |
| 10 | Vindkraftomrade_konsesjonsbehandling | Area under license processing |

**Geometry:** Points (layers 0-2, 4-9), Polygons (layers 3, 10)

**Key fields (layer 0 — Vindkraft_utbygd):**

| Field | Type | Example |
|-------|------|---------|
| `anleggNavn` | string | "Sørmarkfjellet" |
| `eier` | string | "SØRMARKFJELLET AS" |
| `effekt_MW` | number | 130.2 |
| `effekt_MW_idrift` | number | 130.2 |
| `forventetProduksjon_Gwh` | number | 384.01 |
| `kommune` | string | "Flatanger" |
| `fylkeNavn` | string | "Trøndelag" |
| `antallTurbiner` | number | 31 |
| `saksLenke` | string | URL to NVE case page |
| `stadium` | string | "Konsesjon gitt" |
| `status` | string | "D" (= drifting/operational) |

**MapGram use:**
- Layer 0 is already used in the `/vindkraft` page via `api/wind-power/route.ts`
- Layer 4 (individual turbines) could add detail on zoom
- Layers 1-2 could show pipeline/planned plants with different markers
- Layer 8 (rejected) could make an interesting "what could have been" view

---

### Vannkraft1 — Hydropower

**Service URL:** `Vannkraft1/MapServer`

| Layer | Name | Description |
|-------|------|-------------|
| 0 | Vannkraftverk | Hydropower plants (main layer) |
| 1 | Dam_N250 | Dams (1:250k) |
| 2 | Inntakspunkt | Water intake points |
| 3 | Utlopspunkt | Water outlet points |
| 4 | Vannvei | Waterways (penstocks/tunnels) |
| 5 | Dam | Dams (detailed) |
| 6 | Magasin | Reservoirs |
| 7 | Delfelt | Sub-catchments |
| 8 | Ikke_utbygd_vannkraftverk | Not-built plants |
| 9-12 | Additional not-built layers | Various planning stages |

**Geometry:** Points (layers 0, 2, 3, 8), Lines (layer 4), Polygons (layers 1, 5, 6, 7)

**Key fields (layer 0 — Vannkraftverk):**

| Field | Type | Example |
|-------|------|---------|
| `vannkraftverkNavn` | string | "Hetland" |
| `vannkraftverkType` | string | "KS" (= kraftstasjon) |
| `status` | string | "D" (= drifting/operational) |
| `idriftsattAar` | number | 1983 |
| `maksYtelse_MW` | number | 1.48 |
| `bruttoFallhoyde_m` | number | 55.3 |
| `vannkraftverkEier` | string | "LYSE KRAFT DA" |
| `kommuneNavn` | string | "Hå" |
| `fylke` | string | "Rogaland" |
| `vassdragsNr` | string | "027.6B" |
| `elvenavnHierarki` | string | "Ognaåni" |

**MapGram use case:** Strong candidate for a `/vannkraft` page. Norway has ~1,700 hydropower plants producing 90%+ of the country's electricity. Could show plants sized by MW capacity, colored by age. Reservoirs (layer 6) as polygon overlays would add context.

---

### Solkraft — Solar Power

**Service URL:** `Solkraft/MapServer`

| Layer | Name | Description |
|-------|------|-------------|
| 0 | Solkraftomrade | Solar power areas |
| 1 | Solkraft_transformatorstasjon | Transformer stations |
| 2 | Solkraft_konsesjonsbehandling | License processing |
| 3 | Solkraftomrade_konsesjonsbehandling | Areas under license processing |

**Geometry:** Polygons (layers 0, 3), Points (layers 1, 2)

**Key fields (layer 0):** Similar structure to Vindkraft — `effekt_MW`, `effekt_MW_idrift`, `status`. Note: `effekt_MW_idrift` was null in samples (most are not yet operational). Status "V" appears to mean under processing.

**MapGram use case:** Solar is new and growing in Norway. Could be combined with wind in an "energy transition" dashboard, but limited data so far (mostly planned, not built).

---

### Smakraftverk — Small-Scale Hydropower

**Service URL:** `Smakraftverk/MapServer`

| Layer | Name | Description |
|-------|------|-------------|
| 0 | Digital_Potensial_Smakraft | Potential small hydro sites |
| 1 | Digital_Potensial_Inntak | Potential intake points |
| 2 | Digital_Potensial_Vannvei | Potential waterways |

**Geometry:** Points (layers 0, 1), Lines (layer 2)

**Note:** This service contains only *potential* sites, not built plants. Built small hydro plants appear in Vannkraft1.

**MapGram use case:** Limited — shows theoretical potential rather than reality. Could be interesting as a "untapped energy" overlay but niche.

---

### Havvind / Havvind2023 — Offshore Wind

**Service URLs:** `Havvind/MapServer`, `Havvind2023/MapServer`, `Mapservices/HavvindOnline/MapServer`

Offshore wind areas designated by the Norwegian government. Includes Utsira Nord and Sørlige Nordsjø II zones.

**Geometry:** Polygons (sea areas)

**MapGram use case:** Topical — Norway's offshore wind push is major news. Could visualize planned offshore wind zones overlaid on a sea map. Would pair well with Vindressurser (wind speed data).

---

## Natural Hazards

### Flood Risk

**Service URLs:**
- `FlomAktsomhet/MapServer` — Flood awareness zones
- `Flomsoner1/MapServer` — Flood zones (set 1)
- `Flomsoner2/MapServer` — Flood zones (set 2)

**Geometry:** Polygons (flood zones/extents)

**MapGram use case:** High impact — flood zones are relevant for homebuyers, insurers, and planners. Could build a "sjekk flomfare" (check flood risk) tool where users search an address and see if it is in a flood zone. Combine with the NVE flood warning REST API for live alerts.

---

### Avalanche and Landslides

**Service URLs:**
- `SnoskredAktsomhet/MapServer` — Snow avalanche awareness
- `SkredSnoAktR/MapServer` — Snow avalanche risk
- `SkredSteinAktR/MapServer` — Rockslide risk
- `Fjellskred1/MapServer` — Mountain landslides
- `Skredfaresoner1/MapServer` — Landslide hazard zones (set 1)
- `Skredfaresoner2/MapServer` — Landslide hazard zones (set 2)
- `SkredHendelser/MapServer` — Historical landslide events
- `SkredHendelser1/MapServer` — Historical events (additional)
- `SkredSnoForsvaret/MapServer` — Military avalanche data

**Geometry:** Polygons (risk zones), Points (historical events)

**MapGram use case:** "Skredfare" (landslide risk) map — very relevant in Norway where terrain causes regular avalanches and rockslides. Historical events (SkredHendelser) could show past incidents as markers. Combine with NVE's avalanche warning REST API for live conditions.

---

### Quick Clay Landslide Risk

**Service URLs:**
- `KvikkleireskredAktsomhet/MapServer` — Quick clay awareness zones
- `SkredKvikkleire2/MapServer` — Quick clay risk zones

**Geometry:** Polygons

**MapGram use case:** Niche but dramatic — quick clay (kvikkleire) landslides are uniquely Scandinavian and cause catastrophic damage (e.g., Gjerdrum 2020). Would make a compelling specialized hazard map.

---

## Nature and Water

### Bre1 / Bre2 — Glaciers

**Service URLs:** `Bre1/MapServer`, `Bre2/MapServer`

**Geometry:** Polygons (glacier extents)

**MapGram use case:** Beautiful visualization opportunity. Could show glacier outlines over topographic basemap. If historical data is available, a "glacier retreat" time comparison would be compelling for climate storytelling.

---

### HydrologiskeData2 / HydrologiskeData3 — Hydrological Data

**Service URLs:** `HydrologiskeData2/MapServer`, `HydrologiskeData3/MapServer`

Hydrological measurement stations, water flow data, and related infrastructure.

**MapGram use case:** Could show measurement stations with live data links. More specialized/technical.

---

### Innsjodatabase2 — Lake Database

**Service URL:** `Innsjodatabase2/MapServer`

Norway's lake registry with attributes like area, depth, and elevation.

**Geometry:** Polygons (lake outlines)

**MapGram use case:** "Norges innsjøer" — could let users explore lakes by size, depth, or elevation. Fun for fishing/hiking enthusiasts.

---

### Nedborfelt1 / Nedborfelt2 — Drainage Basins

**Service URLs:** `Nedborfelt1/MapServer`, `Nedborfelt2/MapServer`

Watershed/catchment area boundaries.

**Geometry:** Polygons

**MapGram use case:** Educational/hydrological context. Could underlay other water-related maps.

---

### Elvenett1 — River Network

**Service URL:** `Elvenett1/MapServer`

Norway's river network.

**Geometry:** Lines

**MapGram use case:** Could complement a hydropower or fishing map as a contextual overlay.

---

### VerneplanforVassdrag — Protected Waterways

**Service URL:** `VerneplanforVassdrag/MapServer`

Rivers and waterways protected from hydropower development.

**Geometry:** Polygons/Lines

**MapGram use case:** Could pair with Vannkraft1 — show where hydro IS vs. where it is protected.

---

## Infrastructure

### Nettanlegg2 / Nettanlegg4 — Power Grid

**Service URLs:** `Nettanlegg2/MapServer`, `Nettanlegg4/MapServer`

Power transmission lines, substations, and grid infrastructure.

**Geometry:** Lines (transmission lines), Points (substations)

**MapGram use case:** "Strømnettet" — Norway's power grid visualization. Could show transmission lines colored by voltage level. Relevant given ongoing grid capacity debates.

---

## Planning and Resources

### NasjonalRammeVindkraft — National Wind Framework

**Service URL:** `NasjonalRammeVindkraft/MapServer`

National framework for onshore wind power — includes designated zones, exclusion areas, and analysis areas from the 2019 national plan.

**Geometry:** Polygons

**MapGram use case:** Could overlay with Vindkraft2 to show where wind is allowed vs. where it has been built. Politically interesting.

---

### Vindressurser — Wind Resources

**Service URL:** `Vindressurser/MapServer`

Wind speed and energy potential maps (raster/grid data).

**Geometry:** Raster/Grid

**MapGram use case:** Wind speed heatmap overlay. Would pair well with Vindkraft2 or Havvind to show why turbines are placed where they are.

---

### Bratthet — Steepness

**Service URL:** `Bratthet/MapServer`

Terrain steepness/slope data.

**Geometry:** Raster/Grid

**MapGram use case:** Useful as context layer for avalanche risk maps.

---

### seNorgeGrid / seNorgeGrid_png — Climate Grids

**Service URLs:** `seNorgeGrid/MapServer`, `seNorgeGrid_png/MapServer`

Gridded climate data (temperature, precipitation, snow depth) from seNorge.no.

**Geometry:** Raster/Grid

**MapGram use case:** Weather/climate visualization — snow depth maps, temperature maps. The `_png` variant serves pre-rendered tiles (faster).

---

### klimagrid — Climate Grid

**Service URL:** `klimagrid/MapServer`

Additional climate grid data.

**Geometry:** Raster/Grid

---

## NVE REST APIs (non-ArcGIS)

These are separate JSON REST APIs from NVE, not part of the ArcGIS service.

| API | URL | Description | Format |
|-----|-----|-------------|--------|
| Snøskredvarsel | `api.nve.no/doc/snoeskredvarsel/` | Avalanche warnings by region | JSON |
| Flomvarsling | `api.nve.no/doc/flomvarsling/` | Flood warnings | JSON |
| Jordskredvarsling | `api.nve.no/doc/jordskredvarsling/` | Landslide warnings | JSON |
| Vindkraftdatabase | `api.nve.no/web/WindPowerPlant/` | Wind power plant details | JSON |

**Note:** The Vindkraftdatabase REST API has detailed turbine info but no coordinates. The ArcGIS Vindkraft2 service has coordinates but less detail. For the MapGram `/vindkraft` page, we use both: ArcGIS for map positions and the REST API could supplement with turbine specs.

---

## Query Examples

### Fetch all built wind power plants
```
GET https://nve.geodataonline.no/arcgis/rest/services/Vindkraft2/MapServer/0/query
  ?where=1%3D1
  &outFields=*
  &f=json
  &outSR=4326    ← request WGS84 coordinates directly
```

### Fetch hydropower plants over 100 MW
```
GET https://nve.geodataonline.no/arcgis/rest/services/Vannkraft1/MapServer/0/query
  ?where=maksYtelse_MW>100
  &outFields=*
  &f=json
  &outSR=4326
```

### Fetch individual wind turbines in a bounding box
```
GET https://nve.geodataonline.no/arcgis/rest/services/Vindkraft2/MapServer/4/query
  ?geometry=4,58,12,63
  &geometryType=esriGeometryEnvelope
  &inSR=4326
  &spatialRel=esriSpatialRelIntersects
  &outFields=*
  &f=json
  &outSR=4326
```

**Tip:** Always include `&outSR=4326` to get coordinates in WGS84 (lat/lng) instead of the default UTM zone 33N.

---

## Priority Candidates for New MapGram Pages

Based on data richness, visual appeal, and public interest:

1. **Vannkraft (Hydropower)** — ~1,700 plants, rich attributes (MW, age, owner, river), point geometry. Natural companion to the existing wind power page.
2. **Flomfare (Flood Risk)** — Polygon zones + live JSON warnings. High public interest, practical utility.
3. **Skredfare (Landslide/Avalanche Risk)** — Multiple hazard types, historical events, live warnings. Dramatic and relevant.
4. **Havvind (Offshore Wind)** — Timely topic, polygon zones on sea map. Simpler but visually striking.
5. **Bre (Glaciers)** — Beautiful polygon overlays on mountain terrain. Climate storytelling potential.
