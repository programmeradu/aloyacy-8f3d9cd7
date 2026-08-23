# Architecture

Aloya is a Cyprus public-transport rider app. One TypeScript repo holds three
deployables plus a shared core:

```text
src/            TanStack Start web app (SSR on a Cloudflare Worker)
mobile/         Expo / React Native rider app (iOS, Android, web)
workers/        Standalone Cloudflare Workers (GTFS-RT relay, pulse cron)
packages/core/  Framework-free journey logic shared by web and mobile
deploy/         Self-hosted Supabase (Docker Compose) for the backend
```

## Request path

```text
browser / native app
        │
        ├── TanStack Start SSR + server functions  (src/routes, src/lib/*.functions.ts)
        │        │
        │        ├── Supabase (Postgres + RLS)     self-hosted, see deploy/supabase
        │        ├── Google Maps Platform          routes, places, street view
        │        └── GTFS-RT relay Worker          workers/gtfs-relay
        │
        └── /api/public/*                          webhooks, health, metrics, OG images
```

- **Server functions** (`createServerFn`) carry all app-internal server logic.
  They live in `*.functions.ts` so the client graph can import them safely;
  server-only leaves are `*.server.ts` and never reach the browser bundle.
- **Public HTTP** lives under `src/routes/api/public/*`; every handler validates
  its input with Zod and authenticates its caller itself
  (`tests/input-validation.test.ts` enforces the first half of that rule).
- **Shared logic** — RAPTOR results shaping, journey phases, multi-leg
  companion state — lives in `packages/core` with no React or platform imports,
  so the same behaviour ships to both apps and is unit-tested once.

## Operational modules

These are the four pieces an operator interacts with. They are dependency-free
by design: the Worker runtime has no Node process to host pino, agents or
sidecars.

| Concern | Module | Surface |
| --- | --- | --- |
| Structured logging | `src/lib/logger.ts` | One JSON object per line: `ts`, `level`, `scope`, `msg`, plus typed fields. `createLogger(scope)`; `tests/server-logging.test.ts` fails the build on a raw `console.*` in server code. |
| Input schemas | `src/lib/schemas/public-api.ts` | Zod schemas for every public endpoint that reads caller data, plus `parseOptionalJsonBody`. `tests/input-validation.test.ts` fails the build on an unvalidated handler. |
| Error tracking | `src/lib/error-tracking.ts` | `captureException()` posts a Sentry envelope over `fetch`. No SDK. Inert unless `SENTRY_DSN` is set. |
| Metrics | `src/lib/metrics.ts` | In-process Prometheus registry (counters, gauges, summaries), scraped at `GET /api/public/metrics`, gated by `METRICS_TOKEN` when set. |
| Health | `src/routes/api/public/health.ts` | `GET /api/public/health` probes each dependency concurrently. 200 = healthy, 200 `degraded` = live feed down but scheduled data still served, 503 = a hard dependency failed. Used by the Docker `HEALTHCHECK`. |

Health and metrics share state on purpose: each probe writes
`aloya_dependency_up` and a probe-duration observation, so an uptime monitor and
a Prometheus scrape can never disagree about the same dependency.

## Data

- **GTFS static** — prebuilt JSON in `src/data/` and `public/data/`, regenerated
  by `scripts/`.
- **GTFS realtime** — the operator feed is reachable only over raw TCP, so
  `workers/gtfs-relay` fronts it with `cloudflare:sockets` and the app consumes
  the relay over HTTPS.
- **Postgres** — self-hosted Supabase. Every public table is RLS-enabled with
  explicit `GRANT`s; privileged work runs through `SECURITY DEFINER` RPCs.

## Code health rules (enforced by tests, not convention)

| Rule | Guard |
| --- | --- |
| No source file over 500 lines; new files under 400 | `tests/file-size.test.ts` |
| No raw `console.*` in server code | `tests/server-logging.test.ts` |
| Every public endpoint validates input with Zod | `tests/input-validation.test.ts` |
| Tests run fully offline — no network in CI | `src/test/no-network.ts` |
| `.env.example` covers every env var used in source | `scripts/check-env-parity.mjs` |
| No committed secrets | `scripts/check-secrets.mjs` |

See `CONTRIBUTING.md` for the local workflow and `docs/COMMIT_POLICY.md` for
history conventions.
