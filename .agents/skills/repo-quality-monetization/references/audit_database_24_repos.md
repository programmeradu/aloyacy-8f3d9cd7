# 24-Repository Forensic Quality & Monetization Audit Database

This database contains the comprehensive extracted scoring, metrics, failure modes, and remediation actions for all 24 repositories analyzed by the DataFactor valuation and quality engine (Total LOC: 3,286,118; Combined Portfolio Score: 43/100 Grade D; Payout: $0 / $4,800 max).

---

## Portfolio Summary Matrix

| Repository | LOC | Score & Grade | Buyer Fit | Dimensions Failed | Root Failure Modes |
|---|---|---|---|---|---|
| **aloyacy-8f3d9cd7** | 96,962 | 22.6 · F | 2/5 ($0) | B:3, H:0, F:8, I:15, K:25, C:30, D:38, E:48 | 0 tests across 566 files; no CI; 3 committed `.env` files; hardcoded AWS/Google/QA keys; 37 files >500 LOC (8 >1000); 3462/3509 bot commits. |
| **keystone-treasury-os** | 98,343 | 31.9 · F | 2/5 ($0) | B:8, H:30, C:15, I:15, D:30, F:45, E:45, K:55 | Test:source 1:205; CI does not run tests/lint; literal `PRIVATE_KEY` in `contracts/deploy-marketplace.mjs`; 4825-LOC dead `old-atlas.tsx`; 22 files >500 LOC; .env.example missing 97% of vars. |
| **dreyv** | 243,992 | 35.4 · F | 2/5 ($0) | B:8, C:15, I:15, H:30, D:40, F:45, E:55, K:35 | 11 tests vs 1371 files; 57 files >500 LOC (handlers.ts is 11,756 LOC); committed private key & `.env.production`; CI has no test gate; 4775/4911 commits from bot in 44 days; tests hit live Solana devnet. |
| **anno-automator** | 6,244 | 31.1 · F | 2/5 ($0) | B:0, H:0, E:30, K:30, D:35, C:45, F:45, I:55 | 0 tests; 0 CI; root package.json missing lockfile; README is encord task guide not repo docs; worker casts body to `any` with no Zod schema; 3-day bot commit burst. |
| **cyprus-chat** | 13,778 | 35.6 · F | 3/5 ($0) | F:8, K:20, B:22, H:30, C:45, D:48, I:55, E:55 | 5 tests vs 119 files; no README; no `.env.example`; CI only deploys to Cloudflare with no test/typecheck gate; raw console logging; 84/86 commits from `manus-agent` in 5 days; 1405-LOC UI file. |
| **aviationcura** | 2,533 | 21.6 · F | 1/5 ($0) | F:5, B:8, I:10, D:22, H:25, C:30, K:30, E:45 | Only dummy scaffold test (1:15 ratio); no README; no `.env.example`; live RapidAPI & YouTube keys hardcoded in `deploy.js`; 1142-LOC `src/index.ts` god file; CI deploys with no test gate. |
| **cyprus-connect** | 77,640 | 36.2 · F | 3/5 ($0) | B:5, N:15, D:20, C:25, H:30, K:30, F:45, I:45, E:45 | 1 test vs 515 source files; committed `.env.development`; CI only has live keepalive/grant-alert cron; 21 files >500 LOC (DashboardDemo.tsx is 2359 LOC); 1637/1700 bot commits in 14 days. |
| **stauniverse-orbiter-51** | 7,004 | 35.8 · F | 2/5 ($0) | B:0, H:0, D:35, K:40, C:45, F:55, I:55, E:55 | 0 tests; 0 CI; sidebar.tsx is 708 LOC; hardcoded data arrays inside UI components; no `.env.example`; 12/35 commits from bot; no container setup. |
| **ai-brand-visibility** | 3,078 | 35.4 · F | 1/5 ($0) | B:0, H:0, K:10, C:40, D:45, E:45, I:55, F:68 | 0 tests; 0 CI; 1 total commit (seeded template); no lint/format config; API parse `c.req.json<T>()` without Zod schema validation; requires live Cloudflare account for local dev. |
| **thought-weaver-ai-43** | 8,910 | 28.8 · F | 2/5 ($0) | H:0, B:3, F:22, K:25, D:38, I:40, C:45, E:45 | 0 tests; 0 CI; committed `.env`; README is 20 lines of raw voice dictation; 147/149 bot commits in 20 days; no Supabase mock for offline testing. |
| **founder** | 4,603 | 19.8 · F | 1/5 ($0) | H:0, B:5, F:8, E:10, K:15, D:30, C:35, I:45 | 1 test hitting a live external URL; README is 1 line ("Here are your Instructions"); no manifests or lockfiles detected; 22 commits from `emergent-agent-e1` in 4 days. |
| **build-it-better** | 4,885 | 24.3 · F | 2/5 ($0) | B:2, H:0, I:18, F:22, C:30, K:35, D:38, E:45 | 0 tests; 0 CI; hardcoded Etherscan API key; committed `.env.production`; App.tsx is 1270 LOC; duplicated styled QR code drawing; 193/200 bot commits over 550 days. |
| **autoclip** | 57,980 | 39.0 · F | 2/5 ($0) | B:15, C:30, D:35, K:35, E:45, H:45, I:55, F:60 | 7 tests vs 275 files; CI has `continue-on-error: true` on lint & typecheck; hardcoded local path `/Users/zhoukk/autoclip`; unpinned requirements.txt; unhandled exceptions swallowed with raw log strings. |
| **ClearState** | 1,130 | 18.9 · F | 1/5 ($0) | B:0, H:0, K:10, I:15, D:25, F:25, C:30, E:45 | 0 tests; 0 CI; 2 total commits; hardcoded Etherscan key in `etherscan.ts`; App.tsx is 698 LOC; AI Studio boilerplate README; errors caught with `alert()`. |
| **crypto-statement-generator** | 2,395 | 22.5 · F | 1/5 ($0) | B:0, H:0, F:10, I:15, K:15, D:35, C:40, E:45 | 0 tests; 0 CI; 3 total commits; hardcoded Etherscan V2 key; 9-line default Vite README; 2 files >500 LOC; no type definitions. |
| **aloyacy** | 30,290 | 20.4 · F | 2/5 ($0) | B:0, H:0, F:5, I:10, E:15, K:25, C:35, D:45 | 0 tests; 0 CI; no lockfile; plaintext password in `qa.tsx`; committed `.env` and `.env.development`; 1024/1025 bot commits in 1 day; no README. |
| **dreyv-your-daily-drive** | 184,697 | 35.0 · F | 2/5 ($0) | B:8, C:22, I:25, H:30, K:30, D:38, E:40, F:48 | 5 tests vs 1088 files; 47 files >500 LOC (11 >1000); dead 4825-LOC file; committed deploy private key; no `.env.example` for 140+ vars; 3185/3204 bot commits in 11 days. |
| **odds-grabber-pro** | 23,141 | 31.1 · F | 2/5 ($0) | H:0, F:8, B:18, K:35, C:38, D:45, I:45, E:55 | 5 tests vs 145 files (un-gated bun/vitest split); no CI; no README; committed `.env`; 10 files >500 LOC (types.ts is 1474 LOC, sports.tsx is 1383 LOC); 509/536 bot commits in 7 days. |
| **aloya-proxy** | 33 | 20.8 · F | 1/5 ($0) | B:0, H:0, E:10, K:10, D:20, F:30, C:40, I:55 | 33 LOC single file; 0 tests; 0 CI; no dependencies declared in package.json; no lockfile; 2 commits in 1 day; no local dev setup. |
| **prestige-hotel-management** | 2,392,938 | 10.6 · F | 2/5 ($0) | B:0, N:0, D:5, C:5, E:10, F:20, H:25, K:30, I:40 | Vendored ionCube obfuscated third-party PHP tree; 865 files >500 LOC (411 >1000, POSPrestashop.php is 40,998 LOC); duplicated wwwroot tree; 0 tests; no lockfile; legacy Travis CI with no test execution. |
| **echo** | 20,136 | 36.5 · F | 1/5 ($0) | H:0, B:3, K:30, C:45, D:45, E:45, F:55, I:55 | 0 tests; 0 CI; 21 commits over 295 days; 12 of 15 env vars missing from `.env.example`; duplicated landing page (app/page.tsx 861 LOC vs landing-page-client.tsx 529 LOC); raw console logging in all API routes. |
| **claude-chat** | 0 | 1.7 · F | 1/5 ($0) | All: 0 (K: 5) | 0 source files; 0 LOC; 1 commit; empty repository. |
| **keystone-cmo-export** | 5,406 | 22.7 · F | 1/5 ($0) | B:0, H:0, K:10, E:15, I:20, D:30, C:45, F:45 | 0 tests; 0 CI; 1 commit; hardcoded ApiFlash key; unauthenticated `/api/github/push` endpoint executing `execSync` with raw client token; no lockfile; `@keystone/core: *` wildcard dep. |
| **keycmo** | 0 | 6.0 · F | 1/5 ($0) | All: 0 (I: 50) | 0 source files; 0 LOC; 1 commit; 6-line AI Studio banner README; empty scaffold. |

