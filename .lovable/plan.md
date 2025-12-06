## Build order

1. **Shortcut detection** — on every GPS tick during a multi-leg trip, check distance to final destination. If <250m and closing, prompt "Skip remaining bus, walk straight there?" → collapses remaining legs into a final walk.
2. **Early-alight re-route** — when rider taps "I'm off" >150m from the planned alight stop, classify as off-plan and re-run the planner from `{currentFix, destination}`. Show 2–3 fresh options (wait for same bus next stop, walk to nearer transfer, walk all the way).
3. **Override learning loop** — new `trip_overrides` table. Log `{from, to, planned_legs, actual_legs, override_kind}` when riders skip transfers or alight early. Planner reads aggregated overrides per OD pair and biases scoring (demote 2-bus when same OD has been skipped ≥3 times).
4. **Crowdsourced vehicle position** — while on-board (and feed has the bus OR feed lost it), POST rider GPS every ~5s to a public endpoint. Fold these "rider fixes" into the realtime vehicles list so every other passenger sees smoother bus motion and better ETAs. Includes server-side trust (only accept fixes for trips the rider is on; cap per-device rate; expire after 30s).

## Files

**New**
- `src/lib/useShortcutDetector.ts` — distance-to-destination watcher + dismissible state
- `src/components/ShortcutPrompt.tsx` — bottom-sheet "skip ahead?" prompt
- `src/lib/reroute.functions.ts` — `rerouteFromHere({fix, destination})` server fn
- `src/components/EarlyAlightSheet.tsx` — re-route options sheet
- `src/lib/overrides.functions.ts` — `logOverride`, `getOverrideBias` server fns
- `src/routes/api/public/rider-fix.ts` — POST endpoint for crowdsourced GPS
- `src/lib/useRiderFixReporter.ts` — POSTs GPS while on-board

**Edited**
- `src/lib/trip-store.ts` — `collapseToFinalWalk(currentFix)` action
- `src/lib/useMultiLegJourney.ts` — wire shortcut detector + early-alight detection + rider-fix reporter
- `src/components/MultiLegCompanion.tsx` — render prompts/sheets
- `src/lib/journey-multileg.server.ts` — apply override bias in planner scoring
- `src/lib/gtfs-rt.server.ts` — fold rider fixes into vehicles list

**Migrations**
- `trip_overrides` table (device_id, from_lat/lng, to_lat/lng, planned_legs jsonb, actual_legs jsonb, kind, recorded_at, hour, dow)
- `rider_vehicle_fixes` table (trip_id, route_id, lat, lng, bearing, speed_mps, device_id, reported_at) — ephemeral, TTL via index + cleanup

## Technical notes

- Shortcut detector: triggers only when (a) remaining itinerary has ≥1 ride leg ahead, (b) distance to `active.option.to` <250m, (c) distance is decreasing over last 3 fixes (avoid bus-passing-by false positives), (d) rider hasn't dismissed in this trip.
- Early-alight re-route reuses existing `planMultiLeg` server fn with `from = currentFix`; no new planner code beyond a thin wrapper.
- Override learning is conservative: bias only kicks in with ≥3 same-direction overrides for an OD pair within ~500m radius (geohash bucket). Logs override `kind`: `skipped-transfer`, `early-alight`, `manual-arrived`.
- Rider-fix endpoint: rate-limit 1 req / 5 s / device, only accept if `trip_id` matches an `active_trips` row for that device and `onBoardConfirmedAt` is set. Fixes <30s old fold into `useRealtime`'s vehicle list, deduped by `tripId` (rider fix wins when feed is stale, otherwise averaged with feed for smoothing).

I'll ship in this order with verification after each.