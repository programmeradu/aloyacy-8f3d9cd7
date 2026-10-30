import { STOPS } from "@/lib/gtfs";
import type { RoamKey } from "@/lib/roam-i18n";

const STOP_AREA_KEY: Record<string, RoamKey> = {
  NPT: "lines.nicosia",
  LMS: "lines.limassol",
  LCA: "lines.larnaca",
  PFO: "lines.paphos",
  FAM: "lines.famagusta",
  IC: "lines.intercity",
};

/**
 * Who serves this stop. Local stop ids repeat across operator feeds (324 on
 * Makariou is both a Nicosia and an Intercity stop), so list every agency
 * that has this id here, town buses first, instead of the first match.
 */
export function stopAreaLine(stopId: string, primary: string, r: (k: RoamKey) => string): string {
  const here = STOPS.filter((s) => s.id === stopId).map((s) => s.agency);
  const agencies = Array.from(new Set([primary, ...here])).sort(
    (a, b) => Number(a === "IC") - Number(b === "IC"),
  );
  return agencies
    .map((a) => (a === "SPC" ? "Pame Express" : STOP_AREA_KEY[a] ? r(STOP_AREA_KEY[a]) : ""))
    .filter(Boolean)
    .join(" · ");
}
