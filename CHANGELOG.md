# Changelog

All notable changes to Aloya are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Prometheus metrics: a dependency-free in-process registry
  (`src/lib/metrics.ts`) with counters, gauges and summaries, exposed as
  `GET /api/public/metrics` in the 0.0.4 text exposition format and optionally
  gated by `METRICS_TOKEN`. `captureException` and the health probes feed it,
  so error rate and dependency state are scrapeable. Covered by
  `tests/metrics.test.ts` and `tests/metrics-endpoint.test.ts`.
- `tests/health-endpoint.test.ts` pins the `GET /api/public/health` payload
  contract relied on by the Docker healthcheck and uptime monitors.
- SSR error tracking (`src/lib/error-tracking.ts`): unhandled request failures
  and catastrophic SSR responses are mirrored to a Sentry-compatible ingestion
  endpoint alongside the structured log line. Wire-protocol only, no SDK, so it
  stays Worker-safe; a no-op without `SENTRY_DSN`, and it never throws on a
  failure path. Covered by `tests/error-tracking.test.ts`.
- CI fast-fails before install when `bun.lock` is missing from the tree, in
  addition to the existing drift check.

### Fixed
- `bun.lock` is no longer flagged `linguist-generated` in `.gitattributes`.
  Repository scanners skip generated-flagged paths, which made the committed
  lockfile read as absent (`lockfiles_found: []`) despite being tracked.
- Root `.env.example` now mirrors every `EXPO_PUBLIC_*` name from
  `mobile/.env.example` and documents `SENTRY_DSN`, so one file lists the whole
  monorepo's configuration surface.

- Cloudflare worker coverage: the GTFS relay's hand-rolled HTTP/1.1 parsing
  moved to `workers/gtfs-relay/src/http-parse.ts` and the cron scheduler's job
  table and cron routing to `workers/pulse-cron/src/jobs.ts`, both with suites
  (`vitest.config.ts` now collects `workers/*/src/**`). Neither worker had a
  single test before; the socket and scheduled entry points are now thin
  shells over tested pure logic.
- `scripts/check-env-parity.mjs` now also checks the Expo app: every
  `EXPO_PUBLIC_*` read under `mobile/` must exist in `mobile/.env.example`.
- CI fails when `bun.lock` drifts from `package.json` (`git diff --exit-code`
  after a frozen install), so a lockfile is provably committed and current.

### Changed
- `src/components/ui/sidebar.tsx` (744 lines) split into
  `src/components/ui/sidebar/` — `context`, `shell`, `group`, `menu` and a
  barrel — removing the last allowlist entry from the file-size ceiling; the
  ceiling now applies to every hand-written file except two generated ones.
- The two oversized suites split along their seams:
  `multileg-journey` into `.phase` / `.advance` and `eta-v2` into `.snap` /
  `.confidence`, with shared builders in `__fixtures__/`.

### Removed
- `mobile/android.bundle` — a 5.9 MB generated bundle committed by mistake,
  now gitignored.


## [1.1.0] - 2026-08-23

### Added
- Licensing artefacts for commercial handover: a proprietary root `LICENSE`,
  `COMMERCIAL.md` covering what a buyer receives, deployment-right tiers,
  operational obligations and third-party attributions, and
  `"license": "UNLICENSED"` on every workspace manifest. `mobile/LICENSE` no
  longer carries the Expo template's MIT text, which never described this app.
- `tests/file-size.test.ts` enforces the 500-line ceiling on hand-written
  source (800 for suites) with a short, justified allowlist covering only the
  two generated files and the vendored shadcn sidebar — and fails if an
  allowlist entry goes stale.
- `tests/server-logging.test.ts` guards the rule — it walks `src/routes/api`
  and `src/routes/lovable` and fails on any raw `console.*`, with the logger's
  own console sink as the single documented exemption.
- Path-parameter validation on the dynamic Open Graph routes: group codes and
  plan tokens are normalised through shared Zod schemas
  (`src/lib/http/og-params.ts`), so malformed input never reaches the database
  and crawlers still receive a branded fallback card instead of an error.

### Changed
- Mobile coverage floors ratcheted to the measured run — 78% lines/statements,
  88% functions, 93% branches — so the harness locks in its gains instead of
  sitting 8 points above a stale 70% floor.
- The OG brand fonts moved out of the source tree: `src/lib/og-fonts.server.ts`
  drops from 5124 lines to ~30 and reads its base64 payload from
  `src/assets/og-fonts.json`, inlined by the bundler at build time. The file is
  no longer lint-exempt, and card rendering is unchanged.
- Every server-executed path now logs through the structured JSON logger
  (`createLogger(scope)`) instead of raw `console.*`: the auth-email webhook
  and the email queue worker emit one searchable object per line with `level`,
  `scope` and typed fields, and thrown values are serialised through
  `serializeError` rather than stringified into a message.

### Added
- A dedicated mobile test harness (`vitest.mobile.config.ts`) running the Expo
  app's logic modules in Node with the native bridges stubbed
  (`mobile/test/stubs/`): 264 specs covering motion-pass storage, wallet
  platform branching, freshness parity with the core trust layer, rescue
  re-planning, trip alerts, the Ask Aloya natural-language pipeline and i18n.
  CI enforces the gate at 70% lines / 93% branches via `test:mobile:coverage`.

