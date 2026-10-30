/**
 * Operator pass names arrive in capitals with zone codes
 * ("30 DAYS Z01-03 (UDF) PERSONALISED"); show them in sentence case with the
 * zone range spelled out, acronyms in brackets kept.
 */
export function formatPassName(raw: string): string {
  const s = raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bZ(\d{1,2})\s*-\s*(\d{1,2})\b/gi, "zones $1 to $2")
    .replace(/\bZ(\d{1,2})\b/g, "zone $1")
    .split(" ")
    .map((w) => (/^\(.*\)$/.test(w) ? w : /^[A-Z\u0391-\u03A9]{2,}$/.test(w) ? w.toLowerCase() : w))
    .join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
