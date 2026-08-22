# Pillar 3: CI/CD Maturity, Quality Gates & Zero-Bypass Pipelines

> **Core Axiom**: *Code that is not automatically verified by an enforced, blocking CI pipeline before merge is considered broken, unverified, and high-risk by code buyers and enterprise standards.*

---

## 1. The Zero-Bypass Quality Gate Philosophy

In the 24-repo portfolio scan, 14 repositories had 0 CI (`ci_present: false`), while several others had "fake CI" that merely pinged URLs or configured `continue-on-error: true` on linting/typechecking steps.

A true 10/10 codebase enforces a **non-negotiable 5-stage verification gate** on every `push` and `pull_request`:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ 1. Lint &    │ ──> │ 2. Strict    │ ──> │ 3. Automated │ ──> │ 4. Security │ ──> │ 5. Clean     │
│ Format Check │     │ Typecheck    │     │ Test Suite   │     │ & Dep Audit  │     │ App Build    │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

If **any** stage fails, the pull request is hard-blocked from merging. Deploys may only trigger after all 5 verification stages return exit code `0`.

---

## 2. Universal Production CI Pipeline Templates

### A. Full-Stack / Frontend Node & TypeScript (`.github/workflows/ci.yml`)

```yaml
name: Continuous Integration & Quality Gate

on:
  push:
    branches: [main, master, develop]
  pull_request:
    branches: [main, master, develop]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    name: Lint, Typecheck, Test & Audit
    runs-on: ubuntu-latest
    timeout-minutes: 15

    strategy:
      matrix:
        node-version: [20.x]

    steps:
      - name: Checkout Codebase
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        if: hashFiles('pnpm-lock.yaml') != ''
        with:
          version: 9

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: ${{ hashFiles('pnpm-lock.yaml') != '' && 'pnpm' || hashFiles('yarn.lock') != '' && 'yarn' || 'npm' }}

      - name: Install Dependencies (Frozen Lockfile)
        run: |
          if [ -f pnpm-lock.yaml ]; then
            pnpm install --frozen-lockfile
          elif [ -f yarn.lock ]; then
            yarn install --frozen-lockfile
          else
            npm ci
          fi

      - name: 1. Code Formatting Check
        run: |
          if npx prettier --version >/dev/null 2>&1; then
            npx prettier --check .
          fi

      - name: 2. ESLint (Zero-Warning Enforcement)
        run: |
          if [ -f pnpm-lock.yaml ]; then
            pnpm run lint -- --max-warnings=0
          elif [ -f yarn.lock ]; then
            yarn lint --max-warnings=0
          else
            npm run lint -- --max-warnings=0
          fi

      - name: 3. TypeScript Strict Typecheck
        run: npx tsc --noEmit

      - name: 4. Automated Test Suite & Coverage Thresholds
        run: |
          if [ -f pnpm-lock.yaml ]; then
            pnpm run test -- --run --coverage
          elif [ -f yarn.lock ]; then
            yarn test --run --coverage
          else
            npm test -- --run --coverage
          fi

      - name: 5. Dependency Vulnerability Audit
        run: |
          if [ -f pnpm-lock.yaml ]; then
            pnpm audit --audit-level=high
          else
            npm audit --audit-level=high
          fi

      - name: 6. Production Application Build
        run: |
          if [ -f pnpm-lock.yaml ]; then
            pnpm run build
          elif [ -f yarn.lock ]; then
            yarn build
          else
            npm run build
          fi
```

---

### B. Python / FastAPI / Data Engineering (`.github/workflows/ci.yml`)

```yaml
name: Python Quality & Verification Pipeline

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  test-and-verify:
    name: Ruff, Mypy, Pytest & Audit
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Python 3.11
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'

      - name: Install Dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
          pip install ruff mypy pytest pytest-cov pytest-asyncio pip-audit

      - name: 1. Ruff Lint & Format Check
        run: |
          ruff check .
          ruff format --check .

      - name: 2. Mypy Typecheck
        run: mypy backend src --ignore-missing-imports

      - name: 3. Pytest with Coverage Floor
        run: pytest --cov=backend --cov=src --cov-report=term-missing --cov-fail-under=70

      - name: 4. Pip Security Audit
        run: pip-audit -r requirements.txt
```

---

## 3. The Continuous Deployment Gating Rule

Deployments must **NEVER** run independently on `push: branches: [main]` without an explicit dependency on the verification pipeline passing.

### Correct Gating Pattern (`.github/workflows/deploy.yml`)
```yaml
name: Deploy Production Service

on:
  push:
    branches: [main]

jobs:
  # Reference the verification job from ci.yml or define verify in same workflow
  verify:
    uses: ./.github/workflows/ci.yml

  deploy:
    name: Deploy to Cloudflare / Vercel / Kubernetes
    needs: [verify] # HARD DEPENDENCY: Deploy will NOT execute if verify fails
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Deployment Command
        run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

---

## 4. Automated Dependency Freshness (`dependabot.yml`)

Every production repository must have `.github/dependabot.yml` at root to prevent dependency staleness:

```yaml
version: 2
updates:
  # Keep npm dependencies up-to-date
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    reviewers:
      - "programmeradu"

  # Keep GitHub Actions up-to-date
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "monthly"
```

---

## 5. Critical CI Anti-Patterns

1. ❌ **`continue-on-error: true` on Lint/Types**: This invalidates the entire purpose of CI. If a linter warns about an undefined variable or insecure cast, the job MUST fail.
2. ❌ **Missing Lockfile in Repository**: Running `npm install` without a committed `package-lock.json` leads to non-deterministic builds and breaking version drift.
3. ❌ **Deploy-Only CI**: Having workflows that only run `wrangler deploy` or `vercel --prod` without running tests first.
4. ❌ **Floating Actions**: Using unversioned or untagged actions. Always pin to major version tags (`actions/checkout@v4`) or full commit SHAs.
