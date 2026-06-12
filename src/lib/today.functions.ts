// Today's editorial briefing — composes weather, fixtures, events, holidays,
// name days, and a rotating fun fact into a single "Cyprus today" payload.
// Public, read-only. Caches via React Query on the client; server-side is
// pure compute (no DB calls), so refetch cost is near zero.

import { createServerFn } from "@tanstack/react-start";
import facts from "@/data/cyprus-facts.json";
import nameDays from "@/data/cyprus-name-days.json";
import events from "@/data/cyprus-events.json";
import greekWords from "@/data/cyprus-greek-words.json";

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
  | "rhythm"
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
  /** Rotating fun fact — rotates every 2 hours. */
  fact: { en: string; el: string; tag: "local" | "tourist" };
  /** Greek word of the day — for visitors learning the language. */
  greekWord: { el: string; translit: string; en: string; meaning: string };
  /** Editorial focus — which city/area this briefing centres on. */
  focus: { city: string; cityEl: string; scope: "island" | "city" | "trip" };
};

export type TodayInput = {
  /** Rider's current coords — used for localised weather. */
  lat?: number;
  lng?: number;
  /** Active trip destination — biases briefing toward the destination city. */
  destLat?: number;
  destLng?: number;
  /** Optional explicit destination city label, e.g. "Limassol". */
  destCity?: string;
};

const CITY_COORDS: Array<{ key: string; el: string; lat: number; lng: number }> = [
  { key: "Nicosia", el: "Λευκωσία", lat: 35.1856, lng: 33.3823 },
  { key: "Limassol", el: "Λεμεσός", lat: 34.7071, lng: 33.0226 },
  { key: "Larnaca", el: "Λάρνακα", lat: 34.9229, lng: 33.6233 },
  { key: "Paphos", el: "Πάφος", lat: 34.7768, lng: 32.4245 },
  { key: "Ayia Napa", el: "Αγία Νάπα", lat: 34.9882, lng: 34.0036 },
  { key: "Paralimni", el: "Παραλίμνι", lat: 35.0382, lng: 33.9728 },
];

