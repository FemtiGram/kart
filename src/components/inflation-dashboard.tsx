"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, TrendingUp, TrendingDown, X,
  UtensilsCrossed, Wine, Shirt, Home, Sofa, Heart,
  Car, Smartphone, Ticket, GraduationCap, ShoppingBag,
  Info, ChevronDown, ChevronUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis, ReferenceLine, Cell } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

// ─── Types ──────────────────────────────────────────────────

interface CategoryData {
  code: string;
  name: string;
  change12m: number | null;
  change1m: number | null;
}

interface TrendPoint {
  month: string;
  total: number | null;
  jae: number | null;
  rate: number | null;
}

interface InflationData {
  current: {
    total: number | null;
    total1m: number | null;
    jae: number | null;
    rate: number | null;
    month: string;
    monthCode: string;
  };
  categories: CategoryData[];
  trend: TrendPoint[];
  nordic: Record<string, number | null>;
  yearly: { year: string; change: number | null }[];
}

// ─── Category icons ─────────────────────────────────────────

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "01": UtensilsCrossed,
  "02": Wine,
  "03": Shirt,
  "04": Home,
  "05": Sofa,
  "06": Heart,
  "07": Car,
  "08": Smartphone,
  "09": Ticket,
  "10": GraduationCap,
  "11": UtensilsCrossed,
  "12": ShoppingBag,
};

const CATEGORY_SHORT: Record<string, string> = {
  "01": "Mat og drikke",
  "02": "Alkohol og tobakk",
  "03": "Klær og sko",
  "04": "Bolig og energi",
  "05": "Møbler og husholdning",
  "06": "Helse",
  "07": "Transport",
  "08": "Kommunikasjon",
  "09": "Kultur og fritid",
  "10": "Utdanning",
  "11": "Restaurant og hotell",
  "12": "Andre varer",
};

const NORDIC_LABELS: Record<string, string> = {
  NO: "Norge",
  SE: "Sverige",
  DK: "Danmark",
  FI: "Finland",
  EU: "EU-snitt",
};

const NORDIC_FLAGS: Record<string, string> = {
  NO: "🇳🇴",
  SE: "🇸🇪",
  DK: "🇩🇰",
  FI: "🇫🇮",
  EU: "🇪🇺",
};

// ─── Helpers ────────────────────────────────────────────────

function targetBadge(val: number | null, target: number): { text: string; className: string } {
  if (val == null) return { text: "–", className: "bg-muted text-muted-foreground" };
  const diff = val - target;
  if (Math.abs(diff) <= 0.3) return { text: `Nær målet (${target} %)`, className: "bg-green-50 text-green-700" };
  if (diff > 1.5) return { text: `Godt over målet (${target} %)`, className: "bg-red-50 text-red-700" };
  if (diff > 0) return { text: `Over målet (${target} %)`, className: "bg-orange-50 text-orange-700" };
  if (diff < -1.5) return { text: `Godt under målet (${target} %)`, className: "bg-blue-50 text-blue-700" };
  return { text: `Under målet (${target} %)`, className: "bg-blue-50 text-blue-700" };
}

function changeColor(val: number | null): string {
  // 700-family so the text clears WCAG AA (≥4.5:1) on white backgrounds.
  // 600 is 2.9–3.6:1 on white, which fails for normal text.
  if (val == null) return "text-foreground/70";
  if (val > 4) return "text-red-700";
  if (val > 2) return "text-orange-700";
  if (val > 0) return "text-yellow-700";
  return "text-green-700";
}

function changeBg(val: number | null): string {
  if (val == null) return "bg-muted";
  if (val > 4) return "bg-red-50";
  if (val > 2) return "bg-orange-50";
  if (val > 0) return "bg-yellow-50";
  return "bg-green-50";
}

function formatMonth(code: string): string {
  const [y, m] = code.split("M");
  const months = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
  return `${months[parseInt(m) - 1]} ${y.slice(2)}`;
}

