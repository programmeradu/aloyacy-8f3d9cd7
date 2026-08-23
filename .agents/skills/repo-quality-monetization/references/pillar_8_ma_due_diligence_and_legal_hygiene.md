# Pillar 8: M&A Tech Due Diligence & Legal Hygiene

During a commercial acquisition or technical audit (such as those performed by Black Duck or external M&A consultants), high-quality code is not enough. The repository must be legally clean, demonstrably scalable, fully documented for integration, and free of architectural single points of failure.

This pillar introduces the enterprise standards required for a frictionless, high-valuation exit.

---

## 1. Legal Hygiene & License Auditing (The "Black Duck" Defense)

A single copyleft dependency (e.g., GPL, AGPL) buried deep in a proprietary project's dependency tree can derail an entire acquisition. Commercial projects must have clean licensing.

### Rules:
- **Zero Copyleft Constraint**: Commercial proprietary projects must never include GPL, AGPL, or other strict copyleft dependencies. Permissive licenses (MIT, Apache 2.0, BSD) are safe.
- **Root License**: A clear `LICENSE` file must exist at the root of the repository, defining the legal boundaries (Proprietary/Commercial or specific Open Source license).
- **Automated Enforcement**: Integrate a license auditing tool into the CI pipeline to fail the build if unapproved licenses are introduced.

### Implementation (Node.js/npm):
Add `license-checker-rseval` to your CI gate:
```bash
# In your package.json
"scripts": {
  "check:licenses": "license-checker-rseval --summary --failOn \"GPL;AGPL\""
}
```

---

## 2. Immutable Infrastructure & Versioned Schema Migrations

"Manual clicks in a console" are untracked technical debt. An enterprise buyer demands that the entire environment—database schemas, RLS policies, indexes, and seeded data—can be reproduced from a blank slate via code.

### Rules:
- **Zero Manual Database Changes**: No schema modifications via UI (e.g., Supabase console, AWS RDS console).
- **Versioned Migrations**: Every schema change must be a tracked SQL migration script (e.g., `20240101000000_create_users.sql`) or ORM declarative schema (Prisma).
- **Seeded Environments**: A reproducible `seed.sql` or `seed.ts` script must exist to generate realistic, anonymized data for a fresh developer environment.

---

## 3. API Contract Documentation (OpenAPI / Swagger)

An API without an interactive, standardized contract is unsellable to B2B clients or acquirers who need to integrate with it.

### Rules:
- **Generated, Never Hand-Written**: OpenAPI (Swagger) 3.0+ specs must be generated directly from the actual code validation boundaries (e.g., Zod schemas, Pydantic models).
- **Accessible Docs**: A `/docs` or `/swagger` endpoint should be available in staging/development for visual exploration.

### Implementation Example (TypeScript / Zod):
Use libraries like `@asteasolutions/zod-to-openapi` or `tsoa` to automatically project the Zod schemas enforced in Pillar 2 into an OpenAPI JSON payload.

---

## 4. SAST (Static Application Security Testing)

While standard dependencies are checked by `dependabot` and `npm audit`, buyers want proof that your *custom application code* is secure.

### Rules:
- **Automated Scanning**: A SAST tool must run in the CI pipeline to catch SQL Injection, Cross-Site Scripting (XSS), insecure cryptography, and CSRF vulnerabilities.
- **Hard Gate**: The CI build must fail on any `High` or `Critical` vulnerabilities.

### Implementation (GitHub Actions with Semgrep or CodeQL):
```yaml
# .github/workflows/sast.yml
name: SAST
on: [push, pull_request]
jobs:
  semgrep:
    name: Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: semgrep ci
        env:
          SEMGREP_RULES: p/default
```

---

## 5. Performance Proof & Load Testing

A sellable product must prove it scales under concurrency. "It works on my machine" is not a scalable business model.

### Rules:
- **Baseline Load Test**: A dedicated `tests/load/` directory must contain a script hitting the most critical read/write endpoints.
- **Established Thresholds**: Document the Requests Per Second (RPS) the app handles on standard hardware without exceeding a 500ms p95 latency.

### Implementation (k6):
```javascript
// tests/load/baseline.js
import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  vus: 50,
  duration: '30s',
};

export default function () {
  http.get('http://localhost:8080/healthz');
  sleep(1);
}
```

---

## 6. Accessibility (a11y) Compliance

If the repository contains a frontend application, accessibility is not a "nice to have"—it is often a legal requirement for government and enterprise B2B contracts (WCAG 2.1 AA).

### Rules:
- **Zero a11y Lint Warnings**: React/Vue applications must run `eslint-plugin-jsx-a11y` (or equivalent) with `--max-warnings=0`.
- **E2E Auditing**: Core end-to-end tests should include an accessibility audit (e.g., using `axe-core`).
