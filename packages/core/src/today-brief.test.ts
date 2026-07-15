import { describe, expect, it } from "vitest";
import {
  composeTodayBriefing,
  cyprusNow,
  dateString,
  dayKey,
  dayOfYear,
  lookupByDay,
  nearestCity,
  normaliseCity,
  pickLiveEvent,
  pickTheme,
  resolveFocus,
  rhythmForDay,
  seededPick,
  selectFestival,
  selectMatchday,
  weatherIconKey,
  type ComposeArgs,
  type VenuePattern,
} from "./today-brief";

const FACTS = [
  { en: "fact-a", el: "γεγονός-α", tag: "local" as const },
  { en: "fact-b", el: "γεγονός-β", tag: "tourist" as const },
];
const WORDS = [{ el: "καλημέρα", translit: "kalimera", en: "good morning", meaning: "greeting" }];

function base(over: Partial<ComposeArgs> = {}): ComposeArgs {
  return {
    date: new Date(Date.UTC(2026, 4, 13, 10, 0, 0)), // Wednesday
    focus: { city: "Nicosia", cityEl: "Λευκωσία", scope: "city" },
    weather: null,
    fixture: null,
    festival: null,
    holiday: null,
    nameDay: null,
    cruise: null,
    facts: FACTS,
    greekWords: WORDS,
    generatedAt: 1_700_000_000,
    ...over,
  };
}

describe("date helpers", () => {
  it("shifts to EEST in summer and EET in winter", () => {
    const summer = cyprusNow(new Date(Date.UTC(2026, 6, 1, 0, 0, 0)));
    expect(summer.getUTCHours()).toBe(3);
    const winter = cyprusNow(new Date(Date.UTC(2026, 0, 1, 0, 0, 0)));
    expect(winter.getUTCHours()).toBe(2);
  });

  it("formats day and date keys zero-padded", () => {
    const d = new Date(Date.UTC(2026, 0, 5));
    expect(dayKey(d)).toBe("01-05");
    expect(dateString(d)).toBe("2026-01-05");
    expect(dayOfYear(d)).toBe(5);
  });

  it("picks deterministically and tolerates negative seeds", () => {
    expect(seededPick([1, 2, 3], 4)).toBe(2);
    expect(seededPick([1, 2, 3], -4)).toBe(2);
  });

  it("looks entries up by month-day", () => {
    expect(lookupByDay(new Date(Date.UTC(2026, 0, 5)), { "01-05": "hit" })).toBe("hit");
    expect(lookupByDay(new Date(Date.UTC(2026, 0, 6)), { "01-05": "hit" })).toBeNull();
  });
});

describe("focus resolution", () => {
  it("prefers an explicit destination city", () => {
    const { focus, wxLat } = resolveFocus({ destCity: "Limassol" });
    expect(focus).toEqual({ city: "Limassol", cityEl: "Λεμεσός", scope: "trip" });
    expect(wxLat).toBeCloseTo(34.7071, 3);
  });

  it("falls back to nearest city for destination coords, then rider coords", () => {
    expect(resolveFocus({ destLat: 34.92, destLng: 33.62 }).focus).toMatchObject({
      city: "Larnaca",
      scope: "trip",
    });
    expect(resolveFocus({ lat: 34.78, lng: 32.42 }).focus).toMatchObject({
      city: "Paphos",
      scope: "city",
    });
  });

  it("defaults to island scope with Nicosia weather", () => {
    const { focus, wxLat, wxLng } = resolveFocus({});
    expect(focus.scope).toBe("island");
    expect(wxLat).toBeCloseTo(35.1856, 3);
    expect(wxLng).toBeCloseTo(33.3823, 3);
  });

  it("finds the nearest known city", () => {
    expect(nearestCity(35.0, 33.4).key).toBe("Nicosia");
  });
});

