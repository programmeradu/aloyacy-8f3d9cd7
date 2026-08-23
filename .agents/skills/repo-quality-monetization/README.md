# Repo Quality & Monetization Engine (10/10 Codebase Skill)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Quality Rating](https://img.shields.io/badge/Quality%20Rating-10%2F10%20Grade%20A-brightgreen.svg)]()
[![Antigravity Skill](https://img.shields.io/badge/Antigravity-Skill%20Ready-blue.svg)]()

An uncompromising, PhD-level **Codebase Quality, Engineering Discipline, and Monetization Readiness Skill** for Google Antigravity and modern AI-augmented software engineering.

Built from the forensic analysis of **3,286,118 lines of code across 24 enterprise and commercial repository audits** evaluated by frontier AI code licensing systems (including DataFactor).

---

## 🎯 What This Skill Solves

When submitting code to enterprise acquirers, code buyers, or AI model training data evaluators:
- **Code below the quality threshold earns $0** regardless of whether it has 10,000 LOC or 2,500,000 LOC.
- **Zero test suites / broken offline runs** instantly collapse scores to Grade F.
- **Bot-generated commit dumps** destroy task capacity valuation.
- **Committed secrets and unvalidated API boundaries** fail automated compliance checks.

This skill guarantees that any project developed, refactored, or audited hits **10/10 quality (Grade A)** across all 8 core valuation dimensions.

---

## ⚡ The Quick Decision Matrix

| Decision Area | 10/10 Mandatory Rule | Reference Guide |
|---|---|---|
| **Writing Features** | Every feature/fix MUST be committed with its corresponding unit/integration test in the SAME commit. | [Pillar 6](./references/pillar_6_git_history_and_task_capacity.md) |
| **File Length Limits** | **500 LOC Hard Ceiling**. Ideal target 150–300 LOC. Split files exceeding 500 LOC immediately. | [Pillar 4](./references/pillar_4_architecture_observability.md) |
| **Running Tests** | Must be **100% offline runnable**. Mock external APIs (OpenAI, Gemini, Stripe, Solana, Etherscan). No network in CI. | [Pillar 1](./references/pillar_1_testing_and_isolation.md) |
| **Test Coverage Target** | Minimum **70% line coverage** enforced in CI with `--cov-fail-under` or `vitest --coverage`. | [Pillar 1](./references/pillar_1_testing_and_isolation.md) |
| **Environment Variables** | **100% Parity**. Every `process.env` in source MUST exist in `.env.example` with placeholder + comment. | [Pillar 2](./references/pillar_2_security_and_secret_hygiene.md) |
| **Secrets & Keys** | NEVER commit plaintext keys or `.env` files. Ignore `.env*` except `.env.example`. Scan with Gitleaks. | [Pillar 2](./references/pillar_2_security_and_secret_hygiene.md) |
| **API Request Validation** | Every external input boundary MUST be parsed with `zod` (TS) or `pydantic` (Python). No `as any`. | [Pillar 2](./references/pillar_2_security_and_secret_hygiene.md) |
| **CI Quality Gate** | CI must run: `lint (--max-warnings=0)` + `typecheck` + `test --coverage` + `audit` + `build`. Never use `continue-on-error`. | [Pillar 3](./references/pillar_3_ci_cd_and_quality_gates.md) |
| **Deploy Gate** | Deployment workflows MUST have `needs: [verify]` to prevent broken code from deploying. | [Pillar 3](./references/pillar_3_ci_cd_and_quality_gates.md) |
| **Logging & Errors** | Eradicate `console.log`/`console.error` swallowing. Use structured JSON logging (`pino`/`structlog`) + `AppError`. | [Pillar 4](./references/pillar_4_architecture_observability.md) |
| **Observability** | All API services MUST provide a live `GET /healthz` endpoint checking database and cache connectivity. | [Pillar 4](./references/pillar_4_architecture_observability.md) |
| **1-Command Run** | Provide a working `docker-compose.yml` and 8-section `README.md` for seamless clone-to-run onboarding. | [Pillar 5](./references/pillar_5_docs_and_containerization.md) |
| **Commit Messages** | Follow Conventional Commits (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`). Maintain human identity. | [Pillar 6](./references/pillar_6_git_history_and_task_capacity.md) |
| **Releases** | Tag semantic milestone versions (`v1.0.0`, `v1.1.0`) in Git. | [Pillar 6](./references/pillar_6_git_history_and_task_capacity.md) |
| **License Compliance** | CI must run a license-checker and fail on any `GPL` or `AGPL` dependencies in proprietary repos. | [Pillar 8](./references/pillar_8_ma_due_diligence_and_legal_hygiene.md) |
| **Database Migrations** | Zero manual DB changes. 100% of schema/RLS changes must be in versioned, sequential migration scripts. | [Pillar 8](./references/pillar_8_ma_due_diligence_and_legal_hygiene.md) |
| **API Documentation** | All external HTTP endpoints must generate an OpenAPI 3.0+ spec derived from input schemas. | [Pillar 8](./references/pillar_8_ma_due_diligence_and_legal_hygiene.md) |
| **Code Security (SAST)** | CI must run Semgrep or CodeQL to statically catch SQLi, XSS, and CSRF vulnerabilities in custom code. | [Pillar 8](./references/pillar_8_ma_due_diligence_and_legal_hygiene.md) |

---

## 🏛️ The 8 Core Pillars (Deep References)

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
8. **[Pillar 8: M&A Tech Due Diligence & Legal Hygiene](./references/pillar_8_ma_due_diligence_and_legal_hygiene.md)**
   - Legal license auditing, versioned SQL schemas, OpenAPI generation, SAST scanning, and a11y compliance.
9. **[24-Repo Forensic Audit Database](./references/audit_database_24_repos.md)**
   - Full diagnostic breakdown of all 24 evaluated repositories, defect catalogs, and score analysis.

---

## 📦 Installation for Google Antigravity / Gemini

Clone or copy this skill into your Antigravity global configuration directory:

```bash
# macOS / Linux
mkdir -p ~/.gemini/config/skills
git clone https://github.com/programmeradu/repo-quality-monetization.git ~/.gemini/config/skills/repo-quality-monetization

# Windows (PowerShell)
git clone https://github.com/programmeradu/repo-quality-monetization.git $env:USERPROFILE\.gemini\config\skills\repo-quality-monetization
```

Once installed, Antigravity will automatically activate this skill whenever you write, test, refactor, or audit any codebase.

---

## 📄 License

MIT License. Copyright (c) 2026 Samuel Adu-Berekorang.
