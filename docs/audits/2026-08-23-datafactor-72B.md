Score another repo
72
B
Overall
github.com/programmeradu/aloyacy-8f3d9cd7
aloyacy-8f3d9cd7
Frontend
73%
Source LOC
131,649
Volume
74.1
Mining rank
1,823· very high
Task capacity
~2,525
Task capacity estimates how much of this repository's history could be mined into self-contained engineering tasks — changes that arrive with the tests that prove them. It is one of the inputs to the payout estimate below.

Aloya is a well-built TanStack Start + React Native monorepo transit app with genuinely strong engineering discipline: a real test suite (217 spec files, ~1:5 ratio, coverage thresholds enforced), a CI pipeline that runs lint/typecheck/test/build/audit with lockfile-drift checks, a structured logger with a guard test banning raw console calls, Zod-based input validation, Sentry-style error tracking, and a Prometheus-style metrics module. Documentation is unusually thorough (architecture, env var table, testing philosophy, Docker Compose paths) and dependency hygiene (dual lockfiles, Dependabot, audit in CI) is above typical repo baseline. The git history is dominated almost entirely by a single bot author (lovable-dev[bot], 4153 of 4208 commits) with only one real human contributor of note, which is a material maintenance/provenance concern even though code quality signals are strong; classification as frontend is reasonable given React/Vite/Tailwind dominance despite a sizable server/API surface.
judged by claude-sonnet-5

Buyer fit · what AI-training buyers now measure
✓
Builds & tests at HEADestimated
Test suite (vitest), CI runs it, lockfiles committed, likely to build and test cleanly at HEAD.
✓
Task capacity
~2524 mineable commits, enough task material to be worth a buyer's attention.
✓
Genuine history
3 human contributors, organic commit history.
✓
Self-contained
docker compose / devcontainer present, one command brings the whole thing up in isolation.
✓
Not a demo
Nothing suggests a demo or template.
Buyer criteria are evolving: beyond the quality score, buyers now weigh whether a repository installs, builds, and runs its own tests, whether it can be exercised in isolation, and how much genuinely mineable engineering history it holds. These signals are read from the repository's artifacts — the assessment never executes your code.

Estimated payout
$750
up to $4,800 total per contributor · approximate, non-binding estimate — not an offer
buyer criteria are evolving — the buyer-fit signals also shape final offers
What DataFactor estimates it would pay to license this repository as AI training data. Quality drives the number: past a minimum volume, stronger code is worth far more than more code. This repository's history is also unusually rich in self-contained, tested changes — the kind of work a model can actually learn from — and that lifts the estimate. Final payout is subject to review and a partnership agreement.

Get in touch about this repository
Dimension breakdown
D
Architecture & Robustness
Clear layering documented (routes/api/public vs createServerFn RPC, packages/core shared domain logic), structured JSON logger enforced by tests/server-logging.test.ts, error tracking via captureException, metrics.ts with Prometheus rendering, Zod schemas for input validation at src/lib/schemas
78
B
Test Coverage
217 spec files, test:source ratio 1:5, vitest with coverage thresholds enforced in vitest.config.ts and CI runs test:coverage, plus dedicated integration guard suites (route-error-capture, server-logging, input-validation)
78
C
Code Cleanliness
ESLint + Prettier configured and lint runs in CI with --max-warnings=0, only 1 file over 500 LOC (god_files_over_500_loc:1, the generated supabase types.ts at 1841 LOC which is excluded by file-size test), median file size 98 LOC
62
F
Docs & Onboarding
README covers install/run/test/env/architecture/api sections (194 LOC), CHANGELOG.md and CONTRIBUTING.md present, .env.example covers nearly all referenced env vars, Docker + Docker Compose with healthcheck-based one-command startup documented
85
I
Security Hygiene
0 hardcoded secret hits, no committed .env files, dep_audit_in_ci true, check:secrets script and input-validation.test.ts enforce schema validation on every public endpoint per README, but input_validation_patterns list came back empty in stats
72
E
Dependency Health
Both bun.lock and package-lock.json committed with CI checks for drift, Dependabot configured, dep audit (bun audit --audit-level=high) runs in CI, but 70 direct runtime deps plus 1523 transitive deps is a fairly large surface
72
H
CI/CD Maturity
.github/workflows/ci.yml runs lockfile checks, lint, typecheck, test:coverage, dependency audit, and build all on push/PR plus a separate mobile typecheck/test job, though ci_runs_lint/typecheck/tests flags in stats show false likely due to detection heuristics conflicting with the actual workflow c
80
K
History & Maintenance
git_stats shows 4208 commits but 4153 (98.7%) from a single actor 'lovable-dev[bot]' and only 2 human contributors of substance, span_days:0 and conventional_rate_last_200 of 0.015 suggest low commit-message discipline and unclear real development cadence
38
How to improve this score
buyer-critical fixes first, then by expected impact
01
Diversify commit authorship and cadence signals
high impact
K · History & Maintenance
git_stats shows 4153 of 4208 commits from a single bot account (lovable-dev[bot]) with span_days reported as 0 and only 2 tags, which makes it impossible to verify organic, sustained human maintenance from history alone.