describe("signal selection", () => {
  const venues: VenuePattern[] = [
    { name: "GSP", nameEl: "ΓΣΠ", city: "Nicosia", routeIds: ["158"] },
    { name: "Alphamega", nameEl: "Αλφαμέγκα", city: "Limassol", routeIds: ["30"] },
  ];

  it("never reports a match on a Monday", () => {
    const monday = new Date(Date.UTC(2026, 4, 11));
    expect(selectMatchday(monday, venues)).toBeNull();
  });

  it("returns null when there are no venues", () => {
    expect(selectMatchday(new Date(Date.UTC(2026, 4, 16)), [])).toBeNull();
  });

  it("biases the venue to the rider's city when a match is on", () => {
    // Scan weekend days until the heuristic fires, then assert the bias.
    let hit = null as ReturnType<typeof selectMatchday>;
    for (let day = 1; day <= 28 && !hit; day++) {
      const d = new Date(Date.UTC(2026, 4, day));
      hit = selectMatchday(d, venues, "Limassol");
    }
    expect(hit).not.toBeNull();
    expect(hit!.city).toBe("Limassol");
    expect(hit!.cityEl).toBe("Λεμεσός");
  });

  it("matches festivals by month and week rule", () => {
    const recurring = [
      { name: "Wine", nameEl: "Κρασί", city: "Limassol", month: 9, weekRule: "late-month" },
      { name: "May", nameEl: "Μάης", city: "Paphos", month: 5, weekRule: "all-month" },
    ];
    expect(selectFestival(new Date(Date.UTC(2026, 4, 13)), recurring)?.name).toBe("May");
    expect(selectFestival(new Date(Date.UTC(2026, 8, 3)), recurring)).toBeNull();
    expect(selectFestival(new Date(Date.UTC(2026, 8, 25)), recurring)?.name).toBe("Wine");
    expect(selectFestival(new Date(Date.UTC(2026, 1, 3)), recurring)).toBeNull();
  });

  it("normalises city names across languages", () => {
    expect(normaliseCity("Λεμεσός")).toBe("Limassol");
    expect(normaliseCity("PAFOS")).toBe("Paphos");
    expect(normaliseCity("Ayia Napa")).toBe("Famagusta");
    expect(normaliseCity(null)).toBeNull();
    expect(normaliseCity("Berlin")).toBeNull();
  });

  it("picks only live feed events covering today, preferring the rider's city", () => {
    const d = new Date(Date.UTC(2026, 4, 13));
    const feed = [
      { title: "Past", city: "Nicosia", startDate: "2026-05-01", endDate: "2026-05-02" },
      { title: "Island wide", city: "Nicosia", startDate: "2026-05-10", endDate: "2026-05-20" },
      { title: "Limassol nights", city: "Λεμεσός", startDate: "2026-05-13", endDate: null },
    ];
    expect(pickLiveEvent(d, feed)?.name).toBe("Island wide");
    expect(pickLiveEvent(d, feed, "Limassol")?.name).toBe("Limassol nights");
    expect(pickLiveEvent(d, [])).toBeNull();
    expect(pickLiveEvent(d, [{ title: "No date" }])).toBeNull();
    expect(
      pickLiveEvent(d, [{ title: "   ", city: "Nicosia", startDate: "2026-05-13" }]),
    ).toBeNull();
  });

  it("classifies weather codes", () => {
    expect(weatherIconKey("THUNDERSTORM")).toBe("storm");
    expect(weatherIconKey("light_drizzle")).toBe("rain");
    expect(weatherIconKey("PARTLY_CLOUDY")).toBe("cloud");
    expect(weatherIconKey("CLEAR")).toBe("sun");
  });

  it("returns a rhythm note per weekday, falling back to the island set", () => {
    expect(rhythmForDay(3, "Nicosia")?.kicker).toBe("ON A WED");
    expect(rhythmForDay(3, "Kakopetria")).not.toBeNull();
  });
});

describe("theme ranking", () => {
  const none = { fixture: null, festival: null, holiday: null, cruise: null, weather: null };

  it("ranks fixture over everything else", () => {
    expect(
      pickTheme({
        ...none,
        fixture: { venue: "GSP", venueEl: "ΓΣΠ", city: "Nicosia", cityEl: "Λ", routes: [] },
        holiday: { en: "X", el: "Χ" },
      }),
    ).toBe("derby");
  });

  it("ranks storm above cruise and heat", () => {
    expect(
      pickTheme({
        ...none,
        weather: { tempC: 38, condition: "RAIN", iconKey: "rain" },
        cruise: { count: 2, summary: null, totalPassengers: null },
      }),
    ).toBe("storm");
  });

  it("falls through cruise, heatwave, calm", () => {
    expect(pickTheme({ ...none, cruise: { count: 1, summary: null, totalPassengers: null } })).toBe(
      "cruise",
    );
    expect(pickTheme({ ...none, weather: { tempC: 36, condition: "CLEAR", iconKey: "sun" } })).toBe(
      "heatwave",
    );
    expect(pickTheme(none)).toBe("calm");
  });
});

