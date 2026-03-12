// Wave 3 — Bike-share intelligence (Nextbike Cyprus).
//
// The single docked bike-share network in Cyprus, Nextbike, operates in
// all five urban regions: Limassol, Nicosia, Larnaca, Paphos, Famagusta.
// Their `nextbike-live.json` endpoint exposes station inventory in near
// real time (10-minute refresh, no auth, no key).
//
// We use it for two things:
//   1) Surface a "cycle instead" suggestion when both trip endpoints have
//      a bike with free racks within a short walk, and the cycle time
//      genuinely beats (or matches) the bus plan.
//   2) Expose nearestBikeStations() for future surfaces (map overlay,
//      stop pages, last-mile alternatives).
//
// Honesty rules:
//   - Never recommend a station with 0 bikes available (rider walks for
//     nothing) or a destination station with 0 free racks (can't return).
//   - Use 16 km/h as the realistic e-bike + city cruising speed for the
//     fleet; Cyprus is hot and hilly. Add 90 s for unlock + 60 s for
//     return at each end.
//   - Only suggest when total bike journey saves ≥ 3 min vs. bus, OR when
//     no bus plan exists at all and OD is in the sweet spot.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { distanceM } from "./geo";

const FEED_URL =
  "https://maps.nextbike.net/maps/nextbike-live.json?city=190,206,940,957,889";

const CITY_BY_UID: Record<number, { id: string; name: string; web: string }> = {
  190: { id: "limassol", name: "Limassol", web: "https://www.nextbike.com.cy/en/limassol/" },
  206: { id: "nicosia", name: "Nicosia", web: "https://www.nextbike.com.cy/en/nicosia/" },
  889: { id: "famagusta", name: "Famagusta", web: "https://www.nextbike.com.cy/en/famagusta/" },
  940: { id: "larnaca", name: "Larnaca", web: "https://www.nextbike.com.cy/en/larnaca/" },
  957: { id: "paphos", name: "Paphos", web: "https://www.nextbike.com.cy/en/paphos/" },
};

const WALK_M_PER_S = 1.35;
const BIKE_M_PER_S = 16_000 / 3600; // 4.44 m/s — realistic urban e-bike pace
const UNLOCK_SEC = 90;
const RETURN_SEC = 60;

const MAX_ACCESS_WALK_M = 650; // any further & cycling stops being a win
const MIN_BIKE_OD_M = 1500;
const MAX_BIKE_OD_M = 8000;
const MIN_SAVING_SEC = 3 * 60;

export type BikeStation = {
  uid: number;
  number: number;
  name: string;
  lat: number;
  lng: number;
  bikes: number;
  freeRacks: number;
  cityId: string;
  cityName: string;
};

export type BikeStationNear = BikeStation & {
  distanceM: number;
  walkSec: number;
};

type FeedCity = {
  uid: number;
  places: Array<{
    uid: number;
    number: number;
    name: string;
    lat: number;
    lng: number;
    bikes_available_to_rent?: number;
    bikes?: number;
    free_racks?: number;
    bike_racks?: number;
    maintenance?: boolean;
    spot?: boolean;
  }>;
};

type Feed = { countries: Array<{ cities: FeedCity[] }> };

// Module-level cache: Nextbike refreshes every ~10 min, so 60 s is safe
// and dramatically cuts outbound calls when many riders plan trips.
let cache: { at: number; data: BikeStation[] } | null = null;
const CACHE_TTL_MS = 60_000;

async function loadStations(): Promise<BikeStation[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  try {
    const res = await fetch(FEED_URL, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) throw new Error(`nextbike ${res.status}`);
    const feed = (await res.json()) as Feed;
    const out: BikeStation[] = [];
    for (const city of feed.countries[0]?.cities ?? []) {
      const meta = CITY_BY_UID[city.uid];
      if (!meta) continue;
      for (const p of city.places) {
        if (!p.spot || p.maintenance) continue;
        const bikes = p.bikes_available_to_rent ?? p.bikes ?? 0;
        const freeRacks = p.free_racks ?? Math.max(0, (p.bike_racks ?? 0) - bikes);
        out.push({
          uid: p.uid,
          number: p.number,
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          bikes,
          freeRacks,
          cityId: meta.id,
          cityName: meta.name,
        });
      }
    }
    cache = { at: Date.now(), data: out };
    return out;
  } catch (err) {
    // If the upstream is down, prefer stale cache over nothing.
    if (cache) return cache.data;
    console.error("[bikeshare] feed load failed", err);
    return [];
  }
}

