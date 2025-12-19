# Unify the journey + ETA stack (10 steps)

Goal: one source of truth per concern (position, ETA, distance, snap, phase, copy), with Google APIs and our fused GPS as the authoritative signals. No hand-rolled approximations where a real system already exists.

Executed strictly in this order so each step lands on a stable base.

---

## 🔴 Accuracy fixes (do first)

### 1. Wire `useFusedFix` into `useJourney.ts`
- Replace the raw `useGeoWatch` call in `useJourney.ts` with `useFusedFix({ enabled, activePath })`.
- `activePath` = current leg's shape (from `getShapeForTripSync(tripId, routeId)` once on-bus, else the active walking polyline).
- Remove the local jitter smoothing — Kalman fuser owns that.
- Outcome: phase transitions stop oscillating; "Off in 4 / Off in 3" disagreement disappears because both HUD + map now read the same fused fix.

### 2. Feed real GTFS shapes into the ETA engines
- In `eta-v2.ts`, accept an optional `shape: LatLng[]` and, when present, snap the vehicle to it and measure remaining metres along the polyline instead of vertex-to-vertex straight lines.
- Fix the broken segment match at `eta-v2.ts:114` — replace `sum-of-distances-to-two-endpoints` with the real `snapToPolyline` (see step 6).
- Caller (`useJourney`, stop page, trip page) passes `getShapeForTripSync(tripId, routeId)`.

### 3. Retire the legacy ETA paths
- Delete `src/lib/predictor.ts` and `src/lib/eta.ts`.
- `smartEtaV2` becomes the only ETA function. All call sites (`StopCard`, `JourneyHUD`, `MultiLegCompanion`, `route.$routeId.tsx`, `stop.$stopId.tsx`, `useJourney`, `useMultiLegJourney`) import it directly.
- Normalize on the v2 `confidence: "high" | "medium" | "low"` + `band` string.

---

## 🟠 Architectural unification

### 4. One `distanceM` / one `bearingDeg`
- `geo.ts` is canonical. Delete `distanceKm` haversine duplicates in `gtfs.ts`, `eta-v2.ts`, `alight-detector.ts`, `wrong-stop-reroute.ts`.
- Re-export a `distanceKm = (a,b) => distanceM(a,b)/1000` shim from `gtfs.ts` for back-compat in one commit, then update call sites.

### 5. One `snapToPolyline` in `geo.ts`
- Move the segment-projection math from `eta-v2.ts` + `geo-fusion.ts` into `geo.ts` as `snapToPolyline(point, path) → { snapped, segIndex, tAlong, distM }`.
- Both ETA and fusion import from there.

### 6. Extract `fuseBusPosition()` + merge phase enums
- New `src/lib/bus-fusion.ts`: takes `{ vehicle, riderFix, onBus, shape }` and returns the single best `{ lat, lng, speedMps, source: "feed"|"rider"|"blend" }` used by both `useJourney` and `useMultiLegJourney`.
- Unify `LivePhase` and `MultiLegPhase` into one `JourneyPhase` enum in `src/lib/journey-phase.ts`. Both hooks emit the same strings.

---

## 🟡 Polish + best-in-class libraries

### 7. `src/lib/journey-copy.ts` — unified UX strings
- Export `EtaStatus`, `JourneyPhase` (re-export), `PHASE_COPY[phase]`, `fmtEta(min)`, `fmtBand(lower, upper)`.
- Replace every ad-hoc `"≈8 min"` / `"8 min"` / `Off in N` string in `JourneyHUD`, `MultiLegCompanion`, `StopCard`, `trip.$id.tsx`, `LiveReplanSheet`, `EarlyAlightSheet`.

### 8. Replace RAPTOR walk math with Google Routes (walking)
- `raptor.server.ts` access/egress legs: call Google Routes `computeRoutes` (mode WALK) via the connector gateway, cache per `(stopId|placeId)` pair in `walk_links` table.
- Remove the flat `WALK_M_PER_S` / `WALK_DETOUR` arithmetic; treat Google's duration + distance as truth.
- Falls back to current haversine×1.35 only on API failure.

### 9. Replace hand-rolled polyline decode with `@mapbox/polyline`
- `bun add @mapbox/polyline`.
- `shapes.ts` `decodePolyline` becomes a one-line wrapper around the lib (preserves the same `LatLng[]` return).

### 10. Marker clustering on fleet overview
- `bun add @googlemaps/markerclusterer`.
- Wrap the vehicle markers in `pulse.tsx` (fleet map) and the multi-stop preview in `MapPreview.tsx` with `MarkerClusterer` so dense Nicosia views stop overlapping.

---

## Technical notes

- Steps 1–3 are the only ones that change visible numbers; do them in one PR-sized batch and verify on `trip.$id` + `stop.$stopId` before moving on.
- Steps 4–6 are pure refactors — no behavior change expected; run typecheck after each.
- Step 8 requires the Google Maps connector (already connected). New cache table `walk_links` migration: `(from_stop_id, to_place_id, duration_sec, distance_m, polyline, updated_at)` keyed on the pair.
- No new env vars; no new secrets.

## Files touched (high-level)

```text
src/lib/useJourney.ts            (1, 2, 6)
src/lib/useMultiLegJourney.ts    (6)
src/lib/eta-v2.ts                (2, 5)
src/lib/eta.ts                   DELETE (3)
src/lib/predictor.ts             DELETE (3)
src/lib/geo.ts                   (4, 5)
src/lib/gtfs.ts                  (4)
src/lib/bus-fusion.ts            NEW (6)
src/lib/journey-phase.ts         NEW (6)
src/lib/journey-copy.ts          NEW (7)
src/lib/raptor.server.ts         (8)
src/lib/walk-links.server.ts     (8)
src/lib/shapes.ts                (9)
src/routes/pulse.tsx             (10)
src/components/MapPreview.tsx    (10)
src/components/JourneyHUD.tsx    (1, 3, 7)
src/components/MultiLegCompanion.tsx (3, 6, 7)
src/components/StopCard.tsx      (3, 7)
src/routes/trip.$id.tsx          (1, 7)
src/routes/stop.$stopId.tsx      (3, 7)
+ migration: walk_links table    (8)
```

Verification after each numbered step: typecheck + open `/trip/$id` and `/stop/$stopId` in preview, confirm no regression in HUD numbers or phase labels.
