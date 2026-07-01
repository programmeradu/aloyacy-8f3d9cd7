import { describe, expect, it } from "vitest";

import { nearestZone, PULSE_ZONES } from "./pulse-zones";

describe("pulse zone catalogue", () => {
  it("has a unique id per zone", () => {
    const ids = PULSE_ZONES.map((z) => z.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every zone both an English and a Greek label", () => {
    for (const z of PULSE_ZONES) {
      expect(z.label.trim().length, z.id).toBeGreaterThan(0);
      expect(z.labelEl.trim().length, z.id).toBeGreaterThan(0);
    }
  });
});

describe("nearestZone", () => {
  it("returns a zone from the catalogue for any Cyprus coordinate", () => {
    const ids = PULSE_ZONES.map((z) => z.id);
    for (const [lat, lng] of [
      [35.174, 33.365],
      [34.6786, 33.0438],
      [34.9183, 33.6354],
      [34.772, 32.4297],
    ] as const) {
      expect(ids).toContain(nearestZone(lat, lng).id);
    }
  });

  it("resolves Nicosia's centre to the Nicosia zone", () => {
    expect(nearestZone(35.174, 33.365).id).toBe("nicosia");
  });

  it("still returns a zone for a point far off the island", () => {
    expect(nearestZone(0, 0)).toBeDefined();
  });
});
