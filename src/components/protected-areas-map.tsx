"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, GeoJSON, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoJsonObject, Feature } from "geojson";
import type { Layer } from "leaflet";
import { Map as MapIcon, ChevronUp, Info, ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MapSearchBar, type MapSearchBarHandle } from "@/components/map-search";
import { FYLKER } from "@/lib/fylker";
import { FlyTo, DataDisclaimer, MapError, interpolateColor, MAP_HEIGHT } from "@/lib/map-utils";
import { CompactCard } from "@/components/compact-card";
import { InfoModal } from "@/components/info-modal";
import { MapLoading } from "@/components/map-loading";
import { useHashSelection } from "@/lib/use-hash-selection";

// ─── Geodesic area from GeoJSON coordinates ────────────────

const RAD = Math.PI / 180;
const R = 6371000; // Earth radius in meters

function ringArea(coords: number[][]): number {
  let area = 0;
  for (let i = 0, len = coords.length; i < len; i++) {
    const j = (i + 1) % len;
    area += (coords[j][0] - coords[i][0]) * RAD *
      (2 + Math.sin(coords[i][1] * RAD) + Math.sin(coords[j][1] * RAD));
  }
  return Math.abs(area * R * R / 2);
}

function featureAreaKm2(geometry: { type: string; coordinates: number[][][] | number[][][][] }): number {
  let total = 0;
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as number[][][];
    total = ringArea(rings[0]);
    for (let i = 1; i < rings.length; i++) total -= ringArea(rings[i]);
  } else if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates as number[][][][]) {
      total += ringArea(polygon[0]);
      for (let i = 1; i < polygon.length; i++) total -= ringArea(polygon[i]);
    }
  }
  return total / 1e6;
}

// ─── Fylke lookup ───────────────────────────────────────────

const FYLKE_MAP: Record<string, string> = {};
FYLKER.forEach((f) => { FYLKE_MAP[f.fylkesnummer] = f.fylkesnavn; });

function getFylke(kommunenummer: string): string | null {
  return FYLKE_MAP[kommunenummer.substring(0, 2)] ?? null;
}

// ─── Qualitative label ─────────────────────────────────────

function vernLabel(pct: number): { text: string; color: string } {
  if (pct === 0) return { text: "Ingen vernet natur", color: "#6b7280" };
  if (pct < 5) return { text: "Lav andel vernet natur", color: "var(--kv-negative)" };
  if (pct < 15) return { text: "Under landsgjennomsnittet", color: "var(--kv-warning)" };
  if (pct < 25) return { text: "Rundt landsgjennomsnittet", color: "var(--kv-positive)" };
  if (pct < 50) return { text: "Godt over landsgjennomsnittet", color: "var(--kv-positive)" };
  return { text: "Blant de mest vernede i Norge", color: "var(--kv-positive)" };
}

// ─── Types ──────────────────────────────────────────────────

interface VerneData {
  total: number | null;
  np: number | null;
  nr: number | null;
  lv: number | null;
  nm: number | null;
}

import type { Suggestion } from "@/lib/map-utils";

interface SelectedKommune {
  kommunenummer: string;
  kommunenavn: string;
  vern: VerneData | null;
  totalAreaKm2: number;
  fylke: string | null;
  coords: { lat: number; lon: number };
}

const VERNE_LABELS: Record<string, string> = {
  np: "Nasjonalpark",
  nr: "Naturreservat",
  lv: "Landskapsvernområde",
  nm: "Andre vernekategorier",
};


/** Color by percentage of kommune that is protected. Caps at 60% for color scale. */
function vernePctColor(pct: number): string {
  if (pct <= 0) return "var(--kv-muted-fill)";
  const t = Math.max(0, Math.min(1, pct / 60));
  return interpolateColor(t);
}

function fmt(val: number | null): string {
  if (val == null) return "—";
  return `${val.toFixed(2).replace(".", ",")} km²`;
}

