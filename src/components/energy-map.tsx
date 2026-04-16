"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Polygon, Polyline, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import {
  Loader2,
  X,
  LocateFixed,
  Info,
  Map as MapIcon,
  Layers,
  SlidersHorizontal,
  Check,
  ChevronUp,
  Navigation,
  Anchor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { isInNorway, OSLO } from "@/lib/fylker";
import { FlyTo, DataDisclaimer, MapError, MAP_HEIGHT, useMapCore, useGeolocation } from "@/lib/map-utils";
import type { KommuneEntry, Suggestion, TileLayerKey } from "@/lib/map-utils";
import { MapSearchBar, type MapSearchBarHandle } from "@/components/map-search";
import { useInitialPosition } from "@/lib/use-initial-position";
import { CompactCard } from "@/components/compact-card";
import { MapLoading } from "@/components/map-loading";
import { SelectedHalo } from "@/components/selected-halo";
import { DriveLink } from "@/components/drive-link";
import {
  energyIcon, turbineIcon, oilgasIcon, havvindIcon,
  TYPE_META, WIND_STATUS_META, TILE_LAYERS, MW_THRESHOLD, OILGAS_COLOR, HAVVIND_COLOR,
} from "@/components/energy-map-helpers";
import type {
  EnergyType, WindStatus, EnergyPlant, WindTurbine,
  OilGasFacility, ProductionByField, Pipeline, HavvindZone,
  HydroStationData,
} from "@/components/energy-map-helpers";
import { OilGasSheet, HavvindSheet, EnergyPlantSheet } from "@/components/energy-detail-sheets";

function ZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => onZoom(map.getZoom());
    map.on("zoomend", handler);
    return () => { map.off("zoomend", handler); };
  }, [map, onZoom]);
  return null;
}

function PanToSelected({ plant }: { plant: EnergyPlant | null }) {
  const map = useMap();
  useEffect(() => {
    if (!plant) return;
    map.panTo([plant.lat, plant.lon], { animate: true, duration: 0.4 });
  }, [plant, map]);
  return null;
}

