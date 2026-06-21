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

### 1.3 Rider-Confirmed Sightings — NEXT
- Lovable Cloud table `bus_sightings` (RLS, rate-limited 1/60s/user/trip).
- `confirmSighting` server fn; "I see this bus" pill on `StopCard` (within ~120m of stop) and `JourneyHUD` (on-bus).
- One confirmation upgrades trip to `rider-confirmed` tier for 90s — recovers ghosted trips when GPS feed lags.

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

### 2.2 Accessibility-Weighted Routing — NEXT
- Preference: step-free, low-floor bus, shaded waits, max walking distance.
- Stored per-profile; planner accepts as ranking weights, not hard filters.
- Surface affordances on `StopCard` (shelter / shade / seating / step-free).

### 2.1 Multimodal Planning Quality — PLANNED
- Walk-leg accuracy via Google Routes (already wired) — extend to bike-share where available.
- Step-by-step turn instructions in `JourneyHUD` walking phases.
- Stop entry/exit hints ("Board at Bay C", "Exit door is at the front").

### 2.3 Park & Ride Suggestions — PLANNED
- For trips originating outside Nicosia core, suggest "Drive to X, bus from there" when total time is competitive.
- Requires P&R inventory dataset (manual seed for Strovolos, Engomi, Latsia hubs).

### 2.5 Limassol Coverage — PLANNED
- Wire EMEL (Limassol) GTFS-RT feed end-to-end (static, realtime, classifier thresholds, route tones).
- Strategic: closes the biggest market gap vs Pame.

### 2.6 Trip Chaining — DEFERRED (late Wave 2)
- Higher complexity; revisit after 2.1–2.5 ship.

---

## Wave 3 — Advanced Multimodal (Month 6+)

Goal: chain modes intelligently when the bus-only answer is poor.

- Trip chaining (bus → bike → walk; taxi handoff for last mile after-hours).
- Bike-share integration (Nextbike Cyprus where coverage justifies).
- Scooter integration (Bolt / Lime if launched in CY).
- Group trips (shared planning links, live ETAs to multiple riders).
- Cross-island intercity intelligence (anomaly detection, weekend pattern learning).

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
