/** Rough bounding box for mainland Norway + Svalbard. */
export const isWithinNorway = (lat: number, lon: number) =>
  lat >= 57.0 && lat <= 81.0 && lon >= 4.0 && lon <= 32.0;

type Axis = "lat" | "lon";

// Hemisphere letters: N/S for latitude, E/Ø/O (øst) and W/V (vest) for longitude.
const HEMISPHERE: Record<string, { axis: Axis; sign: 1 | -1 }> = {
  N: { axis: "lat", sign: 1 },
  S: { axis: "lat", sign: -1 },
  E: { axis: "lon", sign: 1 },
  Ø: { axis: "lon", sign: 1 },
  O: { axis: "lon", sign: 1 },
  W: { axis: "lon", sign: -1 },
  V: { axis: "lon", sign: -1 },
};

const NUM = String.raw`\d{1,3}(?:[.,]\d+)?`;
const LETTER = "([NSEWØOV])?";
// Degrees, optionally with ° and minutes / seconds. 4 capture groups.
const DEG = String.raw`(${NUM})\s*(°)?\s*(?:(${NUM})\s*'\s*(?:(${NUM})\s*"\s*)?)?`;
const SEP = String.raw`\s*(?:[,;/]\s*|\s)\s*`;
// Map apps put hemisphere letters consistently either before ("N 61 E 8") or
// after ("61 N, 8 E") each number, so the style is decided once per string.
// Groups per part: letter, degrees, degree sign, minutes, seconds.
const PAIR_PREFIX = new RegExp(String.raw`^${LETTER}\s*${DEG}${SEP}${LETTER}\s*${DEG}$`, "i");
const PAIR_SUFFIX = new RegExp(String.raw`^${DEG}${LETTER}${SEP}${DEG}${LETTER}$`, "i");

const toNumber = (s: string | undefined) => (s === undefined ? undefined : parseFloat(s.replace(",", ".")));

function parsePart([letter, degStr, degSign, minStr, secStr]: (string | undefined)[]): { value: number; axis?: Axis } | null {
  // A bare integer ("61") is too likely to be a street number — require a
  // fraction, a degree sign or minutes.
  if (!/[.,]/.test(degStr!) && !degSign && minStr === undefined) return null;

  const min = toNumber(minStr) ?? 0;
  const sec = toNumber(secStr) ?? 0;
  if (min >= 60 || sec >= 60) return null;

  const hemisphere = letter ? HEMISPHERE[letter.toUpperCase()] : undefined;
  const value = (toNumber(degStr)! + min / 60 + sec / 3600) * (hemisphere?.sign ?? 1);
  return { value, axis: hemisphere?.axis };
}

/**
 * Parses coordinates pasted into a search field, in the formats map apps copy:
 *
 *   61.6363, 8.3125             Google Maps app, most GPS apps
 *   61,6363 8,3125              Norwegian decimal comma
 *   61.6363° N, 8.3125° E       Apple Maps
 *   61°38'10.7"N 8°18'45.0"E    Google Maps desktop (degrees, minutes, seconds)
 *   N 61°38.178' E 8°18.750'    Garmin (degrees + decimal minutes)
 *
 * Hemisphere letters decide which number is the latitude. Without them either
 * order is accepted: Norway's latitude (57–81) and longitude (4–32) ranges
 * don't overlap, so the order is unambiguous. Returns null for anything that
 * isn't a coordinate pair inside Norway.
 */
export function parseCoordinates(q: string): { lat: number; lon: number } | null {
  const normalized = q
    .trim()
    .replace(/º/g, "°")
    .replace(/[′’‘´`]{2}/g, '"')
    .replace(/[′’‘´`]/g, "'")
    .replace(/[″“”]/g, '"');
  const prefixStyle = /^[NSEWØOV]/i.test(normalized);
  const m = normalized.match(prefixStyle ? PAIR_PREFIX : PAIR_SUFFIX);
  if (!m) return null;

  // Reorder suffix-style groups (degrees…, letter) to (letter, degrees…)
  const groups = (g: (string | undefined)[]) => (prefixStyle ? g : [g[4], ...g.slice(0, 4)]);
  const a = parsePart(groups(m.slice(1, 6)));
  const b = parsePart(groups(m.slice(6, 11)));
  if (!a || !b) return null;

  let lat: number, lon: number;
  if (a.axis && b.axis) {
    if (a.axis === b.axis) return null;
    [lat, lon] = a.axis === "lat" ? [a.value, b.value] : [b.value, a.value];
  } else if (a.axis || b.axis) {
    const [known, other] = a.axis ? [a, b] : [b, a];
    [lat, lon] = known.axis === "lat" ? [known.value, other.value] : [other.value, known.value];
  } else if (isWithinNorway(a.value, b.value)) {
    [lat, lon] = [a.value, b.value];
  } else {
    [lat, lon] = [b.value, a.value];
  }

  return isWithinNorway(lat, lon) ? { lat, lon } : null;
}
