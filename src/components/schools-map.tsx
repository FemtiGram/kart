"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import {
  Loader2,
  GraduationCap,
  Baby,
  LocateFixed,
  Info,
  Map as MapIcon,
  Layers,
  SlidersHorizontal,
  Check,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MapSearchBar, type MapSearchBarHandle } from "@/components/map-search";
import { schoolIcon, kindergartenIcon, type SchoolType } from "@/components/map-icons";
import { useInitialPosition } from "@/lib/use-initial-position";
import { isInNorway, OSLO } from "@/lib/fylker";
import { FlyTo, DataDisclaimer, MapError, MAP_HEIGHT } from "@/lib/map-utils";
import { CompactCard } from "@/components/compact-card";
import { InfoModal } from "@/components/info-modal";
import { TileToggle } from "@/components/tile-toggle";
import { MapLoading } from "@/components/map-loading";
import { DriveLink } from "@/components/drive-link";
import type { KommuneEntry, Suggestion } from "@/lib/map-utils";

interface School {
  id: string;
  name: string;
  kommunenummer: string;
  lat: number;
  lon: number;
  type: SchoolType;
  owner: "offentlig" | "privat";
  students: number | null;
  gradeFrom: number | null;
  gradeTo: number | null;
  address: string | null;
  poststed: string | null;
  url: string | null;
}

interface Kindergarten {
  id: string;
  name: string;
  kommunenummer: string;
  lat: number;
  lon: number;
  owner: "offentlig" | "privat";
  children: number | null;
  ageMin: number | null;
  ageMax: number | null;
  address: string | null;
  poststed: string | null;
  url: string | null;
}

type Selected =
  | { kind: "school"; data: School }
  | { kind: "kindergarten"; data: Kindergarten }
  | null;

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

const SCHOOL_CLUSTER_COLOR = "#6d28d9"; // purple-700
const KINDERGARTEN_CLUSTER_COLOR = "#c2410c"; // orange-700