// ─── Chart configs ──────────────────────────────────────────

const trendChartConfig = {
  value: { label: "Verdi", color: "var(--kv-blue)" },
} satisfies ChartConfig;

const yearlyChartConfig = {
  change: { label: "Prisvekst", color: "var(--kv-warning)" },
} satisfies ChartConfig;

// ─── Main component ─────────────────────────────────────────

export function InflationDashboard() {
  const [data, setData] = useState<InflationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [trendView, setTrendView] = useState<"kpi" | "jae" | "rente">("kpi");
  const [infoModal, setInfoModal] = useState<"kpi" | "jae" | "rente" | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/inflation");
      if (!res.ok) throw new Error();
      const d = await res.json();
      setData(d);
    } catch {
      setError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--kv-blue)" }} />
          <p className="text-sm text-muted-foreground">Henter prisvekstdata...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-3">Kunne ikke laste data.</p>
          <button onClick={loadData} className="text-sm font-semibold px-4 py-2 rounded-xl border hover:bg-muted transition-colors">
            Prøv igjen
          </button>
        </div>
      </div>
    );
  }

  const { current, categories, trend, nordic, yearly } = data;


  return (
    <div className="space-y-8">
      {/* Hero stat cards */}
      <div>
        <h2 className="text-lg font-bold mb-1" style={{ color: "#24374c" }}>Nøkkeltall</h2>
        <p className="text-xs text-foreground/70 mb-3">Sist oppdatert {current.month}.</p>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {/* KPI */}
        <div className="relative rounded-2xl border bg-card p-5 shadow-sm">
          <button onClick={() => setInfoModal("kpi")} aria-label="Mer informasjon om KPI" className="absolute top-4 right-4 p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground transition-colors">
            <Info className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-baseline justify-between gap-2 pr-7">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <p className="text-xl font-extrabold" style={{ color: "var(--kv-blue)" }}>KPI</p>
              {current.total1m != null && (
                <span className={`text-xs font-semibold ${current.total1m >= 0 ? "text-red-700" : "text-green-700"}`}>
                  ({current.total1m >= 0 ? "+" : ""}{current.total1m.toFixed(1)}%)
                </span>
              )}
            </div>
            <p className="text-xl font-extrabold shrink-0" style={{ color: "var(--kv-blue)" }}>
              {current.total != null ? `${current.total.toFixed(1)}%` : "–"}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 mt-1">
            <p className="text-xs text-foreground/70">12-månedersendring, {current.month}</p>
            {(() => { const b = targetBadge(current.total, 2); return (
              <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold shrink-0 ${b.className}`}>{b.text}</span>
            ); })()}
          </div>
        </div>

        {/* KPI-JAE */}
        <div className="relative rounded-2xl border bg-card p-5 shadow-sm">
          <button onClick={() => setInfoModal("jae")} aria-label="Mer informasjon om KPI-JAE" className="absolute top-4 right-4 p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground transition-colors">
            <Info className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-baseline justify-between gap-2 pr-7">
            <p className="text-xl font-extrabold" style={{ color: "var(--kv-blue)" }}>KPI-JAE</p>
            <p className="text-xl font-extrabold shrink-0" style={{ color: "var(--kv-blue)" }}>
              {current.jae != null ? `${current.jae.toFixed(1)}%` : "–"}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 mt-1">
            <p className="text-xs text-foreground/70">Justert for avgifter og energi</p>
            {(() => { const b = targetBadge(current.jae, 2); return (
              <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold shrink-0 ${b.className}`}>{b.text}</span>
            ); })()}
          </div>
        </div>

        {/* Styringsrente */}
        <div className="relative rounded-2xl border bg-card p-5 shadow-sm">
          <button onClick={() => setInfoModal("rente")} aria-label="Mer informasjon om styringsrente" className="absolute top-4 right-4 p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground transition-colors">
            <Info className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-baseline justify-between gap-2 pr-7">
            <p className="text-xl font-extrabold" style={{ color: "var(--kv-blue)" }}>Styringsrenten</p>
            <p className="text-xl font-extrabold shrink-0" style={{ color: "var(--kv-blue)" }}>
              {current.rate != null ? `${current.rate.toFixed(2)}%` : "–"}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 mt-1">
            <p className="text-xs text-foreground/70">Norges Bank</p>
          </div>
        </div>
      </div>

      {/* Klarspråk explanation */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <p className="text-sm text-foreground/80 leading-relaxed">
          {current.total != null ? (
            <>
              Prisene i Norge har i snitt steget <strong>{current.total.toFixed(1)} %</strong> det siste året.
              {current.total > 2 && " Det betyr at det du kjøpte for 1 000 kr i fjor, nå koster deg " + Math.round(1000 + current.total * 10) + " kr."}
              {current.total <= 2 && current.total > 0 && " Det er nær Norges Banks mål på 2 %, som regnes som en sunn prisvekst."}
              {current.total <= 0 && " Prisene har faktisk falt — det er uvanlig og kan tyde på svak økonomi."}
              {" "}Styringsrenten er på <strong>{current.rate?.toFixed(2) ?? "–"} %</strong> — det er renten som påvirker hva du betaler på boliglånet ditt.
              {current.rate != null && current.total != null && current.total > 2.5 && " Renten er høy fordi Norges Bank prøver å bremse prisveksten."}
              {current.rate != null && current.total != null && current.total <= 2.5 && current.total > 0 && " Når prisveksten er under kontroll, kan renten etter hvert gå ned."}
            </>
          ) : (
            "Laster prisinformasjon..."
          )}
        </p>
      </div>

      {/* Info modals */}
      {infoModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 px-4" onClick={() => setInfoModal(null)}>
          <div className="bg-background rounded-2xl shadow-xl border w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-base">
                {infoModal === "kpi" && "Hva er KPI?"}
                {infoModal === "jae" && "Hva er KPI-JAE?"}
                {infoModal === "rente" && "Hva er styringsrenten?"}
              </h2>
              <button onClick={() => setInfoModal(null)} aria-label="Lukk" className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 text-sm text-foreground/80">
              {infoModal === "kpi" && (
                <>
                  <p><strong>Konsumprisindeksen (KPI)</strong> måler hvor mye prisene på varer og tjenester endrer seg over tid. Den dekker alt nordmenn bruker penger på — mat, klær, transport, bolig, strøm og mye mer.</p>
                  <p>Tallet du ser er <strong>12-månedersendringen</strong> — hvor mye prisene har steget (eller falt) sammenlignet med samme måned i fjor. For eksempel betyr 3,0 % at det du betalte 100 kr for i fjor, nå koster 103 kr.</p>
                  <p>KPI påvirkes av alt — også midlertidige svingninger i strøm- og drivstoffpriser og endringer i avgifter.</p>
                </>
              )}
              {infoModal === "jae" && (
                <>
                  <p><strong>KPI-JAE</strong> (KPI justert for avgiftsendringer og energipriser) viser den underliggende prisveksten. Den fjerner effekten av ting som svinger mye — som strømpriser og bensinpriser — og ting som staten styrer — som avgifter og gebyrer.</p>
                  <p>Norges Bank bruker KPI-JAE som sin viktigste målestokk når de bestemmer styringsrenten. Målet er at KPI-JAE skal ligge nær <strong>2 % over tid</strong>.</p>
                  <p>Hvis KPI-JAE er mye over 2 %, kan Norges Bank heve renten for å bremse prisveksten. Hvis den er under, kan renten senkes.</p>
                </>
              )}
              {infoModal === "rente" && (
                <>
                  <p><strong>Styringsrenten</strong> er den renten Norges Bank setter for utlån til bankene. Den påvirker direkte hva du betaler i rente på boliglånet ditt.</p>
                  <p>Når styringsrenten går opp, blir det dyrere å låne penger. Det gjør at folk og bedrifter bruker mindre penger, som bremser prisveksten. Når renten går ned, blir det billigere å låne, og folk bruker mer.</p>
                  <p>Norges Bank justerer renten ca. 8 ganger i året basert på hvordan økonomien og prisveksten utvikler seg.</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Category breakdown */}
      <div>
        <h2 className="text-lg font-bold mb-3" style={{ color: "#24374c" }}>Prisvekst etter kategori</h2>
        <p className="text-xs text-foreground/70 mb-4">12-månedersendring per {current.month}. Trykk for detaljer.</p>
        <div className="space-y-2">
          {categories.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.code] ?? ShoppingBag;
            const shortName = CATEGORY_SHORT[cat.code] ?? cat.name;
            const expanded = expandedCategory === cat.code;
            const barWidth = cat.change12m != null ? Math.min(100, Math.max(2, Math.abs(cat.change12m) * 10)) : 0;

            // Get trend for this category from the full KPI data
            return (
              <button
                key={cat.code}
                onClick={() => setExpandedCategory(expanded ? null : cat.code)}
                className={`w-full text-left rounded-xl border transition-all ${expanded ? "bg-card shadow-sm" : "hover:bg-muted/50"}`}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className={`flex items-center justify-center h-8 w-8 rounded-lg shrink-0 ${changeBg(cat.change12m)}`}>
                    <Icon className={`h-4 w-4 ${changeColor(cat.change12m)}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{shortName}</p>
                    <div className="h-1 w-full bg-muted rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${barWidth}%`,
                          background: (cat.change12m ?? 0) > 0 ? "var(--kv-negative)" : "var(--kv-positive)",
                          opacity: 0.6,
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-sm font-bold tabular-nums ${changeColor(cat.change12m)}`}>
                      {cat.change12m != null ? `${cat.change12m > 0 ? "+" : ""}${cat.change12m.toFixed(1)}%` : "–"}
                    </span>
                  </div>
                  {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                </div>
                {expanded && (
                  <div className="px-4 pb-3 border-t">
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div>
                        <p className="text-[10px] text-muted-foreground">12-månedersendring</p>
                        <p className={`text-lg font-bold ${changeColor(cat.change12m)}`}>
                          {cat.change12m != null ? `${cat.change12m > 0 ? "+" : ""}${cat.change12m.toFixed(1)}%` : "–"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Siste måned</p>
                        <p className={`text-lg font-bold ${changeColor(cat.change1m)}`}>
                          {cat.change1m != null ? `${cat.change1m > 0 ? "+" : ""}${cat.change1m.toFixed(1)}%` : "–"}
                        </p>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 italic">{cat.name}</p>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Trend chart */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold" style={{ color: "#24374c" }}>Utvikling siste 2 år</h2>
          <div className="flex rounded-lg border overflow-hidden">
            {([["kpi", "KPI"], ["jae", "KPI-JAE"], ["rente", "Rente"]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTrendView(key)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${trendView === key ? "text-white" : "text-muted-foreground hover:bg-muted"}`}
                style={trendView === key ? { background: "var(--kv-blue)" } : {}}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <ChartContainer config={trendChartConfig} className="aspect-auto h-40 w-full">
            <AreaChart data={trend.map((t) => ({ month: formatMonth(t.month), value: trendView === "kpi" ? t.total : trendView === "jae" ? t.jae : t.rate }))} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--kv-blue)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--kv-blue)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={40} />
              <YAxis tickLine={false} axisLine={false} tickMargin={4} tickFormatter={(v: number) => `${parseFloat(v.toFixed(1))}%`} domain={["dataMin - 0.5", "dataMax + 0.5"]} />
              {trendView !== "rente" && <ReferenceLine y={2.5} stroke="var(--kv-negative)" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "2,5 %", position: "right", fontSize: 10, fill: "var(--kv-negative)" }} />}
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(label) => label as string} formatter={(value) => [`${(value as number)?.toFixed(1)}%`, trendView === "kpi" ? "KPI" : trendView === "jae" ? "KPI-JAE" : "Rente"]} />} />
              <Area dataKey="value" type="monotone" stroke="var(--kv-blue)" strokeWidth={2} fill="url(#trendFill)" dot={false} activeDot={{ r: 4, fill: "var(--kv-blue)", stroke: "white", strokeWidth: 2 }} />
            </AreaChart>
          </ChartContainer>
        </div>
      </div>

      {/* Yearly historical */}
      {yearly.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-3" style={{ color: "#24374c" }}>Årlig prisvekst ({yearly[0].year}–{yearly[yearly.length - 1].year})</h2>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <ChartContainer config={yearlyChartConfig} className="aspect-auto h-36 w-full">
              <BarChart data={yearly.map((y) => ({ year: y.year, change: y.change }))} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={30} />
                <YAxis tickLine={false} axisLine={false} tickMargin={4} tickFormatter={(v: number) => `${parseFloat(v.toFixed(1))}%`} />
                <ReferenceLine y={2.5} stroke="var(--kv-negative)" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "2,5 %", position: "right", fontSize: 10, fill: "var(--kv-negative)" }} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={(label) => `${label}`} formatter={(value) => [`${(value as number)?.toFixed(1)}%`, "Prisvekst"]} />} />
                <Bar dataKey="change" radius={[4, 4, 0, 0]}>
                  {yearly.map((y) => (
                    <Cell key={y.year} fill={(y.change ?? 0) > 2.5 ? "var(--kv-negative)" : (y.change ?? 0) > 0 ? "var(--kv-warning)" : "var(--kv-positive)"} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>
        </div>
      )}

      {/* Nordic comparison */}
      {Object.values(nordic).some((v) => v != null) && (
        <div>
          <h2 className="text-lg font-bold mb-3" style={{ color: "#24374c" }}>Nordisk sammenligning</h2>
          <p className="text-xs text-foreground/70 mb-4">Harmonisert konsumprisindeks (HICP), 12-månedersendring.</p>
          <div className="space-y-2">
            {(["NO", "SE", "DK", "FI", "EU"] as const).map((code) => {
              const val = nordic[code];
              const barWidth = val != null ? Math.min(100, Math.max(2, val * 12)) : 0;
              const isNorway = code === "NO";
              return (
                <div
                  key={code}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 ${isNorway ? "bg-muted ring-1 ring-border" : ""}`}
                >
                  <span className="text-lg shrink-0">{NORDIC_FLAGS[code]}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${isNorway ? "font-bold" : "font-medium"}`}>{NORDIC_LABELS[code]}</p>
                    <div className="h-1.5 w-full bg-muted rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${barWidth}%`,
                          background: isNorway ? "var(--kv-blue)" : "#94a3b8",
                        }}
                      />
                    </div>
                  </div>
                  <span className={`text-sm font-bold tabular-nums shrink-0 ${isNorway ? "" : "text-muted-foreground"}`} style={isNorway ? { color: "var(--kv-blue)" } : {}}>
                    {val != null ? `${val.toFixed(1)}%` : "–"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Source */}
      <div className="pt-4 border-t">
        <p className="text-xs text-foreground/70 text-center">
          Kilder: <a href="https://www.ssb.no/statbank/table/03013/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">SSB Tabell 03013</a> (KPI) · <a href="https://www.ssb.no/statbank/table/05327/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">SSB Tabell 05327</a> (KPI-JAE) · <a href="https://www.norges-bank.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Norges Bank</a> (styringsrente) · <a href="https://ec.europa.eu/eurostat" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Eurostat</a> (HICP)
        </p>
        <p className="text-[10px] text-muted-foreground text-center mt-1">
          Data kan inneholde feil og bør ikke brukes som eneste kilde for beslutninger.
        </p>
      </div>
    </div>
  );
}
