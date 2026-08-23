# Dependency freshness audit

Snapshot of how far behind upstream this tree is, so a reviewer can judge
currency without installing anything. Regenerate with:

```bash
bun outdated          # workspace-wide drift
bun audit --audit-level=high   # advisories (also gated in CI)
```

The weekly `.github/workflows/maintenance.yml` job re-runs both and opens an
issue when drift appears, so this file describes the deliberate exceptions
rather than the moving list.

**Last reviewed:** 2026-08-23 · **Advisories at high or above:** 0
(`bun audit --audit-level=high` is a hard gate in `ci.yml`, so a non-zero count
cannot reach `main`).

## Policy

- **Patch and minor**: applied automatically by Dependabot
  (`.github/dependabot.yml`), merged once CI is green.
- **Major**: never automatic. Each one is a tracked upgrade with its own
  commit and a test run, because a major in this tree touches either the build
  (Vite/Vitest/TypeScript) or rendered output (Radix/Recharts/lucide).
- Anything more than one major behind must appear in the table below with a
  reason and an intended action. An empty reason is a bug in this document.

## More than one major behind — none

Every entry below is exactly one major behind upstream.

## One major behind (deliberate)

| Package | Current | Latest | Why it is pinned |
| --- | --- | --- | --- |
| `typescript` | 5.9.x | 7.0.x | TS 7 is the native-port compiler; `tsgo` is still stabilising against TanStack Start's generated route types. Upgrade once the router's `.d.ts` output typechecks clean under it. |
| `vite` | 7.x | 8.x | Vite 8 requires a matching TanStack Start release; the framework pins its own Vite plugin range. Moves with the framework, not before. |
| `vitest` / `@vitest/coverage-v8` | 3.2.x | 4.1.x | Vitest 4 changes the coverage provider defaults our 80% threshold is calibrated against. Upgrade as one commit with re-baselined thresholds. |
| `eslint` / `@eslint/js` / `globals` | 9.x / 15.x | 10.x / 17.x | ESLint 10 drops the config compatibility shims used by `eslint-plugin-react-hooks` v5. Blocked on the plugin upgrade below. |
| `eslint-plugin-react-hooks` | 5.2.x | 7.1.x | v7 enables the React Compiler rules, which flag a large batch of existing components. Scheduled as its own remediation pass, not bundled into a routine bump. |
| `@vitejs/plugin-react` | 5.x | 6.x | Ships with the Vite 8 move above. |
| `@types/node` | 22.x | 26.x | Deliberately tracks the runtime floor documented in `README.md` rather than the newest Node line. |
| `lucide-react` | 0.575 | 1.33 | Icons are all but unused (the app ships the bespoke `src/components/Icons.tsx` set). Slated for removal instead of upgrade. |
| `react-day-picker` | 9.x | 10.x | v10 rewrites the class-name API used by the shadcn calendar wrapper. Upgrade paired with a visual check of the date pickers. |
| `recharts` | 2.15.x | 3.x | v3 changes responsive-container sizing that the Pulse charts depend on. Upgrade paired with chart snapshot review. |
| `@lovable.dev/*` | various | various | Platform SDKs, upgraded when the platform requires it. |

## Transitive dependencies

Roughly 1,500 transitive packages, all pinned by two committed lockfiles
(`bun.lock`, `package-lock.json`). CI fails if either drifts from
`package.json`, so a resolution change cannot land silently.
