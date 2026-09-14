// Dest-aware airport cost. Fare + wait + walk, only from numbers we have.
// Taxi euro only when destJobLines is handed a measured drive.

import { formatEur } from "./boarding-pay";
import { cyParts } from "./cy-time";
import { WALK_M_PER_S } from "./geo";
import type { AirportCoachWay, AirportJob } from "./airport-job";
import { taxiDoorLine, type TaxiQuote } from "./taxi-quote";

export type AirportSearch = {
  toLat?: number;
  toLng?: number;
  toLabel?: string;
};

export type AirportDest = {
  lat: number;
  lng: number;
  label: string;
};

export type DoorCost = {
  fareEur: number | null;
  waitMin: number;
  walkMin: number | null;
};

const CY_LAT = { min: 34, max: 36 };
const CY_LNG = { min: 32, max: 35 };

export function parseAirportSearch(raw: Record<string, unknown>): AirportSearch {
  const toLat = Number(raw.toLat);
  const toLng = Number(raw.toLng);
  const label = typeof raw.toLabel === "string" ? raw.toLabel.trim().slice(0, 80) : "";
  if (!Number.isFinite(toLat) || !Number.isFinite(toLng)) return {};
  if (toLat < CY_LAT.min || toLat > CY_LAT.max) return {};
  if (toLng < CY_LNG.min || toLng > CY_LNG.max) return {};
  return { toLat, toLng, toLabel: label || undefined };
}

export function airportDest(search: AirportSearch): AirportDest | null {
  if (search.toLat == null || search.toLng == null) return null;
  return { lat: search.toLat, lng: search.toLng, label: search.toLabel || "your door" };
}

export function parseEur(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function waitMinFromDepart(depart: string, nowMs: number, extraDay = false): number {
  const [hRaw, mRaw] = depart.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  const p = cyParts(nowMs);
  let wait = h * 60 + m - (p.hour * 60 + p.minute);
  if (extraDay) wait += 24 * 60;
  if (wait < 0) wait += 24 * 60;
  return wait;
}

export function walkMinFromMeters(meters: number): number {
  if (!Number.isFinite(meters) || meters <= 0) return 0;
  return Math.max(1, Math.round(meters / WALK_M_PER_S / 60));
}

function foldCity(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/agia napa|ayia napa|αγια ναπα/gi, "napa")
    .replace(/lefkosia|λευκωσια/gi, "nicosia")
    .replace(/lemesos|λεμεσος/gi, "limassol")
    .replace(/larnaka|λαρνακα/gi, "larnaca")
    .replace(/pafos|παφος/gi, "paphos")
    .replace(/πρωταρας/gi, "protaras");
}

/** Coach whose city is actually the dest. Silent when none match. */
export function pickCoachForDest(
  coaches: readonly AirportCoachWay[],
  destLabel: string,
): AirportCoachWay | null {
  const dest = foldCity(destLabel);
  if (!dest.trim()) return null;
  for (const c of coaches) {
    const city = foldCity(c.destinationCity);
    if (city && dest.includes(city)) return c;
  }
  return null;
}

export function doorFromItinerary(
  it: {
    totalWalkMeters: number;
    legs: ReadonlyArray<{
      kind: string;
      routeShort?: string;
      board?: { departureUnix: number };
    }>;
  },
  nowUnix: number,
): { routeShort: string; waitMin: number; walkMin: number } | null {
  const ride = it.legs.find((l) => l.kind === "ride");
  if (!ride?.routeShort || ride.board == null) return null;
  const waitMin = Math.max(0, Math.round((ride.board.departureUnix - nowUnix) / 60));
  const walkMin = walkMinFromMeters(it.totalWalkMeters);
  return { routeShort: ride.routeShort, waitMin, walkMin };
}

export function coachDoorLine(way: AirportCoachWay, cost: DoorCost): string {
  const fare = cost.fareEur != null ? formatEur(cost.fareEur) : way.priceFrom ?? "price unpublished";
  const wait = `${cost.waitMin} min wait`;
  if (cost.walkMin != null && cost.walkMin > 0) {
    return `Coach to ${way.destinationCity} at ${way.depart} — ${fare}, ${wait}, ${cost.walkMin} min walk.`;
  }
  return `Coach to ${way.destinationCity} at ${way.depart} — ${fare}, ${wait}.`;
}

export function cityBusDoorLine(input: {
  routeShort: string;
  fareEur: number;
  waitMin: number;
  walkMin: number;
  destLabel: string;
}): string {
  const fare = formatEur(input.fareEur, true);
  return `Bus ${input.routeShort}: ${fare}, ${input.waitMin} min wait, ${input.walkMin} min walk to ${input.destLabel}.`;
}

export function destJobLines(input: {
  job: AirportJob;
  destLabel: string;
  nowMs: number;
  coachWalkMin?: number | null;
  busDoor?: { routeShort: string; waitMin: number; walkMin: number; fareEur: number } | null;
  taxiQuote?: TaxiQuote | null;
}): string[] {
  const lines: string[] = [];
  const coach = pickCoachForDest(input.job.coaches, input.destLabel);
  if (coach) {
    const extraDay = Boolean(coach.dayChip && coach.dayChip.trim());
    lines.push(
      coachDoorLine(coach, {
        fareEur: parseEur(coach.priceFrom),
        waitMin: waitMinFromDepart(coach.depart, input.nowMs, extraDay),
        walkMin: input.coachWalkMin ?? null,
      }),
    );
  }
  if (input.busDoor) {
    lines.push(cityBusDoorLine({ ...input.busDoor, destLabel: input.destLabel }));
  } else if (input.job.cityBus) {
    const b = input.job.cityBus;
    lines.push(
      b.etaMin <= 0
        ? `Bus ${b.routeShort} now. Tap Motion ${formatEur(b.motionEur, true)}.`
        : `Bus ${b.routeShort} in ${b.etaMin} min. Tap Motion ${formatEur(b.motionEur, true)}.`,
    );
  }
  if (input.taxiQuote) {
    lines.push(taxiDoorLine(input.taxiQuote, input.destLabel));
  } else {
    lines.push("Taxi rank outside arrivals. We don't quote a fare we haven't measured.");
  }
  return lines;
}
