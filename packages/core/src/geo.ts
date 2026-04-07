// Geo primitives shared by the live journey tracker.
// All distances in meters, bearings in degrees clockwise from north.

export type LatLng = { lat: number; lng: number };

const R = 6_371_000; // Earth radius (m)
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearingDeg(from: LatLng, to: LatLng): number {
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lng - from.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Average urban walking pace (m/s). Same constant the planner uses.
export const WALK_M_PER_S = 1.35;

// ---- snap-to-polyline ------------------------------------------------------
// Equirectangular projection around the query point — accurate enough for
// snapping a phone GPS / bus ping to a route shape (sub-metre over a few km).

export type SnapResult = {
  /** Nearest point on the polyline. */
  snapped: LatLng;
  /** Index of the segment (path[i] → path[i+1]) the snap fell on. */
  segIndex: number;
  /** 0..1 position along that segment. */
  tAlong: number;
  /** Perpendicular distance from `point` to the polyline, in metres. */
  crossM: number;
  /** Cumulative distance along the polyline from path[0] to `snapped`, in metres. */
  alongM: number;
};

export function snapToPolyline(
  point: LatLng,
  path: LatLng[],
): SnapResult | null {
  if (path.length < 2) return null;
  const M_LAT = 110_540;
  const M_LNG = 111_320 * Math.cos((point.lat * Math.PI) / 180);
  const toXY = (q: LatLng) => ({
    x: (q.lng - point.lng) * M_LNG,
    y: (q.lat - point.lat) * M_LAT,
  });
  const xy = path.map(toXY);
  let best: { segIndex: number; t: number; fx: number; fy: number; d2: number } | null = null;
  let cum = 0;
  let cumAtBest = 0;
  for (let i = 0; i < xy.length - 1; i++) {
    const a = xy[i];
    const b = xy[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen === 0) continue;
    let t = -(a.x * dx + a.y * dy) / (segLen * segLen);
    t = Math.max(0, Math.min(1, t));
    const fx = a.x + t * dx;
    const fy = a.y + t * dy;
    const d2 = fx * fx + fy * fy;
    if (!best || d2 < best.d2) {
      best = { segIndex: i, t, fx, fy, d2 };
      cumAtBest = cum + t * segLen;
    }
    cum += segLen;
  }
  if (!best) return null;
  return {
    snapped: {
      lat: point.lat + best.fy / M_LAT,
      lng: point.lng + best.fx / M_LNG,
    },
    segIndex: best.segIndex,
    tAlong: best.t,
    crossM: Math.sqrt(best.d2),
    alongM: cumAtBest,
  };
}

/** Cumulative length of a polyline in metres. */
export function polylineLengthM(path: LatLng[]): number {
  let sum = 0;
  for (let i = 0; i < path.length - 1; i++) sum += distanceM(path[i], path[i + 1]);
  return sum;
}


export type WalkStep = {
  instruction: string;
  distanceMeters: number;
  maneuver: string;
  start: LatLng;
  end?: LatLng;
  heading: number;
};

// Returns the index of the step the user is currently executing, plus
// the meters remaining on that step and overall.
export function projectOnSteps(
  pos: LatLng,
  steps: WalkStep[],
  destination: LatLng,
): {
  currentIndex: number;
  metersToStepEnd: number;
  metersToDestination: number;
  walkingEtaSec: number;
} {
  if (steps.length === 0) {
    const d = distanceM(pos, destination);
    return {
      currentIndex: 0,
      metersToStepEnd: d,
      metersToDestination: d,
      walkingEtaSec: Math.round(d / WALK_M_PER_S),
    };
  }

  // Each step's "anchor" is its start; the next step's start is the prior
  // step's end. Final step ends at `destination`.
  const anchors: LatLng[] = steps.map((s) => s.start).concat([destination]);

  // Pick the step whose end the user is closest to — but only advance
  // forwards (never regress past a step we already left behind).
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < steps.length; i++) {
    const end = anchors[i + 1];
    const d = distanceM(pos, end);
    // Prefer the earliest step whose end is still ahead (>30m away or
    // first one whose end is within 60m and user hasn't already passed it).
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
    // If we're already within 25m of this step's end, we have completed it
    // — keep scanning for a later step but bias forward.
    if (d < 25 && i < steps.length - 1) continue;
  }
  // Re-scan: find smallest i where distance to anchors[i+1] > 25m.
  // This advances naturally as the user walks.
  let currentIndex = 0;
  for (let i = 0; i < steps.length; i++) {
    const d = distanceM(pos, anchors[i + 1]);
    if (d > 25) {
      currentIndex = i;
      break;
    }
    currentIndex = i + 1 > steps.length - 1 ? steps.length - 1 : i + 1;
  }
  // Suppress unused warning — `best` reserved for future heuristics.
  void best;

  const metersToStepEnd = distanceM(pos, anchors[currentIndex + 1]);
  let metersToDestination = metersToStepEnd;
  for (let i = currentIndex + 1; i < steps.length; i++) {
    metersToDestination += steps[i].distanceMeters;
  }
  return {
    currentIndex,
    metersToStepEnd,
    metersToDestination,
    walkingEtaSec: Math.round(metersToDestination / WALK_M_PER_S),
  };
}

export function compassLabel(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(((deg % 360) / 45) % 8)] ?? "N";
}
