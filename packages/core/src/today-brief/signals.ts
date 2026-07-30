// Signal selection: matchdays, festivals, live feed events, rhythm and theme.

import { RHYTHM } from "../today-rhythm";
import type { CruiseToday, Festival, Fixture, TodayTheme, TodayTile, Weather } from "./types";
import { dayOfYear, dayKey, seededPick } from "./geo-time";

export type VenuePattern = { name: string; nameEl: string; city: string; routeIds: string[] };

/** Heuristic match-night detector — weekend nights and midweek cup rounds. */
export function selectMatchday(
  d: Date,
  venues: VenuePattern[],
  preferCity?: string,
): Fixture | null {
  const dow = d.getUTCDay();
  const seed = dayOfYear(d);
  const isWeekendNight = dow === 0 || dow === 6;
  const isMidweek = dow === 2 || dow === 3;
  if (!isWeekendNight && !isMidweek) return null;
  if (venues.length === 0) return null;
  const threshold = isWeekendNight ? 60 : 25;
  const score = (seed * 9301 + 49297) % 100;
  if (score >= threshold) return null;
  const biased = preferCity ? venues.find((v) => v.city === preferCity) : undefined;
  const venue = biased ?? seededPick(venues, seed);
  return {
    venue: venue.name,
    venueEl: venue.nameEl,
    city: venue.city,
    cityEl:
      venue.city === "Nicosia" ? "Λευκωσία" : venue.city === "Limassol" ? "Λεμεσός" : "Λάρνακα",
    routes: venue.routeIds,
  };
}

export type RecurringFestival = {
  name: string;
  nameEl: string;
  city: string;
  month: number;
  weekRule: string;
};

export function selectFestival(d: Date, recurring: RecurringFestival[]): Festival | null {
  const month = d.getUTCMonth() + 1;
  const candidates = recurring.filter((e) => e.month === month);
  if (candidates.length === 0) return null;
  const dayNum = d.getUTCDate();
  const dow = d.getUTCDay();
  const isPerfNight = dow === 5 || dow === 6;
  for (const e of candidates) {
    const rule = e.weekRule;
    if (rule === "all-month") return e;
    if (rule === "weekend-nights" && isPerfNight) return e;
    if (rule === "first-weekend" && dayNum <= 7) return e;
    if (rule === "late-month" && dayNum >= 22) return e;
    if (rule === "last-week" && dayNum >= 22) return e;
    if (rule === "monday-after-pentecost" && dayNum <= 14 && dow === 1) return e;
  }
  return null;
}

export function lookupByDay<T>(d: Date, map: Record<string, T>): T | null {
  return map[dayKey(d)] ?? null;
}

export function normaliseCity(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes("nicos") || s.includes("λευκ")) return "Nicosia";
  if (s.includes("limas") || s.includes("lemes") || s.includes("λεμ")) return "Limassol";
  if (s.includes("larna") || s.includes("λαρ")) return "Larnaca";
  if (s.includes("paph") || s.includes("paf") || s.includes("πάφ")) return "Paphos";
  if (s.includes("famag") || s.includes("αμμό") || s.includes("ayia napa") || s.includes("paralim"))
    return "Famagusta";
  return null;
}

export type FeedEvent = {
  title?: string;
  city?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

/** Picks the first live feed event covering `d`, preferring the rider's city. */
export function pickLiveEvent(d: Date, events: FeedEvent[], preferCity?: string): Festival | null {
  if (!Array.isArray(events) || events.length === 0) return null;
  const today = d.toISOString().slice(0, 10);
  const active = events.filter((e) => {
    const start = e.startDate?.slice(0, 10);
    if (!start) return false;
    const end = (e.endDate ?? e.startDate)?.slice(0, 10) ?? start;
    return start <= today && today <= end;
  });
  if (active.length === 0) return null;
  const cityHit = preferCity ? active.find((e) => normaliseCity(e.city) === preferCity) : undefined;
  const chosen = cityHit ?? active[0];
  const title = (chosen.title ?? "").trim();
  if (!title) return null;
  return { name: title, nameEl: title, city: normaliseCity(chosen.city) ?? preferCity ?? "Cyprus" };
}

export function rhythmForDay(dow: number, city: string): TodayTile | null {
  const key = city in RHYTHM ? city : "Cyprus";
  const note = RHYTHM[key]?.[dow];
  if (!note) return null;
  return {
    kind: "rhythm",
    kicker: "ON A " + ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][dow],
    kickerEl: "ΡΥΘΜΟΣ",
    title: note.title,
    titleEl: note.titleEl,
    detail: note.detail,
    detailEl: note.detailEl,
    accent: "olive",
  };
}

const cityEl = (city: string) =>
  city === "Limassol" ? "Λεμεσός" : city === "Paphos" ? "Πάφος" : city;
const cityElAcc = (city: string) =>
  city === "Limassol" ? "Λεμεσό" : city === "Paphos" ? "Πάφο" : city;

export function pickTheme(signals: {
  fixture: Fixture | null;
  festival: Festival | null;
  holiday: { en: string; el: string } | null;
  cruise: CruiseToday;
  weather: Weather;
}): TodayTheme {
  const { fixture, festival, holiday, cruise, weather } = signals;
  if (fixture) return "derby";
  if (festival) return "festival";
  if (holiday) return "holiday";
  if (weather && (weather.iconKey === "storm" || weather.iconKey === "rain")) return "storm";
  if (cruise) return "cruise";
  if (weather && weather.tempC >= 35) return "heatwave";
  return "calm";
}
