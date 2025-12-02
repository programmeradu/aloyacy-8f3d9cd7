// Speech synthesis for foreground alerts.
//
// Push notifications fire from the service worker, which has no access to
// speechSynthesis. The SW posts a `aloya-speak` message to every open
// client; the page calls `speak()` here.
//
// iOS Safari requires a user gesture before speechSynthesis will play.
// `primeSpeech()` runs a silent utterance from inside a click handler to
// unlock the audio queue for the rest of the session.

const PREF_KEY = "aloya:speech-enabled";

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isSpeechEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(PREF_KEY) === "1";
}

export function setSpeechEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  if (on) localStorage.setItem(PREF_KEY, "1");
  else localStorage.removeItem(PREF_KEY);
}

/** Call from inside a user gesture (click/tap) to unlock iOS speech. */
export function primeSpeech() {
  if (!isSpeechSupported()) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    u.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}

export function speak(text: string) {
  if (!isSpeechSupported() || !isSpeechEnabled() || !text) return;
  try {
    const synth = window.speechSynthesis;
    // Replace any in-flight utterance — newer alerts supersede older ones.
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 1;
    u.volume = 1;
    u.lang = "en-US";
    synth.speak(u);
  } catch (e) {
    console.warn("[speech] speak failed", e);
  }
}
