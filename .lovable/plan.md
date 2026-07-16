# Arrival Promise — "Get me to Larnaca by 4pm tomorrow"

Today the app can plan an arrive-by trip, and it can set a single one-shot
"remind me to leave" push. What's missing is the *commitment*: a trip you book
in advance that Aloya keeps watching until you're on the bus, re-planning as
conditions change and nudging you at the right moments.

## What the rider gets

1. **Set the promise.** In the planner, once an arrive-by time is set (today or
   any date up to 7 days out), a commit card appears: "Get me there by 16:00 —
   Aloya will watch this trip." One tap creates the promise.
2. **A departure ladder**, not one answer:
   ```text
   Leave 14:35  →  arrive 15:48   recommended · 12 min slack
   Leave 15:05  →  arrive 16:02   too late by 2 min
   Leave 14:05  →  arrive 15:20   early, extra 40 min buffer
   ```
   Each rung shows the route chain and whether it still lands before the target.
3. **Continuous watch.** Every few minutes until departure the server re-plans
   the same origin→destination against live feeds and shifts the recommended
   leave time. The rider sees a live "leave by" countdown with a reason line
   ("heavy rain + route 30 running 6 min late — leave 8 min earlier").
4. **Escalating nudges.** Push at T-60, T-30, T-15, and "leave now", plus an
   out-of-band alert whenever the recommended leave time moves earlier by 5+
   minutes or the promise becomes unmakeable ("no bus now arrives before 16:00
   — earliest is 16:24").
5. **Watch list.** Active promises visible on web (/trips + /saved) and mobile,
   each cancellable, with the ladder and the current reason line.

## What decides the leave time

Layered on the existing planner output, all as one auditable buffer:

- **Live feed** — real vehicle positions and delays (already in the planner).
- **Recent route delay stats** — `delay_stats` mean per route (already used).
- **Weather** — Open-Meteo condition, learned route×condition coupling with a
  static fallback (already in `leave-time-adjuster.ts`).
- **Rush hour / day type** (new) — learned per-hour, per-weekday delay profile
  from our own `delay_stats` history, with a sane Cyprus default curve
  (07:00-09:00, 13:00-14:00 school run, 17:00-19:30), plus public-holiday and
  reduced-Sunday-service awareness.
- **Disruption signals** (new input, existing source) — active traffic alerts /
  pulse anomalies touching the routes in the plan.
- **Personal safety margin** — the rider's own slider (relaxed / normal /
  cutting it fine), default "normal" = arrive 10 min before target.

## Technical shape

**Core (pure, tested)** — `packages/core/src/arrival-promise.ts`
- `buildDepartureLadder(itineraries, targetUnix, margin)` → rungs with slack,
  verdict (`comfortable` | `tight` | `late`), and the recommended rung.
- `composeLeaveBuffer(signals)` → `{ extraSec, reasons[] }` merging weather,
  traffic, rush-hour and disruption components with per-component caps and one
  global cap; reuses the existing weather/delay logic, moved here.
- `rushHourFactor(unixSec, tz, profile?)` → seconds, learned profile or default.
- `nextNudge(promise, nowUnix)` → which escalation step is due (T-60/30/15/now
  / "changed" / "unmakeable"), idempotent against `nudges_sent`.
- `promiseStatus(...)` → `watching` | `leave-now` | `departed` | `missed` |
  `cancelled`.
- Copy helpers so web, mobile and push bodies say the exact same thing.

**Database** — one migration, `public.arrival_promises`:
`id, user_id, target_arrival_unix, origin/destination (label+lat/lng),
margin_pref, plan_json (current best itinerary), ladder_json, leave_by_unix,
baseline_leave_by_unix, reason_short, status, nudges_sent (text[]),
last_replan_at, replan_count, push_subscription_id, created_at, updated_at`
plus GRANTs (`authenticated`, `service_role`), RLS scoped to `auth.uid()`, and
an index on `(status, leave_by_unix)`. A `job_leases` row backs single-flight.

**Server functions** — `src/lib/arrival-promise.functions.ts`:
`createArrivalPromise`, `listArrivalPromises`, `cancelArrivalPromise`,
`refreshArrivalPromise` (on-demand re-plan when the rider opens the card), all
behind `requireSupabaseAuth`, Zod-validated.

**Watcher** — `src/routes/api/public/hooks/arrival-watch-tick.ts`, called by
pg_cron every 2 minutes with the anon key in `apikey`:
- acquires a single-flight lease (expiring row) and exits if one is held;
- processes a bounded batch (25 promises/run), nearest leave time first;
- adaptive cadence: >6h out → re-plan hourly, 6h-1h → every 15 min, <1h →
  every tick;
- re-plans via `planMultiLeg`, applies `composeLeaveBuffer`, writes the new
  ladder, leave time and reason;
- sends only the nudge `nextNudge` says is due and appends it to `nudges_sent`
  in the same update (idempotent);
- circuit breaker: pauses the whole job on repeated failures and surfaces it,
  never loops.

**UI**
- Web: `ArrivalPromiseCard` in the planner (commit + ladder), `PromiseWatchList`
  on `/saved`, live countdown driven by the existing tick hook.
- Mobile: same card and list, native push through the existing token pipeline,
  matching glyph/typography language (bespoke SVG, no icon sets).
- Bespoke illustration generated for the promise card empty/active state.

**Push** — reuses `sendWebPush` + Expo push; bodies come from the shared core
copy helpers so web and native read identically.

## Out of scope for this pass
Trip-chaining across multiple promises, calendar import, and sharing a promise
with a friend.
