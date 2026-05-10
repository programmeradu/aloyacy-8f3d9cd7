// Wave 2.3 — Park & Ride suggestion engine.
//
// For trips originating outside the Nicosia urban core and ending inside
// it, surface a "drive to {hub}, bus from there" alternative when it
// genuinely beats — or makes more comfortable — the bus-only plan.
//
// Honesty rules:
//   - Use Google Routes (TRAFFIC_AWARE) for the drive leg. Never haversine
//     + average speed; we'd be lying about traffic.
//   - Reuse the real multi-leg planner for the bus leg from the hub. Same
//     accuracy contract as a normal trip.
//   - Suppress when bus-only is already good enough — never push driving for
//     its own sake.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { drivingRoute } from "./maps.server";
import { planMultiLegJourney } from "./journey-multileg.server";
import { distanceM } from "./geo";
import { hubsForCity } from "@/data/park-and-ride";
import { nearestCity, distanceKm as cityDistanceKm } from "./cities";
import type { Itinerary, RideLeg } from "./itinerary-types";

const distanceKm = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) => distanceM(a, b) / 1000;

const Pt = z.object({
  lat: z.number().min(34).max(36),
  lng: z.number().min(32).max(35),
  label: z.string().max(200).optional(),
});

const PARK_BUFFER_SEC = 180; // find a spot + walk to the bay
const MIN_SAVING_SEC = 5 * 60; // be conservative; 5+ min beats "marginal"
const COMFORT_WALK_THRESHOLD_M = 800;
const COMFORT_PARITY_SEC = 120; // P&R can be up to 2 min slower in comfort mode

export type ParkAndRideSuggestion = {
  hub: {
    id: string;
    label: string;
    note?: string;
    lat: number;
    lng: number;
    ev?: {
      count: number;
      kwMax: number;
      kind: "ac" | "dc";
      network: string;
    };
  };

  driveSec: number;
  driveMeters: number;
  bus: {
    firstRoute: string | null;
    boardName: string;
    durationSec: number;
    arrivalUnix: number;
  };
  totalSec: number;
  busOnlySec: number | null;
  savingsSec: number;
  reason: "faster" | "comfort" | "no-bus-only" | "traffic-jam";
  /** Live-traffic intelligence for the direct-drive alternative. Present
   *  whenever we successfully measured the all-the-way drive; the UI uses
   *  this to render a "why" line ("A1 inbound is 14 min slower than usual"). */
  liveTraffic?: {
    /** Live, traffic-aware end-to-end drive (origin → destination). */
    directDriveSec: number;
    /** Free-flow end-to-end drive, same route, no traffic. */
    freeFlowSec: number;
    /** directDriveSec − freeFlowSec, never negative. */
    delaySec: number;
    /** delay / freeFlow. 0.30 → "30% slower than usual." */
    severity: number;
    /** True when severity ≥ 0.30 AND delay ≥ 4 min — worth surfacing. */
    notable: boolean;
  };
};

