"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import { Loader2, Zap, LocateFixed, ExternalLink, Info, Map as MapIcon, Layers, SlidersHorizontal, Check, ChevronUp, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useMapSearch, MapSearchBar } from "@/components/map-search";
import { isInNorway, OSLO } from "@/lib/fylker";
import { FlyTo, DataDisclaimer, MapError, MAP_HEIGHT } from "@/lib/map-utils";
import { CompactCard } from "@/components/compact-card";
import { InfoModal } from "@/components/info-modal";
import { TileToggle } from "@/components/tile-toggle";
import { MapLoading } from "@/components/map-loading";
import { DriveLink } from "@/components/drive-link";
import type { KommuneEntry, Suggestion } from "@/lib/map-utils";

interface Connector {
  type: string;
  count: number;
  kw: number | null;
}

interface Station {
  id: string;
  lat: number;
  lon: number;
  name: string;
  operator: string | null;
  owner: string | null;
  address: string | null;
  city: string | null;
  zipcode: string | null;
  municipality: string | null;
  county: string | null;
  numPoints: number | null;
  maxKw: number | null;
  connectors: Connector[];
  open24h: boolean;
  parkingFee: boolean;
  locationType: string | null;
  availability: string | null;
  nobilId: number;
}

const TILE_LAYERS = {
  kart: {
    label: "Kart",
    url: "https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png",
    attribution: '&copy; <a href="https://www.kartverket.no/">Kartverket</a>',
  },
  gråtone: {
    label: "Gråtone",
    url: "https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png",
    attribution: '&copy; <a href="https://www.kartverket.no/">Kartverket</a>',
  },
} as const;

type TileLayerKey = keyof typeof TILE_LAYERS;

const chargingIconCache = new Map<string, L.DivIcon>();
function chargingIcon(isSelected: boolean, inverted: boolean): L.DivIcon {
  const key = `${isSelected}-${inverted}`;
  const cached = chargingIconCache.get(key);
  if (cached) return cached;

  const size = 28;
  const bg = inverted ? (isSelected ? "#24374c" : "#15803d") : "white";
  const iconColor = inverted ? "white" : (isSelected ? "#24374c" : "#15803d");
  const border = isSelected ? "#24374c" : inverted ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.15)";
  const bolt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;

  const icon = L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;line-height:0;background:${bg};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.25);border:2.5px solid ${border}">${bolt}</div>`,
  });
  chargingIconCache.set(key, icon);
  return icon;
}


function PanToSelected({ station }: { station: Station | null }) {
  const map = useMap();
  useEffect(() => {
    if (!station) return;
    map.panTo([station.lat, station.lon], { animate: true, duration: 0.4 });
  }, [station, map]);
  return null;
}

