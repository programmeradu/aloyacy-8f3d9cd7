// Spoken alerts (text-to-speech).
//
// Used for hands-free nudges ("your bus is two minutes away") pushed either
// from the app or from the service worker via an "aloya-speak" message.
// The rider opts in explicitly — browsers block synthesis until a user
// gesture has primed it, so primeSpeech() must run inside that gesture.

const PREF_KEY = "aloya:speech";

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isSpeechEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSpeechEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREF_KEY, on ? "1" : "0");
  } catch {
    /* private mode — preference just won't persist */
  }
}

/**
 * Unlock synthesis inside a user gesture. iOS Safari and Chrome both refuse
 * to speak later otherwise; a silent zero-length utterance is enough.
 */
export function primeSpeech(): void {
  if (!isSpeechSupported()) return;
  try {
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    window.speechSynthesis.speak(u);
    // Warm the voice list — it loads asynchronously on most browsers.
    window.speechSynthesis.getVoices();
  } catch {
    /* non-fatal */
  }
}

/** Speak a line, if the rider opted in and the browser can. */
export function speak(text: string, opts?: { lang?: string; force?: boolean }): void {
  const line = text?.trim();
  if (!line) return;
  if (!isSpeechSupported()) return;
  if (!opts?.force && !isSpeechEnabled()) return;
  try {
    const synth = window.speechSynthesis;
    // Never stack announcements — the newest one is the one that matters.
    synth.cancel();
    const u = new SpeechSynthesisUtterance(line);
    u.lang = opts?.lang ?? "en-US";
    u.rate = 1;
    u.pitch = 1;
    const voice = synth.getVoices().find((v) => v.lang === u.lang);
    if (voice) u.voice = voice;
    synth.speak(u);
  } catch {
    /* non-fatal */
  }
}
