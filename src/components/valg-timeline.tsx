"use client";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { Info, Loader2 } from "lucide-react";
import { TimelinePanel } from "@/components/timeline-panel";
import { partyFill, partyText } from "@/lib/party-colors";

// One election per beat; long enough for the cross-fade (globals.css,
// .valg-timeline) to land and the eye to take in the new map.
const STEP_MS = 1300;

const PARTY_LABEL: Record<string, string> = {
  A: "Ap", H: "H", FRP: "FrP", SP: "Sp", KRF: "KrF", V: "V", SV: "SV",
  RØDT: "Rødt", MDG: "MDG", NKP: "NKP", FELLES: "Fellesliste", ANDRE: "Andre",
};
// Left → right, so the national bar reads like a parliament seating plan.
const BAR_ORDER = ["NKP", "RØDT", "SV", "A", "SP", "MDG", "KRF", "V", "H", "FRP", "FELLES", "ANDRE"];

interface Historikk {
  meta: { years: number[]; parties: string[] };
  national: { year: number; votes: number; shares: number[] }[];
  kommuner: Record<string, number[][]>;
}

export interface KommuneStyle {
  fillColor: string;
  fillOpacity: number;
}

const pct = (v: number) => `${v.toFixed(1).replace(".", ",")} %`;

function winnerOf(shares: number[]) {
  let best = 0;
  for (let i = 1; i < shares.length; i++) if (shares[i] > shares[best]) best = i;
  return best;
}

// Landslides read strong, close races lighter: 25 % → 0.55, 55 % → 0.95.
// Most modern winners land at 25–35 %, so the floor stays well saturated.
const opacityFor = (share: number) => Math.min(0.95, Math.max(0.55, 0.55 + ((share - 25) / 30) * 0.4));

// Mainland only — no offshore fields to fit, so Norway can fill the view.
const MAINLAND = L.latLngBounds([57.9, 4.5], [71.2, 31.2]);

interface Props {
  map: L.Map | null;
  /** Kommunenavn by kommunenummer, for the hover/tap line. */
  names: () => Map<string, string>;
  /** Hand the page a styler (or null to restore its own colours). */
  onStyle: (styler: ((knr: string) => KommuneStyle | null) | null) => void;
  /** The page calls this with the kommune under the pointer / tapped. */
  focusRef: React.RefObject<((knr: string | null) => void) | null>;
  onClose: () => void;
}

