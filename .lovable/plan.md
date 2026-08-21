# Close every gap in the 72/B audit

The score dropped because of items we can actually fix in-repo (file sizes, docs discoverability, mobile reproducibility, tighter guards) plus one item only real commit behaviour can fix (history authorship/cadence). This plan covers all four audit recommendations, marks what is and isn't fixable by code, and raises our own guard rails so we stop drifting back.

## 0. Keep the audit on file

Save the pasted report to `docs/audits/2026-08-23-datafactor-72B.md` and add `docs/audits/README.md` explaining that each audit snapshot is kept so score movement is traceable between runs. Future audits land beside it.

## 1. Code cleanliness — pull the biggest hand-written files under 400 LOC

Current sizes (verified): `mobile/components/ArrivalPromiseCard.tsx` 482, `mobile/components/MapView.web.tsx` 472, `mobile/components/KapnosShuttleCardMobile.tsx` 463, `src/routes/trip.$id.tsx` 463.

- `ArrivalPromiseCard.tsx` → `mobile/components/arrival-promise/`: `ArrivalPromiseCommit.tsx` (the commit/act surface), `ArrivalPromiseRow.tsx`, `ArrivalPromiseList.tsx`, with the card left as composition only.
- `KapnosShuttleCardMobile.tsx` → `mobile/components/kapnos/`: `margins.ts` (the MARGINS constant + derivation), `Endpoint.tsx`, `MileSection.tsx`.
- `MapView.web.tsx` → extract the Google Maps loader/library-import logic into `mobile/lib/googleMapsLoader.ts` and marker/polyline building into `mobile/lib/mapOverlays.ts`, both unit-tested without a DOM map.
- `src/routes/trip.$id.tsx` → extract the single-leg phase-derivation memo into `src/lib/useSingleLegView.ts` with `src/lib/useSingleLegView.test.ts`, matching how `useLastMileChain` was split.
- Tighten `tests/file-size.test.ts`: keep the 500 hard failure, add a 400-LOC warning ceiling that fails for any *new* file, with a short, dated, justified allowlist for anything left between 400 and 500. This is what stops the drift recurring.

Pure extraction — no behaviour change. Lint, typecheck, web tests and mobile tests run after each split.

## 2. Docs & onboarding — make the custom tooling machine-discoverable

The scanner reported `logging_framework: null`, `error_tracking: null`, `has_health_endpoint: false` because our logger, error tracker and health route are bespoke modules.

- New `ARCHITECTURE.md`: layering (route tree, `routes/api/public` vs `createServerFn`, `packages/core`, mobile workspace), and an explicit "Operational modules" table naming `src/lib/logger.ts` (structured JSON logger), `src/lib/error-tracking.ts` (Sentry envelope reporter, `SENTRY_DSN`), `src/lib/metrics.ts` (Prometheus registry, `METRICS_TOKEN`), `GET /api/public/health`, `GET /api/public/metrics`. README links to it.
- `package.json`: add a `lovable`/`aloya` metadata block (or top-level `config` keys) declaring `logging`, `errorTracking`, `healthEndpoint`, `metricsEndpoint` so manifest-level detection finds them, plus a comment-style note in `.env.example` next to `SENTRY_DSN` pointing at the envelope implementation.
- Extend `tests/health-endpoint.test.ts` to assert the documented per-dependency contract exactly as README states it: hard vs soft dependency semantics, the `ok`/`degraded`/`down` tri-state, 200 vs 503, and that an unconfigured relay is reported as skipped rather than failing.
- Add `tests/docs-contract.test.ts`: fails if `ARCHITECTURE.md` stops mentioning a module that exists, or if a documented endpoint route file is missing.

## 3. Mobile fresh-clone reproducibility

- CI mobile job: `cp mobile/.env.example mobile/.env` before `bunx tsc --noEmit`, and run `bun run check:env` scoped to the mobile workspace so mobile env parity is enforced the way the web one is.
- Extend `scripts/check-env-parity.mjs` to cover `mobile/` sources against `mobile/.env.example` (every `EXPO_PUBLIC_*` / `process.env` reference present with a placeholder and comment).
- README Testing section: add the exact fresh-clone mobile sequence — `cd mobile && cp .env.example .env && cd .. && bun run test:mobile` — and state that it needs no Expo/EAS credentials and makes no network calls (the `src/test/no-network.ts` guard is active in the mobile config too; wire it in if it isn't).
- Verify locally with network egress blocked, capture the passing output in the README/CHANGELOG note.

## 4. History & maintenance (the 38/K score)

This dimension is measured from `git log`, and the platform authors commits as `lovable-dev[bot]`; no file change can retroactively re-attribute 4,153 commits. What we do in-repo:

- Add `docs/COMMIT_POLICY.md` and a CONTRIBUTING section: one small human-authored commit per feature/fix, its test in the same commit, Conventional Commits prefixes (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`).
- Add `.gitmessage` template plus a `commitlint`-style check in CI that validates the Conventional Commits format of PR commits (advisory on existing history, blocking for new commits).
- Add a `RELEASES.md` cadence note: tag `v1.2.0` at the end of this work and tag each subsequent milestone.

Outside the repo, the only levers are yours: commit from your own git identity for hand-made changes and cut tags as milestones land. I'll flag this explicitly rather than pretend a file fixes it.

## Verification gate (run at the end)

`bun run lint` (0 warnings) · `bun run typecheck` · `bun run test:coverage` · `bun run test:mobile` · `node scripts/check-env-parity.mjs` · `node scripts/check-secrets.mjs` · `bun run build`. CHANGELOG entry summarising the above.

## Not planned

Reducing the 70 direct runtime dependencies further — the remaining ones are all imported, and cutting real features to shrink a count would trade working software for a metric. Say the word if you want that audited anyway.
