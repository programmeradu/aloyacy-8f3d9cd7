# Aloya — Truth, Decision & OS Plan

Aloya is not a better bus app. Aloya is the **clearing house for movement
in the Republic of Cyprus** — the way JCC (and now Viva) cleared payments.

The citizen app is how people feel it. The fused truth engine is how we
know. The API / SDK / embed is how operators, hotels, municipalities and
the state plug in. Motion remains the card. We remain the truth.

This document is the working plan. It replaces the earlier rider-only
Truth & Decision draft. Ground rule for every workstream:

> **No claim ships without the measurement that proves it, and no
> measurement lives only in an admin page.** If we can prove it, a rider
> can see it. If a partner can see it, it is the same number the rider
> sees.

---

## Doctrine

Four layers. A bus app lives in row 1. An OS owns at least two of 2–4,
with row 1 as proof and distribution.

| Layer | Payments analogue | Mobility analogue | Aloya today |
| ----- | ----------------- | ----------------- | ----------- |
| 1. Demand | Viva app | Rider / tourist / hotel “how do I go” | Strongest asset. Citizen app, web + Expo. |
| 2. Truth | Fraud, clearing files | Fused ETA, ghost, reliability, occupancy, skip, stop condition | Started. Classifier + sightings + delay model. Not yet a product others buy. |
| 3. Switch | JCC / Viva acquiring | One API every operator, Bolt, Nextbike, Kapnos, taxi, P&R, EV, kiosk speaks | Not ours. We *consume* GTFS, CyNAP, Google, JCC, Kapnos. |
| 4. Settlement | Card scheme | Fare media, top-up, employer budgets, operator share | Motion + JCC. We proxy their portal. We do not clear a ride. |

**Sequence: lock demand → own truth → become the default channel → then
settlement.** Do not skip steps. Do not fight Motion. Sit on it the way
Apple Pay sits on Visa.

### Sentences we run the company on

1. **Motion stays the card. We stay the truth.** No “one fare”, no
   in-app tap-to-pay, no iOS Wallet pass, until there is a contract and
   a working path — not a JCC scrape and not a stub.
2. **Same number everywhere.** Rider, widget, API, marketing board. If
   those can disagree, the OS does not exist.
3. **If we don’t know, we say we don’t know — and we say what to do
   instead.** Ghost is not a badge. Ghost is a decision.
4. **Name the Green Line.** We do not operate north. We do not pretend
   the crossing is not a movement. “Famagusta” in this product is the
   Republic catchment (Paralimni / Deryneia), and we say so.
5. **Pro cannot claim priority refresh** while everyone polls at 20 s.
   Paywall copy is a trust surface.
6. **Citizen-first, even at horizon 5.** A partner request that hurts a
   rider’s number is a partner we refuse.

### What this is not

- Not a dispatcher. We do not operate vehicles. We do not put levers
  in anyone’s console that move a bus.
- Not a new fare scheme. Motion is the national instrument.
- Not Malta, Crete, or a 2028 “mobility OS” slide. Cyprus first,
  measured, then the Mediterranean islands that share the same GTFS-RT
  gap.
- Not sixteen mode cards on a home screen. Modes that are deep-links
  stay labelled as deep-links until they are first-class legs.

---

## Surfaces vs rails — do we build a command center?

**No. We do not build a mobility command center.**

A command center is what you build when you *dispatch*. Uber has one
because Uber runs the vehicles. A Cyprus command center with levers
would look like a threat to OSEL, EMEL, Intercity and the Ministry, and
it would turn us into a SaaS analytics company that happens to have a
rider app. That is the opposite of JCC.

The OS is **APIs + the truth engine + the citizen app + thin embeds**.
Dashboards are how we *watch* the OS, not how Cyprus *uses* it.

What we do build, and when:

| Surface | Who it’s for | When | What it is |
| ------- | ------------ | ---- | ---------- |
| Citizen app (web + Expo) | Riders, tourists | Now | Demand. The proof. |
| `/accuracy` | Public | After the ledger has N samples | Brand. Measured MAE, band coverage, beat-the-operator. `noindex` until then. |
| Operator report card | Ministry, operators, press | After A3 has a quarter of data | Promised vs actual, per agency, n and source mix. A page and a PDF. No levers. |
| Truth API (`/api/v1/truth`) | Hotels, kiosks, other apps, CyNAP | When A1/A2 are writing and one design partner is waiting | The switch. Auth keys, rate limits, SLA. Same classifier as the rider. |
| Embed / widget | Hotel concierge, airport screen, municipality pole | With the first API customer | A surface that shows the *same* number. Not a login. |
| Partner waitlist | Organisations | Now | Landing on `aloya.cy/partners`. Form posts to `app.aloya.cy/api/public/partners/apply`. Not keys, not usage, not a console. |
| Partner portal | Paying API customers | When a customer asks for keys and invoices | Read-only: keys, usage, the report card. **On `app.aloya.cy`. Analytics, never levers.** |

