// Airport board — pure logic shared by the web and mobile airport screens.
//
// Everything here is deterministic: no GTFS loading, no network, no React.
// The screens own the data fetching and pass plain values in.

export type AirportCodeLike = string;

export interface BoardArrival {
  tripId: string;
  routeId: string;
  stopId: string;
  arrivalUnix: number;
}

export interface BoardEta {
  etaMin: number;
  tier: string;
  band?: string;
  /** Loosely typed: callers carry richer app-specific ETA shapes through. */
  confidence?: unknown;
  operatorEtaMin?: unknown;
}

export interface BoardRow<A extends BoardArrival, E extends BoardEta> {
  arrival: A;
  eta: E;
}

export interface SelectDeparturesOptions<A extends BoardArrival, E extends BoardEta> {
  arrivals: readonly A[];
  stopId: string;
  nowSec: number;
  /** Returns the smart ETA for a given arrival, or null when it cannot be resolved. */
  etaFor: (arrival: A) => E | null | undefined;
  /** Rows further out than this are noise on an airport board. */
  maxEtaMin?: number;
  /** How many rows the board shows. */
  limit?: number;
  /** Arrivals this many seconds in the past are still worth showing. */
  graceSec?: number;
}

/**
 * Picks the next departures for one stop: drops other stops, drops arrivals
 * that are already well in the past, keeps only the earliest arrival per trip
 * (a trip can be listed several times in a feed), sorts by time, resolves the
 * smart ETA and caps both the horizon and the row count.
 */
export function selectAirportDepartures<A extends BoardArrival, E extends BoardEta>(
  opts: SelectDeparturesOptions<A, E>,
): BoardRow<A, E>[] {
  const { arrivals, stopId, nowSec, etaFor, maxEtaMin = 180, limit = 8, graceSec = 30 } = opts;
  if (!stopId || arrivals.length === 0 || limit <= 0) return [];

  const seen = new Set<string>();
  const rows: BoardRow<A, E>[] = [];

  const candidates = arrivals
    .filter((a) => a.stopId === stopId && a.arrivalUnix >= nowSec - graceSec)
    .slice()
    .sort((a, b) => a.arrivalUnix - b.arrivalUnix);

  for (const arrival of candidates) {
    if (seen.has(arrival.tripId)) continue;
    seen.add(arrival.tripId);
    const eta = etaFor(arrival);
    if (!eta) continue;
    if (!Number.isFinite(eta.etaMin) || eta.etaMin > maxEtaMin) continue;
    rows.push({ arrival, eta });
    if (rows.length >= limit) break;
  }

  return rows;
}

/** True when the very first row is a ghost (operator stopped reporting it). */
export function hasGhostLead(rows: readonly { eta: BoardEta }[]): boolean {
  return rows.length > 0 && rows[0].eta.tier === "ghost";
}

/** Short status word for the board header. */
export function feedStatusLabel(input: {
  stale?: boolean;
  loading?: boolean;
  intervalSec?: number;
}): string {
  if (input.stale) return "Feed stale";
  if (input.loading) return "Loading";
  const every = input.intervalSec && input.intervalSec > 0 ? input.intervalSec : 15;
  return `Live · ${every}s`;
}

/** Seat-pressure tone for a coach departure row. */
export function seatPressure(seatsAvailable: number | null | undefined): "sold" | "low" | "open" {
  // The Kapnos feed does not publish seat counts (seat_available is absent),
  // so an unknown count is bookable, not sold out.
  if (seatsAvailable == null || !Number.isFinite(seatsAvailable)) return "open";
  if (seatsAvailable <= 0) return "sold";
  return seatsAvailable <= 8 ? "low" : "open";
}

/** "Sold out" / "6 seats" / "1 seat". */
export function seatLabel(seatsAvailable: number | null | undefined): string {
  if (seatsAvailable == null || !Number.isFinite(seatsAvailable)) return "Book";
  if (seatPressure(seatsAvailable) === "sold") return "Sold out";
  return `${seatsAvailable} seat${seatsAvailable === 1 ? "" : "s"}`;
}

const AIRPORT_FALLBACK_NAME: Record<string, string> = {
  lca: "Larnaca Airport",
  pfo: "Paphos Airport",
};

/** Name to show before (or instead of) the fetched airport meta. */
export function airportDisplayName(code: string, fetched?: string | null): string {
  if (fetched && fetched.trim()) return fetched.trim();
  return AIRPORT_FALLBACK_NAME[code.toLowerCase()] ?? `${code.toUpperCase()} Airport`;
}

/** Share sheet copy for an airport board. */
export function airportShareMessage(input: { code: string; name: string; baseUrl?: string }): {
  title: string;
  message: string;
  url: string;
} {
  const code = input.code.toLowerCase();
  const base = (input.baseUrl ?? "https://app.aloya.cy").replace(/\/+$/, "");
  const url = `${base}/airport/${code}`;
  return {
    title: `${input.name} — Aloya`,
    message: `${input.name} (${code.toUpperCase()}) live coaches and buses — ${url}`,
    url,
  };
}

/** Coordinate line under the airport title, with graceful missing values. */
export function coordinateLine(lat?: number | null, lng?: number | null): string {
  if (!Number.isFinite(lat ?? NaN) || !Number.isFinite(lng ?? NaN)) {
    return "Airport service";
  }
  return `Airport service — ${(lat as number).toFixed(4)}, ${(lng as number).toFixed(4)}`;
}
