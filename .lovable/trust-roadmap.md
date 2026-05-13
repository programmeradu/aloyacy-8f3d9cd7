# Aloya Trust & Reliability Roadmap

Strategic north star: **Aloya is the most trusted way to ride in Cyprus.** Competitors (Pame, Cyprus Bus) lose riders to ghost buses, vague ETAs, and dead-ends when things go wrong. We win by handling real-world messiness better than anyone — not by adding features.

Scope of this document: the citizen-facing app only. Ministry dashboards, operator tools, and B2G surfaces are explicitly out of scope.

---

## Wave 1 — Fix Trust (Months 0–3)

Goal: every ETA shown in Aloya carries a credible confidence signal, and no rider is ever stranded by a ghost bus without an explanation.

### 1.1 Ghost Bus Suppression v2 — SHIPPED
- Central `classifyFreshness` (`src/lib/freshness.ts`) → tiers: `live` / `rider-confirmed` / `predicted` / `ghost` / `scheduled`.
- Agency-aware staleness thresholds (Urban 60s/180s, Intercity 90s/300s).
- `gtfs-rt.server.ts` tags `ghostTripIds` (active trip, arrival ≤30min, no fresh GPS).
- Surfaced in `StopCard`, `stop.$stopId`, `JourneyHUD`, `MultiLegCompanion`, `PulseLiveSection`, `StaleFeedBanner` (new `ghost-bus` variant).

### 1.2 Confidence-Banded ETAs — SHIPPED
- New `<EtaPill>` component (Headline / Compact / Stack) with confidence dot + tier label.
- `eta-v2.ts` returns confidence band; UI replaced ad-hoc ETA rendering.
- Copy: "4 min · high confidence" vs "~7 min · low confidence" vs "no gps · scheduled 12:34".

### 1.3 Rider-Confirmed Sightings — SHIPPED 2026-06-21
- Lovable Cloud table `bus_sightings` (RLS, rate-limited 45s/device/trip server-side, 60s local cooldown). Auto-cleaned after 10 min via `cleanup_bus_sightings()`.
- `POST /api/public/sighting` endpoint validates Cyprus bounds, dedups, inserts a row, fires cleanup. No auth — device-scoped trust model.
- Realtime snapshot folds recent sightings into `riderConfirmedTrips`, removes the trip from `ghostTripIds`, and the shared `classifyFreshness` upgrades the trip to `rider-confirmed` tier for the ghost window (90s urban / 5min IC).
- `SightingButton` component (full 44px row, localStorage cooldown, no GPS prompt — uses stop coords). Surfaced on:
  - `stop.$stopId` next to every ghost-tier departure.
  - `JourneyHUD` `AtStopCard` when the rider's own trip is ghost / not-tracked / feed-stale while waiting at the board stop.
  - `MultiLegCompanion` next to ghost/vehicle-lost banners for the current ride leg, and next to "next-not-tracked" for the upcoming connection while walking-to-transfer / waiting-for-connection.
- EN/EL `sighting.*` copy already in dictionaries from earlier groundwork.

### 1.4 Reliability Scores per Route — SHIPPED
- `getRouteReliability` server fn (`src/lib/reliability.functions.ts`) reads `delay_stats` and converts each (route, stop, hour, dow) bucket into a P(|delay|≤120s) estimate using a normal CDF, with a 30s stddev floor to prevent fake-perfect scores.
- Aggregates weighted by `sample_count`; tier thresholds: ≥80% high, 60–79 medium, <60 low, <30 samples = unknown.
- `<ReliabilityBadge>` (compact + stack variants) surfaces on route detail page header. EN/EL copy ("On time 78% · Avg 42s late · 1,204 observations").
- Per-stop reliability + Pulse filter integration deferred to a later pass.

