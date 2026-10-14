// D2 write/read. Classification is pure; this is I/O around it.
// Neighbour is the next same-route stop in walk range. Silent when
// GTFS has no such stop, or that stop also skips.

import type { SupabaseClient } from "@/lib/db/compat";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cyHourDow } from "@aloya/core/cy-time";
import {
  SKIP_WINDOW_DAYS,
  pickSkipRates,
  skipFraction,
  skipMapKey,
  tallySkipVisits,
  type SkipOutcome,
  type SkipSlot,
  type SkipVisitRow,
} from "@aloya/core/skip-rate";
import {
  pickSkipNeighbour,
  type NeighbourCandidate,
  type SpokenSkip,
} from "@aloya/core/skip-neighbour";
import { getRoute, getStop } from "@/lib/gtfs";
import routeStops from "@/data/route_stops.json";

const db = supabaseAdmin as unknown as SupabaseClient;
const ROUTE_STOPS = routeStops as Record<string, string[]>;

type VisitRow = {
  stop_id: string;
  route_id: string;
  outcome: string;
  classified_at: string;
  hour_of_day: number | null;
  day_of_week: number | null;
};

function missingTable(message: string | undefined): boolean {
  return /stop_skip_visits|does not exist|schema cache/i.test(message ?? "");
}

function asVisit(r: VisitRow): SkipVisitRow | null {
  if (r.outcome !== "served" && r.outcome !== "skipped") return null;
  return {
    stopId: r.stop_id,
    routeId: r.route_id,
    outcome: r.outcome,
    classifiedAt: Date.parse(r.classified_at) || 0,
    hour: r.hour_of_day,
    dow: r.day_of_week,
  };
}

export async function recordSkipVisit(input: {
  stopId: string;
  routeId: string;
  tripId: string;
  outcome: SkipOutcome;
  dwellSec: number;
  classifiedAt: number;
}): Promise<void> {
  const { hour, dow } = cyHourDow(input.classifiedAt);
  const { error } = await db.from("stop_skip_visits").upsert(
    {
      stop_id: input.stopId,
      route_id: input.routeId,
      trip_id: input.tripId,
      outcome: input.outcome,
      dwell_sec: input.dwellSec,
      classified_at: new Date(input.classifiedAt).toISOString(),
      hour_of_day: hour,
      day_of_week: dow,
    },
    { onConflict: "trip_id,stop_id" },
  );
  if (error && !missingTable(error.message)) {
    /* fail closed — skip rate stays silent rather than breaking A2 */
  }
}

async function loadVisits(stopIds: string[], routeIds: string[], from: string): Promise<SkipVisitRow[]> {
  if (stopIds.length === 0 || routeIds.length === 0) return [];
  const { data, error } = await db
    .from("stop_skip_visits")
    .select("stop_id, route_id, outcome, classified_at, hour_of_day, day_of_week")
    .in("stop_id", stopIds)
    .in("route_id", routeIds)
    .gte("classified_at", from)
    .limit(4000);
  if (error || !data) return [];
  const rows: SkipVisitRow[] = [];
  for (const r of data as VisitRow[]) {
    const v = asVisit(r);
    if (v) rows.push(v);
  }
  return rows;
}

/** Spoken skip fractions for RAPTOR. Silent below the speak bar. */
export async function loadSkipFractionMap(
  stopIds: string[],
  nowMs = Date.now(),
): Promise<Map<string, number>> {
  const ids = [...new Set(stopIds.filter((id) => id.length > 0))].slice(0, 80);
  if (ids.length === 0) return new Map();
  const from = new Date(nowMs - SKIP_WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await db
    .from("stop_skip_visits")
    .select("stop_id, route_id, outcome, classified_at, hour_of_day, day_of_week")
    .in("stop_id", ids)
    .gte("classified_at", from)
    .limit(4000);
  if (error || !data) return new Map();
  const rows: SkipVisitRow[] = [];
  for (const r of data as VisitRow[]) {
    const v = asVisit(r);
    if (v) rows.push(v);
  }
  const slots = tallySkipVisits(rows);
  const out = new Map<string, number>();
  for (const stopId of ids) {
    for (const r of pickSkipRates(slots, stopId, nowMs)) {
      const f = skipFraction(r.k);
      if (f > 0) out.set(skipMapKey(stopId, r.routeId), f);
    }
  }
  return out;
}

function candidatesOnRoute(routeId: string): NeighbourCandidate[] {
  const agency = getRoute(routeId)?.agency;
  const seq = ROUTE_STOPS[routeId] ?? [];
  const out: NeighbourCandidate[] = [];
  for (const sid of seq) {
    const s = getStop(sid, agency);
    if (!s) continue;
    out.push({ stopId: s.id, name: s.name, lat: s.lat, lng: s.lng });
  }
  return out;
}

export async function loadSkipRates(stopId: string, nowMs = Date.now()): Promise<SpokenSkip[]> {
  const from = new Date(nowMs - SKIP_WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await db
    .from("stop_skip_visits")
    .select("stop_id, route_id, outcome, classified_at, hour_of_day, day_of_week")
    .eq("stop_id", stopId)
    .gte("classified_at", from)
    .limit(4000);
  if (error || !data) return [];
  const rows: SkipVisitRow[] = [];
  for (const r of data as VisitRow[]) {
    const v = asVisit(r);
    if (v) rows.push(v);
  }
  const rates = pickSkipRates(tallySkipVisits(rows), stopId, nowMs);
  if (rates.length === 0) return [];
  const here = getStop(stopId);
  if (!here) return rates.map((r) => ({ ...r, neighbour: null }));

  const routeIds = [...new Set(rates.map((r) => r.routeId))];
  const candidateIds = new Set<string>();
  for (const rid of routeIds) {
    for (const sid of ROUTE_STOPS[rid] ?? []) {
      if (sid !== stopId) candidateIds.add(sid);
    }
  }
  let neighSlots: SkipSlot[] = [];
  if (candidateIds.size > 0) {
    neighSlots = tallySkipVisits(await loadVisits([...candidateIds], routeIds, from));
  }
  const hereStop: NeighbourCandidate = {
    stopId: here.id,
    name: here.name,
    lat: here.lat,
    lng: here.lng,
  };
  return rates.map((r) => ({
    ...r,
    neighbour: pickSkipNeighbour(
      hereStop,
      r.routeId,
      candidatesOnRoute(r.routeId),
      neighSlots,
      nowMs,
    ),
  }));
}
