# Phase 4 — Live tracking & notifications across legs

The whole live-tracking system (trip-store, useJourney, `/trip/$id` UI, `active_trips` table, `trip-alerts` cron) is single-leg today. Phase 4 makes it leg-aware end-to-end, including push notifications that fire across the whole journey with the screen off.

## What gets built

### 1. Trip-store schema (multi-leg)

Replace the current `ActiveTrip { option, live }` with an itinerary-shaped active trip:

```text
ActiveTrip {
  startedAt, from, to,
  itinerary: Itinerary,              // the full multi-leg DTO from Phase 3
  legState: {
    currentLegIndex: number,         // points into itinerary.legs
    perLeg: Record<index, {
      onBoardConfirmedAt?, alightedAt?, missedAt?
    }>
  }
}
```

Backward-compat: any in-flight single-leg trip already in `localStorage` is migrated on read into a one-ride itinerary so a user mid-trip doesn't lose state on deploy.

### 2. `useJourney` phase machine (leg-aware)

New phases mirror the plan exactly:

```text
walking_to_board
  → riding (leg i)
    → walking_to_transfer (between rides)
    → waiting_for_connection
  → riding (leg i+1)
  → ... up to 3 ride legs
  → walking_to_destination
  → arrived
```

The hook always subscribes to the current ride leg's live vehicle. When the user is in `walking_to_transfer` or `waiting_for_connection`, it also subscribes to the **next** ride leg's vehicle so we can render "your connecting bus is 4 min away" with real live data, not just scheduled time.

Auto-advance rules:
- `riding[i] → walking_to_transfer`: alight stop reached (GPS within 30 m OR live vehicle has passed it AND rider tapped "I'm off" OR GPS is clearly walking again after being on-bus).
- `walking_to_transfer → waiting_for_connection`: GPS arrives at next ride's board stop OR walk duration elapsed.
- `waiting_for_connection → riding[i+1]`: GPS×feed fusion confirms on-bus, same heuristic as today.

### 3. `/trip/$id` UI

Black status card adapts per phase:
- **Riding leg i of N** → "On bus 36 · alight in 3 stops · then change for 60"
- **Walking to transfer** → "Walk 4 min to Eleftheria Sq for bus 60"
- **Waiting for connection** → "Bus 60 arriving in 2 min" (live) or "Bus 60 due in 6 min" (scheduled)
- **Riding final leg** → existing copy
- **Walking to destination / arrived** → existing copy

Stops list indicator: when in transfer/wait phase, render both vehicles on the map — current leg's vehicle dimmed (it's done its job), next leg's vehicle bold (this is the one you care about). When riding, only the current vehicle is shown.

Timeline: extends the existing 3-row timeline to N+1 rows (one per ride + walks + transfers), with the active row highlighted.

### 4. Server-side push alerts (multi-leg)

DB migration to `active_trips`: add a `legs` jsonb column holding the full itinerary, and change `alerts_sent` to track per-leg keys (`board-soon:0`, `at-stop:1`, `alight-soon:0`, etc.). Old single-leg columns (board_*, alight_*) stay for backward-compat but become optional.

`/api/public/trip-alerts` cron route extended to iterate every ride leg per trip and fire:
1. **"Get off at next stop"** — fires when current ride leg's vehicle is approaching that leg's alight stop (existing alight-soon, now per-leg).
2. **"Walk this way"** — fires on alight if leg i+1 is a walk-to-transfer. New alert kind.
3. **"Your connecting bus is approaching"** — fires when leg i+1's live vehicle is < 90 s from its board stop. New alert kind.
4. **"Heads up — bus 60 running 5 min late"** — fires when connecting leg's realtime delay > transfer buffer, giving the user time to re-plan. Extends existing `delayed` to be per-leg.

All notifications carry `url: /trip/${tripId}` for deep-link resume, including when the app is backgrounded, tab-switched, or screen-locked (already works via the SW push handler — just verifying the multi-leg link still resumes correctly).

### 5. "Start this trip" unlocked

The Phase-3 disable on multi-leg journeys in `ItineraryCard` is removed once the machine handles them. `trips.tsx` calls `setActiveTrip` with the full itinerary instead of mapping to a single `JourneyOption`.

## Files touched

**New:**
- (none — all extensions of existing files)

**Edited:**
- `src/lib/trip-store.ts` — new schema + migration of in-flight trips
- `src/lib/trip-sync.functions.ts` — sends full itinerary, not single leg
- `src/lib/useJourney.ts` — leg-aware phase machine + dual-vehicle subscriptions
- `src/routes/trip.$id.tsx` — multi-leg map, status card, timeline
- `src/routes/api/public/trip-alerts.ts` — per-leg alert dispatcher
- `src/routes/trips.tsx` — pass full itinerary to `setActiveTrip`, unlock Start for multi-leg
- `src/components/ItineraryCard.tsx` — remove multi-leg start disable
- `src/components/JourneyHUD.tsx` — leg-aware HUD copy

**DB migration:**
- `active_trips`: add `legs jsonb`, make legacy `board_*` / `alight_*` columns nullable.

## Quality bar (no-mediocrity rules from the plan)

- No silent failures: if the connecting bus's tripId disappears from the feed mid-trip, the UI falls back to scheduled time with an honest "we lost sight of bus 60" label, never a blank state.
- No regression for single-leg trips: a 1-leg itinerary still triggers the exact same UX as today.
- Push alerts idempotent: `alerts_sent` per-leg keys prevent double-firing on the 60s cron tick.
- Performance: per-tick cron work stays O(active trips × ride legs) — bounded since max 3 ride legs per trip.

## Sequencing

I'll ship in this order so each step is reviewable on its own:

1. Trip-store schema + migration (no UI change yet, just data shape).
2. DB migration on `active_trips`.
3. `useJourney` extended phase machine + dual-vehicle subscriptions.
4. `/trip/$id` UI for multi-leg.
5. `trip-alerts` per-leg alerts.
6. Unlock "Start this trip" on multi-leg cards.

This is the full spec. Approve to start, or push back on any piece first.
