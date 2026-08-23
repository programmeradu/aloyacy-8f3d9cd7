---
name: repo-quality-monetization
description: >-
  Relentless 10/10 Codebase Quality, Engineering Discipline, and Monetization Readiness skill.
  Activate this skill when creating, auditing, refactoring, testing, securing, or preparing any codebase
  for enterprise quality checks, production deployment, commercial acquisition, or AI data licensing.
  Enforces uncompromising standards across testing (zero-external isolation, high test-to-source ratios),
  CI/CD quality gates (zero-warning linting, typechecking, security audits), security hygiene (zero committed secrets,
  100% .env.example parity, Zod/Pydantic boundary validation), god-file modularization (<500 LOC), structured
  observability (pino/structlog JSON logging, /healthz endpoints), containerized 1-command runs, and mineable
  atomic git histories.
---

# 10/10 Codebase Quality & Monetization Readiness Skill

This skill encodes the uncompromising engineering and commercialization intelligence extracted from analyzing over 3.28 million lines of code across 24 enterprise/commercial evaluation audits. Use it to ensure every new project, feature, or refactor scores a flawless 10/10 (Grade A) in architecture, security, testing, CI/CD, documentation, and monetization valuation.

---

## ⚡ Quick Decision & Quality Enforcement Matrix

Before taking any development action, consult this matrix:

