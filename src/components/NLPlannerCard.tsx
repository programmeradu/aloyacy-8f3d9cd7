// Natural-language trip planner card.
//
// Two layers of intent extraction so the card never feels dumb:
//   1. Deterministic regex pass (extractHeuristicIntent) catches the common
//      "to X", "from X to Y", "X in N min", "leave at HH:MM to X" patterns
//      with explicit time anchoring. This always runs and seeds the result.
//   2. AI pass (parseTripIntent) refines anything the regex missed —
//      ambiguous phrasing, weekday names, "after lunch", etc.
//
// Whichever yields a destination first wins; if both succeed we merge,
// preferring the LLM's place names but the regex's time arithmetic.
//
// The resolved Points + time intent are stashed in sessionStorage and
// /trips picks them up on mount.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { parseTripIntent, type TripIntent } from "@/lib/ai-planner.functions";
import { autocompletePlaces, getPlace } from "@/lib/maps.functions";
import { getNlSuggestions } from "@/lib/nl-suggestions.functions";
import { track, trackImpression } from "@/lib/analytics";
import { NICOSIA_CENTER } from "@/lib/gtfs";
import { getDeviceId, getDeviceToken } from "@/lib/pwa";
import {
  IconArrowUp,
  IconClose,
  IconMic,
  IconNav,
  IconClockSmall,
} from "@/components/Icons";
import { useI18n } from "@/lib/i18n";

// Generic cold-start fallbacks. Used only when the server-side suggestion
// fetch fails entirely; the hook below populates real, dynamic chips.
const FALLBACK_EXAMPLES = [
  "to Eleftheria Square in 20 min",
  "to Larnaca airport tomorrow 7am",
];

const SELF_REFS = new Set([
  "my place",
  "home",
  "my home",
  "work",
  "my work",
  "office",
  "my office",
  "current location",
  "my location",
  "here",
]);

type ResolvedPoint = { lat: number; lng: number; label: string };

// ── Heuristic intent extractor ────────────────────────────────────────────
// Returns a TripIntent-shaped object when the input has a clear "to X" or
// "X in N min" structure. Time fields are computed against the caller's
// local timezone offset (minutes east of UTC).
type LocalIntent = {
  from: string | null;
  to: string | null;
  leaveByISO: string | null;
  arriveByISO: string | null;
  confidence: number;
};

function extractHeuristicIntent(text: string, tzMin: number): LocalIntent {
  const t = text.trim();
  const lower = t.toLowerCase();
  let from: string | null = null;
  let to: string | null = null;

  // "from A to B"
  const fromTo = lower.match(/\bfrom\s+(.+?)\s+to\s+(.+?)(?:\s+(?:tomorrow|tonight|today|at|by|in|leave|arrive|before|after|on)\b|$)/);
  if (fromTo) {
    from = sliceOriginal(t, fromTo[1]);
    to = sliceOriginal(t, fromTo[2]);
  } else {
    const toMatch = lower.match(/\bto\s+(.+?)(?:\s+(?:tomorrow|tonight|today|at|by|in|leave|arrive|before|after|on)\b|$)/);
    if (toMatch) to = sliceOriginal(t, toMatch[1]);
    else {
      const inMin = lower.match(/^(.+?)\s+in\s+\d+\s*(?:min|minutes|mins)\b/);
      if (inMin) to = sliceOriginal(t, inMin[1]);
    }
  }

  // Time
  const time = extractClockTime(lower, tzMin);
  const minMatch = lower.match(/\bin\s+(\d{1,3})\s*(?:min|minutes|mins)\b/);
  let leaveByISO: string | null = null;
  let arriveByISO: string | null = null;
  if (minMatch) {
    leaveByISO = new Date(Date.now() + parseInt(minMatch[1], 10) * 60_000).toISOString();
  } else if (time) {
    if (time.preferArrive) arriveByISO = time.iso;
    else leaveByISO = time.iso;
  }

  const confidence = to ? (time || minMatch ? 0.95 : 0.7) : 0;
  return { from, to, leaveByISO, arriveByISO, confidence };
}

// Find the original-cased slice from the lowercase match.
function sliceOriginal(original: string, fragment: string): string {
  const idx = original.toLowerCase().indexOf(fragment);
  if (idx < 0) return fragment.trim();
  return original.slice(idx, idx + fragment.length).trim();
}