| Internal SRE | Us | Now, keep it thin | `/api/public/health`, `/api/public/metrics`, structured logs, Sentry, nightly accuracy regression. A panel inside `/qa` if an alert needs a chart. Not a product. |

Frozen, still: Bedrock cost dashboards, the SEO admin console, funding-doc
surfaces. Every extra surface is another place the trust story can
break.

Viva has a merchant dashboard because merchants must see settlements.
Our analogue is a **thin partner portal after someone is paying for the
feed** — not a Bloomberg terminal for buses.

---

## Phase 0 — Prerequisites (do first, before any new claim)

Several items in the previous draft are already wrong against HEAD.
This table is the current one.

| # | Item | Status at plan rewrite | Why |
| - | ---- | ---------------------- | --- |
| 0.1 | **Rotate the leaked keys.** Service-role JWT is off `vars`. Scanner covers `*.jsonc` and root `wrangler.jsonc`. Rotated service-role + anon + `CRON_SECRET` put on `aloya-pulse-cron` (2026-08-28). Git history still has the old JWT. | **Done.** | — |
| 0.2 | Dead confidence branch in `packages/core/src/freshness.ts`. | **Done.** Live tier is `samples >= 10 ? high : >= 4 ? medium : low`. Do not re-open. | — |
| 0.3 | Retention: `rt_snapshots` deleted after 30 min, `observed_arrivals` after 2 days. | **Open, but see 0.4.** | Workstream A needs durable history. Raw rows should not be the durable copy. |
| 0.4 | Archive / data lake. | **Auth + order + checked DELETE done.** Archive-on-ingest, partitions, longer live window still open (target architecture below). | |
| 0.5 | **Stamp `hour_of_day` in `Asia/Nicosia`, not UTC.** `cyHourDow()` in `@aloya/core/cy-time`. Snapshot, learning, eta-stats, rollups, signals, planner-learning, suggestions, nl-suggestions. Kapnos/airport UTC API strings and today-brief hash left alone. | **Done.** | Blocks a confident, wrong `/accuracy` page. |
| 0.6 | **Ghost cutoff must be agency-aware in one place.** `tagGhostTripIds()` reads `thresholdsFor(agency).ghost`. Urban 180 s / IC 300 s. | **Done.** | Same-number rule. |

### 0.4 remaining bugs (auth / paging / delete — done in this slice)

`archiveLakeDirect()` and `archive-lake.ts` now:

- Auth `fetch()` **before** `?group=archive`. Unset `CRON_SECRET` is a deny.
- Ordered pagination (`time, trip_id, stop_id`).
- DELETE of exactly the archived rows; response checked; id-less `observed_arrivals` uses composite keys. No catch-all time wipe.

Still open: archive-on-ingest, partitions, longer live window — see target architecture.

### 0.4 target architecture

The disk fills because raw per-minute rows live in Postgres at all.
Invert it:

1. **Archive on the way in, not on the way out.** The snapshot handler
   already has the payload in memory — write the raw JSONL to R2 in the
   same request, then insert only what Postgres needs to serve queries.
   R2 becomes the complete history by construction, with no race against
   a TTL.
2. **Keep only aggregates in Postgres.** `delay_stats`, `segment_speeds`,
   `dwell_observations`, `headway_observations`, `eta_accuracy` are
   bounded by (route × stop × hour × dow). They do not grow with time.
   Raw `rt_snapshots` should never have been the durable copy.
3. **Partition, then `DROP`, never `DELETE`.** Daily partitions on the
   raw and ledger tables; ageing out is a `DROP TABLE` (instant,
   reclaims disk). Repeated bulk `DELETE`s leave dead tuples and index
   bloat. Check `pg_stat_user_tables.n_dead_tup` and table vs. index
   size before assuming volume alone is the cause.
4. **Then lengthen the live window.** With raw data in R2 and partitions
   that drop cleanly, the 30-minute cut can become days — which is what
   Workstream A needs for vehicle-crossing interpolation.

---

## Workstream A — Prove the numbers (calibration & public accuracy)

