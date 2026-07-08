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
});