---

## Exhaustive Failure Catalog (Categorized by Root Cause)

### 1. Test Architecture & Verification Failures (Dimension B)
- **100% Zero-Test Syndrome**: 16 out of 24 repositories had 0 tests (`test_spec_files: 0`).
- **Scaffold / Dummy Test Mockery**: Repositories like `aviationcura` had 1 test that only tested the default Cloudflare "Hello World" template, completely ignoring all 2.5k LOC of real business logic.
- **External Network Dependency in Tests**: `keystone-treasury-os` and `dreyv` had tests hitting live Solana devnet endpoints; `founder` had tests hitting live preview URLs over HTTP instead of testing local in-memory code. Tests failed immediately when run in isolated/offline sandboxes.
- **Unenforced Test Suites**: In repositories where tests existed (`odds-grabber-pro`, `cyprus-chat`, `dreyv`), the CI pipeline never ran `vitest run` or `cargo test`.
- **Zero Coverage Enforcement**: No project configured coverage tools or minimum thresholds (e.g. `--cov-fail-under` or `vitest --coverage`).

### 2. CI/CD & Pipeline Maturity Failures (Dimension H)
- **Total Absence of CI**: 14 of 24 repositories had `ci_present: false` (no `.github/workflows/` directory at all).
- **Deployment Without Quality Gating**: In `cyprus-chat`, `aviationcura`, and `dreyv`, CI workflows deployed directly to Cloudflare/containers on push to `main` without running lint, typecheck, or tests first.
- **Fake Gates via `continue-on-error`**: In `autoclip`, `ruff` lint and `tsc` typecheck were configured in CI with `continue-on-error: true`, meaning syntax errors, type errors, and lint violations never failed a pull request.
- **Uncached & Unpinned Actions**: Floating action tags (`actions/checkout@v4` vs SHAs) and missing package manager store caching.

