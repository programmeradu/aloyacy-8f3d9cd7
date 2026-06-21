# Wave 1 — Trust Layer

Goal: turn Aloya into the only Cyprus app riders trust when buses go missing or run late. Ship **Ghost Bus Suppression v2** and **Confidence-Banded ETAs** together — they read the same freshness signal, so building them in one pass avoids duplicate plumbing.

We already have the foundations: `bus-fusion.ts` (45s / 120s thresholds), `eta-v2.ts` (live / predicted / scheduled tiers, p25 / p50 / p90 band, `confidence`, `pingAgeSec`). What we lack is consistent surfacing, a 60s "ghost" rule, and rider-confirmed sightings to recover from feed dropouts.

## What the rider will see

1. Every ETA shows a **band + confidence dot**: `4 min · high` / `~7 min · low` / `8–14 min · medium` — never a single naked number when confidence is low.
2. A vehicle with no GPS ping in 60s is **demoted to "scheduled" with a "NO GPS" badge** instead of showing a phantom live chip.
3. A vehicle silent for 3+ minutes on an active trip is flagged **"likely ghost — using schedule"** across stop card, trip HUD, route detail, and Pulse.
4. Rider can tap **"I see this bus"** (when at a stop / on board) to confirm presence. One sighting upgrades the trip back to "rider-confirmed live" for 90s.
5. Pulse gains a **per-route freshness pulse**: green (most vehicles fresh) / amber (mixed) / grey (ghost-heavy). Already half-built in `pulse.functions.ts`.

## Technical scope

### Shared freshness model (one source of truth)
- New `src/lib/freshness.ts`: pure module exporting `classifyFreshness({ pingAgeSec, hasVehicle, hasRiderConfirm }) → { tier: 'live' | 'rider-confirmed' | 'predicted' | 'ghost' | 'scheduled', confidence: 'high' | 'medium' | 'low', badge: string }`.
- Thresholds: fresh ≤60s, predicted 60–180s, ghost >180s on an active trip, scheduled when no vehicle at all. Tighten `eta-v2.ts` `PING_FRESH_SEC` from 60 → 45 and add a `PING_GHOST_SEC = 180`.
- `eta-v2.ts` returns the new `tier` and downgrades `freshness: 'live' → 'scheduled'` when ghost, so every consumer flips automatically.
- `bus-fusion.ts` exposes `source: 'rider-confirmed'` when a recent sighting exists.

### Ghost detection
- In `gtfs-rt.server.ts` snapshot: for each `tripUpdate` with an active stop time but no `vehiclePosition` (or last position >180s old), tag it `ghost: true` on the proxy payload.
- `useRealtime.ts` exposes `ghostTripIds: Set<string>` so any component can ask "is this trip a ghost?" without re-computing.

### Rider-confirmed sightings
- New table `bus_sightings` (Lovable Cloud) — `trip_id, stop_id, user_id, lat, lng, created_at`. RLS: authenticated insert own; anon SELECT aggregate count via RPC only. GRANTs per project rules.
- Server fn `confirmSighting` (auth required) — rate-limited 1 per trip per 60s per user.
- Server fn `recentSightings({ tripIds })` — returns `{ tripId: { count, lastSeenSec } }` aggregated; called by `useRealtime`.
- Client UI: small "I see this bus" pill on `StopCard` (when user GPS within ~120m of stop) and on `JourneyHUD` when `onBus`.

### UI surfacing (consistent everywhere)
- New `<EtaPill>` component: number + band + confidence dot + freshness chip. Replaces ad-hoc ETA rendering in:
  - `src/routes/stop.$stopId.tsx`
  - `src/components/StopCard.tsx`
  - `src/components/MultiLegCompanion.tsx` / `JourneyHUD`
  - `src/components/CommuteSuggestionCard.tsx`
- `StaleFeedBanner` gains a `"ghost-bus"` variant with copy in i18n: "No GPS for this bus in 3+ min. Showing scheduled time."
- `PulseLiveSection` / `pulse.tsx`: per-route freshness dot in the road-pulse card (green ≥70% fresh, amber 30–70%, grey <30%).

### Edge cases handled in first pass (per project rule)
- Intercity (IC) feed: thresholds relaxed to 90s fresh / 300s ghost (sparser pings are normal).
- No RT feed at all (Limassol gap): show "scheduled timetable" tier explicitly — never silently downgrade.
- Transfers: ghost status propagates to downstream leg of a multi-leg journey ("first bus untracked — second leg ETA assumes schedule").
- Empty / very long route names in `<EtaPill>` — truncation only on the route badge, never on the time band.

## Files to add / change

```
add    src/lib/freshness.ts                (shared classifier)
add    src/components/EtaPill.tsx          (single canonical ETA display)
add    src/lib/sightings.functions.ts      (confirm + fetch)
add    supabase/migrations/*_bus_sightings.sql
edit   src/lib/eta-v2.ts                   (use classifier, add ghost tier)
edit   src/lib/bus-fusion.ts               (rider-confirmed source)
edit   src/lib/gtfs-rt.server.ts           (tag ghost trips on snapshot)
edit   src/lib/useRealtime.ts              (expose ghostTripIds + sightings)
edit   src/components/StopCard.tsx
edit   src/routes/stop.$stopId.tsx
edit   src/components/MultiLegCompanion.tsx
edit   src/components/StaleFeedBanner.tsx  (add ghost-bus variant)
edit   src/components/PulseLiveSection.tsx (route freshness dot)
edit   src/lib/pulse.functions.ts          (aggregate freshness pct per route)
edit   src/lib/i18n/* (en + el)            (new strings)
```

## Out of scope for Wave 1
- Reliability scores per route/stop (Wave 1.5 — needs sighting + freshness history first)
- Smart Alternatives on failure (Wave 1.5 — builds on ghost signal)
- Arrive-by probability, Limassol coverage, accessibility routing → Wave 2

## Validation
- Unit: `freshness.ts` truth table covering all five tiers + IC vs urban.
- Playwright: open a stop, mock a stale realtime payload, screenshot to confirm "NO GPS" badge + band chip render correctly on mobile width (375px).
- Manual: walk the Pulse, stop detail, trip HUD, multi-leg, and Commute card with a live feed to confirm no naked ETAs remain.

Ship target: one PR, behind no flag — the freshness story should land cohesively.
