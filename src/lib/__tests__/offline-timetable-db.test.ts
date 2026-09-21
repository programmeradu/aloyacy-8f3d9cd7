import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getTodayYmd,
  isIndexedDbSupported,
  getOfflineDeparturesForStop,
  buildOfflineBoardArrivals,
  openTimetableDb,
} from "../offline-timetable-db";

describe("offline-timetable-db", () => {
  it("formats today's date in YYYYMMDD format", () => {
    const fixedDate = new Date(2026, 8, 16); // Sept 16, 2026
    expect(getTodayYmd(fixedDate)).toBe("20260916");
  });

  it("checks IndexedDB environment availability", () => {
    // In node/vitest without polyfill, indexedDB might be undefined or mocked
    const supported = isIndexedDbSupported();
    expect(typeof supported).toBe("boolean");
  });

  describe("when IndexedDB is not available or rejects", () => {
    beforeEach(() => {
      vi.stubGlobal("window", {});
    });

    it("returns empty stop departures gracefully without throwing", async () => {
      const departures = await getOfflineDeparturesForStop("405");
      expect(departures).toEqual([]);
    });

    it("returns empty route arrivals gracefully without throwing", async () => {
      const arrivals = await buildOfflineBoardArrivals("405");
      expect(arrivals).toEqual([]);
    });
  });
});
