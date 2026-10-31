
## Layer 32. Crowding

### 32.1 What the best in the world do
- Google Maps ranks occupancy sources in a fixed order: the rider's own feedback first, then the agency's real-time GTFS `occupancy_status`, then Google's own predictions from historical crowdedness and user feedback. It asks riders who have opted in and are detected on a vehicle how crowded it was, and maps the seven GTFS-RT values (EMPTY to NOT_ACCEPTING_PASSENGERS) onto four labels from "Not crowded" to "Very crowded". Agencies may publish only three buckets if that is all their data supports (Google Transit Partners, Provide vehicle occupancy data; Crowdsourced Transit predictions). Google expanded crowdedness predictions to over 10,000 transit agencies in 100 countries in 2021, built from AI, user contributions and historical location trends (Google blog, July 2021).
- Transit built a prediction engine with LA Metro from historical counter data and found its predictions "88% as accurate as real-time crowd counters". Where there are no counters, riders send a one-tap crowding report when they board, shown to riders downstream for 10 minutes. More than half the riders shown the survey answered it. Transit notes automatic passenger counters cost about $8,000 per vehicle (Transit blog, 13 Oct 2020).
- Moovit shows station crowding in four levels and vehicle crowding in three ("Seats available", "Standing only", "Very crowded"), based on rider reports from the last 10 minutes (Moovit help centre, version 5.70).
- TfL exposes an Occupancy endpoint in its Unified API (TfL Unified API portal).

### 32.2 The reality in Cyprus and the data available
- The national GTFS-RT feed carries no crowding data. A live read on 31 Oct 2026 at 19:45 Nicosia time showed 166 vehicles and 268 trip updates, with zero `occupancy_status` and zero `occupancy_percentage` values (direct decode of the feed Aloya uses, gtfs-rt.server.ts).
- Crowding is a real, reported problem, mostly on school routes. In Larnaca the parents' federation reported overcrowded buses, pupils standing "even on motorways" and routes cancelled at the last minute; it said the operator's contract has a clear term requiring each pupil to tap a card on boarding so the system knows who is on board (Reporter / KYPE, 17 Sep 2026). Pupils of the A' Technical School of Nicosia complained of more than 65 pupils on one bus to Geri and Latsia (Larnakaonline, 30 Oct 2025).
- The Audit Office found that 32% of Nicosia stops examined had no shelter and another 22% had neither shelter nor seating, and that some lines run only once an hour or every two hours (Cyprus Mail, 14 Oct 2026). On a low-frequency line, being left behind by a full bus costs an hour, so crowding information matters more in Cyprus than in a high-frequency city.
- Possible data: Motion card validations (taps on boarding) are the cheapest true load signal in Cyprus, but they are held by the operator and the Ministry and are not published. Rider reports and rider phones on board are the only signals Aloya controls.

### 32.3 Aloya today
- `src/lib/crowd.functions.ts` reads `route_load_estimates` for the last 30 minutes and maps `load_index` to quiet, moderate, busy or packed. `CrowdHint.tsx` shows it in the ride HUD and adds a weather clause, and `/api/public/route-load` serves the same to the mobile app.
- **The code check found that nothing writes to `route_load_estimates`.** The table is created in Supabase migration 20260527135631 and in migrations-d1/0001_init.sql, but no code in src, workers, scripts or supabase inserts into it. So CrowdHint is always silent. (The seed said the hint is "usually silent"; in fact it can never speak.)
- Nothing reads GTFS-RT occupancy (no `occupancy_status` anywhere in the repo), so if Motion ever adds it, Aloya will not show it.
- What does exist: `crowd-coverage.server.ts` counts distinct rider phones per line from `rider_vehicle_fixes` and taps, and the Pulse CrowdEyesCard lists lines with rider phones on board. That measures Aloya's own coverage, not how full the bus is.
- No one-tap "how full is it?" report exists in the Roam screens (no crowd copy in roam-i18n.ts).

