/**
 * Strips known export/transport prefixes Meta sometimes attaches to phone
 * numbers (e.g. "p:9876543210"). Leaves everything else untouched — no
 * aggressive reformatting, no country-code guessing.
 */
export function normalizePhoneNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^p:/i, "");
}