**The core problem.** We render p50/p90 ETA bands and on-time
probabilities, but we never log *what we told the rider*, and we delete
the feed history minutes later. You cannot backtest a prediction you
never recorded. Step one is not a model change. It is a ledger.

This ledger is also the clearing file — the JCC analogue. Without it
there is nothing to sell as Truth.

### A1. Prediction ledger

New table `eta_predictions` — one row per ETA we *render or notify on*
(sampled, not every re-render):

```
id, created_at, trip_id, route_id, stop_id,
horizon_sec
p50_sec, p25_sec, p90_sec
tier                   -- live | rider-confirmed | predicted | ghost | scheduled
confidence             -- high | medium | low
operator_eta_sec       -- what the GTFS-RT tripUpdate claimed
learned_bias_sec, model_version_id, segment_samples, dwell_samples
surface                -- stop card | HUD | multileg | push | promise | api
hour_of_day, day_of_week   -- Asia/Nicosia, never UTC
```

Write path: one `logPrediction()` call inside `src/lib/eta-v2.ts`’s
public entry point, fire-and-forget, batched client →
`/api/public/eta-log` or emitted server-side where the ETA is computed.
Sample aggressively (1 row per trip+stop per 60 s) so volume stays
bounded.

`model_versions` already exists — populate it and stamp every
prediction, so a model change is attributable rather than invisible.

### A2. Actual-arrival resolver

GTFS-RT gives us *predictions*, not truth. `delay_sec` is the
operator’s own claim, so scoring against it only proves we agree with
them. Resolve a real `actual_arrival` per (trip, stop) from strongest
to weakest evidence:

1. **Vehicle-position crossing** — a vehicle ping (or rider fix) inside
   the stop geofence with the trip’s stop sequence advancing past it.
   Interpolate the crossing time between the two straddling pings. Gold
   standard. Independent of the operator’s prediction.
2. **Rider alight/board event** — the companion already knows when a
   rider boards and alights. Timestamped physical observations.
3. **Prediction convergence** — the last prediction before `passed_at`,
   used only when 1 and 2 are unavailable, stored with
   `source='inferred'` so it can be excluded from headline metrics.

New table `arrival_truth (trip_id, stop_id, route_id, service_date,
actual_arrival, source, evidence_strength)`. Every metric below reports
**n and source mix**, so “measured on 12 rider-observed arrivals” never
gets rendered as if it were 12,000.

### A3. Nightly backtest job

A new cron in `workers/pulse-cron` joining `eta_predictions` →
`arrival_truth` and writing `eta_accuracy` aggregates per (route,
stop-band, hour, dow, tier, horizon bucket, model_version). Hours in
`Asia/Nicosia`.

- **MAE / median absolute error**, in seconds and as % of horizon.
- **Bias** (signed mean error) — are we systematically optimistic?
- **Band coverage** — what fraction of actual arrivals fell inside
  p25–p90. Target ≈ 65% for p25–p90 by construction; if we measure 30%,
  the bands are theatre and must widen.
- **Tier truthfulness** — MAE by freshness tier. `live` must beat
  `predicted` must beat `scheduled`. If it doesn’t, the tier labels are
  lying and the thresholds need re-deriving *from this data*, not from
  a guess.
- **Beat-the-operator delta** — our error vs. the operator’s
  `tripUpdate` error on the same arrival. This is the entire commercial
  argument, measured.

### A4. Self-tuning thresholds — *after* A3 has coverage

`URBAN = { fresh: 60, ghost: 180 }` / `INTERCITY = { fresh: 90, ghost:
300 }` stay as fallbacks. Do **not** derive them from ping cadence
until A3 has weeks of measured arrivals. Then: `fresh` = p75 of
inter-ping gaps, `ghost` = p95, per agency (ideally per route), stored
in `model_versions.params`, recomputed weekly.

Same for `MIN_SAMPLES_RATED` and the ±120 s on-time window.

### A5. Ship it to riders (and only then to Google)

- **Public accuracy page `/accuracy`** on the app — per-route: on-time
  %, our MAE vs the operator’s, band coverage, sample counts, last
  updated. No cherry-picking: the routes we are bad at are listed too.
  This page *is* the brand. `noindex` until a route has N samples
  (start at 30 rated, same as reliability).
- **Story page on `aloya.cy/accuracy`** — editorial, linking to the
  live data page. Never restates a number the app won’t back.
