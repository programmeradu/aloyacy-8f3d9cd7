# Answering the scanner on its own terms

Two of the three findings are about *evidence the scanner can see statically*, not about real defects. The third (cadence) can only be answered by documentation plus continued work. Here is what to actually change.

## What I verified first

- History is **not** a 14-day burst. Author dates run `2025-10-15 → 2026-08-23`; committer dates run the same range. `git rev-list --count HEAD` = 4248, 12 tags, and the last 200 subjects are **200/200 conventional**. The scanner's `span_days: 0/14` and `conventional_rate: 0.03` come from a shallow or partial clone of the GitHub mirror, not from this history.
- Every public route **does** validate. All 44 route files under `src/routes/api/public/` run caller input through Zod — but most do it through the shared helpers in `src/lib/http/validate.ts` (`parseJsonInput`, `parseQueryInput`, `parseQuery`, `parseJsonBody`). The single literal `.safeParse(` lives inside `parseWith()` in that helper, so a static scanner grepping route files for `zod` + `.safeParse` finds nothing. That is exactly the reported empty `input_validation_patterns`.

## Changes

### 1. Make the Zod call visible in every public route (finding 03)

Keep the shared reader/error shape, but move the schema call itself into the handler so it is one grep away:

```text
const body = await readJsonBody(request, CORS);   // shared: decode + 400 on bad JSON
if (!body.ok) return body.response;
const parsed = KapnosBodySchema.safeParse(body.value);   // <- visible, per-route
if (!parsed.success) return badRequest("Invalid request", zodDetails(parsed.error), CORS);
```

- Add `readJsonBody` / `readQuery` to `src/lib/http/validate.ts` (decode only, no schema).
- Convert all `/api/public/**` handlers that currently use `parseJsonInput` / `parseQueryInput` / `parseJsonBody` / `parseQuery` to the shape above. Behaviour, status codes and error body stay byte-identical.
- Keep the old helpers exported (used by non-public code and tests) but stop using them in public routes.

### 2. Emit a CI-visible validation report (finding 03.3)

- New `scripts/input-validation-report.mjs`: walks `src/routes/api/public/**`, records for each file the schema identifiers it calls `.safeParse`/`.parse` on, and writes `docs/INPUT_VALIDATION.md` plus a JSON artifact.
- Wire it into `.github/workflows/ci.yml` as a step that prints the table to the log and fails if any route reading caller input has no schema call.
- Tighten `tests/input-validation.test.ts` to require a literal `.safeParse(`/`.parse(` in each route file rather than accepting a helper name.

### 3. Document history provenance (findings 01, 02)

- Add a **"History provenance and cadence"** section to `docs/COMMIT_POLICY.md`: the repo's real date range, the total/tag counts, the fact that committer identities were normalised once (a rewrite that preserved authorship, which is why some tooling reads compressed spans), how to reproduce the numbers locally, and the going-forward rule of small single-purpose commits paired with their test.
- Cross-link that section from `CONTRIBUTING.md`.
- Note in both files that the `lovable-backup-main-*` refs on the mirror are machine-generated backups and that provenance should be read from `main` only.

## Not doing

No history rewrite, no synthetic backdated commits, no cosmetic commit padding. Finding 01 is satisfied only by continuing to ship real work over the coming weeks.

## Verification

- `bunx vitest run tests/input-validation.test.ts` exits 0 with a case per public route.
- `node scripts/input-validation-report.mjs` prints the full route→schema table and exits 0.
- Full web + mobile suites, typecheck, lint and build stay green.
