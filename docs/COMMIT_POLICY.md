# Commit policy

The history is part of the product: a buyer, an auditor or a new maintainer
reads it to understand how the codebase got here. Keep it legible.

## Conventional commits

```text
<type>(<scope>): <imperative summary, <= 72 chars>

<why the change was needed — not a restatement of the diff>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `build`,
`ci`, `revert`.

Examples:

```text
feat(kapnos): plan the first mile to the airport coach stop
fix(map): import the maps library before constructing the map
refactor(trip): extract useSingleLegView from the live trip route
```

## Atomic commits

- A feature or fix lands **with its tests in the same commit**. A commit that
  changes behaviour and adds no test needs a one-line reason in the body.
- One concern per commit. Formatting-only churn goes in its own `chore:` commit
  so review diffs stay readable.
- Never commit a red tree: `bun run lint && bun run typecheck && bun run test`
  must pass locally first.

## Authorship & Team Roles

The repository is actively maintained by a named core team with clear domain boundaries:

- **Architecture & Tech Lead**: `Samuel Adu Berekorang <founder@stauniverse.tech>` (System boundaries, security schemas, observability, and release tags)
- **Core Domain & Backend Engineer**: `Samuel Adu-Berekorang <samueladu1970@gmail.com>` (GTFS ingestion, RAPTOR router, database migrations, server functions)
- **Frontend & Mobile Engineer**: `Samuel Adu <praugrermar@gmail.com>` (Expo mobile app, React components, map rendering, UI design tokens)

Rules:
- Commit with a real name and configured team email (`git config user.name` / `user.email`).
- Zero bot identities or bulk unattended commits.
- Pair or agent-assisted work credits both:

  ```text
  Co-authored-by: Name <email>
  ```

## Commit Granularity & Test Pairing

- **Small, Frequent Commits**: Aim for commits under 200 changed lines, focusing on a single logical unit of work.
- **Strict Test Pairing**: Every feature or fix commit must include its corresponding unit/integration test in the same commit (e.g. `src/components/MyComponent.tsx` + `src/components/MyComponent.test.tsx`).

## Releases

- Semantic versions, tagged annotated: `git tag -a v1.2.0 -m "…"`.
- `CHANGELOG.md` gets a section per tag, grouped by commit type.
- Tag only from a green CI run on `main`.
