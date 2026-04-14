/**
 * Plain-language synthesis of the three primary fastlege metrics.
 *
 * The /helse detail sheet and the Stedsprofil Helsetilbud section both
 * show the same three numbers (ledig kapasitet, andel uten fastlege,
 * gjennomsnittlig listelengde). Shown in isolation they don't tell a
 * story — a reader has to reason about how they combine. This helper
 * returns a single sentence that does that reasoning for them.
 *
 * Inputs come straight from SSB 12005:
 *   - `reservekapasitet` — raw SSB value, centered on 100 (100 = balanced).
 *     We subtract 100 in the output wording so the reader sees it as
 *     signed headroom ("+13 %" or "overbooket").
 *   - `andelUtenLege` — percentage of residents on a list without a named GP.
 *   - `listelengde` — mean patients per fastlege in the kommune.
 */

const NATIONAL_MEDIAN_LISTELENGDE = 1050;

export interface HealthMetrics {
  reservekapasitet: number | null | undefined;
  andelUtenLege: number | null | undefined;
  listelengde: number | null | undefined;
}

export type HealthTone = "good" | "mixed" | "bad" | "neutral";

export interface HealthSynthesis {
  tone: HealthTone;
  sentence: string;
}

export function synthesizeHealth(m: HealthMetrics): HealthSynthesis | null {
  const { reservekapasitet, andelUtenLege, listelengde } = m;
  // Need at least andelUtenLege and reservekapasitet to tell a story.
  if (reservekapasitet == null || andelUtenLege == null) return null;

  const headroom = reservekapasitet - 100;
  const overbooked = headroom < -2;
  const comfortable = headroom >= 3;
  const longLists =
    listelengde != null && listelengde >= NATIONAL_MEDIAN_LISTELENGDE + 100;
  const shortLists =
    listelengde != null && listelengde <= NATIONAL_MEDIAN_LISTELENGDE - 100;

  // Case 1: someone actually missing a fastlege → lead with the gap.
  if (andelUtenLege >= 5) {
    return {
      tone: "bad",
      sentence: `Krisesituasjon: ${fmtPct(andelUtenLege)} av innbyggerne mangler fast lege.${
        overbooked ? " Listene er i tillegg overbooket." : ""
      }`,
    };
  }
  if (andelUtenLege > 0) {
    return {
      tone: "mixed",
      sentence: `${fmtPct(andelUtenLege)} av innbyggerne mangler fast lege.${
        overbooked
          ? " Listene er overbooket — lite rom til å fikse gapet."
          : comfortable
            ? " Det er imidlertid ledig plass på listene totalt."
            : ""
      }`,
    };
  }

  // Case 2: everyone has a fastlege — tone depends on capacity + load.
  if (overbooked) {
    return {
      tone: "mixed",
      sentence: `Alle har fastlege i dag, men listene er overbooket${
        longLists ? ` og lange (${fmtInt(listelengde!)} pasienter per lege)` : ""
      }.`,
    };
  }

  if (comfortable && shortLists) {
    return {
      tone: "good",
      sentence: `God fastlegedekning. Alle har fastlege, listene er korte (${fmtInt(listelengde!)} pasienter per lege) og det er plass til flere.`,
    };
  }

  if (comfortable) {
    return {
      tone: "good",
      sentence: `God fastlegedekning. Alle har fastlege, og listene har plass til flere pasienter.`,
    };
  }

  if (longLists) {
    return {
      tone: "mixed",
      sentence: `Alle har fastlege, men listene er lange — ${fmtInt(listelengde!)} pasienter per lege.`,
    };
  }

  return {
    tone: "neutral",
    sentence: `Alle har fastlege og kapasiteten er stort sett i balanse.`,
  };
}

function fmtPct(v: number): string {
  return `${v.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %`;
}

function fmtInt(v: number): string {
  return v.toLocaleString("nb-NO", { maximumFractionDigits: 0 });
}
