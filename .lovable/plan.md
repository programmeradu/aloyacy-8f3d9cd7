# Multi-Leg Journey Planner — Transfers Upgrade

A careful, staged rebuild of the planner so Aloya can suggest trips that involve **changing buses**, with real walking links between stops, reliability-aware ranking, and full live-tracking + push-notification support for every leg. Built to industry-leader standards (Citymapper / Apple Maps Transit / Google Maps level), not the minimum-viable version.

## Goal

Today the planner only returns direct routes. A user going Larnaca → a village near Limassol with no direct service gets nothing useful. After this upgrade:

- The planner returns **direct + 1-transfer + 2-transfer** itineraries.
- Each itinerary is **ranked by total realistic time** (schedule + learned delay + walk + transfer wait + reliability penalty), not just headline duration.
- A transfer is **only suggested when it beats the alternative** — never a "transfer for transfer's sake" that adds 20 min for marginal benefit.
- Walking legs between stops are **real walking paths** (Google Directions API), not straight lines or teleports.
- Live tracking, the black status card, the stops indicators, and push notifications all work across multi-leg trips — including "get off at next stop", "walk this way", "your connecting bus is approaching" — in background, on a switched tab, and on a locked screen.

## Quality bar (the "no mediocrity" rules)

These are guardrails the implementation must satisfy. If any phase can't meet these, we stop and reconsider before moving on.

1. **No transfer is ever proposed unless it's measurably better.** A multi-leg option must beat the best direct option (or the no-bus walking option) on either total time or reliability-adjusted time by a meaningful margin (≥ 3 min OR ≥ 15 % faster). Otherwise it's filtered out before the user ever sees it.
2. **No "impossible" transfers.** A connection is only valid if the realistic arrival of the first leg (schedule + learned delay) + the walking time to the connecting stop is **earlier** than the realistic departure of the second leg — with a configurable buffer (default 90 s). Tight transfers are flagged in the UI, not hidden.
3. **No straight-line walks.** Every walk leg uses Google Directions walking mode for distance, duration, and the actual path geometry shown on the map.
4. **No silent failures.** Every server function returns a typed error shape; the UI shows a calm, honest fallback ("We couldn't compute a transfer right now") instead of a blank state.
5. **No regressions on direct trips.** The existing direct-route path stays at least as fast and as reliable as it is today. Multi-leg work runs alongside it, then results are merged and ranked.
6. **No unbounded compute.** The graph search is capped (max 2 transfers, max 90 min total wall time, max N candidate transfer stops per leg) so a worst-case query still returns in < 1.5 s on the server.
7. **No untested edge cases.** Each phase ships with explicit handling for: no service today, last bus already gone, identical board/alight stop, transfer at a stop that doesn't exist in the second route's sequence, walking leg > 1.2 km (we cap or refuse).

## Phase 1 — Foundation: the transfer graph

Before writing the search, build the data layer it stands on.

1. **Stop adjacency index.** From `route_stops.json` + `route_sequences.json`, precompute for every stop the set of routes that serve it and the sequence position. Stored as an in-memory map loaded once per server cold-start.
2. **Transfer-candidate index.** For every stop, precompute the set of nearby stops (≤ 400 m straight-line, capped at 8 per origin) that are served by **a different route** than the origin stop. This is the candidate set the search will explore. Built once, cached.
3. **Walking-link cache.** A Supabase table `walk_links` keyed by `(from_stop_id, to_stop_id)` storing `distance_m`, `duration_sec`, and `polyline`. Populated lazily — when the planner needs a walk between two stops it hasn't seen, it calls Google Directions once and writes the result. Future requests for the same pair are free. Includes a `computed_at` so we can refresh stale entries quarterly.
4. **Migration + index.** Add the table, a unique constraint on the stop pair (canonical ordering: smaller id first so A→B and B→A share a row), and an RLS policy denying all client access (only server fns read/write).

Exit criteria: given any two stops, we can ask "is this a valid walking link?" and get a real distance + duration + polyline in < 200 ms (cached) or < 800 ms (cold, via Google).

## Phase 2a — Realtime-only 1-transfer search (DONE, structurally limited)

First-cut connection-scan against the live GTFS-RT feed. Works for urban trips (Aglandjia → UCY returns 3 sensible direct options) but cannot represent intercity journeys because the realtime feed only contains trips active in the next ~30–60 min — a full Nicosia → Paphos trip never fits the window. Funnel diagnostics added at `/debug/multileg` confirmed this empirically across three intercity presets.

## Phase 2b — Schedule ingestion (DONE)