export const suggestParkAndRide = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        from: Pt,
        to: Pt,
        /** Bus-only plan's total duration in seconds, if one exists. */
        busOnlyDurationSec: z.number().int().positive().nullable().optional(),
        /** Walking distance from origin to the first bus stop, in metres. */
        busOnlyAccessWalkM: z.number().int().min(0).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ParkAndRideSuggestion | null> => {
    const { from, to } = data;

    // Wave 2.5 — pick the destination's city as the suggestion frame. The
    // rider parks somewhere inbound from their origin, so the hub set must
    // be the hubs that serve the destination's city, not the origin's.
    const destCity = nearestCity(to.lat, to.lng);
    const fromCity = nearestCity(from.lat, from.lng);
    const fromKmCenter = cityDistanceKm(from, destCity.center);
    const toKmCenter = cityDistanceKm(to, destCity.center);
    const odKm = distanceKm(from, to);

    // Geometry gates: only suggest when P&R can plausibly help.
    // 1) Origin must be outside the destination city's urban core. If the
    //    rider's already downtown there, driving is pointless.
    if (fromKmCenter < destCity.coreRadiusKm) return null;
    // 2) Destination must be inside the destination city's near-core
    //    (coreRadius + a 3 km buffer for districts like Mesa Geitonia).
    if (toKmCenter > destCity.coreRadiusKm + 3) return null;
    // 3) Trip must be long enough for the drive + park overhead to win.
    if (odKm < 6) return null;
    // 4) Don't suggest P&R for intra-city trips inside the SAME city core —
    //    a Limassol→Limassol trip from Polemidia to Anexartisias is better
    //    served by the regular bus plan.
    if (fromCity.id === destCity.id && fromKmCenter < destCity.coreRadiusKm + 2) {
      return null;
    }

    const cityHubs = hubsForCity(destCity.id);
    if (cityHubs.length === 0) return null;

    // Find hubs that meaningfully intercept the trip.
    const candidates = cityHubs
      .map((hub) => ({
        hub,
        toHubKm: distanceKm(from, hub),
        hubToDestKm: distanceKm(hub, to),
      }))
      // Must be closer to destination than origin (real interception).
      .filter((c) => c.hubToDestKm < odKm - 2)
      // Must be a real drive (≥ 2 km) and never beyond the destination.
      .filter((c) => c.toHubKm >= 2 && c.toHubKm < odKm)
      // Hub close enough to destination to be useful by bus (≤ 9 km).
      .filter((c) => c.hubToDestKm <= 9 && c.hubToDestKm >= 1)
      .sort((a, b) => a.hubToDestKm - b.hubToDestKm)
      .slice(0, 2);

    if (candidates.length === 0) return null;

    // Run the candidate hub evaluations + the direct-drive traffic probe in
    // parallel. The direct-drive call is what powers the "why we're
    // suggesting this" line: if the full origin → destination drive is in
    // the red right now, P&R is a defensible call even when raw minutes are
    // close.
    const [evals, directDrive] = await Promise.all([
      Promise.all(
        candidates.map(async (c) => {
          const [drive, busPlan] = await Promise.all([
            drivingRoute(from, { lat: c.hub.lat, lng: c.hub.lng }),
            planMultiLegJourney(
              { lat: c.hub.lat, lng: c.hub.lng, label: c.hub.label },
              to,
            ).catch(() => ({ itineraries: [] as Itinerary[] })),
          ]);
          if (!drive || drive.durationSec <= 0) return null;
          const bestBus = busPlan.itineraries
            .filter((it) => it.transfers <= 1)
            .sort((a, b) => a.score - b.score)[0];
          if (!bestBus) return null;
          const totalSec =
            drive.durationSec + PARK_BUFFER_SEC + bestBus.totalDurationSec;
          return { c, drive, bestBus, totalSec };
        }),
      ),
      drivingRoute(from, to),
    ]);

    const ranked = evals
      .filter((e): e is NonNullable<typeof e> => !!e)
      .sort((a, b) => a.totalSec - b.totalSec);
    const top = ranked[0];
    if (!top) return null;

    // Build the live-traffic intelligence block (if Google answered).
    let liveTraffic: ParkAndRideSuggestion["liveTraffic"] | undefined;
    if (directDrive && directDrive.staticDurationSec > 0) {
      const delaySec = Math.max(
        0,
        directDrive.durationSec - directDrive.staticDurationSec,
      );
      const severity = delaySec / directDrive.staticDurationSec;
      liveTraffic = {
        directDriveSec: directDrive.durationSec,
        freeFlowSec: directDrive.staticDurationSec,
        delaySec,
        severity,
        notable: severity >= 0.3 && delaySec >= 4 * 60,
      };
    }

    const busOnly = data.busOnlyDurationSec ?? null;
    const accessWalk = data.busOnlyAccessWalkM ?? null;

    let reason: ParkAndRideSuggestion["reason"];
    let savings = 0;

    if (busOnly == null) {
      reason = "no-bus-only";
    } else if (busOnly - top.totalSec >= MIN_SAVING_SEC) {
      reason = "faster";
      savings = busOnly - top.totalSec;
    } else if (
      accessWalk != null &&
      accessWalk >= COMFORT_WALK_THRESHOLD_M &&
      top.totalSec <= busOnly + COMFORT_PARITY_SEC
    ) {
      reason = "comfort";
    } else if (
      // Wave 3 — live-traffic escape hatch. Even when the static minutes
      // don't quite clear our "faster" bar, surface P&R if the direct drive
      // is genuinely jammed AND P&R still beats it. This is where "Aloya
      // saw the A1 was red" becomes visible to the rider.
      liveTraffic?.notable &&
      liveTraffic.directDriveSec - top.totalSec >= MIN_SAVING_SEC
    ) {
      reason = "traffic-jam";
      savings = liveTraffic.directDriveSec - top.totalSec;
    } else {
      return null;
    }

    const firstRide = top.bestBus.legs.find(
      (l): l is RideLeg => l.kind === "ride",
    );

    return {
      hub: {
        id: top.c.hub.id,
        label: top.c.hub.label,
        note: top.c.hub.note,
        lat: top.c.hub.lat,
        lng: top.c.hub.lng,
        ev: top.c.hub.ev,
      },
      driveSec: top.drive.durationSec,
      driveMeters: top.drive.distanceMeters,
      bus: {
        firstRoute: firstRide?.routeShort ?? null,
        boardName: firstRide?.board.name ?? top.c.hub.label,
        durationSec: top.bestBus.totalDurationSec,
        arrivalUnix: top.bestBus.arrivalUnix,
      },
      totalSec: top.totalSec,
      busOnlySec: busOnly,
      savingsSec: savings,
      reason,
      liveTraffic,
    };
  });