### 32.4 Improvements
1. **Fix or remove the dead pipeline.** Either write `route_load_estimates` from real signals (items 2 to 4) or delete CrowdHint and the table, so the code does not suggest a feature that does not exist. Effort S. Impact: honesty and less dead code.
2. **One-tap load report on board.** When the alight detector or the companion knows the rider is on a trip, show one question once per trip: "Seats free / Standing / Packed". Store it with trip_id, stop sequence, device reputation weight (device-reputation.ts already exists) and time. Show it downstream for 10 minutes (the Transit and Moovit window) as "Standing room, 1 rider, 4 min ago". Effort M. Impact high, and it creates the data that items 3 and 5 need.
3. **Typical busyness from history.** Aggregate reports by route, direction, hour and day type (school day versus holiday; cyprus-holidays.ts exists) into "usually busy at this hour". Show only when there are enough reports, and say how many. Effort M. Impact medium, growing with use.
4. **Read GTFS-RT occupancy now.** Add `occupancy_status` and `occupancy_percentage` parsing to gtfs-rt.server.ts and give it priority over Aloya's own estimate, as Google does. It costs little and is ready the day Motion publishes it. Effort S. Impact: zero today, high later.
5. **Use crowding in routing.** When the next bus on a low-frequency line is reported packed, the replanner should offer the next good alternative (another line from a nearby stop, a bike or scooter leg, or the following bus) with the real cost in minutes. This is what turns crowding data into the "better stop a few blocks away" behaviour Samuel asked for. Effort M. Impact high.
6. **School-run mode.** For the school routes, where crowding is worst, ask the Ministry for anonymised boarding-tap counts per trip (the contract term the Larnaca parents cited) and offer a parent-facing view: "the 07:10 to Vergina Lyceum has been standing-only on 4 of the last 5 days". Effort L, and needs a data agreement. Impact high for families, and a strong B2G case (Layer 35).
7. **Count left-behind riders.** A rider who was at the stop when the bus passed and is still there 2 minutes later is a strong signal of a full bus (or a skipped stop; skip-report.ts already handles skips). Feed it into item 2's model with a lower weight. Effort M. Impact medium.

### 32.5 Sources
- Google Transit Partners, Provide vehicle occupancy data with GTFS: https://support.google.com/transitpartners/answer/10106342?hl=en
- Google Transit Partners, Crowdsourced Transit predictions: https://support.google.com/transitpartners/answer/9551309?hl=en
- Google blog, Navigate new normals with Google Maps (21 Jul 2021): https://blog.google/products-and-platforms/products/maps/new-normals-with-google-maps/
- Transit blog, Public transit riders are helping one another avoid crowds (13 Oct 2020): https://blog.transitapp.com/public-transit-riders-are-helping-one-another-avoid-crowds-c929a4fe6c7d/
- Moovit help centre, Ver 5.70: https://support.moovitapp.com/hc/en-us/articles/360022062080
- TfL Unified API: https://tops.tfl.gov.uk/
- Reporter / KYPE, Larnaca school buses (17 Sep 2026): https://www.reporter.com.cy/article/1463445/
- Larnakaonline, A' Technical School of Nicosia (30 Oct 2025): https://larnakaonline.com.cy/2025/10/30/a-techniki-scholi-lefkosias-katangelia-mathiton-gia-yperplirotita-se-leoforeio/
- Cyprus Mail, Audit Office report (14 Oct 2026): https://cyprus-mail.com/2026/10/14/63-per-cent-of-passengers-would-not-use-the-bus-again
- Live GTFS-RT decode, 31 Oct 2026 17:45 UTC: http://20.19.98.194:8328/Api/api/gtfs-realtime
- Code: src/lib/crowd.functions.ts, src/components/CrowdHint.tsx, src/routes/api/public/route-load.ts, supabase/migrations/20260527135631_e3cd8308-3981-4fc4-bb09-3fba339fd042.sql, migrations-d1/0001_init.sql, src/lib/crowd-coverage.server.ts, src/components/pulse/CrowdEyesCard.tsx

---
