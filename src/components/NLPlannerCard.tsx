// Natural-language trip planner card. Users type "tomorrow morning to
// Larnaca airport from my place" and we parse it into a structured
// intent, then hand off to /trips with prefilled fields.

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { parseTripIntent, type TripIntent } from "@/lib/ai-planner.functions";
import { track, trackImpression } from "@/lib/analytics";
import { IconArrowUpRight, IconSearch } from "@/components/Icons";

const EXAMPLES = [
  "to Larnaca airport tomorrow 7am",
  "leave at 8:30 to the University",
  "get me to Eleftheria Square in 20 min",
];

export function NLPlannerCard() {
  const navigate = useNavigate();
  const parse = useServerFn(parseTripIntent);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<TripIntent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trackImpression("ui:nl-planner.impression");
  }, []);

  async function submit(value: string) {
    const t = value.trim();
    if (t.length < 3) return;
    setBusy(true);
    setError(null);
    setIntent(null);
    track("ai:nl-planner.submit", { length: t.length });
    try {
      const tz = -new Date().getTimezoneOffset();
      const result = await parse({
        data: {
          text: t,
          nowISO: new Date().toISOString(),
          tzOffsetMin: tz,
        },
      });
      if (!result || result.confidence < 0.3 || !result.to) {
        track("ai:nl-planner.parse-failed", { confidence: result?.confidence ?? 0 });
        setError("I couldn't read that as a trip. Try a place name.");
        return;
      }
      track("ai:nl-planner.parsed", {
        confidence: result.confidence,
        hasFrom: !!result.from,
        hasArriveBy: !!result.arriveByISO,
        hasLeaveBy: !!result.leaveByISO,
      });
      setIntent(result);
    } catch {
      track("ai:nl-planner.error");
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function go() {
    if (!intent?.to) return;
    track("ui:nl-planner.plan-tap");
    try {
      sessionStorage.setItem("aloya:nl-intent", JSON.stringify(intent));
    } catch {}
    navigate({ to: "/trips" });
  }

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-aegean-pale via-card to-card ring-1 ring-line">
      <div className="absolute -top-12 -right-10 size-48 rounded-full bg-aegean-aqua/15 blur-3xl" />
      <div className="relative p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-aegean-deep">
          Ask in plain words
        </p>
        <h2 className="font-display text-2xl text-ink mt-1 leading-tight">
          Where to today?
        </h2>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(text);
          }}
          className="mt-4 flex items-stretch gap-2"
        >
          <div className="flex-1 flex items-center gap-2 rounded-2xl bg-bg ring-1 ring-line px-3 py-2.5 focus-within:ring-aegean-deep transition">
            <IconSearch className="size-4 text-ink-soft shrink-0" />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="to Larnaca airport tomorrow 7am"
              aria-label="Describe your trip"
              className="flex-1 bg-transparent outline-none font-sans text-[14px] text-ink placeholder:text-ink-soft/70"
              autoComplete="off"
              maxLength={500}
            />
          </div>
          <button
            type="submit"
            disabled={busy || text.trim().length < 3}
            className="rounded-2xl bg-ink text-bg font-mono text-[11px] uppercase tracking-[0.16em] px-4 disabled:opacity-50"
          >
            {busy ? "…" : "Plan"}
          </button>
        </form>

        {!intent && !busy && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setText(ex);
                  submit(ex);
                }}
                className="text-[11px] font-sans text-ink-soft rounded-full bg-card ring-1 ring-line px-2.5 py-1 hover:ring-aegean-deep hover:text-ink transition"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-3 text-[12px] text-ochre font-sans">{error}</p>
        )}

        {intent && (
          <div className="mt-4 rounded-2xl bg-bg ring-1 ring-line p-3 animate-rise">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-soft">
                  Got it
                </p>
                <p className="font-display text-lg text-ink leading-tight mt-0.5">
                  {intent.from ?? "Your location"}
                  <span className="text-ink-soft mx-1.5">to</span>
                  {intent.to}
                </p>
                {(intent.arriveByISO || intent.leaveByISO) && (
                  <p className="font-mono text-[11px] text-aegean-deep mt-1">
                    {intent.arriveByISO
                      ? `Arrive by ${formatWhen(intent.arriveByISO)}`
                      : `Leave at ${formatWhen(intent.leaveByISO!)}`}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={go}
                className="shrink-0 flex items-center gap-1 rounded-full bg-aegean-deep text-bg font-mono text-[10px] uppercase tracking-[0.18em] px-3 py-1.5"
              >
                Plan
                <IconArrowUpRight className="size-3" />
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
    const sameDay = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (sameDay) return time;
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString()) return `tomorrow ${time}`;
    return d.toLocaleDateString([], { weekday: "short" }) + " " + time;
  } catch {
    return iso;
  }
}
