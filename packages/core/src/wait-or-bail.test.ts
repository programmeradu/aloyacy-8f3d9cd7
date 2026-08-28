import { describe, expect, it } from "vitest";
import {
  pickWaitOrBail,
  pickWaitOrBailForDepartures,
  sameWay,
  waitOrBailCopy,
  WAIT_OR_BAIL_MAX_MIN,
  type WaitOrBailRow,
} from "./wait-or-bail";

const ghost = (over: Partial<WaitOrBailRow> = {}): WaitOrBailRow => ({
  tripId: "t1",
  routeId: "30",
  routeShort: "30",
  headsign: "Makario",
  etaMin: 12,
  tier: "ghost",
  ...over,
});

const live = (over: Partial<WaitOrBailRow> = {}): WaitOrBailRow => ({
  tripId: "t2",
  routeId: "30",
  routeShort: "30",
  headsign: "Makario",
  etaMin: 8,
  tier: "live",
  ...over,
});

describe("sameWay", () => {
  it("needs both headsigns", () => {
    expect(sameWay(null, "Makario")).toBe(false);
    expect(sameWay("Makario", "")).toBe(false);
  });

  it("matches ignoring case", () => {
    expect(sameWay("Makario Stadium", "makario stadium")).toBe(true);
  });
});

describe("pickWaitOrBail", () => {
  it("skips a ghost for a later live on the same route and way", () => {
    const cur = ghost();
    const hit = pickWaitOrBail(cur, [cur, live()], { lastTonight: false, noShow: false });
    expect(hit).toEqual({ kind: "skipSame", routeShort: "30", etaMin: 8 });
  });

  it("refuses the opposite direction", () => {
    const cur = ghost();
    const hit = pickWaitOrBail(cur, [cur, live({ headsign: "Solomos" })], {
      lastTonight: false,
      noShow: false,
    });
    expect(hit).toBeNull();
  });

  it("refuses a later bus past the 20 min cap", () => {
    const cur = ghost();
    const hit = pickWaitOrBail(cur, [cur, live({ etaMin: WAIT_OR_BAIL_MAX_MIN + 1 })], {
      lastTonight: false,
      noShow: false,
    });
    expect(hit).toBeNull();
  });

  it("points at a faster live on another route", () => {
    const cur = ghost({ etaMin: 18 });
    const alt = live({
      tripId: "x",
      routeId: "25",
      routeShort: "25",
      etaMin: 4,
      headsign: "Kaimakli",
    });
    const hit = pickWaitOrBail(cur, [cur, alt], { lastTonight: false, noShow: false });
    expect(hit).toEqual({
      kind: "otherRoute",
      routeShort: "30",
      altRouteShort: "25",
      etaMin: 4,
    });
  });

  it("does not point at another route that is not materially sooner", () => {
    const cur = ghost({ etaMin: 8 });
    const alt = live({ tripId: "x", routeId: "25", routeShort: "25", etaMin: 6 });
    expect(pickWaitOrBail(cur, [cur, alt], { lastTonight: false, noShow: false })).toBeNull();
  });

  it("prefers skip-same over another route", () => {
    const cur = ghost({ etaMin: 18 });
    const same = live({ etaMin: 9 });
    const alt = live({
      tripId: "x",
      routeId: "25",
      routeShort: "25",
      etaMin: 3,
      headsign: "Kaimakli",
    });
    expect(pickWaitOrBail(cur, [cur, same, alt], { lastTonight: false, noShow: false })?.kind).toBe(
      "skipSame",
    );
  });

  it("names Bolt when this was the last tonight and it is a ghost", () => {
    const cur = ghost();
    expect(pickWaitOrBail(cur, [cur], { lastTonight: true, noShow: false })).toEqual({
      kind: "bail",
      routeShort: "30",
    });
  });

  it("skips the live next bus rather than bailing", () => {
    const cur = ghost();
    const hit = pickWaitOrBail(cur, [cur, live()], { lastTonight: true, noShow: false });
    expect(hit?.kind).toBe("skipSame");
  });

  it("does not bail on a live bus", () => {
    const cur = live({ tripId: "t1" });
    expect(pickWaitOrBail(cur, [cur], { lastTonight: true, noShow: true })).toBeNull();
  });
});

describe("pickWaitOrBailForDepartures", () => {
  it("speaks once per route, on the first dark row", () => {
    const first = ghost({ tripId: "a", etaMin: 10 });
    const second = ghost({ tripId: "b", etaMin: 22 });
    const next = live({ tripId: "c", etaMin: 7 });
    const map = pickWaitOrBailForDepartures([first, second, next], () => ({
      lastTonight: false,
      noShow: false,
    }));
    expect([...map.keys()]).toEqual(["a"]);
    expect(map.get("a")?.kind).toBe("skipSame");
  });

  it("stays quiet when an earlier live bus already sits on the route", () => {
    const first = live({ tripId: "a", etaMin: 3 });
    const dark = ghost({ tripId: "b", etaMin: 16 });
    const next = live({ tripId: "c", etaMin: 18 });
    const map = pickWaitOrBailForDepartures([first, dark, next], () => ({
      lastTonight: false,
      noShow: false,
    }));
    expect(map.size).toBe(0);
  });
});

describe("waitOrBailCopy", () => {
  it("says the next bus, not a slogan", () => {
    expect(waitOrBailCopy({ kind: "skipSame", routeShort: "30", etaMin: 8 })).toBe(
      "Bus 30 isn't on the map. The next one is, 8 min.",
    );
  });
});