Real timetable data is now indexed in `public/data/schedule/`. The script `scripts/ingest-schedule.ts` downloads all 7 Cyprus GTFS feeds (Nicosia, Intercity, Limassol, Larnaca, Paphos, Famagusta, school), parses `routes.txt` + `trips.txt` + `stop_times.txt` + `calendar_dates.txt`, and emits 6 compact JSON files:

- `feeds.json`, `routes.json`, `services.json`, `trips.json` — small lookup tables
- `stop-times.json` — `tripId → [stopId, depSec, arrSec, seq][]`
- `stop-trips.json` — `stopId → [tripId, depSec, routeId][]` sorted by depSec (the hot lookup for RAPTOR)

**Scale**: 34,691 trips, 1,002,151 stop_times rows, 8.9 MB total gzipped across the six files.

**Known follow-up for Phase 2c**: the schedule references stops missing from `src/data/stops.json` — the static stops index was built from a limited set. Phase 2c will merge feed `stops.txt` into the runtime stops index.

## Phase 2c — Schedule-based RAPTOR + realtime delay overlay

A bounded **RAPTOR** (Round-bAsed Public Transit Optimized Router) — the algorithm class Google Maps, Citymapper, and Apple Transit all use. Implemented in `src/lib/journey-multileg.server.ts` as a new `planMultiLegScheduled` function alongside (not replacing) the existing realtime-only path. The dispatcher prefers scheduled results when they exist and falls back to realtime for last-mile freshness.

Inputs: origin/dest lat-lng + departure timestamp (`now` or future).

Per round:
- **Round 0**: walk from origin to nearby stops (≤ 1.2 km, capped at N).
- **Round k**: for each stop reached in round k-1, scan all trips departing after the arrival time, mark every downstream stop as reachable in round k.
- **Transfer**: after each round, walk from reached stops to nearby stops (precomputed transfer candidates from Phase 1).
- Terminates at round 3 (max 2 transfers, mirroring the original quality bar).

**Realtime delay overlay**: when a scheduled itinerary is returned, match each ride leg's `tripId` against the live GTFS-RT feed. If a `LiveArrival` exists for the board stop, use the realtime predicted time instead of the scheduled time. Otherwise fall back to scheduled + learned mean delay from `delay_stats`. Each leg carries a `source: 'live' | 'predicted' | 'scheduled'` tag the UI surfaces honestly.

Constraints baked in (unchanged from original plan):
- Max 2 transfers; max total journey 180 min (raised from 90 since intercity exists); max walking per leg 1.2 km, max total 2.0 km; min transfer buffer 90 s.

Ranking score per itinerary (unchanged):
```
score = totalRealisticDuration
      + reliabilityPenalty(legs)
      + transferPenalty * numTransfers
```

The "no-mediocrity" filter (transfer must beat best direct by ≥ 3 min or ≥ 15 %) carries over verbatim.

Exit criteria: all 4 `/debug/multileg` presets return sensible itineraries; intercity trips (Nicosia → Paphos, Larnaca → Limassol) work; 95th-percentile server time stays under 1.5 s on warm isolate.

## Phase 3 — Planner UI for multi-leg results

The current `/trips` results list assumes one ride. Rebuild the result card so it gracefully renders 1—3 legs without losing the editorial feel.

- Each itinerary card shows total time + a compact leg ribbon: `[bus 36] → walk 4 min → [bus 60]`, with realistic arrival and a small reliability tag ("usually +2 min").
- A tap expands the card to a vertical timeline of legs with board/alight stop names, walking polylines, and the connecting wait time clearly labelled.
- The same numerals-first, no-icon, Mediterranean treatment as the rest of the app — no generic transit chips.
- Empty/edge states are explicit: "No good transfer beats walking" / "Last connecting bus already gone — try tomorrow morning".

Exit criteria: results render correctly for 0, 1, 2, and 3-leg itineraries; the visual hierarchy makes the *fastest realistic option* obvious without making transfers look like a downgrade.

## Phase 4 — Live tracking & notifications across legs

This is where transfers earn their keep. The existing `useJourney` hook, the active-trip black card, the stops-line bus indicator, and the push system are all single-leg today. Extend them.

Trip-store schema: an active trip becomes `{ legs: Leg[], currentLegIndex, phase }`. Phases extend to: `walking_to_board → riding[leg_i] → walking_to_transfer → waiting_for_connection → riding[leg_i+1] → walking_to_destination → arrived`.

