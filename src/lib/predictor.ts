// Blends live GTFS-RT delay with the learned per-route/stop/hour bias from
// our delay_stats table. Returns a smart ETA + a short, honest confidence
// label (e.g. "usually 2 min late at this hour").

export type LearnedStat = {
  route_id: string;
  stop_id: string;
  hour_of_day: number;
  day_of_week: number;
  mean_delay_sec: number;
  sample_count: number;
};

export type SmartEta = {
  etaMin: number;            // corrected eta in minutes
  rawEtaMin: number;         // schedule-based eta
  liveDelayMin: number;      // current live delay
  learnedDelayMin: number;   // learned bias
  confidence: "low" | "medium" | "high";
  blurb: string;             // short human label
};

const LIVE_WEIGHT = 0.7;

export function smartEta(args: {
  scheduledArrivalUnix: number;
  liveDelaySec: number;
  learned?: LearnedStat | null;
  nowUnix?: number;
}): SmartEta {
  const now = args.nowUnix ?? Math.floor(Date.now() / 1000);
  const learnedSec = args.learned?.mean_delay_sec ?? 0;
  const n = args.learned?.sample_count ?? 0;

  // Blend: live current delay weighted higher, fall back to learned when no live signal.
  const blendedDelay = args.liveDelaySec === 0 && n > 4
    ? learnedSec
    : LIVE_WEIGHT * args.liveDelaySec + (1 - LIVE_WEIGHT) * learnedSec;

  const correctedArrival = args.scheduledArrivalUnix + blendedDelay;
  const etaMin = Math.max(0, Math.round((correctedArrival - now) / 60));
  const rawEtaMin = Math.max(
    0,
    Math.round((args.scheduledArrivalUnix - now) / 60),
  );
  const liveDelayMin = Math.round(args.liveDelaySec / 60);
  const learnedDelayMin = Math.round(learnedSec / 60);

  let confidence: SmartEta["confidence"] = "low";
  if (args.liveDelaySec !== 0 && n >= 8) confidence = "high";
  else if (args.liveDelaySec !== 0 || n >= 8) confidence = "medium";

  let blurb = "Live tracking";
  if (args.liveDelaySec > 60) blurb = `Running ${liveDelayMin} min late`;
  else if (args.liveDelaySec < -60) blurb = `Running ${Math.abs(liveDelayMin)} min early`;
  else if (n >= 8 && Math.abs(learnedDelayMin) >= 2)
    blurb =
      learnedDelayMin > 0
        ? `Usually ${learnedDelayMin} min late at this hour`
        : `Usually ${Math.abs(learnedDelayMin)} min early at this hour`;
  else if (args.liveDelaySec === 0 && n === 0) blurb = "On schedule";
  else if (args.liveDelaySec === 0) blurb = "On time";

  return {
    etaMin,
    rawEtaMin,
    liveDelayMin,
    learnedDelayMin,
    confidence,
    blurb,
  };
}
