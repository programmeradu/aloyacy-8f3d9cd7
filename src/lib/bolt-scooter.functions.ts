// Wave 3 — Bolt e-scooter intelligence (Nicosia).
//
// Bolt is the only e-scooter operator in Cyprus with a public, gov-curated
// data source: CyNAP (Cyprus National Access Point) publishes the Datex II
// "boltstations" dataset listing every mandated parking zone in Nicosia.
//
// IMPORTANT — what the feed gives us, and what it doesn't:
//   • Gives us:    zone name, polygon centroid, parking capacity (slots)
//   • Doesn't give: live scooter inventory (proprietary to the Bolt app)
//
// So we are conservative on purpose: we never claim "X scooters here". We
// surface a "scoot it" alternative only when BOTH endpoints sit within a
// short walk of an official parking zone — that's the legal precondition
// for starting/ending a Bolt ride in Nicosia. Riders open the Bolt app to
// confirm live availability; our deep links take them straight there.
//
// Honesty rules:
//   • Only triggers inside the Nicosia coverage area.
//   • Both pickup AND dropoff zone must be within MAX_ACCESS_WALK_M.
//   • Trip must be in the sweet spot (0.8 – 4 km) — under 0.8 km walking
//     wins; over 4 km the bus wins on price and physical comfort.
//   • Bus baseline must be ≥ MIN_SAVING_SEC slower (or absent) to suggest.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { distanceM } from "./geo";

const FEED_URL =
  "https://fixcyprus.cy/gnosis/open/api/nap/datasets/boltstations/";

// Pace assumptions tuned for Nicosia: scooter speed limited to 20 km/h on
// shared paths and 15 km/h on sidewalks; 14 km/h average accounts for
// stops, junctions, and the inevitable cobbled side street.
const WALK_M_PER_S = 1.35;
const SCOOT_M_PER_S = 14_000 / 3600; // ≈ 3.89 m/s
const UNLOCK_SEC = 45; // open Bolt app, scan QR, accept
const PARK_SEC = 45; // park in zone, photograph, end ride

const MAX_ACCESS_WALK_M = 350; // Nicosia zone grid is dense; tight is honest
const MIN_SCOOT_OD_M = 800;
const MAX_SCOOT_OD_M = 4000;
const MIN_SAVING_SEC = 2 * 60;

// Approximate Nicosia coverage bounding box (Bolt only operates inside
// this ring — Strovolos, old town, Aglandjia, Engomi, Latsia, Lakatameia).
const NICOSIA_BOUNDS = {
  minLat: 35.07,
  maxLat: 35.22,
  minLng: 33.27,
  maxLng: 33.45,
};

function inNicosia(p: { lat: number; lng: number }): boolean {
  return (
    p.lat >= NICOSIA_BOUNDS.minLat &&
    p.lat <= NICOSIA_BOUNDS.maxLat &&
    p.lng >= NICOSIA_BOUNDS.minLng &&
    p.lng <= NICOSIA_BOUNDS.maxLng
  );
}

export type BoltZone = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  capacity: number;
};

export type BoltZoneNear = BoltZone & {
  distanceM: number;
  walkSec: number;
};

// Module cache — Datex feed refreshes ≤ every 30 min, so 10 min is safe.
let cache: { at: number; data: BoltZone[] } | null = null;
const CACHE_TTL_MS = 10 * 60_000;