function clusterIcon(color: string) {
  return (cluster: { getChildCount: () => number }) => {
    const count = cluster.getChildCount();
    let size = 36;
    let fontSize = 13;
    if (count >= 100) {
      size = 44;
      fontSize = 14;
    }
    if (count >= 500) {
      size = 52;
      fontSize = 15;
    }
    return L.divIcon({
      html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${color};color:white;border-radius:50%;font-weight:700;font-size:${fontSize}px;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid rgba(255,255,255,0.6)">${count}</div>`,
      className: "",
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  };
}

const schoolClusterIcon = clusterIcon(SCHOOL_CLUSTER_COLOR);
const kindergartenClusterIcon = clusterIcon(KINDERGARTEN_CLUSTER_COLOR);

function formatGradeRange(from: number | null, to: number | null): string | null {
  if (from == null && to == null) return null;
  if (from != null && to != null) return `${from}.–${to}. trinn`;
  if (from != null) return `Fra ${from}. trinn`;
  return `Til ${to}. trinn`;
}

const SCHOOL_TYPE_LABEL: Record<SchoolType, string> = {
  grunnskole: "Grunnskole",
  vgs: "Videregående",
  begge: "Grunnskole + VGS",
};

export function SchoolsMap() {
  const [schools, setSchools] = useState<School[]>([]);
  const [kindergartens, setKindergartens] = useState<Kindergarten[]>([]);
  const [loading, setLoading] = useState(true);
  const [counting, setCounting] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [error, setError] = useState(false);

  const [showSchools, setShowSchools] = useState(true);
  const [showKindergartens, setShowKindergartens] = useState(true);
  const [filterTypes, setFilterTypes] = useState<Set<SchoolType>>(
    new Set(["grunnskole", "vgs", "begge"])
  );
  const [filterOwners, setFilterOwners] = useState<Set<"offentlig" | "privat">>(
    new Set(["offentlig", "privat"])
  );

  const [selected, setSelected] = useState<Selected>(null);
  const [center, setCenter] = useState<{
    lat: number;
    lon: number;
    zoom?: number;
    _t?: number;
  } | null>(null);
  const [tileLayer, setTileLayer] = useState<TileLayerKey>("gråtone");
  const [showFilter, setShowFilter] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(false);

  const kommunerRef = useRef<KommuneEntry[]>([]);
  const searchBarRef = useRef<MapSearchBarHandle>(null);

  // Deep link from /kommune/[slug]
  useInitialPosition((lat, lon, zoom) => {
    setCenter({ lat, lon, zoom, _t: Date.now() });
  });

  const loadData = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const r = await fetch("/data/schools.json");
      const data = await r.json();
      if (data.schools && data.kindergartens) {
        setSchools(data.schools);
        setKindergartens(data.kindergartens);
        setLoadedCount(data.schools.length + data.kindergartens.length);
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

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    fetch("https://ws.geonorge.no/kommuneinfo/v1/kommuner")
      .then((r) => r.json())
      .then((data: KommuneEntry[]) => {
        kommunerRef.current = data;
      })
      .catch(() => {});
  }, []);

  const handleSearchSelect = useCallback(async (s: Suggestion) => {
    setSelected(null);
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
    } else if (s.type === "anlegg") {
      // School or barnehage — fly to it and auto-select the closest matching marker
      searchBarRef.current?.setQuery(s.name);
      setCenter({ lat: s.lat, lon: s.lon, zoom: 14, _t: Date.now() });
      // Find the matching entity by lat/lon (exact, since extraSuggestions
      // returns the same coordinates we use for the marker)
      const school = schools.find(
        (sc) => sc.lat === s.lat && sc.lon === s.lon && sc.name === s.name
      );
      if (school) {
        setSelected({ kind: "school", data: school });
      } else {
        const kg = kindergartens.find(
          (k) => k.lat === s.lat && k.lon === s.lon && k.name === s.name
        );
        if (kg) setSelected({ kind: "kindergarten", data: kg });
      }
    }
  }, [schools, kindergartens]);

  // Search suggestions: schools + barnehager by name (and poststed)
  const extraSuggestions = useCallback(
    (q: string): Suggestion[] => {
      const ql = q.toLowerCase();
      const matchSchool = (sc: School) =>
        sc.name.toLowerCase().includes(ql) ||
        (sc.poststed?.toLowerCase().includes(ql) ?? false);
      const matchKg = (k: Kindergarten) =>
        k.name.toLowerCase().includes(ql) ||
        (k.poststed?.toLowerCase().includes(ql) ?? false);
      const schoolHits = schools
        .filter(matchSchool)
        .slice(0, 5)
        .map<Suggestion>((sc) => ({
          type: "anlegg",
          name: sc.name,
          subtitle: [SCHOOL_TYPE_LABEL[sc.type], sc.poststed]
            .filter(Boolean)
            .join(" · "),
          lat: sc.lat,
          lon: sc.lon,
        }));
      const kgHits = kindergartens
        .filter(matchKg)
        .slice(0, 3)
        .map<Suggestion>((k) => ({
          type: "anlegg",
          name: k.name,
          subtitle: ["Barnehage", k.poststed].filter(Boolean).join(" · "),
          lat: k.lat,
          lon: k.lon,
        }));
      return [...schoolHits, ...kgHits];
    },
    [schools, kindergartens]
  );

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
          setCenter({ lat, lon, zoom: 13, _t: Date.now() });
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

  const filteredSchools = useMemo(() => {
    if (!showSchools) return [] as School[];
    return schools.filter(
      (s) => filterTypes.has(s.type) && filterOwners.has(s.owner)
    );
  }, [schools, showSchools, filterTypes, filterOwners]);

  const filteredKindergartens = useMemo(() => {
    if (!showKindergartens) return [] as Kindergarten[];
    return kindergartens.filter((k) => filterOwners.has(k.owner));
  }, [kindergartens, showKindergartens, filterOwners]);

  const totalShown = filteredSchools.length + filteredKindergartens.length;
  const activeFilterCount =
    (showSchools ? 0 : 1) +
    (showKindergartens ? 0 : 1) +
    (filterTypes.size < 3 ? 1 : 0) +
    (filterOwners.size < 2 ? 1 : 0);

  const toggleType = (t: SchoolType) => {
    setFilterTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const toggleOwner = (o: "offentlig" | "privat") => {
    setFilterOwners((prev) => {
      const next = new Set(prev);
      if (next.has(o)) next.delete(o);
      else next.add(o);
      return next;
    });
  };

  const selectSchool = useCallback((s: School) => {
    setSelected((prev) =>
      prev?.kind === "school" && prev.data.id === s.id
        ? null
        : { kind: "school", data: s }
    );
  }, []);

  const selectKindergarten = useCallback((k: Kindergarten) => {
    setSelected((prev) =>
      prev?.kind === "kindergarten" && prev.data.id === k.id
        ? null
        : { kind: "kindergarten", data: k }
    );
  }, []);

  // Memoize the heavy marker JSX lists so clicks don't regenerate 8k+
  // Marker components per click. Dropping `selected` from the deps means
  // clicking a marker only updates the CompactCard, not the marker tree.
  // The trade-off: the clicked marker doesn't visually highlight on the map,
  // but the CompactCard appearing is the primary feedback anyway.
  const inverted = tileLayer === "gråtone";

  const schoolMarkers = useMemo(
    () =>
      filteredSchools.map((s) => (
        <Marker
          key={s.id}
          position={[s.lat, s.lon]}
          icon={schoolIcon(s.type, false, inverted)}
          eventHandlers={{ click: () => selectSchool(s) }}
        />
      )),
    [filteredSchools, inverted, selectSchool]
  );

  const kindergartenMarkers = useMemo(
    () =>
      filteredKindergartens.map((k) => (
        <Marker
          key={k.id}
          position={[k.lat, k.lon]}
          icon={kindergartenIcon(false, inverted)}
          eventHandlers={{ click: () => selectKindergarten(k) }}
        />
      )),
    [filteredKindergartens, inverted, selectKindergarten]
  );

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
            placeholder="Søk etter skole, barnehage, sted..."
          >
            <Sheet
              open={showFilter}
              onOpenChange={(open) => {
                setShowFilter(open);
                if (open) setShowInfoSheet(false);
              }}
            >
              <SheetTrigger
                render={
                  <Button
                    variant="secondary"
                    size="icon"
                    className="relative shadow-lg shrink-0 h-11 w-11 rounded-xl"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    {activeFilterCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                }
              />
              <SheetContent
                side="bottom"
                className="rounded-t-2xl max-h-[70svh] overflow-y-auto"
              >
                <div className="mx-auto w-full max-w-md px-2">
                  <SheetHeader>
                    <SheetTitle className="text-left">
                      Filtrer skoler og barnehager
                    </SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col gap-4 py-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70 mb-2">
                        Vis
                      </p>
                      <div className="rounded-xl border overflow-hidden">
                        <button
                          onClick={() => setShowSchools((v) => !v)}
                          className={`flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors border-b ${showSchools ? "bg-background" : "bg-muted/40 text-muted-foreground"}`}
                        >
                          <div
                            className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${showSchools ? "border-primary bg-primary" : "border-muted-foreground/30 bg-background"}`}
                          >
                            {showSchools && (
                              <Check className="h-3.5 w-3.5 text-primary-foreground" />
                            )}
                          </div>
                          <div
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{ background: SCHOOL_CLUSTER_COLOR }}
                          />
                          <span className="font-medium flex-1 text-left">Skoler</span>
                          <span className="text-xs text-foreground/70 tabular-nums">
                            {schools.length}
                          </span>
                        </button>
                        <button
                          onClick={() => setShowKindergartens((v) => !v)}
                          className={`flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors ${showKindergartens ? "bg-background" : "bg-muted/40 text-muted-foreground"}`}
                        >
                          <div
                            className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${showKindergartens ? "border-primary bg-primary" : "border-muted-foreground/30 bg-background"}`}
                          >
                            {showKindergartens && (
                              <Check className="h-3.5 w-3.5 text-primary-foreground" />
                            )}
                          </div>
                          <div
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{ background: KINDERGARTEN_CLUSTER_COLOR }}
                          />
                          <span className="font-medium flex-1 text-left">Barnehager</span>
                          <span className="text-xs text-foreground/70 tabular-nums">
                            {kindergartens.length}
                          </span>
                        </button>
                      </div>
                    </div>
                    {showSchools && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70 mb-2">
                          Skoletype
                        </p>
                        <div className="rounded-xl border overflow-hidden">
                          {(["grunnskole", "vgs", "begge"] as SchoolType[]).map(
                            (t) => {
                              const active = filterTypes.has(t);
                              const count = schools.filter((s) => s.type === t).length;
                              return (
                                <button
                                  key={t}
                                  onClick={() => toggleType(t)}
                                  className={`flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors border-b last:border-0 ${active ? "bg-background" : "bg-muted/40 text-muted-foreground"}`}
                                >
                                  <div
                                    className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${active ? "border-primary bg-primary" : "border-muted-foreground/30 bg-background"}`}
                                  >
                                    {active && (
                                      <Check className="h-3.5 w-3.5 text-primary-foreground" />
                                    )}
                                  </div>
                                  <span className="font-medium flex-1 text-left">
                                    {SCHOOL_TYPE_LABEL[t]}
                                  </span>
                                  <span className="text-xs text-foreground/70 tabular-nums">
                                    {count}
                                  </span>
                                </button>
                              );
                            }
                          )}
                        </div>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70 mb-2">
                        Eierskap
                      </p>
                      <div className="rounded-xl border overflow-hidden">
                        {(["offentlig", "privat"] as const).map((o) => {
                          const active = filterOwners.has(o);
                          return (
                            <button
                              key={o}
                              onClick={() => toggleOwner(o)}
                              className={`flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors border-b last:border-0 ${active ? "bg-background" : "bg-muted/40 text-muted-foreground"}`}
                            >
                              <div
                                className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${active ? "border-primary bg-primary" : "border-muted-foreground/30 bg-background"}`}
                              >
                                {active && (
                                  <Check className="h-3.5 w-3.5 text-primary-foreground" />
                                )}
                              </div>
                              <span className="font-medium flex-1 text-left capitalize">
                                {o}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={() => {
                          setShowSchools(true);
                          setShowKindergartens(true);
                          setFilterTypes(new Set(["grunnskole", "vgs", "begge"]));
                          setFilterOwners(new Set(["offentlig", "privat"]));
                        }}
                      >
                        Nullstill
                      </Button>
                      <Button className="flex-1" onClick={() => setShowFilter(false)}>
                        Vis {totalShown}
                      </Button>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <Button
              onClick={handleLocate}
              disabled={locating || loading}
              variant="secondary"
              size="icon"
              className="shadow-lg shrink-0 h-11 w-11 rounded-xl"
            >
              {locating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LocateFixed className="h-4 w-4" />
              )}
            </Button>
          </MapSearchBar>
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-foreground/70">
            {loading
              ? "Henter skoler og barnehager..."
              : `${filteredSchools.length} skoler · ${filteredKindergartens.length} barnehager · Kilde: UDIR`}
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
          countLabel="enheter lastet"
          loadingMessage="Henter skoler og barnehager..."
        />
        {error && <MapError message="Kunne ikke hente skoler." onRetry={loadData} />}
        {locateError && (
          <div className="absolute bottom-20 sm:top-3 sm:bottom-auto left-1/2 -translate-x-1/2 z-[1000] bg-background/90 backdrop-blur-sm border rounded-full px-4 py-2 shadow-lg">
            <p className="text-sm text-muted-foreground">
              Kunne ikke finne posisjon, viser Oslo i stedet.
            </p>
          </div>
        )}

        <MapContainer
          center={[65, 14]}
          zoom={5}
          style={{ height: "100%", width: "100%" }}
        >
          {center && (
            <FlyTo
              lat={center.lat}
              lon={center.lon}
              zoom={center.zoom}
              _t={center._t}
            />
          )}
          <TileLayer
            key={tileLayer}
            url={TILE_LAYERS[tileLayer].url}
            attribution={TILE_LAYERS[tileLayer].attribution}
            maxZoom={17}
          />

          {showSchools && (
            <MarkerClusterGroup
              chunkedLoading
              maxClusterRadius={60}
              spiderfyOnMaxZoom
              showCoverageOnHover={false}
              iconCreateFunction={schoolClusterIcon}
            >
              {schoolMarkers}
            </MarkerClusterGroup>
          )}

          {showKindergartens && (
            <MarkerClusterGroup
              chunkedLoading
              maxClusterRadius={60}
              spiderfyOnMaxZoom
              showCoverageOnHover={false}
              iconCreateFunction={kindergartenClusterIcon}
            >
              {kindergartenMarkers}
            </MarkerClusterGroup>
          )}
        </MapContainer>

        {/* Tile layer toggle */}
        <div className="absolute top-3 right-3 z-[999]">
          <TileToggle
            value={tileLayer}
            onChange={setTileLayer}
            options={[
              {
                value: "kart",
                label: "Kart",
                icon: <MapIcon className="h-3.5 w-3.5" />,
              },
              {
                value: "gråtone",
                label: "Gråtone",
                icon: <Layers className="h-3.5 w-3.5" />,
              },
            ]}
          />
        </div>

        {/* Compact info card */}
        <CompactCard
          visible={!!selected && !showInfoSheet}
          onClose={() => setSelected(null)}
        >
          {selected?.kind === "school" && (
            <>
              <CompactCard.Header
                title={selected.data.name}
                metric={selected.data.students ?? undefined}
                metricUnit="elever"
              />
              <CompactCard.Context>
                <CompactCard.ContextLeft>
                  <CompactCard.ContextText>
                    {[
                      SCHOOL_TYPE_LABEL[selected.data.type],
                      formatGradeRange(
                        selected.data.gradeFrom,
                        selected.data.gradeTo
                      ),
                      selected.data.poststed,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </CompactCard.ContextText>
                </CompactCard.ContextLeft>
                <CompactCard.ContextRight>
                  <CompactCard.ContextText>
                    {selected.data.owner === "privat" ? "Privat" : "Offentlig"}
                  </CompactCard.ContextText>
                </CompactCard.ContextRight>
              </CompactCard.Context>
              <CompactCard.Actions>
                <CompactCard.Action
                  primary
                  onClick={() => setShowInfoSheet(true)}
                  icon={<ChevronUp className="h-3.5 w-3.5" />}
                >
                  Vis mer
                </CompactCard.Action>
              </CompactCard.Actions>
            </>
          )}
          {selected?.kind === "kindergarten" && (
            <>
              <CompactCard.Header
                title={selected.data.name}
                metric={selected.data.children ?? undefined}
                metricUnit="barn"
              />
              <CompactCard.Context>
                <CompactCard.ContextLeft>
                  <CompactCard.ContextText>
                    {[
                      "Barnehage",
                      selected.data.ageMin != null && selected.data.ageMax != null
                        ? `${selected.data.ageMin}–${selected.data.ageMax} år`
                        : null,
                      selected.data.poststed,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </CompactCard.ContextText>
                </CompactCard.ContextLeft>
                <CompactCard.ContextRight>
                  <CompactCard.ContextText>
                    {selected.data.owner === "privat" ? "Privat" : "Offentlig"}
                  </CompactCard.ContextText>
                </CompactCard.ContextRight>
              </CompactCard.Context>
              <CompactCard.Actions>
                <CompactCard.Action
                  primary
                  onClick={() => setShowInfoSheet(true)}
                  icon={<ChevronUp className="h-3.5 w-3.5" />}
                >
                  Vis mer
                </CompactCard.Action>
              </CompactCard.Actions>
            </>
          )}
        </CompactCard>

        {/* Info detail sheet */}
        <Sheet
          open={showInfoSheet && !!selected}
          onOpenChange={(open) => setShowInfoSheet(open)}
        >
          <SheetContent
            side="bottom"
            className="rounded-t-2xl max-h-[85svh] overflow-y-auto"
          >
            {selected && (
              <div className="mx-auto w-full max-w-md px-4 pb-6">
                <SheetHeader>
                  <SheetTitle className="text-left sr-only">
                    {selected.data.name}
                  </SheetTitle>
                </SheetHeader>
                <p className="font-bold text-lg leading-snug">
                  {selected.data.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {[selected.data.address, selected.data.poststed]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                <div className="mt-4 pt-4 border-t flex gap-1.5 flex-wrap">
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                    {selected.kind === "school"
                      ? SCHOOL_TYPE_LABEL[selected.data.type]
                      : "Barnehage"}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                    {selected.data.owner === "privat" ? "Privat" : "Offentlig"}
                  </span>
                  {selected.kind === "school" &&
                    formatGradeRange(
                      selected.data.gradeFrom,
                      selected.data.gradeTo
                    ) && (
                      <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                        {formatGradeRange(
                          selected.data.gradeFrom,
                          selected.data.gradeTo
                        )}
                      </span>
                    )}
                  {selected.kind === "kindergarten" &&
                    selected.data.ageMin != null &&
                    selected.data.ageMax != null && (
                      <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                        {selected.data.ageMin}–{selected.data.ageMax} år
                      </span>
                    )}
                </div>

                <div className="mt-4 pt-4 border-t">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span
                        className="text-3xl font-extrabold tabular-nums"
                        style={{ color: "var(--kv-blue)" }}
                      >
                        {selected.kind === "school"
                          ? (selected.data.students ?? "–")
                          : (selected.data.children ?? "–")}
                      </span>
                      <p className="text-[10px] text-foreground/70">
                        {selected.kind === "school" ? "elever" : "barn"}
                      </p>
                    </div>
                    {selected.kind === "school" && (
                      <div>
                        <span
                          className="text-3xl font-extrabold tabular-nums"
                          style={{ color: "var(--kv-blue)" }}
                        >
                          {formatGradeRange(
                            selected.data.gradeFrom,
                            selected.data.gradeTo
                          )?.replace(" trinn", "") ?? "–"}
                        </span>
                        <p className="text-[10px] text-foreground/70">trinn</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t flex flex-col gap-3">
                  {selected.data.url && (
                    <a
                      href={
                        selected.data.url.startsWith("http")
                          ? selected.data.url
                          : `https://${selected.data.url}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-xl border bg-muted/40 hover:bg-muted px-4 py-3 transition-colors"
                    >
                      <div className="min-w-0">
                        <p
                          className="text-sm font-semibold"
                          style={{ color: "var(--kv-blue)" }}
                        >
                          Besøk hjemmeside
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {selected.data.url}
                        </p>
                      </div>
                      <ExternalLink className="h-4 w-4 text-foreground/70 shrink-0 ml-3" />
                    </a>
                  )}
                  <DriveLink lat={selected.data.lat} lon={selected.data.lon} />
                  <p className="text-xs text-foreground/70 text-center">
                    Kilde:{" "}
                    <a
                      href={
                        selected.kind === "school"
                          ? "https://nsr.udir.no"
                          : "https://nbr.udir.no"
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-foreground"
                    >
                      {selected.kind === "school"
                        ? "Nasjonalt skoleregister (NSR)"
                        : "Nasjonalt barnehageregister (NBR)"}
                    </a>{" "}
                    / Utdanningsdirektoratet
                  </p>
                  <DataDisclaimer />
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>

      <InfoModal
        open={showInfo}
        onClose={() => setShowInfo(false)}
        title="Om skoler og barnehager"
      >
        <p>
          Kartet viser{" "}
          <span className="font-medium text-foreground">alle aktive skoler</span>{" "}
          ({schools.length}) og{" "}
          <span className="font-medium text-foreground">barnehager</span>{" "}
          ({kindergartens.length}) i Norge. Inkluderer både offentlige og
          private, grunnskoler og videregående.
        </p>
        <p className="mt-3">
          Data hentes fra Utdanningsdirektoratets åpne registre:{" "}
          <a
            href="https://nsr.udir.no"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            Nasjonalt skoleregister (NSR)
          </a>{" "}
          og{" "}
          <a
            href="https://nbr.udir.no"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            Nasjonalt barnehageregister (NBR)
          </a>
          . Begge oppdateres daglig fra Brønnøysundregistrene.
        </p>
        <p className="mt-3">
          Klikk en markør for å se elev- eller barnetall, trinn, eierskap og
          lenke til skolens hjemmeside.
        </p>
        <div className="mt-3 text-xs text-foreground/70">
          <p className="flex items-center gap-1.5">
            <GraduationCap
              className="h-3.5 w-3.5"
              style={{ color: SCHOOL_CLUSTER_COLOR }}
            />
            Skoler: lilla markører
          </p>
          <p className="flex items-center gap-1.5 mt-1">
            <Baby
              className="h-3.5 w-3.5"
              style={{ color: KINDERGARTEN_CLUSTER_COLOR }}
            />
            Barnehager: oransje markører
          </p>
        </div>
      </InfoModal>
    </div>
  );
}