function nearestCity(lat: number, lng: number): { key: string; el: string } {
  let best = CITY_COORDS[0];
  let bestD = Infinity;
  for (const c of CITY_COORDS) {
    const dx = c.lat - lat;
    const dy = c.lng - lng;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return { key: best.key, el: best.el };
}

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

async function fetchCyprusWeather(lat = 35.1856, lng = 33.3823): Promise<Weather> {
  try {
    const lk = process.env.LOVABLE_API_KEY;
    const gk = process.env.GOOGLE_MAPS_API_KEY;
    if (!lk || !gk) return null;
    const url =
      `https://connector-gateway.lovable.dev/google_maps/weather/v1/currentConditions:lookup?location.latitude=${lat}&location.longitude=${lng}&unitsSystem=METRIC&languageCode=en`;
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

function isLikelyMatchday(
  d: Date,
  preferCity?: string,
): { venue: string; venueEl: string; city: string; cityEl: string; routes: string[] } | null {
  const dow = d.getUTCDay();
  const seed = dayOfYear(d);
  const isWeekendNight = dow === 0 || dow === 6;
  const isMidweek = dow === 2 || dow === 3;
  if (!isWeekendNight && !isMidweek) return null;
  const threshold = isWeekendNight ? 60 : 25;
  const score = (seed * 9301 + 49297) % 100;
  if (score >= threshold) return null;
  const venues = events.fixturesPattern.venues;
  const biased = preferCity ? venues.find((v) => v.city === preferCity) : undefined;
  const venue = biased ?? seededPick(venues, seed);
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

// Cruise schedule — read the real Limassol port-calls feed from pulse_signals
// (populated by /api/public/hooks/pulse-cruises). Returns null when the feed
// is stale or reports zero ships, so the home page never invents a cruise day.
type CruiseToday = { count: number; summary: string | null; totalPassengers: number | null } | null;

async function cruiseInPortLive(): Promise<CruiseToday> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("pulse_signals")
      .select("payload, fetched_at, ttl_seconds")
      .eq("key", "cruises")
      .eq("scope", "port-limassol")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const ttlMs = (Number(data.ttl_seconds) || 86_400) * 1000;
    if (Date.now() - Date.parse(data.fetched_at as string) > ttlMs) return null;
    const p = (data.payload ?? {}) as { count?: number; summary?: string; totalPassengers?: number };
    const count = Number(p.count) || 0;
    if (count <= 0) return null;
    return {
      count,
      summary: typeof p.summary === "string" ? p.summary : null,
      totalPassengers: typeof p.totalPassengers === "number" ? p.totalPassengers : null,
    };
  } catch {
    return null;
  }
}

// Weekday rhythm — a stock "what normally happens around now" note per
// (weekday × city). Used as a fallback tile when no event/festival/cruise/
// holiday is on, so the briefing never feels empty for the rider's city.
function rhythmForDay(dow: number, city: string): TodayTile | null {
  const C = (city in RHYTHM ? city : "Cyprus") as keyof typeof RHYTHM;
  const note = RHYTHM[C][dow];
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

type RhythmNote = { title: string; titleEl: string; detail: string; detailEl: string };
const RHYTHM: Record<string, Record<number, RhythmNote>> = {
  Nicosia: {
    0: { title: "Sunday slow-down", titleEl: "Κυριακάτικος ρυθμός", detail: "Old town quiet until lunch; Ledra Street fills after 17:00 as families walk in.", detailEl: "Παλιά πόλη ήσυχη μέχρι το μεσημέρι· η Λήδρας γεμίζει μετά τις 17:00." },
    1: { title: "Office Monday", titleEl: "Δευτέρα γραφείων", detail: "Routes 158 and 259 heaviest 07:30–08:30 and 16:30–18:00 around the ministries.", detailEl: "Οι γραμμές 158 και 259 φορτώνουν 07:30–08:30 και 16:30–18:00 γύρω από τα υπουργεία." },
    2: { title: "Market morning", titleEl: "Πρωινό λαϊκής", detail: "Ochi Square farmers' stalls bring foot traffic 08:00–13:00. Park-and-ride from Pallouriotissa.", detailEl: "Πάγκοι παραγωγών στην Πλατεία Ελευθερίας 08:00–13:00." },
    3: { title: "Midweek calm", titleEl: "Μεσοβδόμαδη ηρεμία", detail: "Steady all day. Cafés around Faneromeni busy after 19:00 — bus 158 still the smoothest in.", detailEl: "Σταθερή κίνηση. Καφέ γύρω από τη Φανερωμένη μετά τις 19:00." },
    4: { title: "Thursday students", titleEl: "Πέμπτη φοιτητών", detail: "UCY and EUC let out around 14:00 — expect crowded 121 and 138 across the river.", detailEl: "Πανεπιστήμιο και ΕΠΛ σχολούν 14:00 — φορτωμένες οι 121 και 138." },
    5: { title: "Friday night out", titleEl: "Παρασκευή έξω", detail: "Old town tavernas fill from 20:00. Last city buses thin out — plan the return by 22:30.", detailEl: "Ταβέρνες στην παλιά πόλη γεμάτες από 20:00. Τελευταία αστικά μετά τις 22:30." },
    6: { title: "Saturday brunch", titleEl: "Σαββατιάτικο brunch", detail: "Strovolos and Engomi cafés rammed 10:00–13:00. Centre quieter than weekdays.", detailEl: "Καφέ σε Στρόβολο και Έγκωμη γεμάτα 10:00–13:00." },
  },
  Limassol: {
    0: { title: "Beach Sunday", titleEl: "Παραλιακή Κυριακή", detail: "Lady's Mile and Dasoudi packed from 10:00. Seafront route 30 doubles its load by noon.", detailEl: "Lady's Mile και Δασούδι γεμάτα από 10:00." },
    1: { title: "Port Monday", titleEl: "Δευτέρα στο λιμάνι", detail: "Old port quiet by morning; new marina lunch rush 12:30–14:00.", detailEl: "Παλιό λιμάνι ήσυχο το πρωί· νέα μαρίνα γεμάτη 12:30–14:00." },
    2: { title: "Midweek waterfront", titleEl: "Μεσοβδόμαδη παραλιακή", detail: "Promenade joggers at sunrise; tourist coaches block the seafront 11:00–13:00.", detailEl: "Δρομείς στην παραλιακή με την ανατολή· τουριστικά πούλμαν 11:00–13:00." },
    3: { title: "Quiet midweek", titleEl: "Ήσυχη μεσοβδόμαδη", detail: "Routes flow well all day — the easiest Limassol day to get around.", detailEl: "Όλες οι γραμμές κυλούν — η πιο εύκολη μέρα." },
    4: { title: "Pre-weekend", titleEl: "Παραμονή Σαββατοκύριακου", detail: "Bar street fills early — by 21:00 the old town walking is faster than driving.", detailEl: "Στενά μπαρ γεμάτα νωρίς — μετά τις 21:00 το περπάτημα νικά το αυτοκίνητο." },
    5: { title: "Friday seafront", titleEl: "Παρασκευή στην παραλιακή", detail: "Marina restaurants fully booked 20:00 onwards. Park near Molos and walk.", detailEl: "Εστιατόρια στη μαρίνα γεμάτα από 20:00. Πάρκαρε στον Μόλο και πεζός." },
    6: { title: "Saturday crowd", titleEl: "Σαββατιάτικη συγκέντρωση", detail: "Old port to castle is one slow stream of strollers between 18:00 and 23:00.", detailEl: "Από το παλιό λιμάνι ως το κάστρο ένα συνεχές ρεύμα κόσμου 18:00–23:00." },
  },
  Larnaca: {
    0: { title: "Sunday salt lake", titleEl: "Κυριακή στην αλυκή", detail: "Promenade Phinikoudes busy 10:00–14:00, then quiet again until sunset.", detailEl: "Φοινικούδες γεμάτες 10:00–14:00." },
    1: { title: "Airport Monday", titleEl: "Αεροδρόμιο Δευτέρα", detail: "Shuttles to LCA peak 05:30–07:00 and 18:00–20:00. Route 425 best for early flights.", detailEl: "Σαττλ προς αεροδρόμιο 05:30–07:00 και 18:00–20:00." },
    2: 	{ title: "Calm midweek", titleEl: "Ήσυχη μεσοβδόμαδη", detail: "Town quiet, beachfront cafés open. Good day for the Hala Sultan walk.", detailEl: "Ήσυχη πόλη, καφέ στην παραλία ανοιχτά." },
    3: { title: "Wednesday old town", titleEl: "Τετάρτη στην παλιά πόλη", detail: "Laiki Geitonia tavernas fill from 19:30 — Mackenzie buses run late.", detailEl: "Ταβέρνες στη Λαϊκή Γειτονιά γεμάτες από 19:30." },
    4: { title: "Pre-weekend ramp", titleEl: "Προς το Σαββατοκύριακο", detail: "Phinikoudes promenade busy after 18:00. Bus 421 the smoothest into town.", detailEl: "Φοινικούδες γεμάτες μετά τις 18:00." },
    5: { title: "Friday Mackenzie", titleEl: "Παρασκευή στο Μακένζι", detail: "Beach bars from 20:00 onwards. Last buses out before midnight.", detailEl: "Beach bars στο Μακένζι από 20:00." },
    6: { title: "Saturday seafront", titleEl: "Σαββατιάτικη παραλιακή", detail: "Promenade and marina full sunrise to late. Parking impossible after 11:00.", detailEl: "Φοινικούδες και μαρίνα γεμάτες όλη μέρα." },
  },
  Paphos: {
    0: { title: "Sunday harbour", titleEl: "Κυριακή στο λιμάνι", detail: "Kato Paphos harbour packed 11:00–15:00. Castle photo crowd peaks at sunset.", detailEl: "Λιμάνι Κάτω Πάφου γεμάτο 11:00–15:00." },
    1: { title: "Mosaics Monday", titleEl: "Δευτέρα ψηφιδωτών", detail: "Archaeological park opens 08:30. Tourist buses dominate the harbour road by 10:00.", detailEl: "Αρχαιολογικό πάρκο ανοίγει 08:30." },
    2: { title: "Akamas midweek", titleEl: "Ακάμας μεσοβδόμαδα", detail: "Quietest day for Aphrodite's Baths trips — bus 622 runs comfortably.", detailEl: "Πιο ήσυχη μέρα για Λουτρά Αφροδίτης." },
    3: { title: "Old town quiet", titleEl: "Ήσυχη παλιά πόλη", detail: "Pano Paphos cafés relaxed all afternoon. Good day for the agora.", detailEl: "Καφέ στην Άνω Πάφο χαλαρά όλο το απόγευμα." },
    4: { title: "Thursday tavernas", titleEl: "Πέμπτη ταβέρνες", detail: "Geroskipou meze nights from 20:00 — book a table by 19:00.", detailEl: "Μεζεδοπωλεία Γεροσκήπου από 20:00." },
    5: { title: "Friday harbour", titleEl: "Παρασκευή στο λιμάνι", detail: "Cocktail bars by the castle fill from 21:00. Last harbour buses around 23:00.", detailEl: "Bars δίπλα στο κάστρο γεμάτα από 21:00." },
    6: { title: "Saturday Coral Bay", titleEl: "Σαββατιάτικος Κόλπος Κοραλλίων", detail: "Bus 615 packed all morning — go early or wait it out until 16:00.", detailEl: "Γραμμή 615 γεμάτη όλο το πρωί." },
  },
  Cyprus: {
    0: { title: "Sunday seaside", titleEl: "Κυριακάτικη παραλία", detail: "Coastal routes busiest, mountain villages emptiest. Bring a swim and a snack.", detailEl: "Παραλιακές γραμμές γεμάτες, ορεινά χωριά άδεια." },
    1: { title: "Monday commute", titleEl: "Δευτέρα στη δουλειά", detail: "Intercity buses peak 06:30–08:30. Quiet again after 09:30.", detailEl: "Υπεραστικά γεμάτα 06:30–08:30." },
    2: { title: "Midweek calm", titleEl: "Ήσυχη μεσοβδόμαδη", detail: "Roads moving, sky settled. A good day for a Troodos detour.", detailEl: "Καλή μέρα για μια απόδραση στον Τρόοδος." },
    3: { title: "Quiet Wednesday", titleEl: "Ήσυχη Τετάρτη", detail: "Everything flowing. Tourist sites at their most relaxed.", detailEl: "Όλα κυλούν. Τουριστικά μέρη χαλαρά." },
    4: { title: "Thursday warm-up", titleEl: "Πέμπτη με ζεστασιά", detail: "City centres pick up after 18:00 as the weekend draws near.", detailEl: "Κέντρα πόλεων ζωντανεύουν μετά τις 18:00." },
    5: { title: "Friday night", titleEl: "Παρασκευή βράδυ", detail: "Bars and tavernas across the island full from 20:00 onwards.", detailEl: "Μπαρ και ταβέρνες παντού γεμάτες από 20:00." },
    6: { title: "Saturday rush", titleEl: "Σαββατιάτικη φόρα", detail: "Beaches, markets and tavernas peak. Parking premium near the coast.", detailEl: "Παραλίες, αγορές, ταβέρνες στο φουλ." },
  },
};

export const getTodayBriefing = createServerFn({ method: "GET" })
  .inputValidator((data: TodayInput | undefined): TodayInput => {
    const v = data ?? {};
    const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : undefined);
    return {
      lat: num(v.lat),
      lng: num(v.lng),
      destLat: num(v.destLat),
      destLng: num(v.destLng),
      destCity:
        typeof v.destCity === "string" && v.destCity.length > 0 && v.destCity.length < 64
          ? v.destCity
          : undefined,
    };
  })
  .handler(async ({ data }): Promise<TodayBriefing> => {
    const d = cyprusNow();

    // Resolve focus: trip destination > rider location > island default.
    let focus: TodayBriefing["focus"] = { city: "Cyprus", cityEl: "Κύπρος", scope: "island" };
    let wxLat = 35.1856;
    let wxLng = 33.3823;
    if (data.destCity) {
      const c = CITY_COORDS.find((x) => x.key === data.destCity) ?? CITY_COORDS[0];
      focus = { city: c.key, cityEl: c.el, scope: "trip" };
      wxLat = data.destLat ?? c.lat;
      wxLng = data.destLng ?? c.lng;
    } else if (data.destLat != null && data.destLng != null) {
      const c = nearestCity(data.destLat, data.destLng);
      focus = { city: c.key, cityEl: c.el, scope: "trip" };
      wxLat = data.destLat;
      wxLng = data.destLng;
    } else if (data.lat != null && data.lng != null) {
      const c = nearestCity(data.lat, data.lng);
      focus = { city: c.key, cityEl: c.el, scope: "city" };
      wxLat = data.lat;
      wxLng = data.lng;
    }

    const weather = await fetchCyprusWeather(wxLat, wxLng);
    const weekday = { en: WEEKDAY_EN[d.getUTCDay()], el: WEEKDAY_EL[d.getUTCDay()] };

    // ─── Rank signals into a single theme ─────────────────────────────────
    const holiday = publicHoliday(d);
    const nd = nameDayToday(d);
    const festival = activeFestival(d);
    const fixture = isLikelyMatchday(d, focus.scope !== "island" ? focus.city : undefined);
    const cruise = await cruiseInPortLive();
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
        en: cruise.count > 1 ? `${cruise.count} ships in Limassol port.` : "Cruise day in Limassol.",
        el: cruise.count > 1 ? `${cruise.count} πλοία στο λιμάνι της Λεμεσού.` : "Μέρα κρουαζιέρας στη Λεμεσό.",
      };
      lede = {
        en: cruise.summary ?? "Old town and seafront buses run busier than usual through the afternoon.",
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
        kind: "match",
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
        kind: "festival",
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
        kind: "cruise",
        kicker: "PORT TODAY",
        kickerEl: "ΣΤΟ ΛΙΜΑΝΙ",
        title: cruise.count > 1 ? `${cruise.count} cruise ships` : "Cruise ship docked",
        titleEl: cruise.count > 1 ? `${cruise.count} κρουαζιερόπλοια` : "Κρουαζιερόπλοιο στο λιμάνι",
        detail: cruise.summary ?? "Limassol seafront and old town routes busier from midday.",
        detailEl: "Οι γραμμές της παραλιακής και της παλιάς πόλης Λεμεσού φορτώνουν από το μεσημέρι.",
        accent: "aegean",
      });
    }
    if (holiday) {
      tiles.push({
        kind: "holiday",
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
        kind: "nameday",
        kicker: "NAME DAY",
        kickerEl: "ΟΝΟΜΑΣΤΙΚΗ",
        title: `Chronia Polla ${nd.name}`,
        titleEl: `Χρόνια Πολλά ${nd.nameEl}`,
        detail: nd.scale === "huge" ? "Expect family gatherings — coastal villages busy through evening." : "Wish your friends — and watch dinner-time bus crowds.",
        detailEl: nd.scale === "huge" ? "Οικογενειακά τραπέζια — παραλιακά χωριά φορτωμένα ως αργά." : "Πες χρόνια πολλά στους φίλους σου — προσοχή στις βραδινές γραμμές.",
        accent: "olive",
      });
    }

    // ─── Rhythm of the day — weekday × city pattern, always relevant ──────
    if (tiles.length < 3 && !fixture && !festival && !cruise && !holiday) {
      const rhythm = rhythmForDay(d.getUTCDay(), focus.city);
      if (rhythm) tiles.push(rhythm);
    }

    if (weather && tiles.length < 3) {
      const beachOk = weather.tempC >= 24 && weather.iconKey === "sun";
      const wKind: TodayTileKind =
        weather.iconKey === "rain" || weather.iconKey === "storm"
          ? "weather-rain"
          : weather.iconKey === "cloud"
          ? "weather-cloud"
          : "weather-sun";
      tiles.push({
        kind: wKind,
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

    // ─── Rotating fact — refreshes every 2 hours ──────────────────────────
    const factPool = facts as Array<{ en: string; el: string; tag: "local" | "tourist" }>;
    const twoHourSlot = dayOfYear(d) * 12 + Math.floor(d.getUTCHours() / 2);
    const fact = factPool[Math.abs(twoHourSlot) % factPool.length];

    // ─── Greek word of the day — rotates daily ────────────────────────────
    const wordPool = greekWords as Array<{ el: string; translit: string; en: string; meaning: string }>;
    const greekWord = wordPool[dayOfYear(d) % wordPool.length];

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
      greekWord,
      focus,
    };
  });
