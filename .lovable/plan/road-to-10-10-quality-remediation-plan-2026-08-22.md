# Road to 10/10: quality remediation plan

Two gaps remain against the skill's matrix: test coverage (5.56% vs 70% floor) and
37 hand-written files over the 500-LOC ceiling. Everything else already passes.

## Which strategy is best

**Split the god files first, then chase coverage.** Reason: coverage written against
1,700-line route components has to go through React rendering, mocked Maps SDKs and
mocked network — slow, brittle, and it gets thrown away the moment the file is split.
Splitting first pushes the real logic (fare math, ETA fusion, itinerary shaping,
validation) into small pure modules that are trivial and durable to test. The same
effort then buys far more covered lines per test.

Coverage is also a **measurement scope** decision, not only a test-writing one. The
70% floor is meaningful over business logic, not over hooks that are thin wrappers on
browser APIs. So the plan narrows the coverage `include` to logic modules, excludes
SDK-bound shims explicitly (each with a comment), and enforces the threshold in CI.

## Phase 1 — Extract logic out of god files (unlocks everything else)

Work by shared logic, not by file, so web and mobile stop duplicating:

1. `packages/core` gains pure modules extracted from the biggest offenders:
   - fare/ticketing rules, itinerary shaping and leg merging (from `MultiLegCompanion`
     on both platforms — currently 1,367 + 1,019 LOC of near-duplicates)
   - pulse aggregation and zone rollups (from `mobile/app/(tabs)/pulse.tsx` 2,100 LOC
     and `src/components/PulseLiveSection.tsx` 1,190 LOC)
   - trip-plan state machine and share-link hydration (from `src/routes/trips.tsx` 1,691)
   - map overlay geometry and marker clustering math (from `MapPreview.tsx` 1,731)
2. Each route/component keeps only rendering plus wiring, targeted under 300 LOC.
3. Split point rule: a file is done when no exported function in it touches both
   network/DOM and business rules.

Ordering: the 8 files above 1,000 LOC first, then the 700–1,000 band, then 500–700.

## Phase 2 — Coverage to the 70% floor

1. Set `thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 }` in
   `vitest.config.ts`, with a narrowed `include` covering `packages/core/src/**` and
   the logic modules under `src/lib/**`, and explicit commented `exclude`s for
   browser-SDK shims (`useGoogleMaps`, `useNfc`, `useQr`, geolocation wrappers).
2. Write tests bottom-up in three layers:
   - pure logic from Phase 1 (highest yield, no mocks)
   - server functions and API route handlers via their Zod validators and injected
     fetch, using MSW/in-memory fakes — zero network
   - a thin integration layer for the planner: fixed GTFS fixture in, itinerary out
3. Raise the threshold in steps (30 → 50 → 70) so CI stays green at every commit and
   never regresses.

## Phase 3 — Boundary validation and observability sweep

1. Every `src/routes/api/**` handler parses its input with Zod; no `as any` at the edge.
2. Replace ad-hoc `console.*` in server paths with the structured logger, keeping
   client-side diagnostics intact.
3. Extend `/api/public/health` to report database and relay reachability distinctly.

## Phase 4 — Release hygiene

Conventional commits paired with their tests, then a `v1.0.0` tag once the CI gate
(lint --max-warnings=0, typecheck, test --coverage at 70, audit, build) is green.

## Guardrails

- No behaviour changes. Every extraction is a pure move plus re-export; the build and
  the existing 141 tests must stay green after each step.
- Mobile and web must keep importing the same extracted module — no re-forking.
- Work lands in phases so you can stop after any one of them with the repo improved
  and shippable.

## Effort

Phase 1 is the bulk (the 8 largest files are roughly a session each in pairs).
Phase 2 follows quickly once the logic is isolated. Phases 3 and 4 are short.
