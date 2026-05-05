"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, GeoJSON, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoJsonObject, Feature } from "geojson";
import type { Layer } from "leaflet";
import Link from "next/link";
import { Info, Map as MapIcon, ChevronUp, ExternalLink, ArrowRight, ArrowLeftRight } from "lucide-react";
import { kommuneSlug } from "@/lib/kommune-slug";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MapSearchBar, type MapSearchBarHandle } from "@/components/map-search";
import { FlyTo, DataDisclaimer, MapError, MAP_HEIGHT, TILE_URL_GRAATONE, KV_ATTRIBUTION, useMapCore, useCompare } from "@/lib/map-utils";
import { FYLKER } from "@/lib/fylker";
import { CompactCard } from "@/components/compact-card";
import { InfoModal } from "@/components/info-modal";
import { MapLoading } from "@/components/map-loading";
import { useHashSelection } from "@/lib/use-hash-selection";

import type { Suggestion } from "@/lib/map-utils";

import { partyFill, partyText } from "@/lib/party-colors";

interface PartyResult {
  kode: string;
  navn: string;
  prosent: number;
  stemmer: number;
  endring: number | null;
}

interface KommuneValg {
  kommunenavn: string;
  vinner: { kode: string; navn: string; prosent: number };
  partier: PartyResult[];
  frammote: number | null;
}

interface ValgFile {
  meta: { valgtype: string; valgår: number; kommuner: number };
  data: Record<string, KommuneValg>;
}

interface ManifestEntry {
  type: "st" | "ko";
  year: number;
  label: string;
  file: string;
  kommuner: number;
}

interface SelectedKommune {
  kommunenummer: string;
  kommunenavn: string;
}

function getFylke(kommunenummer: string): string | null {
  const prefix = kommunenummer.slice(0, 2);
  return FYLKER.find((f) => f.fylkesnummer === prefix)?.fylkesnavn ?? null;
}

function formatPct(v: number, decimals = 1): string {
  return `${v.toFixed(decimals).replace(".", ",")} %`;
}