function computeVerneStats(
  verneData: Record<string, VerneData>,
  kommuneAreas: Record<string, number>,
  kommunenummer: string,
) {
  // Percentage-based ranking (all kommuner with area data)
  const withPct = Object.entries(verneData)
    .filter(([k]) => kommuneAreas[k] > 0)
    .map(([k, v]) => ({ k, pct: ((v.total ?? 0) / kommuneAreas[k]) * 100 }))
    .sort((a, b) => b.pct - a.pct);

  const rank = withPct.findIndex((c) => c.k === kommunenummer) + 1;
  const total = withPct.length;

  // National average: sum vernet / sum total area
  const sumVern = Object.entries(verneData).reduce((s, [k, v]) => s + (kommuneAreas[k] > 0 ? (v.total ?? 0) : 0), 0);
  const sumArea = Object.values(kommuneAreas).reduce((s, a) => s + a, 0);
  const nationalPct = sumArea > 0 ? (sumVern / sumArea) * 100 : 0;

  // Fylke ranking
  const fylkesnr = kommunenummer.substring(0, 2);
  const fylkeKommuner = withPct.filter((c) => c.k.startsWith(fylkesnr));
  const fylkeRank = fylkeKommuner.findIndex((c) => c.k === kommunenummer) + 1;
  const fylkeTotal = fylkeKommuner.length;

  return { rank, total, nationalPct, fylkeRank, fylkeTotal };
}

