// State machine behind the natural-language planner card.
//
// Flow: text -> heuristic + AI intent -> merge -> geocode -> resolved points
// stashed in sessionStorage for /trips to pick up on mount.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  extractHeuristicIntent,
  isActionableIntent,
  isSelfReference,
  mergeIntents,
  type LocalIntent,
} from "@aloya/core/nl-intent";
import { parseTripIntent } from "@/lib/ai-planner.functions";
import { autocompletePlaces, getPlace } from "@/lib/maps.functions";
import { getNlSuggestions } from "@/lib/nl-suggestions.functions";
import { track, trackImpression } from "@/lib/analytics";
import { NICOSIA_CENTER } from "@/lib/gtfs";
import { nearestCity } from "@/lib/cities";
import { getDeviceId, getDeviceToken } from "@/lib/pwa";
import { createRecognizer, transcriptOf, type SpeechRec } from "@/lib/speech";
import { useI18n } from "@/lib/i18n";

export type ResolvedPoint = { lat: number; lng: number; label: string };
export type PlannerStage = "idle" | "parsing" | "locating";

/** Cold-start chips, shown until the server-side suggestions land. */
export const FALLBACK_EXAMPLES = [
  "to Eleftheria Square in 20 min",
  "to Larnaca airport tomorrow 7am",
];

