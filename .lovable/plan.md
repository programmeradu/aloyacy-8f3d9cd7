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

**4. Unify terminals into real stations (the Solomos Square confusion).**
I checked the feed and this is exactly what you suspected. Solomos Square is not one
stop in the data — it is five separate records, spread across two operator feeds, all
within about 100 metres of each other:

```text
id 1      IC + NPT   Dionysios Solomos Square      35.17067, 33.35894
id 7420   NPT        Dionysios Solomos Square A    35.17079, 33.35901   (~13 m from id 1)
id 7421   NPT        Dionysios Solomos Square C    35.17144, 33.35837   (~99 m)
id 7189   LMS + NPT  Dionysios Solomos Square D    35.17138, 33.35824   (~103 m)
id 7400   NPT        Solomos Square Alighting      35.17039, 33.35839   (~55 m)
```

To the planner these are five unrelated places. So when 13 departs from bay A and 19
departs from bay C, the system does not see "both leave from Solomos Square" — it sees
two different locations, and boarding 19 looks like it needs a walk it would rather
avoid, while 13 is right there. That is the whole reason it sends you off on 13 to meet
19 later.

The fix is a station layer, built from the data rather than declared by hand:

- Cluster stops into stations by measured proximity plus name/agency evidence — stops
  within a short walk whose names share a common prefix ("Dionysios Solomos Square A/C/D"),
  or that sit on the same square across feeds, become one station with a canonical name.
  The same rule resolves the ~344 IDs that collide across operator feeds, and it applies
  island-wide: Larnaca and Limassol terminals have the same bay-splitting.
- The planner searches at station level: standing at Solomos Square means every route
  departing from *any* bay of that station is directly boardable, with an in-station
  transfer cost measured once (bay-to-bay walk, from real geometry) instead of treated
  as a street walk.
- A change *within* one station is not a "change" in the interchange sense — it stays a
  short platform hop, so a genuine cross-platform connection is still allowed and priced
  honestly, while a bogus "ride 13 halfway to catch 19" can no longer beat simply
  boarding 19 at the next bay.
- Station membership is derived and cached alongside the GTFS bundle, with a printed
  report so we can eyeball which stops merged before it ships — no hidden magic.

**5. Prove it on real journeys, not synthetic fixtures.**
A regression suite of named Cyprus journeys (Solomos→Kominino, Kostaki Pantelidi→Isaakiou
Komninou, Nicosia→Larnaca airport, plus cross-city and late-evening cases) asserting
properties — "no option is dominated by a strictly faster and simpler one", "every
returned option is physically boardable at the stated time", "no itinerary contains a
street walk between two bays of the same station" — rather than hardcoding "route 19
must be first".


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
