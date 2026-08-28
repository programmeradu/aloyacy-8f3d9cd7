// C3 coverage honesty. Name the lines that actually have rider phones.
// Do not draw a map that looks like the island is covered.

export const COVERAGE_WINDOW_HOURS = 48;
export const COVERAGE_MIN_DEVICES = 2;
export const COVERAGE_MAX_ROUTES = 8;

export type CoverageReport = {
  routeId: string;
  deviceId: string;
};

export type RouteCoverage = {
  routeId: string;
  devices: number;
};

export function unionDevicesByRoute(reports: CoverageReport[]): RouteCoverage[] {
  const map = new Map<string, Set<string>>();
  for (const r of reports) {
    if (!r.routeId || !r.deviceId) continue;
    const set = map.get(r.routeId);
    if (set) set.add(r.deviceId);
    else map.set(r.routeId, new Set([r.deviceId]));
  }
  return [...map.entries()].map(([routeId, devices]) => ({
    routeId,
    devices: devices.size,
  }));
}

/** Routes we may name. One tourist does not make coverage. */
export function pickCoverageRoutes(rows: RouteCoverage[]): RouteCoverage[] {
  return rows
    .filter((r) => r.devices >= COVERAGE_MIN_DEVICES && r.routeId.length > 0)
    .sort((a, b) => b.devices - a.devices || a.routeId.localeCompare(b.routeId))
    .slice(0, COVERAGE_MAX_ROUTES);
}
