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

## Phase 2 — The search algorithm

A bounded **modified RAPTOR** / **time-dependent Dijkstra** hybrid — the algorithm class real transit planners use. Implemented in `src/lib/journey.server.ts` as a new function alongside (not replacing) the current direct-route planner.

Node space: `(stop_id, arrival_time)`. Edges:
- **Ride edges**: from a stop to every downstream stop on each route serving it, using realistic departure (schedule + learned mean delay for that route × stop × hour bucket from `delay_stats`).
- **Walk edges**: from a stop to its precomputed transfer candidates, weighted by `walk_links.duration_sec`.
- **Stay edges**: waiting at a stop for the next departure on a different route.

Constraints baked in:
- Max 2 transfers.
- Max total journey 90 min.
- Max walking per leg 1.2 km; max total walking 2.0 km.
- Min transfer buffer 90 s (configurable per route reliability — unreliable routes get larger buffers).

Output: ranked list of `Itinerary` objects, each a sequence of `Leg`s where a leg is either `{ kind: 'ride', routeId, boardStopId, alightStopId, boardTimeSec, alightTimeSec, realisticDelaySec }` or `{ kind: 'walk', fromStopId, toStopId, durationSec, polyline }`.

Ranking score per itinerary:
```
score = totalRealisticDuration
      + reliabilityPenalty(legs)      // larger when transfers depend on unreliable routes
      + transferPenalty * numTransfers // small constant, breaks ties in favor of fewer transfers
```

Exit criteria: for a worst-case Cyprus query, search returns in < 1.5 s and produces 3—5 candidate itineraries (mix of direct and transfer) that a human would call sensible.

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