Per-leg live data: subscribe to the realtime feed for the current leg's vehicle. When the user is in `walking_to_transfer` or `waiting_for_connection`, also subscribe to the *next* leg's vehicle so we can render an accurate "your connecting bus is 4 min away" instead of "scheduled in 6 min".

Black status card copy adapts to phase:
- riding leg i of N → "On bus 36 · alight in 3 stops · then change for 60"
- walking_to_transfer → "Walk 4 min to Eleftheria Sq for bus 60"
- waiting_for_connection → "Bus 60 arriving in 2 min" (live) or "Bus 60 due in 6 min" (scheduled)

Stops list indicator: render markers for **both** the current-leg vehicle and the next-leg vehicle when applicable, with distinct visual weight so the user knows which is theirs.

Push notifications (extends the trip-sync system already built):
- "Get off at next stop" — fires when current leg's vehicle is approaching the alight stop of leg i.
- "Walk this way" — fires on alight if leg i+1 is a walk.
- "Your connecting bus is approaching" — fires when leg i+1's vehicle is < 90 s from the board stop.
- "Heads up — bus 60 running 5 min late" — fires when the connecting vehicle's realtime delay exceeds the transfer buffer (gives the user time to re-plan).
- All notifications include the trip id so a tap deep-links into `/trip/$id` and resumes the live view, including when the app is backgrounded, tab-switched, or the screen is locked.

Exit criteria: a real 2-leg trip can be followed end-to-end with the screen off, the user only opens the app when a notification fires, and the experience never misleads them about which bus is theirs.

## Phase 5 — Hardening & honesty

Before declaring done, a deliberate quality pass:

1. **Failure modes**: walk-links API timeout, realtime feed stale on the connecting bus, learned delays missing for a route. Each has an explicit UI fallback and a logged warning.
2. **Telemetry**: log every transfer suggested vs. taken (anonymous, device-id only) so we can later see whether the transfers we recommend are actually faster in practice. Stored in a `transfer_outcomes` table behind RLS-denied policies.
3. **Pulse integration**: surface a new "Transfers" tile on the Pulse page showing how many multi-leg trips were planned in the last 24 h and the median saved time vs. the direct alternative. Earns trust in the feature publicly.
4. **Manual QA matrix**: a written list of 15 real Cyprus origin/destination pairs (including known-hard cases like Paphos villages → Larnaca airport) checked by hand against the output. Anything that returns nonsense is fixed before merging.
5. **Performance budget**: 95th-percentile server time for `planTrip` stays under 1.5 s; cold-start time for the transfer-candidate index stays under 400 ms.

Exit criteria: the planner can be put in front of a stranger and they'd describe the transfer experience as "obvious" and "trustworthy" — not "clever" or "complex".

## What we are deliberately NOT doing in this upgrade

(Documented so scope doesn't creep mid-build.)

- No 3+ transfer itineraries. Cyprus is small; 2 is already generous and keeps search bounded.
- No fare optimization. We rank on time + reliability only.
- No accessibility routing (step-free, wheelchair) yet — explicit follow-up.
- No cross-modal (bus + ferry + taxi) — bus only.
- No paid-priority routing. Every itinerary is computed identically for every user.

## Technical surface area (for reference)

New files:
- `src/lib/transfer-graph.server.ts` — stop adjacency + transfer-candidate index, in-memory cache.
- `src/lib/walk-links.server.ts` — `walk_links` table read/write, Google Directions integration.
- `src/lib/journey-multileg.server.ts` — the search algorithm + ranking.
- `src/lib/itinerary-types.ts` — shared `Leg` / `Itinerary` DTOs (client-safe).
- `src/components/ItineraryCard.tsx`, `src/components/LegTimeline.tsx`.

Extended files:
- `src/lib/journey.functions.ts` — `planTrip` returns merged direct + multi-leg results.
- `src/lib/trip-store.ts` — multi-leg trip schema + migration of any in-flight trips.
- `src/lib/useJourney.ts` — phase machine extended to leg transitions.
- `src/routes/trip.$id.tsx` — multi-leg map + status card + stops indicator.
- `src/lib/trip-sync.functions.ts` + `src/routes/api/public/trip-alerts.ts` — leg-aware notification triggers.

New tables:
- `walk_links` (cached Google Directions walking results between stop pairs).
- `transfer_outcomes` (telemetry, RLS-denied to clients).

## Sequencing & checkpoints

Each phase ends with a checkpoint where we stop, review, and only continue when satisfied. Estimated effort per phase: 1 — Foundation: small. 2 — Search: medium. 3 — Result UI: medium. 4 — Live tracking + push: large. 5 — Hardening: small but uncompromising. We do not skip Phase 5.
