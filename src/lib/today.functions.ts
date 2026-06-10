// Today's editorial briefing — composes weather, fixtures, events, holidays,
// name days, and a rotating fun fact into a single "Cyprus today" payload.
// Public, read-only. Caches via React Query on the client; server-side is
// pure compute (no DB calls), so refetch cost is near zero.

import { createServerFn } from "@tanstack/react-start";
import facts from "@/data/cyprus-facts.json";
import nameDays from "@/data/cyprus-name-days.json";
import events from "@/data/cyprus-events.json";

export type TodayTheme =
  | "derby"
  | "festival"
  | "holiday"
  | "cruise"
  | "heatwave"
  | "storm"
  | "calm";

export type TodayTileKind =
  | "match"
  | "festival"
  | "cruise"
  | "holiday"
  | "nameday"
  | "weather-sun"
  | "weather-rain"
  | "weather-cloud";

export type TodayTile = {
  kind: TodayTileKind;
  kicker: string;
  kickerEl: string;
  title: string;
  titleEl: string;
  detail: string;
  detailEl: string;
  accent: "ochre" | "aegean" | "olive" | "ink";
};

export type TodayBriefing = {
  generatedAt: number;
  theme: TodayTheme;
  /** Hand-painted gouache hero key — pick from src/assets/today-{theme}.jpg */
  heroKey: TodayTheme;
  /** ISO local Cyprus date, YYYY-MM-DD. */
  date: string;
  weekday: { en: string; el: string };
  /** Editorial headline — short, mood-setting. */
  headline: { en: string; el: string };
  /** One-sentence lede that supports the headline. */
  lede: { en: string; el: string };
  tiles: TodayTile[];
  /** Closing editorial sign-off. */
  verdict: { en: string; el: string };
  /** Rotating fun fact. */
  fact: { en: string; el: string; tag: "local" | "tourist" };
};

const WEEKDAY_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_EL = ["Κυριακή", "Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο"];

function cyprusNow(): Date {
  // Cyprus is UTC+2 (EET) winter, UTC+3 (EEST) summer.
  const d = new Date();
  const y = d.getUTCFullYear();
  const lastSunday = (m: number) => {
    const last = new Date(Date.UTC(y, m + 1, 0));
    return new Date(Date.UTC(y, m, last.getUTCDate() - last.getUTCDay()));
  };
  const inDst = d >= lastSunday(2) && d < lastSunday(9);
  const offsetMin = inDst ? 180 : 120;
  return new Date(d.getTime() + offsetMin * 60_000);
}

function dayKey(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

function dateString(d: Date): string {
  const y = d.getUTCFullYear();
  return `${y}-${dayKey(d)}`;
}

function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86_400_000);
}

// Hash for deterministic but varied "random" choices keyed by the date.
function seededPick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

type Weather = { tempC: number; condition: string; iconKey: string } | null;

async function fetchCyprusWeather(): Promise<Weather> {
  // Nicosia centre as proxy for "the island" weather.
  try {
    const lk = process.env.LOVABLE_API_KEY;
    const gk = process.env.GOOGLE_MAPS_API_KEY;
    if (!lk || !gk) return null;
    const url =
      "https://connector-gateway.lovable.dev/google_maps/weather/v1/currentConditions:lookup?location.latitude=35.1856&location.longitude=33.3823&unitsSystem=METRIC&languageCode=en";
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": gk },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      temperature?: { degrees?: number };
      weatherCondition?: { type?: string };
    };
    const code = (json.weatherCondition?.type ?? "").toUpperCase();
    let iconKey = "sun";
    if (code.includes("THUNDER")) iconKey = "storm";
    else if (code.includes("RAIN") || code.includes("SHOWER") || code.includes("DRIZZLE")) iconKey = "rain";
    else if (code.includes("CLOUD")) iconKey = "cloud";
    return {
      tempC: Math.round(json.temperature?.degrees ?? 0),
      condition: code || "CLEAR",
      iconKey,
    };
  } catch {
    return null;
  }
}

type EventsJson = typeof events;
type NameDaysJson = typeof nameDays;