export function ValgTimeline({ map, names, onStyle, focusRef, onClose }: Props) {
  const [data, setData] = useState<Historikk | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [showNote, setShowNote] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/valg/historikk.json")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: Historikk) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    focusRef.current = setFocus;
    return () => { focusRef.current = null; };
  }, [focusRef]);

  // Cross-fade fills while the timeline is open (see globals.css).
  useEffect(() => {
    const el = map?.getContainer();
    el?.classList.add("valg-timeline");
    return () => el?.classList.remove("valg-timeline");
  }, [map]);

  // Paint the selected election.
  useEffect(() => {
    if (!data) return;
    const P = data.meta.parties;
    onStyle((knr) => {
      const shares = data.kommuner[knr]?.[index];
      if (!shares) return null;
      const w = winnerOf(shares);
      return { fillColor: partyFill(P[w]), fillOpacity: opacityFor(shares[w]) };
    });
  }, [data, index, onStyle]);
  useEffect(() => () => onStyle(null), [onStyle]);

  const last = (data?.meta.years.length ?? 1) - 1;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setIndex((i) => {
        if (i >= last) { setPlaying(false); return i; }
        return i + 1;
      });
    }, STEP_MS);
    return () => clearInterval(id);
  }, [playing, last]);

  const togglePlay = () => {
    if (!data) return;
    if (!playing && index >= last) setIndex(0);
    setPlaying((p) => !p);
  };

  const view = useMemo(() => {
    if (!data) return null;
    const P = data.meta.parties;
    const nat = data.national[index];
    const natWinner = winnerOf(nat.shares);
    const wins = new Map<string, number>();
    for (const rows of Object.values(data.kommuner)) {
      const k = P[winnerOf(rows[index])];
      wins.set(k, (wins.get(k) ?? 0) + 1);
    }
    const bar = BAR_ORDER.map((k) => ({ k, share: nat.shares[P.indexOf(k)] ?? 0 })).filter((s) => s.share > 0);
    return {
      year: data.meta.years[index],
      natWinner: P[natWinner],
      natShare: nat.shares[natWinner],
      bar,
      wins: [...wins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }, [data, index]);

  const focusLine = useMemo(() => {
    if (!data || !focus) return null;
    const shares = data.kommuner[focus]?.[index];
    if (!shares) return null;
    const P = data.meta.parties;
    const top = shares.map((s, i) => ({ k: P[i], s })).sort((a, b) => b.s - a.s).slice(0, 3);
    return { name: names().get(focus) ?? focus, top };
  }, [data, focus, index, names]);

  return (
    <TimelinePanel
      map={map}
      bounds={MAINLAND}
      label="Tidslinje for stortingsvalg"
      year={view?.year ?? "1945"}
      playing={playing}
      onTogglePlay={togglePlay}
      onClose={onClose}
      aside={view && (<>
        <p className="text-lg sm:text-xl font-extrabold tabular-nums leading-none whitespace-nowrap" style={{ color: partyText(view.natWinner) }}>
          {PARTY_LABEL[view.natWinner]} {pct(view.natShare)}
        </p>
        <p className="text-xs text-muted-foreground mt-1 whitespace-nowrap">størst nasjonalt</p>
      </>)}
    >
      {!data ? (
        <p className="mt-3 text-sm text-muted-foreground flex items-center gap-2">
          {failed ? "Kunne ikke laste valghistorikken." : <><Loader2 className="h-4 w-4 animate-spin" /> Henter 80 år med valg...</>}
        </p>
      ) : view && (<>
        {/* National vote share, seated left → right */}
        <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
          {view.bar.map((s) => (
            <div
              key={s.k}
              className="h-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
              style={{ width: `${s.share}%`, background: partyFill(s.k) }}
              title={`${PARTY_LABEL[s.k]} ${pct(s.share)}`}
            />
          ))}
        </div>

        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={index}
          onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)); }}
          className="block w-full mt-3 cursor-pointer"
          style={{ accentColor: "var(--kv-blue)" }}
          aria-label="Velg valgår"
          aria-valuetext={`Stortingsvalget ${view.year}: ${PARTY_LABEL[view.natWinner]} størst med ${pct(view.natShare)}`}
        />
        <div className="hidden sm:flex justify-between text-xs text-muted-foreground tabular-nums mt-0.5">
          <span>{data.meta.years[0]}</span>
          <span>{data.meta.years[last]}</span>
        </div>

        {/* Kommuner won, or the kommune under the pointer */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 sm:mt-3 text-xs min-h-5">
          {focusLine ? (
            <>
              <span className="font-semibold text-foreground truncate max-w-[45%]">{focusLine.name}</span>
              {focusLine.top.map((t) => (
                <span key={t.k} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: partyFill(t.k) }} />
                  <span className="text-foreground">{PARTY_LABEL[t.k]}</span>
                  <span className="text-muted-foreground tabular-nums">{pct(t.s)}</span>
                </span>
              ))}
            </>
          ) : (
            <>
              <span className="text-muted-foreground">Kommuner vunnet:</span>
              {view.wins.map(([k, n]) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: partyFill(k) }} />
                  <span className="text-foreground">{PARTY_LABEL[k]}</span>
                  <span className="text-muted-foreground tabular-nums">{n}</span>
                </span>
              ))}
            </>
          )}
          <button
            onClick={() => setShowNote((v) => !v)}
            className="sm:hidden ml-auto -my-2 -mr-2 p-2 rounded-md text-muted-foreground hover:text-foreground"
            aria-label="Om tallene"
            aria-expanded={showNote}
          >
            <Info className="h-4 w-4" />
          </button>
        </div>
        <p className={`${showNote ? "block" : "hidden"} sm:block text-xs text-muted-foreground mt-2`}>
          Farge viser største parti, sterkere farge betyr større seier. Eldre valg er regnet om til dagens kommuner. Bondepartiet vises som Sp, Anders Langes parti som FrP, SF som SV og RV som Rødt. Kilde: SSB.
        </p>
      </>)}
    </TimelinePanel>
  );
}
