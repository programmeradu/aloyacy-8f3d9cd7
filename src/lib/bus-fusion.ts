// Pure helper for picking the best-available bus position. Used by both
// `useJourney` and `useMultiLegJourney` so they never disagree on where the
// bus "is" — which used to cause HUD vs map oscillation.
//
// Priority:
//   1. Fresh feed vehicle ping (< STALE_MS old)        → source: "feed"
//   2. Rider is on-bus and has a fused GPS fix         → source: "rider"
//   3. Blend feed + rider when both exist but feed is stale-ish → "blend"
//   4. Stale feed only                                  → "stale-feed"
//   5. null                                             → caller must fall back
//
// When a shape is provided, the chosen position is snapped to it so downstream
// distance-along math is consistent.

import type { LatLng } from "./geo";
import { distanceM, snapToPolyline } from "./geo";

export type FusionVehicle = {
  lat: number;
  lng: number;
  bearing?: number;
  speedMps?: number;
  /** Unix seconds when the feed last reported this vehicle. */
  timestamp?: number;
  tripId?: string;
};

export type FusionRiderFix = {
  lat: number;
  lng: number;
  bearingDeg?: number;
  speedMps?: number;
  /** ms since epoch. */
  timestamp?: number;
};

export type FusedBusPosition = {
  lat: number;
  lng: number;
  bearing: number | null;
  speedMps: number | null;
  source: "feed" | "rider" | "blend" | "stale-feed";
  /** Age of the underlying feed ping in seconds (Infinity when no feed). */
  feedAgeSec: number;
};

/** Feed pings older than this are considered stale. */
const FEED_STALE_SEC = 45;
/** Feed older than this is unusable on its own when rider GPS is available. */
const FEED_DEAD_SEC = 120;

export function fuseBusPosition(input: {
  vehicle: FusionVehicle | null | undefined;
  riderFix: FusionRiderFix | null | undefined;
  onBus: boolean;
  shape?: LatLng[] | null;
  nowMs?: number;
}): FusedBusPosition | null {
  const now = input.nowMs ?? Date.now();
  const v = input.vehicle ?? null;
  const r = input.riderFix ?? null;
  const onBus = !!input.onBus;

  const feedAgeSec = v?.timestamp
    ? Math.max(0, now / 1000 - v.timestamp)
    : v
    ? 0 // assume fresh if no timestamp on feed object
    : Infinity;

  let raw:
    | { lat: number; lng: number; bearing: number | null; speedMps: number | null; source: FusedBusPosition["source"] }
    | null = null;

  if (v && feedAgeSec < FEED_STALE_SEC) {
    // Fresh feed wins. If rider is on-bus and close, blend bearing/speed.
    if (onBus && r) {
      const drift = distanceM({ lat: v.lat, lng: v.lng }, { lat: r.lat, lng: r.lng });
      if (drift < 80) {
        raw = {
          lat: (v.lat + r.lat) / 2,
          lng: (v.lng + r.lng) / 2,
          bearing: v.bearing ?? r.bearingDeg ?? null,
          speedMps: r.speedMps ?? v.speedMps ?? null,
          source: "blend",
        };
      }
    }
    if (!raw) {
      raw = {
        lat: v.lat,
        lng: v.lng,
        bearing: v.bearing ?? null,
        speedMps: v.speedMps ?? null,
        source: "feed",
      };
    }
  } else if (onBus && r) {
    // Feed stale or missing — trust rider GPS while on-bus.
    raw = {
      lat: r.lat,
      lng: r.lng,
      bearing: r.bearingDeg ?? null,
      speedMps: r.speedMps ?? null,
      source: "rider",
    };
  } else if (v && feedAgeSec < FEED_DEAD_SEC) {
    raw = {
      lat: v.lat,
      lng: v.lng,
      bearing: v.bearing ?? null,
      speedMps: v.speedMps ?? null,
      source: "stale-feed",
    };
  }

  if (!raw) return null;

  // Snap to shape when available, so distance-along math is consistent.
  if (input.shape && input.shape.length >= 2) {
    const snap = snapToPolyline({ lat: raw.lat, lng: raw.lng }, input.shape);
    if (snap && snap.crossM < 50) {
      raw = { ...raw, lat: snap.snapped.lat, lng: snap.snapped.lng };
    }
  }

  return { ...raw, feedAgeSec };
}