function extractClockTime(
  lower: string,
  tzMin: number,
): { iso: string; preferArrive: boolean } | null {
  const tomorrow = /\btomorrow\b/.test(lower);
  const tonight = /\btonight\b/.test(lower);
  const re = /\b(at|by|before|leave at|leave by|depart at|depart by|arrive by|arrive at)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/g;
  for (const m of lower.matchAll(re)) {
    const verb = m[1];
    let hh = parseInt(m[2], 10);
    const mm = m[3] ? parseInt(m[3], 10) : 0;
    const ampm = m[4];
    const hasColon = !!m[3];
    if (hh > 23 || mm > 59) continue;
    if (!ampm && !hasColon && !verb && hh < 13 && !tonight) continue;
    if (ampm === "pm" && hh < 12) hh += 12;
    if (ampm === "am" && hh === 12) hh = 0;
    if (tonight && hh < 17) hh += 12;
    const now = new Date();
    const local = new Date(now.getTime() + tzMin * 60_000);
    let y = local.getUTCFullYear();
    let mo = local.getUTCMonth();
    let d = local.getUTCDate();
    if (tomorrow) d += 1;
    const ms = Date.UTC(y, mo, d, hh, mm) - tzMin * 60_000;
    if (!tomorrow && ms < now.getTime() - 60_000) continue; // skip past times today
    return {
      iso: new Date(ms).toISOString(),
      preferArrive: /\b(by|before|arrive)\b/.test(lower),
    };
  }
  return null;
}

