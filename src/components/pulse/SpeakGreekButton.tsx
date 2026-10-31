// Tap-to-hear Greek pronunciation. A recorded native speaker clip (src) always
// takes priority. A word without a recording is spoken by the phone's own
// built-in voice (Web Speech API, el-GR). The button hides itself only when
// there is no clip and the browser has no speech synthesis at all.

import { useEffect, useRef, useState } from "react";
import {
  deviceSpeechSupported,
  speakGreekWithDevice,
  warmDeviceVoices,
} from "@/components/pulse/greek-word-art";

export function SpeakGreekButton({ text, src }: { text: string; src?: string | null }) {
  const [speaking, setSpeaking] = useState(false);
  // Checked after mount so the server render and first client render match.
  const [deviceOk, setDeviceOk] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const usedDeviceRef = useRef(false);

  useEffect(() => {
    const ok = deviceSpeechSupported();
    setDeviceOk(ok);
    if (ok && !src) warmDeviceVoices();
    return () => {
      audioRef.current?.pause();
      if (usedDeviceRef.current && deviceSpeechSupported()) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          /* non-fatal */
        }
      }
    };
  }, [src]);

  if (!src && !deviceOk) return null;

  const speak = async () => {
    setSpeaking(true);
    audioRef.current?.pause();
    if (deviceSpeechSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* non-fatal */
      }
    }
    if (src) {
      try {
        const audio = new Audio(src);
        audioRef.current = audio;
        audio.onended = () => setSpeaking(false);
        audio.onerror = () => setSpeaking(false);
        await audio.play();
      } catch {
        setSpeaking(false);
      }
      return;
    }
    usedDeviceRef.current = true;
    await speakGreekWithDevice(text, () => setSpeaking(false));
  };

  return (
    <button
      type="button"
      onClick={speak}
      aria-label={`Hear ${text} pronounced`}
      title={`Hear ${text}`}
      data-speaking={speaking ? "true" : "false"}
      data-src={src ?? undefined}
      data-voice={src ? "recording" : "device"}
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
