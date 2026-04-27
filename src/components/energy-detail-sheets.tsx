"use client";

import { Loader2, ExternalLink, Info, Waves, Gauge } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataDisclaimer } from "@/lib/map-utils";
import { DriveLink } from "@/components/drive-link";
import {
  formatFunctions, formatKind, titleCase,
  TYPE_META, WIND_STATUS_META, OILGAS_COLOR, HAVVIND_COLOR,
} from "@/components/energy-map-helpers";
import type {
  EnergyPlant, OilGasFacility, ProductionByField, HavvindZone, HydroStationData,
} from "@/components/energy-map-helpers";

// ─── Oil & Gas Detail Sheet ────────────────────────────────

export interface OilGasSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedOilGas: OilGasFacility | null;
  productionData: ProductionByField;
  productionFetchedAt: string | null;
  showProdInfo: boolean;
  onToggleProdInfo: () => void;
  showFacilityInfo: boolean;
  onToggleFacilityInfo: () => void;
}

export function OilGasSheet({
  open,
  onOpenChange,
  selectedOilGas,
  productionData,
  productionFetchedAt,
  showProdInfo,
  onToggleProdInfo,
  showFacilityInfo,
  onToggleFacilityInfo,
}: OilGasSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85svh] overflow-y-auto">
        {selectedOilGas && (
          <div className="mx-auto w-full max-w-md px-4 pb-6">
            <SheetHeader>
              <SheetTitle className="text-left sr-only">{selectedOilGas.name}</SheetTitle>
            </SheetHeader>

            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full text-white" style={{ background: OILGAS_COLOR }}>
                Olje & gass
              </span>
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-muted text-foreground">
                {selectedOilGas.isSurface ? "Overflate" : "Undervanns"}
              </span>
              {selectedOilGas.phase === "IN SERVICE" && (
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-800">I drift</span>
              )}
              {selectedOilGas.phase === "REMOVED" && (
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-800">Fjernet</span>
              )}
            </div>
            <p className="font-bold text-lg leading-snug">{selectedOilGas.name}</p>
            {selectedOilGas.operator && (
              <p className="text-sm text-muted-foreground">{selectedOilGas.operator}</p>
            )}

            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t">
              {selectedOilGas.waterDepth != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold" style={{ color: OILGAS_COLOR }}>
                    {Math.round(selectedOilGas.waterDepth)}
                  </span>
                  <span className="text-xs text-foreground/70">m dybde</span>
                </div>
              )}
              {selectedOilGas.yearStartup != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold" style={{ color: OILGAS_COLOR }}>
                    {selectedOilGas.yearStartup}
                  </span>
                  <span className="text-xs text-foreground/70">oppstart</span>
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t">
              <button
                onClick={onToggleFacilityInfo}
                className="flex items-center gap-1.5 mb-3 group"
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-foreground/70">Anleggsdetaljer</p>
                <Info className="h-3.5 w-3.5 text-muted-foreground/70 group-hover:text-muted-foreground transition-colors" />
              </button>
              {showFacilityInfo && (
                <div className="bg-muted/50 border rounded-xl p-3 mb-3">
                  <ul className="text-[11px] text-muted-foreground space-y-1">
                    <li><strong>Type</strong> – Fysisk konstruksjon, f.eks. fast plattform, FPSO eller undervannsmal</li>
                    <li><strong>Felt</strong> – Petroleumsfeltet anlegget tilhører. Flere anlegg kan dele samme felt</li>
                    <li><strong>Funksjoner</strong> – Hva anlegget gjør: produksjon, injeksjon, prosessering, boring osv.</li>
                    <li><strong>Status</strong> – Om anlegget er i aktiv drift, fjernet eller nedlagt</li>
                  </ul>
                  <p className="text-[10px] text-muted-foreground mt-2">Kilde: Sokkeldirektoratet (Sodir)</p>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium">{formatKind(selectedOilGas.kind)}</span>
                </div>
                {selectedOilGas.fieldName && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Felt</span>
                    <span className="font-medium">{titleCase(selectedOilGas.fieldName)}</span>
                  </div>
                )}
                {selectedOilGas.functions && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Funksjoner</span>
                    <span className="font-medium text-right max-w-[200px]">{formatFunctions(selectedOilGas.functions)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <span className="font-medium">{selectedOilGas.phase === "IN SERVICE" ? "I drift" : selectedOilGas.phase === "REMOVED" ? "Fjernet" : selectedOilGas.phase === "DECOMMISSIONED" ? "Nedlagt" : selectedOilGas.phase}</span>
                </div>
              </div>
            </div>

            {/* Production data */}
            {(() => {
              const fieldProd = selectedOilGas.fieldName ? productionData[selectedOilGas.fieldName] : null;
              if (!fieldProd || fieldProd.length === 0) return null;
              const totalOe = fieldProd.reduce((s, y) => s + y.oe, 0);
              const totalOil = fieldProd.reduce((s, y) => s + y.oil, 0);
              const totalGas = fieldProd.reduce((s, y) => s + y.gas, 0);
              const latest = fieldProd[fieldProd.length - 1];
              const maxOe = Math.max(...fieldProd.map((y) => y.oe));
              return (
                <div className="mt-4 pt-4 border-t">
                  <button
                    onClick={onToggleProdInfo}
                    className="flex items-center gap-1.5 mb-3 group"
                  >
                    <p className="text-xs font-semibold uppercase tracking-widest text-foreground/70">Produksjon, {selectedOilGas.fieldName}</p>
                    <Info className="h-3.5 w-3.5 text-muted-foreground/70 group-hover:text-muted-foreground transition-colors" />
                  </button>
                  {showProdInfo && (
                    <div className="bg-muted/50 border rounded-xl p-3 mb-3">
                      <ul className="text-[11px] text-muted-foreground space-y-1">
                        <li><strong>Sm³</strong> – Standardkubikkmeter, målt ved 15°C og 1 atm</li>
                        <li><strong>o.e.</strong> – Oljeekvivalenter, samlet mål for olje + gass + NGL + kondensat</li>
                        <li><strong>Olje</strong> – Netto salgbar råolje (mill Sm³)</li>
                        <li><strong>Gass</strong> – Netto salgbar naturgass (mrd Sm³)</li>
                      </ul>
                      <p className="text-[10px] text-muted-foreground mt-2">Kilde: Sokkeldirektoratet, årlig feltproduksjon{productionFetchedAt && ` · Hentet ${new Date(productionFetchedAt).toLocaleDateString("nb-NO")}`}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-2xl font-extrabold" style={{ color: OILGAS_COLOR }}>{totalOe.toFixed(1)}</span>
                      <p className="text-[10px] text-muted-foreground">mill Sm³ o.e. totalt</p>
                    </div>
                    <div>
                      <span className="text-2xl font-extrabold" style={{ color: OILGAS_COLOR }}>{latest.oe.toFixed(2)}</span>
                      <p className="text-[10px] text-muted-foreground">mill Sm³ o.e. ({latest.year})</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-muted-foreground">Olje</span>
                    <span className="font-medium">{totalOil.toFixed(1)} mill Sm³</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Gass</span>
                    <span className="font-medium">{totalGas.toFixed(1)} mrd Sm³</span>
                  </div>
                  {/* Sparkline */}
                  <div className="mt-3 flex items-end gap-[2px] h-10">
                    {fieldProd.map((y) => (
                      <div
                        key={y.year}
                        className="flex-1 rounded-sm min-w-[2px] transition-all"
                        style={{
                          height: `${Math.max(4, (y.oe / maxOe) * 100)}%`,
                          background: OILGAS_COLOR,
                          opacity: y.year === latest.year ? 1 : 0.4,
                        }}
                        title={`${y.year}: ${y.oe.toFixed(3)} mill Sm³ o.e.`}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-[10px] text-muted-foreground">{fieldProd[0].year}</span>
                    <span className="text-[10px] text-muted-foreground">{latest.year}</span>
                  </div>
                </div>
              );
            })()}

            <div className="mt-4 pt-4 border-t flex flex-col gap-3">
              {selectedOilGas.factPageUrl && (
                <a
                  href={selectedOilGas.factPageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border bg-muted/50 hover:bg-muted transition-colors w-full"
                >
                  <ExternalLink className="h-4 w-4" /> Les mer på Sodir
                </a>
              )}
              <p className="text-xs text-foreground/70 text-center">
                Kilde: <a href="https://www.sodir.no/en/facts/data-and-analyses/open-data/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Sokkeldirektoratet (Sodir)</a>
              </p>
              <DataDisclaimer />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Havvind Detail Sheet ──────────────────────────────────

export interface HavvindSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedHavvind: HavvindZone | null;
}

export function HavvindSheet({
  open,
  onOpenChange,
  selectedHavvind,
}: HavvindSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85svh] overflow-y-auto">
        {selectedHavvind && (
          <div className="mx-auto w-full max-w-md px-4 pb-6">
            <SheetHeader>
              <SheetTitle className="text-left sr-only">{selectedHavvind.name}</SheetTitle>
            </SheetHeader>

            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full text-white" style={{ background: HAVVIND_COLOR }}>
                Havvind · Utredning
              </span>
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-muted text-foreground">
                {selectedHavvind.typeAnlegg}
              </span>
            </div>
            <p className="font-bold text-lg leading-snug">{selectedHavvind.name}</p>
            <p className="text-sm text-muted-foreground">Planlagt utredningsområde, ingen turbiner er bygget ennå</p>

            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t">
              {selectedHavvind.arealKm2 != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold" style={{ color: HAVVIND_COLOR }}>
                    {selectedHavvind.arealKm2.toLocaleString("nb-NO")}
                  </span>
                  <span className="text-xs text-foreground/70">km² areal</span>
                </div>
              )}
              {selectedHavvind.minDistanceKm != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold" style={{ color: HAVVIND_COLOR }}>
                    {selectedHavvind.minDistanceKm}
                  </span>
                  <span className="text-xs text-foreground/70">km til land</span>
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Type</span>
                <span className="font-medium">{selectedHavvind.typeAnlegg}</span>
              </div>
              {selectedHavvind.arealKm2 != null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Areal</span>
                  <span className="font-medium">{selectedHavvind.arealKm2.toLocaleString("nb-NO")} km²</span>
                </div>
              )}
              {selectedHavvind.minDistanceKm != null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Avstand til fastland</span>
                  <span className="font-medium">{selectedHavvind.minDistanceKm} km</span>
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t flex flex-col gap-3">
              {selectedHavvind.nveUrl && (
                <a
                  href={selectedHavvind.nveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border bg-muted/50 hover:bg-muted transition-colors w-full"
                >
                  <ExternalLink className="h-4 w-4" /> Les mer på NVE
                </a>
              )}
              <p className="text-xs text-foreground/70 text-center">
                Kilde: <a href="https://kart.nve.no/enterprise/rest/services/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">NVE Geodata</a> · Havvind 2023
              </p>
              <DataDisclaimer />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Energy Plant Detail Sheet ─────────────────────────────

export interface EnergyPlantSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: EnergyPlant | null;
  loadingHydro: boolean;
  hydroStation: HydroStationData | null;
}

export function EnergyPlantSheet({
  open,
  onOpenChange,
  selected,
  loadingHydro,
  hydroStation,
}: EnergyPlantSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85svh] overflow-y-auto">
        {selected && (
          <div className="mx-auto w-full max-w-md px-4 pb-6">
            <SheetHeader>
              <SheetTitle className="text-left sr-only">{selected.name}</SheetTitle>
            </SheetHeader>

            {/* Layer 1 — Identity */}
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className="text-xs font-semibold px-1.5 py-0.5 rounded-full text-white"
                style={{ background: selected.type === "vind" && selected.windStatus ? WIND_STATUS_META[selected.windStatus].color : TYPE_META[selected.type].color }}
              >
                {TYPE_META[selected.type].label}
              </span>
              {selected.windStatus && selected.windStatus !== "operational" && (
                <span
                  className="text-xs font-semibold px-1.5 py-0.5 rounded-full text-white"
                  style={{ background: WIND_STATUS_META[selected.windStatus].color }}
                >
                  {WIND_STATUS_META[selected.windStatus].label}
                </span>
              )}
            </div>
            <p className="font-bold text-lg leading-snug">{selected.name}</p>
            {selected.owner && selected.owner !== selected.name && (
              <p className="text-sm text-muted-foreground">{selected.owner}</p>
            )}
            {(selected.municipality || selected.county) && (
              <p className="text-sm text-muted-foreground">
                {[selected.municipality, selected.county].filter(Boolean).join(", ")}
              </p>
            )}

            {/* Layer 2 — Key metrics */}
            <div className={`grid gap-4 mt-4 pt-4 border-t ${selected.type === "vind" ? "grid-cols-3" : "grid-cols-2"}`}>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold" style={{ color: TYPE_META[selected.type].color }}>
                  {selected.capacityMW != null ? Math.round(selected.capacityMW) : "—"}
                </span>
                <span className="text-xs text-foreground/70">MW kapasitet</span>
              </div>
              {selected.type === "vind" && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold" style={{ color: TYPE_META[selected.type].color }}>
                    {selected.turbineCount ?? "—"}
                  </span>
                  <span className="text-xs text-foreground/70">turbiner</span>
                </div>
              )}
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold" style={{ color: TYPE_META[selected.type].color }}>
                  {selected.type === "vind"
                    ? (selected.productionGWh != null ? Math.round(selected.productionGWh) : "—")
                    : (selected.fallHeight != null ? Math.round(selected.fallHeight) : "—")}
                </span>
                <span className="text-xs text-foreground/70">
                  {selected.type === "vind" ? "GWh/år" : "m fallhøyde"}
                </span>
              </div>
            </div>

            {/* Layer 3 — Details */}
            {selected.type === "vann" && (
              <div className="mt-4 pt-4 border-t flex flex-col gap-2">
                {selected.river && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Elv</span>
                    <span className="font-medium">{selected.river}</span>
                  </div>
                )}
                {selected.yearBuilt && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Idriftsatt</span>
                    <span className="font-medium">{selected.yearBuilt}</span>
                  </div>
                )}

                {/* Live hydro station data */}
                {loadingHydro && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Henter vanndata...
                  </div>
                )}
                {!loadingHydro && hydroStation?.station && (
                  <div className="mt-2 pt-3 border-t">
                    <div className="flex items-center gap-1.5 mb-3">
                      <Waves className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                        Målestasjon: {hydroStation.station.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        ({hydroStation.station.distanceKm} km unna)
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {hydroStation.discharge != null && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl font-extrabold" style={{ color: "var(--kv-metric)" }}>
                            {hydroStation.discharge.toFixed(1)}
                          </span>
                          <span className="text-xs text-foreground/70">m³/s vannføring</span>
                        </div>
                      )}
                      {hydroStation.waterLevel != null && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl font-extrabold" style={{ color: "var(--kv-metric)" }}>
                            {hydroStation.waterLevel.toFixed(2)}
                          </span>
                          <span className="text-xs text-foreground/70">m vannstand</span>
                        </div>
                      )}
                    </div>
                    {hydroStation.percentile && hydroStation.discharge != null && (
                      <div className="mt-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Gauge className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-foreground/70">Vannføring vs. normalen for denne tiden av året</span>
                        </div>
                        <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{
                              width: `${Math.min(100, Math.max(0, hydroStation.percentile.max ? (hydroStation.discharge / hydroStation.percentile.max) * 100 : 50))}%`,
                              background: hydroStation.percentile.p75 && hydroStation.discharge > hydroStation.percentile.p75
                                ? "var(--kv-negative)"
                                : hydroStation.percentile.p50 && hydroStation.discharge > hydroStation.percentile.p50
                                  ? "var(--kv-warning)"
                                  : "var(--kv-positive)",
                            }}
                          />
                        </div>
                        <div className="flex justify-between mt-0.5 text-[10px] text-muted-foreground">
                          <span>Lavt</span>
                          <span>{hydroStation.percentile.p50 != null ? `Median: ${hydroStation.percentile.p50.toFixed(1)} m³/s` : ""}</span>
                          <span>Høyt</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Layer 4 — Links & source */}
            <div className="mt-4 pt-4 border-t flex flex-col gap-3">
              <DriveLink lat={selected.lat} lon={selected.lon} />
              <p className="text-xs text-foreground/70 text-center">
                Kilde: <a href="https://kart.nve.no/enterprise/rest/services/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">NVE Geodata</a> · Oppdateres hver time
              </p>
              <DataDisclaimer />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
