// Client-side prediction sampler. One row per (trip, stop) per 60 s, fire
// and forget. smartEtaV2 stays pure — surfaces call this from useEffect.

export type EtaLogSurface = "stop-card" | "home" | "hud" | "multileg" | "push" | "promise" | "api";

export type EtaLogRow = {
  tripId: string;
  routeId: string;
  stopId: string;
  horizonSec: number;
  p50Sec: number;
  p25Sec?: number;
  p90Sec?: number;
  tier: string;
  confidence: string;
  operatorEtaSec?: number;
  learnedBiasSec?: number;
  surface: EtaLogSurface;
};

const WINDOW_MS = 60_000;
const last = new Map<string, number>();

export function sampleEtaPrediction(row: EtaLogRow): void {
  if (typeof fetch !== "function") return;
  if (!row.tripId || !row.stopId || !Number.isFinite(row.p50Sec)) return;
  const key = `${row.tripId}|${row.stopId}|${row.surface}`;
  const now = Date.now();
  if ((last.get(key) ?? 0) + WINDOW_MS > now) return;
  last.set(key, now);
  if (last.size > 400) {
    for (const [k, t] of last) {
      if (now - t > WINDOW_MS * 2) last.delete(k);
    }
  }
  void fetch("/api/public/eta-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(row),
    keepalive: true,
  }).catch(() => {});
}

/** Test hook — not used in production. */
export function _resetEtaLogSampler() {
  last.clear();
}