1.1
Adopt a workflow where each human-authored feature or fix lands as its own small commit with its test in the same commit, for example git commit -m 'fix: correct arrival promise margin calc' touching both src/lib/arrival-promise.ts and its .test.ts file
1.2
Tag releases as real milestones land, for example git tag v1.2.0 after a batch of merged, tested changes rather than leaving the tag history at v1.1.0
1.3
Record contributor identity consistently in git config user.name/user.email for programmeradu and any collaborators so authorship attribution in future git log output is accurate
02
Reduce the largest hand-written files below 400 LOC
medium impact
C · Code Cleanliness
top_largest_files lists mobile/components/ArrivalPromiseCard.tsx (458 LOC), mobile/components/KapnosShuttleCardMobile.tsx (447 LOC), mobile/components/MapView.web.tsx (441 LOC) and src/routes/trip.$id.tsx (430 LOC) approaching the project's own 500 LOC guard rail.

2.1
Split mobile/components/ArrivalPromiseCard.tsx into ArrivalPromiseCommit and a separate ArrivalPromiseList/Row component file under mobile/components/arrival-promise/
2.2
Extract the MARGINS constant and Endpoint/MileSection subcomponents from mobile/components/KapnosShuttleCardMobile.tsx into mobile/components/kapnos/ subfiles
2.3
Extract the single-leg phase-derivation memo logic out of src/routes/trip.$id.tsx into src/lib/useSingleLegView.ts with its own useSingleLegView.test.ts
2.4
Run bun run test and bun run lint after each split to confirm tests still pass and file-size.test.ts guard remains green
03
Wire real logging/error-tracking/health tooling into repo_stats-visible config
low impact
D · Architecture & Robustness
repo_stats reports logging_framework:null, error_tracking:null, and has_health_endpoint:false despite the README and tests describing src/lib/logger.ts, src/lib/error-tracking.ts and a /api/public/health route, suggesting these are custom modules not recognized as standard tooling and possibly under-documented in package.json.

3.1
Add a short ARCHITECTURE.md or extend README's Architecture section explicitly naming src/lib/logger.ts as the structured JSON logger and src/lib/error-tracking.ts as the Sentry-envelope error reporter so tooling detection and reviewers can find them
3.2
Add a package.json dependency entry or comment referencing the Sentry-compatible envelope format used in src/lib/error-tracking.ts so SENTRY_DSN integration is discoverable from the manifest
3.3
Add a small tests/health-endpoint.test.ts assertion (if not already thorough) that documents and verifies the /api/public/health per-dependency status contract referenced in README
04
Confirm and document fresh-clone reproducibility for the mobile workspace
medium impact
F · Docs & Onboarding
CI's mobile job runs bunx tsc --noEmit and a stubbed-bridge vitest suite, but the bundle gives no evidence that mobile/.env.example plus mobile-specific setup is exercised end-to-end without Expo/EAS credentials.

4.1
Add a step to .github/workflows/ci.yml mobile job that runs cp mobile/.env.example mobile/.env before bunx tsc --noEmit to prove the mobile app config surface is self-contained
4.2
Document in README's Testing section the exact command sequence for mobile (cd mobile && cp .env.example .env && bun run test:mobile) as a fresh-clone reproducible path
4.3
Verify the sequence exits 0 with no network calls by running it in a container with network disabled and confirm bun run test:mobile completes with all specs passing