### 1.5 Smart Alternatives on Failure — SHIPPED
- `useDisruptionWatch` extended with two new pre-board kinds: `ghost-pre-board` (current ride tagged ghost while walking-to-board or waiting-to-board, within 30min of boarding) and `late-pre-board` (live ETA slipped ≥ 8min vs scheduled before boarding).
- Both trigger the existing `DisruptionBanner` → `LiveReplanSheet` flow, which already reruns `rerouteFromHere` and lets the rider one-tap swap to a new itinerary.
- `LiveReplanSheet` now appends a Walk-Out option when the destination is within ~25min walking (straight-line × 1.3 detour, 1.3 m/s pace) — opens native Google Maps walking directions so the rider always has an out.
- EN/EL copy: distinct eyebrows ("Ghost bus" / "Running late") and bodies that name the route number; banner label keys added.
- Cancellation-alert trigger deferred to when a feed-level cancellation signal lands.

---

## Wave 2 — Daily Use Quality (Months 3–6)

Goal: when riders open Aloya for routine trips, every detail feels considered.

Refined priority (set 2026-06-21): rationale first (cheap trust win),
then accessibility-weighted routing, then multimodal quality, P&R,
Limassol coverage, trip chaining.

### 2.4 "Why this route?" Explanations — SHIPPED
- New `RationaleTag` union on `Itinerary` (`src/lib/itinerary-types.ts`) and pure ranker `annotateRationales` in `src/lib/itinerary-rationale.ts`.
- Tags are contrastive (computed against peers in the same result set), not absolute. Thresholds: ≥3 min for "fastest", ≥150 m for "less-walking", ≥2 min for "leaves-sooner", ≥2 min observed delay delta for "more-reliable".
- Up to 2 tags per option, joined with an em-dash. Top option gets a `best-overall` fallback so the #1 rank is always explained.
- Wired into `multileg.functions.ts` after the final sort, surfaced on `ItineraryCard` as a calm limestone block under the leg ribbon. EN/EL copy. No new ML, no extra server calls.

### 2.2 Accessibility-Weighted Routing — SHIPPED 2026-06-21
- Preferences stored in `user_settings.accessibility_prefs` (JSONB) with localStorage cache; anon riders keep prefs local-only.
- Settings card lives in `/wallet` (`AccessibilityPrefsCard`): toggles for step-free routing and shaded waits, plus a discrete-step walking cap (None / 400 m → 2 km).
- Planner contract extended (`multileg.functions.ts` `InputSchema.a11y`); weights applied in `accessibility-weights.ts` AFTER the final sort and BEFORE rationale annotation. Soft re-ranking only — never filters.
  - Walking-cap overshoot penalised at 1.0 sec/meter over limit.
  - Step-free: +60s per leg whose board/alight stop is known non-step-free.
  - Shade: +30s per non-shaded board/wait, −20s bonus when shaded; wait legs weighted by wait length up to 5 min.
- Stop amenity data: curated seed dataset (`src/data/stop-amenities.ts`) for major Nicosia hubs + intercity terminals. Unknown stops stay neutral (no guessing).
- `StopCard` surfaces positive amenity chips (Shelter / Shade / Seating / Step-free) when known; nothing otherwise.
- `lowFloor` preference stored and shipped through the planner contract but not yet weighted — wires in the moment GTFS-RT VehiclePosition wheelchair_accessible lands.
- EN/EL strings in both dictionaries.

### 2.1 Multimodal Walking Quality — SHIPPED 2026-06-21
- Walk-leg geometry already came from Google Routes API (`walkingRoute()` in `maps.server.ts`).
- Full step-by-step list with Street View imagery already shipped via `WalkGuidance` in both single-leg JourneyHUD and MultiLegCompanion (every walk leg: initial, transfer, final).
- NEW: `LiveWalkBanner` (this wave) — a live in-walk header above the step list that surfaces:
  - Current maneuver chip + instruction in big editorial type.
  - Meters countdown to the next turn (rounded to 5 m), flips to "Now" within 25 m.
  - "Then" preview of the next step, or "Last step" callout on the final.
  - Total distance + ETA remaining; ETA derived from `WALK_M_PER_S` ÷ remaining distance.
  - Shares the `getWalkingDirections` React-Query cache with WalkGuidance — no double-fetch.
  - GPS projection via existing `projectOnSteps()`; banner stays silent (no flicker) when fix or directions are missing.
- Bike-share: OUT OF SCOPE for Cyprus (no city-scale bike-share network).
- Stop entry/exit hints ("Board at Bay C", "Exit door at the front"): DEFERRED — no authoritative dataset; revisit if/when operator publishes bay assignments or we crowdsource it.
- `JourneyHUD` (single-leg) already had `LiveStepCard` from earlier work; left untouched.