const Pt = z.object({
  lat: z.number().min(34).max(36),
  lng: z.number().min(32).max(35),
});

export const nearestBikeStations = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        near: Pt,
        max: z.number().int().min(1).max(10).optional(),
        /** When true, only consider stations with ≥ 1 bike available. */
        needBikes: z.boolean().optional(),
        /** When true, only consider stations with ≥ 1 free rack. */
        needRacks: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<BikeStationNear[]> => {
    const all = await loadStations();
    const max = data.max ?? 4;
    const enriched = all
      .filter((s) => (data.needBikes ? s.bikes > 0 : true))
      .filter((s) => (data.needRacks ? s.freeRacks > 0 : true))
      .map<BikeStationNear>((s) => {
        const d = distanceM(data.near, { lat: s.lat, lng: s.lng });
        return { ...s, distanceM: d, walkSec: Math.round(d / WALK_M_PER_S) };
      })
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, max);
    return enriched;
  });

export type BikeShareSuggestion = {
  pickup: BikeStationNear;
  dropoff: BikeStationNear;
  rideSec: number;
  rideMeters: number;
  totalSec: number;
  busOnlySec: number | null;
  savingsSec: number;
  reason: "faster" | "no-bus-only";
  cityName: string;
  webDeepLink: string;
  mapsDeepLink: string;
};

export const suggestBikeShare = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        from: Pt,
        to: Pt,
        busOnlyDurationSec: z.number().int().positive().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<BikeShareSuggestion | null> => {
    const odM = distanceM(data.from, data.to);
    if (odM < MIN_BIKE_OD_M || odM > MAX_BIKE_OD_M) return null;

    const all = await loadStations();
    if (all.length === 0) return null;

    const pickups = all
      .filter((s) => s.bikes > 0)
      .map<BikeStationNear>((s) => {
        const d = distanceM(data.from, { lat: s.lat, lng: s.lng });
        return { ...s, distanceM: d, walkSec: Math.round(d / WALK_M_PER_S) };
      })
      .filter((s) => s.distanceM <= MAX_ACCESS_WALK_M)
      .sort((a, b) => a.distanceM - b.distanceM);
    if (pickups.length === 0) return null;

    const dropoffs = all
      .filter((s) => s.freeRacks > 0)
      .map<BikeStationNear>((s) => {
        const d = distanceM(data.to, { lat: s.lat, lng: s.lng });
        return { ...s, distanceM: d, walkSec: Math.round(d / WALK_M_PER_S) };
      })
      .filter((s) => s.distanceM <= MAX_ACCESS_WALK_M)
      .sort((a, b) => a.distanceM - b.distanceM);
    if (dropoffs.length === 0) return null;

    const pickup = pickups[0];
    // Prefer a dropoff in the same city as the pickup (we don't expect
    // anyone to cycle between cities, but it's a defensive filter).
    const dropoff =
      dropoffs.find((d) => d.cityId === pickup.cityId) ?? dropoffs[0];
    if (dropoff.cityId !== pickup.cityId) return null;

    const rideM = distanceM(
      { lat: pickup.lat, lng: pickup.lng },
      { lat: dropoff.lat, lng: dropoff.lng },
    );
    if (rideM < 800) return null; // too short to be worth unlocking

    const rideSec = Math.round(rideM / BIKE_M_PER_S);
    const totalSec =
      pickup.walkSec + UNLOCK_SEC + rideSec + RETURN_SEC + dropoff.walkSec;

    const busOnly = data.busOnlyDurationSec ?? null;
    let reason: BikeShareSuggestion["reason"];
    let savings = 0;
    if (busOnly == null) {
      reason = "no-bus-only";
    } else if (busOnly - totalSec >= MIN_SAVING_SEC) {
      reason = "faster";
      savings = busOnly - totalSec;
    } else {
      return null;
    }

    const cityMeta = CITY_BY_UID[
      Object.entries(CITY_BY_UID).find(([, m]) => m.id === pickup.cityId)?.[0] as unknown as number
    ];

    return {
      pickup,
      dropoff,
      rideSec,
      rideMeters: Math.round(rideM),
      totalSec,
      busOnlySec: busOnly,
      savingsSec: savings,
      reason,
      cityName: pickup.cityName,
      webDeepLink: cityMeta?.web ?? "https://www.nextbike.com.cy/en/",
      mapsDeepLink: `https://www.google.com/maps/dir/?api=1&origin=${pickup.lat},${pickup.lng}&destination=${dropoff.lat},${dropoff.lng}&travelmode=bicycling`,
    };
  });
