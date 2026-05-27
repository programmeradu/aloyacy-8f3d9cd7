
# Smart features v2 — sharper than Moovit/Google Maps for Cyprus

Five rider-facing upgrades, sequenced so each unlocks the next.

## 1. GPS core (`src/lib/geo-fusion.ts` — new)

A single Kalman-style fuser that every consumer (`useGeoWatch`, journey HUD, rider-fix reporter, alight detection) reads from.

- 1D position + velocity Kalman per axis. Inputs: raw `navigator.geolocation` fixes weighted by `accuracy`.
- Dead-reckon for up to 8 s using last velocity + bearing when fixes drop (tunnels, urban canyons, screen-locked).
- Snap-to-route mode: when an active trip leg exists, project the fused fix onto the active leg's polyline (via `src/lib/shapes.ts`) and prefer the snapped point when cross-track error < 35 m. Eliminates GPS jitter showing rider off the bus line.
- Motion mode (`still | walking | onboard`) inferred from speed histogram + bus proximity; throttles geo sampling when still to save battery.
- Exposes `useFusedFix()` hook replacing direct `useGeoWatch` consumers.

## 2. Bus gliding (`src/lib/vehicle-animator.ts` + edits in `useRealtime.ts`, `JourneyHUD.tsx`)

- Each vehicle gets an interpolator: target = latest RT fix; current = animated position; tween over min(ping_interval, 6 s) using cubic-out.
- Bearing eases shortest-arc; speed clamp matches `eta.ts` floor/ceiling so a stale ping doesn't fling the bus.
- Predictive extrapolation: between RT pings, advance the bus along its trip's stop-polyline at observed speed (cap 2× speed, halt at next stop).
- When a rider-fix arrives newer than the feed, it wins; otherwise we average for smoothing (the plan's existing rule).
- Map markers subscribe to `requestAnimationFrame` ticks; no React re-render per frame.

## 3. Smart ETA v2 (`src/lib/eta.ts` rewrite + `delay_stats` reuse)

Keeps current signature but adds:
- Per-segment speed sampling from rider fixes + vehicle pings (stored in `segment_speeds` table, hour×dow×route×segment).
- Traffic multiplier from Google Maps Routes API (`routes/v2:computeRoutes` with `TRAFFIC_AWARE`) for the next-leg car-equivalent travel — blended at 0.3 weight when bus speed is unknown.
- Dwell-time learning per stop (already partly in `delay_stats`); we emit `dwell_observed` rows from confirmed-alight events.
- Confidence interval (`etaLowSec`, `etaHighSec`) surfaced as "3–5 min" in the HUD instead of a single number when σ > 60 s.

New migration: `segment_speeds(route_id, from_stop, to_stop, hour, dow, mean_mps, sample_count)` + `dwell_observations(route_id, stop_id, hour, dow, dwell_sec, sample_count)`.

## 4. Alighting + adaptive re-route (`src/lib/alight-detector.ts` + `src/lib/wrong-stop-reroute.ts`)

Geofence cascade on the active leg's alight stop using fused fix:
- 400 m: "Get ready" haptic + chime (Pro).
- 150 m: "Stop next" — voice cue (Pro), bell-press hint.
- 50 m + decelerating: "Press stop now".
- After bus passes the stop without door event → fire `early-alight` flow already in `reroute.functions.ts`.

**Wrong-stop adaptive re-routing (new behaviour, the Google-Maps-style ask):**
- While `mode === 'walking_to_stop'`, watch fused fix vs planned boarding stop.
- If rider arrives within 80 m of a *different* stop on the same route's stop list (use `route_stops.json`) AND that stop is upstream of the planned alight stop AND the same trip hasn't passed it yet → silently switch boarding stop, update HUD ("Boarding from Stop X — same bus").
- If the alternate stop is *not* on the planned route, surface the existing `EarlyAlightSheet` with 2–3 re-plan options from `rerouteFromHere`.

Files: `src/lib/alight-detector.ts`, `src/lib/wrong-stop-reroute.ts`, wired in `useMultiLegJourney.ts`, rendered by `MultiLegCompanion.tsx`.

## 5. AI layer (Lovable AI gateway — `google/gemini-3-flash-preview`)

### 5a. Natural-language planner
- `src/lib/ai-planner.functions.ts` — `parseTripIntent({ text, nowISO, geo })` returns `{ from, to, leaveBy?, arriveBy?, dayHint }`. Uses Gemini with structured output (Zod schema) + a stops/landmarks glossary built from `src/data/routes_meta.json` and Places autocomplete fallback for unknown names.
- New search bar on `/trips` accepts free text ("Larnaca airport before 9am tomorrow") and pipes the parsed intent into existing `planMultiLeg`.

### 5b. Personal commute learner
- New table `commute_patterns(user_id, from_h3, to_h3, dow_mask, time_bucket, count, last_seen)` — upserted on every confirmed-arrival event.
- Server fn `getCommuteSuggestions({ nowISO, geo })` returns top-3 likely trips for the current time, surfaced as a quiet row on `/index` ("Heading to work? Bus 30 in 7 min").
- Pro-gated for full automation (alarm + auto-warm); free shows the suggestion only.

### 5c. Crowd & comfort prediction
- `rider_vehicle_fixes` already has device_id. Aggregate distinct devices per trip+stop window → load index 0–1.
- New view `trip_load_estimates` + server fn `getLoadHint(tripId)`; HUD shows "usually quiet / busy / packed".
- Combined with weather (`weather.functions.ts`) for a comfort blurb on intercity routes.

### 5d. Proactive disruption assistant
- Background poll inside `useMultiLegJourney` checks every 30 s for: feed staleness on the boarded trip, next-leg ETA slip > 4 min, transfer window collapse, or route alert.
- When triggered, call `getDisruptionSuggestion` (Gemini, structured) → returns `{ summary, actions[] }`. Rendered as a sheet with one-tap "Re-plan" or "Keep going".

### 5e. "Leave on time" reminders (the differentiator)
- New table `scheduled_departures(user_id, plan_json, arrive_by_unix, remind_at_unix, status, push_subscription_id)`.
- When user plans a trip for later/tomorrow, "Remind me when to leave" CTA stores the plan + `arrive_by`.
- `pg_cron` job every 2 min hits `/api/public/hooks/departure-tick` (apikey-auth) which:
  1. Recomputes the plan with current traffic + smart ETA.
  2. Pushes web-push 15 min before computed leave time, then again at T-5.
  3. If conditions worsened (traffic spike, cancelled bus), suggests earlier departure.
- Pro feature. Uses existing `webpush.server.ts`.

## Migrations summary

```sql
segment_speeds            (route_id, from_stop, to_stop, hour, dow, mean_mps, sample_count)
dwell_observations        (route_id, stop_id, hour, dow, dwell_sec, sample_count)
commute_patterns          (user_id, from_h3, to_h3, dow_mask, time_bucket, count, last_seen)
trip_load_estimates       (materialized view over rider_vehicle_fixes)
scheduled_departures      (user_id, plan_json, arrive_by_unix, remind_at_unix, status, sub_id)
```
All with proper GRANTs + RLS scoped to `auth.uid()`.

## Build order

1. GPS fusion + snap-to-route (foundation — everything else reads fused fix).
2. Bus gliding animator.
3. Wrong-stop adaptive re-route + alight cascade.
4. Smart ETA v2 + segment_speeds learning.
5. AI: NL planner → commute learner → crowd hint → disruption → leave-on-time reminders.

Each step ships with a verification pass (preview interaction + console check).

## Test plan (for you, in the preview)

- **GPS/gliding**: Open `/trips`, plan a Nicosia route, start it. With DevTools → Sensors → set custom location, jog the lat/lng — the dot should glide, not jump. Toggle location off mid-trip; bus marker should keep gliding for ~8 s.
- **Wrong-stop**: Plan a trip leaving from Stop A. In DevTools, set location 100 m from a different stop on the same route. HUD should swap boarding stop silently.
- **Alighting**: Simulate fixes approaching the alight stop; expect three cues at 400/150/50 m.
- **NL planner**: Type "to airport tomorrow 6am" into `/trips` search.
- **Leave-on-time**: Plan a trip with arrive-by tomorrow 9am, tap "Remind me". Manually trigger `/api/public/hooks/departure-tick` from the network panel to validate push fires.

## Out of scope this pass

- Indoor positioning (BLE beacons) — not in Cyprus stops.
- Multi-modal (taxi/scooter handoff).
- Voice input for NL planner (text only).
