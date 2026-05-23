// Walk-links cache — Phase 1 foundation for the multi-leg planner.
//
// Lazily fetches and caches real walking routes between bus stops using
// Google Directions API. Stop pairs are stored in canonical order
// (smaller id first) so A→B and B→A share one cache row.
//
// Two failure modes are handled explicitly:
//   1. Network / quota error → return a "soft fallback" derived from
//      straight-line distance × 1.35 detour factor at 1.35 m/s walking pace.
//      The fallback is NEVER persisted to the cache — only Google-verified
//      paths are written. This way a transient outage doesn't poison the cache.
//   2. Google returns ZERO_RESULTS → persist a sentinel row with a very
//      large duration so the planner deprioritises it without retrying.
//
// Concurrency: a tiny per-pair promise registry prevents duplicate in-flight
// Google calls when the planner asks for the same pair multiple times in one
// search.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { STOPS, distanceKm } from "./gtfs";

const STOP_BY_ID = new Map(STOPS.map((s) => [s.id, s]));

const WALK_PACE_MPS = 1.35; // ~4.86 km/h, a calm Mediterranean walk
const DETOUR_FACTOR = 1.35;
const SENTINEL_DURATION_SEC = 99_999;

export type WalkLink = {
  fromStopId: string;
  toStopId: string;
  distanceM: number;
  durationSec: number;
  polyline: string;
  /** True when this came from cache or Google, false when it's a soft fallback. */
  verified: boolean;
};

function canonicalPair(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a];
}

function softFallback(fromId: string, toId: string): WalkLink {
  const a = STOP_BY_ID.get(fromId);
  const b = STOP_BY_ID.get(toId);
  if (!a || !b) {
    return {
      fromStopId: fromId,
      toStopId: toId,
      distanceM: SENTINEL_DURATION_SEC,
      durationSec: SENTINEL_DURATION_SEC,
      polyline: "",
      verified: false,
    };
  }
  const km = distanceKm(a, b);
  const meters = Math.round(km * 1000 * DETOUR_FACTOR);
  const seconds = Math.round(meters / WALK_PACE_MPS);
  return {
    fromStopId: fromId,
    toStopId: toId,
    distanceM: meters,
    durationSec: seconds,
    polyline: "",
    verified: false,
  };
}

const inFlight = new Map<string, Promise<WalkLink>>();

/**
 * Returns a real (or cached, or soft-fallback) walking link between two stops.
 * The returned object always uses the caller's from→to direction; the
 * underlying cache stores the canonical pair only.
 */
export async function getWalkLink(fromId: string, toId: string): Promise<WalkLink> {
  if (fromId === toId) {
    return {
      fromStopId: fromId,
      toStopId: toId,
      distanceM: 0,
      durationSec: 0,
      polyline: "",
      verified: true,
    };
  }

  const [lo, hi] = canonicalPair(fromId, toId);
  const key = `${lo}|${hi}`;

  // 1) Cache hit
  const cached = await readCache(lo, hi);
  if (cached) return reorient(cached, fromId, toId);

  // 2) Coalesce concurrent fetches for the same pair
  const existing = inFlight.get(key);
  if (existing) return reorient(await existing, fromId, toId);

  const p = fetchAndStore(lo, hi);
  inFlight.set(key, p);
  try {
    const link = await p;
    return reorient(link, fromId, toId);
  } finally {
    inFlight.delete(key);
  }
}

function reorient(link: WalkLink, wantFrom: string, wantTo: string): WalkLink {
  if (link.fromStopId === wantFrom) return link;
  return { ...link, fromStopId: wantFrom, toStopId: wantTo };
}

async function readCache(lo: string, hi: string): Promise<WalkLink | null> {
  const { data, error } = await supabaseAdmin
    .from("walk_links")
    .select("from_stop_id, to_stop_id, distance_m, duration_sec, polyline")
    .eq("from_stop_id", lo)
    .eq("to_stop_id", hi)
    .maybeSingle();
  if (error || !data) return null;
  return {
    fromStopId: data.from_stop_id,
    toStopId: data.to_stop_id,
    distanceM: data.distance_m,
    durationSec: data.duration_sec,
    polyline: data.polyline,
    verified: true,
  };
}

async function fetchAndStore(lo: string, hi: string): Promise<WalkLink> {
  const a = STOP_BY_ID.get(lo);
  const b = STOP_BY_ID.get(hi);
  if (!a || !b) return softFallback(lo, hi);

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    console.warn("[walk-links] GOOGLE_MAPS_API_KEY missing — returning soft fallback");
    return softFallback(lo, hi);
  }

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${a.lat},${a.lng}`);
  url.searchParams.set("destination", `${b.lat},${b.lng}`);
  url.searchParams.set("mode", "walking");
  url.searchParams.set("key", key);

  try {
    const res = await fetch(url.toString());
    const json: any = await res.json();

    if (json.status === "ZERO_RESULTS") {
      // Persist a sentinel so we don't keep hammering Google for unreachable pairs.
      const sentinel: WalkLink = {
        fromStopId: lo,
        toStopId: hi,
        distanceM: SENTINEL_DURATION_SEC,
        durationSec: SENTINEL_DURATION_SEC,
        polyline: "",
        verified: true,
      };
      await writeCache(sentinel);
      return sentinel;
    }

    if (json.status !== "OK" || !json.routes?.[0]?.legs?.[0]) {
      console.warn("[walk-links] non-OK status:", json.status, json.error_message);
      return softFallback(lo, hi);
    }

    const leg = json.routes[0].legs[0];
    const link: WalkLink = {
      fromStopId: lo,
      toStopId: hi,
      distanceM: Math.round(leg.distance.value),
      durationSec: Math.round(leg.duration.value),
      polyline: json.routes[0].overview_polyline?.points ?? "",
      verified: true,
    };
    await writeCache(link);
    return link;
  } catch (err) {
    console.warn("[walk-links] fetch failed:", err);
    return softFallback(lo, hi);
  }
}

async function writeCache(link: WalkLink): Promise<void> {
  const { error } = await supabaseAdmin.from("walk_links").upsert(
    {
      from_stop_id: link.fromStopId,
      to_stop_id: link.toStopId,
      distance_m: link.distanceM,
      duration_sec: link.durationSec,
      polyline: link.polyline,
    },
    { onConflict: "from_stop_id,to_stop_id" },
  );
  if (error) console.warn("[walk-links] cache write failed:", error.message);
}
