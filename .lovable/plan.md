
# Future-time trip planning + smart NL suggestions

## Problem 1 — Future-time plans return zero results

Three independent bugs combine so "in 30 min", "tomorrow 7am", and "next Monday" all return nothing:

1. **Stale schedule shards.** `public/data/schedule/by-date/` only contains `20260523 → 20260605`. Today is `20260607`. Any plan for today or later fails to load a shard; the loader throws; the planner returns 0.
2. **No refresh job.** `scripts/ingest-schedule.ts` was run once at build time and produces a 14-day window from *that* moment. No cron, no rebuild trigger — the window silently expires.
3. **4-hour search horizon.** `raptor.server.ts` has `SEARCH_HORIZON_SEC = 4 * 3600`. Even with a fresh shard, an explicit "tomorrow 7am" or arrive-by request can't scan past a 4h window from "now" anchor.
4. **Silent failure path.** When a shard 404s, `multileg.functions.ts` swallows the error and returns `itineraries: []`. The UI shows generic empty state instead of "no timetable for that date".

## Problem 2 — NL planner suggestions are hardcoded placeholders

The three example chips under "Ask in plain words" today are static strings ("to Larnaca airport tomorrow 7am", "leave at 8:30 to the University", "get me to Eleftheria Square in 20 min"). They never change, ignore the rider's location, time of day, history, or trends. They look like marketing copy.

## Fix plan

### Phase 1 — Stop the bleeding (today's date works)

1. **Server-side ingest as a public hook.** Convert `scripts/ingest-schedule.ts` into `src/routes/api/public/hooks/ingest-schedule.ts`:
   - Downloads the 7 Cyprus GTFS feeds.
   - Builds per-date shards for today + next 13 days.
   - Uploads to Supabase Storage bucket `schedule` at the same paths (`by-date/YYYYMMDD/stop-trips.json`, `stops.json`, `routes.json`, `trips.json`, `services.json`, `feeds.json`, `by-date/index.json`).
   - Returns `{ dates, totalKb }` summary.
2. **Loader reads Storage first, bundled asset as fallback.** `schedule-loader.server.ts` tries the Supabase Storage public URL; on 404 falls back to `/data/schedule/...`. Fresh data without redeploys.
3. **pg_cron daily at 03:00 Cyprus time.** Calls the hook so the rolling 14-day window always covers today + 13.
4. **Run once manually now** via the server-function tool so today works immediately.

### Phase 2 — Extend search horizon for explicit future times

In `raptor.server.ts` and `journey-scheduled.server.ts`:
- Add `searchHorizonSec` parameter: default 4h for "leave now", **24h** when `departAtUnix`/`arriveByUnix` is passed.
- Anchor scan at `departureUnix`, not at service-midnight + offset, so a 7am request scans 7am → 7am+horizon.
- Thread through `multileg.functions.ts`.

### Phase 3 — Honest UX when data is missing

In `multileg.functions.ts`:
- Distinguish shard-404 from "ran but no itineraries".
- Add `noScheduleAvailable: boolean` and `requestedDate: string` to the result (always, not just `debug`).
In `trips.tsx`:
- Inline notice when there's no timetable for the requested date ("We don't have timetable data for Mon Jun 15 yet — try within the next 14 days") instead of generic empty state.

### Phase 4 — Smart, dynamic NL suggestions

Replace the static chips with `getNlSuggestions` — a `createServerFn` that returns 3 freshly-generated trip-intent strings personalised to the rider. Inputs:
- Caller's current `{lat, lng}` (passed from `NLPlannerCard` via `useGeolocation`).
- Local time (clock, day-of-week, weekend flag, school-day flag).
- This device/user's last 30 days of `trip_history` (already powering `getTripSuggestions`) — most-frequent destinations, time-of-day pattern.
- Cross-device popularity: top destinations across all users for *this hour bucket* in *this city quadrant* (anonymous aggregate query over `trip_history` keyed by `to_lat`/`to_lng` bucket and `hour`).
- A small catalog of high-signal Cyprus POIs (airports, universities, beaches, malls, hospitals) used **only as fallback** when neither personal nor city-wide history yields enough variety.

Generation logic (deterministic, no LLM for chips — keeps cost zero and output predictable):
1. **Personal repeat.** If the rider has a top destination in `trip_history` that matches the current hour ±2, emit `"to {label} in {N} min"` using the typical leave-time delta.
2. **Time-of-day intent.** Morning (06–09): suggest the rider's most-frequent weekday morning destination (or fallback "to work"). Evening (16–19): "home" if home is known, else top evening destination. Late night (22+): "last bus to {nearest neighbourhood}".
3. **Trending nearby.** Query top 1 destination from city-wide aggregate where caller's quadrant matches origin quadrant in the same hour bucket. Emit `"to {label} — trending now"`.
4. **Tomorrow-anchor.** If the rider has any future-time pattern (e.g. recurring 7am Saturday airport runs), emit `"to {label} tomorrow {HH:mm}"`.
5. **Fallback for cold-start riders.** Use POI catalog filtered by distance + time-of-day appropriateness (airports surface morning + evening, beaches surface weekend daytime, university surfaces weekday morning).

Each suggestion is rendered as a chip with the natural-language string. Tapping a chip submits it directly through the same hybrid heuristic+AI parser pipeline already wired — no special path needed.

UI (`NLPlannerCard.tsx`):
- Replace the hardcoded `EXAMPLES` array with a `useQuery` against `getNlSuggestions`, refetched every 10 min and on geolocation change.
- Show 3 chips. Skeleton state while loading. If suggestion call fails, fall back to 2 generic POI chips, never blank.
- Subtle "tap to plan" affordance — the chip *is* the prompt, no edit step.

### Phase 5 (deferred) — Long horizons (>14 days)

Out of scope. Requests like "next month" still return nothing. Follow-up options: extend `SHARD_DAYS` to 30 (~150 MB) or fall back to "generic weekday/weekend pattern". Decide later.

## Files touched

```text
src/routes/api/public/hooks/ingest-schedule.ts   NEW  — server-side GTFS ingest
src/lib/schedule-loader.server.ts                EDIT — Storage URL first, then bundled
src/lib/raptor.server.ts                         EDIT — configurable horizon, anchor at depart
src/lib/journey-scheduled.server.ts              EDIT — pass horizon + date through
src/lib/multileg.functions.ts                    EDIT — noScheduleAvailable, horizon plumbing
src/lib/nl-suggestions.functions.ts              NEW  — smart dynamic suggestions
src/components/NLPlannerCard.tsx                 EDIT — dynamic chips via useQuery
src/routes/trips.tsx                             EDIT — "no timetable" notice
supabase                                         CRON — daily ingest at 03:00 Cyprus time
```

## Open questions

1. **Storage vs. git for shards.** Storage = faster refresh, single source of truth, no rebuild. Recommended — confirm.
2. **Future-time horizon.** 24h covers "tomorrow 7am". Wider ("next Monday") would need 14-day scan, much heavier. Recommended: 24h now, broader later.
3. **Phase 5 long horizons.** Defer until riders actually ask for it?

Confirm and I'll implement Phases 1–4 in one pass.