// Minimal Datex II XML parser — we only need <sharedMobility> blocks
// with their identifier, name, capacity and the first <pointCoordinates>
// pair (the centroid is the first ring vertex; close enough for routing).
function parseFeed(xml: string): BoltZone[] {
  const out: BoltZone[] = [];
  const blocks = xml.split(/<sharedMobility>/g).slice(1);
  for (const raw of blocks) {
    const block = raw.split("</sharedMobility>")[0];
    if (!block) continue;
    const idM = block.match(/<common:identifier>([^<]+)<\/common:identifier>/);
    const nameM = block.match(
      /<sharedMobilityFacilityName>[\s\S]*?<common:value>([^<]+)<\/common:value>/,
    );
    const capM = block.match(/<capacity>(\d+)<\/capacity>/);
    const pointM = block.match(
      /<location:pointByCoordinates>[\s\S]*?<common:latitude>([\d.+-]+)<\/common:latitude>[\s\S]*?<common:longitude>([\d.+-]+)<\/common:longitude>/,
    );
    if (!idM || !nameM || !pointM) continue;
    const lat = Number(pointM[1]);
    const lng = Number(pointM[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({
      id: idM[1],
      name: nameM[1].trim(),
      lat,
      lng,
      capacity: capM ? Number(capM[1]) : 0,
    });
  }
  return out;
}

async function loadZones(): Promise<BoltZone[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  try {
    const res = await fetch(FEED_URL, {
      headers: { accept: "application/xml,text/xml,*/*" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`cynap ${res.status}`);
    const xml = await res.text();
    const data = parseFeed(xml);
    if (data.length === 0) throw new Error("empty feed");
    cache = { at: Date.now(), data };
    return data;
  } catch (err) {
    if (cache) return cache.data;
    console.error("[bolt] feed load failed", err);
    return [];
  }
}

const Pt = z.object({
  lat: z.number().min(34).max(36),
  lng: z.number().min(32).max(35),
});

export const nearestBoltZones = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        near: Pt,
        max: z.number().int().min(1).max(10).optional(),
        radiusM: z.number().int().min(50).max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<BoltZoneNear[]> => {
    if (!inNicosia(data.near)) return [];
    const all = await loadZones();
    const radius = data.radiusM ?? 600;
    const max = data.max ?? 4;
    return all
      .map<BoltZoneNear>((z0) => {
        const d = distanceM(data.near, { lat: z0.lat, lng: z0.lng });
        return { ...z0, distanceM: d, walkSec: Math.round(d / WALK_M_PER_S) };
      })
      .filter((z0) => z0.distanceM <= radius)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, max);
  });

export type BoltScooterSuggestion = {
  pickup: BoltZoneNear;
  dropoff: BoltZoneNear;
  rideSec: number;
  rideMeters: number;
  totalSec: number;
  busOnlySec: number | null;
  savingsSec: number;
  reason: "faster" | "no-bus-only";
  appDeepLink: string;
  mapsDeepLink: string;
};

export const suggestBoltScooter = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        from: Pt,
        to: Pt,
        busOnlyDurationSec: z.number().int().positive().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<BoltScooterSuggestion | null> => {
    // Nicosia-only by design — the rest of the island has no Bolt zones.
    if (!inNicosia(data.from) || !inNicosia(data.to)) return null;

    const odM = distanceM(data.from, data.to);
    if (odM < MIN_SCOOT_OD_M || odM > MAX_SCOOT_OD_M) return null;

    const all = await loadZones();
    if (all.length === 0) return null;

    const candidatesFrom = all
      .map<BoltZoneNear>((z0) => {
        const d = distanceM(data.from, { lat: z0.lat, lng: z0.lng });
        return { ...z0, distanceM: d, walkSec: Math.round(d / WALK_M_PER_S) };
      })
      .filter((z0) => z0.distanceM <= MAX_ACCESS_WALK_M)
      .sort((a, b) => a.distanceM - b.distanceM);
    if (candidatesFrom.length === 0) return null;

    const candidatesTo = all
      .map<BoltZoneNear>((z0) => {
        const d = distanceM(data.to, { lat: z0.lat, lng: z0.lng });
        return { ...z0, distanceM: d, walkSec: Math.round(d / WALK_M_PER_S) };
      })
      .filter((z0) => z0.distanceM <= MAX_ACCESS_WALK_M)
      .sort((a, b) => a.distanceM - b.distanceM);
    if (candidatesTo.length === 0) return null;

    const pickup = candidatesFrom[0];
    const dropoff = candidatesTo[0];
    // Refuse if the pickup zone is the same as the dropoff zone — riders
    // would walk past the destination to start a scoot back.
    if (pickup.id === dropoff.id) return null;

    const rideM = distanceM(
      { lat: pickup.lat, lng: pickup.lng },
      { lat: dropoff.lat, lng: dropoff.lng },
    );
    if (rideM < 600) return null;

    const rideSec = Math.round(rideM / SCOOT_M_PER_S);
    const totalSec =
      pickup.walkSec + UNLOCK_SEC + rideSec + PARK_SEC + dropoff.walkSec;

    const busOnly = data.busOnlyDurationSec ?? null;
    let reason: BoltScooterSuggestion["reason"];
    let savings = 0;
    if (busOnly == null) {
      reason = "no-bus-only";
    } else if (busOnly - totalSec >= MIN_SAVING_SEC) {
      reason = "faster";
      savings = busOnly - totalSec;
    } else {
      return null;
    }

    // Bolt universal link — opens the scooter tab in-app, falls back to
    // the marketing page in browsers without the app installed.
    const appDeepLink = `https://bolt.eu/en-cy/scooters/`;
    const mapsDeepLink = `https://www.google.com/maps/dir/?api=1&origin=${pickup.lat},${pickup.lng}&destination=${dropoff.lat},${dropoff.lng}&travelmode=bicycling`;

    return {
      pickup,
      dropoff,
      rideSec,
      rideMeters: Math.round(rideM),
      totalSec,
      busOnlySec: busOnly,
      savingsSec: savings,
      reason,
      appDeepLink,
      mapsDeepLink,
    };
  });
