# Data Sources — What We Use and What's Available

Overview of all data sources: what MapGram currently uses, and what remains untapped for future maps.

---

## Currently Used

### Kartverket (Norwegian Mapping Authority)

| API | Endpoint | Used In | Status |
|-----|----------|---------|--------|
| Adresser (address search) | Via `/api/sok` proxy → `ws.geonorge.no/adresser/v1/` (1h edge cache + SWR) | All maps | In use |
| Kommuneinfo | `ws.geonorge.no/kommuneinfo/v1/` | Charging, cabin, energy | In use |
| Stedsnavn (place names) | `ws.geonorge.no/stedsnavn/v1/` | All marker maps (kommune center) | In use |
| Høydedata (elevation) | `ws.geonorge.no/hoydedata/v1/` | Elevation map | In use |
| WMTS tiles (topo + graatone) | `cache.kartverket.no/v1/wmts/` | All maps | In use |
| Kommune boundaries GeoJSON | Via `/api/kommuner` proxy | Income, protected areas | In use |

### NVE (Norwegian Water Resources and Energy Directorate)

| API | Endpoint / Layer | Used In | Status |
|-----|-----------------|---------|--------|
| Vindkraft2 layer 0 | Wind farms — operational | Energikart | In use |
| Vindkraft2 layer 1 | Wind farms — under construction | Energikart | In use |
| Vindkraft2 layer 2 | Wind farms — approved | Energikart | In use |
| Vindkraft2 layer 8 | Wind farms — rejected | Energikart | In use |
| Vindkraft2 layer 4 | Individual turbines | Energikart (zoom >= 12) | In use |
| Vannkraft1 layer 0 | Hydro power plants | Energikart | In use |
| Vannkraft1 layer 6 | Reservoir polygons | Magasinkart | In use |
| Havvind2023 layer 0 | Offshore wind zones (2023) | Energikart | In use |
| HydAPI | River discharge, water level | Energikart (hydro detail) | In use (requires NVE_API_KEY) |
| Magasinstatistikk | National reservoir fill level | Magasinkart | In use |

Full NVE layer catalog: [nve-arcgis-data.md](nve-arcgis-data.md)

### Sodir (Norwegian Offshore Directorate, formerly NPD)

| API | Endpoint / Layer | Used In | Status |
|-----|-----------------|---------|--------|
| FactMaps WGS84 layer 307 | All facilities (1200+ platforms, FPSOs, subsea) | Energikart | In use |
| FactMaps WGS84 layer 311 | Pipelines (82 lines) | Energikart | In use |

**Base URL:** `factmaps.sodir.no/api/rest/services/Factmaps/FactMapsWGS84/MapServer`

### Other

| API | Endpoint | Used In | Status |
|-----|----------|---------|--------|
| MET.no Locationforecast | `api.met.no/weatherapi/` | Elevation, cabins | In use |
| SSB InntektStruk13 | `data.ssb.no/api/v0/` | Inntektskart | In use |
| SSB tabell 08936 | `data.ssb.no/api/v0/` | Verneområder | In use |
| OpenStreetMap Overpass | `overpass-api.de/api/` | Charging, cabins (build-time) | In use |
| OpenTopoMap tiles | `tile.opentopomap.org/` | Elevation map (terreng) | In use |
| biapi.nve.no | Magasinstatistikk API | Magasinkart | In use |

---

## Not Yet Used — Kartverket

### Hoydeprofil (Elevation Profile)
- **What:** Elevation profile along a line/route — not just single points
- **Use case:** Elevation graph for hiking routes
- **Docs:** https://www.kartverket.no/en/api-and-data/friluftsliv/hoydeprofil

### Friluftsliv (Hiking Trail Database)
- **What:** Footpaths, ski trails, cycling routes, rowing/paddling routes, connected POIs
- **Format:** WMS/WFS
- **Use case:** New "Turruter" map — hiking trails with elevation profiles
- **Docs:** https://www.kartverket.no/en/api-and-data/friluftsliv

