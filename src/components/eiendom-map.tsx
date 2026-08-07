"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Polygon, CircleMarker, useMapEvents, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLngBoundsExpression } from "leaflet";
import { Search, MapPin, Loader2, X, ChevronUp, LocateFixed, ExternalLink, Map as MapIcon, Layers, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FlyTo, DataDisclaimer, MapError, useDebounceRef, MAP_HEIGHT, TILE_LAYERS, useGeolocation, type Address, type TileLayerKey } from "@/lib/map-utils";
import { InfoModal } from "@/components/info-modal";
import { TileToggle } from "@/components/tile-toggle";
import { useInitialPosition } from "@/lib/use-initial-position";
import { polygonAreaM2, formatM2, formatMal } from "@/lib/geodesic-area";
import { kommuneSlug } from "@/lib/kommune-slug";

interface TeigProperties {
  matrikkelnummertekst: string;
  kommunenummer: string;
  gardsnummer: number;
  bruksnummer: number;
  festenummer: number;
  seksjonsnummer: number;
  hovedområde: boolean;
  nøyaktighetsklasseteig: string | null;
  meterFraPunkt: number;
  oppdateringsdato: string | null;
  teigmedflerematrikkelenheter: boolean;
  uregistrertjordsameie: boolean;
  lokalid: number;
}

interface TeigFeature {
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
  properties: TeigProperties;
}

interface SelectedParcel {
  primary: TeigFeature;
  others: TeigFeature[];
  areaM2: number;
  clickPoint: { lat: number; lon: number };
  addressName: string | null;
  kommunenavn: string | null;
  /** Bump to re-trigger the fit-bounds fly for a new selection */
  fitKey: number;
}

/** GeoJSON [lon, lat] rings → Leaflet [lat, lng] positions, incl. holes. */
function toLeafletRings(f: TeigFeature): [number, number][][] {
  const polys =
    f.geometry.type === "MultiPolygon"
      ? (f.geometry.coordinates as number[][][][])
      : [f.geometry.coordinates as number[][][]];
  return polys.flatMap((rings) => rings.map((ring) => ring.map(([lon, lat]) => [lat, lon] as [number, number])));
}

function featureAreaM2(f: TeigFeature): number {
  if (f.geometry.type === "MultiPolygon") {
    return (f.geometry.coordinates as number[][][][]).reduce(
      (sum, rings) => sum + polygonAreaM2(rings as [number, number][][]),
      0
    );
  }
  return polygonAreaM2(f.geometry.coordinates as [number, number][][]);
}

function seEiendomUrl(p: TeigProperties): string {
  return `https://seeiendom.kartverket.no/eiendom/${p.kommunenummer}/${p.gardsnummer}/${p.bruksnummer}/${p.festenummer}/${p.seksjonsnummer}`;
}

/** Matrikkelen accuracy classes are color-coded; map to our semantic tones. */
function accuracyStyle(klasse: string | null): { bg: string; fg: string; label: string } {
  const k = (klasse ?? "").toLowerCase();
  if (k.includes("grøn")) return { bg: "var(--kv-positive-light)", fg: "var(--kv-positive-dark)", label: "God nøyaktighet" };
  if (k.includes("gul")) return { bg: "var(--kv-warning-light)", fg: "var(--kv-warning-dark)", label: "Middels nøyaktighet" };
  if (k.includes("rød") || k.includes("oransje")) return { bg: "var(--kv-negative-light)", fg: "var(--kv-negative-dark)", label: "Lav nøyaktighet" };
  return { bg: "var(--muted)", fg: "var(--foreground)", label: "Ukjent nøyaktighet" };
}

/** Adresse-APIet returnerer kommunenavn i store bokstaver ("OSLO") — title-case it. */
function normalizeKommunenavn(n: string): string {
  if (n !== n.toUpperCase()) return n;
  return n.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Below this zoom a click can't plausibly be aimed at a specific parcel. */
const MIN_SELECT_ZOOM = 12;

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lon: number, zoom: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng, e.target.getZoom());
    },
  });
  return null;
}

