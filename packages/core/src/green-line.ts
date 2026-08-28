// Facts we will stand behind about the Green Line.
// Hours are not here — tourist blogs disagree, and we have no official feed.
// Silence on a Nicosia product reads as a hole. Name the line; say what we
// do not know.

export const GREEN_LINE_PATH = "/green-line";

export const LEDRA_PEDESTRIAN = {
  name: "Ledra Street",
  nameEl: "Οδός Λήδρας",
  kind: "pedestrian" as const,
  lat: 35.17456,
  lng: 33.36144,
};

/** Needles a rider would type. Query must contain one of these. */
export const GREEN_LINE_SEARCH_NEEDLES = [
  "green line",
  "greenline",
  "ledra",
  "λήδρας",
  "ληδρας",
  "πράσινη γραμμή",
  "πρασινη γραμμη",
  "checkpoint",
  "buffer zone",
] as const;

export function matchesGreenLineQuery(raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (q.length < 4) return false;
  return GREEN_LINE_SEARCH_NEEDLES.some((n) => q.includes(n));
}
