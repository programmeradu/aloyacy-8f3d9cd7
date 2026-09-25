import { describe, expect, it } from "vitest";
import {
  buildMultiLegMapMarkers,
  getRestrictTripIds,
  isEarlyAlight,
  getWalkBannerTitle,
  EARLY_ALIGHT_THRESHOLD_M,
} from "../multileg-companion-helpers";
import type { ActiveTrip } from "@/lib/trip-store";

describe("multileg-companion-helpers", () => {
  const dummyActive = {
    from: { lat: 35.1, lng: 33.3, label: "Home" },
    to: { lat: 35.2, lng: 33.4, label: "Work" },
  } as ActiveTrip;

  const dummyItin = {
    legs: [
      {
        kind: "ride",
        tripId: "trip-1",
        board: { lat: 35.12, lng: 33.32, name: "Stop A" },
        alight: { lat: 35.15, lng: 33.35, name: "Stop B" },
      },
      {
        kind: "walk",
        from: { lat: 35.15, lng: 33.35 },
        to: { lat: 35.16, lng: 33.36 },
      },
      {
        kind: "ride",
        tripId: "trip-2",
        board: { lat: 35.16, lng: 33.36, name: "Stop C" },
        alight: { lat: 35.2, lng: 33.4, name: "Stop D" },
      },
    ],
  } as unknown as NonNullable<ActiveTrip["itinerary"]>;

  it("builds map markers including origin, destination, and all board/alight stops", () => {
    const markers = buildMultiLegMapMarkers(dummyActive, dummyItin);
    expect(markers.length).toBe(6); // 2 endpoints + 4 stop pins
    expect(markers[0]).toEqual({
      lat: 35.1,
      lng: 33.3,
      kind: "origin",
      label: "Home",
    });
    expect(markers[1]).toEqual({
      lat: 35.2,
      lng: 33.4,
      kind: "destination",
      label: "Work",
    });
    expect(markers[2].kind).toBe("stop");
    expect(markers[2].tone).toBe("aegean");
    expect(markers[3].tone).toBe("ochre");
  });

  it("derives restrictTripIds for current and connecting ride legs", () => {
    expect(getRestrictTripIds(null, null, "riding")).toBeUndefined();
    expect(getRestrictTripIds({ tripId: "trip-1" }, null, "riding")).toEqual(["trip-1"]);
    expect(
      getRestrictTripIds({ tripId: "trip-1" }, { tripId: "trip-2" }, "walking-to-transfer"),
    ).toEqual(["trip-1", "trip-2"]);
    expect(
      getRestrictTripIds({ tripId: "trip-1" }, { tripId: "trip-2" }, "waiting-for-connection"),
    ).toEqual(["trip-1", "trip-2"]);
    expect(
      getRestrictTripIds({ tripId: "trip-1" }, { tripId: "trip-2" }, "riding"),
    ).toEqual(["trip-1"]);
  });

  it("identifies early alight correctly based on threshold", () => {
    expect(isEarlyAlight(null, { lat: 35.1, lng: 33.3 })).toBe(false);
    expect(isEarlyAlight({ lat: 35.1, lng: 33.3 }, null)).toBe(false);

    // Exact match = 0m
    expect(isEarlyAlight({ lat: 35.1, lng: 33.3 }, { lat: 35.1, lng: 33.3 })).toBe(false);

    // Far away (~11 km) > 150m
    expect(isEarlyAlight({ lat: 35.1, lng: 33.3 }, { lat: 35.2, lng: 33.3 })).toBe(true);
    expect(EARLY_ALIGHT_THRESHOLD_M).toBe(150);
  });

  it("generates correct walk banner titles based on phase", () => {
    const mockT = (key: string, args?: Record<string, unknown>) => {
      if (key === "ml.walk.toBus") return `Walk to ${args?.code}`;
      return key;
    };

    expect(getWalkBannerTitle("walking-to-board", "101", mockT)).toBe("ml.walk.toFirst");
    expect(getWalkBannerTitle("walking-to-transfer", "101", mockT)).toBe("Walk to 101");
    expect(getWalkBannerTitle("walking-to-destination", "101", mockT)).toBe("ml.walk.toDest");
    expect(getWalkBannerTitle("other", "101", mockT)).toBe("ml.walk.generic");
  });
});
