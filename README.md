# Aloya

Aloya is a transit companion for Cyprus. It fuses the island's GTFS static
schedules with the live GTFS-Realtime vehicle feeds, rider-contributed
sightings and Google Maps Platform routing to answer one question well: *when
does my bus actually get here, and can I trust that number?*

The product is a rider app on two surfaces that mirror each other feature for
feature:

- **Web** — TanStack Start (React 19, Vite 7) deployed to a Cloudflare Worker.
- **Mobile** — an Expo / React Native app (iOS, Android) in `mobile/`.

Both talk to the same Postgres (self-hosted Supabase) and the same public API
routes.

---

## Quick start

Requirements: **Node 20+** and **Bun 1.3+** (the repo is a Bun/pnpm workspace;
`bun.lock` and `pnpm-lock.yaml` are both committed and either installs).

```bash
git clone <this repo> aloya && cd aloya
cp .env.example .env          # fill in the values you have; see below
bun install
bun run dev                   # http://localhost:8080
```

Run the checks the CI pipeline runs:

```bash
bun run lint        # eslint
bun run typecheck   # tsc --noEmit
bun run test        # vitest run
```

The app boots without any secrets: the bundled static GTFS data in `src/data/`
renders stops, routes and timetables offline. Live arrivals, trip planning,
auth and payments each degrade to a clear "unavailable" state until their
corresponding variable is set.

### One command with Docker

```bash
cp .env.example .env
docker compose up --build     # app on http://localhost:8080
```

`docker-compose.yml` starts the web app plus a Postgres 15 + PostGIS instance
seeded from `deploy/supabase/init/`. The app container's healthcheck polls
`/api/public/health`, which reports per-dependency status.

To bring up the full self-hosted backend (GoTrue auth, PostgREST, Realtime,
Storage, Kong) instead of plain Postgres, use the stack in
`deploy/supabase/docker-compose.yml` — see `deploy/supabase/README.md`.

---

## Repository layout

```
src/                    Web app (TanStack Start)
  routes/               File-based routes; routes/api/** are HTTP endpoints,
                        routes/api/public/** bypass site auth (webhooks, cron)
  components/           React components
  lib/                  Domain logic
    *.functions.ts      createServerFn RPC callable from the client
    *.server.ts         Server-only helpers, blocked from client bundles
  data/                 Bundled static GTFS (stops, routes, sequences)
  integrations/supabase Generated database client and types

packages/core/          Framework-free domain logic shared by web and mobile
                        (geo maths, freshness classifier, journey phases,
                        city catalogue, copy formatting)

mobile/                 Expo app; mirrors the web routes
  app/                  expo-router screens
  lib/                  Mobile domain logic and hooks

workers/                Standalone Cloudflare Workers
  gtfs-relay/           Raw-socket relay for the upstream GTFS-RT feed
  pulse-cron/           Scheduled ingest + network-pulse aggregation

deploy/supabase/        Self-hosted Supabase stack (compose, Kong, migrations)
scripts/                Data build scripts (headsign index, schedule ingest)
```

### Architecture

**Data flow.** Upstream GTFS-Realtime protobuf → `workers/gtfs-relay` (a raw
TCP relay that works around regional IP blocks) → `src/lib/gtfs-rt.server.ts`
→ `/api/public/realtime`. A cron worker snapshots each poll into Postgres via
`/api/public/snapshot`, which feeds the historical delay model behind every
ETA confidence badge.

**Server boundary.** App-internal server logic uses `createServerFn` from
`@tanstack/react-start` (`src/lib/*.functions.ts`) — typed RPC, called from
components and route loaders. Anything an *external* caller hits (webhooks,
cron, the mobile app, OG image rendering) is a file route under
`src/routes/api/public/`, which is unauthenticated by design and verifies its
own callers.

**Trust layer.** Every ETA surface renders through one classifier,
`packages/core/src/freshness.ts`, so no two screens can disagree about whether
a bus is `live`, `rider-confirmed`, `predicted`, `ghost` or `scheduled`.

