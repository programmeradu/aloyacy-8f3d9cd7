# Pillar 6: Git History, Task Capacity & Mineable Engineering Discipline

> **Core Axiom**: *Buyers evaluate commit history as the true product. A repository with 10,000 LOC and zero mineable tasks is worth $0. Value scales with how much of the history can be decomposed into self-contained engineering tasks proven by accompanying tests.*

---

## 1. What "Task Capacity" & Mineability Mean

In AI model training and code licensing evaluations (such as DataFactor and SWE-bench):
- Models are trained and benchmarked on **real human engineering problem-solving trajectories**.
- A **Mineable Task Instance** requires:
  1. **FAIL_TO_PASS Tests**: Tests committed in the PR that explicitly fail on the codebase *before* the fix and pass *after* the fix.
  2. **PASS_TO_PASS Tests**: The regression test suite that remains green before and after the change.
  3. **Isolated Test Harness**: The ability to run `pytest` / `vitest` in a single command inside an ephemeral container.
  4. **Task Problem Prompt**: A well-structured PR description detailing the problem, root cause, and intended solution.
- **Bot-Dumped History Disqualification**: If a repository has 4,000 commits generated in 10 days by `lovable-dev[bot]`, `v0`, or `manus-agent` without paired tests or semantic problem descriptions, it has **0 Task Capacity**, resulting in zero licensing payout regardless of LOC.

---

## 2. The Atomic Feature + Test Commit Rule

Every single functional commit in your repository must follow this strict invariant:

$$\text{Mineable Commit} = \text{Functional Change} + \text{Pinning Test Case} + \text{Semantic Context}$$

### ❌ Rejected Commit Pattern (Zero Task Value)
```
Commit 1: "feat: add user authentication, stripe billing, trip planner, and UI revamp" (1,400 LOC diff, 0 tests)
Commit 2: "fix: fix various bugs and formatting" (400 LOC diff)
Commit 3: "tests: add test file" (1 test testing hello world)
```

### ✅ 10/10 Mineable Commit Pattern (High Enterprise Valuation)
```
Commit 1: "feat(auth): implement session validation with JOSE JWT verification"
          ├── src/lib/auth/session.ts
          └── src/lib/auth/session.test.ts (4 test cases proving valid, expired, and malformed tokens)

Commit 2: "feat(billing): add stripe webhook signature verifier and credit top-up"
          ├── src/lib/billing/stripe.ts
          └── src/lib/billing/stripe.test.ts (Mocked signature verification tests)

Commit 3: "fix(transit): correct bearingDeg wrap-around across 360-degree boundary"
          ├── src/lib/geo/bearing.ts
          └── src/lib/geo/bearing.test.ts (Edge case test proving 359° -> 1° transition)
```

---

## 3. Pull Request Template for Maximum Mineability

Add `.github/pull_request_template.md` to every repository to ensure every PR context is mineable as an AI training task prompt:

```markdown
## Problem Description
<!-- Describe the bug, limitation, or missing feature being addressed -->

## Root Cause
<!-- Explain why the issue occurred in the codebase -->

## Proposed Solution & Architecture
<!-- Detail the code changes and design decisions made -->

## Verification & Test Plan
<!-- List the specific automated tests that prove the fix/feature -->
- [ ] Unit tests added in `src/tests/...`
- [ ] Edge cases covered (zero-state, invalid payload, error handling)
- [ ] All tests run green offline (`npm test` / `pytest`)
```

---

## 4. Semantic / Conventional Commit Standards

All commits must follow the **Conventional Commits 1.0.0** specification.

### Commit Format
```
<type>(<optional scope>): <imperative description>

[optional body explaining motivation and architectural context]

[optional footer(s) / issue references]
```

### Standard Type Matrix
| Type | Purpose | Includes Tests? |
|---|---|---|
| `feat` | A new user-facing feature or API capability | **Mandatory** (`*.test.ts` included) |
| `fix` | A bug fix correcting erroneous behavior | **Mandatory** (Regression test pinning fix) |
| `test` | Adding or refactoring test suites | Yes |
| `refactor` | Code restructuring without behavior changes | Existing tests must run green |
| `perf` | Performance optimization | Benchmark or test included |
| `docs` | Documentation, README, or example changes | Optional |
| `chore` | Build scripts, dependencies, config updates | Optional |

---

## 5. Human Contributor Identity & Cadence Hygiene

### 1. Author Identity Configuration
Never commit under anonymous bot or default IDE identities (`lovable-dev[bot]`, `root@localhost`, `emergent-agent`). Set your consistent human git profile:

```bash
git config --global user.name "Your Name"
git config --global user.email "your-verified-email@domain.com"
```

### 2. Cadence & Span Discipline
- Sustained development over 30–180+ days with organic back-and-forth iteration is scored significantly higher than a 48-hour automated dump.
- If multiple developers or agents contribute, ensure distinct author signatures are preserved to demonstrate multi-author collaboration.

---

## 6. Semantic Versioning & Release Tagging

Every production codebase must maintain semantic release tags (`vX.Y.Z`) corresponding to milestone stability:

```bash
# Tag a major milestone release
git tag -a v1.0.0 -m "Release v1.0.0: Core transit routing engine with 85% test coverage and CI gate"
git push origin v1.0.0
```

### Tagging Protocol
- `v0.1.0`: Initial core architecture with working test runner and CI.
- `v0.5.0`: Feature-complete implementation with full mock layer.
- `v1.0.0`: Production-ready release with 0 secrets, full docs, and complete test suites.
- `v1.1.0`: Incremental feature additions with paired tests.
