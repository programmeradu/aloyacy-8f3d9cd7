// Server-only helper: decode Cyprus GTFS-RT feed → compact JSON.
// The upstream endpoint is HTTP-only, so the browser cannot fetch it directly
// from a published HTTPS site. We proxy through this server route.
//
// We also fold in crowdsourced rider GPS fixes — when a rider is on board
// and reporting position via /api/public/rider-fix, those fixes appear in
// the `vehicles` list (overriding stale upstream positions) so every other
// passenger sees a smoother bus and better ETAs.

import gr from "gtfs-realtime-bindings";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Cyprus upstream blocks Cloudflare Worker IPs, so we go through a tiny
// Vercel Node function that fetches the raw protobuf and forwards it.
const FEED_URL = "https://programmeradu-aloya-proxy.vercel.app/api/feed";

/** Rider fixes are trusted over upstream when they are this fresh. */
const RIDER_FIX_TRUST_SEC = 25;
/** Upstream is considered stale relative to a rider fix this much fresher. */
const RIDER_PREFER_DELTA_SEC = 10;

export type LiveVehicle = {
  id: string;
  routeId: string;
  tripId: string;
  lat: number;
  lng: number;
  bearing: number;
  speed: number;
  label: string;
  timestamp: number;
  /** Where this position came from. "rider" = crowdsourced GPS. */
  source?: "feed" | "rider" | "feed+rider";
};

export type LiveArrival = {
  stopId: string;
  routeId: string;
  tripId: string;
  arrivalUnix: number;
  delaySec: number;
};

export type RiderConfirmedTrip = {
  tripId: string;
  /** Seconds since the most recent rider sighting. */
  ageSec: number;
  /** Distinct riders that confirmed this trip in the trust window. */
  count: number;
  /** Trust-weighted confidence 0..1 combining distinct-rider count,
   *  recency, and each rider's historical trust score. */
  confidence: number;
};

export type RealtimeSnapshot = {
  fetchedAt: number;
  vehicles: LiveVehicle[];
  arrivals: LiveArrival[];
  /** Trip IDs with an active arrival in the next 30 min but no fresh vehicle
   *  position (≥ 180 s old, or none at all). Consumers downgrade these trips
   *  from "live" to scheduled/ghost across every surface. Trips confirmed by
   *  a recent rider sighting are excluded — they live in `riderConfirmedTrips`
   *  instead. */
  ghostTripIds?: string[];
  /** Trips a rider physically confirmed they can see within the last ~90 s.
   *  Used by the freshness classifier to upgrade trips from ghost/predicted
   *  to the `rider-confirmed` tier. */
  riderConfirmedTrips?: RiderConfirmedTrip[];
  /** True when the upstream feed could not be reached and this snapshot is
   *  an empty fallback. UI surfaces an honest "live feed lost" banner. */
  stale?: boolean;
  /** Diagnostic message accompanying `stale: true`. Not surfaced to users. */
  error?: string;
};