**Mobile.** `mobile/` is a peer, not a wrapper. It consumes the same
`/api/public/*` endpoints, shares `packages/core`, and mirrors the web routes
one-to-one (`mobile/app/group/[code].tsx` ↔ `src/routes/group.$code.tsx`).

---

## Environment variables

Copy `.env.example` to `.env`. Nothing in `.env*` is committed. Mobile has its
own `mobile/.env` (template at `mobile/.env.example`) because Expo only inlines
`EXPO_PUBLIC_*`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `CUSTOM_SUPABASE_URL` / `VITE_CUSTOM_SUPABASE_URL` | for data | Postgres/PostgREST base URL |
| `CUSTOM_SUPABASE_ANON_KEY` / `VITE_CUSTOM_SUPABASE_ANON_KEY` | for data | Public API key; RLS applies |
| `CUSTOM_SUPABASE_SERVICE_ROLE_KEY` | server only | Privileged writes (ingest, cron) |
| `GOOGLE_MAPS_API_KEY` | for routing | Routes, Directions, Places, Street View |
| `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` | for maps UI | Browser-restricted Maps JS key |
| `GTFS_RELAY_URL` / `GTFS_RELAY_TOKEN` | for live buses | Cloudflare relay for the GTFS-RT feed |
| `CRON_SECRET` | for cron | Shared secret guarding scheduled endpoints |
| `RESEND_API_KEY`, `AUTH_EMAIL_FROM` | for auth email | Sign-in codes and transactional mail |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | for web push | Departure and disruption alerts |
| `VITE_PAYMENTS_CLIENT_TOKEN` | for Pro | Stripe publishable key |
| `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` | for wallet | Signed Google Wallet passes |
| `MAPILLARY_ACCESS_TOKEN` | optional | Street-level imagery fallback |
| `ELEVENLABS_API_KEY`, `LOVABLE_API_KEY` | optional | Voice guidance, AI trip parsing |
| `SEMRUSH_API_KEY`, `FIRECRAWL_API_KEY` | optional | SEO dashboard at `/admin/seo` |
| `DATEX_CY_URL`, `DATEX_CY_AUTH` | optional | Cyprus road-traffic incident feed |
| `VITE_QA_PASSPHRASE` | optional | Unlocks the internal `/qa` console; gate stays shut when unset |
| `PUBLIC_SITE_URL` | optional | Canonical origin for OG images and emails |

Server-only variables must be read **inside** a handler (`process.env['X']`),
never at module scope — the Worker injects them at call time. Browser config
goes through `import.meta.env.VITE_*`.

---

## Testing

Vitest, run with `bun run test` (`bun run test:watch`, `bun run test:coverage`).
Specs live next to the module they cover (`packages/core/src/geo.test.ts`) and
cover the pure domain layer: geo maths and polyline snapping, the freshness
classifier's tier thresholds, journey-phase predicates, the city catalogue,
ETA copy formatting, Motion card formatting/masking and the static GTFS
lookups.

New behaviour ships with the test that pins it, in the same commit.

---

## Deployment

- **Web** — `bun run build` produces a Cloudflare Worker bundle; `wrangler.jsonc`
  holds the binding config.
- **Workers** — `workers/gtfs-relay` and `workers/pulse-cron` deploy
  independently with `wrangler deploy` from their own directories.
- **Backend** — `deploy/supabase/` is a complete self-hosted Supabase stack;
  `deploy/supabase/migrate.sh` applies the SQL in `deploy/supabase/sql/`.
- **Mobile** — EAS build profiles in `mobile/eas.json` (`development`,
  `preview`, `production`).

## Health and observability

- `GET /api/public/health` — per-dependency status, `200` healthy / `503`
  degraded. Used by the Docker healthcheck and uptime monitors.
- `src/server.ts` normalises catastrophic SSR failures into a branded error
  page and logs the original stack.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Releases are logged in
[CHANGELOG.md](./CHANGELOG.md).

## License

Proprietary. All rights reserved.
