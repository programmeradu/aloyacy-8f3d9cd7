// Server-only helper: decode Cyprus GTFS-RT feed → compact JSON.
// The upstream endpoint is HTTP-only, so the browser cannot fetch it directly
// from a published HTTPS site. We proxy through this server route.

import gr from "gtfs-realtime-bindings";

const FEED_URL = "http://20.19.98.194:8328/Api/api/gtfs-realtime";

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
};

export type LiveArrival = {
  stopId: string;
  routeId: string;
  tripId: string;
  arrivalUnix: number;
  delaySec: number;
};

export type RealtimeSnapshot = {
  fetchedAt: number;
  vehicles: LiveVehicle[];
  arrivals: LiveArrival[];
};

export async function fetchRealtime(): Promise<RealtimeSnapshot> {
  const res = await fetch(FEED_URL, {
    headers: { Accept: "application/octet-stream" },
    // Cyprus endpoint can be slow
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`GTFS-RT upstream ${res.status}`);
  }
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

  return { fetchedAt: Math.floor(Date.now() / 1000), vehicles, arrivals };
}
