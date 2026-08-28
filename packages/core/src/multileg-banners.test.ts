import { describe, it, expect } from "vitest";
import { alerts as alertsEn } from "./dictionaries/en/alerts";
import {
  companionBanners,
  shouldOfferSighting,
  shouldAskStillOnBoard,
  shouldPushStillOnBoard,
  stillOnBoardPush,
  STILL_ON_ALERT,
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

describe("shouldAskStillOnBoard", () => {
  const a = {
    active: true,
    phase: "on-bus",
    tripGhost: true,
    vehicleLost: false,
    hasCurrentRide: true,
  };
  it("asks once the rider is on a ghost trip", () => {
    expect(shouldAskStillOnBoard(a)).toBe(true);
  });
  it("asks when the feed lost the vehicle", () => {
    expect(shouldAskStillOnBoard({ ...a, tripGhost: false, vehicleLost: true })).toBe(true);
  });
  it("stays quiet while the feed is healthy", () => {
    expect(shouldAskStillOnBoard({ ...a, tripGhost: false, vehicleLost: false })).toBe(false);
  });
  it("does not ask at the stop — that is a sighting", () => {
    expect(shouldAskStillOnBoard({ ...a, phase: "waiting-to-board" })).toBe(false);
  });
  it("asks on the alight-soon card too", () => {
    expect(shouldAskStillOnBoard({ ...a, phase: "alight-soon" })).toBe(true);
  });
  it("names the rider as the only eyes, not a volunteer", () => {
    expect(alertsEn["sighting.onboard.kicker"]).toBe("You're the only eyes on Bus {code}");
    expect(alertsEn["sighting.onboard.help"]).not.toMatch(/please|contribute|points|badge/i);
    expect(alertsEn["sighting.onboard.help.seed"]).not.toMatch(/please|contribute|points|badge/i);
    expect(alertsEn["sighting.help.seed"]).not.toMatch(/please|contribute|points|badge/i);
  });
});

describe("shouldPushStillOnBoard", () => {
  it("pings once when the rider left and the feed is dark", () => {
    expect(
      shouldPushStillOnBoard({ sent: [], riding: true, tripGhost: true }),
    ).toBe(true);
    expect(
      shouldPushStillOnBoard({ sent: [STILL_ON_ALERT], riding: true, tripGhost: true }),
    ).toBe(false);
    expect(shouldPushStillOnBoard({ sent: [], riding: false, tripGhost: true })).toBe(false);
    expect(shouldPushStillOnBoard({ sent: [], riding: true, tripGhost: false })).toBe(false);
  });

  it("asks still on Bus 31, and does not invent a waiter count", () => {
    const p = stillOnBoardPush("31");
    expect(p.title).toBe("Still on Bus 31?");
    expect(p.body).toMatch(/no GPS/i);
    expect(`${p.title} ${p.body}`).not.toMatch(/\d+\s+people|waiting on it|points|badge/i);
    expect(stillOnBoardPush("").title).toBe("Still on this bus?");
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