describe("composeTodayBriefing", () => {
  it("produces a calm briefing with a rhythm tile when nothing is on", () => {
    const b = composeTodayBriefing(base());
    expect(b.theme).toBe("calm");
    expect(b.heroKey).toBe("calm");
    expect(b.date).toBe("2026-05-13");
    expect(b.weekday.en).toBe("Wednesday");
    expect(b.headline.en).toBe("A quiet Wednesday.");
    expect(b.tiles.map((t) => t.kind)).toContain("rhythm");
    expect(b.verdict.en).toBe("A good day to ride.");
    expect(b.generatedAt).toBe(1_700_000_000);
  });

  it("leads with the fixture and lists its routes", () => {
    const b = composeTodayBriefing(
      base({
        fixture: {
          venue: "GSP Stadium",
          venueEl: "ΓΣΠ",
          city: "Nicosia",
          cityEl: "Λευκωσία",
          routes: ["158", "259"],
        },
      }),
    );
    expect(b.theme).toBe("derby");
    expect(b.headline.en).toBe("Matchnight in Nicosia.");
    expect(b.lede.en).toContain("158 and 259");
    expect(b.tiles[0].kind).toBe("match");
    expect(b.tiles[0].detail).toContain("158, 259");
  });

  it("declines the Greek city name for festivals", () => {
    const b = composeTodayBriefing(
      base({ festival: { name: "Wine Festival", nameEl: "Γιορτή Κρασιού", city: "Limassol" } }),
    );
    expect(b.theme).toBe("festival");
    expect(b.headline.el).toContain("Λεμεσό");
    expect(b.tiles[0].detailEl).toContain("Λεμεσός");
  });

  it("pluralises cruise copy and prefers the feed summary", () => {
    const b = composeTodayBriefing(
      base({ cruise: { count: 3, summary: "3 ships, 6,400 guests", totalPassengers: 6400 } }),
    );
    expect(b.headline.en).toBe("3 ships in Limassol port.");
    expect(b.lede.en).toBe("3 ships, 6,400 guests");
    const single = composeTodayBriefing(
      base({ cruise: { count: 1, summary: null, totalPassengers: null } }),
    );
    expect(single.headline.en).toBe("Cruise day in Limassol.");
    expect(single.tiles[0].title).toBe("Cruise ship docked");
  });

  it("adds a weather tile and caps tiles at three", () => {
    const b = composeTodayBriefing(
      base({
        weather: { tempC: 28, condition: "MOSTLY_CLEAR", iconKey: "sun" },
        holiday: { en: "Kataklysmos", el: "Κατακλυσμός" },
        nameDay: { name: "Andreas", nameEl: "Ανδρέας", scale: "huge" },
        cruise: { count: 1, summary: null, totalPassengers: null },
      }),
    );
    expect(b.tiles).toHaveLength(3);
    expect(b.tiles.some((t) => t.kind === "rhythm")).toBe(false);
    expect(b.theme).toBe("holiday");
  });

  it("switches weather tile copy in the rain", () => {
    const b = composeTodayBriefing(
      base({ weather: { tempC: 14, condition: "RAIN", iconKey: "rain" } }),
    );
    const tile = b.tiles.find((t) => t.kind === "weather-rain");
    expect(tile?.accent).toBe("ink");
    expect(tile?.detail).toContain("umbrella");
    expect(b.theme).toBe("storm");
  });

  it("rotates the fact every two hours and the word daily", () => {
    const morning = composeTodayBriefing(base());
    const evening = composeTodayBriefing(base({ date: new Date(Date.UTC(2026, 4, 13, 12, 0, 0)) }));
    expect(morning.fact.en).not.toBe(evening.fact.en);
    expect(morning.greekWord.el).toBe("καλημέρα");
  });
});