- **“Why this number?”** on any ETA — one sheet: source tier, ping age,
  learned bias applied, sample count, measured accuracy for this route
  at this hour. Riders don’t need to read it; they need to know it
  exists.
- **Regression gate** — nightly check that fails loudly (Sentry +
  alert) if band coverage or MAE degrades beyond a threshold vs. the
  trailing 7 days.

**Deliverable of A:** every claim on screen traceable to a row in
`eta_accuracy`, and a public page a competitor cannot copy without
building the same ledger.

---

## Workstream B — Truth without a decision is half the value

Today `ghost` and `scheduled` correctly say “we don’t know”. The
rider’s real question is **“do I keep standing here, or do I do
something else?”**

### B1. Onboard-rider fallback (already half-built)

When the operator feed goes dark on a trip but a rider on board is
streaming fixes, the bus marker and ETA should be driven by those
fixes and labelled `rider-confirmed` — this exists, but it is passive.
Make it deliberate:

- **Ask, don’t wait.** When a trip goes ghost and we know riders are
  on board (`active_trips` for that trip), send those riders a single
  low-friction ping: “Still on the 30? Tap yes — 8 people are waiting
  on it.” One tap upgrades everyone downstream from `ghost` to
  `rider-confirmed`.
- **Reciprocity, made explicit.** Riders who share position see the
  same benefit from others; state it in the UI at the moment of asking.
  This is the only sustainable incentive, and it’s honest. No points,
  badges, or leaderboards.
- **Show the chain.** “Position from a rider on board, 40 s ago” beats
  a generic live dot.

Do **not** widen the ask until Workstream C1 physics checks are on the
write path. Otherwise we amplify spoofed buses.

### B2. Headway mode — probability instead of a blank

When no vehicle exists at all, stop showing only a timetable. Use
`headway_observations` (already populated with observed vs. scheduled
headway and bunching counts, unused on the rider surface) to answer:

> “Buses on route 30 run every ~12 min here on weekday evenings.
> Last one seen 19 min ago. **~70% chance one arrives before 21:05.**”

A survival-curve estimate from observed headways, degrading to the
scheduled headway when samples are thin — and saying which one it used.

### B3. No-show detection, on the surface

`trip_no_shows` exists and is written by `detectNoShows()`. It is not
shown to riders. Wire it: if a scheduled trip has been a no-show N
times in the last 30 days at this hour, say so before the rider waits:

> “This 18:40 didn’t run on 6 of the last 20 weekdays.”

That sentence is worth more than any ETA refinement. Also a named
**last-bus** state: “this is the last 404 tonight — after this it is
Bolt, a taxi, or tomorrow.”

### B4. Wait-or-bail

A single decision component that fires on `ghost` / `scheduled` / high
no-show risk, ranking the rider’s real options with honest numbers:

| Option | Shown as |
| ------ | -------- |
| Keep waiting | expected wait + probability, from B2 |
| Walk it | walking ETA (walk links + pace stats) — often wins in Cyprus city centres |
| Next departure on another route | RAPTOR re-plan from the current stop |
| Bolt / scooter / bikeshare | integrations already exist — surface price and ETA *here*, not in a separate tab |
| Taxi | honest last resort with regulated tariff ±15% and the dispatcher number |

Rule: it recommends **one** action with the reason in a sentence, and
shows the alternatives underneath. It must be willing to say “walk, the
bus isn’t worth it.” An app that sometimes tells you not to use it is
an app people trust.

This is the OS moment at the stop.

### B5. Escalation while waiting

The arrival-promise nudge ladder already exists server-side. Reuse it
for the waiting case: re-evaluate every 60–90 s and push *once* if the
recommendation flips (“the 30 is now 14 min out — the 25 leaves in 3
min from the next stop”).

---

## Workstream C — Crowd layer: trust and cold start

### C1. Physics, not just auth

`/api/public/rider-fix` verifies the device has an active trip — that
stops a random script, not a rider sitting in a car alongside the
route, a GPS with 30 m of multipath, or a spoofing app. Add a
plausibility score computed *before* the fix is folded into the live
position:

- **Snap residual** — distance from the trip’s shape polyline
  (`snapToPolyline`). > ~40 m off-route → reject or heavily downweight.
- **Progress monotonicity** — stop sequence must advance, not jump
  backwards or teleport.
- **Speed sanity** — implied speed vs. the learned segment speed for
  that (route, segment, hour). A car doing 90 km/h on a 30 km/h urban
  segment is not a bus.
- **Dwell signature** — buses stop at stops. A fix stream with no dwell
  at any stop is a car on the same road.
