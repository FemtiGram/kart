# Norwegian Open APIs — Potential Data Sources for MapGram

## What We Already Use

| API | Endpoint | Used In |
|-----|----------|---------|
| Kartverket Adresser | `ws.geonorge.no/adresser/v1/` | All maps (address search) |
| Kartverket Kommuneinfo | `ws.geonorge.no/kommuneinfo/v1/` | Charging, cabin (kommune search) |
| Kartverket Stedsnavn | `ws.geonorge.no/stedsnavn/v1/` | Elevation (place name fallback) |
| Kartverket Høydedata | `ws.geonorge.no/hoydedata/v1/` | Elevation map |
| Kartverket WMTS tiles | `cache.kartverket.no/v1/wmts/` | All maps (topo + gråtone) |
| Kartverket Kommuner GeoJSON | `/api/kommuner` (our proxy) | Income, protected areas |
| MET.no Locationforecast | `api.met.no/weatherapi/` | Elevation map (weather) |
| SSB | Various tables | Income, protected areas |
| OpenStreetMap Overpass | `overpass-api.de/api/` | Charging, cabins |

---

## Kartverket APIs We DON'T Use Yet

### Høydeprofil (Elevation Profile)
- **Endpoint:** WPS-API via Kartverket
- **What:** Get elevation profile along a line/route — not just single points
- **Use case:** Show elevation graph for hiking routes
- **Docs:** https://www.kartverket.no/en/api-and-data/friluftsliv/hoydeprofil

### Friluftsliv — National Hiking Trail Database
- **What:** Footpaths, ski trails, cycling routes, rowing/paddling routes
- **Also includes:** Cabins, parking, toilets, viewpoints connected to trails
- **Format:** WMS/WFS (would need to convert or overlay)
- **Use case:** New "Turruter" map page — hiking trails with elevation profiles
- **Docs:** https://www.kartverket.no/en/api-and-data/friluftsliv

### Sjøkart (Nautical Charts)
- **What:** Water depth, coastal features, harbors
- **Format:** WMS tile layers, S-57/S-100 data
- **Use case:** Coastal/sailing map page
- **Docs:** https://www.kartverket.no/en/at-sea

### Grensedata (Boundary Data)
- **What:** County, municipality, country boundaries as GeoJSON
- **Use case:** We already use kommune boundaries — could add fylke boundaries
- **Docs:** https://www.kartverket.no/en/api-and-data/grensedata

### Eiendomsdata (Property Data)
- **What:** Property boundaries, matrikkel (cadastre) data
- **Format:** API access
- **Use case:** Probably not relevant for MapGram
- **Docs:** https://www.kartverket.no/en/api-and-data/eiendomsdata

---

## NVE (Norwegian Water Resources & Energy Directorate)

### Snøskredvarsel (Avalanche Warnings)
- **Endpoint:** `api.nve.no/doc/snoeskredvarsel/`
- **Format:** REST API, JSON
- **What:** Avalanche danger ratings by region, danger level 1-5
- **Use case:** Overlay on cabin/hiking map — show avalanche danger near cabins
- **Docs:** https://api.nve.no/doc/snoeskredvarsel/

### Flomvarsling (Flood Warnings)
- **Endpoint:** `api.nve.no/doc/flomvarsling/`
- **Format:** REST API, JSON
- **What:** Flood danger levels by region
- **Use case:** Flood risk overlay map
- **Docs:** https://api.nve.no/doc/flomvarsling/

### Jordskredvarsling (Landslide Warnings)
- **Endpoint:** `api.nve.no/doc/jordskredvarsling/`
- **Format:** REST API, JSON
- **What:** Landslide danger by region
- **Docs:** https://api.nve.no/doc/jordskredvarsling/

### Hydrologiske Data
- **Endpoint:** `api.nve.no/doc/hydrologiske-data/`
- **What:** Water levels, flow rates in rivers and lakes
- **Use case:** Could be interesting for outdoor recreation maps
- **Docs:** https://api.nve.no/doc/hydrologiske-data/

---

## Other Interesting Open Sources

### Miljødirektoratet (Environment Agency)
- Naturbase — protected areas, species data
- We already use some of this via SSB

### data.norge.no
- Friluftslivsområder (mapped outdoor recreation areas)
- Various municipality datasets

### Statens Vegvesen (Road Authority)
- NVDB (Nasjonal Vegdatabank) — road data, speed limits, tunnels
- Electric charging stations (NOBIL) — better source than OSM for chargers!
  - **NOBIL API:** Requires API key, but free for non-commercial use
  - Would solve our charging station data quality issues

---

## Best Candidates for New MapGram Pages

1. **Turruter (Hiking Trails)** — Kartverket friluftsliv + elevation profile API
2. **Snøskred (Avalanche Map)** — NVE avalanche API + cabin overlay
3. **Sjøkart (Coastal Map)** — Kartverket nautical WMS tiles
4. **NOBIL Ladestasjoner** — Replace OSM charging data with official NOBIL API (needs API key)

All Kartverket/NVE APIs are free, no API key required, open data under NLOD license.
