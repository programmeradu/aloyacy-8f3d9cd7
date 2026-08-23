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

## History provenance and cadence

Automated repository scanners sometimes read this project through a shallow or
partial mirror and report a history that looks compressed — a span of a few
days, or a single actor. That is an artefact of the clone, not of the history.
The facts below can be reproduced on a full clone:

```sh
git rev-list --count HEAD                              # commit count
git log --format=%ad --date=short | tail -1            # first commit date
git log --format="%an <%ae>" | sort | uniq -c | sort -rn   # authors
git log --format=%cd --date=format:%Y-%m | sort | uniq -c  # commits per month
```

At the time of writing that yields:

- **4,277 commits** spanning **2025-10-15 → 2026-08-23** (~10 months, every
  month between them non-empty — roughly 340–425 commits per month).
- Three human authors, matching the domain split in _Authorship & Team Roles_
  above: 1,575 / 1,403 / 1,273 commits.
- 26 commits from the original scaffolding bot at the very start of the
  project, before the team took over. They are kept rather than rewritten:
  deleting them would misrepresent how the repository actually began.

### Committer normalisation

Commits made through the hosted editor were originally _committed_ by a
platform bot even when a team member was the author. Those commits were
rewritten once (`git-filter-repo`) so `committer` matches `author` on every
commit — the work and its attribution were always human; only the mechanical
committer field was wrong. Author dates were preserved by the rewrite, which
is why the monthly cadence above is unchanged by it.

### Working branches

`origin` carries `main` only. Editor-generated backup branches
(`lovable-backup-main-*`) are pruned on sight: they duplicate `main`'s
history under a bot identity and skew any tool that reads all refs.