### 2.3 Park & Ride Suggestions — SHIPPED 2026-06-21
- Curated hub inventory (`src/data/park-and-ride.ts`): GSP Stadium, Engomi/UCY ring, Strovolos Municipal Hall, Mall of Cyprus, Lakatamia. Each entry verified for real free/cheap parking + frequent inbound bus link.
- `suggestParkAndRide` server fn (`src/lib/park-and-ride.functions.ts`):
  - Geometry gates first (origin ≥5 km from Nicosia centre, destination ≤8 km, O→D ≥6 km). Pure haversine; no API call when the trip can't possibly benefit.
  - Filters hubs that genuinely intercept (closer to destination than origin, ≥2 km drive, ≤9 km bus-to-destination).
  - For top 2 candidates, calls `drivingRoute` (Google Routes, TRAFFIC_AWARE) and `planMultiLegJourney(hub→dest)` in parallel — never haversine + avg-speed (per Accuracy-over-Reinvention rule).
  - Adds a 3-min parking buffer. Surfaces only when (a) bus-only doesn't exist, (b) total ≤ bus-only − 5 min, or (c) origin walk to first stop ≥ 800 m AND total ≤ bus-only + 2 min (comfort path).
- `ParkAndRideCard` rendered above `ItineraryResults` on `/trips`: editorial two-column ribbon (Drive / Bus), numerals carry the story (no icons, no bullet dots). "Open driving directions" deep-links to Google Maps. Honest copy distinguishes faster vs. comfort vs. no-bus-only.
- Parallel React Query, 5-min staleTime, throttled gateway use.
- EN/EL strings under `pnr.*`.

### 2.5 Limassol Coverage — SHIPPED 2026-06-21
- Discovery: the bundled GTFS static already includes all Cyprus operator feeds (NPT 194 routes, LMS 244 routes, LCA 133, PFO 112, FAM 53, IC 60). The realtime upstream proxy delivers the national feed, so Limassol vehicles flow through `fetchRealtime()` automatically. The blocker was UI/UX assumptions that treated Cyprus as Nicosia-only.
- New `src/lib/cities.ts` — single source of truth for the five cities (Nicosia, Limassol, Larnaca, Paphos, Famagusta): centre coordinates, agency mapping (`NPT`/`LMS`/`LCA`/`PFO`/`FAM`), urban core radius, `nearestCity()` and `isInCityCore()` helpers. Replaces the lone `NICOSIA_CENTER` constant as the way to reason about "where is the rider?".
- Place autocomplete biases now follow the rider:
  - `/trips` `PlacesPicker` biases to the nearest city of the current origin (cold start still falls back to Nicosia).
  - `NLPlannerCard.geocodeOne` biases to the nearest city of the last cached GPS fix.
  - A Limassol rider typing "Mall" / "Old Port" now lands on Limassol results first.
- Park & Ride suggester is now per-city:
  - `park-and-ride.ts` hubs gained a `city: CityId` field; new `hubsForCity(cityId)` helper.
  - Limassol catchment added: My Mall Limassol, Limassol Mall, Polemidia junction, Limassol New Port (verified parking + EMEL inbound).
  - `suggestParkAndRide` frames the suggestion around the **destination** city: it only fires when the origin is outside that city's core, the destination sits inside it (+3 km buffer), the trip is ≥6 km, and the rider isn't already inside the same city's core. Intra-city trips never get pushed onto a car.
- Freshness classifier already agency-correct (urban thresholds for LMS/LCA/PFO/FAM, IC relaxation for intercity), so no further wiring needed there.
- Out of scope for this ship: a "You're in Limassol" header affordance — deferred until we have a real signal that riders find the auto-bias unclear.

### Wave 2 — closed. Goal met: every Wave 2 daily-use feature has landed.

### 2.6 Trip Chaining — DEFERRED (late Wave 2)
- Higher complexity; revisit after 2.1–2.5 ship.

---

## Wave 3 — Advanced Multimodal (Month 6+)

Goal: chain modes intelligently when the bus-only answer is poor.

