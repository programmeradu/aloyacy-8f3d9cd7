// Reports the rider's GPS to the public rider-fix endpoint while they're
// on board a bus. Fixes feed into the crowdsourced vehicle position so the
// bus marker stays smooth even when the official GTFS-RT feed is sparse.

import { useEffect, useRef } from "react";
import type { LiveFix } from "./useGeoWatch";
import { getDeviceId } from "./pwa";

const REPORT_INTERVAL_MS = 5_000;
const MAX_ACCURACY_M = 80; // ignore wildly-noisy fixes (indoors, multipath)

export function useRiderFixReporter(opts: {
  enabled: boolean;
  fix: LiveFix | null;
  tripId: string | null;
  routeId?: string;
}) {
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!opts.enabled || !opts.fix || !opts.tripId) return;
    if (opts.fix.accuracyM > MAX_ACCURACY_M) return;
    const now = Date.now();
    if (now - lastSentRef.current < REPORT_INTERVAL_MS) return;
    lastSentRef.current = now;

    const body = {
      deviceId: getDeviceId(),
      tripId: opts.tripId,
      routeId: opts.routeId,
      lat: opts.fix.lat,
      lng: opts.fix.lng,
      bearing: opts.fix.headingDeg ?? undefined,
      speedMps: opts.fix.speedMps ?? undefined,
      accuracyM: opts.fix.accuracyM,
    };
    void fetch("/api/public/rider-fix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  }, [opts.enabled, opts.fix, opts.tripId, opts.routeId]);
}