export function useNLPlanner() {
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const parse = useServerFn(parseTripIntent);
  const acFn = useServerFn(autocompletePlaces);
  const placeFn = useServerFn(getPlace);
  const suggestFn = useServerFn(getNlSuggestions);

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<PlannerStage>("idle");
  const [intent, setIntent] = useState<LocalIntent | null>(null);
  const [resolved, setResolved] = useState<{
    from: ResolvedPoint | null;
    to: ResolvedPoint;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Best-effort geolocation, never blocks rendering. Powers location-aware
  // suggestions; absence just degrades them to time-of-day defaults.
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { timeout: 4000, maximumAge: 5 * 60_000 },
    );
  }, []);

  const suggestionsQuery = useQuery({
    queryKey: ["nl-suggestions", coords?.lat ?? null, coords?.lng ?? null, new Date().getHours()],
    queryFn: async () => {
      const token = await getDeviceToken().catch(() => null);
      if (!token) return { suggestions: [] };
      const now = new Date();
      return suggestFn({
        data: {
          deviceId: getDeviceId(),
          deviceToken: token,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          hour: now.getHours(),
          dow: now.getDay(),
        },
      });
    },
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    enabled: typeof window !== "undefined",
  });

  // Always fall back to FALLBACK_EXAMPLES until real data arrives, so SSR and
  // the first client render produce identical HTML (avoids React #418).
  const examples = suggestionsQuery.data?.suggestions?.map((s) => s.text) ?? FALLBACK_EXAMPLES;
  const suggestionReason = suggestionsQuery.data?.suggestions?.[0]?.reason ?? null;

  useEffect(() => {
    trackImpression("ui:nl-planner.impression");
    return () => {
      abortRef.current?.abort();
      recRef.current?.abort();
    };
  }, []);

  async function geocodeOne(query: string): Promise<ResolvedPoint | null> {
    // Bias autocomplete to the rider's last-known city. A Limassol rider
    // typing "Old Port" should land on Limassol's Old Port, not Nicosia.
    const bias = (() => {
      try {
        const raw = typeof window !== "undefined" ? localStorage.getItem("aloya:geo") : null;
        if (!raw) return NICOSIA_CENTER;
        const parsed = JSON.parse(raw) as { lat?: number; lng?: number };
        if (typeof parsed.lat !== "number" || typeof parsed.lng !== "number") {
          return NICOSIA_CENTER;
        }
        return nearestCity(parsed.lat, parsed.lng).center;
      } catch {
        return NICOSIA_CENTER;
      }
    })();
    const ac = await acFn({ data: { query, bias } });
    const first = ac.suggestions?.[0];
    if (!first) return null;
    const place = await placeFn({ data: { placeId: first.placeId } });
    return { lat: place.lat, lng: place.lng, label: place.name || first.primary };
  }

  async function submit(value: string) {
    const q = value.trim();
    if (q.length < 3) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setBusy(true);
    setError(null);
    setIntent(null);
    setResolved(null);
    setStage("parsing");
    track("ai:nl-planner.submit", { length: q.length });

    const tzMin = -new Date().getTimezoneOffset();
    const heuristic = extractHeuristicIntent(q, tzMin);

    try {
      // Heuristic is instant; AI takes ~1-2s and only refines what it missed.
      const aiResult = await parse({
        data: { text: q, nowISO: new Date().toISOString(), tzOffsetMin: tzMin },
      }).catch(() => null);

      const merged = mergeIntents(aiResult, heuristic);

      if (!isActionableIntent(merged)) {
        track("ai:nl-planner.parse-failed", { confidence: merged.confidence });
        setError(t("nl.err.parse"));
        setStage("idle");
        return;
      }

      setIntent(merged);
      track("ai:nl-planner.parsed", {
        confidence: merged.confidence,
        hasFrom: !!merged.from,
        hasTime: !!(merged.leaveByISO || merged.arriveByISO),
        usedAI: !!aiResult,
      });

      setStage("locating");
      const fromIsSelf = isSelfReference(merged.from);

      const [destination, originMaybe] = await Promise.all([
        geocodeOne(merged.to!),
        fromIsSelf ? Promise.resolve(null) : geocodeOne(merged.from!),
      ]);

      if (!destination) {
        track("ai:nl-planner.geocode-failed", { which: "to" });
        setError(t("nl.err.geocode", { q: merged.to! }));
        setStage("idle");
        return;
      }

      setResolved({ from: originMaybe, to: destination });
      setStage("idle");
      track("ai:nl-planner.geocoded", { hasFrom: !!originMaybe });
    } catch (err) {
      console.warn("[nl-planner] failed", err);
      track("ai:nl-planner.error");
      setError(t("nl.err.generic"));
      setStage("idle");
    } finally {
      setBusy(false);
    }
  }

  function startVoice() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = createRecognizer(locale === "el" ? "el-GR" : "en-US");
    if (!rec) {
      setError(t("nl.err.voice"));
      return;
    }
    recRef.current = rec;
    rec.onresult = (e) => {
      const transcript = transcriptOf(e);
      if (transcript) {
        setText(transcript);
        track("ai:nl-planner.voice-success", { length: transcript.length });
        // Auto-submit after a brief beat for visual feedback.
        setTimeout(() => submit(transcript), 200);
      }
    };
    rec.onerror = () => {
      setListening(false);
      track("ai:nl-planner.voice-error");
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
      track("ai:nl-planner.voice-start");
    } catch {
      setListening(false);
    }
  }

  function go() {
    if (!resolved) return;
    track("ui:nl-planner.plan-tap");
    try {
      sessionStorage.setItem(
        "aloya:nl-plan",
        JSON.stringify({
          from: resolved.from,
          to: resolved.to,
          leaveByISO: intent?.leaveByISO ?? null,
          arriveByISO: intent?.arriveByISO ?? null,
          rawText: text.trim(),
        }),
      );
    } catch {}
    navigate({ to: "/trips" });
  }

  function reset() {
    setText("");
    setIntent(null);
    setResolved(null);
    setError(null);
    inputRef.current?.focus();
  }

  return {
    text,
    setText,
    busy,
    stage,
    intent,
    resolved,
    error,
    setError,
    listening,
    inputRef,
    examples,
    suggestionReason,
    suggestionsLoading: suggestionsQuery.isLoading,
    submit,
    startVoice,
    go,
    reset,
    canSubmit: text.trim().length >= 3 && !busy,
  };
}
