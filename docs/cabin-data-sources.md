# Cabin Data — Sources & Available Fields

## Current Source: OpenStreetMap (Overpass API)

### Tags We Extract
| OSM Tag | Field | Notes |
|---------|-------|-------|
| `name` | name | Falls back to "Ukjent hytte" |
| `operator` | operator, isDNT | Regex for "turistforening\|dnt" |
| `beds` | beds | Primary source for sleeping spots |
| `capacity` | beds (fallback) | Used if `beds` tag missing |
| `ele` | elevation | Meters above sea level |
| `tourism` | cabinType | alpine_hut / wilderness_hut |
| `website` / `contact:website` | website | |
| `description` | description | |
| `fee` | fee | yes/no → boolean |
| `opening_hours` | season | Parsed: 24/7 → "Helårs" |
| `phone` / `contact:phone` | phone | |
| `shower` | shower | yes/no → boolean |
| `reservation` | cabinType hint | "required" → selvbetjent |
| `self_service` | cabinType hint | "yes" → selvbetjent |

### Tags Available in OSM but NOT Extracted
| Tag | Potential Use | Norwegian Label |
|-----|--------------|-----------------|
| `drinking_water` | yes/no | Drikkevann |
| `internet_access` | yes/no/wlan | Internett |
| `fireplace` | yes/no | Peis / ildsted |
| `access` | yes/permissive/private | Tilgjengelighet |
| `wheelchair` | yes/no/limited | Rullestoltilgang |
| `image` | Photo URL | Bilde |
| `wikidata` | Wikidata entity ID | Lenke til Wikipedia |
| `wikipedia` | Wikipedia article | |
| `amenity` | Nearby amenities | |
| `ref` | Reference number | Referansenummer |

### Data Quality Issues
- OSM is community-maintained — data can be outdated
- Example: Sandhaug shows 42 beds, DNT says 49
- `beds` vs `capacity` semantics vary by editor
- Many cabins lack optional tags (shower, fireplace, etc.)

## Potential Alternative: DNT / ut.no

### Known APIs (as of 2025)
- **Nasjonalturbase (UT.no)** — DNT's geodata platform
  - Was partially open via `api.nasjonalturbase.no` (required API key)
  - Provided: cabins, routes, areas, POIs with rich metadata
  - Status: Unknown if still open — check below
- **UT.no website** — ut.no/hytte/{id} pages have structured data
- **Kartverket N50** — has cabin point data but no capacity/amenity info

### What DNT Data Would Give Us (if API available)
- Accurate bed count (sengeplasser)
- Cabin photos
- Detailed descriptions (Norwegian)
- Booking links
- Facilities (dusj, tørkerom, strøm, mobildekning, etc.)
- Route connections
- Seasonal opening dates (exact, not just "Helårs")
- DNT membership pricing
- GPS coordinates (verified)
- Cabin warden contact info
