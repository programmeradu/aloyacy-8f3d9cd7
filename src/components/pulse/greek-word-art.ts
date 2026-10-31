// Painted art and a recorded clip for each Greek word of the day.
// Art: hand-painted squares in the Cyprus today style (src/assets/wotd), one
// per word in src/data/cyprus-greek-words.json. Audio: a real native speaker
// recording (Wikimedia Commons, Mozilla Common Voice or the public-domain FSI Greek Basic Course) in /audio/greek, credited in
// src/data/greek-voice-credits.json. A recorded clip always wins. A word
// without one is spoken by the phone's own built-in voice (Web Speech API,
// el-GR), see speakGreekWithDevice below.

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

/** The native speaker clip for a word, or null when there is no recording
 * (the caller then falls back to the phone's own voice). */
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

// Phone's own voice for words without a human recording.

/** True when this browser can speak with its built-in voice. */
export function deviceSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function findGreekVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang?.toLowerCase().replace("_", "-") === "el-gr") ??
    voices.find((v) => v.lang?.toLowerCase().startsWith("el")) ??
    null
  );
}

/** Voices load asynchronously on most browsers: resolve once they are there
 * (onvoiceschanged), or after a short wait so the tap never hangs. */
function voicesReady(timeoutMs = 600): Promise<void> {
  const synth = window.speechSynthesis;
  if (synth.getVoices().length > 0) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const prev = synth.onvoiceschanged;
    const finish = () => {
      if (done) return;
      done = true;
      synth.onvoiceschanged = prev;
      resolve();
    };
    synth.onvoiceschanged = (ev: Event) => {
      if (typeof prev === "function") prev.call(synth, ev);
      finish();
    };
    window.setTimeout(finish, timeoutMs);
  });
}

/** Warm the voice list early (on mount) so a tap can speak at once. */
export function warmDeviceVoices(): void {
  if (!deviceSpeechSupported()) return;
  try {
    window.speechSynthesis.getVoices();
  } catch {
    /* non-fatal */
  }
}

/**
 * Speak a Greek word with the phone's built-in voice. Cancels anything already
 * speaking first. Uses a Greek voice when the device has one, and still asks
 * for el-GR when it has none. Calls onEnd when speech finishes or fails.
 */
export async function speakGreekWithDevice(
  word: string,
  onEnd: () => void,
): Promise<SpeechSynthesisUtterance | null> {
  if (!deviceSpeechSupported()) {
    onEnd();
    return null;
  }
  const synth = window.speechSynthesis;
  try {
    synth.cancel();
    // Speak straight away when the voices are already loaded (keeps the call
    // inside the tap for iOS); otherwise wait briefly for them.
    if (synth.getVoices().length === 0) await voicesReady();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "el-GR";
    u.rate = 0.9;
    u.pitch = 1;
    const voice = findGreekVoice();
    if (voice) u.voice = voice;
    u.onend = () => onEnd();
    u.onerror = () => onEnd();
    synth.speak(u);
    return u;
  } catch {
    onEnd();
    return null;
  }
}