- **Accuracy weighting** — already rejecting > 80 m; also weight by
  accuracy rather than treating a 75 m fix as equal to a 5 m one.

Store the score on `rider_vehicle_fixes` and let fusion weight by it,
rather than a binary accept/reject.

### C2. Corroboration and reputation

- **Two-device agreement** upgrades a trip higher than a single
  reporter; a lone reporter is `rider-confirmed (single source)`.
- **Reputation per device** — a rolling score from how well past fixes
  agreed with `arrival_truth`. High-reputation devices can carry a trip
  alone; new devices need corroboration. Workstream A gives this for
  free.
- **Disagreement is data** — when a rider fix and the operator feed
  contradict, log it to `feed_truth_delta` (the table exists) and, per
  route, learn *who is usually right*. “The operator’s feed on route X
  runs 4 min optimistic” is a unique asset, and a line in the operator
  report card.

### C3. Cold start

Nobody reports on the routes with no data — which are the routes that
need it.

1. **Ask at the right moment.** Not “please contribute” — a single tap
   when the rider is already in the companion, on a trip we know is
   dark: “you’re the only eyes on this bus right now.”
2. **Coverage honesty.** A map/list of where crowd data actually
   exists, so riders see the gaps. Also stops us implying island-wide
   truth we don’t have.
3. **Seed the sparse routes deliberately.** Rank routes by
   (ridership × data darkness) and target those in-app.

Explicitly **not** doing: points, badges, leaderboards. They attract
the wrong reports. The incentive is “you get better ETAs because
others did the same”, stated in one sentence at the moment of the ask.

---

## Workstream D — Ground truth that isn’t an ETA (the real moat)

Nobody has this data for Cyprus. It’s cheap to collect, expensive to
copy, and it decides whether a journey is actually usable.

### D1. Stop condition model

New tables `stop_attributes` (current consensus per stop) and
`stop_reports` (individual rider reports, append-only):

| Attribute | Values | Why it matters |
| --------- | ------ | -------------- |
| `has_shelter` | yes / no | 38 °C in July decides whether you take the bus |
| `has_sign` / `has_timetable` | yes / no / wrong | many stops are an unmarked pole |
| `has_seating` | yes / no | elderly and disabled riders |
| `lighting` | good / poor / none | evening usability, especially for women |
| `reachable_on_foot` | yes / no crossing / no sidewalk | **the big one in Cyprus** |
| `wheelchair_access` | yes / partial / no | kerb, ramp, surface |
| `stop_is_ambiguous` | flag + photo | two poles 50 m apart |
| `photo` | image | one photo answers all of the above |

`src/data/stop-amenities.ts` is a handful of curated Nicosia hubs.
Replace it with this model; keep the seed as the first consensus rows.
`lowFloor` in accessibility prefs is stored and unused — wire it once
D1 has enough stops, as a **filter** for those riders, not a 60 s
nudge.

Photos are a second slice. One-tap attributes first. A moderation
queue is ops; don’t block D1 on it.

### D2. Skipped-stop detection — measured, not just reported

Drivers skipping stops is reportable *and* detectable. Signal already
in the traces: a vehicle passing through the stop geofence without a
dwell, on a trip where a rider was waiting. Cross-reference:

- rider reports (“it drove past me”),
- vehicle traces with no dwell at that stop,
- boarding events that never happened at a stop with a waiting rider.

Produce a per-(stop, route, hour) **skip rate**, and surface it where
it changes a decision: *“Buses skip this stop about 1 in 5 evenings —
wave clearly, or use Stop X 200 m north.”* Then feed skip rate into
routing so the planner stops recommending a stop that gets skipped.

### D3. Walkability truth in the planner

`reachable_on_foot` should change routing. A transfer that requires
crossing a 4-lane road with no crossing is not a 3-minute transfer.
Feed stop reachability and the existing `walk_links` / `walk_pace_stats`
into the RAPTOR walk cost, and let accessibility prefs hard-exclude
unreachable stops.

### D4. Report quality

- One-tap, contextual, at most one ask per journey — asked *at* the
  stop, where the answer is free.
- Consensus with decay: attributes expire (a shelter can be removed);
  show “confirmed by 4 riders, last 12 days ago”.
- Photo reports carry more weight, when we have them.
- Flagged/contradictory reports go to the existing admin surface, not
  a new product.

### D5. Make it public

A per-stop page showing condition, photos, skip rate and reliability
is both the most useful page in the app and the most linkable. Index
only once it has real content (see E2).

---

