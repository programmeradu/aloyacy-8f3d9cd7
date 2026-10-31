// Tap-to-hear Greek pronunciation. Plays the word's recorded clip when there is
// one (src), then tries /api/public/tts, then the browser's own Greek voice,
// so the button is never a dead end.

import { useEffect, useRef, useState } from "react";

export function SpeakGreekButton({ text, src }: { text: string; src?: string | null }) {
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      audioRef.current?.pause();
      cache.forEach((u: string) => URL.revokeObjectURL(u));
    };
  }, []);

  const fallback = () => {
    try {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        setSpeaking(false);
        return;
      }
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "el-GR";
      u.rate = 0.85;
      const greek = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith("el"));
      if (greek) u.voice = greek;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      synth.speak(u);
    } catch {
      setSpeaking(false);
    }
  };

  const playUrl = async (url: string) => {
    audioRef.current?.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setSpeaking(false);
    audio.onerror = () => setSpeaking(false);
    await audio.play();
  };

  const speak = async () => {
    setSpeaking(true);
    if (src) {
      try {
        await playUrl(src);
        return;
      } catch {
        // fall through to the speech endpoint
      }
    }
    try {
      let url = cacheRef.current.get(text);
      if (!url) {
        const res = await fetch("/api/public/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: text }),
        });
        if (!res.ok) throw new Error(`tts ${res.status}`);
        const blob = await res.blob();
        if (!blob.type.startsWith("audio/")) throw new Error("not audio");
        url = URL.createObjectURL(blob);
        cacheRef.current.set(text, url);
      }
      await playUrl(url);
    } catch {
      fallback();
    }
  };

  return (
    <button
      type="button"
      onClick={speak}
      aria-label={`Hear ${text} pronounced`}
      title={`Hear ${text}`}
      data-speaking={speaking ? "true" : "false"}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-olive/12 text-olive transition-all hover:bg-olive/20 active:scale-95 ${
        speaking ? "ring-2 ring-olive/40" : ""
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
        <path d="M4 10v4h3l5 4V6L7 10H4Z" fill="currentColor" />
        <path
          d={speaking ? "M15 9c1.2 1 1.2 5 0 6" : "M15 9c1.2 1 1.2 5 0 6 M17.5 7c2.5 2 2.5 8 0 10"}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </button>
  );
}
