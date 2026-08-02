// Leave-time buffer: how much earlier to set off given weather, traffic,
// rush hour and disruptions. Pure maths, capped per component.

import { clamp, minutes } from "./util";
export type BufferReason = {
  kind: "weather" | "traffic" | "rush" | "disruption";
  sec: number;
  /** Short human phrase, already localised into English. */
  label: string;
};

export type BufferResult = {
  extraSec: number;
  reasons: BufferReason[];
  /** One-line summary, or null when nothing meaningful applies. */
  reasonShort: string | null;
};

/** Per-component ceilings so one noisy signal can't dominate. */
export const BUFFER_CAPS = {
  weather: 7 * 60,
  traffic: 8 * 60,
  rush: 6 * 60,
  disruption: 10 * 60,
  total: 20 * 60,
} as const;

/**
 * Cyprus default congestion curve, in seconds of extra journey time by local
 * hour. Morning commute, the 13:00-14:00 school run (a real, sharp peak here),
 * and the evening return. Used until we have enough learned samples.
 */
const DEFAULT_RUSH_CURVE: Record<number, number> = {
  7: 150,
  8: 240,
  9: 120,
  13: 210,
  14: 180,
  17: 180,
  18: 240,
  19: 150,
};

export type RushProfile = {
  /** 0 = Sunday … 6 = Saturday, matching JS getDay(). */
  dayOfWeek: number;
  hourOfDay: number;
  meanDelaySec: number;
  sampleCount: number;
};

/**
 * Extra seconds to expect from time-of-day congestion. Prefers our own
 * learned profile for that weekday+hour once it has enough samples, and
 * otherwise falls back to the island default curve. Weekends and public
 * holidays are quiet, so the default curve is muted there.
 */
export function rushHourFactor(args: {
  hourOfDay: number;
  dayOfWeek: number;
  isHoliday?: boolean;
  profile?: readonly RushProfile[];
}): number {
  const { hourOfDay, dayOfWeek, isHoliday = false, profile = [] } = args;
  const learned = profile.find(
    (p) => p.hourOfDay === hourOfDay && p.dayOfWeek === dayOfWeek && p.sampleCount >= 8,
  );
  if (learned) {
    // The learned mean already contains the baseline lateness the traffic
    // component covers; only the part above two minutes is rush-specific.
    return clamp(Math.round(learned.meanDelaySec - 120), 0, BUFFER_CAPS.rush);
  }
  const weekend = dayOfWeek === 0 || dayOfWeek === 6;
  const base = DEFAULT_RUSH_CURVE[hourOfDay] ?? 0;
  if (isHoliday || dayOfWeek === 0) return 0;
  return clamp(Math.round(weekend ? base * 0.3 : base), 0, BUFFER_CAPS.rush);
}

export type BufferSignals = {
  /** Already-computed weather allowance (see leave-time-adjuster). */
  weatherSec?: number;
  weatherLabel?: string | null;
  /** Recent mean lateness across the routes in the plan. */
  trafficSec?: number;
  rushSec?: number;
  /** Active incident/disruption touching one of the routes. */
  disruptionSec?: number;
  disruptionLabel?: string | null;
};

/**
 * Merge every signal into one buffer the rider can audit. Components are
 * capped individually and again in total, and only the ones worth at least a
 * minute earn a line in the explanation — "leave 8 min earlier" is useful,
 * "leave 40 seconds earlier" is noise.
 */
export function composeLeaveBuffer(signals: BufferSignals): BufferResult {
  const reasons: BufferReason[] = [];

  const weather = clamp(signals.weatherSec ?? 0, 0, BUFFER_CAPS.weather);
  if (weather >= 60) {
    reasons.push({
      kind: "weather",
      sec: weather,
      label: signals.weatherLabel?.trim() || "weather",
    });
  }

  const traffic = clamp(signals.trafficSec ?? 0, 0, BUFFER_CAPS.traffic);
  if (traffic >= 60) reasons.push({ kind: "traffic", sec: traffic, label: "buses running late" });

  const rush = clamp(signals.rushSec ?? 0, 0, BUFFER_CAPS.rush);
  if (rush >= 60) reasons.push({ kind: "rush", sec: rush, label: "rush hour" });

  const disruption = clamp(signals.disruptionSec ?? 0, 0, BUFFER_CAPS.disruption);
  if (disruption >= 60) {
    reasons.push({
      kind: "disruption",
      sec: disruption,
      label: signals.disruptionLabel?.trim() || "road disruption",
    });
  }

  const raw = weather + traffic + rush + disruption;
  const extraSec = Math.min(BUFFER_CAPS.total, raw);

  const reasonShort =
    reasons.length === 0
      ? null
      : `${reasons.map((r) => r.label).join(" + ")} — leave ${minutes(extraSec)} min earlier`;

  return { extraSec, reasons, reasonShort };
}
