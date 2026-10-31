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
import todayDerbyImg from "@/assets/today-derby.jpg";
import pulseSportImg from "@/assets/pulse-sport.webp";
import { tidy } from "./shared";

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
  sport: { en: "Sport", el: "Αθλητισμός" },
  marine: { en: "Sea", el: "Θάλασσα" },
  cinema: { en: "Cinema", el: "Σινεμά" },
  art: { en: "Art", el: "Τέχνη" },
  food: { en: "Food and wine", el: "Φαγητό και κρασί" },
  festival: { en: "Festival", el: "Φεστιβάλ" },
  culture: { en: "Culture", el: "Πολιτισμός" },
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

/** The painting for one listing: football gets the stadium, a beach game the
 * volleyball, any other sport the open sports ground. */
function eventImage(e: { title: string; category: string | null }, flavor: EventFlavor): string {
  if (flavor !== "sport") return FLAVOR_IMAGE[flavor];
  const hay = `${e.title} ${e.category ?? ""}`.toLowerCase();
  if (/(foot|soccer|derby|league|ποδόσφ)/.test(hay)) return todayDerbyImg;
  if (/(volley|βόλεϊ)/.test(hay)) return eventSportImg;
  return pulseSportImg;
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

  const dayFmt = (d: Date) =>
    d.toLocaleDateString(isEl ? "el-GR" : "en-GB", { day: "numeric", month: "short" });

  return (
    <section className="r-pulse-sec r-ev animate-rise" data-card="events">
      <h2 className="r-pulse-h">
        <span>{isEl ? "Σήμερα στο νησί" : "Happening today"}</span>
      </h2>
      <ul className="r-today-list">
        {active.map((e, i) => {
          const flavor = classifyEvent(e);
          const start = parseEventDate(e.startDate);
          const end = parseEventDate(e.endDate);
          const multiDay = !!(end && start && end.getTime() > start.getTime());
          const when =
            multiDay && end
              ? isEl
                ? `Έως ${dayFmt(end)}`
                : `Until ${dayFmt(end)}`
              : isEl
                ? "Σήμερα"
                : "Today";
          const place = e.city ? (e.venue ? `${e.venue}, ${e.city}` : e.city) : (e.venue ?? null);
          return (
            <li key={i} className="r-today-row">
              <span className="r-today-ico r-today-ico--art r-ev-thumb">
                <img
                  src={eventImage(e, flavor)}
                  alt=""
                  aria-hidden="true"
                  decoding="async"
                />
              </span>
              <span className="r-today-rowtxt">
                <span className="r-ev-top">
                  <span className="r-today-kick">{FLAVOR_LABEL[flavor][isEl ? "el" : "en"]}</span>
                  <span className="r-ev-when">{when}</span>
                </span>
                {e.url ? (
                  <a className="r-today-rowtitle" href={e.url} target="_blank" rel="noopener noreferrer">
                    {tidy(e.title)}
                  </a>
                ) : (
                  <span className="r-today-rowtitle">{tidy(e.title)}</span>
                )}
                {place ? <span className="r-today-rowsub">{place}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
