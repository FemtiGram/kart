// Norwegian party colors — fills (saturated, brand-faithful) and text variants
// (WCAG-AA-compliant against white). Used by /valg and the Politikk section
// on Stedsprofil.

const PARTY_FILL: Record<string, string> = {
  A: "#d6293a",
  H: "#3a8fd1",
  FRP: "#003b7a",
  SV: "#ec4f5e",
  SP: "#5bb348",
  V: "#007e7a",
  KRF: "#ffce00",
  MDG: "#608f3d",
  RØDT: "#8b1a1a",
  INP: "#ff7733",
  // Historical (only in the 1945– timeline on /valg)
  NKP: "#9f1239",
  FELLES: "#a8a29e",
};

const PARTY_TEXT: Record<string, string> = {
  A: "#a01828",
  H: "#1e5a8c",
  FRP: "#003b7a",
  SV: "#a8132f",
  SP: "#2c6a22",
  V: "#00665e",
  KRF: "#7a5a00",
  MDG: "#3a5827",
  RØDT: "#7a1717",
  INP: "#a83400",
  NKP: "#9f1239",
  FELLES: "#57534e",
};

const FALLBACK_FILL = "#888888";
const FALLBACK_TEXT = "#525252";

export function partyFill(kode: string | undefined): string {
  if (!kode) return FALLBACK_FILL;
  return PARTY_FILL[kode] ?? FALLBACK_FILL;
}

export function partyText(kode: string | undefined): string {
  if (!kode) return FALLBACK_TEXT;
  return PARTY_TEXT[kode] ?? FALLBACK_TEXT;
}

// Short display names, including the historical groups used by the
// 1945– timeline (lineages: Bondepartiet → Sp, ALP → FrP, SF → SV, RV → Rødt).
const PARTY_SHORT: Record<string, string> = {
  A: "Ap", H: "H", FRP: "FrP", SP: "Sp", KRF: "KrF", V: "V", SV: "SV",
  RØDT: "Rødt", MDG: "MDG", NKP: "NKP", FELLES: "Fellesliste", ANDRE: "Andre",
};

export function partyShort(kode: string): string {
  return PARTY_SHORT[kode] ?? kode;
}