export function ChargingMap() {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [counting, setCounting] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("Henter ladestasjoner...");
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(false);
  const [error, setError] = useState(false);
  const [showConnectorInfo, setShowConnectorInfo] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [filterConnectors, setFilterConnectors] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Station | null>(null);
  const [center, setCenter] = useState<{ lat: number; lon: number; zoom?: number; _t?: number } | null>(null);
  const [tileLayer, setTileLayer] = useState<TileLayerKey>("gråtone");

  const kommunerRef = useRef<KommuneEntry[]>([]);
  const setQueryRef = useRef<(q: string) => void>(() => {});


  const loadStations = useCallback(async () => {
    setError(false);
    setLoading(true);
    setLoadingMessage("Henter ladestasjoner...");
    try {
      const r = await fetch("/data/stations.json");
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        setStations(data);
        setLoadedCount(data.length);
        setCounting(true);
        setLoading(false);
        setTimeout(() => setCounting(false), 800);
      } else {
        setError(true);
        setLoading(false);
      }
    } catch {
      setError(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStations(); }, [loadStations]);


  useEffect(() => {
    fetch("https://ws.geonorge.no/kommuneinfo/v1/kommuner")
      .then((r) => r.json())
      .then((data: KommuneEntry[]) => { kommunerRef.current = data; })
      .catch(() => {});
  }, []);

  const handleSearchSelect = useCallback(async (s: Suggestion) => {
    setSelected(null);
    if (s.type === "fylke") {
      setQueryRef.current(s.fylkesnavn);
      setCenter({ lat: s.lat, lon: s.lon, zoom: s.zoom });
      return;
    }
    if (s.type === "kommune") {
      setQueryRef.current(s.kommunenavn);
      const res = await fetch(
        `https://ws.geonorge.no/stedsnavn/v1/navn?sok=${encodeURIComponent(s.kommunenavn)}&kommunenummer=${s.kommunenummer}&treffPerSide=1`
      );
      const data = await res.json();
      const point = data.navn?.[0]?.representasjonspunkt;
      if (point) {
        setCenter({ lat: point.nord, lon: point.øst });
      }
    } else if (s.type === "adresse") {
      setQueryRef.current(`${s.addr.adressetekst}, ${s.addr.poststed}`);
      setCenter({ lat: s.addr.representasjonspunkt.lat, lon: s.addr.representasjonspunkt.lon });
    }
  }, []);

  const searchProps = useMapSearch({
    kommuneList: kommunerRef.current,
    onSelect: handleSearchSelect,
  });
  setQueryRef.current = searchProps.setQuery;

  const handleLocate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    setLocateError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setSelected(null);
        const { latitude: lat, longitude: lon } = pos.coords;
        if (isInNorway(lat, lon)) {
          setCenter({ lat, lon, zoom: 12, _t: Date.now() });
        } else {
          setCenter({ lat: OSLO.lat, lon: OSLO.lon, zoom: OSLO.zoom, _t: Date.now() });
        }
      },
      () => {
        setLocating(false);
        setCenter({ lat: OSLO.lat, lon: OSLO.lon, zoom: OSLO.zoom, _t: Date.now() });
        setLocateError(true);
        setTimeout(() => setLocateError(false), 4000);
      },
      { timeout: 15000, maximumAge: 60000 }
    );
  };

  // All unique connector types across loaded stations
  const allConnectors = useMemo(() => {
    const set = new Set<string>();
    stations.forEach((s) => s.connectors.forEach((c) => set.add(c.type)));
    return [...set].sort();
  }, [stations]);

  const filteredStations = useMemo(() => {
    if (filterConnectors.size === 0) return stations;
    return stations.filter((s) => s.connectors.some((c) => filterConnectors.has(c.type)));
  }, [stations, filterConnectors]);

  const activeFilterCount = filterConnectors.size;

  const toggleConnector = (c: string) => {
    setFilterConnectors((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  return (
    <div className="flex flex-col" style={{ height: MAP_HEIGHT }}>
      {/* Search bar */}
      <div className="relative z-[1000] px-4 py-4 md:px-8 shrink-0 bg-background border-b">
        <div className="max-w-xl mx-auto relative flex flex-col gap-2">
            <MapSearchBar search={searchProps} placeholder="Søk etter adresse eller sted...">
            <Sheet open={showFilter} onOpenChange={(open) => { setShowFilter(open); if (open) setShowInfoSheet(false); }}>
              <SheetTrigger
                render={
                  <Button variant="secondary" size="icon" className="relative shadow-lg shrink-0 h-11 w-11 rounded-xl" disabled={allConnectors.length === 0}>
                    <SlidersHorizontal className="h-4 w-4" />
                    {activeFilterCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                }
              />
              <SheetContent side="bottom" className="rounded-t-2xl max-h-[70svh] overflow-y-auto">
                <div className="mx-auto w-full max-w-md px-2">
                  <SheetHeader>
                    <SheetTitle className="text-left">Filtrer ladestasjoner</SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col gap-4 py-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70 mb-2">Kontakttype</p>
                      <div className="rounded-xl border overflow-hidden">
                        {allConnectors.map((c) => {
                          const active = filterConnectors.has(c);
                          const count = stations.filter((s) => s.connectors.some((cn) => cn.type === c)).length;
                          return (
                            <button
                              key={c}
                              onClick={() => toggleConnector(c)}
                              className={`flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors border-b last:border-0 ${active ? "bg-background" : "bg-muted/40 text-muted-foreground"}`}
                            >
                              <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${active ? "border-primary bg-primary" : "border-muted-foreground/30 bg-background"}`}>
                                {active && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                              </div>
                              <span className="font-medium flex-1 text-left">{c}</span>
                              <span className="text-xs text-foreground/70 tabular-nums">{count}</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-foreground/70 mt-2">Ingen valgt = vis alle. Velg én eller flere for å filtrere.</p>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={() => setFilterConnectors(new Set())}
                      >
                        Nullstill
                      </Button>
                      <Button className="flex-1" onClick={() => setShowFilter(false)}>
                        Vis {filteredStations.length} stasjoner
                      </Button>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <Button onClick={handleLocate} disabled={locating || loading} variant="secondary" size="icon" className="shadow-lg shrink-0 h-11 w-11 rounded-xl">
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            </Button>
            </MapSearchBar>
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-foreground/70">
            {loading ? loadingMessage : stations.length > 0 ? `${filteredStations.length}${filterConnectors.size > 0 ? ` av ${stations.length}` : ""} ladestasjoner i Norge · Kilde: NOBIL / Enova` : "Ingen ladestasjoner funnet"}
          </p>
          <button
            disabled
            title="Krever sanntidsdata, kommer snart"
            className="relative inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border bg-muted text-foreground/70 opacity-50 cursor-not-allowed shrink-0"
          >
            <Zap className="h-3 w-3" />
            Kun ledige
            <span className="absolute -top-1.5 -right-1.5 text-[9px] px-1 rounded-full bg-foreground text-background font-bold leading-4">Snart</span>
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="relative grow">
        <MapLoading
          visible={loading || counting}
          loading={loading}
          counting={counting}
          count={loadedCount}
          countLabel="datapunkter lastet"
          loadingMessage={loadingMessage}
        />
        {locating && (
          <div className="absolute bottom-20 sm:top-3 sm:bottom-auto left-1/2 -translate-x-1/2 z-[1000] bg-background/90 backdrop-blur-sm border rounded-full px-4 py-2 shadow-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Finner posisjon...
            </div>
          </div>
        )}
        {locateError && (
          <div className="absolute bottom-20 sm:top-3 sm:bottom-auto left-1/2 -translate-x-1/2 z-[1000] bg-background/90 backdrop-blur-sm border rounded-full px-4 py-2 shadow-lg">
            <p className="text-sm text-muted-foreground">Kunne ikke finne posisjon, viser Oslo i stedet.</p>
          </div>
        )}
        {error && <MapError message="Kunne ikke hente ladestasjoner." onRetry={loadStations} />}

        <MapContainer
          center={[65, 14]}
          zoom={5}
          style={{ height: "100%", width: "100%" }}
        >
          {center && <FlyTo lat={center.lat} lon={center.lon} zoom={center.zoom} _t={center._t} />}
          <PanToSelected station={selected} />
          <TileLayer
            key={tileLayer}
            url={TILE_LAYERS[tileLayer].url}
            attribution={TILE_LAYERS[tileLayer].attribution}
            maxZoom={17}
          />
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={60}
            spiderfyOnMaxZoom
            showCoverageOnHover={false}
            iconCreateFunction={(cluster: { getChildCount: () => number }) => {
              const count = cluster.getChildCount();
              let size = 36;
              let fontSize = 13;
              if (count >= 100) { size = 44; fontSize = 14; }
              if (count >= 500) { size = 52; fontSize = 15; }
              return L.divIcon({
                html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:#15803d;color:white;border-radius:50%;font-weight:700;font-size:${fontSize}px;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid rgba(255,255,255,0.6)">${count}</div>`,
                className: "",
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2],
              });
            }}
          >
            {filteredStations.map((s) => (
              <Marker
                key={s.id}
                position={[s.lat, s.lon]}
                icon={chargingIcon(selected?.id === s.id, tileLayer === "gråtone")}
                eventHandlers={{
                  click() {
                    setSelected((prev) => (prev?.id === s.id ? null : s));
                  },
                }}
              />
            ))}
          </MarkerClusterGroup>
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

        {/* Compact info card */}
        <CompactCard visible={!!selected && !showInfoSheet} onClose={() => setSelected(null)}>
          {selected && (<>
            <CompactCard.Header title={selected.name} metric={selected.maxKw ?? undefined} metricUnit="kW" />
            <CompactCard.Context>
              <CompactCard.ContextLeft>
                <CompactCard.ContextText>{[selected.operator !== selected.name ? selected.operator : null, selected.open24h ? "Åpent: 24t" : null].filter(Boolean).join(" · ")}</CompactCard.ContextText>
              </CompactCard.ContextLeft>
              <CompactCard.ContextRight>
                {selected.numPoints != null && <CompactCard.ContextText>{selected.numPoints} punkt</CompactCard.ContextText>}
              </CompactCard.ContextRight>
            </CompactCard.Context>
            <CompactCard.Actions>
              <CompactCard.Action primary onClick={() => { setShowInfoSheet(true); setShowFilter(false); }} icon={<ChevronUp className="h-3.5 w-3.5" />}>Vis mer</CompactCard.Action>
              <CompactCard.Action href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lon}`} icon={<Navigation className="h-3.5 w-3.5" />}>Kjør hit</CompactCard.Action>
            </CompactCard.Actions>
          </>)}
        </CompactCard>

        {/* Info detail sheet */}
        <Sheet open={showInfoSheet && !!selected} onOpenChange={(open) => { setShowInfoSheet(open); }}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[85svh] overflow-y-auto">
            {selected && (
              <div className="mx-auto w-full max-w-md px-4 pb-6">
                <SheetHeader>
                  <SheetTitle className="text-left sr-only">{selected.name}</SheetTitle>
                </SheetHeader>

                {/* Layer 1 — Identity */}
                <div className="flex items-center gap-1.5 mb-1">
                  {selected.open24h && (
                    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">Åpent 24t</span>
                  )}
                  {!selected.parkingFee && (
                    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">Gratis parkering</span>
                  )}
                  {selected.parkingFee && (
                    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">Parkeringsavgift</span>
                  )}
                </div>
                <p className="font-bold text-lg leading-snug">{selected.name}</p>
                {selected.operator && selected.operator !== selected.name && (
                  <p className="text-sm text-muted-foreground">{selected.operator}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  {[selected.address, selected.zipcode, selected.city].filter(Boolean).join(" ")}
                  {selected.municipality && selected.municipality !== selected.city && ` · ${selected.municipality}`}
                </p>

                {/* Layer 2 — Key metrics */}
                <div className="mt-4 pt-4 border-t">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-3xl font-extrabold" style={{ color: "var(--kv-blue)" }}>
                        {selected.maxKw ?? "–"}
                      </span>
                      <p className="text-[10px] text-foreground/70">maks kW</p>
                    </div>
                    <div>
                      <span className="text-3xl font-extrabold" style={{ color: "var(--kv-blue)" }}>
                        {selected.numPoints ?? "–"}
                      </span>
                      <p className="text-[10px] text-foreground/70">ladepunkter</p>
                    </div>
                  </div>
                </div>

                {/* Layer 3 — Connectors breakdown */}
                {selected.connectors.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs font-semibold text-foreground/70 mb-2">Kontakter</p>
                    <div className="space-y-2">
                      {selected.connectors.map((c) => (
                        <div key={c.type} className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">{c.type}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <span className="text-muted-foreground">{c.count}×</span>
                            {c.kw && <span className="font-semibold" style={{ color: "var(--kv-blue)" }}>{c.kw} kW</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Layer 4 — Station details */}
                {(selected.owner || selected.availability) && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs font-semibold text-foreground/70 mb-2">Detaljer</p>
                    <div className="space-y-1">
                      {selected.owner && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Eier</span>
                          <span className="font-medium">{selected.owner}</span>
                        </div>
                      )}
                      {selected.availability && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Tilgjengelighet</span>
                          <span className="font-medium">{selected.availability}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Layer 5 — Links & source */}
                <div className="mt-4 pt-4 border-t flex flex-col gap-3">
                  <DriveLink lat={selected.lat} lon={selected.lon} />
                  <p className="text-xs text-foreground/70 text-center">
                    Kilde: <a href="https://nobil.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">NOBIL</a> / Enova
                  </p>
                  <DataDisclaimer />
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>

      {/* Connector info modal */}
      <InfoModal open={showConnectorInfo} onClose={() => setShowConnectorInfo(false)} title="Kontakttyper forklart">
        <div className="flex flex-col gap-4">
          {[
                {
                  name: "CCS",
                  tag: "Hurtiglading · DC",
                  desc: "Standard for de fleste nye elbiler (VW, BMW, Hyundai, Ford, Tesla med adapter). Finner du på de fleste hurtigladere langs veien.",
                  speed: "50–350 kW",
                  time: "Ca. 20–45 min (10–80%)",
                },
                {
                  name: "CHAdeMO",
                  tag: "Hurtiglading · DC",
                  desc: "Japansk standard brukt av eldre Nissan Leaf og Mitsubishi. Er på vei ut og erstattes av CCS.",
                  speed: "50–100 kW",
                  time: "Ca. 20–40 min (10–80%)",
                },
                {
                  name: "Type 2",
                  tag: "Normallading · AC",
                  desc: "Vanligste kontakt i Europa. Brukes både hjemme, på jobb og på offentlige ladere. Støttes av nesten alle elbiler.",
                  speed: "3,6–22 kW",
                  time: "Ca. 3–8 timer (full lading)",
                },
                {
                  name: "Schuko",
                  tag: "Langsomlading · AC",
                  desc: "Vanlig stikkontakt. Kan brukes i nødstilfeller, men er ikke anbefalt til daglig lading – tar svært lang tid.",
                  speed: "Ca. 2,3 kW",
                  time: "Ca. 12–20 timer (full lading)",
                },
              ].map((c) => (
                <div key={c.name} className="flex gap-3">
                  <span className="mt-0.5 text-xs font-bold px-2 py-0.5 rounded-full bg-muted text-foreground/70 h-fit shrink-0">{c.name}</span>
                  <div>
                    <p className="text-xs font-semibold text-foreground/70">{c.tag}</p>
                    <p className="text-sm mt-0.5">{c.desc}</p>
                    <p className="text-xs text-foreground/70 mt-1">{c.speed} · {c.time}</p>
                  </div>
                </div>
              ))}
        </div>
      </InfoModal>
    </div>
  );
}
