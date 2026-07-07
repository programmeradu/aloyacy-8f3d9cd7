// Pure path/viewport geometry shared by the web map overlays and any
// consumer that needs to project a point onto a polyline, densify a shape,
// or sample a position + bearing along it.
//
// Local equirectangular projection is used for the perpendicular snap: at
// Cyprus scale (and for the sub-kilometre distances involved) the error is
// far below GPS noise, and it avoids trigonometry in the animation hot path.

import { distanceM, type LatLng } from "./geo";

export type { LatLng };

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Cumulative distance index for a path: cum[i] is metres from path[0] to path[i]. */
export function cumulativeDistances(path: LatLng[]): number[] {
  const cum: number[] = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + distanceM(path[i - 1], path[i]));
  return cum;
}

export type SnapAlong = {
  /** Distance along the path, in metres, of the closest point. */
  along: number;
  /** Index of the segment start vertex the point snapped to. */
  segIndex: number;
  /** Perpendicular distance from the point to the path, in metres. */
  perpM: number;
};

/** Project `p` onto `path`, returning where along the line it lands.
 *  Returns null for degenerate paths (fewer than two vertices). */
export function snapAlong(p: LatLng, path: LatLng[], cum: number[]): SnapAlong | null {
  if (path.length < 2) return null;
  const mPerLat = 110_540;
  const mPerLng = 111_320 * Math.cos((p.lat * Math.PI) / 180);
  const toXY = (q: LatLng) => ({
    x: (q.lng - p.lng) * mPerLng,
    y: (q.lat - p.lat) * mPerLat,
  });
  let bestSeg = 0;
  let bestDist2 = Infinity;
  let bestT = 0;
  const xy = path.map(toXY);
  for (let i = 0; i < xy.length - 1; i++) {
    const a = xy[i];
    const b = xy[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    let t = -(a.x * dx + a.y * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const fx = a.x + t * dx;
    const fy = a.y + t * dy;
    const d2 = fx * fx + fy * fy;
    if (d2 < bestDist2) {
      bestDist2 = d2;
      bestSeg = i;
      bestT = t;
    }
  }
  const segLen = cum[bestSeg + 1] - cum[bestSeg];
  return {
    along: cum[bestSeg] + segLen * bestT,
    segIndex: bestSeg,
    perpM: Math.sqrt(bestDist2),
  };
}

/** Subdivide any segment longer than `maxSegM` into evenly-spaced points.
 *  Linear-in-degrees is plenty for sub-25m steps at Cyprus latitudes. */
export function densifyPath(path: LatLng[], maxSegM: number): LatLng[] {
  if (path.length < 2) return path.slice();
  const out: LatLng[] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const d = distanceM(a, b);
    if (d > maxSegM) {
      const steps = Math.ceil(d / maxSegM);
      for (let j = 1; j < steps; j++) {
        const t = j / steps;
        out.push({
          lat: a.lat + (b.lat - a.lat) * t,
          lng: a.lng + (b.lng - a.lng) * t,
        });
      }
    }
    out.push(b);
  }
  return out;
}

/** Position + heading at `along` metres from the path start. Clamps to the ends. */
export function sampleAlong(
  path: LatLng[],
  cum: number[],
  along: number,
): { lat: number; lng: number; bearing: number } {
  const total = cum[cum.length - 1];
  const clamped = Math.max(0, Math.min(total, along));
  // Binary search would be marginal here; paths are short. Linear is fine.
  let i = 0;
  for (; i < cum.length - 1; i++) {
    if (clamped <= cum[i + 1]) break;
  }
  const a = path[i];
  const b = path[Math.min(path.length - 1, i + 1)];
  const segLen = Math.max(1e-6, cum[i + 1] - cum[i]);
  const t = (clamped - cum[i]) / segLen;
  const lat = a.lat + (b.lat - a.lat) * t;
  const lng = a.lng + (b.lng - a.lng) * t;
  // Bearing from a → b (degrees clockwise from north)
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLng);
  const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return { lat, lng, bearing };
}

/** Rough mercator-ish mapping from a viewport span in km to a Google zoom level. */
export function spanToZoom(spanKm: number): number {
  const z = Math.round(12 - Math.log2(spanKm / 8));
  return Math.max(6, Math.min(17, z));
}

/** Stable identity for a live vehicle so overrides survive feed churn. */
export function vehicleOverlayKey(v: {
  id: string;
  tripId?: string | null;
  routeId?: string | null;
  label?: string | null;
}): string {
  if (v.tripId) return `trip:${v.tripId}`;
  if (v.routeId && v.label) return `route:${v.routeId}:label:${v.label}`;
  return `entity:${v.id}`;
}
