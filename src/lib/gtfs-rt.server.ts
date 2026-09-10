// Server-only helper: decode Cyprus GTFS-RT feed → compact JSON.
// The upstream endpoint is HTTP-only, so the browser cannot fetch it directly
// from a published HTTPS site. We proxy through this server route.
//
// We also fold in crowdsourced rider GPS fixes — when a rider is on board
// and reporting position via /api/public/rider-fix, those fixes appear in
// the `vehicles` list (overriding stale upstream positions) so every other
// passenger sees a smoother bus and better ETAs.

import gr from "gtfs-realtime-bindings";
import { supabase } from "@/integrations/supabase/client";
import { fetchFeedOverSocket } from "@/lib/gtfs-socket.server";
import { getRoute } from "@/lib/gtfs";
import { cached, withTimeout } from "@/lib/server-cache";
import { tagGhostTripIds } from "@/lib/ghost-trips";
import { RIDER_PHYSICS_FOLD_MIN, riderFold } from "@aloya/core/rider-physics";
import {
  foldSightings,
  gpsReportsToSightings,
  SOURCE_WINDOW_SEC,
  type GpsReport,
  type SightingRow,
} from "@aloya/core/device-reputation";
import { loadCanCarryDevices } from "@/lib/device-reputation.server";

// Feed sources, tried in order until one returns a decodable protobuf.
//
// The upstream listens on http://20.19.98.194:8328 — a port Cloudflare's
// `fetch()` refuses to dial, which is what surfaced as a "403" from Worker
// egress. Raw TCP sockets have no such port restriction, so the Worker now
// talks to the upstream itself (see gtfs-socket.server.ts). HTTP relays stay
// in the chain as fallbacks.
const DIRECT_FEED = "http://20.19.98.194:8328/Api/api/gtfs-realtime";

/** Optional self-hosted relay (e.g. your own Cloudflare Worker). */
function relayUrl(): string | null {
  const u = process.env["GTFS_RELAY_URL"];
  return u && /^https?:\/\//.test(u) ? u : null;
}

function feedSources(): string[] {
  const custom = relayUrl();
  // The gtfs-proxy edge function only exists on the managed Supabase
  // project. A self-hosted stack has no edge runtime, so this hop drops
  // out of the chain automatically once CUSTOM_SUPABASE_URL moves — the
  // relay and the direct socket path still cover it.
  const base = process.env.CUSTOM_SUPABASE_URL?.replace(/\/+$/, "");
  let edgeProxy: string | null = null;
  try {
    if (base && new URL(base).hostname.endsWith(".supabase.co")) {
      edgeProxy = `${base}/functions/v1/gtfs-proxy`;
    }
  } catch {
    // Malformed CUSTOM_SUPABASE_URL — skip the edge hop rather than throw.
  }
  return [...(custom ? [custom] : []), ...(edgeProxy ? [edgeProxy] : []), DIRECT_FEED];
}

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
  /** 0..1 physics score when source is rider. Absent on feed pings. */
  physicsScore?: number;
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
  /** True when a high-reputation device is among them and can carry alone. */
  canCarry?: boolean;
  /** 0..1 — recency × corroboration. Classifier uses count + canCarry. */
  confidence: number;
};

