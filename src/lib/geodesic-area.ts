/**
 * Geodesic polygon area straight from WGS84/ETRS89 coordinates — no
 * projection step needed. Uses the spherical excess approximation from
 * Chamberlain & Duquette (JPL, 2007), same algorithm as turf.area.
 * Error is far below matrikkel boundary accuracy at parcel scale.
 */

const EARTH_RADIUS = 6371008.8; // mean earth radius in meters

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Signed area of one ring of [lon, lat] pairs (GeoJSON order). */
function ringArea(ring: [number, number][]): number {
  const len = ring.length;
  if (len < 3) return 0;
  let total = 0;
  for (let i = 0; i < len; i++) {
    const lower = ring[i];
    const middle = ring[(i + 1) % len];
    const upper = ring[(i + 2) % len];
    total += (toRad(upper[0]) - toRad(lower[0])) * Math.sin(toRad(middle[1]));
  }
  return (total * EARTH_RADIUS * EARTH_RADIUS) / 2;
}

/**
 * Area in m² of a GeoJSON Polygon coordinate array: first ring is the
 * outer boundary, any further rings are holes (subtracted).
 */
export function polygonAreaM2(rings: [number, number][][]): number {
  if (!rings.length) return 0;
  let area = Math.abs(ringArea(rings[0]));
  for (let i = 1; i < rings.length; i++) {
    area -= Math.abs(ringArea(rings[i]));
  }
  return Math.max(0, area);
}

/** "1 234 m²" with Norwegian thousand separators. */
export function formatM2(m2: number): string {
  return `${Math.round(m2).toLocaleString("nb-NO")} m²`;
}

/** Area in mål (dekar, 1000 m²), sensible precision: "1,2 mål" / "154 mål". */
export function formatMal(m2: number): string {
  const mal = m2 / 1000;
  const text =
    mal >= 100
      ? Math.round(mal).toLocaleString("nb-NO")
      : mal.toLocaleString("nb-NO", { maximumFractionDigits: 1 });
  return `${text} mål`;
}
