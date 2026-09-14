// Cyprus taxi quote from a measured drive. No haversine. No euro without
// meters and seconds from a real route. Same tariff the last-mile card uses.

import { cyParts } from "./cy-time";

/** Gov-regulated 2024 schedule. Night window is 20:30–06:00; we coarsen to the hour. */
export const TAXI_FLAG_FALL_EUR = 3.42;
export const TAXI_DAY_PER_KM = 0.85;
export const TAXI_NIGHT_PER_KM = 1.05;
export const TAXI_MIN_FARE_EUR = 5;
export const TAXI_FARE_VARIANCE = 0.15;
export const TAXI_DISPATCHER_TEL = "+35777777474";
export const TAXI_MIN_DRIVE_SEC = 30;
export const TAXI_MIN_DRIVE_M = 600;
export const TAXI_NIGHT_HOUR = 20;

export type MeasuredDrive = {
  distanceMeters: number;
  durationSec: number;
};

export type TaxiQuote = {
  driveMin: number;
  fareLow: number;
  fareHigh: number;
  night: boolean;
  tel: string;
  distanceMeters: number;
};

export type TaxiBail = {
  kind: "taxi";
  driveMin: number;
  waitMin: number;
  fareLow: number;
  fareHigh: number;
  destLabel: string;
  routeShort: string;
  tel: string;
  night: boolean;
};

export function taxiNightAt(unix: number): boolean {
  const h = cyParts(unix * 1000).hour;
  return h >= TAXI_NIGHT_HOUR || h < 6;
}

function round50(n: number): number {
  return Math.round(n * 2) / 2;
}

export function taxiQuoteFromDrive(
  drive: MeasuredDrive | null | undefined,
  night: boolean,
): TaxiQuote | null {
  if (!drive) return null;
  const { distanceMeters, durationSec } = drive;
  if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSec)) return null;
  if (durationSec < TAXI_MIN_DRIVE_SEC) return null;
  if (distanceMeters < TAXI_MIN_DRIVE_M) return null;
  const km = Math.max(0, distanceMeters) / 1000;
  const point = TAXI_FLAG_FALL_EUR + km * (night ? TAXI_NIGHT_PER_KM : TAXI_DAY_PER_KM);
  const guarded = Math.max(TAXI_MIN_FARE_EUR, point);
  const fareLow = round50(Math.max(TAXI_MIN_FARE_EUR, guarded * (1 - TAXI_FARE_VARIANCE)));
  const fareHigh = round50(guarded * (1 + TAXI_FARE_VARIANCE));
  return {
    driveMin: Math.max(1, Math.round(durationSec / 60)),
    fareLow,
    fareHigh,
    night,
    tel: TAXI_DISPATCHER_TEL,
    distanceMeters: Math.round(distanceMeters),
  };
}

export function formatTaxiEur(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (n >= 10) return `€${Math.round(n)}`;
  return `€${n.toFixed(1).replace(/\.0$/, "")}`;
}

export function formatTaxiBand(low: number, high: number): string {
  if (low === high) return formatTaxiEur(low);
  return `${formatTaxiEur(low)}–${formatTaxiEur(high)}`;
}

export function taxiTelDisplay(tel = TAXI_DISPATCHER_TEL): string {
  const d = tel.replace(/\D/g, "").replace(/^357/, "");
  if (d.length === 8) return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
  return tel;
}

export function pickTaxiBail(input: {
  dark: boolean;
  phase: "walking" | "waiting" | "other";
  waitMin: number;
  walkPossible: boolean;
  destLabel: string;
  routeShort: string;
  quote: TaxiQuote | null;
}): TaxiBail | null {
  if (!input.dark || input.phase === "other") return null;
  if (input.walkPossible) return null;
  if (!input.quote) return null;
  const destLabel = input.destLabel.trim();
  const routeShort = input.routeShort.trim();
  if (!destLabel || !routeShort) return null;
  if (!Number.isFinite(input.waitMin) || input.waitMin < 0) return null;
  return {
    kind: "taxi",
    driveMin: input.quote.driveMin,
    waitMin: Math.round(input.waitMin),
    fareLow: input.quote.fareLow,
    fareHigh: input.quote.fareHigh,
    destLabel,
    routeShort,
    tel: input.quote.tel,
    night: input.quote.night,
  };
}

export function taxiBailLine(action: TaxiBail): string {
  const fare = formatTaxiBand(action.fareLow, action.fareHigh);
  if (action.waitMin <= 0) {
    return `Taxi to ${action.destLabel} in ${action.driveMin} min, ${fare}. Bus ${action.routeShort} isn't on the map.`;
  }
  return `Taxi to ${action.destLabel} in ${action.driveMin} min, ${fare}. Bus ${action.routeShort} is about ${action.waitMin} min if it shows.`;
}

export function taxiDoorLine(quote: TaxiQuote, destLabel: string): string {
  const dest = destLabel.trim() || "your door";
  return `Taxi to ${dest} in ${quote.driveMin} min, ${formatTaxiBand(quote.fareLow, quote.fareHigh)}. Call ${taxiTelDisplay(quote.tel)}.`;
}
