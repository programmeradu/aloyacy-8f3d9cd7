import { describe, expect, it } from "vitest";
import { getStopAmenities, knownAmenityCount } from "@/data/stop-amenities";
import { STOP_CONDITION_SEED } from "@aloya/core/stop-condition";

describe("STOP_CONDITION_SEED", () => {
  it("is the same eight hubs as the curated amenity file", () => {
    expect(STOP_CONDITION_SEED).toHaveLength(knownAmenityCount());
    for (const row of STOP_CONDITION_SEED) {
      const a = getStopAmenities(row.stopId);
      expect(a).toBeDefined();
      expect(row.shelter).toBe(a!.shelter);
      expect(row.seating).toBe(a!.seating);
      expect(row.stepFree).toBe(a!.stepFree);
    }
  });
});
