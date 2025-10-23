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
