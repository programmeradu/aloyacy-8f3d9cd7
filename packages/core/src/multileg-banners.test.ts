import { describe, it, expect } from "vitest";
import {
  companionBanners,
  shouldOfferSighting,
  phaseHaptic,
  changesLabel,
  type BannerInput,
} from "./multileg-banners";

const base: BannerInput = {
  active: true,
  phase: "riding",
  tripGhost: false,
  vehicleLost: false,
  feedStale: false,
  hasNextRide: false,
  nextVehicleTracked: true,
};

const ids = (i: BannerInput) => companionBanners(i).map((b) => b.id);

describe("companionBanners", () => {
  it("shows nothing before the trip is live", () => {
    expect(companionBanners({ ...base, active: false, tripGhost: true })).toEqual([]);
  });

  it("shows nothing when everything is healthy", () => {
    expect(ids(base)).toEqual([]);
  });

  it("explains a ghost bus", () => {
    expect(ids({ ...base, tripGhost: true })).toEqual(["ghost"]);
  });

  it("prefers rider tracking over the ghost explanation", () => {
    expect(ids({ ...base, tripGhost: true, vehicleLost: true })).toEqual(["rider-tracking"]);
  });

  it("suppresses the stale-feed banner while a ghost is explained", () => {
    expect(ids({ ...base, tripGhost: true, feedStale: true })).toEqual(["ghost"]);
  });

  it("surfaces a stale feed on its own", () => {
    expect(ids({ ...base, feedStale: true })).toEqual(["feed-stale"]);
  });

  it("warns about an untracked connection during a transfer", () => {
    const out = companionBanners({
      ...base,
      phase: "walking-to-transfer",
      hasNextRide: true,
      nextVehicleTracked: false,
      nextRouteShort: "30",
    });
    expect(out.map((b) => b.id)).toEqual(["next-untracked"]);
    expect(out[0]!.body).toContain("bus 30");
  });

  it("stays generic when the connecting route has no label", () => {
    const out = companionBanners({
      ...base,
      phase: "waiting-for-connection",
      hasNextRide: true,
      nextVehicleTracked: false,
      nextRouteShort: "  ",
    });
    expect(out[0]!.body).toContain("the connecting bus");
  });

  it("stays quiet about connections while still riding", () => {
    expect(ids({ ...base, hasNextRide: true, nextVehicleTracked: false })).toEqual([]);
  });

  it("can stack rider tracking with an untracked connection", () => {
    expect(
      ids({
        ...base,
        phase: "walking-to-transfer",
        vehicleLost: true,
        hasNextRide: true,
        nextVehicleTracked: false,
      }),
    ).toEqual(["rider-tracking", "next-untracked"]);
  });
});

describe("shouldOfferSighting", () => {
  const s = {
    active: true,
    phase: "waiting-to-board",
    tripGhost: true,
    hasCurrentRide: true,
    metersToTarget: 40,
  };
  it("offers at the stop for a ghost bus", () => {
    expect(shouldOfferSighting(s)).toBe(true);
  });
  it("declines when the bus is already reporting", () => {
    expect(shouldOfferSighting({ ...s, tripGhost: false })).toBe(false);
  });
  it("declines from too far away", () => {
    expect(shouldOfferSighting({ ...s, metersToTarget: 400 })).toBe(false);
  });
  it("declines once riding", () => {
    expect(shouldOfferSighting({ ...s, phase: "riding" })).toBe(false);
  });
  it("declines with an unknown distance", () => {
    expect(shouldOfferSighting({ ...s, metersToTarget: Number.NaN })).toBe(false);
  });
});

describe("phaseHaptic", () => {
  it("buzzes hard before the alight", () => {
    expect(phaseHaptic("alight-soon")).toBe("heavy");
  });
  it("celebrates arrival", () => {
    expect(phaseHaptic("arrived")).toBe("success");
  });
  it("warns on a missed connection", () => {
    expect(phaseHaptic("missed-connection")).toBe("warning");
  });
  it("stays quiet otherwise", () => {
    expect(phaseHaptic("riding")).toBeNull();
  });
});

describe("changesLabel", () => {
  it("labels a direct trip", () => {
    expect(changesLabel(0)).toBe("Direct");
  });
  it("singularises", () => {
    expect(changesLabel(1)).toBe("1 change");
  });
  it("pluralises", () => {
    expect(changesLabel(2)).toBe("2 changes");
  });
});
