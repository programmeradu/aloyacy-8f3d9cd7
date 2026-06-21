# Park & Ride + Live Traffic — Scope

Turn a static "drive to the edge, take the bus in" suggestion into a **live, defensible recommendation** that only fires when the traffic data says the city drive is actually painful.

## What ships

A new suggestion card on `/trips`, alongside Nextbike / Bolt / Kapnos:

> **Park & Ride saves you ~18 min right now**
> Drive to **Latsia P+R** (12 min, normally 7 — heavy traffic on A1) → Route 158 to city centre (14 min)
> vs. driving all the way in: 38 min (jammed)
> *Why we're suggesting this: A1 inbound is in the red on Google traffic right now.*
> [Open in Google Maps] [See bus times]

Only appears when there's measurable benefit. Stays silent otherwise — no noise.

## Where the intelligence comes from

**Traffic source: Google Routes API** (already on our roadmap, already wired through the Google Maps Platform connector). Two calls per eligible trip:

1. `computeRoutes` origin → city destination, `routingPreference: TRAFFIC_AWARE_OPTIMAL` → "all-the-way drive" duration with live traffic.
2. `computeRoutes` origin → nearest P+R lot, same mode → "drive leg only" duration with live traffic.

Then add the known bus leg duration from our GTFS (P+R stop → destination, next departure). Compare totals.

No Waze. Not viable on a consumer app — confirmed in prior message.

## When the card fires

Hard gates (all must be true):
- Destination is inside one of the city cores we tag as **traffic-prone** (Nicosia centre, Limassol centre — start there; expand later).
- Origin is **outside** that core (otherwise P+R is nonsense).
- A P+R lot exists between origin and destination (within a 3km corridor of the driving route, geographically "on the way").
- Time of day is plausible: 06:30–10:30 or 15:00–19:30 weekdays, or any time the live drive duration exceeds free-flow by ≥30%.
- `(drive-to-P+R + walk + bus + walk)` ≤ `direct-drive − 8 min`. 8-minute floor prevents marginal suggestions.
- Next bus from the P+R is within 20 min (else the wait kills the win).

If any gate fails → no card. Silence is a feature.

## Data we need to add

- **P+R lot registry** (`src/data/park-ride.ts`): hand-curated list. Realistic Cyprus set to start:
  - Latsia P+R (Nicosia)
  - GSP Stadium area (Nicosia)
  - Limassol Linear Park / Mouttagiaka edges (verify)
  Each entry: name (en/el), lat/lon, capacity, nearest GTFS stop_id, served routes.
  *Curated manually — there is no national P+R registry. ~5–8 lots covers the real demand.*
- **Traffic-prone city polygons** (`src/data/traffic-zones.ts`): rough bboxes for Nicosia + Limassol cores.

## Server function

`src/lib/park-ride.functions.ts` — `suggestParkRide({ origin, destination, departAt })`:

1. Gate by city polygon + corridor geometry (cheap, local).
2. Pick candidate P+R (closest one on-route).
3. Two Google Routes calls in parallel via the connector gateway (`routes/directions/v2:computeRoutes`).
4. Look up next bus from P+R stop using our existing realtime helper.
5. Return `{ candidate, directDriveMin, viaParkRideMin, savingsMin, trafficSeverity, nextBus, reason }` or `null`.

Cache key: `${pnrId}:${minute-bucket}` for 60s — traffic shifts that fast.

## UI

`src/components/ParkRideCard.tsx`. Same visual language as Bolt/Kapnos cards. Three-step itinerary (drive → park → bus). Prominent **"why"** line citing the live traffic delta ("A1 inbound 18 min slower than usual"). Deep links: Google Maps for the drive leg, internal `/stops/{id}` for the bus leg.

## Bilingual

`pnr.*` namespace in `en.ts` / `el.ts`. Strings: title, savings line, traffic reason, walk/wait labels, CTAs, capacity warning.

## Out of scope (deliberately)

- Live parking availability at the lot. No feed exists for Cyprus lots. Show static capacity + "usually has space" / "fills by 09:00" annotations.
- Hazard/incident overlay on the map. Routes API gives us duration-in-traffic — that's the only signal we actually act on. Surfacing raw incidents is noise without a map.
- Limassol/Paphos before we validate Nicosia. Ship Nicosia-only, measure, then expand.

## Risk / cost

- **Google Routes is paid**: ~$5 / 1000 calls. Gated by polygon + time window, two calls per qualifying trip, cached 60s → realistically <50k calls/month at our scale. ~$0.25/mo. Negligible.
- **P+R lot accuracy**: lots get reconfigured. Note the curation date in the data file; treat as 6-month maintenance item.

## Build order

1. Curate `park-ride.ts` + `traffic-zones.ts` (data only).
2. `park-ride.functions.ts` with Google Routes calls through the connector gateway.
3. `ParkRideCard.tsx` + bilingual strings.
4. Wire into `src/routes/trips.tsx` alongside the other Wave 3 cards.
5. Verify against real Nicosia A1 rush-hour traffic before declaring done.

Roughly a day of focused work. Lower effort than Kapnos, higher trust payoff than EV chargers.
