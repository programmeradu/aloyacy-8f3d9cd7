// Painted art and a recorded clip for each Greek word of the day.
// Art: hand-painted squares in the Cyprus today style (src/assets/wotd), one
// per word in src/data/cyprus-greek-words.json. Audio: a real native speaker
// recording (Wikimedia Commons or Mozilla Common Voice) in /audio/greek, credited in
// src/data/greek-voice-credits.json. A word without one has no audio, never a
// synthetic voice.

import voiceCredits from "@/data/greek-voice-credits.json";

const VOICED = new Set((voiceCredits as { slug: string }[]).map((c) => c.slug));

const ART = import.meta.glob<string>("/src/assets/wotd/*.webp", {
  eager: true,
  import: "default",
});

const SLUG: Record<string, string> = {
  Καλημέρα: "kalimera",
  Καλησπέρα: "kalispera",
  Ευχαριστώ: "efharisto",
  Παρακαλώ: "parakalo",
  Ναι: "ne",
  Όχι: "ohi",
  Στάση: "stasi",
  Λεωφορείο: "leoforio",
  Εισιτήριο: "isitirio",
  "Πόσο κάνει;": "poso",
  Συγγνώμη: "signomi",
  "Γεια σου": "yiasou",
  Παραλία: "paralia",
  Νερό: "nero",
  Καφές: "kafes",
  Χαλλούμι: "halloumi",
  Σούβλα: "souvla",
  "Πάμε!": "pame",
  Φίλε: "file",
  "Σιγά σιγά": "siga",
  "Καλώς ήρθες": "kalos",
  Νόστιμο: "nostimo",
  "Πού είναι;": "pou",
  "Ένα λεπτό": "lepto",
  Αργότερα: "argotera",
  Όμορφα: "omorfa",
  "Φέρτε μου": "ferte",
  Λογαριασμό: "logariasmo",
  Καληνύχτα: "kalinyhta",
  "Στην υγειά σου": "iyia",
};

function norm(word: string): string {
  // The Greek question mark (U+037E) looks like ";" but is its own code point.
  return word.normalize("NFC").replace(/\u037e/g, ";").trim();
}

export function greekWordSlug(word: string | null | undefined): string | null {
  if (!word) return null;
  const w = norm(word);
  return SLUG[w] ?? SLUG[w.replace(/[!.;…]+$/u, "")] ?? null;
}

/** The painting for a word; an unknown word gets the coastline at sunset. */
export function greekWordArt(word: string | null | undefined): string {
  const slug = greekWordSlug(word) ?? "omorfa";
  return ART[`/src/assets/wotd/${slug}.webp`] ?? ART["/src/assets/wotd/omorfa.webp"] ?? "";
}

/** The native speaker clip for a word, or null when there is no recording. */
export function greekWordAudio(word: string | null | undefined): string | null {
  const slug = greekWordSlug(word);
  return slug && VOICED.has(slug) ? `/audio/greek/${slug}.mp3` : null;
}

/** Display size for the word: long words step down so nothing clips. */
export function greekWordSize(word: string): "s" | "m" | "l" | "xl" {
  const chars = [...word].length;
  const longest = Math.max(...word.split(/\s+/).map((p) => [...p].length));
  if (chars <= 6) return "s";
  if (chars <= 9) return "m";
  if (longest <= 6) return "m";
  return longest <= 9 ? "l" : "xl";
}