// Web Speech API typing (loose — varies per browser).
type SpeechRec = {
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

function createRecognizer(): SpeechRec | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    (window as unknown as { SpeechRecognition?: new () => SpeechRec }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.continuous = false;
  return rec;
}

export function NLPlannerCard() {
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const parse = useServerFn(parseTripIntent);
  const acFn = useServerFn(autocompletePlaces);
  const placeFn = useServerFn(getPlace);
  const suggestFn = useServerFn(getNlSuggestions);

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"idle" | "parsing" | "locating">("idle");
  const [intent, setIntent] = useState<TripIntent | LocalIntent | null>(null);
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
  const examples =
    suggestionsQuery.data?.suggestions?.map((s) => s.text) ??
    (suggestionsQuery.isLoading ? [] : FALLBACK_EXAMPLES);

  useEffect(() => {
    trackImpression("ui:nl-planner.impression");
    return () => {
      abortRef.current?.abort();
      recRef.current?.abort();
    };
  }, []);

  async function geocodeOne(query: string): Promise<ResolvedPoint | null> {
    const ac = await acFn({ data: { query, bias: NICOSIA_CENTER } });
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
      // Run AI + heuristic in parallel. Heuristic is instant; AI takes ~1-2s.
      const aiResult = await parse({
        data: { text: q, nowISO: new Date().toISOString(), tzOffsetMin: tzMin },
      }).catch(() => null);

      // Merge: prefer AI place names if present, fall back to heuristic.
      const merged: LocalIntent = {
        from: aiResult?.from ?? heuristic.from,
        to: aiResult?.to ?? heuristic.to,
        leaveByISO: heuristic.leaveByISO ?? aiResult?.leaveByISO ?? null,
        arriveByISO: heuristic.arriveByISO ?? aiResult?.arriveByISO ?? null,
        confidence: Math.max(aiResult?.confidence ?? 0, heuristic.confidence),
      };

      if (!merged.to || merged.confidence < 0.3) {
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
      const fromRaw = merged.from?.trim().toLowerCase();
      const fromIsSelf = !merged.from || (fromRaw && SELF_REFS.has(fromRaw));

      const [destination, originMaybe] = await Promise.all([
        geocodeOne(merged.to),
        fromIsSelf || !merged.from ? Promise.resolve(null) : geocodeOne(merged.from),
      ]);

      if (!destination) {
        track("ai:nl-planner.geocode-failed", { which: "to" });
        setError(t("nl.err.geocode", { q: merged.to }));
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
    const rec = createRecognizer();
    if (!rec) {
      setError(t("nl.err.voice"));
      return;
    }
    rec.lang = locale === "el" ? "el-GR" : "en-US";
    recRef.current = rec;
    rec.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
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

  const canSubmit = text.trim().length >= 3 && !busy;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-card ring-1 ring-line">
      {/* Editorial gradient corner */}
      <div
        className="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full blur-3xl opacity-60"
        style={{ background: "var(--aegean-soft)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-12 size-48 rounded-full blur-3xl opacity-40"
        style={{ background: "var(--ochre-soft)" }}
      />

      <div className="relative p-5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-aegean-deep">
            Ask Aloya
          </span>
          <span className="h-px flex-1 bg-line" />
          <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-soft">
            Plain words
          </span>
        </div>

        <h2 className="font-display text-[2rem] leading-[1.05] text-ink mt-2">
          Where to today?
        </h2>
        <p className="font-sans text-[12.5px] text-ink-soft mt-1.5">
          Say it like you would to a friend. Times, days, landmarks — all fair game.
        </p>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(text);
          }}
          className="mt-4"
        >
          <div className="group relative flex items-center rounded-2xl bg-background ring-1 ring-line focus-within:ring-aegean-deep transition shadow-sm">
            <span className="pl-3.5 text-ink-soft">
              <IconNav className="size-4" />
            </span>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (error) setError(null);
              }}
              placeholder={listening ? "Listening\u2026" : "to Larnaca airport tomorrow 7am"}
              aria-label="Describe your trip"
              className="flex-1 bg-transparent outline-none font-sans text-[14.5px] text-ink placeholder:text-ink-soft/60 px-2.5 py-3"
              autoComplete="off"
              maxLength={500}
              disabled={listening}
            />
            {text.length > 0 && !busy && (
              <button
                type="button"
                onClick={reset}
                aria-label="Clear"
                className="mr-1 grid place-items-center size-7 rounded-full text-ink-soft hover:text-ink hover:bg-line transition"
              >
                <IconClose className="size-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={startVoice}
              aria-label={listening ? "Stop listening" : "Voice input"}
              aria-pressed={listening}
              className={`mr-1 grid place-items-center size-9 rounded-full transition ${
                listening
                  ? "bg-ochre text-card animate-pulse"
                  : "text-ink-soft hover:text-ink hover:bg-line"
              }`}
            >
              <IconMic className="size-4" />
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              aria-label="Plan trip"
              className="mr-1.5 grid place-items-center size-10 rounded-full bg-ink text-card transition disabled:opacity-30 disabled:cursor-not-allowed enabled:hover:bg-aegean-deep enabled:active:scale-95"
            >
              {busy ? (
                <span className="size-4 rounded-full border-2 border-card/30 border-t-card animate-spin" />
              ) : (
                <IconArrowUp className="size-4" />
              )}
            </button>
          </div>

          {/* Stage label under composer */}
          {busy && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-aegean-deep flex items-center gap-1.5">
              <span className="inline-block size-1 rounded-full bg-aegean-deep animate-pulse" />
              {stage === "parsing" ? "Reading what you mean\u2026" : "Finding stops in Cyprus\u2026"}
            </p>
          )}
        </form>

        {/* Dynamic suggestions — only when idle */}
        {!intent && !busy && !resolved && !error && (
          <div className="mt-4">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-soft mb-2">
              {suggestionsQuery.data?.suggestions?.[0]?.reason === "personal"
                ? "For you"
                : suggestionsQuery.data?.suggestions?.[0]?.reason === "trending"
                  ? "Trending now"
                  : "Try"}
            </p>
            <div className="flex flex-col gap-1.5">
              {suggestionsQuery.isLoading && examples.length === 0
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-10 rounded-xl bg-background ring-1 ring-line animate-pulse"
                    />
                  ))
                : examples.map((ex: string) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => {
                        setText(ex);
                        submit(ex);
                      }}
                      className="group text-left rounded-xl bg-background ring-1 ring-line px-3 py-2 hover:ring-aegean-deep hover:bg-card transition flex items-center justify-between gap-2"
                    >
                      <span className="font-sans text-[13px] text-ink">{ex}</span>
                      <IconArrowUp className="size-3 text-ink-soft rotate-45 group-hover:text-aegean-deep transition" />
                    </button>
                  ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-3 rounded-xl bg-ochre-soft/60 px-3 py-2 font-sans text-[12.5px] text-ink">
            {error}
          </div>
        )}

        {/* Resolved result */}
        {resolved && (
          <div className="mt-4 rounded-2xl bg-background ring-1 ring-aegean-deep/30 p-4 animate-rise">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-aegean-deep">
              Got it
            </p>

            <div className="mt-2 flex items-start gap-3">
              <div className="flex flex-col items-center pt-1.5">
                <span className="size-2 rounded-full ring-2 ring-aegean-deep" />
                <span className="my-1 w-px flex-1 min-h-[18px] bg-line" />
                <span className="size-2 rounded-full bg-ochre" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-sans text-[11px] uppercase tracking-[0.16em] text-ink-soft">
                  From
                </p>
                <p className="font-display text-[18px] leading-tight text-ink truncate">
                  {resolved.from?.label ?? "Your location"}
                </p>
                <p className="font-sans text-[11px] uppercase tracking-[0.16em] text-ink-soft mt-2">
                  To
                </p>
                <p className="font-display text-[18px] leading-tight text-ink truncate">
                  {resolved.to.label}
                </p>
              </div>
            </div>

            {(intent?.arriveByISO || intent?.leaveByISO) && (
              <div className="mt-3 flex items-center gap-1.5 font-mono text-[11px] text-aegean-deep">
                <IconClockSmall className="size-3.5" />
                {intent.arriveByISO
                  ? `Arrive by ${formatWhen(intent.arriveByISO)}`
                  : `Leave ${formatWhen(intent.leaveByISO!)}`}
              </div>
            )}

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={reset}
                className="flex-1 rounded-full ring-1 ring-line bg-card text-ink font-mono text-[10px] uppercase tracking-[0.18em] py-2.5 hover:ring-ink transition"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={go}
                className="flex-[2] flex items-center justify-center gap-1.5 rounded-full bg-ink text-card font-mono text-[10px] uppercase tracking-[0.18em] py-2.5 hover:bg-aegean-deep transition"
              >
                Plan this trip
                <IconArrowUp className="size-3 rotate-90" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (d.toDateString() === today.toDateString()) return `at ${time}`;
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString()) return `tomorrow ${time}`;
    return `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
  } catch {
    return iso;
  }
}