export function EnergyMap() {
  const { loading, setLoading, error, setError, tileLayer, setTileLayer } = useMapCore();
  const [plants, setPlants] = useState<EnergyPlant[]>([]);
  const [turbines, setTurbines] = useState<WindTurbine[]>([]);
  const [havvindZones, setHavvindZones] = useState<HavvindZone[]>([]);
  const [oilGasFacilities, setOilGasFacilities] = useState<OilGasFacility[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [productionData, setProductionData] = useState<ProductionByField>({});
  const [productionFetchedAt, setProductionFetchedAt] = useState<string | null>(null);
  const [selectedOilGas, setSelectedOilGas] = useState<OilGasFacility | null>(null);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [zoomLevel, setZoomLevel] = useState(5);
  const [counting, setCounting] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [filterTypes, setFilterTypes] = useState<Set<EnergyType>>(new Set(["vind", "vann", "havvind", "oilgas"]));
  const [filterWindStatus, setFilterWindStatus] = useState<Set<WindStatus>>(new Set(["operational"]));
  const [showSmall, setShowSmall] = useState(false);
  const [selected, setSelected] = useState<EnergyPlant | null>(null);
  const [selectedHavvind, setSelectedHavvind] = useState<HavvindZone | null>(null);
  const [hydroStation, setHydroStation] = useState<HydroStationData | null>(null);
  const [loadingHydro, setLoadingHydro] = useState(false);
  const [center, setCenter] = useState<{
    lat: number;
    lon: number;
    zoom?: number;
    _t?: number;
  } | null>(null);
  const [showSjokart, setShowSjokart] = useState(false);
  const [showProdInfo, setShowProdInfo] = useState(false);
  const [showFacilityInfo, setShowFacilityInfo] = useState(false);

  const searchBarRef = useRef<MapSearchBarHandle>(null);
  const kommunerRef = useRef<KommuneEntry[]>([]);
  const restoredRef = useRef(false);
  const prevSelectionKey = useRef<string | null>(null);

  // Deep link from /kommune/[slug]: ?lat=&lon=&z= flies to that position
  useInitialPosition((lat, lon, zoom) => {
    setCenter({ lat, lon, zoom, _t: Date.now() });
  });

  const loadPlants = useCallback(async () => {
    setError(false);
    setLoading(true);

    try {
      const res = await fetch("/api/energy");
      const data = await res.json();
      if (data.error || !data.plants) {
        setError(true);
        setLoading(false);
        return;
      }
      setPlants(data.plants);
      setTurbines(data.turbines ?? []);
      setHavvindZones(data.havvindZones ?? []);
      setOilGasFacilities(data.oilGasFacilities ?? []);
      setPipelines(data.pipelines ?? []);
      const total = (data.plants?.length ?? 0) + (data.oilGasFacilities?.length ?? 0) + (data.havvindZones?.length ?? 0);
      setLoadedCount(total);
      setCounting(true);
      setLoading(false);
      setTimeout(() => setCounting(false), 800);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlants();
    fetch("/data/production.json")
      .then((r) => r.json())
      .then((d) => {
        setProductionData(d.fields ?? d);
        if (d.fetchedAt) setProductionFetchedAt(d.fetchedAt);
      })
      .catch(() => {});
  }, [loadPlants]);

  // Sync selection → URL hash. Only runs when selection actually changes
  // (not on mount / strict-mode re-run). Uses absolute pathname in
  // replaceState so Next.js App Router's internal URL state doesn't drift
  // and later concatenate hashes on subsequent Link navigations.
  useEffect(() => {
    const key = selected
      ? `kraft-${selected.id}`
      : selectedOilGas
        ? `anlegg-${selectedOilGas.id}`
        : selectedHavvind
          ? `havvind-${selectedHavvind.id}`
          : null;
    if (key === prevSelectionKey.current) return;
    prevSelectionKey.current = key;
    const path = window.location.pathname;
    if (key) {
      history.replaceState(null, "", `${path}#${key}`);
    } else {
      history.replaceState(null, "", path);
    }
  }, [selected, selectedOilGas, selectedHavvind]);

  // Read URL hash on data load → auto-select. Takes the LAST valid segment
  // from a hash — Next.js App Router has a bug where Link → back → Link
  // to the same route concatenates the old and new hash into #a-X#b-Y.
  useEffect(() => {
    if (restoredRef.current) return;
    if (loading) return;
    restoredRef.current = true;
    const hash = window.location.hash;
    if (!hash) return;
    const segments = hash.split("#").filter(Boolean);
    const last = segments[segments.length - 1];
    const match = last?.match(/^(kraft|anlegg|havvind)-(\d+)$/);
    if (!match) return;
    const [, type, idStr] = match;
    const id = parseInt(idStr, 10);
    if (type === "kraft") {
      const plant = plants.find((p) => p.id === id);
      if (plant) { setSelected(plant); setShowInfoSheet(true); setCenter({ lat: plant.lat, lon: plant.lon, zoom: 12 }); }
    } else if (type === "anlegg") {
      const fac = oilGasFacilities.find((f) => f.id === id);
      if (fac) { setSelectedOilGas(fac); setShowInfoSheet(true); setCenter({ lat: fac.lat, lon: fac.lon, zoom: 12 }); }
    } else if (type === "havvind") {
      const zone = havvindZones.find((z) => z.id === id);
      if (zone) { setSelectedHavvind(zone); setShowInfoSheet(true); setCenter({ lat: zone.center.lat, lon: zone.center.lon, zoom: 9 }); }
    }
  }, [loading, plants, oilGasFacilities, havvindZones]);

  useEffect(() => {
    fetch("https://ws.geonorge.no/kommuneinfo/v1/kommuner")
      .then((r) => r.json())
      .then((data: KommuneEntry[]) => {
        kommunerRef.current = data;
      })
      .catch(() => {});
  }, []);

  // Fetch live hydro station data when info sheet opens for a hydro plant
  useEffect(() => {
    if (!showInfoSheet || !selected || selected.type !== "vann") {
      setHydroStation(null);
      return;
    }
    let cancelled = false;
    setLoadingHydro(true);
    fetch(`/api/hydro-station?lat=${selected.lat}&lon=${selected.lon}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setHydroStation(data.error ? null : data);
          setLoadingHydro(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHydroStation(null);
          setLoadingHydro(false);
        }
      });
    return () => { cancelled = true; };
  }, [showInfoSheet, selected]);

  // Oil/gas facility name + field name suggestions (extra on top of
  // fylke/kommune/adresse provided by MapSearchBar).
  const extraSuggestions = useCallback(
    (q: string): Suggestion[] => {
      const ql = q.toLowerCase();
      return oilGasFacilities
        .filter(
          (f) =>
            f.name.toLowerCase().includes(ql) ||
            (f.fieldName && f.fieldName.toLowerCase().includes(ql))
        )
        .slice(0, 5)
        .map((f) => ({
          type: "anlegg",
          name: f.name,
          subtitle: [f.kind, f.fieldName].filter(Boolean).join(" · "),
          lat: f.lat,
          lon: f.lon,
        }));
    },
    [oilGasFacilities]
  );

  const handleSearchSelect = useCallback(async (s: Suggestion) => {
    setSelected(null);
    setSelectedHavvind(null);
    setSelectedOilGas(null);
    if (s.type === "anlegg") {
      searchBarRef.current?.setQuery(s.name);
      setCenter({ lat: s.lat, lon: s.lon, zoom: 12 });
      return;
    }
    if (s.type === "fylke") {
      searchBarRef.current?.setQuery(s.fylkesnavn);
      setCenter({ lat: s.lat, lon: s.lon, zoom: s.zoom });
      return;
    }
    if (s.type === "kommune") {
      searchBarRef.current?.setQuery(s.kommunenavn);
      const res = await fetch(
        `https://ws.geonorge.no/stedsnavn/v1/navn?sok=${encodeURIComponent(s.kommunenavn)}&kommunenummer=${s.kommunenummer}&treffPerSide=1`
      );
      const data = await res.json();
      const point = data.navn?.[0]?.representasjonspunkt;
      if (point) {
        setCenter({ lat: point.nord, lon: point.øst });
      }
    } else if (s.type === "adresse") {
      searchBarRef.current?.setQuery(`${s.addr.adressetekst}, ${s.addr.poststed}`);
      setCenter({
        lat: s.addr.representasjonspunkt.lat,
        lon: s.addr.representasjonspunkt.lon,
      });
    }
  }, []);

  const { locating, locateError, locate: handleLocate } = useGeolocation(
    useCallback((lat, lon) => {
      setSelected(null);
      if (isInNorway(lat, lon)) {
        setCenter({ lat, lon, zoom: 10, _t: Date.now() });
      } else {
        setCenter({ lat: OSLO.lat, lon: OSLO.lon, zoom: OSLO.zoom, _t: Date.now() });
      }
    }, []),
    useCallback(() => {
      setCenter({ lat: OSLO.lat, lon: OSLO.lon, zoom: OSLO.zoom, _t: Date.now() });
    }, []),
  );

  // Filtering
  const filteredPlants = useMemo(() => {
    return plants.filter((p) => {
      if (!filterTypes.has(p.type)) return false;
      if (p.type === "vind" && p.windStatus && !filterWindStatus.has(p.windStatus)) return false;
      if (!showSmall && (p.capacityMW ?? 0) < MW_THRESHOLD) return false;
      return true;
    });
  }, [plants, filterTypes, filterWindStatus, showSmall]);

  const toggleType = (t: EnergyType) => {
    setFilterTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) { if (next.size > 1) next.delete(t); }
      else next.add(t);
      return next;
    });
  };

  const toggleWindStatus = (s: WindStatus) => {
    setFilterWindStatus((prev) => {
      const next = new Set(prev);
      if (next.has(s)) { if (next.size > 1) next.delete(s); }
      else next.add(s);
      return next;
    });
  };

  const filteredHavvindZones = useMemo(() => {
    if (!filterTypes.has("havvind")) return [];
    return havvindZones;
  }, [havvindZones, filterTypes]);

  const filteredOilGas = useMemo(() => {
    if (!filterTypes.has("oilgas")) return [];
    return oilGasFacilities;
  }, [oilGasFacilities, filterTypes]);

  const filteredPipelines = useMemo(() => {
    if (!filterTypes.has("oilgas")) return [];
    return pipelines;
  }, [pipelines, filterTypes]);

  const activeFilterCount = (filterTypes.size < 4 ? 1 : 0) + (showSmall ? 1 : 0) + (filterWindStatus.size !== 1 || !filterWindStatus.has("operational") ? 1 : 0);

  // Stats
  const windCount = useMemo(() => filteredPlants.filter((p) => p.type === "vind").length, [filteredPlants]);
  const hydroCount = useMemo(() => filteredPlants.filter((p) => p.type === "vann").length, [filteredPlants]);
  const totalCapacity = useMemo(
    () => Math.round(filteredPlants.reduce((sum, p) => sum + (p.capacityMW ?? 0), 0)),
    [filteredPlants]
  );

  // Marker click handlers — stable identity via useCallback so the memoized
  // marker JSX below doesn't need to regenerate on selection changes.
  const selectPlant = useCallback((p: EnergyPlant) => {
    setSelected((prev) =>
      prev?.id === p.id && prev?.type === p.type ? null : p
    );
    setSelectedHavvind(null);
    setSelectedOilGas(null);
  }, []);

  const selectOilGas = useCallback((f: OilGasFacility) => {
    setSelectedOilGas((prev) => (prev?.id === f.id ? null : f));
    setSelected(null);
    setSelectedHavvind(null);
    setShowInfoSheet(false);
  }, []);

  // Memoize the heavy marker JSX lists so clicks don't regenerate 2k+
  // plant markers or 130 oil/gas markers. Deps exclude selection state —
  // clicked marker doesn't visually highlight, CompactCard is the primary
  // feedback. See schools-map.tsx for rationale + measured impact.
  const inverted = tileLayer === "gråtone";
  const plantMarkers = useMemo(
    () =>
      filteredPlants.map((p) => (
        <Marker
          key={`${p.type}-${p.id}`}
          position={[p.lat, p.lon]}
          icon={energyIcon(false, inverted, p.type, p.capacityMW, p.windStatus)}
          eventHandlers={{ click: () => selectPlant(p) }}
        />
      )),
    [filteredPlants, inverted, selectPlant]
  );
  const turbineMarkers = useMemo(
    () =>
      turbines.map((t) => (
        <Marker
          key={`turbine-${t.id}`}
          position={[t.lat, t.lon]}
          icon={turbineIcon(inverted)}
        />
      )),
    [turbines, inverted]
  );
  const oilgasMarkers = useMemo(
    () =>
      filteredOilGas.map((f) => (
        <Marker
          key={`oilgas-${f.id}`}
          position={[f.lat, f.lon]}
          icon={oilgasIcon(false, inverted, f.isSurface)}
          eventHandlers={{ click: () => selectOilGas(f) }}
        />
      )),
    [filteredOilGas, inverted, selectOilGas]
  );

  const statusLabel = (() => {
    const parts = [`${filteredPlants.length} kraftverk`];
    if (filteredOilGas.length > 0) parts.push(`${filteredOilGas.length} anlegg`);
    if (filteredHavvindZones.length > 0) parts.push(`${filteredHavvindZones.length} havvind`);
    return `${parts.join(" + ")} · Kilde: NVE / Sodir · oppdateres ukentlig`;
  })();

  return (
    <div className="flex flex-col" style={{ height: MAP_HEIGHT }}>
      {/* Search bar */}
      <div className="relative z-[1000] px-4 py-4 md:px-8 shrink-0 bg-background border-b">
        <div className="max-w-xl mx-auto relative flex flex-col gap-2">
          <MapSearchBar
            ref={searchBarRef}
            kommuneList={() => kommunerRef.current}
            extraSuggestions={extraSuggestions}
            onSelect={handleSearchSelect}
            placeholder="Søk etter anlegg, felt, sted..."
          >
            <Sheet open={showFilter} onOpenChange={(open) => { setShowFilter(open); if (open) setShowInfoSheet(false); }}>
              <SheetTrigger
                render={
                  <Button variant="secondary" size="icon" className="relative shadow-lg shrink-0 h-11 w-11 rounded-xl">
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
                    <SheetTitle className="text-left">Filtrer energikilder</SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col gap-4 py-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70 mb-2">Type</p>
                      <div className="rounded-xl border overflow-hidden">
                        {(["vind", "vann", "havvind", "oilgas"] as EnergyType[]).map((t) => {
                          const active = filterTypes.has(t);
                          const meta = TYPE_META[t];
                          const count = t === "havvind" ? havvindZones.length : t === "oilgas" ? oilGasFacilities.length : plants.filter((p) => p.type === t && (showSmall || (p.capacityMW ?? 0) >= MW_THRESHOLD)).length;
                          return (
                            <button
                              key={t}
                              onClick={() => toggleType(t)}
                              className={`flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors border-b last:border-0 ${active ? "bg-background" : "bg-muted/40 text-muted-foreground"}`}
                            >
                              <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${active ? "border-primary bg-primary" : "border-muted-foreground/30 bg-background"}`}>
                                {active && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                              </div>
                              <div className="h-3 w-3 rounded-full shrink-0" style={{ background: meta.color }} />
                              <span className="font-medium flex-1 text-left">{meta.label}</span>
                              <span className="text-xs text-foreground/70 tabular-nums">{count}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {filterTypes.has("vind") && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70 mb-2">Vindkraftstatus</p>
                        <div className="rounded-xl border overflow-hidden">
                          {(["operational", "construction", "approved", "rejected"] as WindStatus[]).map((s) => {
                            const active = filterWindStatus.has(s);
                            const meta = WIND_STATUS_META[s];
                            const count = plants.filter((p) => p.type === "vind" && p.windStatus === s).length;
                            return (
                              <button
                                key={s}
                                onClick={() => toggleWindStatus(s)}
                                className={`flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors border-b last:border-0 ${active ? "bg-background" : "bg-muted/40 text-muted-foreground"}`}
                              >
                                <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${active ? "border-primary bg-primary" : "border-muted-foreground/30 bg-background"}`}>
                                  {active && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                                </div>
                                <div className="h-3 w-3 rounded-full shrink-0" style={{ background: meta.color }} />
                                <span className="font-medium flex-1 text-left">{meta.label}</span>
                                <span className="text-xs text-foreground/70 tabular-nums">{count}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70 mb-2">Størrelse</p>
                      <div className="rounded-xl border overflow-hidden">
                        <button
                          onClick={() => setShowSmall((v) => !v)}
                          className={`flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors ${showSmall ? "bg-background" : "bg-muted/40 text-muted-foreground"}`}
                        >
                          <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${showSmall ? "border-primary bg-primary" : "border-muted-foreground/30 bg-background"}`}>
                            {showSmall && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                          </div>
                          <span className="font-medium flex-1 text-left">Vis små kraftverk (&lt;{MW_THRESHOLD} MW)</span>
                        </button>
                      </div>
                      <p className="text-xs text-foreground/70 mt-2">Skjuler {plants.filter((p) => (p.capacityMW ?? 0) < MW_THRESHOLD).length} små kraftverk som standard for bedre ytelse.</p>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={() => { setFilterTypes(new Set(["vind", "vann", "havvind", "oilgas"])); setFilterWindStatus(new Set(["operational"])); setShowSmall(false); }}
                      >
                        Nullstill
                      </Button>
                      <Button className="flex-1" onClick={() => setShowFilter(false)}>
                        Vis {filteredPlants.length} kraftverk
                      </Button>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <Button onClick={handleLocate} disabled={locating || loading} variant="secondary" size="icon" aria-label="Min posisjon" className="shadow-lg shrink-0 h-11 w-11 rounded-xl">
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            </Button>
          </MapSearchBar>
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-foreground/70">
            {loading
              ? "Henter kraftverk..."
              : plants.length > 0
                ? statusLabel
                : "Ingen kraftverk funnet"}
          </p>
          <button
            onClick={() => setShowInfo(true)}
            className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border bg-muted text-foreground/70 hover:text-foreground transition-colors shrink-0"
          >
            <Info className="h-3 w-3" />
            Om data
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
          loadingMessage="Henter kraftverk..."
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
        {error && <MapError message="Kunne ikke hente kraftverk." onRetry={loadPlants} />}

        <MapContainer
          center={[65, 14]}
          zoom={5}
          style={{ height: "100%", width: "100%" }}
        >
          {center && (
            <FlyTo lat={center.lat} lon={center.lon} zoom={center.zoom} _t={center._t} />
          )}
          <PanToSelected plant={selected} />
          <ZoomTracker onZoom={setZoomLevel} />
          <TileLayer
            key={tileLayer}
            url={TILE_LAYERS[tileLayer].url}
            attribution={TILE_LAYERS[tileLayer].attribution}
            maxZoom={17}
          />
          {showSjokart && (
            <TileLayer
              key="sjokart"
              url="https://cache.kartverket.no/v1/wmts/1.0.0/sjokartraster/default/webmercator/{z}/{y}/{x}.png"
              attribution='&copy; <a href="https://www.kartverket.no/">Kartverket</a>'
              maxZoom={17}
              opacity={0.7}
            />
          )}
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={50}
            spiderfyOnMaxZoom
            showCoverageOnHover={false}
            iconCreateFunction={(cluster: { getChildCount: () => number }) => {
              const count = cluster.getChildCount();
              let size = 36;
              let fontSize = 13;
              if (count >= 50) { size = 44; fontSize = 14; }
              if (count >= 200) { size = 52; fontSize = 15; }
              return L.divIcon({
                html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:#0369a1;color:white;border-radius:50%;font-weight:700;font-size:${fontSize}px;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid rgba(255,255,255,0.6)">${count}</div>`,
                className: "",
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2],
              });
            }}
          >
            {plantMarkers}
          </MarkerClusterGroup>
          {zoomLevel >= 12 && turbineMarkers}
          {/* Havvind zone markers */}
          {filteredHavvindZones.map((z) => (
            <Marker
              key={`havvind-${z.id}`}
              position={[z.center.lat, z.center.lon]}
              icon={havvindIcon(selectedHavvind?.id === z.id, tileLayer === "gråtone")}
              eventHandlers={{
                click() {
                  setSelectedHavvind((prev) => prev?.id === z.id ? null : z);
                  setSelected(null);
                  setSelectedOilGas(null);
                  setShowInfoSheet(false);
                },
              }}
            />
          ))}
          {/* Havvind zone polygons at zoom >= 7 */}
          {zoomLevel >= 7 && filteredHavvindZones.map((z) => (
            <Polygon
              key={`havvind-poly-${z.id}`}
              positions={z.polygon}
              pathOptions={{
                fillColor: HAVVIND_COLOR,
                fillOpacity: selectedHavvind?.id === z.id ? 0.35 : 0.12,
                color: selectedHavvind?.id === z.id ? "#5b21b6" : HAVVIND_COLOR,
                weight: selectedHavvind?.id === z.id ? 2.5 : 1.5,
                dashArray: selectedHavvind?.id === z.id ? undefined : "6 4",
              }}
              eventHandlers={{
                click() {
                  setSelectedHavvind((prev) => prev?.id === z.id ? null : z);
                  setSelected(null);
                  setSelectedOilGas(null);
                  setShowInfoSheet(false);
                },
              }}
            />
          ))}
          {/* Oil & gas facility markers with clustering */}
          {filteredOilGas.length > 0 && (
            <MarkerClusterGroup
              chunkedLoading
              maxClusterRadius={50}
              spiderfyOnMaxZoom
              showCoverageOnHover={false}
              iconCreateFunction={(cluster: { getChildCount: () => number }) => {
                const count = cluster.getChildCount();
                let size = 36;
                let fontSize = 13;
                if (count >= 50) { size = 44; fontSize = 14; }
                if (count >= 200) { size = 52; fontSize = 15; }
                return L.divIcon({
                  html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${OILGAS_COLOR};color:white;border-radius:50%;font-weight:700;font-size:${fontSize}px;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid rgba(255,255,255,0.6)">${count}</div>`,
                  className: "",
                  iconSize: [size, size],
                  iconAnchor: [size / 2, size / 2],
                });
              }}
            >
              {oilgasMarkers}
            </MarkerClusterGroup>
          )}
          {/* Pipelines at zoom >= 8 */}
          {zoomLevel >= 8 && filteredPipelines.map((p) => (
            <span key={`pipe-${p.id}`}>
              {/* Invisible wide hit area */}
              <Polyline
                positions={p.path}
                pathOptions={{ color: "transparent", weight: 16, opacity: 0 }}
                eventHandlers={{
                  click() {
                    setSelectedPipeline(p);
                    setShowInfo(true);
                  },
                }}
              />
              {/* Visible line */}
              <Polyline
                positions={p.path}
                pathOptions={{
                  color: p.medium === "Gas" ? "#facc15" : p.medium === "Oil" ? OILGAS_COLOR : "#a3a3a3",
                  weight: Math.max(1.5, Math.min(3, (p.dimension ?? 20) / 15)),
                  opacity: 0.6,
                  dashArray: p.phase === "DECOMMISSIONED" ? "6 4" : undefined,
                }}
                interactive={false}
              />
            </span>
          ))}

          {selected && (
            <SelectedHalo lat={selected.lat} lon={selected.lon} />
          )}
          {selectedOilGas && (
            <SelectedHalo lat={selectedOilGas.lat} lon={selectedOilGas.lon} />
          )}
          {selectedHavvind && (
            <SelectedHalo
              lat={selectedHavvind.center.lat}
              lon={selectedHavvind.center.lon}
            />
          )}
        </MapContainer>

        {/* Tile layer toggle */}
        <div className="absolute top-3 right-3 z-[999] flex rounded-lg border bg-card shadow-md overflow-hidden">
          {(["kart", "gråtone"] as TileLayerKey[]).map((key, i) => (
            <button
              key={key}
              onClick={() => setTileLayer(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${i > 0 ? "border-l" : ""} ${tileLayer === key ? "text-white" : "text-muted-foreground hover:bg-muted"}`}
              style={
                tileLayer === key
                  ? { background: "var(--kv-blue)" }
                  : {}
              }
            >
              {key === "kart" ? (
                <MapIcon className="h-3.5 w-3.5" />
              ) : (
                <Layers className="h-3.5 w-3.5" />
              )}
              {TILE_LAYERS[key].label}
            </button>
          ))}
          <button
            onClick={() => setShowSjokart(!showSjokart)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors border-l ${showSjokart ? "text-white" : "text-muted-foreground hover:bg-muted"}`}
            style={showSjokart ? { background: "var(--kv-blue)" } : {}}
          >
            <Anchor className="h-3.5 w-3.5" />
            Sjøkart
          </button>
        </div>

        {/* Compact info card */}
        <CompactCard visible={!!selected && !showInfoSheet} onClose={() => setSelected(null)}>
          {selected && (<>
            <CompactCard.Header title={selected.name} metric={selected.capacityMW != null ? Math.round(selected.capacityMW) : "—"} metricUnit="MW" metricColor={TYPE_META[selected.type].color} />
            <CompactCard.Context>
              <CompactCard.ContextLeft>
                <CompactCard.Badge color="white" bg={selected.type === "vind" && selected.windStatus ? WIND_STATUS_META[selected.windStatus].color : TYPE_META[selected.type].color}>{TYPE_META[selected.type].label}</CompactCard.Badge>
                {selected.type === "vind" && selected.windStatus && selected.windStatus !== "operational" && (
                  <CompactCard.Badge color="white" bg={WIND_STATUS_META[selected.windStatus].color}>{WIND_STATUS_META[selected.windStatus].label}</CompactCard.Badge>
                )}
                {selected.type !== "vind" && (
                  <CompactCard.ContextText>{[selected.owner !== selected.name ? selected.owner : null, selected.municipality].filter(Boolean).join(" · ")}</CompactCard.ContextText>
                )}
                {selected.type === "vind" && selected.turbineCount != null && (
                  <CompactCard.ContextText>{selected.turbineCount} turbiner</CompactCard.ContextText>
                )}
              </CompactCard.ContextLeft>
              <CompactCard.ContextRight>
                {selected.type === "vind"
                  ? selected.productionGWh != null && <CompactCard.ContextText>{Math.round(selected.productionGWh)} GWh/år</CompactCard.ContextText>
                  : selected.fallHeight != null && <CompactCard.ContextText>{Math.round(selected.fallHeight)} m fall</CompactCard.ContextText>
                }
              </CompactCard.ContextRight>
            </CompactCard.Context>
            <CompactCard.Actions>
              <CompactCard.Action primary onClick={() => { setShowInfoSheet(true); setShowFilter(false); }} icon={<ChevronUp className="h-3.5 w-3.5" />}>Vis mer</CompactCard.Action>
              <CompactCard.Action href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lon}`} icon={<Navigation className="h-3.5 w-3.5" />}>Kjør hit</CompactCard.Action>
            </CompactCard.Actions>
          </>)}
        </CompactCard>

        {/* Oil & gas compact card */}
        {selectedOilGas && !showInfoSheet && (
          <div
            className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-96 z-[999] bg-card rounded-2xl shadow-xl px-4 py-4"
            style={{ border: "1.5px solid var(--border)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full text-white" style={{ background: OILGAS_COLOR }}>
                    Olje & gass
                  </span>
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-muted text-foreground">
                    {selectedOilGas.isSurface ? "Overflate" : "Undervanns"}
                  </span>
                </div>
                <p className="font-bold text-base truncate leading-snug">{selectedOilGas.name}</p>
                <p className="text-xs text-foreground/70 truncate">
                  {[selectedOilGas.operator, selectedOilGas.fieldName].filter(Boolean).join(" · ")}
                </p>
              </div>
              <button
                onClick={() => setSelectedOilGas(null)}
                className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Lukk"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              {selectedOilGas.waterDepth != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold" style={{ color: OILGAS_COLOR }}>
                    {Math.round(selectedOilGas.waterDepth)}
                  </span>
                  <span className="text-xs text-foreground/70">m dybde</span>
                </div>
              )}
              {selectedOilGas.yearStartup != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold" style={{ color: OILGAS_COLOR }}>
                    {selectedOilGas.yearStartup}
                  </span>
                  <span className="text-xs text-foreground/70">oppstart</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { setShowInfoSheet(true); setShowFilter(false); }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl text-white transition-colors hover:opacity-90"
                style={{ background: "var(--kv-blue)" }}
              >
                <ChevronUp className="h-3.5 w-3.5" /> Vis mer
              </button>
            </div>
          </div>
        )}

        {/* Oil & gas detail sheet */}
        <OilGasSheet
          open={showInfoSheet && !!selectedOilGas && !selected && !selectedHavvind}
          onOpenChange={(open) => { setShowInfoSheet(open); }}
          selectedOilGas={selectedOilGas}
          productionData={productionData}
          productionFetchedAt={productionFetchedAt}
          showProdInfo={showProdInfo}
          onToggleProdInfo={() => setShowProdInfo((v) => !v)}
          showFacilityInfo={showFacilityInfo}
          onToggleFacilityInfo={() => setShowFacilityInfo((v) => !v)}
        />

        {/* Havvind compact card */}
        {selectedHavvind && !showInfoSheet && (
          <div
            className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-96 z-[999] bg-card rounded-2xl shadow-xl px-4 py-4"
            style={{ border: "1.5px solid var(--border)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full text-white" style={{ background: HAVVIND_COLOR }}>
                    Havvind · Utredning
                  </span>
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-muted text-foreground">
                    {selectedHavvind.typeAnlegg}
                  </span>
                </div>
                <p className="font-bold text-base truncate leading-snug">{selectedHavvind.name}</p>
                <p className="text-xs text-foreground/70">Planlagt område, ikke bygget ennå</p>
              </div>
              <button
                onClick={() => setSelectedHavvind(null)}
                className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Lukk"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              {selectedHavvind.arealKm2 != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold" style={{ color: HAVVIND_COLOR }}>
                    {selectedHavvind.arealKm2.toLocaleString("nb-NO")}
                  </span>
                  <span className="text-xs text-foreground/70">km²</span>
                </div>
              )}
              {selectedHavvind.minDistanceKm != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold" style={{ color: HAVVIND_COLOR }}>
                    {selectedHavvind.minDistanceKm}
                  </span>
                  <span className="text-xs text-foreground/70">km til land</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { setShowInfoSheet(true); setShowFilter(false); }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl text-white transition-colors hover:opacity-90"
                style={{ background: "var(--kv-blue)" }}
              >
                <ChevronUp className="h-3.5 w-3.5" /> Vis mer
              </button>
            </div>
          </div>
        )}

        {/* Havvind detail sheet */}
        <HavvindSheet
          open={showInfoSheet && !!selectedHavvind && !selected}
          onOpenChange={(open) => { setShowInfoSheet(open); }}
          selectedHavvind={selectedHavvind}
        />

        {/* Energy plant detail sheet */}
        <EnergyPlantSheet
          open={showInfoSheet && !!selected}
          onOpenChange={(open) => { setShowInfoSheet(open); }}
          selected={selected}
          loadingHydro={loadingHydro}
          hydroStation={hydroStation}
        />
      </div>

      {/* Info modal */}
      {showInfo && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 px-4"
          onClick={() => { setShowInfo(false); setSelectedPipeline(null); }}
        >
          <div
            className="bg-background rounded-2xl shadow-xl border w-full max-w-sm p-5 max-h-[85svh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-base">{selectedPipeline ? "Rørledning" : "Om energidata"}</h2>
              <button
                onClick={() => { setShowInfo(false); setSelectedPipeline(null); }}
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Lukk"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {selectedPipeline ? (
              <div className="flex flex-col gap-4 text-sm">
                {/* Pipeline detail */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full text-white" style={{ background: selectedPipeline.medium === "Gas" ? "#ca8a04" : OILGAS_COLOR }}>
                      {selectedPipeline.medium ?? "Ukjent"}
                    </span>
                    {selectedPipeline.phase && (
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-muted text-foreground">
                        {selectedPipeline.phase === "IN SERVICE" ? "I drift" : selectedPipeline.phase === "DECOMMISSIONED" ? "Nedlagt" : selectedPipeline.phase}
                      </span>
                    )}
                  </div>
                  <p className="font-bold text-base leading-snug mt-1">{selectedPipeline.name}</p>
                </div>

                <div className="flex flex-col gap-2 pt-3 border-t">
                  {selectedPipeline.fromFacility && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Fra</span>
                      <span className="font-medium">{selectedPipeline.fromFacility}</span>
                    </div>
                  )}
                  {selectedPipeline.toFacility && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Til</span>
                      <span className="font-medium">{selectedPipeline.toFacility}</span>
                    </div>
                  )}
                  {selectedPipeline.dimension != null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Diameter</span>
                      <span className="font-medium">{selectedPipeline.dimension}" ({Math.round(selectedPipeline.dimension * 25.4)} mm)</span>
                    </div>
                  )}
                  {selectedPipeline.belongsTo && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">System</span>
                      <span className="font-medium">{selectedPipeline.belongsTo}</span>
                    </div>
                  )}
                </div>

                {/* General pipeline legend */}
                <div className="pt-3 border-t">
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70 mb-2">Fargeforklaring</p>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-0.5 rounded-full" style={{ background: OILGAS_COLOR }} />
                      <span className="text-xs text-foreground/70">Oljerørledning</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-0.5 rounded-full" style={{ background: "#facc15" }} />
                      <span className="text-xs text-foreground/70">Gassrørledning</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-0.5 rounded-full bg-neutral-400" />
                      <span className="text-xs text-foreground/70">Annet (vann, kjemikalier etc.)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-0.5 rounded-full border border-dashed border-neutral-400" />
                      <span className="text-xs text-foreground/70">Nedlagt</span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-foreground/70 pt-2 border-t">
                  Kilde: <a href="https://www.sodir.no/en/facts/data-and-analyses/open-data/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Sokkeldirektoratet (Sodir)</a>
                </p>
                <DataDisclaimer />
              </div>
            ) : (
              <div className="flex flex-col gap-3 text-sm">
                <p>
                  Kartet viser Norges energiinfrastruktur — fornybar og fossil — med data fra{" "}
                  <strong>NVE</strong> og <strong>Sodir</strong>.
                </p>
                <div className="bg-muted/50 rounded-xl p-3">
                  <p className="font-semibold mb-1">Vindkraft og vannkraft</p>
                  <p className="text-muted-foreground">Over 1700 vannkraftverk og et voksende antall vindkraftverk. <strong>MW</strong> er installert kapasitet. Kraftverk under {MW_THRESHOLD} MW er skjult som standard.</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-3">
                  <p className="font-semibold mb-1">Havvind (planlagt)</p>
                  <p className="text-muted-foreground">20 utredningsområder for offshore vindkraft. Disse er ikke bygget ennå — kun planlagte soner fra NVEs 2023-utredning.</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-3">
                  <p className="font-semibold mb-1">Olje og gass</p>
                  <p className="text-muted-foreground">Over 1200 anlegg på norsk sokkel — plattformer, FPSO-er, undervannsinstallasjoner. Rørledninger vises ved innzooming og kan klikkes for detaljer.</p>
                </div>
                <p className="text-xs text-foreground/70">
                  Data oppdateres hver time. Kilde:{" "}
                  <a href="https://nve.geodataonline.no/arcgis/rest/services/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">NVE Geodata</a>{" · "}
                  <a href="https://www.sodir.no/en/facts/data-and-analyses/open-data/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Sodir</a>
                </p>
                <DataDisclaimer />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
