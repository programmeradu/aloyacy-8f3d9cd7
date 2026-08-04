// Editorial composition: headline, lede, tiles and verdict for the day.

import type {
  CruiseToday,
  GreekWord,
  TodayBriefing,
  TodayFact,
  TodayFocus,
  TodayTheme,
  TodayTile,
  TodayTileKind,
  Festival,
  Fixture,
  Weather,
} from "./types";
import { WEEKDAY_EN, WEEKDAY_EL, dateString, dayOfYear, seededPick } from "./geo-time";
import { pickTheme, rhythmForDay } from "./signals";

const cityEl = (city: string) =>
  city === "Limassol" ? "Λεμεσός" : city === "Paphos" ? "Πάφος" : city;
const cityElAcc = (city: string) =>
  city === "Limassol" ? "Λεμεσό" : city === "Paphos" ? "Πάφο" : city;
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