### 3. Security Hygiene & Secret Exposure Failures (Dimension I)
- **Plaintext Private Keys Committed**: Live private keys committed in `contracts/deploy-marketplace.mjs` line 18 in `keystone-treasury-os`, `dreyv`, and `dreyv-your-daily-drive`.
- **Hardcoded Live Third-Party API Keys**: Etherscan API keys (`A4KJ27Z7RMJP9MPIAU7TVFXMN1Z51V2XJG`), RapidAPI keys, YouTube API keys, Google Maps keys, ApiFlash keys committed directly in frontend source files.
- **Hardcoded Passwords**: Plaintext credentials like `const PASSWORD = "opensesame"` in `qa.tsx` in `aloyacy`.
- **Committed Live Environment Files**: `.env`, `.env.production`, and `.env.development` checked into git version control.
- **Remote Code Execution / Injection Flaws**: `keystone-cmo-export` exposed an unauthenticated `/api/github/push` dev server route that took user-supplied strings and concatenated them into `child_process.execSync`.
- **Untyped API Input Ingestion**: `anno-automator` worker parsing `await request.json() as any` without runtime schema validation (Zod).

### 4. Documentation, Onboarding & Environment Parity Failures (Dimension F)
- **Non-Existent READMEs**: 8 repositories had `readme: null` or 0 LOC.
- **Template / Dictation Garbage Documentation**: READMEs containing unedited Vite boilerplate, 6-line AI Studio ads, or 20 lines of raw unformatted voice-to-text dictation notes (`thought-weaver-ai-43`).
- **Drift Between Source & `.env.example`**: `keystone-treasury-os` referenced 100+ environment variables in source code, but `.env.example` only listed 3. `cyprus-connect` referenced 14 unlisted vars.
- **Zero Containerization**: No `docker-compose.yml`, `Dockerfile`, or `.devcontainer/` to allow an external engineer or buyer to spin up Postgres, Redis, or mock servers with a single command.