### Cross-island intercity intelligence — SHIPPED 2026-06-21
- New `getIntercityInsights` server fn (`src/lib/intercity-intel.functions.ts`) reduces `delay_stats` for a given route into a weekly pattern: weekday vs weekend weighted mean delay, the single most reliable (dow, hour) bucket, and up to 3 anomaly callouts where buckets exceed the route baseline by ≥90 s **and** clear a 1.0σ z-score (stddev floor 60 s — IC feed is noisier than urban).
- Bucket aggregation collapses every stop into (dow × hour) before the stats run, so a long route's hottest segments don't get smeared away by quiet ones at the endpoints.
- Three tiers — `rated` (≥60 weighted samples), `learning` (some data, no claim), `unknown` (no data). Anomalies only ever surface in `rated`; learning routes render an honest "still learning" line instead of fake confidence.
- `IntercityPatternsCard` (`src/components/IntercityPatternsCard.tsx`) renders the card on `/route/$routeId` for IC routes only: weekday/weekend split with delta callout (only above 1 min absolute), most-reliable departure window, and an anomaly stack labelled "Run-times to plan around" with day-name + hour-band headlines.
- Shared day-name dictionary (`day.short.*` / `day.long.*`) added in EN + EL — first time the app renders day-of-week names, useful beyond this feature.
- React Query staleTime 30 min, enabled only when `agency === "IC"` — no useless calls for urban routes.

### Trip chaining (last-mile taxi handoff) — SHIPPED 2026-06-21
- New `suggestLastMileChain` server fn (`src/lib/last-mile-chain.functions.ts`). Triggers when the final walk to the destination is ≥1500 m, **or** ≥800 m and the rider arrives between 21:00–06:00 Cyprus time (Intl.DateTimeFormat with Asia/Nicosia, DST-safe).
- Real driving ETA + distance via `drivingRoute` (Google Routes, TRAFFIC_AWARE). No haversine fallback — if Google fails we don't show the card. Also suppresses when driving distance < 600 m (walk is obviously fine).
- Fare estimate uses Cyprus's regulated taxi tariff: flag-fall €3.42 + €0.85/km day or €1.05/km night (20:30–06:00), €5 minimum, ±15% range, rounded to nearest €0.50.
- `LastMileChainCard` component: editorial three-column ribbon (Drive / Distance / Fare), three CTAs — Open in Bolt (universal deep link with pickup + destination coords), Call a taxi (tel: link to Travel Express Cyprus 24/7 dispatcher), Open in Maps. Bilingual EN/EL copy under `chain.*`.
- Two surfaces:
  - `/trips` planning page renders the card below the top itinerary so the rider sees the handoff before committing.
  - `MultiLegCompanion` pre-fetches the suggestion when the itinerary's final walk is ≥800 m and shows the card during `walking-to-destination` phase — alongside the existing `LongFinalWalkHint`, so the rider can switch to a taxi the moment they alight.

### Bike-share (Nextbike Cyprus) — SHIPPED 2026-06-21
- Reversed the earlier "out of scope" call: Nextbike actually runs in all 5 urban regions (Limassol, Nicosia, Larnaca, Paphos, Famagusta) with ~516 docked stations and ~860 bikes live across the island. Public `nextbike-live.json` feed, no auth, ~10-min refresh.
- New `src/lib/bikeshare.functions.ts`:
  - `nearestBikeStations({ near, max, needBikes, needRacks })` — reusable for future surfaces (map overlay, stop pages, last-mile alts).
  - `suggestBikeShare({ from, to, busOnlyDurationSec })` — only fires when OD is 1.5–8 km, **both** endpoints have a station within 650 m walk, pickup station has ≥1 bike, dropoff has ≥1 free rack, ride ≥800 m, and total (walk + 90 s unlock + ride at 16 km/h + 60 s return + walk) saves ≥3 min vs the bus plan (or no bus plan exists).
  - Module-level 60 s cache on the Nextbike feed — many planners hit one upstream call.
  - Stale-cache fallback if upstream is temporarily down; never invents station counts.
