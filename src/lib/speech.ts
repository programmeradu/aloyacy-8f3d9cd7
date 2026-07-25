// Thin wrapper over the Web Speech API. Typing is deliberately loose — the
// shape varies per browser and the vendor-prefixed constructor is still the
// only one Safari ships.

export type SpeechRec = {
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  lang: string;
  interimResults: boolean;
  continuous: boolean;
};

/** Returns null when the browser has no speech recognition at all. */
export function createRecognizer(lang = "en-US"): SpeechRec | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    (window as unknown as { SpeechRecognition?: new () => SpeechRec }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec })
      .webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = lang;
  rec.interimResults = false;
  rec.continuous = false;
  return rec;
}

/** Join a recognition result set into one trimmed transcript. */
export function transcriptOf(e: {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}): string {
  return Array.from(e.results)
    .map((r) => r[0]?.transcript ?? "")
    .join(" ")
    .trim();
}
