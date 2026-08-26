# Accuracy-first planner (remove the blunt rules)

You're right. The last few changes made the planner *behave* better on one journey by
adding blanket rules — "a change must save 5 minutes and 20%", "let direct rides drop you
up to 3 km away". Those are shortcuts. They help route 19 and hurt everything else.
This plan removes them and replaces the guesswork with measured facts.

## The principle

Never prune an option because of its shape (direct vs change). Prune it only when we have
**measured** evidence it is worse. Every number we compare should come from real data:
Google walking/transit times, actual GTFS stop sequences, live vehicle positions, and our
own observed reliability history — not constants we invented.

## What gets removed

- `MIN_TRANSFER_SAVINGS_SEC` / `MIN_TRANSFER_SAVINGS_RATIO` and `applyDirectPreference`
  as a hard filter — a change that genuinely saves 4 minutes should be allowed to show.
- `maxDirectEgressWalkKm: 3.0` — no route-shape-specific walking allowance.
- Duplicated scoring formulas in four files (`raptor-core`, `multileg-legs`,
  `walk-refine.server`, `planner-learning.server`) collapse into one shared scorer.

## What replaces it

**1. Route-aware candidate stops (the real Solomos bug).**
Today we take the N nearest stops and hope the right bay is in there. Instead, pick
origin/destination candidates *per route*: for each route that serves a stop near the
destination, keep its best boarding stop near the origin. A one-seat ride can then never
be crowded out by proximity, at any terminal, without widening walk limits for anyone.

**2. One honest cost model, measured in the same units.**
A single `scoreItinerary()` in `packages/core` combining:
- door-to-door time (walk + wait + ride + alight), all from verified geometry;
- a *measured* change cost — how long that specific interchange actually takes to walk,
  plus the real headway of the connecting route (a change onto a 10-min-headway route
  costs far less than onto a 40-min one);
- reliability from `planner-learning` — observed on-time history for that route/hour,
  which we already collect but currently under-use;
- walking effort priced continuously, no cliff at 500 m.

Direct rides then win the Solomos case *because they are actually better under the model*,
not because a filter deleted the alternative.

**3. Verify before ranking, not after.**
Right now we score with haversine estimates, cut the list, then upgrade the survivors with
Google walking times — so options can be dropped on numbers we later discover were wrong.
Flip it: keep a wider candidate set, refine walks for all of them (they are cached in
`walk_links`, so this is mostly free after warm-up), then score and rank once on verified
numbers.

**4. Prove it on real journeys, not synthetic fixtures.**
A regression suite of named Cyprus journeys (Solomos→Kominino, Kostaki Pantelidi→Isaakiou
Komninou, Nicosia→Larnaca airport, plus cross-city and late-evening cases) asserting
properties — "no option is dominated by a strictly faster and simpler one", "every
returned option is physically boardable at the stated time" — rather than hardcoding
"route 19 must be first".

## Technical notes

- New `packages/core/src/plan-score.ts`: single scorer + `dominates()` helper; all four
  current formulas import it.
- New route-aware candidate selection in `packages/core/src/plan-candidates.ts`, used by
  both the live search (`multileg-search.ts`) and RAPTOR (`raptor.server.ts`).
- `src/lib/raptor-direct.server.ts` folds into the candidate pass and goes away.
- Headway per route/hour computed from the schedule bundle at load time and cached.
- Walk refinement moves ahead of final ranking in `journey-multileg.server.ts` and
  `multileg.functions.ts`; concurrency capped so Google usage stays bounded and cached.

## What you'll notice

Fewer nonsense changes, but also changes that *are* genuinely faster will still appear —
with the reason shown ("saves 7 min, 19 comes every 40 min"). Accuracy, not a rule that
pretends.
