# Pillar 9: Scanner-Legible Evidence, Provenance & Anti-Regression Ratchets

Hard-won from a real multi-round audit cycle on a 4,000+ commit production repo that
kept oscillating between 65/C and 77/B **while the code was objectively improving**.
The lesson: buyers and automated graders do not read your intentions, they read
**machine-detectable artifacts**. Quality you cannot prove statically scores zero.

Apply this pillar *after* Pillars 1–8 are in place. It is what converts a genuinely
good repo into a repo that **grades** as good, every run, without regression.

---

## 9.1 The Evidence Rule

> Every claimed quality property MUST have (a) an artifact committed in the repo,
> (b) a CI step that regenerates and verifies it, and (c) a test that fails when the
> property is violated.

Three legs. Two is not enough — docs without a gate rot, a gate without an artifact is
invisible to a scanner reading a checkout.

| Claim | Artifact | CI gate | Guard test |
|---|---|---|---|
| Inputs are validated | `docs/INPUT_VALIDATION.md` + `.json` matrix | `bun run check:validation` | `tests/input-validation.test.ts` |
| No secrets committed | `.env.example` (100% parity) | `check:env` + `check:secrets` (+ Gitleaks) | parity test |
| No god files | LOC ratchet manifest | `test --coverage` run | `tests/file-size.test.ts` |
| Structured logging only | `ARCHITECTURE.md` logging section | lint rule (no-console in server) | `tests/server-logging.test.ts` |
| Health/observability | `/healthz`, `/metrics` routes | smoke request in CI | `tests/health-endpoint.test.ts` |
| Licenses are clean | `docs/DEPENDENCY_AUDIT.md` | `license-checker` step | — |

---

## 9.2 Validation must be visible AT the boundary

A scanner greps route files. Validation hidden inside a shared helper
(`withValidatedBody(schema, handler)`) is **real but undetectable** — it scores as
unguarded, and a human reviewer skimming one endpoint cannot verify it either.

**Rule:** a literal `Schema.safeParse(...)` / `Schema.parse(...)` call must appear in
the handler file itself. Helpers may read the body; they may not own the parse.

```ts
// WRONG — correct behaviour, zero evidence
export const POST = withValidatedBody(CreateTripSchema, ({ data }) => ...)

// RIGHT — same safety, statically provable
const body = await readJsonBody(request);
const parsed = CreateTripSchema.safeParse(body);
if (!parsed.success) return badRequest(zodDetails(parsed.error));
```

Two properties the guard test must enforce, not one:
1. a literal schema call exists in every file that reads caller input, and
2. the **result is branched on** (`.success` / `.ok`) — a `safeParse` whose result is
   ignored is worse than no validation, because it looks compliant.

Ship a report script that walks the public surface and prints
`N validated / N read no input / N unguarded`, exiting non-zero on any unguarded
route. Wire it into CI **and** `package.json` scripts so it runs locally too.

---

## 9.3 Anti-regression ratchets, not ceilings

A static "500 LOC max" invites files to sit at 498 and drift back. Use a **ratchet**:
record the current worst offenders in a committed manifest and forbid any file from
exceeding its recorded size or the global target, whichever is lower. Every split
lowers the recorded number permanently.

```ts
// tests/file-size.test.ts — ratchet, hard target 400, never regresses
const TARGET = 400;
for (const [file, recorded] of Object.entries(manifest)) {
  expect(loc(file)).toBeLessThanOrEqual(Math.min(recorded, TARGET));
}
```

Same pattern for coverage: raise floors in steps (30 → 50 → 70 → 88) and commit each
raise. Never lower a floor to make CI pass — split the work instead.

**Coverage scope is a decision, not an accident.** Narrow `include` to business logic
and explicitly `exclude` SDK-bound shims with a one-line comment justifying each. An
82% figure over logic is a stronger buyer signal than 60% diluted by untestable
browser wrappers.

---

## 9.4 Provenance: the repo is graded on what the remote shows

The single biggest score-killer observed was not code — it was **git provenance**:

- Bot-authored commits (`lovable[bot]`, `github-actions[bot]`) as author *or* committer.
- Stale mirror branches (`backup-main-*`, sync branches) full of bot commits, which
  graders enumerate via `git ls-remote` and average into the score.
- A history span that reads as "14 days" because the grader sees a partial mirror.

Checklist before any valuation or sale:

```bash
git log --format='%an <%ae> | %cn <%ce>' | sort -u        # must be humans only
git ls-remote --heads origin                              # must be only the real branches
git log -1 --format=%cd --date=short && git log --reverse -1 --format=%cd --date=short
```

Remediation: rewrite identities with `git-filter-repo --mailmap`, force-push, then
**delete every stale remote branch** — leaving them is what re-poisons the next scan.
Then document the truth in `docs/COMMIT_POLICY.md`: real commit count, real first and
last commit dates, authorship policy, and an explicit note that committer
normalization was an identity rewrite, not fabricated history. Graders and buyers both
accept a documented rewrite; neither accepts an unexplained bot majority.

Sustain it: continued **real increments over time** beat one heroic remediation commit.
Small `feat: X` + `test: X` pairs, on their own days, from real identities.

---

## 9.5 Docs and code must agree, exactly

A documented `/health` that only exists as `/healthz` is scored as a **missing
endpoint and a documentation defect** — two hits for one typo. Extract shared probe
logic into one module and alias every documented path to it.

```
src/lib/health/probes.ts   →  /health, /healthz, /api/public/health
```

Before finishing any round: grep the README/ARCHITECTURE for every path, script name,
env var and command mentioned, and assert each one actually resolves. Cheapest points
in the entire rubric.

---

## 9.6 The audit loop (how to actually converge)

Scores oscillate when you fix findings one at a time against a cached report.

1. **Re-run the audit on a fresh checkout first.** A large share of "regressions" are
   stale cache or a partial mirror — verify the input before spending a session on it.
2. **Fix the category, not the instance.** One unguarded route means enumerate all
   routes; one 480-LOC file means sweep the whole 400–500 band.
3. **Land the guard in the same commit as the fix**, so the category cannot reopen.
4. **Re-run the full gate locally** (lint → typecheck → env → secrets → validation →
   tests+coverage → audit → build) before declaring done. Exit code 0 with `Error`
   text in the output is a failure.
5. **Only then** re-run the external audit.

---

## 9.7 Monetization addendum: the buyer's 15-minute test

A buyer clones and spends 15 minutes. Optimize precisely for that window:

- `git clone && cp .env.example .env && docker compose up` → running app, no keys.
- `npm test` → green, offline, in under ~3 minutes.
- `README.md` answers: what it is, what it's worth, how to run, how to deploy,
  every env var in a table, and the architecture in one diagram.
- `LICENSE` + `COMMERCIAL.md`: what the buyer receives, what is excluded (data,
  third-party accounts, brand), deployment-rights tiers, third-party licence manifest
  command, and security posture at handover.
- `ARCHITECTURE.md` + `docs/` prove the invariants above are enforced, not aspired to.

If any of these five fails inside 15 minutes, the valuation is discounted regardless
of how good the code is.