function formatEndring(v: number | null): string {
  if (v == null) return "";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1).replace(".", ",")}`;
}

export function ValgMap() {
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const [manifest, setManifest] = useState<ManifestEntry[]>([]);
  const [activeKey, setActiveKey] = useState<string>("st-2025");
  const [valg, setValg] = useState<Record<string, KommuneValg>>({});
  const { loading, setLoading, error, setError } = useMapCore();
  const [switching, setSwitching] = useState(false);
  const [counting, setCounting] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);

  const [selected, setSelected] = useState<SelectedKommune | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lon: number; zoom?: number } | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showBase, setShowBase] = useState(false);
  const [showInfoSheet, setShowInfoSheet] = useState(false);

  const valgRef = useRef<Record<string, KommuneValg>>({});
  const geoFeaturesRef = useRef<Array<{ properties: { kommunenummer: string; navn: string } }>>([]);
  const layerRefs = useRef<Map<string, L.Path>>(new Map());
  const selectedKommuneRef = useRef<string | null>(null);
  const searchBarRef = useRef<MapSearchBarHandle>(null);

  const active = manifest.find((m) => `${m.type}-${m.year}` === activeKey) ?? null;
  const activeType = active?.type ?? "st";
  const yearsForType = manifest.filter((m) => m.type === activeType).sort((a, b) => b.year - a.year);

  // Compare state machine.
  const getSelectedId = useCallback((s: SelectedKommune) => s.kommunenummer, []);
  const hasValgData = useCallback((knr: string) => !!valgRef.current[knr], []);
  const {
    compareMode, compareQuery, setCompareQuery, compareHighlight, setCompareHighlight,
    compareTarget, showCompare, compareResults,
    activateCompare, selectTarget, cancelCompare, resetCompare, closeCompareSheet,
    handleCompareClick,
  } = useCompare<SelectedKommune>(selected, getSelectedId, useCallback(() => geoFeaturesRef.current ?? [], []), hasValgData);

  const loadData = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const [geo, manifestRes] = await Promise.all([
        fetch("/api/kommuner").then((r) => r.json()),
        fetch("/data/valg/index.json").then((r) => r.json() as Promise<ManifestEntry[]>),
      ]);
      const initial = manifestRes.find((m) => `${m.type}-${m.year}` === "st-2025") ?? manifestRes[0];
      const valgFile = (await fetch(`/data/valg/${initial.file}`).then((r) => r.json())) as ValgFile;
      valgRef.current = valgFile.data;
      geoFeaturesRef.current = (geo.features ?? []).map((f: { properties: { kommunenummer: string; kommunenavn: string } }) => ({
        properties: { kommunenummer: f.properties.kommunenummer, navn: f.properties.kommunenavn },
      }));
      setGeoData(geo);
      setManifest(manifestRes);
      setActiveKey(`${initial.type}-${initial.year}`);
      setValg(valgFile.data);
      setLoadedCount(Object.keys(valgFile.data).length);
      setCounting(true);
      setLoading(false);
      setTimeout(() => setCounting(false), 800);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, [setError, setLoading]);

  useEffect(() => { loadData(); }, [loadData]);

  const switchElection = useCallback(async (key: string) => {
    if (key === activeKey) return;
    const entry = manifest.find((m) => `${m.type}-${m.year}` === key);
    if (!entry) return;
    setSwitching(true);
    try {
      const valgFile = (await fetch(`/data/valg/${entry.file}`).then((r) => r.json())) as ValgFile;
      valgRef.current = valgFile.data;
      // GeoJSON remounts (key prop) → layerRefs from prior election are stale.
      layerRefs.current.clear();
      setValg(valgFile.data);
      setActiveKey(key);
      setLoadedCount(Object.keys(valgFile.data).length);
    } catch {
      // swallow — keep prior data
    } finally {
      setSwitching(false);
    }
  }, [activeKey, manifest]);

  // After election switch, re-apply selection highlight onto the freshly mounted layers.
  useEffect(() => {
    if (!selected) return;
    const id = requestAnimationFrame(() => {
      const layer = layerRefs.current.get(selected.kommunenummer);
      if (layer) {
        layer.setStyle({ weight: 2.5, color: "#24374c", fillOpacity: 1 });
        layer.bringToFront();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [activeKey, selected]);

  const highlightKommune = useCallback((kommunenummer: string) => {
    if (selectedKommuneRef.current && selectedKommuneRef.current !== kommunenummer) {
      const prev = layerRefs.current.get(selectedKommuneRef.current);
      if (prev) {
        const has = !!valgRef.current[selectedKommuneRef.current];
        prev.setStyle({ weight: 0.5, color: "white", fillOpacity: has ? 0.85 : 0.3 });
      }
    }
    const layer = layerRefs.current.get(kommunenummer);
    if (layer) {
      layer.setStyle({ weight: 2.5, color: "#24374c", fillOpacity: 1 });
      layer.bringToFront();
    }
    selectedKommuneRef.current = kommunenummer;
  }, []);

  const restoreKommune = useCallback((nr: string) => {
    const match = geoFeaturesRef.current.find((f) => f.properties.kommunenummer === nr);
    if (!match) return;
    highlightKommune(nr);
    setSelected({ kommunenummer: nr, kommunenavn: match.properties.navn });
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
        const has = !!valgRef.current[selectedKommuneRef.current];
        layer.setStyle({ weight: 0.5, color: "white", fillOpacity: has ? 0.85 : 0.3 });
      }
      selectedKommuneRef.current = null;
    }
    setSelected(null);
    resetCompare();
    searchBarRef.current?.setQuery("");
  }, [resetCompare]);

  const handleSearchSelect = useCallback((s: Suggestion) => {
    if (s.type === "fylke") {
      searchBarRef.current?.setQuery(s.fylkesnavn);
      setFlyTarget({ lat: s.lat, lon: s.lon, zoom: s.zoom });
      return;
    }
    if (s.type === "kommune") {
      searchBarRef.current?.setQuery(s.kommunenavn);
      highlightKommune(s.kommunenummer);
      setSelected({ kommunenummer: s.kommunenummer, kommunenavn: s.kommunenavn });
      const layer = layerRefs.current.get(s.kommunenummer) as L.Polygon | undefined;
      const center = layer?.getBounds().getCenter();
      if (center) setFlyTarget({ lat: center.lat, lon: center.lng });
    } else if (s.type === "adresse") {
      const addr = s.addr;
      const nr = addr.kommunenummer ?? "";
      searchBarRef.current?.setQuery(addr.kommunenavn);
      if (nr) highlightKommune(nr);
      setSelected({ kommunenummer: nr, kommunenavn: addr.kommunenavn });
      setFlyTarget(addr.representasjonspunkt);
    }
  }, [highlightKommune]);

  const geoStyle = (feature?: Feature) => {
    const nr = feature?.properties?.kommunenummer;
    const entry = valgRef.current[nr];
    return {
      fillColor: entry ? partyFill(entry.vinner.kode) : "var(--kv-muted-fill)",
      weight: 0.5,
      color: "white",
      fillOpacity: entry ? 0.85 : 0.3,
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
          // Thick white halo — high contrast against any saturated party color.
          // Avoids the "border-mixes-with-fill" issue you'd get with a blue
          // hover ring on top of FRP dark blue or A red fills.
          l.setStyle({ weight: 3, color: "white", fillOpacity: 0.85 });
          l.bringToFront();
        }
      },
      mouseout(e) {
        const l = e.target as L.Path;
        if (nr !== selectedKommuneRef.current) {
          const has = !!valgRef.current[nr];
          l.setStyle({ weight: 0.5, color: "white", fillOpacity: has ? 0.85 : 0.3 });
        }
      },
      click() {
        if (handleCompareClick(nr, () => ({ kommunenummer: nr, kommunenavn: navn }))) return;
        highlightKommune(nr);
        setSelected({ kommunenummer: nr, kommunenavn: navn });
        selectedKommuneRef.current = nr;
      },
    });
  };

  const selectedEntry = selected ? valg[selected.kommunenummer] : null;

  // Legend: count of kommuner per winning party (sorted desc, top 6 + "Andre")
  const partyCounts = (() => {
    const counts: Record<string, number> = {};
    for (const v of Object.values(valg)) {
      counts[v.vinner.kode] = (counts[v.vinner.kode] ?? 0) + 1;
    }
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    return sorted;
  })();

  return (
    <div className="flex flex-col" style={{ height: MAP_HEIGHT }}>
      {/* Search bar + selectors + freshness strip */}
      <div className="relative z-[1000] px-4 py-4 md:px-8 shrink-0 bg-background border-b">
        <div className="max-w-xl mx-auto relative flex flex-col gap-2">
          <MapSearchBar
            ref={searchBarRef}
            kommuneList={() => geoFeaturesRef.current.map((f) => ({ kommunenummer: f.properties.kommunenummer, kommunenavn: f.properties.navn }))}
            onSelect={handleSearchSelect}
            placeholder="Søk etter en adresse for å finne kommunen..."
          />

          {/* Type segmented control + year chips */}
          {manifest.length > 0 && (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div role="tablist" aria-label="Valgtype" className="inline-flex rounded-lg border bg-muted p-0.5 text-xs font-semibold">
                {(["st", "ko"] as const).map((t) => {
                  const isActive = activeType === t;
                  const label = t === "st" ? "Stortingsvalg" : "Kommunevalg";
                  return (
                    <button
                      key={t}
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => {
                        const candidate = manifest.find((m) => m.type === t);
                        if (candidate) switchElection(`${candidate.type}-${candidate.year}`);
                      }}
                      className={`rounded-md px-3 py-1.5 transition-colors ${isActive ? "text-white" : "text-foreground/70 hover:text-foreground"}`}
                      style={isActive ? { background: "var(--kv-blue)" } : {}}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="inline-flex gap-1">
                {yearsForType.map((m) => {
                  const key = `${m.type}-${m.year}`;
                  const isActive = key === activeKey;
                  return (
                    <button
                      key={key}
                      onClick={() => switchElection(key)}
                      aria-pressed={isActive}
                      className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold tabular-nums transition-colors ${isActive ? "text-white border-transparent" : "text-foreground/70 hover:bg-muted"}`}
                      style={isActive ? { background: "var(--kv-blue)" } : {}}
                    >
                      {m.year}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-foreground/70">
              {loading
                ? "Henter valgresultater..."
                : switching
                ? "Bytter valg..."
                : `${loadedCount} kommuner · ${active?.label ?? ""} · Kilde: Valgdirektoratet`}
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
      </div>

      {/* Map */}
      <div className="relative grow">
        <MapLoading
          visible={loading || counting}
          loading={loading}
          counting={counting}
          count={loadedCount}
          countLabel="kommuner lastet"
          loadingMessage="Henter valgresultater..."
        />
        {error && <MapError message="Kunne ikke laste data." onRetry={loadData} />}

        {!loading && !error && geoData && (
          <MapContainer
            center={[65, 14]}
            zoom={5}
            style={{ height: "100%", width: "100%" }}
            zoomControl={true}
          >
            {showBase && <TileLayer url={TILE_URL_GRAATONE} attribution={KV_ATTRIBUTION} />}
            {flyTarget && <FlyTo lat={flyTarget.lat} lon={flyTarget.lon} zoom={flyTarget.zoom} />}
            <GeoJSON
              key={activeKey}
              data={geoData}
              style={geoStyle}
              onEachFeature={onEachFeature}
            />
          </MapContainer>
        )}

        {/* Compact card */}
        <CompactCard visible={!!selected && !showInfoSheet && !showCompare} onClose={clearSelection}>
          {selected && (<>
            <CompactCard.Header
              title={selected.kommunenavn}
              metric={selectedEntry ? selectedEntry.vinner.kode : undefined}
            />
            <CompactCard.Context>
              <CompactCard.ContextLeft>
                <CompactCard.ContextText>{getFylke(selected.kommunenummer)}</CompactCard.ContextText>
              </CompactCard.ContextLeft>
              <CompactCard.ContextRight>
                {selectedEntry && (
                  <span className="text-xs font-semibold" style={{ color: partyText(selectedEntry.vinner.kode) }}>
                    {formatPct(selectedEntry.vinner.prosent)}
                  </span>
                )}
              </CompactCard.ContextRight>
            </CompactCard.Context>
            {compareMode ? (
              <CompactCard.Custom>
                <p className="text-[10px] text-muted-foreground mb-1.5">Velg en kommune å sammenligne med, eller klikk på kartet.</p>
                <div className="relative">
                  <input
                    autoFocus={typeof window !== "undefined" && window.innerWidth >= 640}
                    value={compareQuery}
                    onChange={(e) => { setCompareQuery(e.target.value); setCompareHighlight(-1); }}
                    onKeyDown={(e) => {
                      if (compareResults.length === 0) return;
                      if (e.key === "ArrowDown") { e.preventDefault(); setCompareHighlight((i) => Math.min(i + 1, compareResults.length - 1)); }
                      else if (e.key === "ArrowUp") { e.preventDefault(); setCompareHighlight((i) => Math.max(i - 1, 0)); }
                      else if (e.key === "Enter" && compareHighlight >= 0) {
                        e.preventDefault();
                        const k = compareResults[compareHighlight];
                        selectTarget({ kommunenummer: k.properties.kommunenummer, kommunenavn: k.properties.navn });
                      }
                      else if (e.key === "Escape") { cancelCompare(); }
                    }}
                    placeholder="Sammenlign med..."
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    enterKeyHint="search"
                    className="w-full bg-muted border rounded-xl px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring placeholder:text-muted-foreground text-[16px] sm:text-sm"
                  />
                  {compareResults.length > 0 && (
                    <ul className="absolute top-full mt-1 left-0 right-0 bg-background rounded-xl shadow-xl border overflow-hidden z-50">
                      {compareResults.map((k, i) => (
                        <li key={k.properties.kommunenummer}>
                          <button
                            onMouseDown={() => {
                              selectTarget({ kommunenummer: k.properties.kommunenummer, kommunenavn: k.properties.navn });
                            }}
                            className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-b last:border-0 ${compareHighlight === i ? "bg-muted" : "hover:bg-muted"}`}
                          >
                            <p className="font-medium">{k.properties.navn}</p>
                            <p className="text-[10px] text-muted-foreground">{getFylke(k.properties.kommunenummer)}</p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <button
                  onClick={cancelCompare}
                  className="mt-2 text-xs text-foreground/70 hover:text-foreground transition-colors"
                >
                  Avbryt
                </button>
              </CompactCard.Custom>
            ) : (
              <CompactCard.Actions>
                <CompactCard.Action primary onClick={() => setShowInfoSheet(true)} icon={<ChevronUp className="h-3.5 w-3.5" />}>Vis mer</CompactCard.Action>
                {selectedEntry && (
                  <CompactCard.Action onClick={activateCompare} icon={<ArrowLeftRight className="h-3.5 w-3.5" />}>Sammenlign</CompactCard.Action>
                )}
              </CompactCard.Actions>
            )}
          </>)}
        </CompactCard>

        {/* Detail sheet */}
        <Sheet open={showInfoSheet && !!selected} onOpenChange={(open) => { setShowInfoSheet(open); if (!open && !selected) clearSelection(); }}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[85svh] overflow-y-auto">
            {selected && (
              <div className="mx-auto w-full max-w-md px-4 pb-6">
                <SheetHeader>
                  <SheetTitle className="text-left sr-only">{selected.kommunenavn}</SheetTitle>
                </SheetHeader>

                <p className="font-bold text-lg leading-snug">{selected.kommunenavn}</p>
                <p className="text-sm text-muted-foreground">{getFylke(selected.kommunenummer)}</p>

                {selectedEntry ? (
                  <>
                    {/* Vinner */}
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-extrabold" style={{ color: partyText(selectedEntry.vinner.kode) }}>
                          {selectedEntry.vinner.kode}
                        </span>
                        <span className="text-sm font-medium text-muted-foreground">
                          {formatPct(selectedEntry.vinner.prosent)} · {selectedEntry.vinner.navn}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/70 mt-1">Største parti — {active?.label ?? ""}</p>
                    </div>

                    {/* Top partier */}
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-xs font-semibold text-foreground/70 mb-2">Stemmefordeling</p>
                      <ul className="space-y-2">
                        {selectedEntry.partier.slice(0, 8).map((p) => (
                          <li key={p.kode} className="flex items-center gap-2">
                            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: partyFill(p.kode) }} />
                            <span className="text-sm font-medium w-12 shrink-0">{p.kode}</span>
                            <span className="text-sm text-foreground/80 flex-1 truncate">{p.navn}</span>
                            <span className="text-sm font-semibold tabular-nums">{formatPct(p.prosent)}</span>
                            {p.endring != null && (
                              <span
                                className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums shrink-0"
                                style={{
                                  background: p.endring >= 0 ? "var(--kv-positive-light)" : "var(--kv-negative-light)",
                                  color: p.endring >= 0 ? "var(--kv-positive-dark)" : "var(--kv-negative-dark)",
                                }}
                              >
                                {formatEndring(p.endring)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Frammøte */}
                    {selectedEntry.frammote != null && (
                      <div className="mt-4 pt-4 border-t">
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-extrabold" style={{ color: "var(--kv-blue)" }}>
                            {formatPct(selectedEntry.frammote)}
                          </span>
                          <span className="text-sm text-foreground/70">frammøte</span>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">Ingen valgresultater for denne kommunen.</p>
                )}

                {/* Stedsprofil link */}
                <div className="mt-4 pt-4 border-t">
                  <Link
                    href={`/kommune/${kommuneSlug(selected.kommunenummer, selected.kommunenavn)}`}
                    className="flex items-center justify-between rounded-xl border bg-muted/40 hover:bg-muted px-4 py-3 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--kv-blue)" }}>Se full stedsprofil</p>
                      <p className="text-xs text-foreground/70 mt-0.5">Boligpriser, energi, natur og mer</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-foreground/70 shrink-0" />
                  </Link>
                </div>

                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-foreground/70 text-center">
                    Kilde: <a href="https://valgresultat.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Valgdirektoratet</a>{active?.label ? ` · ${active.label}` : ""}
                  </p>
                  <DataDisclaimer />
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Comparison sheet */}
        <Sheet open={showCompare && !!selected && !!compareTarget} onOpenChange={(open) => { if (!open) closeCompareSheet(); }}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[85svh] overflow-y-auto">
            {selected && compareTarget && (() => {
              const a = selected;
              const b = compareTarget;
              const eA = valg[a.kommunenummer];
              const eB = valg[b.kommunenummer];
              if (!eA || !eB) return null;

              // Build the union of partier in either kommune's top list, then
              // sort by the higher of the two prosent values so the most
              // visually important rows lead.
              const aMap = new Map(eA.partier.map((p) => [p.kode, p]));
              const bMap = new Map(eB.partier.map((p) => [p.kode, p]));
              const allKoder = new Set<string>([...aMap.keys(), ...bMap.keys()]);
              const partyRows = [...allKoder]
                .map((kode) => {
                  const pA = aMap.get(kode);
                  const pB = bMap.get(kode);
                  return {
                    kode,
                    navn: pA?.navn ?? pB?.navn ?? kode,
                    a: pA?.prosent ?? 0,
                    b: pB?.prosent ?? 0,
                    diff: (pA?.prosent ?? 0) - (pB?.prosent ?? 0),
                  };
                })
                .sort((r1, r2) => Math.max(r2.a, r2.b) - Math.max(r1.a, r1.b))
                .slice(0, 8);

              const maxBar = Math.max(
                ...partyRows.flatMap((r) => [r.a, r.b]),
                1,
              );
              const sameVinner = eA.vinner.kode === eB.vinner.kode;
              const winnerDiff = eA.vinner.prosent - eB.vinner.prosent;
              const frammoteDiff =
                eA.frammote != null && eB.frammote != null ? eA.frammote - eB.frammote : null;

              return (
                <div className="mx-auto w-full max-w-lg px-4 pb-6">
                  <SheetHeader>
                    <SheetTitle className="text-left sr-only">Sammenligning</SheetTitle>
                  </SheetHeader>

                  <div className="flex items-center gap-1.5 mb-3">
                    <ArrowLeftRight className="h-4 w-4" style={{ color: "var(--kv-blue)" }} />
                    <p className="text-xs font-semibold text-foreground/70">Sammenligning · {active?.label ?? ""}</p>
                  </div>

                  {/* Header: two kommunenavn */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="font-bold text-base leading-snug">{a.kommunenavn}</p>
                      <p className="text-xs text-foreground/70">{getFylke(a.kommunenummer)}</p>
                    </div>
                    <div>
                      <p className="font-bold text-base leading-snug">{b.kommunenavn}</p>
                      <p className="text-xs text-foreground/70">{getFylke(b.kommunenummer)}</p>
                    </div>
                  </div>

                  {/* Hero: vinnerparti per kommune */}
                  <div className="mt-4 pt-4 border-t">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-2xl font-extrabold" style={{ color: partyText(eA.vinner.kode) }}>
                          {eA.vinner.kode}
                        </span>
                        <p className="text-[11px] text-muted-foreground">{formatPct(eA.vinner.prosent)} · størst</p>
                      </div>
                      <div>
                        <span className="text-2xl font-extrabold" style={{ color: partyText(eB.vinner.kode) }}>
                          {eB.vinner.kode}
                        </span>
                        <p className="text-[11px] text-muted-foreground">{formatPct(eB.vinner.prosent)} · størst</p>
                      </div>
                    </div>
                    {sameVinner && (
                      <p className="mt-2 text-xs text-foreground/70">
                        Samme vinnerparti — forskjell på {formatPct(Math.abs(winnerDiff))}.
                      </p>
                    )}
                    {!sameVinner && (
                      <p className="mt-2 text-xs text-foreground/70">
                        Ulike vinnerpartier i de to kommunene.
                      </p>
                    )}
                  </div>

                  {/* Partier — bar comparison */}
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs font-semibold text-foreground/70 mb-3">Stemmefordeling</p>
                    <ul className="space-y-2.5">
                      {partyRows.map((r) => (
                        <li key={r.kode}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: partyFill(r.kode) }} />
                            <span className="text-xs font-medium w-12 shrink-0">{r.kode}</span>
                            <span className="text-xs text-foreground/80 flex-1 truncate">{r.navn}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 pl-[1.125rem]">
                            <div className="flex items-center gap-1.5">
                              <div className="h-1.5 grow rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${(r.a / maxBar) * 100}%`, background: partyFill(r.kode) }} />
                              </div>
                              <span className="text-[11px] font-semibold tabular-nums w-10 text-right">{formatPct(r.a, 1)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="h-1.5 grow rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${(r.b / maxBar) * 100}%`, background: partyFill(r.kode) }} />
                              </div>
                              <span className="text-[11px] font-semibold tabular-nums w-10 text-right">{formatPct(r.b, 1)}</span>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Frammøte */}
                  {eA.frammote != null && eB.frammote != null && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-xs font-semibold text-foreground/70 mb-2">Frammøte</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-xl font-extrabold" style={{ color: "var(--kv-blue)" }}>{formatPct(eA.frammote)}</span>
                        </div>
                        <div>
                          <span className="text-xl font-extrabold" style={{ color: "var(--kv-blue)" }}>{formatPct(eB.frammote)}</span>
                        </div>
                      </div>
                      {frammoteDiff != null && (
                        <p className="mt-1.5 text-xs text-foreground/70">
                          {a.kommunenavn} har {Math.abs(frammoteDiff).toFixed(1).replace(".", ",")} prosentpoeng {frammoteDiff >= 0 ? "høyere" : "lavere"} frammøte.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Source */}
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-foreground/70 text-center">
                      Kilde: <a href="https://valgresultat.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Valgdirektoratet</a>{active?.label ? ` · ${active.label}` : ""}
                    </p>
                    <DataDisclaimer />
                  </div>
                </div>
              );
            })()}
          </SheetContent>
        </Sheet>

        {/* Legend */}
        {!loading && partyCounts.length > 0 && (
          <div className="absolute top-3 right-3 z-[999] flex flex-col gap-2 items-end">
            <div className="hidden sm:block bg-card rounded-xl shadow-md px-3 py-2.5" style={{ border: "1px solid var(--kv-muted-fill)" }}>
              <p className="text-xs font-semibold text-foreground/70 mb-1.5">Største parti per kommune</p>
              <ul className="space-y-1">
                {partyCounts.map(([kode, count]) => (
                  <li key={kode} className="flex items-center gap-2 text-xs">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: partyFill(kode) }} />
                    <span className="font-medium w-10">{kode}</span>
                    <span className="text-foreground/60 tabular-nums">{count}</span>
                  </li>
                ))}
              </ul>
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
        )}
      </div>

      <InfoModal open={showInfo} onClose={() => setShowInfo(false)} title="Om valgkartet">
        <p>
          Kartet viser <span className="font-medium text-foreground">det største partiet i hver kommune</span> ved valget. Hver kommune er farget etter vinnerpartiet, og du kan bytte mellom Stortingsvalg og Kommunestyrevalg samt år i toppen.
        </p>
        <p>
          Klikk på en kommune for å se full stemmefordeling, frammøte og endring fra forrige valg.
        </p>
        <p>
          Resultatene er offisielle og endelige tall publisert av Valgdirektoratet.
        </p>
        <a
          href="https://valgresultat.no"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors mt-1"
        >
          <ExternalLink className="h-3 w-3" />
          Åpne valgresultat.no
        </a>
      </InfoModal>
    </div>
  );
}