- `BikeShareCard` rendered on `/trips` above `ItineraryResults` (after Park & Ride, before bus list): editorial 01/02/03 ribbon (pickup → ride → dropoff), live bike + rack counts, "Open Nextbike" + cycling-mode Google Maps deep link. Numerals, no icons, no bullet dots. EN + EL strings under `bike.*`.
- Honesty: never recommends a station with 0 bikes or a dropoff with 0 racks; never suggests cross-city cycling.

### Bolt e-scooters (Nicosia) — SHIPPED 2026-06-21
- CyNAP `boltstations` Datex II XML feed (no auth, ≤30 min refresh) — 255 mandated parking zones across Nicosia (Strovolos, old town, Aglandjia, Engomi, Latsia, Lakatameia).
- New `src/lib/bolt-scooter.functions.ts`:
  - Minimal Datex II XML parser (no extra deps) — extracts identifier, name, capacity, centroid lat/lng per zone.
  - `nearestBoltZones({ near, max, radiusM })` — Nicosia bbox-gated, reusable for future map overlay.
  - `suggestBoltScooter({ from, to, busOnlyDurationSec })` — only fires when **both** endpoints sit inside Nicosia bbox AND within 350 m walk of a parking zone, OD is 0.8–4 km, ride ≥600 m, pickup ≠ dropoff zone, and total (walk + 45 s unlock + ride at 14 km/h + 45 s park + walk) saves ≥2 min vs the bus plan (or no bus plan).
  - Module-level 10 min cache, stale-cache fallback.
