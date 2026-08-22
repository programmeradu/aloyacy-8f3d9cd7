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

## Authorship

- Commit with a real name and a reachable email
  (`git config user.name` / `user.email`). No `root@localhost`, no bot identity
  on human work.
- Pair or agent-assisted work credits both:

  ```text
  Co-authored-by: Name <email>
  ```

## Releases

- Semantic versions, tagged annotated: `git tag -a v1.2.0 -m "…"`.
- `CHANGELOG.md` gets a section per tag, grouped by commit type.
- Tag only from a green CI run on `main`.
