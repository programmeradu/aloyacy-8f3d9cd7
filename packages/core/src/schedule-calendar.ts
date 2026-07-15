// Service-calendar resolution for the schedule shards.
//
// Cyprus GTFS publishers do not agree on how far ahead they publish
// calendar_dates.txt. Feeds 2/4/9/10/11 publish 2–3 months; feed 6
// (Limassol) publishes a rolling *seven day* window. The moment the ingest
// misses a couple of nightly runs, that feed's services fall entirely
// outside every shard we build, the RAPTOR planner finds zero trips at its
// stops, and the whole city silently disappears from the planner — the user
// only sees "No live route found".
//
// The honest fix is twofold: refresh often, and never let a short calendar
// erase a city. When a feed's published calendar ends before the date we are
// building, we project it forward by weekday: Saturday's shard reuses the
// most recent published Saturday of that same feed. Cyprus timetables are
// weekday/Saturday/Sunday patterns, so this reproduces the real timetable
// closely, and the shard records which feeds were projected so the UI and
// diagnostics can be explicit about it.

export type ServiceCalendar = { feedId: number; dates: string[] };

export type ResolvedServiceDate = {
  /** Service ids active (or projected) for this date. */
  active: Set<string>;
  /** Feed ids whose services were projected from an earlier weekday. */
  projectedFeeds: number[];
  /** feedId -> the published source date the projection was copied from. */
  projectedFrom: Record<number, string>;
};

/** YYYYMMDD -> 0 (Sun) .. 6 (Sat). */
export function weekdayOf(date: string): number {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(4, 6));
  const d = Number(date.slice(6, 8));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Resolve, for each target date, the set of active service ids per feed —
 * projecting short-calendar feeds forward by weekday when needed.
 *
 * @param services  serviceId -> { feedId, dates }
 * @param targetDates dates (YYYYMMDD) we are building shards for
 */
export function resolveServiceDates(
  services: Record<string, ServiceCalendar>,
  targetDates: string[],
): Map<string, ResolvedServiceDate> {
  // Per feed: date -> service ids published for that date, plus the sorted
  // list of published dates so we can find the newest matching weekday.
  const byFeed = new Map<number, { dates: Map<string, Set<string>>; sorted: string[] }>();

  for (const [sid, svc] of Object.entries(services)) {
    let feed = byFeed.get(svc.feedId);
    if (!feed) {
      feed = { dates: new Map(), sorted: [] };
      byFeed.set(svc.feedId, feed);
    }
    for (const d of svc.dates) {
      let set = feed.dates.get(d);
      if (!set) {
        set = new Set();
        feed.dates.set(d, set);
      }
      set.add(sid);
    }
  }
  for (const feed of byFeed.values()) feed.sorted = [...feed.dates.keys()].sort();

  const out = new Map<string, ResolvedServiceDate>();

  for (const date of targetDates) {
    const entry: ResolvedServiceDate = {
      active: new Set(),
      projectedFeeds: [],
      projectedFrom: {},
    };
    const wanted = weekdayOf(date);

    for (const [feedId, feed] of byFeed) {
      const direct = feed.dates.get(date);
      if (direct && direct.size > 0) {
        for (const sid of direct) entry.active.add(sid);
        continue;
      }
      // No published calendar for this date. Only project *forward* — a gap
      // in the middle of a published range is a real service holiday
      // (Christmas, Easter Monday) and must stay empty.
      const last = feed.sorted[feed.sorted.length - 1];
      if (!last || date <= last) continue;

      let source: string | null = null;
      for (let i = feed.sorted.length - 1; i >= 0; i--) {
        const cand = feed.sorted[i];
        if (weekdayOf(cand) !== wanted) continue;
        const set = feed.dates.get(cand);
        if (set && set.size > 0) {
          source = cand;
          break;
        }
      }
      if (!source) continue;
      for (const sid of feed.dates.get(source)!) entry.active.add(sid);
      entry.projectedFeeds.push(feedId);
      entry.projectedFrom[feedId] = source;
    }

    entry.projectedFeeds.sort((a, b) => a - b);
    out.set(date, entry);
  }

  return out;
}