- `BoltScooterCard` rendered on `/trips` (after BikeShareCard, before ItineraryResults): editorial 01/02/03 ribbon (pickup zone → ride → dropoff zone), parking-slot capacity, walk distances, "Open Bolt" + cycling-mode Maps deep link. Numerals, no icons, no bullet dots. EN + EL strings under `bolt.*`.
- Honesty: NEVER claims live scooter counts (Bolt's app is the source of truth). Sells legal viability — "you can legally start here and park there" — and tells the rider to confirm a live scooter in the Bolt app before walking.

### EV chargers at Park & Ride hubs — SHIPPED 2026-07-01
- `ParkAndRideHub.ev` field (count, kwMax, kind ac/dc, network). Curated & verified: Mall of Cyprus (4× 22 kW AC — EAC ChargeIn), My Mall Limassol (6× 22 kW AC), Limassol Mall (4× 22 kW AC). Hubs without on-site charging carry no `ev` — Aloya never guesses.
- `ParkAndRideCard` surfaces an olive ribbon under the hub note: "{count} AC bays up to {kw} kW — {network}" + rider-facing hint ("Plug in, hop on the bus, come back to a topped-up car."). Numerals carry the story; no icons, no bullet dots.
- Suggestion type propagates `ev` through the server fn so mobile can pick it up next.
- Bilingual EN/EL copy under `pnr.ev*`.

### Live EV charger availability (CyNAP feed) — SHIPPED 2026-07-01
- New `src/lib/ev-chargers.functions.ts` — Datex II parser for the CyNAP `electric_vehicle_chargers` dataset. Handles both `energyInfrastructureSite` and legacy `electricChargingPoint` block shapes. Extracts per-bay `availabilityStatus` (available / occupied / offline / unknown), station coordinates, operator, max kW, and feed timestamp. Module cache 10 min, stale-cache fallback, 6 s upstream timeout.
- Public server fn `nearestEvChargers({ near, radiusM, max })` for a future map overlay / stop-detail surface. Server-internal `liveEvForHub(hub)` aggregates every charger within 200 m of a hub centroid into a single snapshot (total bays, live-available count when the operator publishes it, kwMax, kind, operator, updatedUnix).
- `suggestParkAndRide` now enriches `hub.ev` with a `live` block for any hub that carries curated EV data. Feed failure is silent — the curated numbers still render.
- `ParkAndRideCard` upgrades the olive EV ribbon: "Live" pulse chip + "3 of 4 AC bays free right now · up to 22 kW · EAC ChargeIn" + freshness stamp ("Updated 4 min ago — from the national EV feed"). When the operator doesn't publish live status, the card honestly says so instead of guessing.
- Bilingual EN/EL copy under `pnr.evLive*`, `pnr.evFresh*`, `pnr.evNoLive`.

### Kapnos Airport Shuttle — SHIPPED
- `src/lib/kapnos.functions.ts` — live pull of the kapnos.ecoachmanager.com booking API (`/coachtrip/api/trip-type-all`). Parses every active route with pickup/dropoff coordinates + the next ~60 scheduled departures including seat availability. 10-min module cache, stale-cache fallback on upstream failure.
- `suggestKapnos({ from, to, afterUnix?, beforeUnix? })` — direction-aware matcher: only fires when one endpoint sits within 3 km of an airport stop AND the other within 10 km of that route's city stop. Honors the rider's requested departure/arrival window (never surfaces a 1am coach when they asked for 7am). Walks candidates best→worst until one has actual upcoming seats — earlier version locked onto the closest route and returned null when its last bus had left.
- `KapnosShuttleCard` on `/trips`: editorial ribbon with route code, pickup/dropoff with walking distance, next 3 departures (local time, seats left, fare from), deep-link to Kapnos booking. First-mile + last-mile bus legs pre-computed via `planMultiLegJourney` when the walk to/from the coach stop exceeds `KAPNOS_WALKABLE_M`, so the rider sees the full door-to-door chain — not just the coach segment.
- Honesty: seat counts as-published (never rounded up), deep-link to Kapnos for the transaction (we don't intermediate), gone-departures filtered in Cyprus local time.
- Bilingual copy under `kapnos.*`.

### Traffic alerts on your route (CyNAP DATEX) — SHIPPED 2026-07-01
- Ingest already existed at `/api/public/hooks/pulse-traffic` (DATEX II v2/v3 parser, per-zone + island rollups into `pulse_signals`). Rendered ambiently on Pulse via `TrafficCard`.
- NEW: trip-level surface. `src/lib/traffic-alerts.functions.ts` `getItineraryTrafficAlerts({ points })` — dedupes across all fresh (≤60 min) traffic rows, filters incidents within 500 m of any itinerary sample point (board/alight coords + walk endpoints), sorts by severity then proximity, caps at 4 alerts. Returns `null` when nothing intersects — no fake "all clear" ribbon.
- `TrafficAlertsCard` on `/trips` renders above `ItineraryResults` only when the top itinerary is actually affected: eyebrow + severity chip (low=olive, medium=ochre, high=aegean-deep), numbered rail with kind/road/headline + distance-from-route, source + freshness footer.
- Bilingual EN/EL copy under `traffic.*` (eyebrows, severities, kinds, source/updated labels).
- Honesty: distance rounded to 50 m, never overstates severity, ignores incidents older than 60 min, silently degrades when the feed hasn't been configured or ingest hasn't fired.

### Group trips — live co-presence — SHIPPED
- `WatchTogetherButton` on the planner results creates a `trip_groups` row (6-char code, 6h expiry) and auto-joins the host as the first `trip_group_members` row.
- `/group/:code` shows everyone converging on the same destination on one map: per-member tone chips, live positions, "arriving together" card summarising first/last ETA and spread ("Everyone in ~14 min" vs "First in 8 · last in 22").
- Members ping every 25s via `pingGroupMember` server fn, which recomputes ETA using Google Routes (TRANSIT for >1.2 km, WALK below) so the countdown is real transit time, not haversine math.
- Anonymous-safe: create / join / leave all work without an account. Realtime channel on `trip_group_members` gives instant updates when others move.
- `Leave group` button and auto-expiry keep ghost members from lingering.

### Still planned
Nothing. Every wave shipped.

---

## Explicitly Out of Scope

- Ministry dashboards, operator-facing tools, B2G surfaces.
- Pame/Cyprus Bus parity features that don't move the trust needle.
- Generic gamification (badges, streaks).
- Social feed / public commenting.

## Cross-Cutting Principles

- Accuracy over reinvention: authoritative APIs as source of truth; our value is fusion, anomaly detection, and presentation on top.
- Every trust signal must be explainable in one line of copy.
- No dark patterns. If we don't know, we say "we don't know" — never fake confidence.
- Mobile-first, light theme only, no thin type, no emoji, no bullet dots (see core memory).

## Status Legend
- SHIPPED — in production.
- NEXT — actively being built.
- PLANNED — designed, not started.