| Decision Area | 10/10 Mandatory Rule | Reference |
|---|---|---|
| **Writing Features** | Every feature/fix MUST be committed with its corresponding unit/integration test in the SAME commit. | [Pillar 6: Git History](./references/pillar_6_git_history_and_task_capacity.md) |
| **File Length Limits** | **500 LOC Hard Ceiling**. Ideal target 150–300 LOC. Split files exceeding 500 LOC immediately. | [Pillar 4: Architecture](./references/pillar_4_architecture_observability.md) |
| **Running Tests** | Must be **100% offline runnable**. Mock external APIs (OpenAI, Gemini, Stripe, Solana, Etherscan). No network in CI. | [Pillar 1: Testing](./references/pillar_1_testing_and_isolation.md) |
| **Test Coverage Target** | Minimum **70% line coverage** enforced in CI with `--cov-fail-under` or `vitest --coverage`. | [Pillar 1: Testing](./references/pillar_1_testing_and_isolation.md) |
| **Environment Variables** | **100% Parity**. Every `process.env` in source MUST exist in `.env.example` with placeholder + comment. | [Pillar 2: Security](./references/pillar_2_security_and_secret_hygiene.md) |
| **Secrets & Keys** | NEVER commit plaintext keys or `.env` files. Ignore `.env*` except `.env.example`. Scan with Gitleaks. | [Pillar 2: Security](./references/pillar_2_security_and_secret_hygiene.md) |
| **API Request Validation** | Every external input boundary MUST be parsed with `zod` (TS) or `pydantic` (Python). No `as any`. | [Pillar 2: Security](./references/pillar_2_security_and_secret_hygiene.md) |
| **CI Quality Gate** | CI must run: `lint (--max-warnings=0)` + `typecheck` + `test --coverage` + `audit` + `build`. Never use `continue-on-error`. | [Pillar 3: CI/CD](./references/pillar_3_ci_cd_and_quality_gates.md) |
| **Deploy Gate** | Deployment workflows MUST have `needs: [verify]` to prevent broken code from deploying. | [Pillar 3: CI/CD](./references/pillar_3_ci_cd_and_quality_gates.md) |
| **Logging & Errors** | Eradicate `console.log`/`console.error` swallowing. Use structured JSON logging (`pino`/`structlog`) + `AppError`. | [Pillar 4: Architecture](./references/pillar_4_architecture_observability.md) |
| **Observability** | All API services MUST provide a live `GET /healthz` endpoint checking database and cache connectivity. | [Pillar 4: Architecture](./references/pillar_4_architecture_observability.md) |
| **1-Command Run** | Provide a working `docker-compose.yml` and 8-section `README.md` for seamless clone-to-run onboarding. | [Pillar 5: Docs & Docker](./references/pillar_5_docs_and_containerization.md) |
| **Commit Messages** | Follow Conventional Commits (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`). Maintain human identity. | [Pillar 6: Git History](./references/pillar_6_git_history_and_task_capacity.md) |
| **Releases** | Tag semantic milestone versions (`v1.0.0`, `v1.1.0`) in Git. | [Pillar 6: Git History](./references/pillar_6_git_history_and_task_capacity.md) |

---

## 🏛️ The 7 Core Pillars (Deep Reference Guides)

For complete technical specifications, code templates, and blueprints, consult the pillar files:

1. **[Pillar 1: Testing, Test:Source Ratios & Zero-External Isolation](./references/pillar_1_testing_and_isolation.md)**
   - Vitest & Pytest setup, MSW/in-memory mocks, coverage thresholds, 3-layer test architecture.
2. **[Pillar 2: Security Hygiene, Secret Eradication & Input Validation](./references/pillar_2_security_and_secret_hygiene.md)**
   - Zero-leak mandate, `.env.example` parity scripts, Git history purging with `git-filter-repo`, Zod & Pydantic schemas.
3. **[Pillar 3: CI/CD Maturity, Quality Gates & Zero-Bypass Pipelines](./references/pillar_3_ci_cd_and_quality_gates.md)**
   - Multi-stage GitHub Actions CI templates, frozen lockfiles, dependency audits, deploy gating rules, Dependabot config.
4. **[Pillar 4: Architecture, Observability & Modular Cleanliness](./references/pillar_4_architecture_observability.md)**
   - 500-LOC god-file splitting, dynamic path resolution, Pino/Structlog JSON logging, typed `AppError` hierarchy, `/healthz` endpoints.
5. **[Pillar 5: Docs, Containerization & The 1-Command Clone-to-Run Standard](./references/pillar_5_docs_and_containerization.md)**
   - Universal `docker-compose.yml`, offline `MOCK_MODE=true` architecture, 8-section production README template.
6. **[Pillar 6: Git History, Task Capacity & Mineable Engineering Discipline](./references/pillar_6_git_history_and_task_capacity.md)**
   - Mineable task engineering, atomic feature+test pairing, conventional commits, human identity hygiene, semver tags.
7. **[Pillar 7: Monetization Architecture, Buyer-Fit Signals & Enterprise Licensing](./references/pillar_7_monetization_and_buyer_fit.md)**
   - Valuation mathematics, 5 buyer-fit signals, commercial licensing checklist, step-by-step remediation roadmap.
8. **[24-Repo Forensic Audit Database](./references/audit_database_24_repos.md)**
   - Full diagnostic breakdown of all 24 evaluated repositories, defect catalogs, and score analysis.

---

## 🚀 The 10/10 Project Initialization Workflow (From Day 0)

When bootstrapping any new project or major subsystem:

```bash
# Step 1: Initialize Git and Ignore Matrix
git init
cat << 'EOF' > .gitignore
node_modules/
dist/
build/
.env
.env.*
!.env.example
*.log
coverage/
EOF

# Step 2: Initialize Manifest & Lockfile
npm init -y # or pnpm init / poetry init
# Install core runtime + testing/linting tooling
pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom eslint prettier typescript-eslint @types/node

# Step 3: Configure Strict Quality Configs
# Create vitest.config.ts with 70% coverage floor
# Create eslint.config.js and .prettierrc
# Create tsconfig.json with "strict": true

# Step 4: Create Self-Contained Local Setup
# Create .env.example with MOCK_MODE=true
# Create docker-compose.yml with postgres/redis if needed
# Create src/lib/logger.ts (Pino structured logging)

# Step 5: Add CI/CD Pipeline
mkdir -p .github/workflows
# Add .github/workflows/ci.yml and .github/dependabot.yml

# Step 6: Initial Atomic Commit
git add .
git commit -m "feat(scaffold): initialize project with strict CI, testing, and container setup"
git tag -a v0.1.0 -m "Initial scaffold v0.1.0"
```

---

## 🛠️ The Legacy Remediation Workflow (Turning Grade F into Grade A)

When tasked with upgrading an existing repository:

1. **Security Sweep**: Run `gitleaks detect` or regex sweep for keys; replace literal secrets with `process.env`; delete `.env` from git tracking (`git rm --cached .env*`); populate `.env.example` with 100% of discovered vars.
2. **Offline Isolation**: Add mock providers / MSW handlers for all external network APIs so `npm test` runs with zero credentials.
3. **Automated Testing**: Add Vitest/Pytest; write tests for pure logic first, then API boundaries, targeting 70%+ coverage.
4. **God-File Refactoring**: Scan for files >500 LOC (`wc -l`); extract subcomponents, pure utility helpers, and hooks into dedicated files (<300 LOC each).
5. **Observability & Health**: Replace `console.log`/`console.error` with `pino` structured logger; add `GET /healthz` endpoint.
6. **Strict CI Gate**: Commit `.github/workflows/ci.yml` running lint (`--max-warnings=0`), typecheck, tests with coverage, and dependency audit.
7. **Production Documentation**: Write complete 8-section `README.md` and add `docker-compose.yml`.
8. **Tag Release**: `git tag -a v1.0.0 -m "Production release v1.0.0"`.
