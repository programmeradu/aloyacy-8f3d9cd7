# Changelog

All notable changes to Aloya are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `@aloya/core/single-leg-phase`: the single-leg trip companion's phase
  machine and rider-facing copy (schedule vs. GPS-truth phase, walk routing,
  countdown clamping, delay wording, alight alert window), pinned by 20 unit
  tests so web and native can never word the same trip differently.

### Changed
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