export function ProtectedAreasMap() {
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const [verneData, setVerneData] = useState<Record<string, VerneData>>({});
  const [loading, setLoading] = useState(true);
  const [counting, setCounting] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [error, setError] = useState(false);

  const [selected, setSelected] = useState<SelectedKommune | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lon: number; zoom?: number } | null>(null);
  const [showBase, setShowBase] = useState(false);
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const verneRef = useRef<Record<string, VerneData>>({});
  const kommuneAreasRef = useRef<Record<string, number>>({});
  const geoFeaturesRef = useRef<Array<{ kommunenummer: string; kommunenavn: string }>>([]);
  const layerRefs = useRef<Map<string, L.Path>>(new Map());
  const selectedKommuneRef = useRef<string | null>(null);
  const searchBarRef = useRef<MapSearchBarHandle>(null);

  const loadData = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const [geo, verne] = await Promise.all([
        fetch("/api/kommuner").then((r) => r.json()),
        fetch("/api/protected-areas").then((r) => r.json()),
      ]);
      verneRef.current = verne;
      const areas: Record<string, number> = {};
      geoFeaturesRef.current = (geo.features ?? []).map((f: { properties: { kommunenummer: string; kommunenavn: string }; geometry: { type: string; coordinates: number[][][] | number[][][][] } }) => {
        areas[f.properties.kommunenummer] = featureAreaKm2(f.geometry);
        return { kommunenummer: f.properties.kommunenummer, kommunenavn: f.properties.kommunenavn };
      });
      kommuneAreasRef.current = areas;
      setGeoData(geo);
      setVerneData(verne);
      const kommuneCount = Object.keys(verne).filter((k) => (verne[k]?.total ?? 0) > 0).length;
      setLoadedCount(kommuneCount);
      setCounting(true);
      setLoading(false);
      setTimeout(() => setCounting(false), 800);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const getPct = useCallback((nr: string) => {
    const total = verneRef.current[nr]?.total ?? 0;
    const area = kommuneAreasRef.current[nr] ?? 0;
    return area > 0 ? (total / area) * 100 : 0;
  }, []);

  const highlightKommune = useCallback((kommunenummer: string) => {
    if (selectedKommuneRef.current && selectedKommuneRef.current !== kommunenummer) {
      const prev = layerRefs.current.get(selectedKommuneRef.current);
      if (prev) {
        const p = getPct(selectedKommuneRef.current);
        prev.setStyle({ weight: 0.5, color: "white", fillColor: vernePctColor(p), fillOpacity: p > 0 ? 0.9 : 0.3 });
      }
    }
    const layer = layerRefs.current.get(kommunenummer);
    if (layer) {
      layer.setStyle({ weight: 2.5, color: "#24374c", fillOpacity: 1 });
      layer.bringToFront();
    }
    selectedKommuneRef.current = kommunenummer;
  }, []);

  // Deep linking: sync selected kommune ↔ URL hash (#kommune-<nr>)
  const restoreKommune = useCallback((nr: string) => {
    const match = geoFeaturesRef.current.find((f) => f.kommunenummer === nr);
    if (!match) return;
    highlightKommune(nr);
    setSelected({
      kommunenummer: nr,
      kommunenavn: match.kommunenavn,
      vern: verneRef.current[nr] ?? null,
      totalAreaKm2: kommuneAreasRef.current[nr] ?? 0,
      fylke: getFylke(nr),
      coords: { lat: 0, lon: 0 },
    });
    const layer = layerRefs.current.get(nr) as L.Polygon | undefined;
    const center = layer?.getBounds().getCenter();
    if (center) setFlyTarget({ lat: center.lat, lon: center.lng });
    setShowInfoSheet(true);
  }, [highlightKommune]);
  useHashSelection({
    prefix: "kommune",
    selectedId: selected?.kommunenummer ?? null,
    onRestore: restoreKommune,
    readyToRestore: !loading && geoData != null,
  });

  const clearSelection = useCallback(() => {
    if (selectedKommuneRef.current) {
      const layer = layerRefs.current.get(selectedKommuneRef.current);
      if (layer) {
        const p = getPct(selectedKommuneRef.current);
        layer.setStyle({ weight: 0.5, color: "white", fillColor: vernePctColor(p), fillOpacity: p > 0 ? 0.9 : 0.3 });
      }
      selectedKommuneRef.current = null;
    }
    setSelected(null);
    searchBarRef.current?.setQuery("");
  }, []);


  const handleSearchSelect = useCallback((s: Suggestion) => {
    if (s.type === "fylke") {
      searchBarRef.current?.setQuery(s.fylkesnavn);
      setFlyTarget({ lat: s.lat, lon: s.lon, zoom: s.zoom });
      return;
    }
    if (s.type === "kommune") {
      searchBarRef.current?.setQuery(s.kommunenavn);
      highlightKommune(s.kommunenummer);
      setSelected({ kommunenummer: s.kommunenummer, kommunenavn: s.kommunenavn, vern: verneRef.current[s.kommunenummer] ?? null, totalAreaKm2: kommuneAreasRef.current[s.kommunenummer] ?? 0, fylke: getFylke(s.kommunenummer), coords: { lat: 0, lon: 0 } });
      const layer = layerRefs.current.get(s.kommunenummer) as L.Polygon | undefined;
      const center = layer?.getBounds().getCenter();
      if (center) setFlyTarget({ lat: center.lat, lon: center.lng });
    } else if (s.type === "adresse") {
      const addr = s.addr;
      const nr = addr.kommunenummer ?? "";
      searchBarRef.current?.setQuery(addr.kommunenavn);
      if (nr) highlightKommune(nr);
      setSelected({ kommunenummer: nr, kommunenavn: addr.kommunenavn, vern: verneRef.current[nr] ?? null, totalAreaKm2: kommuneAreasRef.current[nr] ?? 0, fylke: getFylke(nr), coords: addr.representasjonspunkt });
      setFlyTarget(addr.representasjonspunkt);
    }
  }, [highlightKommune]);

  const geoStyle = (feature?: Feature) => {
    const nr = feature?.properties?.kommunenummer;
    const p = nr ? getPct(nr) : 0;
    return {
      fillColor: vernePctColor(p),
      weight: 0.5,
      color: "white",
      fillOpacity: p > 0 ? 0.9 : 0.3,
    };
  };

  const onEachFeature = (feature: Feature, layer: Layer) => {
    const nr = feature.properties?.kommunenummer;
    const navn = feature.properties?.kommunenavn ?? "";
    if (nr) layerRefs.current.set(nr, layer as L.Path);

    layer.on({
      mouseover(e) {
        const l = e.target as L.Path;
        if (nr !== selectedKommuneRef.current) {
          l.setStyle({ weight: 1.5, color: "#24374c", fillOpacity: 1 });
          l.bringToFront();
        }
      },
      mouseout(e) {
        const l = e.target as L.Path;
        if (nr !== selectedKommuneRef.current) {
          const p = getPct(nr);
          l.setStyle({ weight: 0.5, color: "white", fillColor: vernePctColor(p), fillOpacity: p > 0 ? 0.9 : 0.3 });
        }
      },
      click() {
        highlightKommune(nr);
        setSelected({
          kommunenummer: nr,
          kommunenavn: navn,
          vern: verneRef.current[nr] ?? null,
          totalAreaKm2: kommuneAreasRef.current[nr] ?? 0,
          fylke: getFylke(nr),
          coords: { lat: 0, lon: 0 },
        });
        selectedKommuneRef.current = nr;
      },
    });
  };

  return (
    <div className="flex flex-col" style={{ height: MAP_HEIGHT }}>
      {/* Search bar */}
      <div className="relative z-[1000] px-4 py-4 md:px-8 shrink-0 bg-background border-b">
        <div className="max-w-xl mx-auto relative">
          <MapSearchBar
            ref={searchBarRef}
            kommuneList={() => geoFeaturesRef.current}
            onSelect={handleSearchSelect}
            placeholder="Søk etter en kommune eller adresse..."
          />
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
          loadingMessage="Henter verneområdedata..."
        />
        {error && <MapError message="Kunne ikke laste data." onRetry={loadData} />}

        {!loading && !error && geoData && (
          <MapContainer center={[65, 14]} zoom={5} style={{ height: "100%", width: "100%" }}>
            {showBase && (
              <TileLayer
                url="https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png"
                attribution='&copy; <a href="https://www.kartverket.no/">Kartverket</a>'
              />
            )}
            {flyTarget && <FlyTo lat={flyTarget.lat} lon={flyTarget.lon} zoom={flyTarget.zoom} />}
            <GeoJSON
              key={Object.keys(verneData).length}
              data={geoData}
              style={geoStyle}
              onEachFeature={onEachFeature}
            />
          </MapContainer>
        )}

        {/* Legend + base layer toggle */}
        <div className="absolute top-3 right-3 z-[999] flex flex-col gap-2 items-end">
          <div className="hidden sm:block bg-card/90 rounded-xl border px-3 py-2 shadow text-xs">
            <p className="font-semibold text-muted-foreground mb-1.5">Andel vernet (%)</p>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-24 rounded-full" style={{ background: "linear-gradient(to right, var(--kv-negative), #facc15, var(--kv-positive))" }} />
            </div>
            <div className="flex justify-between mt-0.5 text-muted-foreground/70">
              <span>0%</span>
              <span>60%+</span>
            </div>
          </div>
          <button
            onClick={() => setShowBase((b) => !b)}
            className={`flex items-center gap-1.5 rounded-lg border bg-card shadow-md px-3 py-1.5 text-xs font-semibold transition-colors ${showBase ? "text-white" : "text-muted-foreground hover:bg-muted"}`}
            style={showBase ? { background: "var(--kv-blue)" } : {}}
          >
            <MapIcon className="h-3.5 w-3.5" />
            Bakgrunnskart
          </button>
        </div>

        {/* Compact info card */}
        {selected && !showInfoSheet && (() => {
          const vernTotal = selected.vern?.total ?? 0;
          const pct = selected.totalAreaKm2 > 0 ? (vernTotal / selected.totalAreaKm2) * 100 : 0;
          const label = vernLabel(pct);
          return (
            <CompactCard visible onClose={clearSelection}>
              <CompactCard.Header
                title={selected.kommunenavn}
                metric={vernTotal > 0 ? `${pct.toFixed(1).replace(".", ",")}%` : undefined}
                metricUnit={vernTotal > 0 ? "vernet" : undefined}
                metricColor={label.color}
              />
              <CompactCard.Context>
                <CompactCard.ContextLeft>
                  <CompactCard.ContextText>{selected.fylke ?? ""}</CompactCard.ContextText>
                </CompactCard.ContextLeft>
                <CompactCard.ContextRight>
                  {vernTotal > 0 ? <CompactCard.ContextText>{label.text}</CompactCard.ContextText> : <CompactCard.ContextText>Ingen data</CompactCard.ContextText>}
                </CompactCard.ContextRight>
              </CompactCard.Context>
              <CompactCard.Actions>
                <CompactCard.Action primary onClick={() => setShowInfoSheet(true)} icon={<ChevronUp className="h-3.5 w-3.5" />}>Vis mer</CompactCard.Action>
              </CompactCard.Actions>
            </CompactCard>
          );
        })()}

        {/* Info detail sheet */}
        <Sheet open={showInfoSheet && !!selected} onOpenChange={(open) => { setShowInfoSheet(open); if (!open && !selected) clearSelection(); }}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[85svh] overflow-y-auto">
            {selected && (() => {
              const vernTotal = selected.vern?.total ?? 0;
              const pct = selected.totalAreaKm2 > 0 ? (vernTotal / selected.totalAreaKm2) * 100 : 0;
              const label = vernLabel(pct);
              const stats = computeVerneStats(verneData, kommuneAreasRef.current, selected.kommunenummer);
              const aboveNational = pct >= stats.nationalPct;

              return (
                <div className="mx-auto w-full max-w-md px-4 pb-6">
                  <SheetHeader>
                    <SheetTitle className="text-left sr-only">{selected.kommunenavn}</SheetTitle>
                  </SheetHeader>

                  {/* Layer 1 — Identity */}
                  <p className="font-bold text-lg leading-snug">{selected.kommunenavn}</p>
                  <p className="text-sm text-muted-foreground">{selected.fylke ?? ""}</p>

                  {/* Layer 2 — Key metric: percentage + context */}
                  {vernTotal > 0 ? (
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-extrabold tabular-nums" style={{ color: label.color }}>
                          {pct.toFixed(1).replace(".", ",")}%
                        </p>
                        <p className="text-sm text-muted-foreground">av kommunen er vernet</p>
                      </div>
                      <p className="text-xs mt-1" style={{ color: label.color }}>{label.text}</p>

                      {/* National comparison */}
                      <div className="mt-4 flex items-center gap-3">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden relative">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(pct, 100)}%`, background: label.color }}
                          />
                          {/* National average marker */}
                          <div
                            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3.5 rounded-full bg-foreground/50"
                            style={{ left: `${Math.min(stats.nationalPct, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-foreground/70">0%</span>
                        <span className="text-[10px] text-foreground/70 flex items-center gap-1">
                          <span className="inline-block w-2 h-0.5 rounded-full bg-foreground/50" />
                          Snitt {stats.nationalPct.toFixed(1).replace(".", ",")}%
                        </span>
                      </div>

                      {/* Comparison badge */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span
                          className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-lg"
                          style={{
                            background: aboveNational ? "var(--kv-positive-light)" : "var(--kv-negative-light)",
                            color: aboveNational ? "var(--kv-positive)" : "var(--kv-negative)",
                          }}
                        >
                          {aboveNational ? "↑" : "↓"} {Math.abs(pct - stats.nationalPct).toFixed(1).replace(".", ",")} prosentpoeng {aboveNational ? "over" : "under"} landsgjennomsnittet
                        </span>
                      </div>

                      {/* Rankings */}
                      <div className="mt-4 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Nasjonalt</span>
                          <span className="font-medium tabular-nums">#{stats.rank} av {stats.total}</span>
                        </div>
                        {selected.fylke && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{selected.fylke}</span>
                            <span className="font-medium tabular-nums">#{stats.fylkeRank} av {stats.fylkeTotal}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm text-muted-foreground">Ingen registrerte verneområder i denne kommunen.</p>
                    </div>
                  )}

                  {/* Layer 3 — Category breakdown */}
                  {vernTotal > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-xs font-semibold uppercase tracking-widest text-foreground/70 mb-2">Fordeling</p>
                      <div className="flex flex-col gap-2">
                        {(["np", "nr", "lv", "nm"] as const).map((key) => {
                          const val = selected.vern![key];
                          if (!val) return null;
                          const catPct = selected.totalAreaKm2 > 0 ? (val / selected.totalAreaKm2) * 100 : 0;
                          return (
                            <div key={key}>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">{VERNE_LABELS[key]}</span>
                                <span className="font-medium tabular-nums">{fmt(val)}</span>
                              </div>
                              <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${Math.min(catPct * 2, 100)}%`, background: label.color, opacity: 0.6 }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-foreground/70 mt-3">
                        Totalt areal: {selected.totalAreaKm2.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0")} km²,
                        herav {vernTotal.toFixed(2).replace(".", ",")} km² vernet
                      </p>
                    </div>
                  )}

                  {/* Layer 4 — Source */}
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-foreground/70 text-center">
                      Kilde: <a href="https://www.ssb.no/natur-og-miljo/areal/statistikk/arealbruk-og-arealressurser" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">SSB tabell 08936</a>
                    </p>
                    <DataDisclaimer />
                  </div>
                </div>
              );
            })()}
          </SheetContent>
        </Sheet>
      </div>

      {/* Info modal */}
      <InfoModal open={showInfo} onClose={() => setShowInfo(false)} title="Om verneområdekartet">
        <p>
          Kartet viser <span className="font-medium text-foreground">vernet areal per kommune</span> i Norge, målt i km². Jo mørkere grønn farge, desto mer vernet areal har kommunen.
        </p>
        <p>
          Dataene er hentet fra <span className="font-medium text-foreground">SSB tabell 08936</span> og inkluderer fire vernekategorier:
        </p>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li><span className="font-medium text-foreground">Nasjonalpark</span> — store naturområder med lite inngrep</li>
          <li><span className="font-medium text-foreground">Naturreservat</span> — strengt vernet for å bevare naturtyper, arter eller geologiske forekomster</li>
          <li><span className="font-medium text-foreground">Landskapsvernområde</span> — vern av natur- eller kulturlandskap</li>
          <li><span className="font-medium text-foreground">Andre vernekategorier</span> — biotopvern, naturminner m.m.</li>
        </ul>
        <p>
          <span className="font-medium text-foreground">Rangering</span> viser kommunens plassering blant alle kommuner med vernet areal. Prosentavviket sammenlignes med medianverdien.
        </p>
        <a
          href="https://www.ssb.no/statbank/table/08936/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors mt-1"
        >
          <ExternalLink className="h-3 w-3" />
          Åpne SSB tabell 08936
        </a>
      </InfoModal>
    </div>
  );
}
