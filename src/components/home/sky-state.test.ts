import { describe, expect, it } from "vitest";
import {
  backingFor,
  badgeInk,
  deriveCardState,
  fmtCyprusTime,
  greetingKey,
  headline,
  remindTarget,
  viaFromLongName,
  walkMinutes,
  type CardInput,
  type NextBus,
} from "./sky-state";
import { en } from "@/lib/dictionaries/en";
import { el } from "@/lib/dictionaries/el";

const bus = (o: Partial<NextBus> = {}): NextBus => ({
  stopId: "S1",
  stopName: "Police Stn.",
  walkMin: 2,
  walkSec: 120,
  stopLat: 35.17,
  stopLng: 33.36,
  tripId: "T1",
  routeId: "R1",
  line: "400",
  color: "#E5242A",
  dest: "Solomou Sq.",
  via: null,
  etaMin: 6,
  arrivalUnix: 1_000_360,
  backing: "live",
  stopsAway: 3,
  then: [],
  source: "realtime",
  ...o,
});

const base: CardInput = {
  mounted: true,
  hasPickedStop: false,
  geoSource: "live",
  geoLoading: false,
  geoDenied: false,
  rtLoading: false,
  rtError: false,
  rtHasData: true,
  offlineLoading: false,
  bus: null,
  nearestStop: { id: "S1", name: "Police Stn." },
};

describe("deriveCardState", () => {
  it("is loading before mount (SSR-safe)", () => {
    expect(deriveCardState({ ...base, mounted: false, bus: bus() }).kind).toBe("loading");
  });
  it("asks for location when GPS fell back and no stop is picked", () => {
    expect(deriveCardState({ ...base, geoSource: "fallback" })).toEqual({ kind: "no-location", denied: false });
    expect(deriveCardState({ ...base, geoSource: "fallback", geoDenied: true })).toEqual({ kind: "no-location", denied: true });
  });
  it("waits while the first GPS fix is pending", () => {
    expect(deriveCardState({ ...base, geoSource: "fallback", geoLoading: true }).kind).toBe("loading");
  });
  it("a picked stop counts as located", () => {
    expect(deriveCardState({ ...base, geoSource: "fallback", hasPickedStop: true, bus: bus() }).kind).toBe("bus");
  });
  it("shows the bus whenever one exists, even if the feed errored (offline timetable)", () => {
    expect(deriveCardState({ ...base, rtError: true, rtHasData: false, bus: bus({ source: "offline" }) }).kind).toBe("bus");
  });
  it("loading while realtime has never answered", () => {
    expect(deriveCardState({ ...base, rtLoading: true, rtHasData: false }).kind).toBe("loading");
  });
  it("error only when the feed failed and nothing else answered", () => {
    expect(deriveCardState({ ...base, rtError: true, rtHasData: false }).kind).toBe("error");
    expect(deriveCardState({ ...base, rtError: true, rtHasData: false, offlineLoading: true }).kind).toBe("loading");
  });
  it("no service when the feed answered with nothing nearby", () => {
    expect(deriveCardState(base)).toEqual({ kind: "none", stopId: "S1", stopName: "Police Stn." });
  });
});

describe("headline", () => {
  const f = () => "7:54";
  it("says 'close' only for a live bus under 10 min", () => {
    expect(headline({ kind: "bus", bus: bus({ etaMin: 6 }) }, f).key).toBe("sky.head.close");
    expect(headline({ kind: "bus", bus: bus({ etaMin: 6, backing: "scheduled" }) }, f).key).toBe("sky.head.dueSoon");
    expect(headline({ kind: "bus", bus: bus({ etaMin: 6, backing: "estimated" }) }, f).key).toBe("sky.head.dueSoon");
    expect(headline({ kind: "bus", bus: bus({ etaMin: 10 }) }, f)).toEqual({ key: "sky.head.inMin", vars: { n: 10 } });
    expect(headline({ kind: "bus", bus: bus({ etaMin: 45 }) }, f)).toEqual({ key: "sky.head.at", vars: { time: "7:54" } });
  });
  it("is honest in the other states", () => {
    expect(headline({ kind: "none", stopId: null, stopName: null }, f).key).toBe("sky.head.quiet");
    expect(headline({ kind: "error" }, f).key).toBe("sky.head.error");
    expect(headline({ kind: "no-location", denied: false }, f).key).toBe("sky.head.where");
  });
});

describe("helpers", () => {
  it("maps classifier tiers to badges", () => {
    expect(backingFor("live")).toBe("live");
    expect(backingFor("rider-confirmed")).toBe("live");
    expect(backingFor("predicted")).toBe("estimated");
    expect(backingFor("ghost")).toBe("scheduled");
    expect(backingFor(undefined)).toBe("scheduled");
  });
  it("walk minutes are at least 1", () => {
    expect(walkMinutes(0.01)).toBe(1);
    expect(walkMinutes(0.128)).toBe(2);
  });
  it("greets by Cyprus custom: Kaliméra before noon, Kalispéra after", () => {
    expect(greetingKey(new Date(2026, 9, 15, 7, 48))).toBe("sky.greet.morning");
    expect(greetingKey(new Date(2026, 9, 15, 12, 0))).toBe("sky.greet.evening");
    expect(greetingKey(new Date(2026, 9, 15, 23, 30))).toBe("sky.greet.evening");
    expect(greetingKey(new Date(2026, 9, 28, 9, 0))).toBe("sky.greet.chroniaPolla");
  });
  it("remind targets the first bus still far enough away", () => {
    const now = 1_000_000;
    // next in 6 min, walk 2 min → remind time already past → falls to the next one
    expect(remindTarget({ arrivalUnix: now + 360, walkSec: 120, then: [now + 2040] }, now)).toEqual({
      arrivalUnix: now + 2040,
      remindAtUnix: now + 2040 - 120 - 300,
      isNext: false,
    });
    expect(remindTarget({ arrivalUnix: now + 1800, walkSec: 120, then: [] }, now)?.isNext).toBe(true);
    expect(remindTarget({ arrivalUnix: now + 360, walkSec: 120, then: [] }, now)).toBeNull();
  });
  it("via comes only from the published route name", () => {
    expect(viaFromLongName("Lakatamia - Akaki Ave - Solomou Sq", "Solomou Sq")).toBe("Akaki Ave");
    expect(viaFromLongName("Lakatamia - Solomou Sq", "Solomou Sq")).toBeNull();
    expect(viaFromLongName(undefined, "x")).toBeNull();
  });
  it("badge ink stays readable", () => {
    expect(badgeInk("#E5242A")).toBe("#fff");
    expect(badgeInk("#FFE14D")).toBe("#1A1830");
  });
  it("formats Cyprus time without a leading zero", () => {
    // 2026-10-15 04:54 UTC = 07:54 EEST
    expect(fmtCyprusTime(Date.UTC(2026, 9, 15, 4, 54) / 1000)).toBe("7:54");
  });
  it("EN and EL sky dictionaries have the same keys", () => {
    const a = Object.keys(en).filter((k) => k.startsWith("sky.")).sort();
    const b = Object.keys(el).filter((k) => k.startsWith("sky.")).sort();
    expect(b).toEqual(a);
    expect(a.length).toBeGreaterThan(60);
  });
});
