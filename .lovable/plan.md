
# Plan — Trustworthy ETAs + a map you can believe

You're right that the Motion app's ETAs lie because it forwards the operator's prediction. The fix is two-pronged: (1) compute our own ETA from where the bus actually is, and (2) make the map so visibly accurate that the number becomes secondary — users just watch the bus.

## Pillar A — A map that tells the truth

Today our buses tween in a straight line between feed pings every ~20s. To make them feel real:

1. **Bus follows the route shape, not a straight line.** We pull the GTFS static `shapes.txt` once (the geographic polyline for every route variant) and cache it server-side. For each vehicle ping, we snap its `lat/lng` onto the nearest point of its trip's shape (`shape_dist_traveled`) and tween along the polyline instead of through buildings. This alone makes the movement look real.

2. **Use the live speed from the feed.** GTFS-RT vehiclePositions include `speed`. We tween at that speed (clamped 0–80 km/h) so a stopped bus stops, a fast bus glides faster. No more uniform 5.5s ease.

3. **Visible stop pauses.** When a vehicle's snapped position is within ~25m of a stop AND its speed is < 2 m/s, we render a small "boarding" pulse at that stop and pause the glide. The bus visibly dwells, then resumes. This is the "users see it stop to pick passengers" behaviour.

4. **Render the upcoming stops as beads on the line.** On the route/trip detail map, draw the route shape with the stops as small dots; the user's stop is highlighted. As the bus passes each one, the dot fills in. This is the "see the bus march toward me" experience.

5. **Freshness halo.** If a vehicle hasn't pinged in > 90s, its bus icon dims and a thin amber ring appears — silently telling the user "this position is dead-reckoned, take it with a grain of salt." No text needed.

## Pillar B — An ETA we compute ourselves

The Motion feed's predicted arrival is what's lying. Replace it with our own number, in this order of trust:

1. **Distance along the route.** Given the snapped vehicle position from Pillar A and the stop's `shape_dist_traveled`, compute remaining metres. Divide by a rolling speed estimate (median of the vehicle's last ~6 pings, fallback to 18 km/h urban / 40 km/h intercity).

2. **Add expected dwell time at intermediate stops.** Count the number of stops between the bus and the user. Add ~20s per stop for urban, ~10s for intercity. This is the single biggest fix versus Motion — they ignore dwell entirely.

3. **Layer in our learned bias** (`predictor.ts` is already half-built and unused). `delay_stats` already accumulates per `route_id / stop_id / hour_of_day / day_of_week`. Once we wire it in, the ETA learns that, e.g., the 259 always runs 4 min late at 5pm on Fridays.

4. **Confidence tier on the UI.** Three honest states, not a fake percentage:
   - **Live** (green) — vehicle pinged < 60s ago, < 5 stops away. Should be within ±90s.
   - **Predicted** (neutral) — vehicle ping is stale or trip is > 5 stops away. ±3–5 min.
   - **Scheduled** (grey) — no live vehicle for this trip. Pure timetable, no learned bias trustworthy.

5. **Smoothing.** Keep a 3-deep ring buffer of the last predictions per (trip, stop) and display the median. Kills second-to-second flicker when one ping is noisy.

## What needs to ship & in what order

**Step 1 — Map truth (highest visible payoff)**
- Add `src/data/shapes.ts` / `trips.ts` ingestion from Cyprus static GTFS (fetched once, cached). Files are a few MB; store server-side in a new `gtfs_shapes` table or as a static asset.
- Extend `gtfs-rt.server.ts` to attach `shapeId` + `snappedDistAlong` to each vehicle in the snapshot.
- Rewrite `AnimatedBus.tick()` in `MapPreview.tsx` to interpolate along the shape's polyline using `snappedDistAlong` and live speed instead of lat/lng lerp.
- Add stop-dwell detection + boarding pulse.

**Step 2 — Honest ETA**
- New `src/lib/eta.ts` that produces `{ etaSec, confidence, source }` from vehicle distance + dwell + learned bias.
- Wire it into `StopCard`, the route page, and trip detail.
- Replace the current `arrivals[0]?.eta` consumer in `routes/index.tsx`.
- Add the freshness/confidence chip to the stop card (one short label, no percentages).

**Step 3 — Accuracy feedback loop**
- Confirm `observed_arrivals` is being written when a vehicle stops at a stop (the table exists but I want to verify it's actually populating).
- Nightly aggregate into `delay_stats` so the learned bias keeps improving.
- Add a hidden `/debug/eta` page that overlays our predicted ETA, the operator's ETA, and the observed actual arrival so we can compare accuracy day over day.

## What I need from you

1. **OK to fetch the Cyprus static GTFS** (`shapes.txt`, `trips.txt`, `stop_times.txt`) once and host it server-side? Without it we can't snap to the route line — this is the single hardest dependency.
2. Confirm I should start with **Step 1 (map truth)** — that's where the user-visible "wow, I can see it" moment lives. Step 2's numbers will be much more trustworthy once Step 1 lands.
3. Anything to cut. The plan is ambitious; I can skip stop-dwell pulses or learned bias if you want to ship faster.