### 5. Codebase Cleanliness & Modular Decay (Dimension C)
- **Monolithic God Files**: `handlers.ts` at 11,756 LOC, `old-atlas.tsx` at 4,825 LOC, `POSPrestashop.php` at 40,998 LOC, `DashboardDemo.tsx` at 2,359 LOC, `MapPreview.tsx` at 1,603 LOC.
- **Dead & Corrupted Files**: Dead legacy components (`old-atlas.tsx`), garbled single-character-spaced files, and leftover agent debugging tools (`debug-collector.js` at 716 LOC in `public/`).
- **Massive Duplication**: Verbatim duplication of UI primitives, canvas QR generators, and duplicated whole trees (`wwwroot/` vs root in `prestige-hotel-management`).
- **Unenforced Linters**: `eslint.config.js` or `.prettierrc` present in repositories but never executed in CI or pre-commit hooks.

### 6. Architecture & Observability Failures (Dimension D)
- **Hardcoded Local System Paths**: Hardcoded absolute paths like `/Users/zhoukk/autoclip` in `autoclip` that cause immediate crashes on any other machine.
- **Error Swallowing**: Catch blocks doing only `console.error(err)`, `alert(err.message)`, or returning generic status codes without typed errors (`AppError`).
- **No Structured Observability**: Absence of structured JSON logging (`pino`, `winston`, `structlog`) with request IDs, trace contexts, and log levels.
- **Missing Healthcheck Endpoints**: No `/healthz` or `/api/health` validating database, cache, and third-party upstream connectivity.

### 7. Dependency Graph & Supply Chain Failures (Dimension E)
- **Missing Lockfiles**: Repositories without `package-lock.json`, `pnpm-lock.yaml`, `composer.lock`, or `requirements-lock.txt`.
- **Wildcard / Floating Dependencies**: Dependencies pinned to `"*"` or pre-release beta tags without frozen locks.
- **Unsplit Runtime & Dev Dependencies**: Testing libraries (`@types/*`, `eslint`, `typescript`) placed in `dependencies` instead of `devDependencies`.
- **Zero Freshness Automation**: Absence of `dependabot.yml` or `renovate.json`.
- **No Dependency Vulnerability Gating**: Absence of `npm audit --audit-level=high` or `pip-audit` in CI.

### 8. Git History & Task Mineability (Dimension K)
- **Bot-Burst Dumping**: Thousands of commits generated in short 1-to-14-day bursts from `lovable-dev[bot]`, `manus-agent`, or single-commit exports.
- **Zero Mineable Tasks**: Changes committed without co-located tests, making it impossible for automated systems to isolate individual engineering tasks.
- **Non-Conventional Commits**: Commit messages lacking semantic categorization (`feat:`, `fix:`, `test:`, `refactor:`).
- **Zero Semver Tagging**: No semantic version releases (`v1.0.0`, `v1.1.0`), preventing release tracking.