async function fetchUpstream(): Promise<{
  vehicles: LiveVehicle[];
  arrivals: LiveArrival[];
}> {
  const res = await fetch(FEED_URL, {
    headers: {
      Accept: "application/octet-stream",
      "User-Agent":
        "Mozilla/5.0 (Aloya/1.0; +https://app.aloya.cy) AppleWebKit/537.36",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GTFS-RT upstream ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const feed = gr.transit_realtime.FeedMessage.decode(buf);

  const vehicles: LiveVehicle[] = [];
  const arrivals: LiveArrival[] = [];
  for (const e of feed.entity) {
    if (e.vehicle?.position && e.vehicle.trip) {
      vehicles.push({
        id: e.id,
        routeId: String(e.vehicle.trip.routeId ?? ""),
        tripId: String(e.vehicle.trip.tripId ?? ""),
        lat: e.vehicle.position.latitude,
        lng: e.vehicle.position.longitude,
        bearing: e.vehicle.position.bearing ?? 0,
        speed: e.vehicle.position.speed ?? 0,
        label: e.vehicle.vehicle?.label ?? "",
        timestamp: Number(e.vehicle.timestamp ?? 0),
        source: "feed",
      });
    }
    if (e.tripUpdate?.stopTimeUpdate?.length) {
      const tu = e.tripUpdate;
      for (const stu of tu.stopTimeUpdate ?? []) {
        const t = stu.arrival?.time ?? stu.departure?.time;
        if (!t) continue;
        arrivals.push({
          stopId: String(stu.stopId ?? ""),
          routeId: String(tu.trip?.routeId ?? ""),
          tripId: String(tu.trip?.tripId ?? ""),
          arrivalUnix: Number(t),
          delaySec: stu.arrival?.delay ?? stu.departure?.delay ?? 0,
        });
      }
    }
  }
  return { vehicles, arrivals };
}

async function fetchRiderFixes(): Promise<LiveVehicle[]> {
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("rider_vehicle_fixes")
    .select("trip_id, route_id, lat, lng, bearing, speed_mps, reported_at")
    .gte("reported_at", cutoff)
    .order("reported_at", { ascending: false })
    .limit(500);
  if (error || !data) return [];
  // Keep only the freshest fix per tripId.
  const seen = new Set<string>();
  const out: LiveVehicle[] = [];
  for (const row of data) {
    if (seen.has(row.trip_id)) continue;
    seen.add(row.trip_id);
    out.push({
      id: `rider:${row.trip_id}`,
      tripId: row.trip_id,
      routeId: row.route_id ?? "",
      lat: row.lat,
      lng: row.lng,
      bearing: row.bearing ?? 0,
      speed: row.speed_mps ?? 0,
      label: "",
      timestamp: Math.floor(new Date(row.reported_at).getTime() / 1000),
      source: "rider",
    });
  }
  return out;
}

async function fetchSightings(): Promise<RiderConfirmedTrip[]> {
  // Trust window: 90 s for the freshness upgrade. We also read a wider
  // 7-day slice for per-device trust weighting so a rider with a consistent
  // sighting history counts more than a first-tap device.
  const WINDOW_SEC = 90;
  const now = Date.now();
  const cutoff = new Date(now - WINDOW_SEC * 1000).toISOString();
  const trustCutoff = new Date(now - 7 * 86_400_000).toISOString();
  const [{ data: recent, error }, { data: history }] = await Promise.all([
    supabaseAdmin
      .from("bus_sightings")
      .select("trip_id, device_id, reported_at")
      .gte("reported_at", cutoff)
      .order("reported_at", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("bus_sightings")
      .select("device_id")
      .gte("reported_at", trustCutoff)
      .limit(5000),
  ]);
  if (error || !recent || recent.length === 0) return [];

  // Per-device trust: sightings-per-week is a crude but useful proxy — a
  // device that only ever taps once is treated conservatively (0.8),
  // while a device with sustained history is weighted up (max 1.5).
  const seenByDevice = new Map<string, number>();
  for (const row of history ?? []) {
    seenByDevice.set(row.device_id, (seenByDevice.get(row.device_id) ?? 0) + 1);
  }
  const trustOf = (deviceId: string) => {
    const n = seenByDevice.get(deviceId) ?? 0;
    if (n <= 1) return 0.8;
    if (n <= 4) return 1;
    if (n <= 12) return 1.25;
    return 1.5;
  };

  type Agg = {
    tripId: string;
    ageSec: number;
    devices: Set<string>;
    weightedCount: number;
  };
  const byTrip = new Map<string, Agg>();
  for (const row of recent) {
    const ageSec = Math.max(0, Math.floor((now - new Date(row.reported_at).getTime()) / 1000));
    const existing = byTrip.get(row.trip_id);
    if (existing) {
      if (!existing.devices.has(row.device_id)) {
        existing.devices.add(row.device_id);
        existing.weightedCount += trustOf(row.device_id);
      }
      existing.ageSec = Math.min(existing.ageSec, ageSec);
    } else {
      byTrip.set(row.trip_id, {
        tripId: row.trip_id,
        ageSec,
        devices: new Set([row.device_id]),
        weightedCount: trustOf(row.device_id),
      });
    }
  }

  return Array.from(byTrip.values()).map((a) => {
    const recency = Math.max(0, 1 - a.ageSec / WINDOW_SEC);
    // Weighted-count saturates at ~3 trusted riders → confidence 1.
    const density = Math.min(1, a.weightedCount / 3);
    const confidence = Math.round((0.35 * recency + 0.65 * density) * 100) / 100;
    return { tripId: a.tripId, ageSec: a.ageSec, count: a.devices.size, confidence };
  });
}

export async function fetchRealtime(): Promise<RealtimeSnapshot> {
  const now = Math.floor(Date.now() / 1000);
  const [upstreamResult, riderFixes, sightings] = await Promise.all([
    fetchUpstream().catch((e) => ({ error: e as Error })),
    fetchRiderFixes().catch(() => [] as LiveVehicle[]),
    fetchSightings().catch(() => [] as RiderConfirmedTrip[]),
  ]);

  if ("error" in upstreamResult) {
    // Upstream down — still surface rider fixes as the only source of truth.
    return {
      fetchedAt: now,
      vehicles: riderFixes,
      arrivals: [],
      riderConfirmedTrips: sightings,
      stale: riderFixes.length === 0,
      error: upstreamResult.error.message,
    };
  }

  const { vehicles, arrivals } = upstreamResult;
  // Merge: a rider fix wins when it's fresh AND newer than the upstream
  // position by RIDER_PREFER_DELTA_SEC. Otherwise upstream wins.
  const byTrip = new Map<string, LiveVehicle>();
  for (const v of vehicles) byTrip.set(v.tripId, v);
  for (const r of riderFixes) {
    const ageSec = now - r.timestamp;
    if (ageSec > RIDER_FIX_TRUST_SEC) continue;
    const upstream = byTrip.get(r.tripId);
    if (!upstream) {
      byTrip.set(r.tripId, r);
    } else if (r.timestamp - upstream.timestamp >= RIDER_PREFER_DELTA_SEC) {
      byTrip.set(r.tripId, {
        ...upstream,
        lat: r.lat,
        lng: r.lng,
        bearing: r.bearing || upstream.bearing,
        speed: r.speed || upstream.speed,
        timestamp: r.timestamp,
        source: "feed+rider",
      });
    }
  }

  const mergedVehicles = [...byTrip.values()];

  // Ghost detection: any trip with an upcoming arrival in the next 30 min
  // that has no fresh vehicle position (≥180 s old, or none). Tagged here
  // so every consumer reads one truth — see src/lib/freshness.ts.
  const GHOST_AGE_SEC = 180;
  const SOON_WINDOW_SEC = 30 * 60;
  const confirmedSet = new Set(sightings.map((s) => s.tripId));
  const ghostTripIds: string[] = [];
  const tripsWithUpcoming = new Set<string>();
  for (const a of arrivals) {
    if (a.arrivalUnix >= now - 30 && a.arrivalUnix <= now + SOON_WINDOW_SEC) {
      tripsWithUpcoming.add(a.tripId);
    }
  }
  for (const tripId of tripsWithUpcoming) {
    // Rider-confirmed trips are NOT ghosts — at least one rider physically
    // sees this bus right now, so we trust it even without a fresh feed row.
    if (confirmedSet.has(tripId)) continue;
    const v = byTrip.get(tripId);
    if (!v) {
      ghostTripIds.push(tripId);
      continue;
    }
    if (v.timestamp && now - v.timestamp >= GHOST_AGE_SEC) {
      ghostTripIds.push(tripId);
    }
  }

  return {
    fetchedAt: now,
    vehicles: mergedVehicles,
    arrivals,
    ghostTripIds,
    riderConfirmedTrips: sightings,
  };
}