- First component-level test layer: colocated suites for `EtaPill`,
  `ReliabilityBadge`, `ConfidenceIcon`, `DisruptionBanner`, `CrowdHint`,
  `SightingButton` and `SharePlanButton` assert rendered behaviour (ghost vs.
  live tiers, tooltip hover/focus/keyboard paths, empty and error states,
  cooldown restore, retry labels) under jsdom with jest-dom matchers wired in
  `src/test/dom-matchers.ts`. Suite is 1765 specs, all offline.
- Reproducibility guarantees for a cold clone: `bun.lock` is the single source
  of truth for the root app, `packages/core` and `mobile/`, `packageManager`
  and `engines` pin Bun 1.3 / Node 20, and the README's quick start is now the
  literal four commands (`bun install --frozen-lockfile`, `test`, `build`,
  `dev`) that take an empty directory to a green suite with no credentials.
- `.gitattributes` marks the machine-written sources (`supabase/types.ts`,
  `routeTree.gen.ts`, `og-fonts.server.ts`, `bun.lock`) as generated so they
  stop counting as hand-maintained code in reviews and diffs.

### Changed
- The 1343-line flat `en`/`el` translation tables are split into 19 matching
  namespace modules per locale (`dictionaries/en/trip.ts`, `hud.ts`, …), each
  well under 300 LOC, merged back in `index.ts` with the key set and ordering
  verified byte-identical to the originals.
- `@aloya/core/journey-live`: the shared live-journey reasoning for single-leg
  trips — phase resolution, the vehicle-position ETA floor, GPS/feed marker
  fusion and alert selection — pinned by 38 unit tests.
- `@aloya/core/multileg-journey`: the shared multi-leg reasoning — leg
  resolution, the phase machine, on-board vehicle fusion, the alight ETA
  floor, leg auto-advance, GPS boarding auto-confirm and connection alerts —
  pinned by 47 unit tests.
- `@aloya/core/single-leg-phase`: the single-leg trip companion's phase
  machine and rider-facing copy (schedule vs. GPS-truth phase, walk routing,
  countdown clamping, delay wording, alight alert window), pinned by 20 unit
  tests so web and native can never word the same trip differently.

### Changed
- Both journey hooks now consume the shared core on web and native:
  `src/lib/useJourney.ts` 702 → 439 LOC, `mobile/lib/useJourney.ts` 548 → 293,
  `src/lib/useMultiLegJourney.ts` 701 → 462, `mobile/lib/useMultiLegJourney.ts`
  552 → 362. Tuning constants live in one place, so escalation timing and copy
  can no longer drift between platforms.

### Fixed
- Multi-leg connection countdown and missed-connection detection were dead
  while waiting at a transfer stop: the "next ride" pointer looked one ride too
  far ahead on walk and wait legs, so "Bus 200 in 4 min", the late-connection
  warning and the missed-connection rescue never appeared. Core now resolves
  the ride actually being waited for.
- Web multi-leg trips now also raise the missed-connection alert, which
  previously only fired on native.

- `mobile/app/trip/[id].tsx` split 1,006 → ~360 LOC: header, hero, feed
  banners, journey timeline, alight alert and the no-trip state now live in
  `mobile/components/trip/`, and the screen keeps only data wiring.

- Shared request-validation boundary for the public HTTP API
  (`src/lib/http/validate.ts` + `src/lib/schemas/public-api.ts`): every
  `/api/public/*` payload and query string is parsed with a Zod schema and
  rejected with a uniform `400 { error, details }` before any database call
  or paid upstream request, with unit tests pinning each schema.
- Structured JSON logging (`src/lib/logger.ts`): levelled, scoped, one line
  per record, safe against circular references and non-`Error` throws. Wired
  into the SSR entry point so catastrophic failures are searchable.
- Enforced coverage thresholds in `vitest.config.ts`, with a higher floor for
  the shared domain core than for app glue.
- Automated test suite (Vitest) covering the pure domain layer: geo maths and
  polyline snapping, freshness classification, journey phases, the Cyprus city
  catalogue, ETA copy formatting, Motion card formatting and static GTFS
  lookups.
- Continuous integration on every push and pull request: lint, typecheck,
  tests with coverage, and a production build.
- `GET /api/public/health` — per-dependency health probe returning `200` when
  healthy and `503` when degraded.
- Root `Dockerfile` and `docker-compose.yml` for a self-contained local stack
  (web app plus PostGIS), wired to the health endpoint.
- `README.md` covering architecture, repository layout, the full environment
  variable table, testing and deployment; plus `CONTRIBUTING.md`.
- `.env.example` and `mobile/.env.example` templates.

### Changed
- The `/qa` console passphrase now comes from `VITE_QA_PASSPHRASE`; when the
  variable is unset the console stays locked.
- The mobile web map reads its Google Maps browser key from
  `EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` and fails with an actionable message
  when it is missing.

### Removed
- Hardcoded credentials and sample keys from tracked source, and one-off
  scratch scripts that embedded database connection strings.

### Security
- All `.env*` files are gitignored; secrets are supplied per environment.

## [1.0.0]

Initial public release: live arrivals for the Nicosia and intercity GTFS
feeds, multi-leg trip planning, journey guidance, group trips with shared live
positions, Aloya Pro, Motion card wallet, and the Expo mobile app.
