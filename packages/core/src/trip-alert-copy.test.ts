import { describe, expect, it } from "vitest";
import { buildTripAlertCopy } from "./trip-alert-copy";

describe("buildTripAlertCopy", () => {
  it("names the route and stop when known", () => {
    const c = buildTripAlertCopy({
      kind: "at-stop",
      routeShort: "30",
      stopName: "Solomou Square",
      minutes: 4,
    });
    expect(c.title).toBe("Bus 30 in 4 min");
    expect(c.body).toContain("Solomou Square");
  });

  it("degrades gracefully with no route or stop", () => {
    const c = buildTripAlertCopy({ kind: "at-stop" });
    expect(c.title).toBe("Your bus shortly");
    expect(c.body).toContain("your stop");
  });

  it("says now at zero minutes and singular at one", () => {
    expect(buildTripAlertCopy({ kind: "at-stop", minutes: 0 }).title).toContain("now");
    expect(buildTripAlertCopy({ kind: "at-stop", minutes: 1 }).title).toContain("in 1 min");
  });

  it("writes distinct copy per kind", () => {
    const kinds = [
      "at-stop",
      "hurry-soft",
      "hurry-urgent",
      "board-now",
      "press-stop",
      "confirm-onboard",
      "missed-bus",
      "arrived",
      "disruption",
      "wait-flip",
    ] as const;
    const titles = kinds.map((kind) => buildTripAlertCopy({ kind, routeShort: "42" }).title);
    expect(new Set(titles).size).toBe(kinds.length);
    expect(titles.every((t) => t.length > 0)).toBe(true);
  });

  it("gives every alert a stable id derived from its context", () => {
    const a = buildTripAlertCopy({ kind: "press-stop", routeShort: "30", stopName: "Ledra" });
    const b = buildTripAlertCopy({ kind: "press-stop", routeShort: "30", stopName: "Ledra" });
    const c = buildTripAlertCopy({ kind: "press-stop", routeShort: "31", stopName: "Ledra" });
    expect(a.id).toBe(b.id);
    expect(a.id).not.toBe(c.id);
  });

  it("keeps press-stop urgent and specific", () => {
    const c = buildTripAlertCopy({ kind: "press-stop", routeShort: "30", stopName: "Ledra" });
    expect(c.title).toBe("Press stop now");
    expect(c.body).toBe("Ledra is next on bus 30.");
  });

  it("counts the remaining stops in the get-ready alert", () => {
    const c = buildTripAlertCopy({
      kind: "alight-ready",
      routeShort: "19",
      stopName: "Isaakiou Komninou",
      stops: 3,
    });
    expect(c.title).toBe("3 stops until Isaakiou Komninou");
    expect(c.body).toContain("press the button");
  });

  it("falls back to a countless get-ready line when stops are unknown", () => {
    const c = buildTripAlertCopy({ kind: "alight-ready", stopName: "Ledra" });
    expect(c.title).toBe("Ledra is coming up");
  });

  it("uses dest-bail flip copy for wait-flip, and stays quiet on missing numbers", () => {
    const c = buildTripAlertCopy({
      kind: "wait-flip",
      routeShort: "31",
      stopName: "Home",
      minutes: 14,
      walkMin: 8,
      flipTo: "walk",
    });
    expect(c.title).toBe("Walk to Home");
    expect(c.body).toBe("Bus 31 is now 14 min if it shows. Walking is 8 min, walk.");
    expect(c.body).not.toMatch(/€|luggage|leaves in/i);
    const wait = buildTripAlertCopy({
      kind: "wait-flip",
      routeShort: "31",
      minutes: 9,
      walkMin: 8,
      flipTo: "keepWait",
    });
    expect(wait.title).toBe("Keep waiting for Bus 31");
    expect(wait.body).toContain(", wait.");
    const missing = buildTripAlertCopy({ kind: "wait-flip", routeShort: "31" });
    expect(missing.title).toBe("Walk or wait changed");
    expect(missing.body).not.toMatch(/\d+ min/);
  });
});