export type RealtimeSnapshot = {
  fetchedAt: number;
  vehicles: LiveVehicle[];
  arrivals: LiveArrival[];
  /** Trip IDs with an active arrival in the next 30 min but no fresh vehicle
   *  position (age ≥ the agency ghost cutoff, or none at all). Consumers
   *  downgrade these trips from "live" to scheduled/ghost across every
   *  surface. Cutoff is `thresholdsFor(agency).ghost` — urban 180 s,
   *  Intercity 300 s — so this list never disagrees with the classifier.
   *  Trips confirmed by a recent rider sighting are excluded — they live
   *  in `riderConfirmedTrips` instead. */

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

/** Fetch the raw protobuf, trying each source until one yields bytes. */
async function fetchFeedBytes(): Promise<Uint8Array> {
  const failures: string[] = [];

  // 1) Raw TCP straight from our own Cloudflare Worker — no relay hop.
  try {
    const buf = await fetchFeedOverSocket();
    if (buf.byteLength > 0) return buf;
    failures.push("socket empty");
  } catch (e) {
    failures.push(`socket ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2) HTTP relays (self-hosted Worker, then Lovable Cloud, then direct).
  const token = process.env["GTFS_RELAY_TOKEN"];
  for (const url of feedSources()) {
    try {
      const headers: Record<string, string> = {
        Accept: "application/octet-stream",
        "User-Agent": "Mozilla/5.0 (Aloya/1.0; +https://app.aloya.cy) AppleWebKit/537.36",
      };
      if (token && url === process.env["GTFS_RELAY_URL"]) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) {
        failures.push(`${new URL(url).host} ${res.status}`);
        continue;
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength === 0) {
        failures.push(`${new URL(url).host} empty`);
        continue;
      }
      return buf;
    } catch (e) {
      failures.push(`${new URL(url).host} ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(`GTFS-RT upstream unreachable (${failures.join("; ")})`);
}

async function fetchUpstream(): Promise<{
  vehicles: LiveVehicle[];
  arrivals: LiveArrival[];
}> {
  const buf = await fetchFeedBytes();
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

type RiderFixRow = {
  trip_id: string;
  route_id: string | null;
  lat: number;
  lng: number;
  bearing: number | null;
  speed_mps: number | null;
  reported_at: string;
  physics_score?: number | null;
  device_id?: string | null;
};

async function fetchRiderFixes(): Promise<{ vehicles: LiveVehicle[]; reports: SightingRow[] }> {
  const now = Date.now();
  const cutoff = new Date(now - SOURCE_WINDOW_SEC * 1000).toISOString();
  const run = (cols: string) =>
    supabase
      .from("rider_vehicle_fixes")
      .select(cols)
      .gte("reported_at", cutoff)
      .order("reported_at", { ascending: false })
      .limit(500)
      .returns<RiderFixRow[]>();
  let { data, error } = await run(
    "trip_id, route_id, lat, lng, bearing, speed_mps, reported_at, physics_score, device_id",
  );
  if (error) {
    ({ data, error } = await run(
      "trip_id, route_id, lat, lng, bearing, speed_mps, reported_at, device_id",
    ));
  }
  if (error || !data) return { vehicles: [], reports: [] };
  const seen = new Set<string>();
  const vehicles: LiveVehicle[] = [];
  const gps: GpsReport[] = [];
  for (const row of data) {
    const score = row.physics_score;
    const ageSec = Math.max(0, Math.floor((now - new Date(row.reported_at).getTime()) / 1000));
    gps.push({
      tripId: row.trip_id,
      deviceId: row.device_id ?? "",
      ageSec,
      physicsScore: score,
    });
    if (seen.has(row.trip_id)) continue;
    if (score != null && score < RIDER_PHYSICS_FOLD_MIN) continue;
    seen.add(row.trip_id);
    vehicles.push({
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
      physicsScore: score ?? undefined,
    });
  }
  return { vehicles, reports: gpsReportsToSightings(gps) };
}

async function fetchSightingRows(): Promise<SightingRow[]> {
  const now = Date.now();
  const cutoff = new Date(now - SOURCE_WINDOW_SEC * 1000).toISOString();
  const { data: recent, error } = await supabase
    .from("bus_sightings")
    .select("trip_id, device_id, reported_at")
    .gte("reported_at", cutoff)
    .order("reported_at", { ascending: false })
    .limit(500);
  if (error || !recent) return [];
  return recent.map((row) => ({
    tripId: row.trip_id as string,
    deviceId: row.device_id as string,
    ageSec: Math.max(0, Math.floor((now - new Date(row.reported_at).getTime()) / 1000)),
  }));
}

function foldConfirmed(rows: SightingRow[], carry: Set<string>): RiderConfirmedTrip[] {
  return foldSightings(rows, carry).map((a) => ({
    ...a,
    confidence: a.canCarry || a.count >= 2 ? 0.9 : 0.4,
  }));
}

/** How long one snapshot is reused. The upstream feed itself only refreshes
 *  every ~15 s, so anything shorter is pure duplicated work. */
const SNAPSHOT_TTL_MS = 10_000;
/** Rider sightings and reputation only refine the snapshot; when the database
 *  is slow they are dropped rather than delaying every rider's answer. */
const AUX_DB_TIMEOUT_MS = 1_200;

export function fetchRealtime(): Promise<RealtimeSnapshot> {
  return cached("realtime-snapshot", SNAPSHOT_TTL_MS, buildRealtime);
}

async function buildRealtime(): Promise<RealtimeSnapshot> {
  const now = Math.floor(Date.now() / 1000);
  const [upstreamResult, riderBundle, sightingRows] = await Promise.all([
    fetchUpstream().catch((e) => ({ error: e as Error })),
    withTimeout(fetchRiderFixes(), AUX_DB_TIMEOUT_MS, {
      vehicles: [] as LiveVehicle[],
      reports: [] as SightingRow[],
    }),
    withTimeout(fetchSightingRows(), AUX_DB_TIMEOUT_MS, [] as SightingRow[]),
  ]);
  const riderFixes = riderBundle.vehicles;
  const reports = [...sightingRows, ...riderBundle.reports];
  const carry = await withTimeout(
    loadCanCarryDevices(reports.map((r) => r.deviceId)),
    AUX_DB_TIMEOUT_MS,
    new Set<string>(),
  );
  const sightings = foldConfirmed(reports, carry);

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
  // Merge: a rider fix wins when it's fresh, physics-plausible, AND newer
  // than the upstream position by RIDER_PREFER_DELTA_SEC. Middling scores
  // only appear when the feed has nothing for that trip.
  const byTrip = new Map<string, LiveVehicle>();
  for (const v of vehicles) byTrip.set(v.tripId, v);
  for (const r of riderFixes) {
    const ageSec = now - r.timestamp;
    if (ageSec > RIDER_FIX_TRUST_SEC) continue;
    const upstream = byTrip.get(r.tripId);
    const fold = riderFold(r.physicsScore, !!upstream);
    if (fold === "skip") continue;
    if (fold === "place" || !upstream) {
      byTrip.set(r.tripId, r);
      continue;
    }
    if (r.timestamp - upstream.timestamp >= RIDER_PREFER_DELTA_SEC) {
      byTrip.set(r.tripId, {
        ...upstream,
        lat: r.lat,
        lng: r.lng,
        bearing: r.bearing || upstream.bearing,
        speed: r.speed || upstream.speed,
        timestamp: r.timestamp,
        source: "feed+rider",
        physicsScore: r.physicsScore,
      });
    }
  }

  const mergedVehicles = [...byTrip.values()];

  // Ghost detection: any trip with an upcoming arrival in the next 30 min
  // that has no fresh vehicle position. Agency-aware cutoff — see ghost-trips.ts.
  const confirmedSet = new Set(sightings.map((s) => s.tripId));
  const ghostTripIds = tagGhostTripIds({
    now,
    arrivals,
    vehicles: mergedVehicles,
    confirmedTripIds: confirmedSet,
    agencyForRoute: (routeId) => getRoute(routeId)?.agency,
  });

  return {
    fetchedAt: now,
    vehicles: mergedVehicles,
    arrivals,
    ghostTripIds,
    riderConfirmedTrips: sightings,
  };
}
