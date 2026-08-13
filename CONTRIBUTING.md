# Contributing to Aloya

## Setup

```bash
cp .env.example .env
bun install
bun run dev        # http://localhost:8080
```

Mobile:

```bash
cd mobile
cp .env.example .env
bun install
bunx expo start
```

## Before you open a PR

Run everything CI runs — the pipeline fails on any of these:

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

## Conventions

**Web is the floor, mobile matches it.** A feature that lands on
`src/routes/*` lands on the mirrored `mobile/app/*` screen with the same live
data and the same states. No placeholder or stripped-down mobile surfaces.

**Shared logic lives in `packages/core`.** Anything framework-free — geo maths,
freshness classification, copy formatting — goes there so web and mobile can
never drift. Anything importing React, Expo or Node stays in its own app.

**Server boundaries.**
- `src/lib/*.functions.ts` — `createServerFn` RPC. Keep these files thin:
  imports, types and the exported server-function declarations only. Runtime
  helpers move to an imported module or inside the handler.
- `src/lib/*.server.ts` — server-only helpers, blocked from client bundles.
- `src/routes/api/public/*` — unauthenticated HTTP endpoints. Every handler
  verifies its own caller (signature, shared secret) and validates input.

**Design tokens, not literals.** Colours, gradients and shadows are semantic
tokens in `src/styles.css` (and `mobile/constants/theme.ts`). No `bg-[#...]`,
no `text-white`.

**Accuracy over reinvention.** For ETAs, routing, distance, geocoding and
places, call the authoritative API. Hand-rolled haversine-plus-average-speed
maths is not an acceptable substitute for a real routing response.

## Tests

Vitest. Specs sit beside the module: `packages/core/src/geo.ts` →
`packages/core/src/geo.test.ts`.

```bash
bun run test           # once
bun run test:watch     # watch mode
bun run test:coverage  # v8 coverage report
bun run test:mobile    # Expo app logic, native bridges stubbed
bun run test:all       # both suites
```

Mobile specs live in `mobile/lib/__tests__/`. The harness
(`vitest.mobile.config.ts`) aliases native bridges to `mobile/test/stubs/`;
add a stub there when a module needs a new bridge, and never mock the module
under test.

Every bug fix ships with a test that fails before the fix. Pure domain logic
must be covered; UI composition need not be.

## Database changes

SQL lives in `deploy/supabase/sql/`, named `YYYYMMDD_description.sql`, applied
with `deploy/supabase/migrate.sh`. Every `CREATE TABLE` in the `public` schema
is followed, in the same file and in this order, by:

1. `GRANT` statements for the roles the policies allow
2. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
3. `CREATE POLICY ...`

A table without grants is unreachable through the Data API; a table without
policies is locked. Never write to the `auth`, `storage`, `realtime` or
`vault` schemas.

## Secrets

Never commit a credential. All `.env*` files are gitignored; add every new
variable to `.env.example` (or `mobile/.env.example`) with an empty value and
a comment explaining what it unlocks, and to the table in `README.md`.

## Commits

Conventional Commits: `feat:`, `fix:`, `perf:`, `refactor:`, `test:`,
`docs:`, `chore:`. Scope where it helps — `fix(mobile): ...`.

## Releasing

1. Move everything under `## [Unreleased]` in `CHANGELOG.md` into a new
   `## [x.y.z] - YYYY-MM-DD` section and leave `Unreleased` empty.
2. Bump `version` in `package.json`, `packages/core/package.json` and
   `mobile/package.json` together — they ship as one product.
3. Verify the full gate locally: `bun run lint && bun run typecheck &&
   bun run test:coverage && bun run test:mobile:coverage && bun run build`.
4. Tag `vx.y.z` once CI is green on `main`.
