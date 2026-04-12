/**
 * Compute a kommune profile slug from knr + name.
 * Must match the logic in scripts/build-kommune-profiles.mjs so that
 * client-side URL construction matches the pre-rendered static params.
 */
export function kommuneSlug(knr: string, name: string): string {
  const displayName = name.split(/\s+-\s+/)[0].trim() || name;
  const slug = displayName
    .toLowerCase()
    .replaceAll("æ", "ae")
    .replaceAll("ø", "o")
    .replaceAll("å", "a")
    .replaceAll("á", "a")
    .replaceAll("č", "c")
    .replaceAll("ŋ", "ng")
    .replaceAll("š", "s")
    .replaceAll("ŧ", "t")
    .replaceAll("ž", "z")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${knr}-${slug}`;
}
