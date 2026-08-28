// C3 seed. Rank lines that run a lot and have almost no rider phones.
// Target those in-app. Do not spray "please contribute" everywhere.

export const SEED_MIN_RIDERSHIP = 30;
/** Coverage speaks at 2 phones. 0 or 1 is still dark. */
export const SEED_MAX_DEVICES = 1;
export const SEED_MAX_ROUTES = 6;

export type SeedRow = {
  routeId: string;
  /** Feed observations — a proxy for how much the line actually runs. */
  ridership: number;
  /** Distinct rider phones in the coverage window. */
  devices: number;
};

export function seedScore(ridership: number, devices: number): number {
  if (!(ridership >= SEED_MIN_RIDERSHIP) || devices > SEED_MAX_DEVICES) return 0;
  return ridership / (1 + Math.max(0, devices));
}

export function pickSparseSeeds(rows: SeedRow[]): SeedRow[] {
  return rows
    .filter((r) => r.routeId.length > 0 && seedScore(r.ridership, r.devices) > 0)
    .sort((a, b) => {
      const d = seedScore(b.ridership, b.devices) - seedScore(a.ridership, a.devices);
      return d !== 0 ? d : a.routeId.localeCompare(b.routeId);
    })
    .slice(0, SEED_MAX_ROUTES);
}
