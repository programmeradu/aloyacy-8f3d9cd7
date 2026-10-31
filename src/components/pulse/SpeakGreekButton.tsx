// Tap-to-hear Greek pronunciation. Plays only a recorded native speaker clip
// (src). There is no synthetic voice behind it: a word without a recording
// gets no button at all (the caller hides it).

import { useEffect, useRef, useState } from "react";

export function SpeakGreekButton({ text, src }: { text: string; src: string }) {
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const speak = async () => {
    setSpeaking(true);
    try {
      audioRef.current?.pause();
      const audio = new Audio(src);
      audioRef.current = audio;
      audio.onended = () => setSpeaking(false);
      audio.onerror = () => setSpeaking(false);
      await audio.play();
    } catch {
      setSpeaking(false);
    }
  };

  return (
    <button
      type="button"
      onClick={speak}
      aria-label={`Hear ${text} pronounced`}
      title={`Hear ${text}`}
      data-speaking={speaking ? "true" : "false"}
      data-src={src}
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