### Sjokart (Nautical Charts)
- **What:** Water depth, coastal features, harbors
- **Format:** WMS tile layers, S-57/S-100
- **Use case:** Coastal map, could be base layer for offshore maps
- **Docs:** https://www.kartverket.no/en/at-sea

### Grensedata (Boundary Data)
- **What:** County, municipality, country boundaries as GeoJSON
- **Use case:** Fylke-level boundaries, we currently only use kommune
- **Docs:** https://www.kartverket.no/en/api-and-data/grensedata

---

## Not Yet Used — NVE

### Solkraft (Solar Power)
- **Layers:** Solar installations
- **Use case:** Could add to Energikart as fifth type
- **Service:** `Solkraft/MapServer`

### Nettanlegg2/4 (Power Grid)
- **Layers:** Transmission lines, substations, transformer stations
- **Use case:** Power grid overlay on energy map
- **Service:** `Nettanlegg2/MapServer`, `Nettanlegg4/MapServer`

### Snoskredvarsel (Avalanche Warnings)
- **Endpoint:** `api.nve.no/doc/snoeskredvarsel/`
- **What:** Avalanche danger ratings by region, level 1-5
- **Use case:** Safety overlay on cabin/hiking map

### Flomvarsling (Flood Warnings)
- **Endpoint:** `api.nve.no/doc/flomvarsling/`
- **What:** Flood danger levels by region
- **Use case:** Flood risk overlay map

### Jordskredvarsling (Landslide Warnings)
- **Endpoint:** `api.nve.no/doc/jordskredvarsling/`
- **What:** Landslide danger by region

### Bre1/Bre2 (Glaciers)
- **Layers:** Glacier outlines, area, change over time
- **Use case:** Climate/nature map
- **Service:** `Bre1/MapServer`, `Bre2/MapServer`

### Innsjodatabase2 (Lake Database)
- **Layers:** All Norwegian lakes with metadata
- **Service:** `Innsjodatabase2/MapServer`

### Vindressurser (Wind Resources)
- **Layers:** Wind speed/production raster maps at 50/80/120m height
- **Service:** `Vindressurser/MapServer`
- **Use case:** Wind potential overlay on energy map

---

## Not Yet Used — Sodir

### Discoveries and Fields
- **Layer 503:** Active discoveries by hydrocarbon type (point/polygon)
- **Layer 504:** All discoveries by main HC type
- **Use case:** Show oil/gas discovery areas alongside facilities

### DataService API
- **URL:** `factmaps.sodir.no/api/rest/services/DataService/Data/MapServer`
- **What:** Full tabular data from FactPages — production volumes, well data, licence info
- **Use case:** Production data on facility cards (barrels/day, Sm3/day)

---

## Not Yet Used — Other Sources

### Miljodirektoratet (Environment Agency)
- Naturbase — protected areas, species data, habitat maps
- Some overlap with what we get from SSB

### Statens Vegvesen (Road Authority)
- NVDB (Nasjonal Vegdatabank) — road data, speed limits, tunnels
- NOBIL API — official charging station registry (better data than OSM, requires API key)

### data.norge.no
- Friluftslivsomrader — mapped outdoor recreation areas
- Various municipality datasets

### Fiskeridirektoratet (Fisheries Directorate)
- Aquaculture locations — fish farms, shellfish farms
- Use case: Could be interesting for a coastal/marine map

---

## Best Candidates for Next Map

1. **Turruter (Hiking Trails)** — Kartverket friluftsliv + elevation profile API
2. **Snoskred (Avalanche Map)** — NVE avalanche API + cabin overlay
3. **Sjokart (Coastal Map)** — Kartverket nautical WMS tiles
4. **Solkraft** — NVE solar data, add to Energikart
5. **Kraftnett (Power Grid)** — NVE transmission lines, add to Energikart
6. **Akvakultur (Fish Farms)** — Fiskeridirektoratet, new coastal map

All Kartverket and NVE APIs are free, no API key required, open data under NLOD license.
Sodir data is also free under NLOD. NOBIL requires a free API key.