## Workstream E — Two repos, one vocabulary

Marketing (`aloya.cy`, repo `aloyaexplorer`) is a content/SEO layer
with a live-data garnish. The rider app (`app.aloya.cy`, this repo) is
the product. The problems are not “missing SEO”. They are **the two
sites disagreeing**, which is fatal for a brand whose whole claim is
truth.

### E0. Fix the contradictions first (blocking)

1. **Marketing departure boards are not connected to the app.**
   `aloyaexplorer/src/lib/transit/schedule.ts` states “Cyprus has no
   public GTFS-Realtime feed” and computes next departures from
   `gen()` frequency tables, while this repo ingests a real GTFS-RT
   feed every minute through `workers/gtfs-relay`. The surface that
   *sells* truth is the least truthful one we run. Marketing must
   consume `/api/public/*` (cached at the edge) and fall back to a
   static timetable *labelled as scheduled*, using the same freshness
   vocabulary.
2. **Duplicate content.** `/guide/getting-around-cyprus` exists in
   both repos. Home is marketing; 301 the app copy.
3. **Broken hreflang.** The guide declares `en`, `el` and `x-default`
   all pointing at the same URL. There is no separately addressable
   Greek URL, so Greek content cannot rank. Real locale paths
   (`/el/...`) with reciprocal alternates. Do this before any other
   language.
4. **One vocabulary.** Tier names, confidence wording and accuracy
   claims come from `packages/core` (or a tiny published `@aloya/truth`
   the explorer can import). Marketing can never claim something the
   app won’t back up. Process (“pair of PRs”) does not beat a shared
   module.
5. **Line and fare collisions on marketing** (425 vs 618, 64 vs 615,
   €1.50 vs the Aug 2026 Motion €1.80, Intercity Greek name inverted
   to Ενδοαστικά). Fix against the app’s GTFS, not against memory.
6. **Drop “ferry”, “one fare”, “±90s”, “15-second live ETAs”** from
   marketing until the app defends them. Ferry is a future vertical.
   One fare is Motion’s job, not ours, until a contract exists.

### E1. Domain split

| | `aloya.cy` (marketing) | `app.aloya.cy` (app) |
| - | ---------------------- | -------------------- |
| Owns | brand, comparisons, operators, fares, guides, journey pages, the `/accuracy` *story*, blog, **`/partners` waitlist** | live data, per-stop and per-route data pages, planner, `/accuracy` *data*, **`/api/public/partners/apply`**, later keys/usage for paying API customers |
| Indexed | yes, aggressively | selectively — only pages with real content |
| Rule | never contradicts the app; live data is fetched, not re-modelled | canonical for anything that changes minute to minute |

**B2B page placement.** The waitlist landing is marketing. The apply endpoint is the app (it writes to the ledger DB). An authenticated partner console is **not** built until there is a Truth API and a paying customer. Do not put live data pages on `aloya.cy`. Do not put SEO journey pages on `app.aloya.cy`.


Journey pages (`/routes/larnaca-airport-to-nicosia`) stay on marketing.
The app does **not** grow a competing set; it exposes the API those
pages consume.

### E2. Programmatic pages worth indexing

Only ship a page type once it has real content. `noindex` until N
samples. Canonical + hreflang on all of them. Shared sitemap index so
the two domains are crawled as one estate.

| Page | Where | Content that makes it non-thin |
| ---- | ----- | ------------------------------ |
| `/stop/{id}` | app | Name, routes, next departures, **measured reliability**, shelter/sign/access, skip rate. Index only if at least one of: rated reliability, skip rate, or a confirmed attribute. |
| `/route/{id}` | app | Timetable, on-time %, our accuracy vs the operator, busiest hours, bunching, map. Index only if rated. |
| `/routes/{from}-to-{to}` | marketing | Already exists — upgrade with live data and measured reliability via the API. |
| `/accuracy` | both | Data page on the app, story page on marketing. |

### E3. Structured data

`BusStop` / `BusTrip` / `Schedule` / `FAQPage` JSON-LD. Marketing
already does `BreadcrumbList`. Transit schema is under-used and Cyprus
competition for it is nil.

### E4. Languages

`en` + `el` in both repos, and the `el` half isn’t separately
addressable. **Fix routing first. Then stop.** Further locales (ru, uk,
tr, pl, de) are not the OS and are not on this plan. Revisit only after
`/el/` ranks and the ledger is public.

### E5. The asset nobody can copy

