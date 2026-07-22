// Which illustration accompanies the Greek word of the day.
//
// Every word in src/data/cyprus-greek-words.json maps to a motif that fits its
// meaning, so the card changes character day to day instead of repeating one
// generic ornament. Unknown words fall back to the olive sprig rather than
// rendering nothing.

export type GreekMotif = "greeting" | "courtesy" | "transit" | "food" | "place" | "vibe";

const MOTIF_BY_WORD: Record<string, GreekMotif> = {
  Καλημέρα: "greeting",
  Καλησπέρα: "greeting",
  "Γεια σου": "greeting",
  "Καλώς ήρθες": "greeting",
  Καληνύχτα: "greeting",
  Ευχαριστώ: "courtesy",
  Παρακαλώ: "courtesy",
  Συγγνώμη: "courtesy",
  Ναι: "courtesy",
  Όχι: "courtesy",
  Στάση: "transit",
  Λεωφορείο: "transit",
  Εισιτήριο: "transit",
  "Ένα λεπτό": "transit",
  Καφές: "food",
  Χαλλούμι: "food",
  Σούβλα: "food",
  Νόστιμο: "food",
  "Φέρτε μου": "food",
  Λογαριασμό: "food",
  "Στην υγειά σου": "food",
  Παραλία: "place",
  Νερό: "place",
  "Πού είναι;": "place",
};

/**
 * Resolve a word to its motif. Matching tolerates surrounding whitespace and
 * a trailing exclamation the dictionary sometimes carries, so "Καλημέρα!"
 * still gets its sunrise instead of dropping to the generic sprig.
 */
export function greekMotif(word: string | null | undefined): GreekMotif {
  if (!word) return "vibe";
  const trimmed = word.trim();
  return MOTIF_BY_WORD[trimmed] ?? MOTIF_BY_WORD[trimmed.replace(/[!.]+$/u, "")] ?? "vibe";
}

const MONTHS_EN = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTHS_EL = [
  "Ιαν",
  "Φεβ",
  "Μάρ",
  "Απρ",
  "Μάι",
  "Ιούν",
  "Ιούλ",
  "Αύγ",
  "Σεπ",
  "Οκτ",
  "Νοέ",
  "Δεκ",
];

/**
 * "Saturday · 22 Aug" from a YYYY-MM-DD briefing date. Malformed dates return
 * just the weekday rather than "NaN undefined" on the hero card.
 */
export function briefingDateLabel(date: string, weekday: string, locale: "en" | "el"): string {
  const parts = date.split("-");
  const month = Number.parseInt(parts[1] ?? "", 10);
  const day = Number.parseInt(parts[2] ?? "", 10);
  const months = locale === "el" ? MONTHS_EL : MONTHS_EN;
  const name = months[month - 1];
  if (!Number.isFinite(day) || !name) return weekday;
  return `${weekday} · ${day} ${name}`;
}
