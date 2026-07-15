// Pure composition of the "Cyprus today" editorial briefing.
//
// Every function here is deterministic: date in, copy out. All live signals
// (weather, cruise calls, event feeds) are fetched by the caller and passed
// in, so this module is fully testable without network or database access.

import { RHYTHM } from "./today-rhythm";

export type TodayTheme =
  "derby" | "festival" | "holiday" | "cruise" | "heatwave" | "storm" | "calm";

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

export type TodayFocus = { city: string; cityEl: string; scope: "island" | "city" | "trip" };

export type TodayFact = { en: string; el: string; tag: "local" | "tourist" };
export type GreekWord = { el: string; translit: string; en: string; meaning: string };

export type TodayBriefing = {
  generatedAt: number;
  theme: TodayTheme;
  /** Hand-painted gouache hero key — pick from src/assets/today-{theme}.jpg */
  heroKey: TodayTheme;
  /** ISO local Cyprus date, YYYY-MM-DD. */
  date: string;
  weekday: { en: string; el: string };
  headline: { en: string; el: string };
  lede: { en: string; el: string };
  tiles: TodayTile[];
  verdict: { en: string; el: string };
  fact: TodayFact;
  greekWord: GreekWord;
  focus: TodayFocus;
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

export type Weather = { tempC: number; condition: string; iconKey: string } | null;
export type CruiseToday = {
  count: number;
  summary: string | null;
  totalPassengers: number | null;
} | null;
export type Fixture = {
  venue: string;
  venueEl: string;
  city: string;
  cityEl: string;
  routes: string[];
};
export type Festival = { name: string; nameEl: string; city: string };

export const CITY_COORDS: Array<{ key: string; el: string; lat: number; lng: number }> = [
  { key: "Nicosia", el: "Λευκωσία", lat: 35.1856, lng: 33.3823 },
  { key: "Limassol", el: "Λεμεσός", lat: 34.7071, lng: 33.0226 },
  { key: "Larnaca", el: "Λάρνακα", lat: 34.9229, lng: 33.6233 },
  { key: "Paphos", el: "Πάφος", lat: 34.7768, lng: 32.4245 },
  { key: "Ayia Napa", el: "Αγία Νάπα", lat: 34.9882, lng: 34.0036 },
  { key: "Paralimni", el: "Παραλίμνι", lat: 35.0382, lng: 33.9728 },
];

export const WEEKDAY_EN = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export const WEEKDAY_EL = [
  "Κυριακή",
  "Δευτέρα",
  "Τρίτη",
  "Τετάρτη",
  "Πέμπτη",
  "Παρασκευή",
  "Σάββατο",
];

export function nearestCity(lat: number, lng: number): { key: string; el: string } {
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

/** Wall-clock Cyprus time expressed in UTC fields (EET/EEST aware). */
export function cyprusNow(now: Date = new Date()): Date {
  const y = now.getUTCFullYear();
  const lastSunday = (m: number) => {
    const last = new Date(Date.UTC(y, m + 1, 0));
    return new Date(Date.UTC(y, m, last.getUTCDate() - last.getUTCDay()));
  };
  const inDst = now >= lastSunday(2) && now < lastSunday(9);
  const offsetMin = inDst ? 180 : 120;
  return new Date(now.getTime() + offsetMin * 60_000);
}

export function dayKey(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

export function dateString(d: Date): string {
  return `${d.getUTCFullYear()}-${dayKey(d)}`;
}

export function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86_400_000);
}

/** Deterministic but varied choice, keyed by the date so it is stable per day. */
export function seededPick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

/** Maps a Google weather condition code to our icon vocabulary. */
export function weatherIconKey(code: string): "sun" | "rain" | "cloud" | "storm" {
  const c = (code ?? "").toUpperCase();
  if (c.includes("THUNDER")) return "storm";
  if (c.includes("RAIN") || c.includes("SHOWER") || c.includes("DRIZZLE")) return "rain";
  if (c.includes("CLOUD")) return "cloud";
  return "sun";
}

export function resolveFocus(input: TodayInput): {
  focus: TodayFocus;
  wxLat: number;
  wxLng: number;
} {
  if (input.destCity) {
    const c = CITY_COORDS.find((x) => x.key === input.destCity) ?? CITY_COORDS[0];
    return {
      focus: { city: c.key, cityEl: c.el, scope: "trip" },
      wxLat: input.destLat ?? c.lat,
      wxLng: input.destLng ?? c.lng,
    };
  }
  if (input.destLat != null && input.destLng != null) {
    const c = nearestCity(input.destLat, input.destLng);
    return {
      focus: { city: c.key, cityEl: c.el, scope: "trip" },
      wxLat: input.destLat,
      wxLng: input.destLng,
    };
  }
  if (input.lat != null && input.lng != null) {
    const c = nearestCity(input.lat, input.lng);
    return {
      focus: { city: c.key, cityEl: c.el, scope: "city" },
      wxLat: input.lat,
      wxLng: input.lng,
    };
  }
  return {
    focus: { city: "Cyprus", cityEl: "Κύπρος", scope: "island" },
    wxLat: 35.1856,
    wxLng: 33.3823,
  };
}

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

export type ComposeArgs = {
  /** Cyprus wall-clock date (UTC fields already shifted). */
  date: Date;
  focus: TodayFocus;
  weather: Weather;
  fixture: Fixture | null;
  festival: Festival | null;
  holiday: { en: string; el: string } | null;
  nameDay: { name: string; nameEl: string; scale: string } | null;
  cruise: CruiseToday;
  facts: TodayFact[];
  greekWords: GreekWord[];
  /** Epoch seconds stamped on the payload; defaults to now. */
  generatedAt?: number;
};

export function composeTodayBriefing(args: ComposeArgs): TodayBriefing {
  const { date: d, focus, weather, fixture, festival, holiday, nameDay: nd, cruise } = args;
  const weekday = { en: WEEKDAY_EN[d.getUTCDay()], el: WEEKDAY_EL[d.getUTCDay()] };
  const theme = pickTheme({ fixture, festival, holiday, cruise, weather });

  let headline = { en: "", el: "" };
  let lede = { en: "", el: "" };

  if (theme === "derby" && fixture) {
    headline = { en: `Matchnight in ${fixture.city}.`, el: `Βραδιά αγώνα στη ${fixture.cityEl}.` };
    lede = {
      en: `Expect ${fixture.venue} traffic from 17:30. Routes ${fixture.routes.join(" and ")} run heavy.`,
      el: `Κίνηση στο ${fixture.venueEl} από τις 17:30. Οι γραμμές ${fixture.routes.join(" και ")} φορτώνουν.`,
    };
  } else if (theme === "festival" && festival) {
    headline = {
      en: `${festival.name} is on in ${festival.city}.`,
      el: `${festival.nameEl} στη ${cityElAcc(festival.city)}.`,
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
      en: "Roads are slick — buses may slow on the Troodos descent and Limassol motorway.",
      el: "Οι δρόμοι γλιστρούν — τα λεωφορεία μπορεί να αργήσουν στην κάθοδο του Τροόδους και στον αυτοκινητόδρομο Λεμεσού.",
    };
  } else if (theme === "cruise" && cruise) {
    headline = {
      en: cruise.count > 1 ? `${cruise.count} ships in Limassol port.` : "Cruise day in Limassol.",
      el:
        cruise.count > 1
          ? `${cruise.count} πλοία στο λιμάνι της Λεμεσού.`
          : "Μέρα κρουαζιέρας στη Λεμεσό.",
    };
    lede = {
      en:
        cruise.summary ??
        "Old town and seafront buses run busier than usual through the afternoon.",
      el: "Τα λεωφορεία στην παλιά πόλη και στην παραλιακή φορτώνουν περισσότερο τα απογεύματα.",
    };
  } else if (theme === "heatwave" && weather) {
    headline = { en: `Hot one — ${weather.tempC}°C.`, el: `Ζέστη σήμερα — ${weather.tempC}°C.` };
    lede = {
      en: "Buses run with AC on max; dwell times stretch a minute at busy stops.",
      el: "Τα λεωφορεία με A/C στο φουλ· οι χρόνοι παραμονής αυξάνονται ένα λεπτό σε γεμάτες στάσεις.",
    };
  } else {
    headline = { en: `A quiet ${weekday.en}.`, el: `Μια ήσυχη ${weekday.el}.` };
    lede = {
      en: "Roads moving, skies settled, nothing dramatic on the calendar.",
      el: "Οι δρόμοι κυλούν, ο ουρανός ήρεμος, τίποτα έντονο στο ημερολόγιο.",
    };
  }

  const tiles: TodayTile[] = [];

  if (fixture) {
    tiles.push({
      kind: "match",
      kicker: "TONIGHT",
      kickerEl: "ΑΠΟΨΕ",
      title: fixture.venue,
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
      detailEl: `${cityEl(festival.city)} — λεωφορείο στο κέντρο και πεζοί.`,
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
      detail:
        nd.scale === "huge"
          ? "Expect family gatherings — coastal villages busy through evening."
          : "Wish your friends — and watch dinner-time bus crowds.",
      detailEl:
        nd.scale === "huge"
          ? "Οικογενειακά τραπέζια — παραλιακά χωριά φορτωμένα ως αργά."
          : "Πες χρόνια πολλά στους φίλους σου — προσοχή στις βραδινές γραμμές.",
      accent: "olive",
    });
  }

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

  const verdict = VERDICTS[theme];

  const twoHourSlot = dayOfYear(d) * 12 + Math.floor(d.getUTCHours() / 2);
  const fact = seededPick(args.facts, twoHourSlot);
  const greekWord = seededPick(args.greekWords, dayOfYear(d));

  return {
    generatedAt: args.generatedAt ?? Math.floor(Date.now() / 1000),
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
}

const VERDICTS: Record<TodayTheme, { en: string; el: string }> = {
  derby: {
    en: "Leave a little earlier if you're crossing town.",
    el: "Φύγε λίγο πιο νωρίς αν διασχίζεις την πόλη.",
  },
  festival: {
    en: "Bring a layer — sea breeze drops the temperature after dark.",
    el: "Πάρε ένα ρούχο μαζί — βραδιάζει με αεράκι από τη θάλασσα.",
  },
  holiday: {
    en: "Coast for the morning, mountains for the afternoon.",
    el: "Παραλία το πρωί, βουνό το απόγευμα.",
  },
  storm: {
    en: "Plan ten extra minutes and you'll arrive dry.",
    el: "Υπολόγισε δέκα λεπτά παραπάνω και θα φτάσεις στεγνός.",
  },
  cruise: {
    en: "Skip the seafront route between 14:00 and 17:00 if you can.",
    el: "Απόφυγε την παραλιακή γραμμή 14:00–17:00 αν μπορείς.",
  },
  heatwave: {
    en: "Carry water. Buses help, but the walk between stops doesn't.",
    el: "Πάρε νερό. Το λεωφορείο βοηθά, η απόσταση μεταξύ στάσεων όχι.",
  },
  calm: { en: "A good day to ride.", el: "Καλή μέρα για να πάρεις λεωφορείο." },
};