/** Fly the map to fit the selected parcel whenever fitKey changes. */
function FitParcel({ bounds, fitKey }: { bounds: LatLngBoundsExpression | null; fitKey: number }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 17, duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
  return null;
}

export function EiendomMap() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Address[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selected, setSelected] = useState<SelectedParcel | null>(null);
  const [loadingParcel, setLoadingParcel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [tileLayer, setTileLayer] = useState<TileLayerKey>("kart");
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lon: number } | null>(null);

  const [zoomHint, setZoomHint] = useState(false);

  const debounceRef = useDebounceRef();
  const fitCounter = useRef(0);
  const requestSeq = useRef(0);
  const zoomHintTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (zoomHintTimeout.current) clearTimeout(zoomHintTimeout.current);
    };
  }, []);

  const searchAddresses = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    setLoadingSuggestions(true);
    try {
      const res = await fetch(`/api/sok?q=${encodeURIComponent(q)}&n=6`);
      const data = (await res.json()) as { adresser?: Address[] };
      setSuggestions(data.adresser ?? []);
      setShowDropdown(true);
    } catch {
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setHighlightedIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchAddresses(val), 300);
  };

  const fetchParcel = useCallback(async (lat: number, lon: number, addressHint?: string) => {
    const seq = ++requestSeq.current;
    setError(null);
    setLoadingParcel(true);
    try {
      const [parcelRes, addrRes] = await Promise.allSettled([
        fetch(`/api/eiendom?lat=${lat}&lon=${lon}`).then((r) => {
          if (!r.ok) throw new Error("upstream");
          return r.json();
        }),
        addressHint
          ? Promise.resolve(null)
          : fetch(`/api/sok?lat=${lat}&lon=${lon}&radius=150&n=1`).then((r) => r.json()),
      ]);
      if (seq !== requestSeq.current) return; // stale response, a newer click won

      if (parcelRes.status === "rejected") {
        setError("Kunne ikke hente eiendomsdata. Prøv igjen.");
        return;
      }
      const features = ((parcelRes.value as { features?: TeigFeature[] }).features ?? []).filter(
        (f) => f.geometry?.coordinates?.length
      );
      if (features.length === 0) {
        setError("Fant ingen registrert eiendom her.");
        return;
      }

      // Nearest teig first; hovedområde breaks ties
      features.sort(
        (a, b) =>
          a.properties.meterFraPunkt - b.properties.meterFraPunkt ||
          Number(b.properties.hovedområde) - Number(a.properties.hovedområde)
      );
      const primary = features[0];

      let addressName = addressHint ?? null;
      let kommunenavn: string | null = null;
      if (addrRes.status === "fulfilled" && addrRes.value) {
        const hit = (addrRes.value as { adresser?: Array<{ adressetekst: string; poststed: string; kommunenavn: string }> })
          .adresser?.[0];
        if (hit) {
          addressName = addressName ?? `${hit.adressetekst}, ${hit.poststed}`;
          kommunenavn = normalizeKommunenavn(hit.kommunenavn);
        }
      }
      if (!kommunenavn) {
        try {
          const info = await fetch(
            `https://ws.geonorge.no/kommuneinfo/v1/kommuner/${primary.properties.kommunenummer}`
          ).then((r) => (r.ok ? r.json() : null));
          kommunenavn = (info as { kommunenavnNorsk?: string; kommunenavn?: string } | null)?.kommunenavnNorsk ?? null;
        } catch {
          /* name is cosmetic — keep going without it */
        }
      }
      if (seq !== requestSeq.current) return;

      fitCounter.current += 1;
      setSelected({
        primary,
        others: features.slice(1).filter((f) => f.properties.meterFraPunkt === 0),
        areaM2: featureAreaM2(primary),
        clickPoint: { lat, lon },
        addressName,
        kommunenavn,
        fitKey: fitCounter.current,
      });
      setShowSheet(false);
    } catch {
      if (seq === requestSeq.current) setError("Kunne ikke hente eiendomsdata. Prøv igjen.");
    } finally {
      if (seq === requestSeq.current) setLoadingParcel(false);
    }
  }, []);

  const handleMapClick = useCallback(
    (lat: number, lon: number, zoom: number) => {
      setShowDropdown(false);
      if (zoom < MIN_SELECT_ZOOM) {
        setZoomHint(true);
        if (zoomHintTimeout.current) clearTimeout(zoomHintTimeout.current);
        zoomHintTimeout.current = setTimeout(() => setZoomHint(false), 3500);
        return;
      }
      if (lat < 57 || lat > 81.5 || lon < 4 || lon > 32) {
        setError("Utenfor Norge — matrikkelen dekker bare norske eiendommer.");
        return;
      }
      fetchParcel(lat, lon);
    },
    [fetchParcel]
  );

  const handleSelect = (addr: Address) => {
    setShowDropdown(false);
    setSuggestions([]);
    setQuery(`${addr.adressetekst}, ${addr.poststed}`);
    const { lat, lon } = addr.representasjonspunkt;
    setFlyTarget({ lat, lon });
    fetchParcel(lat, lon, `${addr.adressetekst}, ${addr.poststed}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[highlightedIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }
  };

  const { locating, locateError, locate: handleLocate } = useGeolocation(
    useCallback(
      (lat: number, lon: number) => {
        setFlyTarget({ lat, lon });
        fetchParcel(lat, lon);
      },
      [fetchParcel]
    ),
    useCallback(() => {
      setFlyTarget({ lat: 59.9139, lon: 10.7522 });
    }, [])
  );

  // Deep link: /eiendom?lat=&lon=&z= selects the parcel at that point
  useInitialPosition((lat, lon) => {
    setFlyTarget({ lat, lon });
    fetchParcel(lat, lon);
  });

  const clearSelection = () => {
    setSelected(null);
    setShowSheet(false);
  };

  const primaryProps = selected?.primary.properties;
  const accuracy = primaryProps ? accuracyStyle(primaryProps.nøyaktighetsklasseteig) : null;
  const parcelBounds: LatLngBoundsExpression | null = selected
    ? (toLeafletRings(selected.primary)[0] as LatLngBoundsExpression)
    : null;
  const stedsprofilHref =
    primaryProps && selected?.kommunenavn
      ? `/kommune/${kommuneSlug(primaryProps.kommunenummer, selected.kommunenavn)}`
      : null;

  return (
    <div className="flex flex-col" style={{ height: MAP_HEIGHT }}>
      {/* Search bar */}
      <div className="relative z-[1000] px-4 py-4 md:px-8 shrink-0 bg-background border-b">
        <div className="max-w-xl mx-auto relative flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 bg-background border rounded-xl px-4 py-3">
              {loadingSuggestions ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <input
                value={query}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder="Søk etter adresse, eller klikk i kartet..."
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="search"
                className="flex-1 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring text-foreground placeholder:text-muted-foreground text-[16px] sm:text-sm"
              />
            </div>
            <Button
              onClick={handleLocate}
              disabled={locating}
              variant="secondary"
              size="icon"
              aria-label="Min posisjon"
              className="shadow-lg shrink-0 h-11 w-11 rounded-xl"
            >
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            </Button>
            <Button
              onClick={() => setShowInfo(true)}
              variant="secondary"
              size="icon"
              aria-label="Om data"
              className="shadow-lg shrink-0 h-11 w-11 rounded-xl"
            >
              <Info className="h-4 w-4" />
            </Button>
          </div>

          {showDropdown && suggestions.length > 0 && (
            <ul className="absolute top-full mt-1 left-0 right-0 bg-background rounded-xl shadow-xl border overflow-hidden">
              {suggestions.map((addr, i) => (
                <li key={i}>
                  <button
                    onMouseDown={() => handleSelect(addr)}
                    className={`w-full text-left px-4 py-3 text-sm flex items-start gap-3 transition-colors border-b last:border-0 ${highlightedIndex === i ? "bg-muted" : "hover:bg-muted"}`}
                  >
                    <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{addr.adressetekst}</p>
                      <p className="text-xs text-foreground/70">
                        {addr.poststed}, {addr.kommunenavn}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Map — crosshair signals "pick a point", grabbing only while dragging */}
      <div className="relative grow [&_.leaflet-grab]:cursor-crosshair [&_.leaflet-dragging_.leaflet-grab]:cursor-grabbing">
        {locateError && (
          <div className="absolute bottom-20 sm:top-3 sm:bottom-auto left-1/2 -translate-x-1/2 z-[1000] bg-background/90 backdrop-blur-sm border rounded-full px-4 py-2 shadow-lg">
            <p className="text-sm text-muted-foreground">Kunne ikke finne posisjon, viser Oslo i stedet.</p>
          </div>
        )}
        {error && <MapError message={error} onRetry={() => setError(null)} />}
        {zoomHint && (
          <div className="absolute bottom-20 sm:top-3 sm:bottom-auto left-1/2 -translate-x-1/2 z-[1000] bg-background/90 backdrop-blur-sm border rounded-full px-4 py-2 shadow-lg">
            <p className="text-sm text-muted-foreground">Zoom nærmere inn for å velge en eiendom.</p>
          </div>
        )}

        <MapContainer center={[65, 14]} zoom={5} style={{ height: "100%", width: "100%" }} zoomControl>
          <MapClickHandler onMapClick={handleMapClick} />
          <TileLayer
            key={tileLayer}
            url={TILE_LAYERS[tileLayer].url}
            attribution={TILE_LAYERS[tileLayer].attribution}
            maxZoom={17}
          />
          {flyTarget && <FlyTo lat={flyTarget.lat} lon={flyTarget.lon} zoom={16} />}
          {selected && (
            <>
              <FitParcel bounds={parcelBounds} fitKey={selected.fitKey} />
              <Polygon
                positions={toLeafletRings(selected.primary)}
                pathOptions={{
                  color: "#2563eb",
                  weight: 2.5,
                  fillColor: "#2563eb",
                  fillOpacity: 0.15,
                }}
              />
              {selected.others.map((f) => (
                <Polygon
                  key={f.properties.lokalid}
                  positions={toLeafletRings(f)}
                  pathOptions={{ color: "#64748b", weight: 1.5, dashArray: "4 4", fillOpacity: 0.05 }}
                />
              ))}
              <CircleMarker
                center={[selected.clickPoint.lat, selected.clickPoint.lon]}
                radius={4}
                pathOptions={{ color: "#24374c", fillColor: "#24374c", fillOpacity: 0.9 }}
              />
            </>
          )}
        </MapContainer>

        {/* Tile layer toggle */}
        <div className="absolute top-3 right-3 z-[999]">
          <TileToggle
            value={tileLayer}
            onChange={setTileLayer}
            options={[
              { value: "kart", label: "Kart", icon: <MapIcon className="h-3.5 w-3.5" /> },
              { value: "gråtone", label: "Gråtone", icon: <Layers className="h-3.5 w-3.5" /> },
            ]}
          />
        </div>

        {/* Loading pill */}
        {loadingParcel && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[999] bg-background/90 backdrop-blur-sm border rounded-full px-4 py-2 shadow-lg flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Henter eiendom...</p>
          </div>
        )}

        {/* Compact info card */}
        {selected && primaryProps && accuracy && !showSheet && (
          <div
            className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-96 z-[999] bg-card rounded-2xl shadow-xl px-4 py-4"
            style={{ border: "1.5px solid var(--border)" }}
          >
            <button
              onClick={clearSelection}
              className="absolute top-0 right-0 p-2.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Lukk"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-start justify-between gap-3 pr-6">
              <div className="min-w-0">
                <p className="text-xl font-extrabold leading-tight" style={{ color: "var(--kv-blue)" }}>
                  {primaryProps.matrikkelnummertekst}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-1">
                  {selected.addressName ?? "Gnr/bnr"}
                  {selected.kommunenavn ? ` · ${selected.kommunenavn}` : ""}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xl font-extrabold leading-tight whitespace-nowrap" style={{ color: "var(--kv-blue)" }}>
                  {formatM2(selected.areaM2)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{formatMal(selected.areaM2)}</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 mt-1">
              <span
                className="text-xs font-medium rounded-full px-2 py-0.5"
                style={{ background: accuracy.bg, color: accuracy.fg }}
              >
                {accuracy.label}
              </span>
              {selected.others.length > 0 && (
                <span className="text-xs text-muted-foreground">+{selected.others.length} teig her</span>
              )}
            </div>

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setShowSheet(true)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl text-white transition-colors hover:opacity-90"
                style={{ background: "var(--kv-blue)" }}
              >
                <ChevronUp className="h-3.5 w-3.5" /> Vis mer
              </button>
              <a
                href={seEiendomUrl(primaryProps)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border bg-muted/50 hover:bg-muted transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Se eiendom
              </a>
            </div>
          </div>
        )}

        {/* Empty-state hint */}
        {!selected && !loadingParcel && (
          <div className="absolute inset-0 flex items-end justify-center pb-8 pointer-events-none z-[998]">
            <div className="bg-card/90 backdrop-blur-sm rounded-xl px-5 py-3 shadow text-sm text-muted-foreground">
              Søk på en adresse, eller zoom inn og klikk i kartet for å se tomtegrenser og areal
            </div>
          </div>
        )}
      </div>

      {/* Detail sheet */}
      <Sheet open={showSheet && !!selected} onOpenChange={setShowSheet}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85svh] overflow-y-auto">
          {selected && primaryProps && accuracy && (
            <div className="mx-auto w-full max-w-md px-4 pb-6">
              <SheetHeader>
                <SheetTitle className="text-left sr-only">
                  Eiendom {primaryProps.matrikkelnummertekst}
                </SheetTitle>
              </SheetHeader>

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xl font-extrabold leading-tight" style={{ color: "var(--kv-blue)" }}>
                    {primaryProps.matrikkelnummertekst}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selected.addressName ?? "Matrikkelenhet"}
                    {selected.kommunenavn ? ` · ${selected.kommunenavn}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-extrabold leading-tight whitespace-nowrap" style={{ color: "var(--kv-blue)" }}>
                    {formatM2(selected.areaM2)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{formatMal(selected.areaM2)}</p>
                </div>
              </div>

              {/* Detaljer */}
              <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Gårdsnummer</p>
                  <p className="font-semibold">{primaryProps.gardsnummer}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Bruksnummer</p>
                  <p className="font-semibold">{primaryProps.bruksnummer}</p>
                </div>
                {primaryProps.festenummer > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">Festenummer</p>
                    <p className="font-semibold">{primaryProps.festenummer}</p>
                  </div>
                )}
                {primaryProps.seksjonsnummer > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">Seksjonsnummer</p>
                    <p className="font-semibold">{primaryProps.seksjonsnummer}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Kommune</p>
                  <p className="font-semibold">
                    {selected.kommunenavn ?? "—"}{" "}
                    <span className="text-xs font-normal text-muted-foreground">({primaryProps.kommunenummer})</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Grensenøyaktighet</p>
                  <p>
                    <span
                      className="text-xs font-medium rounded-full px-2 py-0.5"
                      style={{ background: accuracy.bg, color: accuracy.fg }}
                    >
                      {accuracy.label}
                    </span>
                  </p>
                </div>
              </div>

              {primaryProps.teigmedflerematrikkelenheter && (
                <p className="mt-3 text-xs text-foreground/80 leading-relaxed rounded-lg px-3 py-2" style={{ background: "var(--kv-info-light)", color: "var(--kv-info-dark)" }}>
                  Denne teigen deles av flere matrikkelenheter. Arealet gjelder hele teigen, ikke bare {primaryProps.matrikkelnummertekst}.
                </p>
              )}
              {primaryProps.uregistrertjordsameie && (
                <p className="mt-3 text-xs text-foreground/80 leading-relaxed rounded-lg px-3 py-2" style={{ background: "var(--kv-warning-light)", color: "var(--kv-warning-dark)" }}>
                  Uregistrert jordsameie — eierforholdet er ikke fullstendig avklart i matrikkelen.
                </p>
              )}

              {/* Andre teiger på samme punkt */}
              {selected.others.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Flere teiger på dette punktet
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {selected.others.map((f) => (
                      <li key={f.properties.lokalid} className="flex items-center justify-between text-sm">
                        <span className="font-medium">{f.properties.matrikkelnummertekst}</span>
                        <span className="text-xs text-muted-foreground">{formatM2(featureAreaM2(f))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Areal-forklaring */}
              <p className="mt-4 pt-4 border-t text-xs text-foreground/80 leading-relaxed">
                Arealet er beregnet geometrisk fra teiggrensene i matrikkelen og kan avvike noe fra det
                offisielt registrerte arealet, særlig der grensenøyaktigheten er lav.
              </p>

              {/* Links */}
              <div className="mt-4 flex flex-col gap-2">
                <a
                  href={seEiendomUrl(primaryProps)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-xl text-white transition-colors hover:opacity-90"
                  style={{ background: "var(--kv-blue)" }}
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Se eiendom hos Kartverket
                </a>
                {stedsprofilHref && (
                  <a
                    href={stedsprofilHref}
                    className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-xl border bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <MapPin className="h-3.5 w-3.5" /> Se full stedsprofil for {selected.kommunenavn}
                  </a>
                )}
              </div>

              <div className="mt-4 pt-4 border-t flex flex-col gap-3">
                <p className="text-xs text-foreground/70 text-center">
                  Kilde: Kartverket, matrikkelen (åpne data, NLOD)
                </p>
                <DataDisclaimer />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Info modal */}
      <InfoModal open={showInfo} onClose={() => setShowInfo(false)} title="Om tomtegrenser">
        <p>
          Klikk hvor som helst i kartet for å se <span className="font-medium text-foreground">tomtegrensene</span> for
          eiendommen på punktet, sammen med gårds- og bruksnummer og beregnet areal.
        </p>
        <p>
          Dataene kommer fra <span className="font-medium text-foreground">matrikkelen</span>, Norges offisielle
          eiendomsregister, via Kartverkets åpne eiendoms-API. Grensene oppdateres løpende av kommunene.
        </p>
        <p>
          <span className="font-medium text-foreground">Nøyaktigheten varierer:</span> grenser i tettbygde strøk er
          som regel nøyaktig innmålt, mens eldre grenser i utmark kan avvike betydelig. Nøyaktighetsklassen vises for
          hver eiendom.
        </p>
        <p>
          Arealet beregnes geometrisk fra grensene og vises i m² og mål (1 mål = 1000 m²). Informasjon om{" "}
          <span className="font-medium text-foreground">eierforhold</span> er ikke del av de åpne dataene — bruk
          Kartverkets «Se eiendom» for mer.
        </p>
        <div className="flex gap-3 mt-1">
          <a
            href="https://www.kartverket.no/api-og-data/eiendomsdata"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Kartverket
          </a>
          <a
            href="https://seeiendom.kartverket.no"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Se eiendom
          </a>
        </div>
      </InfoModal>
    </div>
  );
}
