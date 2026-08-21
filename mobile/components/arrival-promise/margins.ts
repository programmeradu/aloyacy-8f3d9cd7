import type { MarginPref } from "@aloya/core/arrival-promise";

/** How much slack the rider wants between arriving and the thing they booked. */
export const MARGINS: Array<{ key: MarginPref; label: string }> = [
  { key: "relaxed", label: "15 min spare" },
  { key: "normal", label: "8 min spare" },
  { key: "tight", label: "Cut it fine" },
];

/** A promise the rider already holds for (roughly) the same arrival. */
export function isAlreadyWatching(
  promises: Array<{ target_arrival_unix: number; destination_label: string }>,
  targetArrivalUnix: number,
  destinationLabel: string,
): boolean {
  return promises.some(
    (p) =>
      Math.abs(p.target_arrival_unix - targetArrivalUnix) < 15 * 60 &&
      p.destination_label === destinationLabel,
  );
}
