// Events strip — classifies each listing into an editorial flavour and
// pairs it with bespoke artwork.

import { useMemo } from "react";
import type { PulseLiveBundle } from "@/lib/pulse-live.functions";
import eventMusicImg from "@/assets/event-music.jpg";
import eventRunningImg from "@/assets/event-running.jpg";
import eventSportImg from "@/assets/event-sport.jpg";
import eventMarineImg from "@/assets/event-marine.jpg";
import eventCinemaImg from "@/assets/event-cinema.jpg";
import eventArtImg from "@/assets/event-art.jpg";
import eventFoodImg from "@/assets/event-food.jpg";
import eventFestivalImg from "@/assets/event-festival.jpg";
import eventCultureImg from "@/assets/event-culture.jpg";

/* ────────────── Events strip ───────────────────────────────────────── */
//
// Only events that COVER today (start ≤ today ≤ end) render here. Multi-day
// festivals stay visible for their full run; single-day events appear on the
// day itself. Anything future or past is filtered out — the Pulse page is a
// today-shaped surface, not a calendar.

type EventFlavor =
  "music" | "running" | "sport" | "marine" | "cinema" | "art" | "food" | "festival" | "culture";

function classifyEvent(e: { title: string; category: string | null }): EventFlavor {
  const hay = `${e.title} ${e.category ?? ""}`.toLowerCase();
  if (/(run|marathon|trail|walk\b)/.test(hay)) return "running";
  if (/(volley|basket|foot|tennis|padel|match|championship|league|cup|race|derby)/.test(hay))
    return "sport";
  if (/(apnea|dive|sail|sea|marine|regatta|swim|beach)/.test(hay)) return "marine";
  if (/(concert|music|jazz|dj|orchestra|choir|opera|band|festival of music|συναυλ)/.test(hay))
    return "music";
  if (/(film|cinema|screen|movie|ταιν)/.test(hay)) return "cinema";
  if (/(art|exhibit|gallery|museum|painting|έκθεσ)/.test(hay)) return "art";
  if (/(wine|food|gastro|tast|olive|feast|κρασ|φαγητ)/.test(hay)) return "food";
  if (/(festival|carnival|fair|φεστιβ|γιορτ|πανηγυρ)/.test(hay)) return "festival";
  return "culture";
}

const FLAVOR_LABEL: Record<EventFlavor, { en: string; el: string }> = {
  music: { en: "Music", el: "Μουσική" },
  running: { en: "Running", el: "Τρέξιμο" },
  sport: { en: "Sport", el: "Άθληση" },
  marine: { en: "Sea", el: "Θάλασσα" },
  cinema: { en: "Cinema", el: "Σινεμά" },
  art: { en: "Art", el: "Τέχνη" },
  food: { en: "Table", el: "Τραπέζι" },
  festival: { en: "Festival", el: "Φεστιβάλ" },
  culture: { en: "Culture", el: "Πολιτισμός" },
};

const FLAVOR_ACCENT: Record<EventFlavor, { bg: string; ink: string; ring: string }> = {
  music: { bg: "from-ochre/25 to-ochre/10", ink: "text-ochre-deep", ring: "ring-ochre/30" },
  running: { bg: "from-olive/25 to-olive/10", ink: "text-olive-deep", ring: "ring-olive/30" },
  sport: { bg: "from-aegean/25 to-aegean/10", ink: "text-aegean-deep", ring: "ring-aegean/30" },
  marine: { bg: "from-aegean/30 to-aegean/10", ink: "text-aegean-deep", ring: "ring-aegean/30" },
  cinema: { bg: "from-ink/15 to-ink/5", ink: "text-ink", ring: "ring-ink/20" },
  art: { bg: "from-ochre/20 to-olive/10", ink: "text-olive-deep", ring: "ring-olive/30" },
  food: { bg: "from-ochre/25 to-ochre/5", ink: "text-ochre-deep", ring: "ring-ochre/30" },
  festival: { bg: "from-ochre/25 to-aegean/10", ink: "text-ochre-deep", ring: "ring-ochre/30" },
  culture: { bg: "from-aegean/20 to-olive/10", ink: "text-aegean-deep", ring: "ring-aegean/30" },
};

/** Bespoke painterly asset per flavor — generated editorial illustrations. */
const FLAVOR_IMAGE: Record<EventFlavor, string> = {
  music: eventMusicImg,
  running: eventRunningImg,
  sport: eventSportImg,
  marine: eventMarineImg,
  cinema: eventCinemaImg,
  art: eventArtImg,
  food: eventFoodImg,
  festival: eventFestivalImg,
  culture: eventCultureImg,
};

/** Parse an event date in local time — dates from the ingest are YYYY-MM-DD. */
function parseEventDate(s: string | null): Date | null {
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

export function EventsStrip({
  payload,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["events"]>;
  isEl: boolean;
}) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayStart = today.getTime();
  const todayEnd = todayStart + 24 * 3600 * 1000 - 1;

  const active = useMemo(() => {
    return payload.events
      .filter((e) => {
        const start = parseEventDate(e.startDate);
        const end = parseEventDate(e.endDate) ?? start;
        if (!start) return false;
        // Event covers today if it started on/before today AND ends on/after today.
        const startMs = start.getTime();
        const endMs = (end ?? start).getTime() + 24 * 3600 * 1000 - 1;
        return startMs <= todayEnd && endMs >= todayStart;
      })
      .slice(0, 4);
  }, [payload.events, todayStart, todayEnd]);

  if (active.length === 0) return null;

  return (
    <section className="mt-8">
      <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-ink-soft mb-3">
        {isEl ? "Σήμερα στο νησί" : "Happening today"}
      </p>
      <ul className="grid gap-3">
        {active.map((e, i) => {
          const flavor = classifyEvent(e);
          const accent = FLAVOR_ACCENT[flavor];
          const flavorLabel = FLAVOR_LABEL[flavor][isEl ? "el" : "en"];
          const start = parseEventDate(e.startDate);
          const end = parseEventDate(e.endDate);
          const multiDay = end && start && end.getTime() > start.getTime();
          const dayFmt = (d: Date) =>
            d.toLocaleDateString(isEl ? "el-GR" : "en-GB", { day: "numeric", month: "short" });
          const runLabel =
            multiDay && start && end
              ? isEl
                ? `έως ${dayFmt(end)}`
                : `through ${dayFmt(end)}`
              : isEl
                ? "σήμερα"
                : "today";

          return (
            <li
              key={i}
              className="group relative overflow-hidden rounded-[22px] bg-card ring-1 ring-line hover:ring-ink/15 transition-all"
            >
              <div className="flex items-stretch gap-0">
                <div className="relative flex-shrink-0 w-[92px] overflow-hidden">
                  <img
                    src={FLAVOR_IMAGE[flavor]}
                    alt=""
                    loading="lazy"
                    width={768}
                    height={768}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent" />
                </div>

                <div className="flex-1 min-w-0 px-4 py-3.5 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-eyebrow text-[9px] uppercase tracking-[0.22em] ${accent.ink}`}
                    >
                      {flavorLabel}
                    </span>
                    <span className="h-px flex-1 bg-line" />
                    <span className="font-eyebrow text-[9px] uppercase tracking-[0.22em] text-ink-soft tabular-nums whitespace-nowrap">
                      {runLabel}
                    </span>
                  </div>
                  <p className="font-display text-[15px] leading-[1.25] text-ink text-balance break-soft">
                    {e.title}
                  </p>
                  {e.city && (
                    <p className="font-sans text-[12px] text-ink-soft leading-tight">
                      {e.venue ? `${e.venue}, ${e.city}` : e.city}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