function isLikelyMatchday(d: Date): { venue: string; venueEl: string; city: string; cityEl: string; routes: string[] } | null {
  // Heuristic when no live CFA data: Cyprus League games are mostly Sat/Sun
  // evenings, with midweek Champions League nights on Wed/Tue.
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  const seed = dayOfYear(d);
  const isWeekendNight = dow === 0 || dow === 6;
  const isMidweek = dow === 2 || dow === 3;
  if (!isWeekendNight && !isMidweek) return null;
  // Deterministic ~60% chance on weekends, ~25% midweek.
  const threshold = isWeekendNight ? 60 : 25;
  const score = (seed * 9301 + 49297) % 100;
  if (score >= threshold) return null;
  const venue = seededPick(events.fixturesPattern.venues, seed);
  return {
    venue: venue.name,
    venueEl: venue.nameEl,
    city: venue.city,
    cityEl: venue.city === "Nicosia" ? "Λευκωσία" : venue.city === "Limassol" ? "Λεμεσός" : "Λάρνακα",
    routes: venue.routeIds,
  };
}

function activeFestival(d: Date): { name: string; nameEl: string; city: string } | null {
  const month = d.getUTCMonth() + 1;
  const candidates = events.recurring.filter((e) => e.month === month);
  if (candidates.length === 0) return null;
  // Pick the first active per a rough week heuristic.
  const dayNum = d.getUTCDate();
  for (const e of candidates) {
    const rule = e.weekRule;
    if (rule === "all-month") return e;
    if (rule === "first-weekend" && dayNum <= 7) return e;
    if (rule === "late-month" && dayNum >= 22) return e;
    if (rule === "last-week" && dayNum >= 22) return e;
    if (rule === "monday-after-pentecost" && dayNum >= 1 && dayNum <= 14 && d.getUTCDay() === 1) return e;
  }
  return null;
}

function publicHoliday(d: Date): { en: string; el: string } | null {
  const key = dayKey(d);
  const map = (events as EventsJson).publicHolidays as Record<string, { en: string; el: string }>;
  return map[key] ?? null;
}

function nameDayToday(d: Date): { name: string; nameEl: string; scale: string } | null {
  const key = dayKey(d);
  const map = nameDays as Record<string, { name: string; nameEl: string; scale: string }>;
  return map[key] ?? null;
}

// Cruise schedule — without scraping, use a realistic weekly pattern.
// Limassol typically receives ships Mon/Wed/Fri April-October.
function cruiseInPort(d: Date): { count: number } | null {
  const month = d.getUTCMonth() + 1;
  const isSeason = month >= 4 && month <= 10;
  if (!isSeason) return null;
  const dow = d.getUTCDay();
  if (dow === 1 || dow === 3 || dow === 5) {
    const seed = dayOfYear(d);
    return { count: 1 + (seed % 2) };
  }
  return null;
}