The strongest SEO is being the only source of *measured* Cyprus transit
data. `/accuracy`, per-stop condition, skip rates. Publish the
aggregates openly (with attribution). Backlinks follow. This is also
the sales deck for Workstream F.

### E6. Keeping the two repos in sync

Trust copy lives in `packages/core`. A change that alters a
rider-facing claim is not done until marketing imports it or fetches
it. Checklist item in `CONTRIBUTING.md`.

---

## Workstream F — Aloya Truth as a product (the switch)

This is the missing JCC layer. Same classifier the rider sees, sold as
a feed. Do not wait for a 2027 “Routing / Reliability / Places API”
horizon. One endpoint, one widget, one PDF.

### F1. Versioned public API

`/api/v1/truth/...` — vehicle, ETA band, tier, ping age, reliability,
disruption, sample n, model version, source mix.

- Auth key per consumer. Rate limit. SLA once a customer exists.
- Zod at the boundary, same as every public route.
- `surface = 'api'` on every prediction it logs, so we know when the
  API is the thing being scored.
- Not Lovable MCP. Not an unversioned `createServerFn`.

### F2. Operator report card

Promised vs actual, per agency, per quarter. n and source mix
(vehicle-cross vs rider vs inferred). No opinion. How we sit with the
Ministry without looking like a threat: *we are not taking your buses;
we are showing what they did.*

A page and a downloadable PDF. Not a dashboard with filters for
dispatchers.

### F3. One embed

A hotel / airport / municipality widget that shows the *same* number.
First design partner — Kapnos, an LCA hotel group, or Nicosia
municipality screens — not a platform. White-label kiosks are a later
consequence of a widget that already works.

### F4. Beat-the-operator is the sales deck

A3’s delta (our MAE vs `tripUpdate` MAE on the same arrival) is what
we walk into the room with. Do not sell “AI”. Sell a measured second.

**F does not start until A1/A2 are writing.** A Truth API that cannot
point at a ledger is another brochure.

---

## Workstream G — The two jobs that create the demand the switch needs

Without G, F has no volume. Without F, G is still just an app.

### G1. Airport door-to-door as a first-class job

LCA and PFO arrivals are the tourist query that pays, and the review
that gets written.

Kapnos live seats vs city bus vs taxi, with luggage, last coach, and
honest total cost (fare + wait + walk). Not a generic RAPTOR from
“Larnaca Airport” to “Limassol”. A dedicated job with a dedicated
surface, deep-linked from the marketing journey pages that already
rank for those queries.

### G2. Boarding truth + last-bus as named states

A sentence on every departure, not an ETA refinement:

- how you pay (Motion tap / cash / exact change),
- whether this driver waits,
- whether this is the last run,
- whether Sunday / holiday / term-time actually applies.

Cash-only coaches that leave on the minute are more believed than a
prettier p50. Intercity quirks already live as editorial copy on
marketing operator pages; they belong on the departure row.

### G3. Green Line, named

One honest screen: this app is the Republic network; crossing is a
different problem; here is what we know (Ledra, hours we have, that we
do not have north-side GTFS). Silence reads as a hole in a Nicosia
product that claims ground truth.

---

## Sequencing

Wall-clock data accumulation dominates A. Start the ledger this week
even if nothing else ships.

| Order | Work | Why here |
| ----- | ---- | -------- |
| 1 | Phase 0 (0.1 keys, 0.4 auth + archive-on-ingest, 0.5 Nicosia hours, 0.6 ghost cutoff) | Security first. Everything else writes data. UTC hours poison A if skipped. |
| 2 | A1 + A2 (ledger + actual-arrival resolver) | Nothing can be measured until these exist. Start the clock. |
| 3 | B3 + B2 (no-show + headway on the surface) | Biggest visible rider gain. Tables we already populate. Independent of A maturing. |
| 4 | E0 (marketing consumes the API, shared vocabulary, hreflang, drop overclaims) | The brochure is currently the least truthful surface. |
| 5 | C1 then B1 (physics checks, then ask onboard riders) | Must not widen crowd trust before plausibility scoring. |
| 6 | G (airport job, boarding/last-bus, Green Line named) | Demand the switch will need. Parallelisable with 5. |
| 7 | A3 + A5 (backtest, then `/accuracy` `noindex` until N) | Runs once the ledger has real history. |
| 8 | B4 + B5 (wait-or-bail, escalation) | Best after B2/B3 and, if ready, D2. |
| 9 | D1 + D2 (stop attributes, skip detection) | Standalone; parallel with 7–8 if there’s capacity. Photos later. |
| 10 | F (Truth API, one embed, first report card) | After A1/A2 are writing and a design partner is waiting. |
| 11 | D3 (walkability in RAPTOR), A4 (self-tune thresholds), partner portal | After the feed has a customer and `/accuracy` is a measured page. |

