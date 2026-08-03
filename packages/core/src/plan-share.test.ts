import { describe, it, expect } from "vitest";
import {
  changesLabel,
  expiryLabel,
  legCopy,
  meetPoint,
  planDuration,
  planShareMessage,
  type PlanShare,
} from "./plan-share";

const basePlan: PlanShare = {
  token: "abc123",
  creator_name: "Maria",
  note: null,
  origin_label: "Limassol",
  origin_lat: 34.7,
  origin_lng: 33.02,
  destination_label: "Larnaca",
  destination_lat: 34.9,
  destination_lng: 33.62,
  departure_unix: 1_700_000_000,
  arrival_unix: 1_700_005_000,
  total_duration_sec: 5000,
  transfers: 1,
  legs: [],
  created_at: "2026-01-01T00:00:00Z",
  expires_at: "2026-01-08T00:00:00Z",
};

describe("planDuration", () => {
  it("formats minutes under an hour", () => {
    expect(planDuration(600)).toBe("10 min");
  });
  it("drops the remainder when exact hours", () => {
    expect(planDuration(7200)).toBe("2 h");
  });
  it("keeps the remainder otherwise", () => {
    expect(planDuration(5400)).toBe("1 h 30");
  });
  it("never goes negative", () => {
    expect(planDuration(-60)).toBe("0 min");
  });
});

describe("changesLabel", () => {
  it("says no changes for a direct trip", () => {
    expect(changesLabel(0)).toBe("No changes");
  });
  it("singularises one change", () => {
    expect(changesLabel(1)).toBe("1 change");
  });
  it("pluralises more", () => {
    expect(changesLabel(3)).toBe("3 changes");
  });
});

describe("legCopy", () => {
  it("describes a ride with board and alight", () => {
    const c = legCopy({
      kind: "ride",
      routeShort: "30",
      board: { name: "Anexartisias", departureUnix: 1_700_000_000 },
      alight: { name: "Finikoudes", arrivalUnix: 1_700_003_600 },
    });
    expect(c.badge).toBe("30");
    expect(c.title).toBe("Board at Anexartisias");
    expect(c.subtitle).toBe("Off at Finikoudes");
    expect(c.timing).toContain("→");
  });

  it("falls back to Bus without a route number", () => {
    expect(legCopy({ kind: "ride", board: { name: "Stop A" } }).badge).toBe("Bus");
  });

  it("describes a walk toward its destination", () => {
    const c = legCopy({ kind: "walk", to: { name: "Central Station" }, durationSec: 420 });
    expect(c.title).toBe("Walk to Central Station");
    expect(c.subtitle).toBeNull();
    expect(c.timing).toBe("7 min");
  });

  it("uses the origin name when a walk has no destination", () => {
    expect(legCopy({ kind: "walk", from: { name: "Home" } }).title).toBe("Walk to Home");
  });

  it("defaults an unlabelled leg to a ride", () => {
    expect(legCopy({ name: "Somewhere" }).kind).toBe("ride");
  });

  it("returns empty timing when nothing is known", () => {
    expect(legCopy({ kind: "wait", name: "Wait" }).timing).toBe("");
  });
});

describe("meetPoint", () => {
  it("uses the first ride's boarding stop", () => {
    const p = {
      ...basePlan,
      legs: [
        { kind: "walk" as const, to: { name: "Stop A" } },
        { kind: "ride" as const, board: { name: "Stop A", departureUnix: 1_700_000_600 } },
      ],
    };
    expect(meetPoint(p)).toEqual({ name: "Stop A", unix: 1_700_000_600 });
  });

  it("falls back to the origin on a walk-only plan", () => {
    const p = { ...basePlan, legs: [{ kind: "walk" as const, to: { name: "Beach" } }] };
    expect(meetPoint(p)).toEqual({ name: "Limassol", unix: basePlan.departure_unix });
  });
});

describe("expiryLabel", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  it("reports days out", () => {
    expect(expiryLabel("2026-01-06T00:00:00Z", now)).toBe("This link expires in 5 days.");
  });
  it("reports hours within a day", () => {
    expect(expiryLabel("2026-01-01T06:00:00Z", now)).toBe("This link expires in about 6 hours.");
  });
  it("reports the final hour", () => {
    expect(expiryLabel("2026-01-01T00:30:00Z", now)).toBe("This link expires within the hour.");
  });
  it("reports a past expiry", () => {
    expect(expiryLabel("2025-12-31T00:00:00Z", now)).toBe("This link has expired.");
  });
  it("handles an unparseable date", () => {
    expect(expiryLabel("not-a-date", now)).toBe("This link has expired.");
  });
});

describe("planShareMessage", () => {
  it("returns just the url without a plan", () => {
    expect(planShareMessage(null, "https://x.test/p/1")).toBe("https://x.test/p/1");
  });
  it("includes both endpoints and the link", () => {
    const msg = planShareMessage(basePlan, "https://x.test/p/1");
    expect(msg).toContain("Limassol → Larnaca");
    expect(msg).toContain("https://x.test/p/1");
  });
});