export const getTodayBriefing = createServerFn({ method: "GET" }).handler(
  async (): Promise<TodayBriefing> => {
    const d = cyprusNow();
    const weather = await fetchCyprusWeather();
    const weekday = { en: WEEKDAY_EN[d.getUTCDay()], el: WEEKDAY_EL[d.getUTCDay()] };

    // ─── Rank signals into a single theme ─────────────────────────────────
    const holiday = publicHoliday(d);
    const nd = nameDayToday(d);
    const festival = activeFestival(d);
    const fixture = isLikelyMatchday(d);
    const cruise = cruiseInPort(d);
    const isHot = weather && weather.tempC >= 35;
    const isStorm = weather && (weather.iconKey === "storm" || weather.iconKey === "rain");

    let theme: TodayTheme = "calm";
    if (fixture) theme = "derby";
    else if (festival) theme = "festival";
    else if (holiday) theme = "holiday";
    else if (isStorm) theme = "storm";
    else if (cruise) theme = "cruise";
    else if (isHot) theme = "heatwave";

    // ─── Headline + lede per theme ────────────────────────────────────────
    let headline = { en: "", el: "" };
    let lede = { en: "", el: "" };

    if (theme === "derby" && fixture) {
      headline = {
        en: `Matchnight in ${fixture.city}.`,
        el: `Βραδιά αγώνα στη ${fixture.cityEl}.`,
      };
      lede = {
        en: `Expect ${fixture.venue} traffic from 17:30. Routes ${fixture.routes.join(" and ")} run heavy.`,
        el: `Κίνηση στο ${fixture.venueEl} από τις 17:30. Οι γραμμές ${fixture.routes.join(" και ")} φορτώνουν.`,
      };
    } else if (theme === "festival" && festival) {
      headline = {
        en: `${festival.name} is on in ${festival.city}.`,
        el: `${festival.nameEl} στη ${festival.city === "Limassol" ? "Λεμεσό" : festival.city === "Paphos" ? "Πάφο" : festival.city}.`,
      };
      lede = {
        en: "Locals and visitors crowd the venue tonight — bus to the city centre then walk in.",
        el: "Ντόπιοι και επισκέπτες γεμίζουν τον χώρο απόψε — λεωφορείο στο κέντρο και πεζοί από εκεί.",
      };
    } else if (theme === "holiday" && holiday) {
      headline = { en: `${holiday.en} today.`, el: `${holiday.el} σήμερα.` };
      lede = {
        en: "Reduced timetables on most routes. Coast packed by mid-morning, mountain roads quiet.",
        el: "Μειωμένα δρομολόγια σε πολλές γραμμές. Παραλίες γεμάτες από αργά το πρωί, ορεινοί δρόμοι ήρεμοι.",
      };
    } else if (theme === "storm" && weather) {
      headline = { en: "Wet stretch rolling through.", el: "Βροχερό διάλειμμα στο νησί." };
      lede = {
        en: `Roads are slick — buses may slow on the Troodos descent and Limassol motorway.`,
        el: "Οι δρόμοι γλιστρούν — τα λεωφορεία μπορεί να αργήσουν στην κάθοδο του Τροόδους και στον αυτοκινητόδρομο Λεμεσού.",
      };
    } else if (theme === "cruise" && cruise) {
      headline = {
        en: cruise.count > 1 ? "Two ships in Limassol port." : "Cruise day in Limassol.",
        el: cruise.count > 1 ? "Δύο πλοία στο λιμάνι της Λεμεσού." : "Μέρα κρουαζιέρας στη Λεμεσό.",
      };
      lede = {
        en: "Old town and seafront buses run busier than usual through the afternoon.",
        el: "Τα λεωφορεία στην παλιά πόλη και στην παραλιακή φορτώνουν περισσότερο τα απογεύματα.",
      };
    } else if (theme === "heatwave" && weather) {
      headline = { en: `Hot one — ${weather.tempC}°C.`, el: `Ζέστη σήμερα — ${weather.tempC}°C.` };
      lede = {
        en: "Buses run with AC on max; dwell times stretch a minute at busy stops.",
        el: "Τα λεωφορεία με A/C στο φουλ· οι χρόνοι παραμονής αυξάνονται ένα λεπτό σε γεμάτες στάσεις.",
      };
    } else {
      headline = {
        en: `A quiet ${weekday.en}.`,
        el: `Μια ήσυχη ${weekday.el}.`,
      };
      lede = {
        en: "Roads moving, skies settled, nothing dramatic on the calendar.",
        el: "Οι δρόμοι κυλούν, ο ουρανός ήρεμος, τίποτα έντονο στο ημερολόγιο.",
      };
    }

    // ─── Tiles — up to 3, picked by relevance ─────────────────────────────
    const tiles: TodayTile[] = [];

    if (fixture) {
      tiles.push({
        kicker: "TONIGHT",
        kickerEl: "ΑΠΟΨΕ",
        title: `${fixture.venue}`,
        titleEl: fixture.venueEl,
        detail: `Routes ${fixture.routes.join(", ")} run busy from 17:30.`,
        detailEl: `Οι γραμμές ${fixture.routes.join(", ")} φορτώνουν από τις 17:30.`,
        accent: "ochre",
      });
    }
    if (festival) {
      tiles.push({
        kicker: "ON NOW",
        kickerEl: "ΣΕ ΕΞΕΛΙΞΗ",
        title: festival.name,
        titleEl: festival.nameEl,
        detail: `${festival.city} — bus to the centre, walk in.`,
        detailEl: `${festival.city === "Limassol" ? "Λεμεσός" : festival.city === "Paphos" ? "Πάφος" : festival.city} — λεωφορείο στο κέντρο και πεζοί.`,
        accent: "aegean",
      });
    }
    if (cruise) {
      tiles.push({
        kicker: "PORT TODAY",
        kickerEl: "ΣΤΟ ΛΙΜΑΝΙ",
        title: cruise.count > 1 ? `${cruise.count} cruise ships` : "Cruise ship docked",
        titleEl: cruise.count > 1 ? `${cruise.count} κρουαζιερόπλοια` : "Κρουαζιερόπλοιο στο λιμάνι",
        detail: "Limassol seafront and old town routes busier from midday.",
        detailEl: "Οι γραμμές της παραλιακής και της παλιάς πόλης Λεμεσού φορτώνουν από το μεσημέρι.",
        accent: "aegean",
      });
    }
    if (holiday) {
      tiles.push({
        kicker: "HOLIDAY",
        kickerEl: "ΑΡΓΙΑ",
        title: holiday.en,
        titleEl: holiday.el,
        detail: "Reduced timetable — check route page before you leave.",
        detailEl: "Μειωμένο πρόγραμμα — δες τη σελίδα της γραμμής πριν φύγεις.",
        accent: "olive",
      });
    }
    if (nd) {
      tiles.push({
        kicker: "NAME DAY",
        kickerEl: "ΟΝΟΜΑΣΤΙΚΗ",
        title: `Chronia Polla ${nd.name}`,
        titleEl: `Χρόνια Πολλά ${nd.nameEl}`,
        detail: nd.scale === "huge" ? "Expect family gatherings — coastal villages busy through evening." : "Wish your friends — and watch dinner-time bus crowds.",
        detailEl: nd.scale === "huge" ? "Οικογενειακά τραπέζια — παραλιακά χωριά φορτωμένα ως αργά." : "Πες χρόνια πολλά στους φίλους σου — προσοχή στις βραδινές γραμμές.",
        accent: "olive",
      });
    }
    if (weather && tiles.length < 3) {
      const beachOk = weather.tempC >= 24 && weather.iconKey === "sun";
      tiles.push({
        kicker: "WEATHER",
        kickerEl: "ΚΑΙΡΟΣ",
        title: `${weather.tempC}°C, ${weather.condition.replace(/_/g, " ").toLowerCase()}`,
        titleEl: `${weather.tempC}°C`,
        detail: beachOk
          ? "Beach index: high. Fig Tree Bay, Konnos and Lady's Mile busy after 10:00."
          : weather.iconKey === "rain"
          ? "Carry an umbrella — buses may dwell longer at sheltered stops."
          : "Comfortable across the island.",
        detailEl: beachOk
          ? "Δείκτης παραλίας: υψηλός. Φυκιά, Κόννος και Lady's Mile γεμάτες μετά τις 10:00."
          : weather.iconKey === "rain"
          ? "Πάρε ομπρέλα — τα λεωφορεία μπορεί να καθυστερούν σε στεγασμένες στάσεις."
          : "Άνετος καιρός σε όλο το νησί.",
        accent: weather.iconKey === "rain" ? "ink" : "ochre",
      });
    }

    // ─── Verdict — one closing sentence ───────────────────────────────────
    const verdict =
      theme === "derby"
        ? { en: "Leave a little earlier if you're crossing town.", el: "Φύγε λίγο πιο νωρίς αν διασχίζεις την πόλη." }
        : theme === "festival"
        ? { en: "Bring a layer — sea breeze drops the temperature after dark.", el: "Πάρε ένα ρούχο μαζί — βραδιάζει με αεράκι από τη θάλασσα." }
        : theme === "holiday"
        ? { en: "Coast for the morning, mountains for the afternoon.", el: "Παραλία το πρωί, βουνό το απόγευμα." }
        : theme === "storm"
        ? { en: "Plan ten extra minutes and you'll arrive dry.", el: "Υπολόγισε δέκα λεπτά παραπάνω και θα φτάσεις στεγνός." }
        : theme === "cruise"
        ? { en: "Skip the seafront route between 14:00 and 17:00 if you can.", el: "Απόφυγε την παραλιακή γραμμή 14:00–17:00 αν μπορείς." }
        : theme === "heatwave"
        ? { en: "Carry water. Buses help, but the walk between stops doesn't.", el: "Πάρε νερό. Το λεωφορείο βοηθά, η απόσταση μεταξύ στάσεων όχι." }
        : { en: "A good day to ride.", el: "Καλή μέρα για να πάρεις λεωφορείο." };

    // ─── Rotating fact ────────────────────────────────────────────────────
    const factPool = facts as Array<{ en: string; el: string; tag: "local" | "tourist" }>;
    const fact = factPool[dayOfYear(d) % factPool.length];

    return {
      generatedAt: Math.floor(Date.now() / 1000),
      theme,
      heroKey: theme,
      date: dateString(d),
      weekday,
      headline,
      lede,
      tiles: tiles.slice(0, 3),
      verdict,
      fact,
    };
  },
);