E2 programmatic pages ride on 7 and 9 — they are not their own track.
E4 extra languages stay off this list.

### First slice (this working session)

1. Humans: rotated the leaked service-role key. Still need `wrangler secret put` on pulse-cron so the worker can archive.
2. Code: auth the archive endpoint; stamp hours in `Asia/Nicosia`; align ghost cutoffs on the classifier constants; land `eta_predictions` + `arrival_truth` schema and the write path so the clock starts; thin `/partners` waitlist on `aloya.cy`.

That is the first day of being a clearing house rather than a nicer timetable.


---

## What we cut, to make room

| Cut | Why |
| --- | --- |
| Bedrock cost dashboards, SEO admin, funding-doc surfaces | Not on the path to “the number is true”. |
| A4 in the same breath as A1 | Automating a guess. Retune after A3. |
| `/accuracy` as a marketing story before the ledger is mature | Empty accuracy is a worse lie than no page. |
| ru / uk / tr / pl / de | `el` is not even a URL yet. |
| Photo moderation as a workstream | One-tap attributes first. |
| Island-wide `/stop/{id}` indexing | Thin pages will tank us. Index only measured stops. |
| A “mobility command center” | We do not dispatch. See Surfaces vs rails. |
| iOS `.pkpass`, in-app Motion tap, “one fare”, ferry as a mode | Stubs and slogans. Do not sell them. |
| Pro “priority data refresh” / “voice the second your bus arrives” as paywall copy | Not evidenced. 20 s poll for everyone. Speech is opt-in, not Pro. |
| Malta / Horizon 5 OS slides as near-term work | Cyprus, measured, first. |

---

## Two-repo rule

This file lives in `aloyacy` (`docs/TRUTH_PLAN.md`) because the ledger,
the classifier and the API live here. Explorer implements E0 against
this contract. A change that alters a rider-facing claim is not done
until both sides agree — preferably because they import the same
module, not because someone remembered to open a second PR. The same
rule covers look and voice: [`docs/TASTE.md`](TASTE.md) is kept
identical in both repos.

---

## Status against HEAD (first slice, 2026-08-28)

Already true in this repo, and why the OS is a credible bet:

- Shared five-tier freshness classifier (`packages/core/src/freshness.ts`).
- GTFS-RT via raw-TCP relay; rider sightings; on-board GPS fusion.
- RAPTOR + live multi-leg + arrival promise + stop-aware alight.
- Kapnos live coaches; Nextbike live docks; DATEX; Pulse ingest.
- Reliability that stays `unknown` below 30 samples.
- Last-mile taxi that refuses to show a haversine guess.
- 1700+ offline tests, Zod at the public boundary, health + metrics.
- Agency-aware ghost cutoff shared by snapshot tag and classifier.
- Delay / speed / dwell / ledger buckets in `Asia/Nicosia`.
- `eta_predictions` + `arrival_truth` schema; stop and home cards sample.
- Inferred A2 resolver (later-stop evidence). Vehicle-cross interpolates
  a geofence entry from persisted pings (`vehicle_pings` + rider fixes).
  Apply `deploy/supabase/sql/20260828_vehicle_pings.sql` on prod.
- Archive `fetch()` is authenticated; deletes are checked and keyed.
- Service-role key is no longer in worker `vars`.
- Ledger tables live on `aloya-prod-5`. Pulse-cron holds the rotated secrets.
- Ledger write path is live (`POST /api/public/eta-log` 200 on `app.aloya.cy`,
  Worker version `b22f738c…`). Waitlist is live at `aloya.cy/partners`.
  Resolve-arrivals is mounted and fail-closed (401 without cron secret).

Not yet true, and why we are still a portal:

- Pulse-cron Observability is on in config, but the cron stream is not
  public (`workers.dev` disabled). Secret-rotation 401s on the minute
  loop still need a `wrangler tail` to confirm.
- Marketing boards are still `gen()` frequency tables.
- No versioned Truth API, no embed, no operator report card.
- Motion is a balance viewer via a JCC CORS proxy.
- Modes around the planner are cards and deep-links.
- Archive-on-ingest and daily partitions are not built.

The doctrine is written. The switch does not exist yet. This plan is
how it gets built, in order, without another brochure.

