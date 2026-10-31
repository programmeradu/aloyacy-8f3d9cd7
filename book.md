---
title: "Aloya: moving Cyprus smarter"
subtitle: "A 50-layer research book"
date: "October 2026"
lang: en-GB
---


# Executive summary {#executive-summary}

Aloya is not meant to be a bus app. The brief for this book describes it as a smart mobility platform for Cyprus that brings many partners together, that others can build on, and that serves every urban commuter, with or without a car. Fifty research layers (plus layer 7b) test that vision against three things: what the best services in the world do, what Cyprus actually has in data, law and service, and what the Aloya code on branch redesign-roam does today. Every layer ends with numbered, costed improvements. This summary gives the conclusions; the Urgent fixes page that follows lists what should change this week.

**1. The alert problem Samuel raised is a real bug, and the fix is a rider state, not more timers.** When a trip is started at home, the server sends "Board now", "Pick up the pace" and "Still on BUS X?" from clock arithmetic alone, because it never knows where the rider is. On the phone, walk and wait legs auto-advance to "arrived" with no GPS fix, and every re-upload resets the record of alerts already sent, so alerts can repeat. The cure (Part A) is a small rider state (unknown, walking, at stop, on board, missed) sent by the phone, one shared leave decision that compares walking time at the rider's own pace with the bus's live position, and a question ("Are you at the stop yet?") whenever the state is unknown. That gives exactly the alert Samuel asked for: "You're 10 min from the stop and BUS 16 is 5 min away. You'll miss it at walking pace."

**2. Trust is the product.** Cyprus riders have good reason to doubt bus information: the Audit Office's special report on Nicosia buses (14 Oct 2026) found that 63% of its undercover riders would not choose the bus again and that app and website stop positions were 85 to 135 m off in some cases. Aloya currently adds its own errors: one fare table applied to every town, a transfer window quoted as 90 minutes where CPT's rule is 60, a Limassol timetable that silently ends on 6 Nov 2026, and a crowding hint that can never speak because nothing writes its data. Every ETA and alert needs an honest label (live, estimated or timetable), ghost and stale rules, and an "as of" time (layers 5, 34, 37, 41).

**3. Routing is where Aloya can be genuinely better than Google.** Part B shows that any mode can join any transit leg anywhere in the trip, including the middle, using Nextbike's official GBFS and the 255 Bolt zones on the national access point. The "better stop" idea is large: in Nicosia roughly one served stop in three has a much more frequent stop within 800 m. Published research (IJCAI 2025) found that full dynamic replanning saves 10.6 to 30.2 minutes on the 20% to 66% of trips it changes. Aloya should re-optimise at every phase: before boarding, on the first bus, approaching the change, during it and after it, with an honest probability of making each connection.

**4. The platform vision is blocked by legal and cost risks that are easy to fix.** Part C found that the JCC Smart integration sends riders' JCC passwords through Aloya's server with spoofed browser headers, also from a public endpoint; that the licence files say proprietary while earlier notes said MIT; that 59 public API routes answer anyone with no key, several in front of paid services; that Kapnos data comes from an undocumented booking API; and that the Bolt hand-off earns nothing. None of these needs a large build, and all of them need fixing before any partner conversation.

**5. Data and AI.** Cyprus publishes more open data than most people assume: seven GTFS feeds, a national GTFS-RT feed (166 vehicles in the 31 Oct check, with zero occupancy values and zero service alerts), and CyNAP layers for bus lanes, cycleways, crossings and parking. Part D recommends a nightly feed health job, an AI assistant that uses Cyprus time rules and cheaper providers before it gains tools, heat-aware walking on official Met Department data, Greek names already in the feeds, offline planning, a safety sheet and an operator report card as a first paid product.

**6. Product, growth and quality.** In the live QA pass on 31 Oct 2026 the map did not load on any page, and the basemap in the code is Esri imagery that the code's own comment says is not licensed for production. The native app is the route to reliable background alerts, Live Activities and silent push. The business model that fits the evidence is a free rider app, paid trust and accuracy dashboards for government and operators, employer and university commute programmes, and no raw data sales (Part E).

**7. Can Aloya reduce car dependence? Honestly: a little on its own, much more as an evidence engine.** Cyprus has 670 passenger cars per 1,000 people (2025, provisional) and 85% of adults never use public transport, the highest share in the EU. International evidence says better information and apps move ridership by low single-digit percentages. Frequency, bus priority, parking pricing, land use and employer action decide the rest, and those sit with the state, municipalities, operators and employers. Aloya's strongest lever is what it can make visible: verified data on where the bus system fails, turned into advocacy, government insight and employer programmes, with the 2030 Nicosia bus contract as the key window (Part F and the verdict chapter).

**What to do first.** Ship the alert hotfix; correct fares before 5 Nov 2026; catch the EMEL feed horizon before 6 Nov; switch off the JCC password proxy; put keys and quotas on the public API; fix the map with a licensed basemap; settle the licence. Then build the rider state and leave decision, the better-stop card, multimodal legs and connection probability, and the native companion. The roadmap chapter merges every part's recommendations into Now, Next and Later; the QA programme turns the 90-scenario catalogue into a release gate.

**How to read this book.** Code references point at repo programmeradu/aloyacy-8f3d9cd7, branch redesign-roam, read at commits 1508f3f (Parts A and C), 5d818e8 and 56dab8f (Parts B and D), and through the GitHub API for Part E, all on 31 Oct 2026. Facts carried over from earlier research runs without re-checking are marked as such ("earlier research pass"), as are claims that could not be verified and inferences. Effort is S (days), M (weeks) or L (a month or more); the exact scale used by each part is stated at its start. All web sources are collected in one deduplicated list at the end, numbered; Part B's bracketed citation numbers point into that list.

# Urgent fixes {#urgent-fixes}

These ten problems are either live bugs that riders see, legal or cost risks, or deadlines that fall in the next week. Each is detailed in the layer named.

<div class="urgent">

| # | Problem | Where it is | Fix | Layer |
|---|---|---|---|---|
| 1 | **Alerts fire as if a rider who starts at home is already at the stop.** trip-alerts.ts decides every alert from the clock alone ("Board now", "Pick up the pace", "Still on BUS X?", leave-by from a frozen walk time). multileg-journey.ts auto-advances walk and wait legs to "arrived" after planned time plus 120 s with no GPS fix and then emits "at-stop" alerts. Every setActiveTrip re-upload resets alerts_sent to an empty list, so sent alerts can fire again, and server and phone use different tags, so one alert can appear twice. | src/routes/api/public/trip-alerts.ts; packages/core/src/multileg-journey.ts lines 347 to 353 and 409 to 430; src/lib/trip-sync.functions.ts line 51 | Suppress clock-only alerts until a fresh rider state supports them; remove the no-fix auto-advance or make it silent; keep alerts_sent across re-uploads; one tag scheme. Then add rider state and the shared leave decision. | 1, 4, 7b |
| 2 | **Wrong fares for Limassol, Paphos and Famagusta.** boarding-pay.ts applies the Nicosia and Larnaca table (€2.00 Motion or €2.70 cash by day, €3.50 or €4.70 at night) to all five urban operators. Limassol cash is €2.00 today and night €3.00; Paphos cash €2.00 and night €3.00. Famagusta (OSEA) is unverified. | packages/core/src/boarding-pay.ts | Per-operator fare table with effective dates, a unit test per operator and a "checked on" date. | 37 |
| 3 | **EMEL cash fare becomes €2.50 on 5 Nov 2026** (e-wallet stays €2.00; night becomes €4.00). | Same fare table | Add the 5 Nov 2026 EMEL row before that date. Also correct intercity (€4 to €10 in the feed, not "€5 to €8, cash only") and taxi constants (official tariff €3.80 and €0.95 by day, €4.80 and €1.10 at night). | 37 |
| 4 | **Transfer copy says 90 minutes; CPT's rule is 60.** The aloya.cy Motion card page says transfers are free "for 90 minutes"; CPT allows at most €2.00 for two transfers within 60 minutes. | aloya.cy Motion card page | Correct the public copy to 60 minutes, and note that rules differ by operator. | 24, 37 |
| 5 | **The EMEL (Limassol) GTFS feed only runs to 6 Nov 2026**, although its feed_info.txt claims an end date of 28 Jan 2027. Any Limassol trip planned for 7 Nov or later finds no buses. | Static GTFS from motionbuscard.org.cy | Nightly feed health job that checks each feed's real service-date horizon, runs the MobilityData validator, ingests after Motion's 05:31 publish and warns riders when a feed runs out. | 15, 34 |
| 6 | **JCC password login.** jcc.functions.ts sends the rider's JCC Smart email and password from Aloya's server to apihub.jcc.com.cy with spoofed origin, referer and user agent; wallet.ts repeats it as a public, unauthenticated CORS endpoint. No JCC agreement is recorded. | src/lib/jcc.functions.ts; src/routes/api/public/wallet.ts | Turn off the public wallet endpoint first, then the password proxy; keep a manual balance mode; ask the Ministry and JCC for read-only partner access. | 24 |
| 7 | **59 open public API routes with no keys.** Of 63 route files under src/routes/api/public (excluding cron hooks and Open Graph images), 59 send `Access-Control-Allow-Origin: *` and none needs a key; paid upstreams (Mapbox Search Box, ElevenLabs, OpenAI, Gemini) sit behind some. | src/routes/api/public/* | API keys, per-key and per-IP quotas, restricted CORS, and budget caps on the paid providers. | 25 |
| 8 | **The crowding table has no writer.** route_load_estimates is created in the migrations but nothing in src, workers, scripts or supabase inserts into it, so CrowdHint can never speak. | src/lib/crowd.functions.ts; CrowdHint.tsx; /api/public/route-load | Either remove CrowdHint and the table, or feed it from rider reports and GTFS-RT occupancy when Motion publishes it. | 32 |
| 9 | **Unlicensed Esri basemap, and the map fails in QA.** src/lib/basemap.ts ships Esri World Imagery, which its own comment says is "NOT licensed for production use without an Esri/ArcGIS agreement". In the 31 Oct live pass the map did not load on any page that embeds one, and "Try again" did not recover (root cause not confirmed from the UI). | src/lib/basemap.ts | Switch to the licensed Mapbox or MapTiler style already configured (or sign an Esri agreement), keep attribution, and add map regression tests (QA scenarios 65 and 66). | 39, 48, 50 |
| 10 | **Licence mismatch.** LICENSE, README.md and COMMERCIAL.md all say proprietary, while earlier notes recorded the project as MIT and the repo as made public (from memory notes, unverified). | LICENSE; README.md; COMMERCIAL.md | Decide one licence (Part C recommends: code proprietary, open data outputs under CC BY 4.0, the API under written terms) and make all three files agree. | 25, 48 |

</div>


# Part A: Smart alerts and the in-trip companion (layers 1 to 10, plus 7b)

Aloya 50-layer smart mobility research. Part A covers what the rider experiences from the moment they decide to travel until they step off the last vehicle: when to leave, how fast they walk, what the phone can do in the background, which notifications fire, how far the live bus data can be trusted, what happens when things go wrong, getting off at the right stop, re-optimising across transfers, the lock screen and watch, accessibility and privacy.

Code references point at repo programmeradu/aloyacy-8f3d9cd7, branch redesign-roam, commit 1508f3f (checked 31 Oct 2026). Earlier runs cited commits 5d818e8a and 56dab8f2; every reference below was re-checked at 1508f3f and line numbers updated where they had moved.

## The bug Samuel raised, in one paragraph

When a trip is started at home, Aloya's server sends alerts that assume the rider is already at the stop, because the server never knows where the rider is. The trip-alerts job (src/routes/api/public/trip-alerts.ts, run every minute by workers/pulse-cron/src/jobs.ts line 25) decides every alert from clock arithmetic alone: "Pick up the pace" when the bus is 30 to 120 seconds away (lines 101 to 104), "BUS X is at the stop. Board now." when the bus is within 30 seconds of the stop (lines 106 to 109), "Still on BUS X?" once the scheduled boarding time passes (lines 117 to 130, via currentRideTripId in src/lib/trip-alerts.server.ts lines 125 to 140), and a leave-by alert based on walk_in_sec frozen at planning time (lines 94 to 99; walkInSec is set in src/lib/trip-store.ts line 163). The active_trips table (supabase/migrations/20260523123133, mirrored in migrations-d1/0001_init.sql) and the upload schema (src/lib/trip-sync.functions.ts lines 17 to 33) carry no rider position, no on-board flag and no missed flag. On the phone, packages/core/src/multileg-journey.ts lines 347 to 349 advance a walk leg to "arrived" when the planned walk time plus 120 seconds has passed even with no GPS fix, and lines 351 to 353 do the same for a wait leg; lines 409 to 430 then emit "at-stop" notifications for the transfer walk and the wait, which src/lib/push.functions.ts lines 186 to 187 render as "You're at <stop>. Wait near the curb." Every call to setActiveTrip re-uploads the trip with alerts_sent reset to an empty list (trip-sync.functions.ts line 51), so alerts already sent can fire again, and the server tags (aloya-board-soon-<trip>, trip-alerts.server.ts lines 54 to 101) differ from the phone's tags (aloya-<kind>, push.functions.ts line 253), so the same alert can appear twice. Fix: the server must stop deciding from the clock alone. It needs a rider state (unknown, walking, at stop, on board, missed) from the phone, it must ask when the state is unknown, and the leave decision must compare walking time against the bus's live position.

## Part A top 10 (in build order)

1. **Hotfix the home-start bug (S).** Stop clock-only "Board now", "Pick up the pace" and "Still on BUS X?" from the server; remove the no-GPS auto-advance and the "at-stop" alerts for transfer walks and waits; keep alerts_sent across re-uploads; one tag scheme for phone and server (layers 1, 4, 7b).
2. **Rider state, not coordinates (M).** The phone sends unknown, walking, at stop, on board or missed, plus rounded distance and walking ETA; the server asks "Are you at the stop yet?" when the state is unknown (layers 1, 10).
3. **One leave decision shared by phone and server (M).** Walking time at the rider's pace against the bus's corrected arrival and its early edge, with states relax, get ready, leave now, run, you'll miss it plus the next option: "You're 10 min away, the bus is 5 min away" (layer 1).
4. **Personal walking pace (S then M).** A pace and mobility profile now, learned pace on the device next; four hard-coded 1.35 m/s constants become one shared default (layers 2, 9).
5. **Honest live data in every alert (S then M).** Ghost and stale rules applied to all alerts, every time labelled live, estimated or timetable, uncertainty bands from Aloya's own backtest, Benchmark-compatible accuracy page (layer 5).
6. **Server push replanning (L).** Detect a miss anywhere (home, walking, stop), re-plan on the two IJCAI triggers, one-tap replan from the notification, CPT detour announcements ingested (layer 6).
7. **Phase-by-phase transfers with connection probability and mid-trip micromobility (L).** "Safe, tight, likely to miss", "get off one stop early and walk or scoot to a faster line", within Cyprus e-scooter law and Bolt's station model (layer 7b).
8. **Get-off alerts by stop count on the server (S).** Port Aloya's own alight-countdown to the server, only after the rider is confirmed on board, with missed-stop recovery (layer 7).
9. **One alert ledger and four tiers (M).** Caps, update in place with Topic and tag, TTL on every push, per-tier user control (layer 4).
10. **Native companion (L).** Fix the Expo build, background location only during trips, real Live Activity and Android Live Update, Wake Lock and Declarative Web Push on the web meanwhile; privacy by design throughout (layers 3, 8, 10).

## Corrections to earlier runs found while re-checking

- Code line numbers re-checked at 1508f3f; the multi-leg auto-advance is at multileg-journey.ts lines 347 to 353 and the transfer "at-stop" emits at lines 409 to 430.
- Retention does exist for crowdsourced rider fixes (purged after 2 days, not sent to the data lake); the remaining gap is abandoned active_trips rows with no time-to-live.
- The Intercity GTFS feed now lists 740 trips (not 799) and 123 stops, all with wheelchair access unknown (GTFS Scorecard, 31 Oct 2026).
- The over-80s walking speed figure (0.94 to 0.97 m/s) and the Ulm step-versus-GPS error figures could not be verified against an open source and are not used; verified figures from FHWA, Asher et al. 2012 and JMIR 2025 are used instead.
- The European Accessibility Act covers bus apps fully for intercity services, but for urban, suburban and regional transport only self-service terminals are in scope (Article 2(2)(c)).

## Layer 1: Location-aware departure alerts ("leave now" that knows where you are)

### 1.1 What the best in the world do

- **Transit (GO).** GO sends "Go in ... minutes" so the rider knows when to start heading to the stop, "Hurry up!" if they might miss the ride, then a stop countdown before the destination. The leave notification is synced to the vehicle's real-time position, and the app suggests alternatives if a connection is missed. Riding with GO also shares the vehicle location anonymously and opt-in with other riders (help.transitapp.com/article/549-how-to-use-go; blog.transitapp.com, New Zealand launch post, 2019; Transit 101 agency booklets 2025 and 2026).
- **Citymapper GO.** Breaks a journey into walk, wait, ride and get-off steps and shows the step that matters now; a "Smart Notification" stays on the lock screen for the trip and the app deliberately avoids unnecessary alerts (citymapper.com/news/517 and /597). Walking guidance reroutes automatically if the rider goes "off-piste" (citymapper.com/news/2553).
- **Google Maps.** Once transit navigation starts, it can remind the rider when to leave, notify when the stop approaches and update the route for delays (howtogeek.com, July 2026). Android's forthcoming Transit mode asks for home and work addresses and "Allow all the time" precise background location so it can send departure updates while the user is still at home or work, and it spends a few weeks learning the commute (Android Authority APK teardown, 20 Jan 2026). The lesson: the market leaders treat "where the rider is now" as the input that makes a departure alert meaningful.
- **Cyprus Public Transport's own Pame app** (relaunched 15 Sep 2026) added trip planning by arrival time, which "calculates when passengers need to leave", plus real-time arrival notifications (Cyprus Mail and CYPRUS FAQ, 15 and 16 Sep 2026). It does not, from public descriptions, compare the rider's live position with the bus.

### 1.2 Cyprus reality and data

- Live bus data comes from one national GTFS-RT feed published by the Public Works Department through the Cyprus National Access Point (traffic4cyprus.org.cy, dataset publictransportrealtime_gtfs_rt). It is described as "estimate timetables ... as derived from the telematics system", with update frequency "Up to 1 min", licence CC BY 4.0.
- The feed goes offline at times; BusCyprus falls back to timetable times during outages (buscyprus.app/gtfs-rt-info).
- Service is sparse on many routes: the Audit Office found some Nicosia routes run only every one or two hours (Special Report 29/2026, reported by Kathimerini, Cyprus Mail and AlphaNews, 14 Oct 2026). On such routes a missed bus costs an hour, so a wrong "relax" is far worse than an early "get ready".
- Stop pins can be wrong: the Audit Office documented stops 85 m and 135 m away from where apps showed them (Politis English, 14 Oct 2026). A walking time computed to a wrong pin is wrong by one to two minutes before any other error.

### 1.3 Aloya today, and its gaps

- The server decides alerts from timestamps only (see the bug paragraph above). It never learns whether the rider has left home.
- The leave-by alert (trip-alerts.ts lines 94 to 99) uses walk_in_sec, fixed when the trip was planned (trip-store.ts line 163). If the rider starts the trip 10 minutes early at home, or is already halfway to the stop, the alert still fires at the same clock time.
- "Pick up the pace" (lines 101 to 104) fires for everyone when the bus is 30 to 120 s away, whether the rider is at the stop, on the way or still at home.
- "Board now" (lines 106 to 109) is sent when the bus is within 30 s of the stop, even if the rider is 800 m away.
- The foreground engine packages/core/src/journey-live.ts does use GPS, but only while the app is open: it treats a missing fix as on time and detects a miss only if the rider is still near the stop (line 234 checks distance to the boarding stop under 60 m).
- The Expo native app (mobile/) already contains a working background-location task for group trips (mobile/lib/groupBackgroundLocation.ts uses TaskManager and Location.startLocationUpdatesAsync), so the building block for background-aware alerts exists natively but is not used for solo trips. The last recorded EAS Android build in mobile/build_info.json has status ERRORED (July 2026), so the native app is not a dependable channel yet.

### 1.4 Improvements

1. **Hotfix: stop clock-only alerts (S, very high impact).** In trip-alerts.ts, suppress "at-stop", "hurry-soft" and "still-on-board" unless the row carries a fresh rider state that supports them (step 2). Until then, replace "Board now" with a neutral "BUS X is due at <stop> now" and drop "Pick up the pace" from the server entirely. In multileg-journey.ts, remove the no-fix failsafe advance for walks (lines 347 to 349) and waits (lines 351 to 353), or let it advance the UI silently without emitting "at-stop" from lines 409 to 430.
2. **Rider state, not coordinates (M, very high).** Add `rider_state` (unknown | walking | at_stop | on_board | missed), `state_at` (timestamp), `dist_to_board_m` (rounded to 50 m) and `eta_walk_sec` to active_trips and to the upsert schema. The phone computes these on-device from its GPS and sends them when the state changes or every 60 s while walking (foreground, or background in the native app). The server never needs raw coordinates (see layer 10).
3. **One leave decision shared by phone and server (M, very high).** Implement in packages/core so both sides run identical code:
   - T_walk = remaining route distance to the board stop divided by the rider's learned pace (layer 2), plus a crossing allowance for each signalised crossing on the path.
   - T_bus = corrected predicted arrival at the board stop (layer 5), with its uncertainty band.
   - slack = T_bus(early edge) minus T_walk minus buffer, where buffer grows with the route's measured unreliability and doubles when headway is 60 minutes or more.
   - States: relax (slack over 5 min), get ready (slack 2 to 5 min), leave now (slack 0 to 2 min), run (slack negative but the bus is still catchable at the rider's brisk pace), you'll miss it (not catchable even at brisk pace), each with the next viable option attached.
   - Copy example, exactly the one Samuel asked for: "You're 10 min from the stop and BUS 16 is 5 min away. You'll miss it at walking pace. Next BUS 16 in 22 min, or scoot to <stop> for BUS 22 in 8 min."
4. **Ask, never assume (S, high).** When rider_state is unknown and the alert would depend on it, send one question instead: "Are you at the stop yet?" with actions "Yes", "On my way", "Not leaving yet". Web Push supports notification actions on Chromium; on iOS web push the fallback is opening the app to a one-tap sheet.
5. **Start-from-home awareness (S, high).** When the user taps Start more than 2 minutes before the computed leave time and their position is not near the stop, show "We'll tell you when to leave" and schedule only the leave-now alert. Nothing else fires until rider_state becomes walking or at_stop.
6. **Recompute walking time live (S, high).** Replace the frozen walk_in_sec with eta_walk_sec from the phone each minute while the rider is walking, so the server's leave and hurry logic uses the current figure.
7. **Snap to the real stop (M, medium).** Maintain a corrections table for stop coordinates (start with Audit Office examples and rider reports), and route the walk to the corrected pin and the correct side of the road.
8. **Learn the commute (L, medium).** On-device only, detect repeated trips (same origin cluster, destination and weekday window) and offer a standing "leave now" alert for them, mirroring Android Transit mode's learning period, with explicit consent (layer 10).

## Layer 2: Walking pace (a personal, learned walking speed)

### 2.1 What the best in the world do

- **Citymapper** offers two walking route types, "Fast" (most direct) and "Main roads" (simpler, can be safer), switchable mid-route, with automatic rerouting (citymapper.com/news/2266). Citymapper's routing settings also include "Walk Less" for heat or rain (citymapper.com/news/2589).
- **OpenTripPlanner**, the open-source planner many agencies use, exposes walking speed and walk reluctance as per-request parameters, so a planner can be personalised without changing the network (docs.opentripplanner.org, RouteRequest).
- **Research on measuring a person's pace on a phone.** AutoGait (KAIST, 2010) calibrates an individual's stride length against step frequency using short stretches of GPS-tracked straight walking, then estimates speed from steps alone when GPS is poor (ic.kaist.ac.kr, Cho et al. 2010). A 2025 JMIR study of 99 older adults found smartphone GPS walking speed read 0.18 m/s lower on average than an ankle-band accelerometer, with 95% limits of agreement from minus 0.49 to plus 0.13 m/s, so GPS alone is noisy for pace (formative.jmir.org/2025/1/e73722). A deep-learning smartphone method reached a root mean square error of 0.16 m/s on a treadmill (arXiv 1805.03368).
- **How fast people really walk.** US signal design assumes 1.2 m/s, and FHWA guidance recommends 0.9 m/s for less capable older pedestrians; measured means are 0.8 m/s with a cane or crutch, 0.6 m/s with a walker and 1.1 m/s for wheelchair users (FHWA-HRT-05-099, lesson 8). In England, adults aged 65 and over walked at a mean 0.9 m/s (men) and 0.8 m/s (women), and 84% of men and 93% of women walked slower than 1.2 m/s (Asher et al., Age and Ageing 2012).

### 2.2 Cyprus reality and data

- Nicosia's summer heat, kerbs without dropped crossings and pavements blocked by parked cars slow walkers; the Audit Office's accessibility review was done with a representative of the Cyprus Paraplegic Organisation (Economy Today, 14 Oct 2026), and found 32% of stops with no shelter and 22% with neither seat nor shelter (Cyprus Mail, 14 Oct 2026). Shade and heat matter for pace and willingness to walk.
- The population that most needs accurate walking time (older riders, people with mobility aids) is the population that standard 1.2 to 1.4 m/s assumptions serve worst (FHWA; Asher et al.).
- OpenStreetMap is the open source for footways and crossings in Cyprus; Google's walking directions are already used by Aloya (below). No Cyprus-specific pedestrian speed study was found.

### 2.3 Aloya today, and its gaps

- One fixed pace everywhere: WALK_M_PER_S = 1.35 in packages/core/src/geo.ts line 29 and packages/core/src/multileg-legs.ts line 38, walkMetersPerSec 1.35 in packages/core/src/raptor-core.ts line 55, and WALK_PACE_MPS = 1.35 in src/lib/walk-links.server.ts line 39 (commented "a calm Mediterranean walk"). Straight-line distance is multiplied by a 1.35 detour factor.
- After RAPTOR, walk legs are replaced with Google walking durations (src/lib/walk-refine.server.ts), which is good for distance and path but still assumes Google's generic pace, not the rider's.
- No user setting for walking pace or mobility aid was found, and no learning from the rider's actual walks.
- 1.35 m/s is about 50% faster than the mean measured for English adults over 65 (0.8 to 0.9 m/s). For an older rider a planned 6-minute walk can take about 9 minutes, which is exactly the "you'll make it" that turns into a missed hourly bus.

### 2.4 Improvements

1. **Pace profile in settings (S, high).** Options: Brisk (1.5 m/s), Normal (1.3 m/s), Relaxed (1.0 m/s), Slow or with a walking aid (0.8 m/s), Wheelchair (1.1 m/s, step-free routing). The slow, walking-aid and wheelchair figures follow FHWA and Asher et al.; the brisk and normal figures are proposed defaults to be replaced by learned pace (step 2). Pass the chosen speed into RAPTOR (raptor-core.ts walkMetersPerSec) and scale Google durations by (Google implied speed / user speed).
2. **Learned pace, on the device (M, high).** During any walk leg with good GPS (horizontal accuracy under 20 m, straight segments over 100 m), compute speed from distance over time, reject stops at crossings (speed under 0.3 m/s), and keep an exponentially weighted personal median plus a "brisk" 85th percentile. Where available use the step counter (Android Activity Recognition and step sensor; iOS CMPedometer in a native wrapper) to calibrate stride as AutoGait does, which is steadier than GPS (JMIR 2025 shows GPS noise). Store only the two numbers, on the device.
3. **Two speeds in every decision (S, high).** Layer 1's leave logic uses normal pace for "leave now" and brisk pace for "run, you can still make it", never assuming the rider will run unless the gap is small.
4. **Context factors (M, medium).** Apply a heat factor (slower above a temperature threshold, from a weather API), a night factor, and a luggage or pram toggle for the trip. Calibrate the factors from learned data rather than inventing them.
5. **Crossing and kerb penalties (M, medium).** Add a fixed time per signalised crossing and per missing dropped kerb from OpenStreetMap tags (crossing=traffic_signals, kerb=raised), weighted more for the Slow and Wheelchair profiles. FHWA notes older pedestrians take longer to start crossing (2.5 s versus 1.9 s mean start-up).
6. **Show the assumption (S, medium).** On every walk leg show "7 min at your pace" and let the rider tap to change pace for this trip.
7. **Fix the comment and constants (S, low).** Make 1.35 a single shared default in packages/core instead of four copies, so the profile change applies everywhere.

## Layer 3: PWA background location and what the phone allows

### 3.1 What the best in the world do

- Transit, Citymapper and Google Maps are native apps. Their trip companions keep working with the screen off because native apps can hold background location during an active navigation session and show a persistent lock-screen surface: Live Activities on iOS and Live Notifications or Live Updates on Android (help.transitapp.com/article/549; citymapper.com/news/2553; androidpolice.com, Aug 2026).
- Android's coming Transit mode requires "Allow all the time" precise background location for Google Maps to send updates while the user is at home or work (Android Authority, 20 Jan 2026). The leaders accept the permission cost because location-aware alerts are impossible without it.
- Platform limits that shape every design:
  - **iOS web apps.** Web Push works from iOS 16.4 only for web apps installed to the Home Screen; Declarative Web Push from iOS 18.4 (installed web apps, no service worker needed); Screen Wake Lock from 16.4, and from 18.4 in installed web apps; Background Sync, Periodic Background Sync and Background Fetch are not supported; the Vibration API is not supported (firt.dev iOS PWA compatibility, updated 13 Oct 2026). WebKit requires every push to show a visible notification and revokes the subscription if a service worker fails to show one, so silent pushes to wake the app for a location check are not possible (webkit.org/blog/16535).
  - **Android Chrome.** Web Push works in the browser and installed apps; geolocation is available to pages in the foreground only. There is no web API for background location on either platform.
  - **Native.** iOS Live Activities can stay active for up to 8 hours (Apple ActivityKit documentation). iOS monitors at most 20 regions per app for geofencing; Android allows up to 100 active geofences per app (Android geofencing documentation). Android 16 introduced Live Updates with ProgressStyle notifications for journeys (developer.android.com, live-update).

### 3.2 Cyprus reality and data

- Cyprus riders use both iPhone and Android; no reliable published split for Cyprus was found, so Aloya must design for both.
- CPT's own Pame app is native (Google Play listing app.meep.cyprus.pame, rating 3.1 from 539 reviews in the listing seen), so riders who install an app for buses already accept native permissions.
- On sparse routes a rider may wait 20 to 60 minutes with the phone in a pocket. Any alert that needs the app open fails exactly when it matters.

### 3.3 Aloya today, and its gaps

- The live trip engine runs in the browser (src/lib/useGeoWatch.ts and src/lib/useFusedFix.ts use navigator.geolocation.watchPosition), so it stops when the tab is backgrounded or the screen locks.
- No Screen Wake Lock use was found in src, mobile or packages, so even a rider who keeps the app open can have the screen sleep and the watch stop.
- src/lib/useJourneySideEffects.ts lines 122, 124 and 162 call navigator.vibrate for "ring the bell" and "stop coming up" pulses. The Vibration API is not supported on iOS (firt.dev), so iPhone riders get no haptic cue.
- public/sw.js shows push notifications and relays text to an open window for speech (lines 140 to 170), so spoken alerts only work if a window is open.
- The Expo app has a real background-location task for group trips only (mobile/lib/groupBackgroundLocation.ts) and a stub Live Activity bridge: mobile/lib/liveActivities.ts startLiveActivity logs and returns the fixed string "activity-session-id" without calling ActivityKit. The last EAS Android build in mobile/build_info.json errored.

### 3.4 Improvements

1. **Design for "no background location" on the web (S, very high).** Treat the server as the only thing that runs while the phone sleeps, and give it only safe, state-aware alerts (layer 1 steps 1 and 2). When the web app is closed, rider_state decays to unknown after 3 minutes and the server must ask, not assume.
2. **Screen Wake Lock during active legs (S, high).** Request navigator.wakeLock.request("screen") while walking to a stop and during the last 3 stops before getting off, release it otherwise, and re-request on visibilitychange. Works in iOS 18.4+ installed web apps and Chromium.
3. **Declarative Web Push payloads (S, medium).** Send the standard JSON ("web_push": 8030 with a notification object and navigate URL) so notifications still show on iOS 18.4+ even if Intelligent Tracking Prevention removes the service worker. Keep the service worker as an optional enhancer.
4. **iPhone haptics fallback (S, medium).** Where navigator.vibrate is missing, use a short audio cue plus speech (Web Speech Synthesis is supported on iOS) when the app is open, and set notification sound for get-off alerts.
5. **Install prompt with honest value (S, medium).** iOS web push needs Home Screen installation. Show a one-time explainer at the first trip start on iPhone: "Add Aloya to your Home Screen to get leave-now and get-off alerts."
6. **Native shell for background trips (L, very high).** Fix the Expo build first, then reuse the group-trip TaskManager pattern for solo trips: start background location only between trip start and trip end, distance filter about 25 m when walking and 100 m when riding, foreground service notification on Android, "while using" plus the blue indicator on iOS. Compute rider state on the device and send only the state (layer 10). A commercial plugin such as transistorsoft's background geolocation is an option if Expo's task proves unreliable.
7. **Geofences instead of continuous GPS (M, high).** In the native app, register geofences around the board stop (radius about 60 m), transfer stops and the stop before the alighting stop. Respect the 20-region iOS limit by registering only the next two or three.
8. **Real Live Activity and Android Live Update (M, high).** Replace the stub with an Expo module calling ActivityKit (one activity per trip, ended at arrival, within the 8-hour limit) and an Android ProgressStyle Live Update. See layer 8.

## Layer 4: Notification taxonomy (fewer, better, updated in place)

### 4.1 What the best in the world do

- **Citymapper:** "We'll not send you unnecessary alerts. But the one we will send you is an alert when to get off" (citymapper.com/news/517). One persistent Smart Notification carries everything else.
- **Transit:** with Live Activities or Live Notifications on, "instead of sending multiple notifications throughout your trip, your phone will wake only to alert you when it's time to take action, like 'Leave now' or 'Get off in 2 stops'" (help.transitapp.com/article/549).
- **Android Live Updates** exist to "replace a dozen chatty notifications with a single, dynamic tracker" (androidpolice.com, Aug 2026).
- **The cost of over-notifying is measured.** In a seven-week experiment with 17,500 retail app users, higher frequencies of non-personalised pushes increased uninstalls and lowered direct open rates (Wohllebe et al., Innovative Marketing 17(2), 2021). Transit alerts are personal and timely, but the lesson holds: every unnecessary buzz spends trust.
- **The protocol supports doing it right.** RFC 8030 (Web Push) defines a Topic header so a newer message replaces an undelivered older one with the same topic, an Urgency header (very-low, low, normal, high) and a TTL so stale messages expire instead of arriving late. The Notifications API's tag replaces a shown notification with the same tag.

### 4.2 Cyprus reality and data

- The Audit Office found 9% of surveyed riders used the bus less because of wrong real-time information (seed finding from Special Report 29/2026, carried from the earlier run). A wrong alert is not neutral; it pushes people back to cars.
- Riders on routes with 60 to 120-minute headways need very few alerts, but each must be right.

### 4.3 Aloya today, and its gaps

- Many producers, no single ledger: the per-minute trip-alerts job (seven single-leg kinds in src/lib/trip-alerts.server.ts lines 30 to 37 plus multi-leg keys), the even-minute departure-tick hook and the two-minute arrival-promise hook (workers/pulse-cron/src/jobs.ts), plus phone-side notifications from packages/core/src/multileg-journey.ts (kinds arrived, at-stop, hurry-soft, missed-bus, press-stop). No shared cap or quiet rule was found in src/lib/notify.server.ts.
- Tags differ by producer: server tags are aloya-<kind>-<tripId> (trip-alerts.server.ts lines 54 to 101), the phone-side push uses aloya-<kind> (src/lib/push.functions.ts line 253). Different tags mean the same moment can produce two notifications, and per-kind tags mean each kind stacks instead of one trip notification updating in place.
- No Topic or TTL is set on Web Push sends; urgency is "high" only when requireInteraction is set, otherwise "normal" (notify.server.ts line 202). A "leave now" delayed in the push service can arrive after the bus has gone.
- alerts_sent is wiped on every re-upload (trip-sync.functions.ts line 51), so de-duplication does not survive a trip edit.
- Five Android channels exist (notify.server.ts lines 39 to 52: arrival-promises, departures, trip-alerts, group-trips, service-alerts), which is a good base for user control.

### 4.4 Improvements

1. **One alert ledger per trip (M, very high).** A server table trip_alert_ledger(device_id, trip_key, alert_key, tier, sent_at, superseded_by). Every producer, server or phone, writes through one function in packages/core that checks the ledger first. The phone reports its local sends so the server never repeats them.
2. **Four tiers with rules (S, very high).**
   - Tier 1, act now (sound and vibration, Urgency high, TTL 60 to 120 s): leave now, run or you'll miss it, get off next, connection at risk with a new plan.
   - Tier 2, heads-up (quiet, Urgency normal, TTL 300 s): get ready, bus delayed more than 5 min, transfer coming.
   - Tier 3, status (silent, updates the ongoing trip notification only): bus position, minutes to stop, stops remaining.
   - Tier 4, ask (one question when state is unknown, Urgency normal): "Are you at the stop yet?"
3. **Caps (S, high).** At most one Tier 1 per trip phase (layer 7b phases), at most 6 sounding alerts per trip, never two sounding alerts within 60 s, and a Tier 2 is dropped if a Tier 1 for the same phase is due within 2 minutes.
4. **Update in place (S, high).** One tag per trip (aloya-trip-<itineraryId>) for the ongoing status, plus a single tag per phase for sounding alerts. Use the Web Push Topic header with the same key so an undelivered older message is replaced in the push service. Set renotify only for Tier 1.
5. **TTL everywhere (S, high).** Leave now and get off expire in 60 to 120 s; heads-up in 5 min; daily service alerts in hours. A late "leave now" must never be delivered.
6. **Keep alerts_sent across edits (S, high).** On upsert, merge the ledger instead of resetting it, and key alerts by leg and stop rather than by trip only, so a re-plan sends only what is new.
7. **User controls mapped to tiers (S, medium).** Settings: "Only the essentials" (Tier 1 only), "Standard", "Everything". Map tiers onto the existing Android channels so the system settings also work.
8. **Measure and prune (M, medium).** Log per alert key: delivered, opened, dismissed, followed by an action (rider moved, boarded). Drop or rewrite alert types with low action rates; watch notification opt-outs and uninstalls as the guard metric, as the Wohllebe study suggests.

## Layer 5: Live bus reliability (ghost buses, stale data and honest ETAs)

### 5.1 What the best in the world do

- **Measure accuracy the way riders feel it.** The Transit ETA Accuracy Benchmark (based on an IBI Group method) buckets predictions by how far away the vehicle is and uses asymmetric thresholds because early arrivals are worse than late ones: 0 to 3 min away, accurate if the bus arrives no more than 30 s early or 1.5 min late; 3 to 6 min, 1 min early to 2.5 min late; 6 to 10 min, 1 min early to 3.5 min late; 10 to 15 min, 1.5 min early to 4.5 min late. Overall accuracy is the straight average of the four buckets (github.com/TransitApp/ETA-Accuracy-Benchmark).
- **Detect ghost and zombie buses.** Swiftly describes "ghost" buses (predicted but not running) and "zombie" buses (vehicles reporting but not actually in service) and filters them by checking whether a scheduled trip has a matched, moving vehicle near its start (goswift.ly blog, "Banish ghost and zombie buses").
- **Crowdsource where agency data is weak.** Transit's GO shares the rider's vehicle position anonymously while riding; in places without predictions, such as the Vancouver SkyTrain example, rider data fills the gap (help.transitapp.com/article/91).
- **Correct the feed, do not just display it.** Transit advertises an in-house ETA prediction engine on top of agency data and crowdsourcing (Google Play listing). A Kalman filter or similar state estimator over successive vehicle positions and stop arrivals is the standard way to smooth noisy positions and estimate delay propagation (earlier-run finding; general method).

### 5.2 Cyprus reality and data

- One national GTFS-RT feed from the Public Works Department via CyNAP, "estimate timetables ... derived from the telematics system", update frequency "up to 1 min", CC BY 4.0 (traffic4cyprus.org.cy). The earlier run found it publishes trip updates and vehicle positions but no service alerts or cancellations.
- The feed has outages; BusCyprus falls back to timetables and attributes outages to provider issues, maintenance, connectivity or on-vehicle GPS equipment (buscyprus.app/gtfs-rt-info).
- The Intercity GTFS feed scores 69.8/100 (grade D) on GTFS Scorecard on 31 Oct 2026, with 83 validator errors (foreign key violations), 60 routes, 740 trips and 123 stops, and "Realtime not yet published" for that operator's feed record (gtfsscorecard.org).
- Wrong information costs riders: the Audit Office found conflicting timetables, route numbers and stop locations across the operator's website and apps (Politis English, 14 Oct 2026). CPT says the new website and Pame app now share one database and all routes are on Google Maps (CPT response, 15 Oct 2026, via AlphaNews and Cyprus Mail).

### 5.3 Aloya today, and its gaps

Aloya is ahead of most local apps here:
- Ghost tagging with agency-aware cutoffs: a trip with an arrival in the next 30 minutes but no vehicle position fresher than 180 s (urban) or 300 s (Intercity) is downgraded from live (src/lib/gtfs-rt.server.ts lines 104 to 113, src/lib/ghost-trips.ts), with learned thresholds in src/lib/threshold-cache.server.ts.
- Crowdsourced positions from riders who tapped "I'm on board", scored by a physics check and ignored below 0.25 (src/routes/api/public/rider-fix.ts header).
- A prediction backtest with horizon buckets (0 to 2, 2 to 5, 5 to 10, 10 to 20, 20+ min) that keeps rider-inferred arrivals out of headline numbers (packages/core/src/eta-backtest.ts), plus route and stop reliability endpoints.

Gaps:
- The alert server ignores all of that for the most important alerts. trip-alerts.ts (lines 51 to 70) loads arrivals, ghost IDs and staleness, but uses ghost or stale status only for "still on board" (line 121). "Board soon", "Pick up the pace" and "Board now" use the raw feed arrival even for a ghost trip, and silently fall back to the scheduled time when the feed is missing (line 84), without telling the rider the time is a timetable guess.
- No uncertainty band: alerts treat a predicted time as exact. The Benchmark shows the early edge is what makes riders miss buses.
- The backtest buckets do not match the industry Benchmark buckets, so Aloya cannot quote a comparable accuracy figure.
- The client staleness threshold is 60 s (src/lib/useRealtime.ts line 13) while the server ghost cutoff is 180 s; the two surfaces can label the same bus differently.

### 5.4 Improvements

1. **Use ghost and stale rules in every alert (S, very high).** In trip-alerts.ts, if the board trip is in ghostTripIds or the feed is stale, never send "Board now" or "Pick up the pace"; send at most "BUS X has no live position. Timetable says 08:14." and include the next live alternative.
2. **Label every time (S, high).** Three labels in app and notification text: Live (fresh vehicle position), Estimated (feed prediction without a fresh position, or crowdsourced), Timetable. Never show a timetable time in the same style as a live one.
3. **Uncertainty band per prediction (M, very high).** From the backtest table, compute per route, horizon and time of day the 10th and 90th percentile of (actual minus predicted). Expose earliest-likely and latest-likely times. Leave-now logic (layer 1) uses the earliest-likely time; "you can relax" uses the latest-likely.
4. **Adopt the Benchmark buckets (S, medium).** Add 0 to 3, 3 to 6, 6 to 10, 10 to 15 minute buckets with the asymmetric thresholds alongside the existing ones, and publish an honest accuracy page per route. This is also useful evidence for CPT and the ministry.
5. **Correction layer (M, high).** A per-trip state estimator (Kalman filter over distance along shape and speed) using feed positions, rider fixes and segment travel-time history by hour, producing the corrected arrival and its variance. Start with segment medians by hour before any learned model.
6. **Cancellation inference (M, high).** If a scheduled trip has no matched vehicle within a set window around its departure from the first stop, and the previous trip's vehicle is not on a layover, mark it "likely not running" and replan riders onto alternatives (layer 6). Learn the window from history rather than fixing it.
7. **One freshness classifier shared by client and server (S, medium).** Move the thresholds into packages/core so app labels and alert decisions always agree.
8. **Feed outage mode (S, medium).** When the national feed is down, show a banner, switch all alerts to timetable-based wording with wider buffers, and lean on crowdsourced positions where present.
9. **Report data faults upstream (S, medium).** Feed GTFS Scorecard findings and Aloya's own stop-location corrections to the Public Works Department and CPT through the CyNAP contact (cynap@pwd.mcw.gov.cy).

## Layer 6: Disruption replanning (missed buses, delays, detours, no-shows)

### 6.1 What the best in the world do

- **Push, not pull.** Monash University's IJCAI 2025 paper "Dynamic Replanning for Improved Public Transport Routing" compares riders asking for replans ("pull") with a server that monitors each journey and pushes revised plans ("push"). Key ideas: replanning just before each stop is enough because riders cannot act between stops; the best plan can change only if (i) the current journey is delayed, or (ii) a delay makes a previously unreachable trip catchable; the server sends each phone an "envelope" of relevant connections (about 3 to 7.5% of the timetable, averaging about 3 MB per journey) and the phone replans locally. Push ran an order of magnitude faster than pull, and dynamic replanning saved 5 to 30 minutes per affected journey on average versus static plans in Perth, Berlin, Paris and London, including savings when the original plan was not delayed. The experiments used synthetic delays (exponential, mean 5 min off-peak and 10 min peak for buses), not real delay data (ijcai.org/proceedings/2025/0937).
- **RAPTOR** (Delling, Pajor and Werneck, Microsoft Research) is the round-based planner that makes millisecond replanning practical on a phone or server (microsoft.com/en-us/research, raptor_alenex).
- **Products.** Transit's GO "suggest[s] alternatives if you miss your connection" (Transit 101 booklets 2025 and 2026). Citymapper's routing engine "takes out parts of the network that has issues, and finds you alternatives" and sends line disruption alerts (citymapper.com/news/777). Google Maps updates the route for delays or disruptions during transit navigation (howtogeek.com, July 2026).

### 6.2 Cyprus reality and data

- Disruptions are published as PDF announcements, not as machine-readable alerts: for example "Detour on Routes 1 & 2 from 26/10/26 to 30/10/26", "Detour on Route 23 & 24 from 21/9/26 until 10/1/27", "New Nicosia Route 29K from 2 November 2026" and Larnaca timetable changes from 19 Oct 2026 (publictransport.com.cy/announcements, read 31 Oct 2026).
- The national GTFS-RT feed carries no service alerts (earlier-run finding), so detours and cancellations reach apps only through the timetable or not at all.
- Low frequency raises the stakes: on hourly routes, IJCAI found the biggest savings when a transfer is missed in low-frequency hours, which is everyday reality on many Cypriot routes (Audit Office: some routes every one to two hours).
- Shared e-scooters (Bolt in Nicosia, at stations; Electra e-bikes and e-scooters in Nicosia, Larnaca and Limassol) and taxis are the realistic rescue modes (traffic4cyprus.org.cy Bolt stations dataset; electra.space).

### 6.3 Aloya today, and its gaps

Aloya already has several rescue tools, all on the phone and in the foreground:
- packages/core/src/wait-or-bail.ts: "one action at the stop when the row is dark", choosing between a later live bus at the same stop (up to 20 minutes) and bailing, with tiers live, rider-confirmed, predicted, ghost, scheduled, and flags for last bus tonight and no-show.
- packages/core/src/other-stop.ts: the "other stop" ask ("Bus 25 leaves in 3 min from Makariou") when a nearby stop beyond 80 m has a better departure.
- src/lib/reroute.functions.ts: re-plan from the rider's current position, used by the early-alight sheet; src/lib/wrong-stop-reroute.ts: "You're at a different stop. Want me to re-plan from here?"
- packages/core/src/multileg-journey.ts lines 441 to 448 emit a "missed-bus" alert on the missed-connection phase.

Gaps:
- Nothing replans while the app is closed. The server only sends the fixed alert set (layer 1), so a rider with the phone in a pocket hears nothing useful when the plan breaks.
- The miss detector in journey-live.ts needs the rider near the stop and a GPS fix; a rider still walking when the bus passes is not told "you missed it, here is the next option".
- No ingestion of CPT announcements was found (src/lib/publictransport.functions.ts only proxies Motion card top-up endpoints), so detours and new routes like 29K are invisible until the GTFS changes.
- No "catchable delayed bus" detection: IJCAI's case (ii), where a late bus on another route becomes the faster option, is not looked for.

### 6.4 Improvements

1. **Server-side push replanning (L, very high).** For each active trip, after every feed refresh, evaluate: is the current plan delayed past a threshold, or has a connection in the trip's envelope become catchable and earlier? If yes, run RAPTOR from the rider's current state (next stop if on board, current position or board stop if walking or waiting) and push one Tier 1 alert with the new plan. Use IJCAI's envelope idea to keep compute small.
2. **Miss detection anywhere (M, very high).** Missed means: the board trip's vehicle has passed the board stop (feed or crowdsourced position) and rider_state is not on_board. Works whether the rider is at home, walking or at the stop. The alert carries the best next option in the same message.
3. **One-tap replan from the notification (S, high).** The alert opens a replan sheet already computed, with "Take this" and "Show others". On Chromium add a notification action.
4. **Detour and announcement ingestion (M, high).** Poll publictransport.com.cy/announcements daily, parse new items (title, routes, dates; the PDF text for streets), and create internal service alerts with affected routes and date ranges. Flag affected stops in planning and warn riders whose saved trips use them. Offer the structured data back to CPT and the Public Works Department as GTFS-RT service alerts.
5. **"Bus not coming" rescue (S, high).** When the board trip turns ghost close to departure (layer 5) and wait-or-bail finds no live bus within the rider's tolerance, rank rescue options: another stop within walking reach, scooter or e-bike to a faster line (layer 7b), or taxi. Show times only; the code comments rightly forbid inventing taxi fares, so show a fare only from a real API.
6. **Last bus protection (M, high).** If the rider is on the last viable connection of the night, alert earlier and with a bigger buffer, and say plainly when there is no later public transport option.
7. **Reliability-aware planning (M, medium).** Prefer itineraries whose transfers have high probability of success (layer 7b), not just the earliest scheduled arrival, especially on hourly routes.
8. **Replay test harness (M, medium).** Record feed snapshots and replay real disruption days to measure minutes saved, as IJCAI did with synthetic data, but with Cypriot data.

## Layer 7: Get-off alerts and off-route detection

### 7.1 What the best in the world do

- **Citymapper's Get Off Alerts** fire automatically when the stop approaches after the rider taps GO, and were built to work offline underground (citymapper.com/news/823). Citymapper calls the get-off alert the one alert it will always send (citymapper.com/news/517). Voice guidance covers walking, cycling, scooting and public transport (citymapper.com/news/2395).
- **Transit GO** counts down "5...4...3...2... more stops" before the destination stop and wakes the phone for "Get off in 2 stops" (help.transitapp.com/article/549).
- **Google Maps** shows a lock-screen progress notification and a "get off" alert, toggled by "Get transit alerts when it's time to get off" (blog.google, Dec 2017; howtogeek.com, July 2026).
- **Off-route recovery.** Citymapper reroutes walkers automatically when they go "off-piste" (citymapper.com/news/2553); Transit suggests alternatives after a missed connection.

### 7.2 Cyprus reality and data

- On-board information is weak. The Pancyprian Organisation of the Blind said in November 2024 that operators and the ministry were "refusing to activate the system announcing bus stops" although it is installed (Cyprus Mail, 14 Nov 2024). The ministry replied that almost the whole fleet has the system, except a small number of buses with technical problems, and that inspectors record problems and impose penalties (gov.cy, 15 Nov 2024). In October 2025 the organisation's president again said stop announcements are not used (Nea Kypros, 15 Oct 2025), and in October 2026 he said that in Paphos the on-board stop announcement system had been switched off because it irritated other passengers, and that a blind person at a stop cannot tell which route is arriving (CYPRUS FAQ, 10 Oct 2026).
- CPT said on 15 Oct 2026 it has enhanced recorded stop announcements and adjusted their volume as part of an on-board information campaign (CPT response via AlphaNews and Cyprus Inform).
- Stop pins can be 85 to 135 m from the real stop (Audit Office, Oct 2026), which matters for any alert based on distance to the stop.
- Most buses require pressing a stop button; a missed press on an hourly route can cost an hour.

### 7.3 Aloya today, and its gaps

Strong on the phone:
- packages/core/src/alight-countdown.ts counts stops, not seconds: get ready at 3 stops out, stand by at 1 stop out, press now when the bus leaves the stop before yours, alighting at the stop, and "passed" if the stop is behind. Its header explains why: ETA and radius rules told riders "to ring the bell five stops out". It is shared by web and native (src/components/journey/AlightCountdownCard.tsx and mobile/components/journey/AlightCountdownCard.tsx).
- Haptic pulses for "stop coming up" and "ring the bell" (src/lib/useJourneySideEffects.ts lines 122 to 124), and spoken alerts relayed by the service worker when a window is open (public/sw.js).

Gaps:
- The server still uses the old method the countdown module rejects: "alight-soon" fires 2 minutes before the predicted alight time (src/routes/api/public/trip-alerts.ts lines 132 to 141), and "arrived" fires 30 s after it (lines 143 to 148). With the phone locked, this time-based alert is the only get-off cue the rider gets.
- Haptics do not work on iPhone web (Vibration API unsupported, firt.dev), and speech needs an open window.
- "Passed" is detected but there is no automatic recovery plan pushed when the rider misses the stop or boards the wrong bus; wrong-stop rerouting exists (src/lib/wrong-stop-reroute.ts) but needs the app open.
- No "which bus is mine" cue at the stop for blind riders, the exact gap the Organisation of the Blind describes.

### 7.4 Improvements

1. **Server get-off alerts by stop count (S, very high).** Port alight-countdown to the server using the vehicle's position along the trip shape (feed or crowdsourced). Send one Tier 1 push at "press now" (the bus has left the stop before yours) and an optional quiet Tier 2 at 3 stops out. Drop the 2-minute time rule. If the vehicle position is stale, fall back to time with wider wording ("Your stop is in about 2 stops").
2. **Confirm on board first (S, high).** Only send get-off alerts for a leg once rider_state is on_board (tap "I'm on", or the native app matches the rider's track to the vehicle). This avoids get-off alerts for a bus the rider never caught.
3. **Missed stop and wrong bus recovery (M, high).** If "passed" triggers, or the on-board track diverges from the planned route shape by more than a threshold for two consecutive fixes, push "You've passed <stop>. Get off at <next stop>; walk back 6 min or take BUS Y back in 4 min."
4. **Accessible cues (S, high).** A "voice on" mode that reads the countdown through headphones (Web Speech Synthesis works in iOS web apps when open), large-text get-off card, and distinct haptic patterns on Android and in the native app. On the stop screen, a "Which bus is mine?" mode that announces the approaching route number and headsign from live data when it is within 1 to 2 minutes.
5. **Lock-screen countdown (M, high).** In the native app, the Live Activity and Android Live Update show stops remaining and "press now" (layer 8).
6. **Correct stop coordinates (M, medium).** Use the stop corrections table (layer 1 step 7) so "alighting" and the walk to the destination start from the real stop.
7. **Share the data with advocates (S, medium).** Offer the Pancyprian Organisation of the Blind a test group and publish per-route reports of whether on-board announcements were heard (rider feedback after trips), turning a complaint into evidence.

## Layer 7b: Phase-by-phase in-trip re-optimisation across transfers (with micromobility in the middle)

Samuel's addendum: the app must be intelligent at every phase of a multi-stop trip (before boarding, on the first bus, approaching the transfer, during it and after it) and keep re-optimising for faster or new buses, alternatives and micromobility in the middle of the trip.

### 7b.1 What the best in the world do

- **Replan at every stop, push the change.** IJCAI 2025 (Monash) formalises exactly this: replan just before each stop, because that is the only moment a rider can act; the plan changes only when the current journey is delayed or a delayed trip becomes catchable; a server-built envelope lets the phone replan in a fraction of a second. Dynamic replanning saved 5 to 30 minutes per affected journey versus static plans, and a large share of the savings came from replanning when the current plan was not delayed at all (synthetic delays; ijcai.org/proceedings/2025/0937).
- **Multimodal plans mixing modes mid-trip.** Citymapper's "Mixed routes" combine public transport with bikes and e-scooters, and with taxis (citymapper.com/news/2589). Transit compares "bikeshare + rail or bus + metro" and "multiple modes in one trip (bus + bike or scooter + metro)" (Google Play listings). OpenTripPlanner supports bike and scooter rental legs inside transit itineraries, fed by GBFS (docs.opentripplanner.org, RouteRequest).
- **Phase-aware guidance.** Citymapper's Live Activity shows each stage (walk, wait, ride, transfer) with live departures so the rider knows whether to hurry (citymapper.com/news/2553).

### 7b.2 Cyprus reality and data

- Transfers are common and fragile: in six of nine Audit Office travel scenarios the journey needed two buses (Cyprus Mail, 14 Oct 2026), and some routes run only every one to two hours.
- Micromobility supply: Bolt e-scooters in Nicosia, parked at fixed municipal stations published on CyNAP (traffic4cyprus.org.cy dataset "bolt"; no live vehicle feed). Bolt told parliament in September 2026 it is the only licensed operator in Nicosia (Politis, 10 Sep 2026, as summarised by the ScootRadar project). Bolt applies a fleet-wide 20 km/h limit and geofenced zones (Cyprus Mail, 1 Sep 2026). Nicosia plans more than 100 designated scooter parking spaces and more 30 km/h zones (Cyprus Mail, 27 Aug and 10 Sep 2026). Electra rents e-bikes (16+) and e-scooters (18+, driving licence) in Nicosia, Larnaca and Limassol from 0.15 euro per minute (electra.space).
- Legal limits that routing must respect: since April 2026 e-scooters are allowed only from age 17, on cycle paths and lanes, signed shared areas and streets with a 30 km/h limit, not on pavements or faster roads except to cross; maximum 25 km/h (Cyprus Mail, 10 Sep 2026; Cyprus Inform guide; Law 106(I)/2026 on cylaw.org).

### 7b.3 Aloya today, and its gaps

- A clear phase model exists: idle, walking-to-board, waiting-to-board, riding, alight-soon, walking-to-transfer, waiting-for-connection, missed-connection, walking-to-destination, arrived (packages/core/src/multileg-journey.ts lines 13 to 23). The latest commit (1508f3f) makes the "next change" card follow the connecting bus's live time at the change.
- src/lib/reliability.functions.ts models delay as a normal distribution and estimates a probability (line 4), a building block for connection probability.
- Bolt scooter suggestions exist but only as a whole-trip alternative: src/lib/bolt-scooter.functions.ts suggests "scoot it" only when both trip ends are near official zones and the trip is 0.8 to 4 km, and honestly refuses to claim live scooter counts. Bike-share and GBFS endpoints exist (src/routes/api/public/bike-share.ts, gbfs). No scooter or bike leg is offered inside a transit itinerary, for example scooting from the first bus to a faster second line.
- The phase machine has the transfer bug from the opening paragraph: with no GPS fix it advances the transfer walk after planned time plus 120 s and the wait 30 s before departure (lines 347 to 353), then sends "at-stop" alerts (lines 409 to 430), so a rider still on the first bus can be told "You're at <transfer stop>".
- Phase logic runs only in the foreground on the phone; the server knows nothing about phases.

### 7b.4 Improvements

1. **Phase-specific jobs, one rule each (M, very high).**
   - Before boarding: layer 1 leave decision; watch for a better first bus from another nearby stop (layer 6's other-stop ask) and offer it once.
   - On the first bus: compute connection probability for the planned transfer (below) every minute; if it falls below a threshold, compute alternatives now while there are still choices (get off earlier, stay on to a later transfer point, different second line).
   - Approaching the transfer (2 to 3 stops before): one Tier 1 decision if the plan changed: "Change of plan: get off at <stop> one stop early and walk 3 min to BUS 22, it's 6 min faster." Otherwise a quiet confirmation.
   - During the transfer: walking guidance to the right side of the road, live countdown for the connecting bus, run or relax using layer 1's states.
   - After the transfer: confirm on board the second bus, then get-off logic (layer 7).
2. **Connection probability (M, high).** P(make it) = P(arrival at transfer stop + walk at learned pace + margin is earlier than connecting departure), using the uncertainty bands from layer 5 for both buses. Show it simply: "Safe", "Tight", "Likely to miss". Use it in planning too, preferring a slightly later but safe connection on hourly routes.
3. **Envelope replanning at every stop (L, very high).** Implement IJCAI's push approach on top of Aloya's RAPTOR: on trip start the server builds the envelope; the phone (or the server for locked phones) replans at each stop and triggers only on the two conditions IJCAI identifies.
4. **Micromobility as a mid-trip leg (L, high).** Add rental scooter and e-bike legs to RAPTOR footpaths: from any stop within a short walk of a Bolt station (Nicosia) or an Electra zone, to any station near another stop, with travel time from street-network distance on permitted streets (30 km/h roads, cycle paths) at a conservative speed under the 20 km/h Bolt cap, plus unlock and parking time. Restrict by age (17+ for e-scooters, 18+ with licence for Electra scooters, 16+ Electra e-bikes) using a profile setting. Keep the existing honesty rule: never claim live vehicle counts without a live feed, and deep-link to the operator app.
5. **"Better stop nearby" mid-trip (M, high).** When on the first bus, also consider getting off before the planned transfer and walking, scooting or taking a short taxi to a stop served by a more frequent or faster line. Suggest only if it saves at least 3 minutes or rescues a likely-missed connection (threshold to be tuned with data; it is the earlier run's proposed rule).
6. **Fix the transfer bug first (S, very high).** No auto-advance without a fix, no "at-stop" alert for transfer walks or waits unless the rider is actually within the stop radius (multileg-journey.ts lines 347 to 353 and 409 to 430).
7. **Server knows the phase (M, high).** Send the phase with rider_state (layer 1 step 2) so the locked-phone server path can act per phase.
8. **Learn transfer walking times (M, medium).** Record actual transfer walk durations per stop pair (anonymised, aggregated) to replace estimates, especially where stops sit on opposite sides of busy roads.

## Layer 8: Lock screen, widgets and wearables

### 8.1 What the best in the world do

- **Transit:** a lock-screen Live Activity (iOS) or Live Notification (Android) "will show your entire trip at a glance", the phone wakes only for actions such as "Leave now" or "Get off in 2 stops", and the widget dismisses itself at the end of the trip (help.transitapp.com/article/549).
- **Citymapper:** Lock Screen Navigation on iOS 16.1+ with a stage-by-stage Live Activity and the Dynamic Island (citymapper.com/news/2553 and /2589); GO notifications also work on the watch (citymapper.com/news/597).
- **Google Maps:** lock-screen transit progress on Android since 2017 (Engadget, TechCrunch, Dec 2017), and Android's coming Transit mode promises "real-time updates on your home and lock screen" (Android Authority, Jan 2026).
- **Platform surfaces:** ActivityKit Live Activities stay active for up to 8 hours (Apple documentation); Android 16 Live Updates use ProgressStyle templates and are a privileged notification class that requires the standard templates (developer.android.com; androidpolice.com, Aug 2026). Notifications on a paired Apple Watch or Wear OS watch are mirrored from the phone, so well-designed phone notifications reach the wrist with no extra app.

### 8.2 Cyprus reality and data

- Riders wait at stops in strong sun with little shelter (Audit Office: 32% of stops without shelter, 22% without seat or shelter), so glancing at a lock screen or watch beats unlocking and reading a bright screen.
- Pame (CPT) offers arrival notifications but no lock-screen trip companion was described in its September 2026 relaunch coverage (Cyprus Mail; DomCar), so this is a clear way for Aloya to stand out.

### 8.3 Aloya today, and its gaps

- Web: notifications only; no persistent trip notification. Each alert kind uses its own tag (src/lib/trip-alerts.server.ts lines 54 to 101), so the lock screen fills with separate cards instead of one updating card.
- Native: mobile/lib/liveActivities.ts is a stub that logs and returns "activity-session-id" without calling ActivityKit; mobile/widgets/NearestStopWidget.tsx describes itself as "Conceptual" and uses mock data. No Android ongoing or Live Update notification for trips was found. The native build last errored (mobile/build_info.json).
- No watch-specific design: notification titles and bodies are not written to fit a watch face (for example "Board now." with the route only in the title).

### 8.4 Improvements

1. **One updating trip notification on the web (S, high).** A single tag per itinerary, silent updates for status (Tier 3) and re-alerting only for Tier 1 (layer 4). On Android Chrome this gives a near-ongoing card; on iOS each update replaces the previous one.
2. **Real Live Activity (M, very high).** Native module calling ActivityKit: start on trip start, update via push-to-update tokens from the server at each phase change and every 30 to 60 s while walking or near the stop, end at arrival or after the 8-hour cap. Content: phase, next action, minutes, stops remaining, and live, estimated or timetable label (layer 5).
3. **Android Live Update (M, high).** ProgressStyle notification with segments per leg and points for transfers; foreground service tied to the background location session (layer 3).
4. **Watch-first copy (S, medium).** Every Tier 1 notification must make sense in about 40 characters of title plus a short body: "Leave now: BUS 16 in 6 min", "Get off next: Eleftheria Sq". Put the route and action in the title.
5. **Home Screen widget, real data (M, medium).** Replace the mock with "Next from your stop" and "Your next trip" widgets fed by a small public endpoint; show the freshness label.
6. **Dynamic Island and Always-On (S with 2, low).** Compact presentation: route badge plus minutes; expanded: next action.
7. **Fix the native build first (M, high).** Without a working Expo build none of 2, 3, 5 or 6 can ship; treat the build as the gating task for this layer and layer 3.

## Layer 9: Accessibility (blind and low-vision riders, wheelchair users, older riders, cognitive load)

### 9.1 What the best in the world do

- **Voice-first companions.** Citymapper's voice instructions cover walking, cycling, scooting and transit so the phone can stay in a pocket (citymapper.com/news/2395). Transit's GO gives audible instructions when sound is enabled (University of Iowa Cambus guide to Transit).
- **Accessibility as data.** GTFS defines wheelchair_boarding per stop, wheelchair_accessible per trip and tts_stop_name for the spoken form of a stop name; GTFS Scorecard grades feeds on these and on route colour contrast (gtfsscorecard.org).
- **Walking speed for real people.** FHWA recommends 0.9 m/s for less capable older pedestrians, and measured means of 0.6 to 1.1 m/s for people using walkers, canes or wheelchairs (FHWA-HRT-05-099); 84% of men and 93% of women aged 65+ in England walk slower than 1.2 m/s (Asher et al. 2012).
- **The law.** The European Accessibility Act (Directive (EU) 2019/882) applies to services provided to consumers after 28 June 2025. For air, bus, rail and waterborne passenger transport it covers websites, mobile apps, e-ticketing and real-time travel information, but for urban, suburban and regional transport only interactive self-service terminals are in scope (EAA Article 2(2)(c)). Intercity bus apps and any e-commerce or ticketing in Aloya are therefore the parts most clearly covered; urban journey planning is less clearly covered but is still expected practice. The harmonised standard is EN 301 549, which references WCAG 2.1 AA (earlier-run finding).

### 9.2 Cyprus reality and data

- Intercity GTFS: 123 of 123 stops have unknown wheelchair boarding and 740 of 740 trips have unknown wheelchair accessibility; 46 stop names use abbreviations a screen reader may mispronounce with no tts_stop_name (for example "Archiep. Makariou III Ave."); 8 route badges fall below 4.5:1 colour contrast (GTFS Scorecard, 31 Oct 2026).
- Blind riders: the Pancyprian Organisation of the Blind reports that stop announcements are often not used or switched off (Paphos), that a blind person at a stop cannot tell which route is arriving, that most crossings lack audible signals or have them switched off, and that silent e-scooters are a hazard (Cyprus Mail, Nov 2024; Nea Kypros, Oct 2025; CYPRUS FAQ, Oct 2026). Unsafe old buses for blind students were reported on 21 Oct 2026 (Sigmalive).
- New smart bus stops include an audible signal for approaching buses (land.cy, Mar 2025), and the ministry says all stops will be upgraded by 2028 (CYPRUS FAQ, 15 Oct 2026).
- The Audit Office's accessibility review included the Cyprus Paraplegic Organisation (Economy Today, 14 Oct 2026).

### 9.3 Aloya today, and its gaps

Good foundations:
- Accessibility-weighted routing (src/lib/accessibility-prefs.ts): step-free, prefer shade, low floor and a soft cap on total walking, used as ranking weights not hard filters, synced across devices, with an honesty rule to expose only toggles whose effect is delivered.
- Crowdsourced stop conditions including wheelchair_access (src/lib/stop-condition.server.ts), feeding both routing and stop pages.
- Some live regions and reduced-motion handling exist (aria-live in 7 files, one reduced-motion check).

Gaps:
- No walking-pace or mobility-aid profile; all timing assumes 1.35 m/s (layer 2), which is wrong for exactly the riders the step-free setting serves.
- Haptic cues fail on iPhone web; spoken cues need an open window (layer 3).
- No "which bus is mine" announcement at the stop.
- Stop names are read as published, so abbreviations reach screen readers unexpanded.
- No published accessibility statement or WCAG 2.1 AA audit was found.

### 9.4 Improvements

1. **Mobility profile (S, very high).** Combine layer 2's pace profile with the existing step-free and walking-cap settings into one "How do you get around?" screen: walking aid, wheelchair, pram, slow walker, blind or low vision, prefer fewer changes.
2. **Blind and low-vision mode (M, very high).** Voice for every phase (leave, at stop, boarding, stops remaining, press now), the "which bus is mine" announcement using live data at the stop, large high-contrast trip card, and every control labelled for VoiceOver and TalkBack. Test with members of the Pancyprian Organisation of the Blind.
3. **Spoken stop names (S, high).** Maintain an expansion table (Archiep. to Archiepiskopou, Ave. to Avenue, Ag. to Agios or Agia) and Greek pronunciations, used for speech and aria labels; offer it to the operators as tts_stop_name.
4. **Fill accessibility data (M, high).** Crowdsource stop step-free status, shelter, seat, kerb height and audible signal, verify with photos (Aloya already has stop-photo and stop-condition endpoints), and publish the result as open data that CPT could merge into GTFS.
5. **Plain step mode (S, medium).** One instruction per screen, big type, no map unless asked, for riders with cognitive load or low digital confidence.
6. **Vehicle accessibility feedback (S, medium).** After each trip, an optional one-tap question for riders who use the mobility profile: "Was the ramp working? Were stops announced?" Aggregate per route for advocacy and for the ministry's contract monitoring.
7. **WCAG 2.1 AA audit and accessibility statement (M, medium).** Audit against EN 301 549 and publish a statement with a feedback route, which also prepares Aloya for any ticketing or intercity features that fall clearly under the EAA.
8. **Route badge contrast (S, low).** Pick the text colour automatically for 4.5:1 contrast rather than using feed colours as given.

## Layer 10: Privacy (location data done right)

### 10.1 What the best in the world do

- **Location traces identify people.** In "Unique in the Crowd", four spatio-temporal points were enough to uniquely identify 95% of 1.5 million people in a mobility dataset (de Montjoye et al., Scientific Reports 2013, PubMed 23524645). Trip origins and destinations reveal homes, workplaces, clinics and places of worship.
- **Regulators treat location as high-risk.** The EDPB's guidelines on connected vehicles stress that location data is particularly revealing, that it should be collected only when strictly needed for the service, with the option to deactivate it, and kept no longer than necessary (EDPB Guidelines 01/2020, version 2.0).
- **Consent for device access.** Under ePrivacy Directive Article 5(3), reading or storing information on a user's device needs consent unless strictly necessary for the service the user asked for; GDPR then governs the processing (earlier-run finding; DLA Piper data protection guide for Cyprus summarises the national framework).
- **Products.** Transit says GO shares the vehicle's position "anonymously" and crowdsourcing is "100% opt-in, just like Waze" (help.transitapp.com/article/93; blog.transitapp.com, 2019). Android's Transit mode asks users to turn on Timeline and "Allow all the time" location explicitly, with setup screens explaining why (Android Authority, Jan 2026). Apple's Declarative Web Push is designed partly so push does not rely on JavaScript that conflicts with tracking prevention (webkit.org/blog/16535).

### 10.2 Cyprus reality and data

- Cyprus implements GDPR through Law 125(I)/2018 and the Commissioner for Personal Data Protection supervises it (DLA Piper, Cyprus).
- Cyprus is small: a home-to-work trace in a village or small suburb identifies a person even faster than in a big city, so aggregation thresholds must be higher than in large-city products (inference from the de Montjoye result and Cyprus's population size; no Cyprus-specific study found).

### 10.3 Aloya today, and its gaps

- Good: the planned trip, not live coordinates, is what reaches the server for alerts (active_trips holds stop IDs, times and legs; src/lib/trip-sync.functions.ts lines 17 to 33), and the row is deleted when the rider ends the trip (trip-sync.functions.ts line 72). Accessibility preferences are cached locally and synced only to the user's own settings (src/lib/accessibility-prefs.ts).
- Good: crowdsourced on-board positions are accepted only from riders who tapped "I'm on board" and only for the active trip (src/routes/api/public/rider-fix.ts header), and rider_vehicle_fixes rows are purged after 2 days (supabase/migrations/20260914000000_permanent_db_retention_and_upsert.sql lines 178 to 181). They are not streamed to the R2 data lake, which receives only rt_snapshots and vehicle_pings (src/lib/lake.server.ts callers) and archived observed_arrivals (src/routes/api/public/hooks/archive-lake.ts). This corrects the earlier run's note that no retention job existed.
- Gaps:
  - No retention for abandoned trips: an active_trips row that is never explicitly ended (app closed, phone lost) has no time-to-live purge in the migrations checked.
  - The device ID is a persistent identifier sent with trips and rider fixes (deviceId in the trip-sync and rider-fix schemas); there is no rotation.
  - Layer 1's proposal adds rider state to the server. Done carelessly it would turn Aloya into a location tracker. It must be designed so the server never needs raw coordinates.
  - The privacy page exists (src/routes/privacy.tsx) but no separate consent for crowdsourcing or for background location was found, and no record of a data protection impact assessment.

### 10.4 Improvements

1. **Compute on the device, send states (M, very high).** The phone turns GPS into rider_state, a rounded distance to the next stop (50 m steps) and an ETA. Raw coordinates never leave the device for alerts. Only riders who opt in to crowdsourcing send on-board positions, and only while on board.
2. **Time-to-live on everything trip-related (S, high).** Purge active_trips rows 2 hours after the final planned arrival, purge the alert ledger with the trip, and keep rider_vehicle_fixes at 2 days or less. Add an automatic test that fails if a new table holding device-linked location has no purge.
3. **Rotating identifiers (S, high).** Use a per-trip random ID for server-side trip state and push routing, separate from the long-lived device ID, and a separate rotating ID for crowdsourced fixes so one device's rides cannot be linked across days.
4. **Separate, plain consents (S, high).** Three switches, each off until chosen: "Use my location during trips" (needed for smart alerts), "Share my bus's position while I ride to improve times for everyone" (crowdsourcing), "Learn my usual trips" (commute learning, layer 1 step 8, stored on device). Native background location only with "while using" plus the platform indicator, never "always", unless the rider turns on commute alerts.
5. **Aggregate before analysis (M, medium).** Any travel-pattern statistic (for partners or the ministry) is aggregated by stop pair and hour with a minimum count before release, and never includes trip ends finer than the stop.
6. **DPIA and records (M, medium).** Write a data protection impact assessment for live location features and crowdsourcing, list processors (Supabase, Cloudflare, push services), and publish retention periods on the privacy page.
7. **Delete my data (S, medium).** One button that removes device-linked rows (active trip, settings, stop reports, fixes) and revokes push subscriptions.


# Part B: Routing intelligence (layers 11 to 20)

Researched and written 31 October 2026. Code references are to repo programmeradu/aloyacy-8f3d9cd7, branch redesign-roam, read at commit 5d818e8 (HEAD moved to 56dab8f during the work, a journeys UI fix). Cyprus timetable figures come from the seven official GTFS feeds published at motionbuscard.org.cy (feed version dated 20261031, valid 31 Oct 2026 to 28 Jan 2027), analysed for Tuesday 3 November 2026 with the script saved at work/partb-better-stop-analysis.py.

Effort scale: S = days, M = one to three weeks, L = a month or more. Impact: Low, Medium, High, Very high.

## Layer 11: True multimodal routing: any mode joins any transit leg, anywhere, including mid-trip, and keeps re-optimising

### 11.1 What the best in the world do

**The algorithms.**

- **RAPTOR and McRAPTOR.** Delling, Pajor and Werneck introduced RAPTOR (Round-bAsed Public Transit Optimized Router) at ALENEX 2012, later in Transportation Science 49(3), 2015. It works directly on the timetable in rounds, one round per extra vehicle, scanning each route at most once per round, and needs no preprocessing, so it copes with live delays. McRAPTOR keeps a "bag" of Pareto-optimal labels per stop so it can optimise extra criteria such as walking or fare. [48][84]
- **MCR (multimodal McRAPTOR).** Delling, Dibbelt, Pajor, Wagner and Werneck ("Computing Multimodal Journeys in Practice", SEA 2013) extended McRAPTOR to unrestricted walking, cycling, bike share and taxi. Each round has a timetable phase and a phase that runs a multi-label Dijkstra on the street networks. Picking up a hire bike counts as a "trip", so bike share sits between buses exactly like another vehicle. They argue users optimise three things: arrival time, convenience (number of trips, walking) and cost. Because the full Pareto set is too large, they score it with fuzzy dominance and show only the top few. Their London tests found that limiting transfer walks to 10 minutes barely hurt quality, but also limiting the first and last walk to 15 minutes badly hurt it (the heuristic MCR-t10-r15 matched only 38% of the reference top three). With taxis added, an all-taxi journey dominates unless cost is a criterion. [85]
- **CSA (Connection Scan Algorithm).** Dibbelt, Pajor, Strasser and Wagner (JEA 23, 2018) store every connection (a vehicle going from one stop to the next) in one array sorted by departure, and scan it once. It adapts trivially to delays and has a variant (MEAT) for expected arrival under uncertain delays. [86, 87]
- **ULTRA (UnLimited TRAnsfers).** Baum, Buchhold, Sauer, Wagner and Zündorf (ESA 2019; Transportation Science 2023) precompute a small set of "transfer shortcuts" over an unrestricted walking, cycling or e-scooter graph, so RAPTOR, CSA or Trip-Based routing can use unlimited transfers with no speed loss. Initial and final transfers use Bucket-CH. On Germany, ULTRA-CSA answered in 142.5 ms against 1,696 ms for multimodal CSA. [88][89, 90]
- **Bike share with ULTRA.** Sauer, Wagner and Zündorf (SEA 2020) handled several competing bike-share operators, either by tracking which operator's bike the rider holds or by expanding the network per operator. [91]
- **McULTRA, McTB and HydRA.** Potthoff and Sauer (ALENEX 2022; ATMOS 2022) showed that time spent in each non-scheduled mode must be its own criterion, otherwise sensible "less walking, one more bus" answers disappear. Their "multimodal discomfort scenario" forbids switching mode in the middle of a single transfer, adds a fixed overhead per mode (they used 300 s for an e-scooter, 0 s for walking, scooter 15 km/h, walking 4.5 km/h), and computes a "restricted Pareto set" (journeys within 25% of an anchor journey's trips and duration). UBM-HydRA answers in about 30 ms on London, Switzerland and Stuttgart. They argue cars should be access or egress modes only, not transfer modes, because car legs cause a combinatorial explosion of poor journeys. [92, 93]
- **Non-scheduled lines.** SEA 2022 work integrates lines with fixed stop sequences but no timetable (on-demand), and bike share, into Trip-Based routing. [94]
- **Hypergraph models.** López and Lozano (Transportation Research Part A, 2020) compute shortest hyperpaths in a multimodal hypergraph where some lines publish real-time arrivals: a hyperpath is a strategy ("board whichever of these lines comes first") rather than one fixed path. TERP (IEEE IoT Journal, 2019) builds a London network with bus, tube, bike-share stock and walking, optimising duration and reliability together. [95][96]

**Continuous en-route re-optimisation (Samuel's addition).**

- Abuaisha, Shen, Harabor, Stuckey and Wallace ("Dynamic Replanning for Improved Public Transport Routing", IJCAI 2025) formalise exactly what Samuel describes. Key observation: a rider can only act at a stop, so replanning just before arriving at every stop is the finest useful granularity. They compare static plans, a single snapshot replan, replanning only when your own journey is delayed, and full dynamic replanning at every stop. Against a single snapshot replan, full replanning changed the outcome for 20% to 66% of queries depending on city and saved 10.6 to 30.2 minutes on average for those. Even against "replan only when my journey is late", it still saved 4.6 to 6.0 minutes on 10% to 21% of queries, because another line running late can create a newly catchable, faster connection. Their "push" design has the server compute an envelope (only the connections that could still beat the current arrival time, 2.8% to 7.5% of the timetable), send it to the phone, and let the phone re-run CSA locally whenever delay updates arrive; the server is called again only when the rider's own journey slips (3.7% to 6.0% of stops). Pushed data averaged 1.4 to 4.8 MB per journey on cities far larger than Cyprus. [97]
- Transit (the app) GO "will automatically reroute you if you miss your bus" and tells you to walk faster to make a connection; Citymapper GO gives get-off alerts that work offline and reroutes walks. Neither publicly documents proactive "get off early for a faster line" advice. [98][54, 6]
- Moovit Assistant (August 2026) analyses route options in real time and flags short transfer times. [99]

**Engines that already do multimodal.** OpenTripPlanner 2 supports bike, scooter and car rental from GBFS (including a GBFS v3 manifest directory) and the "keep the vehicle at the destination" option. [100] MOTIS and Transitous are covered in layer 14.

### 11.2 The reality in Cyprus

- **Timetables.** Seven GTFS feeds: Nicosia NPT (1,778 stops, 194 routes), Limassol EMEL (1,401 stops, 254 routes), Larnaca LPT (1,040 stops, 133 routes), Paphos OSYPA (889 stops, 112 routes), Famagusta OSEA (446 stops, 53 routes), Intercity (123 stops, 60 routes) and Pame Express (23 stops, 2 routes): about 5,700 stops in all. None ships transfers.txt, frequencies.txt or pathways, and calendars come only as calendar_dates.txt. On Tuesday 3 Nov 2026 the Nicosia feed runs 2,244 trips. (Own analysis of the 20261031 feeds.)
- **Sparse service is the norm.** In the morning peak (07:00 to 09:00) the median served stop sees 3 departures in Nicosia, 2 in Limassol and 1 in Larnaca and Paphos. 70% of Nicosia's served stops, and 80% to 88% in Limassol, Larnaca and Paphos, have four or fewer departures in those two hours, a gap of 30 minutes or more (layer 12 table). This is why mode mixing matters more in Cyprus than in London: when the next bus is 30 to 60 minutes away, a 6-minute scoot to a different line is often the fastest answer.
- **Non-scheduled modes.** Nextbike is the docked bike share in Limassol, Nicosia, Larnaca, Paphos and Famagusta, with a public live feed and an official GBFS (layer 15). Bolt operates e-scooters in Nicosia with 255 mandated parking zones published on the Cyprus National Access Point (CyNAP) as Datex II; live scooter positions are not public. Taxis and Bolt rides exist island-wide.
- **Live data.** One GTFS-RT feed covers the buses (with per-operator endpoints), served on a plain HTTP port that Cloudflare fetch() refuses; Aloya reaches it by raw TCP socket (src/lib/gtfs-rt.server.ts).

### 11.3 Aloya today, and the gaps

What exists:

- One planner endpoint: /api/public/plan calls planMultiLeg (src/lib/multileg.functions.ts), which merges a live planner driven by the GTFS-RT feed (about the next 60 to 90 minutes) with a scheduled RAPTOR over per-date timetable shards. Because Workers Free allows only 10 ms CPU, the browser can run the timetable RAPTOR itself (schedule-client.ts) and send the results, which the Worker then checks against real walking routes.
- RAPTOR tuning (packages/core/src/raptor-core.ts): up to 5 rides, access walk up to 2 km (3 km on trips over 12 km), egress up to 3 km, transfer walks up to 600 m and 6 neighbours, minimum transfer buffer 90 s, walking at 1.35 m/s with a 1.35 detour factor on straight-line distance.
- A careful cost model (packages/core/src/plan-score.ts) that prices each change by the real headway of the line being joined, plus Pareto filtering on arrival, changes and walking.
- Mode alternatives: Nextbike "cycle instead" (src/lib/bikeshare.functions.ts), Bolt "scoot it" (src/lib/bolt-scooter.functions.ts), last-mile taxi (src/lib/last-mile-chain.functions.ts) and park and ride (src/lib/park-and-ride.functions.ts).
- On the trip: a phase machine (src/lib/useMultiLegJourney.ts), disruption signals (src/lib/useDisruptionWatch.ts: running late over 5 min, pre-board late over 8 min, connection at risk under 60 s, missed connection, lost feed), a swap to a different stop of the same route if the rider walks to it (src/lib/wrong-stop-reroute.ts), a "you are already near, just walk" shortcut under 250 m (src/lib/useShortcutDetector.ts), and a re-plan from your position on request (src/lib/reroute.functions.ts).

The gaps:

1. **Modes never combine inside one itinerary.** The Itinerary type allows only ride, walk and wait legs (packages/core/src/itinerary-types.ts). Bike and scooter are whole-trip alternative cards that compete with the bus, never feed it. "Scoot 1.5 km to the 15-minute line, then bus" or "bus, then Nextbike the last 2 km" cannot be produced.
2. **Fixed walking radii stand in for an unrestricted transfer graph.** Transfers are capped at 600 m straight-line with at most 6 neighbours, and walk time is a haversine guess until refined. Nothing faster than walking ever feeds a stop.
3. **Criteria merged into one score.** Time on foot is folded into a single score, so "a little more walking, one fewer bus" alternatives can vanish (the problem McULTRA was written to fix).
4. **No continuous re-optimisation.** Re-planning on a trip is reactive and manual: offered after a disruption signal, run only when the rider taps it. Nothing checks, at each stop, whether a delayed or newly reachable line now beats the plan, whether a different transfer stop is better, whether getting off early and switching lines is faster, or whether a scooter or bike mid-trip now wins. The IJCAI 2025 results suggest this is where most of the remaining minutes are.
5. **Live planner horizon.** The live search only sees the next 60 to 90 minutes of RT data, and live and scheduled results are merged afterwards rather than one search running on a timetable patched with live delays.

### 11.4 Improvements

1. **Add bike, scooter and ride legs to the itinerary model.** New leg kinds: `cycle` (Nextbike, pickup and return station, unlock 90 s and return 60 s overheads as the bikeshare code already assumes), `scoot` (Bolt, start and end in a CyNAP parking zone, 300 s overhead following Potthoff and Sauer) and `ride_hail` (taxi or Bolt, first or last leg only, per the HydRA paper's advice on car modes). UI pieces already exist for each mode. Data: Nextbike GBFS, CyNAP boltstations, Mapbox cycling profile. Effort M. Impact Very high.
2. **MCR-style rounds in the existing RAPTOR.** After each round's route scan, add a micromobility relaxation phase: from every stop improved this round, find Nextbike stations within 400 m that have bikes, ride to every station within 4 km that has free docks and lies within 400 m of a stop, and write labels into the same round with a `cycle` leg. Same for scooter zones. Count picking up a bike as a trip, as MCR does. Precompute station-to-stop and station-to-station times offline (a few thousand pairs per city) into the shard so the Worker does no routing. Effort M. Impact Very high.
3. **Separate criteria for time on foot and time on wheels** (McRAPTOR bags with arrival, trips, walk seconds, micromobility seconds), then pick the three to five shown with the fuzzy dominance score of Delling et al., using their published fuzziness values as a start: walking (0.8, 5 min), arrival (0.8, 1 min), trips (0.1, 1). Effort M. Impact High.
4. **Precomputed ULTRA-style shortcuts for Cyprus.** With about 5,700 stops, run the KIT ULTRA code (MIT licence, github.com/kit-algo/ULTRA) offline in GitHub Actions on each new timetable to compute walking and e-scooter transfer shortcuts, and ship them in the daily shard. This replaces the 600 m, 6-neighbour cap with exact, unlimited transfers at no query cost. Effort M. Impact High.
5. **Server-built envelope, on-phone continuous replanning (the "push" design).** At trip start, the Worker computes the journey plus an envelope: every connection that could still beat the planned arrival, using lower-bound travel times between stops (two Dijkstra searches on a precomputed time-independent stop graph, as in [97]). The phone stores it and re-runs a small CSA locally whenever a GTFS-RT update arrives and always just before each stop. The Worker is called again only when the rider's own plan slips. This fits the 10 ms Worker CPU limit because the heavy work runs on the phone. Effort L. Impact Very high.
6. **Phase-aware re-optimisation rules for multi-stop trips.** Run the local replan at these moments, each with its own candidate actions:
   - before boarding: a later departure from a better stop, a scooter to a faster line (layer 12), leave-later advice;
   - on the first bus, about two stops before each stop: "get off here and change to line X" when X reaches the destination earlier by at least 4 minutes after an honest change cost;
   - approaching the planned transfer: an alternative transfer stop earlier or later on the current line where the connection is safer or faster (the envelope already contains these connections);
   - during the transfer wait: a different first-arriving line (hyperpath logic: "take whichever of 22 or 26 comes first"), or a Nextbike or scooter if the connecting bus is now late;
   - after the transfer: the same checks for the remaining legs, plus the existing "just walk" shortcut.
   Alert only when the gain is above a threshold and the action is possible right now (doors, stop ahead), and at most once per stop. Effort M on top of item 5. Impact Very high.
7. **One search on a live-patched timetable.** Replace "live planner plus scheduled planner, merged afterwards" with one timetable search where trip times are overwritten by GTFS-RT predictions where present and by learned delays (planner-learning.server.ts) elsewhere. CSA and RAPTOR both take this naturally. Effort M. Impact High.
8. **Mid-trip micromobility offer with live stock check.** When a connection breaks or a better option appears, check live Nextbike stock at the alighting stop and docks near the destination before offering "cycle the rest", and deep link to Nextbike or Bolt (links exist in src/lib/mobility-links.ts). Effort S. Impact High.
9. **Strategy cards, not only paths.** For corridors served by several lines sharing a section, show "board the first of 22, 26 or 41 here" with a combined expected wait, as in hyperpath routing. Effort S to M. Impact Medium to High in Nicosia and Limassol centres.
10. **Benchmark harness.** Store 500 real anonymised origin and destination pairs and replay them nightly, logging arrival, changes and walking, so every tuning change is measured (the MCR and HydRA papers report coverage of a reference Pareto set; reuse that metric). Effort S. Impact Medium, protects everything above.

## Layer 12: "Go to a better stop": frequency- and speed-aware access by walking, cycling, scooting or a ride

### 12.1 What the best in the world do

**What riders actually do.** The evidence that people go further for better service is strong and consistent:

- Stated preference across cities (Mulley, Ho, Ho, Hensher and Rose, Transport Policy 69, 2018): riders would walk 226 m to 302 m further in Australian capitals, and 370 m to 475 m further in the UK and US, for a 10-minute cut in headway. [102, 103]
- A Porto Alegre study found 520 m extra walking accepted for 10 minutes less waiting. [104]
- In a survey of 1,402 bus users, half were willing to walk further (on average 521 m) to their usual stop if frequency improved. [105]
- Dutch stated preference (879 respondents): bus frequency at the stop and street lighting on the route are the strongest influences on the maximum distance people will walk. [106]
- Dublin: catchments of high-quality bus services reached over 1,400 m, comparable to or larger than light rail and metro; 65% of bus trip origins were more than 500 m from the stop. [107]
- Montréal (McGill): each extra minute of waiting reduces the distance users walk by a little over 2 m on average, and distances walked to buses are shorter than to rail. [108]
- Tram feeder study: median walking feeder distance 380 m, median cycling feeder distance 1,025 m, so cycling roughly triples the useful catchment. [109]

**How waiting really works.** The classic "expected wait = half the headway" assumes random arrivals and perfectly regular buses. The general formula is E[W] = E[H]/2 x (1 + Var(H)/E[H]^2), so irregular service makes the wait longer than half the headway. [110] Real riders time their arrival at longer headways: Austin data put the switch from random to non-random arrivals at an 11-minute headway [111]; Zürich found some people consult schedules even at 5-minute headways [112]; London bus stops with 6 to 31 minute headways showed waits about 30% lower than random arrival would give. [113] For an app that knows the timetable and live position, the rider can wait at home or at their desk, so the honest cost of a sparse stop is not the wait at the kerb but a later arrival at the destination, plus the risk of missing the one bus.

**Strategies over single lines.** Spiess and Florian's "optimal strategies" (Transportation Research B, 1989) formalise choosing an attractive set of lines at a stop and boarding the first to arrive: combined waiting depends on combined frequency, and a line is added to the set only if it lowers expected total time. This is how a stop served by four lines that all go your way beats a nearer stop served by one. [114]

**How apps present it.** Planners such as OTP2, MOTIS and Google consider all stops within an access radius and let the search choose, then label the result. I found no major consumer app that publicly documents an explicit "the bus here is in 34 min; walk 6 min to the avenue where buses come every 10 min" comparison card; this is an open opportunity rather than a copied feature.

### 12.2 The reality in Cyprus

Own analysis of the official GTFS (feeds of 31 Oct 2026, weekday 3 Nov 2026, departures 07:00 to 09:00, counted per stop and direction as GTFS stores them):

| City (operator) | Served stops | Median departures 07:00 to 09:00 | Stops with 4 or fewer (30 min or worse) | Stops with a stop within 400 m that has at least twice the departures (and at least 6) | Same within 800 m |
|---|---|---|---|---|---|
| Nicosia (NPT) | 1,764 | 3 | 70% | 15% | 32% |
| Limassol (EMEL) | 1,384 | 2 | 80% | 13% | 28% |
| Larnaca (LPT) | 993 | 1 | 88% | 9% | 18% |
| Paphos (OSYPA) | 886 | 1 | 85% | 10% | 22% |
| Famagusta (OSEA) | 441 | 3 | 65% | 6% | 15% |

Reading: in Nicosia, roughly one served stop in three has a much better stop within 800 m (a 10-minute walk, or about 3 minutes on a bike or scooter). That is the "better stop" opportunity in numbers. The counts ignore direction of travel to a specific destination, which the trip-specific scoring below handles, so treat them as the size of the opportunity, not as guaranteed savings.

Access modes available:

- Nextbike Cyprus (31 Oct 2026 snapshot of its public live feed): 96 stations in Limassol, 89 in Nicosia, 48 in Larnaca, 44 in Paphos, 35 in Famagusta, with 877 bikes available island-wide. Nextbike also publishes an official GBFS v2 feed (system id nextbike_cy, CC0 licence). [115][116]
- Bolt e-scooters in Nicosia: the CyNAP Datex II feed (publication time 30 Oct 2026) lists 255 Bolt parking zones with a stated total capacity of 1,779 places; live vehicle positions are not public. [51, 117]
- Bolt rides and taxis for a short car hop to a strong corridor.

### 12.3 Aloya today, and the gaps

What already helps:

- The timetable RAPTOR considers stops up to 3 km from the origin. It keeps the nearest 8, plus extra bays of the same station, plus any stop that adds a route not yet in the set, up to 48 (packages/core/src/plan-candidates.ts; src/lib/raptor-plan.ts). Stops beyond 2 km are admitted only for intercity coaches on trips over 12 km, or when the nearby stops have fewer than 3 departures in the next 2 hours. So a further stop with an earlier arrival can already win.
- headway-chance.ts models the wait at a stop from observed gaps; plan-score.ts prices change risk by the joined line's measured headway.

The gaps:

1. **Candidate stops are chosen by distance and route novelty, not by frequency or speed.** A nearer stop of the same route is never displaced by a slightly further stop where an express or a second line also calls, unless that line is "new" to the set. There is no per-trip "useful departures in the next 30 minutes" test.
2. **Only walking reaches the first stop.** A stop 1.2 km away is a 15-minute walk but a 4 to 5 minute Nextbike or scooter ride; the planner never considers that.
3. **The ranking leans against the better stop.** Above 600 m of total walking the rank adds 0.5 s per metre on top of the 0.2 s per metre walking effort (plan-score.ts). A 1,200 m walk to a frequent stop therefore carries about 540 s of penalty before its time saving counts, which can hide exactly the option Samuel wants.
4. **No explanation.** The rationale tags (itinerary-rationale.ts) include "fastest", "leaves sooner" and "less walking", but nothing says "your nearest stop has its next bus in 34 min; this stop has 4 lines towards the centre". Without that contrast the rider does not understand why the app sends them further.
5. **Robustness is not priced at the first stop.** Missing the one bus at a stop served every 40 minutes costs 40 minutes; missing one of four lines at a busy stop costs a few. The change-risk logic exists for transfers but not for the first boarding.

### 12.4 Improvements, with the scoring logic

**The scoring logic (core of this layer).** For a request at time t from origin O to destination D, build access options (stop s, mode m) where m is walk, own bike, Nextbike, Bolt scooter or ride-hail, and score each by door-to-door generalised cost, computed by the planner itself rather than by a separate heuristic:

GC(s, m) = T_access(m, O, s) + K_mode(m) + W(s, t + T_access) + T_onward(s, D) + R(s) + C_money(m) x VoT + E_effort(m)

- T_access: street-network time. Walking 1.35 m/s with the existing detour factor until the walk router answers; Nextbike 16 km/h (current Aloya assumption) plus walks to and from stations; scooter 14 km/h (current Aloya assumption) from a Bolt zone within 300 m; ride-hail from the Mapbox driving-traffic ETA plus pickup wait.
- K_mode: fixed overheads. Nextbike unlock 90 s and return 60 s (already in bikeshare.functions.ts); scooter 300 s as in Potthoff and Sauer (layer 11, ref 8); ride-hail pickup wait.
- W(s, t'): expected wait for the first useful departure from s, where "useful" means a trip that reaches D (the planner knows this). With live predictions, use the predicted departure and a probability of catching it from the access-time spread. Without, use the timetable; for a strategy of several lines, use combined frequency (Spiess and Florian). Because Aloya can tell the rider when to leave, waiting at home is free, so W only counts the wait at the kerb when the rider asked to leave now.
- T_onward: the rest of the journey from the planner.
- R(s): robustness. Probability of missing the target departure times the gap to the next useful departure. Reuse changeRiskSec from plan-score.ts so first boardings and transfers are priced alike.
- C_money: Nextbike, Bolt and taxi prices; the bus fare is the same at both stops, so it cancels. Value of time is the rider's choice (default zero for walking and own bike).
- E_effort: the existing walking effort term, plus a smaller per-metre term for cycling and scooting, with a heat surcharge when the Open-Meteo temperature is high (Cyprus summers matter).

Decision rule for a "better stop" card: the best non-nearest option must beat the plan from the nearest stop by at least max(5 minutes, 15% of journey time) in arrival, or cut the wait at the kerb by at least 10 minutes when the rider is leaving now, and must not add a change. If the nearest stop's plan is within 2 minutes, stay quiet. (Thresholds are starting values to tune with the benchmark harness, not measured facts.)

Improvements:

1. **Frequency-aware candidate selection.** In selectCandidateStops, add a third admission rule: admit a stop within the access radius when its useful departures towards the destination in the next 30 minutes are at least twice those of every nearer admitted stop, or when it serves a line whose in-vehicle time to D is at least 25% shorter. Uses the shard's stopTrips (already loaded). Effort S. Impact High.
2. **Multi-mode access phase before round 1.** Seed RAPTOR labels at stops reachable by Nextbike (station with bikes within 400 m of O, station with free docks within 300 m of s), by scooter (Bolt zone near O and near s, Nicosia only) and by ride-hail (only within 4 km, only if it saves at least 10 minutes over walking access, given the HydRA paper's warning about car modes). Each seed carries its mode and cost. Precompute Nextbike station-to-stop times per city offline. Effort M. Impact Very high.
3. **Rebalance the walking premium for access.** Keep the walking effort, but drop the extra 0.5 s per metre over 600 m for the first walk when that walk ends at a stop with at least twice the useful frequency. Validate with the layer 11 benchmark harness. Effort S. Impact High.
4. **"Better stop" contrast card.** When the rule fires, show: "Nearest stop, 2 min walk: next bus 34 min. Better: walk 7 min or scoot 3 min to [stop], 3 lines every 8 to 12 min, arrive 19 min sooner." Add a rationale tag kind "better-stop" with minutes saved and line count. Effort S. Impact Very high (the feature riders will notice).
5. **First-boarding robustness.** Price R(s) for the first ride with the same headway-based risk as transfers, and prefer strategy stops ("any of 22, 26 or 41") when two options are close. Effort S. Impact Medium to High.
6. **Live check before suggesting micromobility.** Read Nextbike's official GBFS station_status for bikes and free docks at both ends; for Bolt, say "check availability in Bolt" since stock is not public, and deep link. Effort S. Impact High.
7. **Heat, light and safety aware access.** Use Open-Meteo temperature for a summer walking surcharge and, after dark, prefer lit main-road walks (the Dutch study found lighting second only to frequency). Street lighting can be approximated from OSM `lit=*` tags where mapped. Effort M. Impact Medium.
8. **"Leave later from the good stop" alternative.** When the better stop's next good departure is far off but the nearest stop's is near, also show "or leave in 12 min and walk to the frequent stop", so the rider waits at home rather than at the kerb. Effort S. Impact Medium.
9. **Learn each rider's tolerance.** Record when a rider accepts or ignores better-stop suggestions and adjust their personal walking and cycling thresholds (layer 20). Effort S. Impact Medium.
10. **Publish a "frequent stops" map layer.** From the same analysis, colour stops by peak departures and show a 10-minute walk ring around strong stops on the home map, so riders learn their good stops without planning. Effort S. Impact Medium.

## Layer 13: Reliability-weighted and probabilistic routing

### 13.1 What the best in the world do

- **Minimum expected arrival time (MEAT) and decision graphs.** Dibbelt, Strasser and Wagner (ATMOS 2014) compute not one path but a decision graph of every stop and vehicle that might be relevant, with delays modelled stochastically, minimising expected arrival while bounding the latest arrival over all sub-paths, and show how to present it compactly. The Connection Scan Algorithm paper (JEA 2018) includes a MEAT variant. [119][86]
- **Backup itineraries.** Redmond, Campbell and Ehmke (European Journal of Operational Research 300(3), 2022) maximise the probability of reaching the destination within a travel time budget, choosing a primary itinerary plus backups for each transfer that might fail. [120]
- **Learning from the past.** Böhmová et al. (ATMOS 2013, 2015) computed reliable journeys from historic delay data in Zürich. [121]
- **Dynamic replanning beats static backup plans.** The IJCAI 2025 study (layer 11) notes that precomputed backup plans miss earlier-arrival opportunities that live replanning catches; the two are complementary: a robust plan first, then replanning. [97]
- **Delay-robust multimodal routing.** Bez and Sauer (2023) made ULTRA delay-robust so shortcuts stay valid under delays up to a bound. [122]
- **Empirical delay in a production engine.** OpenTripPlanner 2.9 added an Empirical Delay module (contributed by Entur): historical p50 and p90 delay per trip and stop, by day-type calendar, used to add realistic transfer buffers, rank alternatives by historical reliability and adjust predictions beyond the real-time horizon, and to tell riders "90% of the time this bus arrives within 5 minutes of schedule". [123]
- **Connection scores shown to riders.** Bahn-Vorhersage shows a "connection score" for German trains computed from machine-learning delay predictions and transfer time; a 90% score means a 10% chance that at least one connection fails. Bahnsparer shows a calibrated reliability value and a "9 out of 10 by" arrival time from past trips. The DB Navigator labels connections "expected to be reached" and can filter to "only connections that can still be made". [124][125][126]
- **Prediction uncertainty in the data standard.** GTFS-Realtime StopTimeEvent has an optional `uncertainty` field; omitted means unknown. [127]
- **Bus delay distributions are skewed.** The IJCAI 2025 study used exponential delays with mean 5 min off-peak and 10 min peak for buses in mixed traffic, a reasonable prior when local data is thin. [97] Classic waiting-time theory adds headway variance: E[W] = E[H]/2 x (1 + Var(H)/E[H]^2). [110]

### 13.2 The reality in Cyprus

- A snapshot of the Cyprus GTFS-RT feed taken on Saturday 31 Oct 2026 at 19:43 EET held 275 trip updates and 166 vehicle positions, with 4,736 stop time updates. None carried the `uncertainty` field, none carried occupancy, and the feed had no service alerts. In that snapshot the predicted delay across stop events had a median of 20 s and a 90th percentile of 577 s (about 9.6 minutes), with extremes from 47 minutes early to 85 minutes late. This is a single evening snapshot, not a performance statistic, but it shows that the tail matters far more than the median. (Own decode of http://20.19.98.194:8328/Api/api/gtfs-realtime.)
- Peak service at most stops is every 30 minutes or worse (layer 12), so missing one bus or one connection usually costs a whole headway.
- No official punctuality statistics per line are published, and the operators' GTFS has no transfers.txt with guaranteed or timed connections.

### 13.3 Aloya today, and the gaps

Aloya already collects more ground truth than most apps of its size. The D1 schema (migrations-d1) holds `observed_arrivals`, `arrival_truth`, `eta_predictions`, `eta_accuracy` (MAE, median absolute error, bias and band hits by route, hour, day and horizon), `delay_stats` (mean and standard deviation by route, stop, hour and day of week), `headway_observations` (scheduled versus observed headway, bunching count), `segment_runtimes`, `dwell_stats` and `feed_truth_delta`.

How it is used:

- reliability.functions.ts turns delay_stats into an on-time percentage per route, modelling each bucket as a normal distribution with on-time defined as within 120 s, and refuses to rate below 30 weighted samples.
- planner-learning.server.ts rescales itineraries with mean delays, mean segment runtimes, dwell and feed truth.
- plan-score.ts adds 0.5 x "observed lateness seconds" and a headway-based change risk.
- headway-chance.ts uses an exponential survival curve for "no vehicle on the row" waits.
- useDisruptionWatch.ts warns when a connection's margin falls under 60 s.

The gaps:

1. **The planner uses means, not distributions.** Standard deviations exist in delay_stats but the planner does not use them, so a connection that works on average but fails one time in three looks safe.
2. **A normal distribution is the wrong shape for bus delays,** which are right-skewed with long tails (the snapshot above, and the exponential model in the literature). The on-time percentage can be optimistic.
3. **No probability of making each connection** and no probability of arriving by a deadline is computed or shown, although arrive-by promises are a product feature.
4. **No percentile arrival ("9 times in 10 you arrive by 08:52").**
5. **No backup per transfer.** If a connection fails, the plan has no pre-computed fallback; the rider waits for a manual replan.
6. **Calibration loop not closed.** eta_accuracy measures the error of shown predictions, but the error distribution is not fed back as an uncertainty band into planning and alerts.

### 13.4 Improvements

1. **Store percentiles, not just mean and standard deviation.** Add p50, p80 and p90 delay columns to delay_stats (computed nightly from arrival_truth with a streaming quantile sketch, or sorted samples per bucket), following OTP's Empirical Delay format so the data can also be published (layer 15). Effort S. Impact High.
2. **Connection success probability.** For each change, P(make it) = P(feeder arrival delay + walk time < connecting departure delay + slack), computed from the two empirical delay distributions (convolution of histograms, cheap at 30-second bins). Use live predictions when present, widened by the measured prediction error for that horizon from eta_accuracy. Effort M. Impact Very high.
3. **Rank by a risk-adjusted arrival.** Replace "arrival + 0.5 x mean lateness" with expected arrival including failure branches: E[arrival] = P(make) x arrival_if_made + (1 minus P(make)) x arrival_of_best_fallback (the next useful departure or an alternative line from the envelope). This is MEAT in miniature and fits RAPTOR post-processing because Cyprus results are few. Effort M. Impact Very high.
4. **Show "9 in 10 by" times and connection scores.** On each option: "Usually 08:41, 9 in 10 by 08:52" and per change "Connection: likely (85%)". Only show when backed by at least 30 samples (the existing reliability rule). Effort S. Impact High.
5. **Arrive-by planning on p90, not mean.** For arrival promises, choose the latest departure whose p90 (or a rider-chosen confidence) arrival meets the deadline. arrival-promise already replans on the server; give it the percentile model. Effort S. Impact High.
6. **Per-transfer backup in the itinerary.** Attach to each change "if you miss it: next 26 at 08:24, or walk 4 min to line 41 at 08:19", computed from the same envelope as layer 11. The live trip shows it the moment connection risk rises, without a server call. Effort M. Impact High.
7. **Use skewed distributions in reliability.functions.** Replace the normal model with empirical quantiles (or a fitted log-normal or gamma when samples are few), calibrate against arrival_truth, and report the calibration error on the internal QA page. Effort S. Impact Medium.
8. **Prediction confidence bands.** Derive an uncertainty per prediction from eta_accuracy (by route, hour, horizon) and use it in alerts and in P(make). If the operator's feed ever adds the GTFS-RT `uncertainty` field, use it. Effort S. Impact High.
9. **Headway regularity in waits.** Use headway_observations (observed versus scheduled, bunching) in the waiting-time formula with variance, so irregular lines are priced honestly at first boarding and at transfers. Effort S. Impact Medium.
10. **Rider risk preference.** A setting "in a hurry / must be on time / relaxed" that changes the percentile used (p50, p90, p95) and the transfer slack, remembered per routine (layer 20). Effort S. Impact Medium.

## Layer 14: Routing engines for Aloya on a free Cloudflare budget: OTP2, MOTIS 2, R5, Valhalla, GraphHopper, Navitia, Transitous

### 14.1 What the best in the world do, engine by engine

| Engine | What it is | Multimodal and real-time | Hosting needs | Fit for Aloya |
|---|---|---|---|---|
| **OpenTripPlanner 2** (Java, LGPL) | The most widely deployed open journey planner (Entur in Norway, Digitransit in Finland). RAPTOR-based transit search. | GTFS, NeTEx, GTFS-RT, SIRI, GBFS rental (including the GBFS v3 manifest directory), park and ride, GTFS-Flex (sandbox), fares, ride-hailing, emissions, and since 2.9 Empirical Delay (p50 and p90 delays). [100][123] | Memory-hungry: "from less than one GB to more than 100 GB"; all of Finland takes a bit over 10 GB, Germany 95 GB. Single-thread speed and CPU cache matter. Entur runs c4-standard-8 instances. [129] | Excellent features; Cyprus is small, so it would likely fit in a few GB, but it needs a JVM server running all the time. |
| **MOTIS 2** (C++, MIT) | Modular Open Transportation Information System; powers Transitous. | OSM, multiple GTFS and NeTEx feeds (including GTFS-Flex and Fares v2), GTFS-RT, SIRI-ET/SX/FM, VDV 454, GBFS with geofencing, station status and vehicle availability; routing, geocoding, reverse geocoding and map tiles in one binary; REST API with OpenAPI spec and a JS client. "Optimised for high performance with low memory usage"; a full year of timetable costs barely more RAM than a month. [130] | Single binary: `motis import` then `motis server`. Smallest footprint of the full-featured engines. | Best technical match for a self-hosted, low-cost Cyprus planner. |
| **Transitous** (community MOTIS 2 instance) | Free, global MOTIS 2 API at api.transitous.org, run by volunteers. | Already ingests all seven Cyprus operators' GTFS (via Transitland) and per-operator GTFS-RT endpoints `.../gtfs-realtime/{2,4,5,6,9,10,11}`. No Cyprus GBFS yet. [131][132] | None for Aloya. | Policy: only open-source, non-commercial, low-resource projects; over 720 `/plan` requests per day needs coordination; commercial use not allowed. [131] Aloya is MIT-licensed but has paid (Pro) features, so production use is not appropriate; testing, benchmarking and contributing data are. |
| **R5** (Java, MIT) | Conveyal's engine for accessibility analysis. | Multimodal, departure-time windows. | JVM. | Conveyal's maintainers say R5 is focused on analysis, not passenger-facing journey planning; point-to-point routing is second-class. [133] Use it (or r5r) for network analysis, not for the app. |
| **Valhalla** (C++, MIT) | Road routing engine with a `multimodal` costing that combines walking and GTFS transit. | No GTFS-Realtime support and no plans from the core team ("Commercial interest in public transit is sadly pretty low"). Transit service days limited to 60 days from tile creation. [134][135] | Small, tiled. | Good for walking, cycling and driving legs (it could replace Mapbox for walk and bike routing), not for the transit core. |
| **GraphHopper** (Java, Apache 2.0) | Road routing plus a `reader-gtfs` public transit module with GTFS-RT. Version 11.0 (Oct 2025) added a much faster transit solver. [136][137] | GTFS and GTFS-RT; I found no GBFS support in the open-source PT module. | JVM. | Viable but less complete for multimodal than OTP or MOTIS. |
| **Navitia** (Hove) | Long-standing open-source passenger information API. | Multimodal. | Heavy, multi-service. | Hove announced it is progressively closing its GitHub repositories; the historic version stays available. [138] Not a safe foundation. |

### 14.2 The reality for Aloya: budget and data size

- **Cloudflare Workers Free:** 10 ms CPU per HTTP request, 128 MB memory per isolate, 100,000 requests per day, 50 subrequests per request, 5 Cron Triggers per account. Workers Paid ($5 per month) raises CPU to 30 s by default and up to 5 min. [139] Aloya already hit the CPU wall, which is why the timetable search runs in the browser.
- **Cloudflare Containers** are not available on the Free plan; on Workers Paid they include 25 GiB-hours of memory and 375 vCPU-minutes per month, with instance types from 256 MiB up to 12 GiB. [140] A routing engine that must stay warm all day would exceed the included hours (a 4 GiB "standard-1" instance running 24/7 is about 2,900 GiB-hours per month), so Containers suit occasional batch jobs, not a resident planner.
- **Oracle Cloud Always Free** now gives 2 Ampere A1 OCPUs and 12 GB memory in total, 200 GB block storage and 10 TB monthly egress, but idle instances (95th percentile CPU, network and memory all under 20% for 7 days) may be reclaimed. [141] That is enough for MOTIS 2 or OTP2 for Cyprus.
- **Data size:** the Cyprus OpenStreetMap extract is about 38 MB (Geofabrik, 31 Oct 2026, whole island) and the seven GTFS feeds total about 13 MB zipped. [142] Both are tiny by routing-engine standards.
- Samuel applied to Cloudflare for Startups for Aloya on 31 Oct 2026; if approved, credits would cover Workers Paid and Containers.

### 14.3 Aloya today, and the gaps

- Aloya has its own engine: a TypeScript RAPTOR (raptor-plan.ts, packages/core), a live RT planner, and per-date timetable shards served as static files, with the browser doing the heavy timetable search and the Worker verifying walks (Mapbox) and overlaying live data. It is clever and free, and tuned to Cyprus in ways no engine is out of the box (airport snapping, Kapnos, skip risk, crowd fixes).
- Gaps: no GBFS-aware multimodal routing, no Flex, no unrestricted transfers, no live-patched single search, CPU limits that force planning onto the phone, and a lot of bespoke code to maintain alone. The repository's Dockerfile and docker-compose run the web app and Postgres, not a routing engine.

### 14.4 Improvements

1. **Hybrid architecture: keep the Aloya brain, add MOTIS 2 as a second engine.** Run MOTIS 2 on an Oracle Always Free A1 instance (or a small paid VPS if reclaimed) with the Cyprus OSM extract, the seven GTFS feeds, the per-operator GTFS-RT endpoints and Nextbike's GBFS. The Worker calls it for multimodal and bike-share journeys and keeps Aloya's own ranking, rationale, Kapnos, airport and learning layers on top. Effort M. Impact Very high.
2. **Shadow mode first.** For two weeks, run every real query through both Aloya's planner and MOTIS, log differences (arrival, changes, walking), and review the worst 50. This is the layer 11 benchmark harness with a second opinion. Effort S. Impact High.
3. **Graceful fallback.** If the MOTIS host is down or reclaimed, the Worker falls back to today's browser RAPTOR, so the free host is never a single point of failure. Effort S. Impact High.
4. **Use Transitous for development and QA only.** Point the internal QA page and tests at api.transitous.org with a proper User-Agent and attribution, within its 720 `/plan` per day guidance, never in production. Effort S. Impact Medium.
5. **Contribute Cyprus improvements upstream.** Add Nextbike's official GBFS (`nextbike_cy`) to Transitous' cy.json and report the Cyprus feed issues found in layer 15. This builds Aloya's standing in the open mobility community at no cost. Effort S. Impact Medium.
6. **Valhalla for street legs.** Self-host Valhalla (pedestrian and bicycle costing) on the same small server to replace Mapbox walking and cycling calls, removing a paid dependency and the haversine guesses. Effort M. Impact Medium to High.
7. **If Cloudflare for Startups credits arrive:** move the Worker to Workers Paid (30 s CPU) so the server can run the full timetable search and the envelope builder for continuous replanning, and use Containers for nightly batch jobs (ULTRA shortcuts, delay percentiles, GTFS validation). Effort S. Impact High.
8. **R5 (via r5r) for planning analysis, offline.** Use it in GitHub Actions to produce the access and "frequent stops" analyses for layers 12 and 19, and as evidence in partner and grant conversations. Effort S. Impact Medium.
9. **Keep the engine behind one internal interface.** Define `PlannerBackend` (plan, replan-from-position, envelope) so Aloya can switch between its own RAPTOR, MOTIS and OTP without UI changes. Effort S. Impact High.
10. **OTP2 as plan B.** If a future partner (the Ministry or an operator) needs NeTEx and SIRI with Transmodel APIs, OTP2 is the European reference implementation; document the switch path now. Effort S. Impact Low now, Medium later.

## Layer 15: Cyprus data standards: GTFS, GTFS-RT, SIRI, GBFS (Nextbike, Bolt), NeTEx, Datex II and the National Access Point under MMTIS

### 15.1 What the best in the world do

- **The EU rulebook.** Delegated Regulation (EU) 2017/1926 on multimodal travel information services (MMTIS), amended by Delegated Regulation (EU) 2024/490, requires every Member State to run a National Access Point (NAP) and data holders to publish static data in NeTEx (CEN/TS 16614) and dynamic data in SIRI (CEN/TS 15531), "or any digital machine-readable format that can be proven fully compatible and interoperable with those standards ... including for example through automatic converters and validators", represented through EU minimum profiles or national profiles. [143]
- **Deadlines in the amended regulation:** [143]
  - static levels 1 to 3 (timetables, stops, operators, fares, parking places, Park and Ride stops, bike-share stations, scooter parking zones) were due between 1 Dec 2019 and 1 Dec 2024;
  - level 4 (historic delays and observed delays and cancellations, parking tariffs) by 1 Dec 2025 for the whole network;
  - dynamic level 1 (disruptions, real-time estimated times, delays, cancellations, "guaranteed connections monitoring") by 1 Dec 2025 for the comprehensive TEN-T network;
  - dynamic level 2 (parking tariffs, car-sharing, bike-sharing and scooter-sharing availability and location, free car parking spaces) by 1 Dec 2026 for TEN-T;
  - both levels for the rest of the network by 1 Dec 2028; vehicle occupancy (level 3) at each Member State's choice.
- **Obligations that touch apps like Aloya:** Article 7 says travel information service providers shall, on request, provide routing results to another travel information service provider. Article 8 says ranking criteria must be transparent and not based on commercial considerations, the first itinerary shown must not mislead, and the data source and update interval must be indicated when the data holder requires it. [143]
- **Best-practice NAPs** (for example the Norwegian Entur and the Swiss opentransportdata.swiss) publish NeTEx and SIRI alongside GTFS and GTFS-RT, with validators and quality reports. The DATA4PT project produced the EU minimum profiles for NeTEx and SIRI. [144][145]
- **GBFS** (General Bikeshare Feed Specification, MobilityData) is the open standard for shared bikes and scooters, with stations, vehicles, geofencing zones and pricing; the current specification is in the v3 line. [146]
- **GTFS best practice** includes transfers.txt (minimum and timed transfers), parent stations for multi-bay stops, wheelchair_boarding and wheelchair_accessible, and GTFS-RT with Service Alerts and, optionally, occupancy and the `uncertainty` field. [127]

### 15.2 The reality in Cyprus

**The NAP is real and fairly rich.** traffic4cyprus.org.cy (CKAN) lists 42 datasets, almost all CC BY 4.0. [147, 148] Relevant to routing:

| Dataset | Format | Endpoint and notes |
|---|---|---|
| Public transport static | GTFS | Seven files from motionbuscard.org.cy: OSYPA (2), OSEA (4), Intercity (5), EMEL (6), NPT (9), LPT (10), Pame Express park and ride (11). Metadata updated 17 Jul 2026. |
| Public transport real time | GTFS-RT | http://20.19.98.194:8328/Api/api/gtfs-realtime (plain HTTP; per-operator paths /2, /4, /5, /6, /9, /10, /11 also exist, as Transitous uses them). |
| Public transport real time | SIRI | http://20.19.98.194:8313/SiriWS.asmx?op=GetEstimatedTimetable (SIRI-ET web service; answered HTTP 200 on 31 Oct 2026). |
| Nextbike stations, Bolt e-scooter stations | Datex II (XML) | fixcyprus.cy/gnosis/open/api/nap/datasets/nextbikestations/ and /boltstations/ (255 Bolt zones, 1,779 places, published 30 Oct 2026). Locations only, no live availability. |
| Park and Ride | Datex II | /parkandride/: 9 sites (GSP Stadium, Aradippou, Kalo Chorio, Kato Polemidia, Agios Tychonas, Spyros Kyprianou Athletic Centre, Tsirio Stadium, Alambra, Alphamega Arena), polygons, no capacity. |
| Parking areas | Datex II | /parking_areas/: 651 car parks with names and points only (no capacity, tariff or occupancy). |
| Also | XML | bus lanes, bus stops and stations, cycleways, bicycle racks, bike rental stations, low emission zones, traffic events, Waze alerts and traffic, EV chargers, traffic sensors. |

**Quality of the official GTFS (31 Oct 2026 files, own check):**

- All seven feeds include agency, routes, trips, stop_times, stops, shapes (every trip has a shape), calendar_dates, fare_attributes, fare_rules, translations and feed_info (valid 20261031 to 20270128, feed_lang en).
- None has calendar.txt, transfers.txt, frequencies.txt, pathways or levels.
- No stop has wheelchair_boarding set, no trip has wheelchair_accessible set, and no stop uses parent_station, so multi-bay interchanges (for example Solomou Square or Limassol's bus stations) are not grouped.
- All routes are route_type 3 (bus).
- The GTFS-RT snapshot (layer 13) had no Service Alerts, no occupancy and no uncertainty.
- Feeds are re-published every few months with a roughly three-month validity window, so apps must refresh promptly.
- **Calendar coverage defect (found while analysing layer 19):** feed_info says every feed is valid from 31 Oct 2026 to 28 Jan 2027, but the Limassol EMEL feed (6) only lists service dates from 31 Oct to 6 Nov 2026 (7 dates), Paphos OSYPA (2) lists 71 dates and Pame Express (11) 65, while the others list 91. Aloya already defends against this: packages/core/src/schedule-calendar.ts projects a short-calendar feed forward by weekday (a Saturday shard reuses the latest published Saturday) and records which feeds were projected. Other consumers that read feed 6 naively will show no Limassol buses from 7 Nov 2026. An automated validator in CI (improvement 4) should still alert the team and the publisher.

**GBFS.** Nextbike publishes an official GBFS v2 feed for Cyprus (`nextbike_cy`, CC0, feed contact gbfs@nextbike.net, ttl 60 s) with station_information, station_status, free_bike_status, vehicle_types, system_hours, system_regions and pricing plans. [149] Bolt publishes no public GBFS for Cyprus; only the static zone list on the NAP.

**NeTEx.** No NeTEx dataset is listed on the Cyprus NAP. [147, 148]

### 15.3 Aloya today, and the gaps

- Aloya ingests the seven GTFS feeds into per-date shards, reads GTFS-RT through a raw socket and relays, and reads the Nextbike legacy live JSON (maps.nextbike.net/maps/nextbike-live.json, in src/lib/bikeshare.functions.ts) and the CyNAP Bolt zones.
- Aloya also publishes its own GBFS 2.3 at /api/public/gbfs.json with station_information, station_status, vehicle_types (nextbike_ebike, bolt_escooter) and system_information (src/routes/api/public/gbfs*.ts). This re-publishes third-party data; Nextbike's official GBFS already exists, and Bolt zones are CC BY 4.0, which requires attribution.
- Gaps:
  1. The SIRI-ET feed is unused; it could be a second source when GTFS-RT stalls.
  2. The official Nextbike GBFS is not used.
  3. No stop grouping or transfer rules are derived to fill the missing parent stations and transfers.
  4. No accessibility data at all, because the source has none.
  5. Aloya's own learned data (delays, observed arrivals, crowd stop fixes) is not published back in a standard form, which would also position it as a data partner under MMTIS.
  6. No automated feed validation on each new GTFS release.

### 15.4 Improvements

1. **Switch bike share to Nextbike's official GBFS.** Read gbfs.nextbike.net/maps/gbfs/v2/nextbike_cy (station_information plus station_status, ttl 60 s) instead of the legacy JSON; it is CC0 and stable. Effort S. Impact Medium.
2. **Make Aloya's own GBFS honest or retire it.** Either stop re-publishing Nextbike (link to the official feed) and keep only the Bolt zones with CC BY attribution and the source URL, or upgrade to GBFS v3 with clear provenance in system_information. Effort S. Impact Low to Medium (legal hygiene).
3. **Add SIRI-ET as a fallback real-time source.** Poll the NAP SIRI-ET service when GTFS-RT is stale and merge by trip; it is the format the EU regulation names. Effort M. Impact Medium to High (resilience).
4. **Automated GTFS validation in CI.** Run the MobilityData GTFS validator in GitHub Actions on every new feed release, publish the report on the internal QA page, and alert when the feed's end date is within 14 days. Effort S. Impact High (feeds expire roughly every three months).
5. **Derived stop groups and transfer rules.** Cluster stops within 60 m with the same name into virtual parent stations, generate a transfers.txt overlay (minimum transfer times by distance, same-stop 60 s, cross-street 120 s) and use it in RAPTOR. Offer it back to the Ministry (contact motionbuscard@gmail.com, as named in the feeds). Effort S. Impact High.
6. **Crowd-sourced accessibility.** Aloya already has stop_attributes and stop_photos tables; add wheelchair_boarding, shelter and lighting from rider reports and photos, and publish as a GTFS-compatible overlay. Effort M. Impact Medium to High.
7. **Publish Aloya's learned data under MMTIS level 4.** Historic delays (p50 and p90 per stop and hour, layer 13) and observed delays and cancellations in OTP's Empirical Delay CSV format, offered to the NAP. This turns Aloya into a recognised data contributor rather than only a consumer. Effort M. Impact High (strategic).
8. **Route-sharing API under Article 7.** Expose a documented `/api/public/plan` contract (it exists) with rate limits and attribution, so Aloya can meet "routing results on request" and integrate with other EU planners such as Transitous or OJP-based services. Effort S. Impact Medium.
9. **Ask Bolt and Nextbike for live availability via the NAP.** MMTIS dynamic level 2 (bike and scooter sharing availability) is due by 1 Dec 2026 for TEN-T. A short written note to the Ministry's NAP team and Bolt Cyprus (cyprus@bolt.eu, listed as dataset contact) could unlock Bolt GBFS. Effort S. Impact High if it lands.
10. **NeTEx export, later.** Once the operators or the Ministry ask, convert the GTFS plus Aloya overlays to NeTEx EPIP with an open converter, which strengthens grant applications. Effort M. Impact Low now.

## Layer 16: Transfer protection and connection guarantees

### 16.1 What the best in the world do

- **Operator-side connection protection (CP).** The Utah Transit Authority's CP system watched light rail running and sent a "hold at {station} until {time}" message to waiting buses' on-board terminals when a train's lateness was within a set threshold, protecting transfers from frequent trains to infrequent buses. One late train could trigger holds at the next three stations. [151, 152] Chung and Shalaby (TRR 2006, 2007) and later work (Journal of Transportation Engineering A, 2020) formalised when holding is worth it: weigh the transferring passengers' saved wait against the delay to passengers already on board and downstream, using probabilistic arrival estimates. [153][154]
- **Rider-triggered holds.** California's Integrated Dynamic Transit Operations (IDTO) field test included T-CONNECT, which detects that a rider's trip is running late and automatically asks the connecting bus to wait. Connection success rose from 80.2% to 97.1%, and average waiting time for protected connections fell by 23.8 minutes (bus to bus) and 30.7 minutes (BART to bus); the automatic requests matched riders' own phone requests well. [155, 156]
- **Standards for guaranteed interchanges.** SIRI includes Connection Timetable (CT) and Connection Monitoring (CM) services so a feeder operator can tell a distributor operator the expected arrival of a vehicle with connecting passengers, to "let passengers on a delayed train know that a local bus service will wait for them". [157][158] GTFS transfers.txt marks timed transfers (transfer_type 1) and minimum transfer times; MMTIS lists "planned interchanges between guaranteed scheduled services" as static data and "guaranteed connections monitoring" as dynamic data due on the TEN-T network by 1 Dec 2025. [143]
- **Uncertainty-aware holding.** Recent work uses prediction intervals (80% to 95% quantiles) for the feeder's arrival so the "hold or go" decision is robust. [159]
- **Travel guarantees for riders.** Stockholm's SL refunds a taxi (up to 1,480 SEK) or another operator's ticket if a rider risks arriving 20 minutes or more late, and refunds 50%, 75% or 100% of the fare for 20, 40 or 60 minutes of delay; Skånetrafiken has a similar scheme. [160][161] This turns reliability into a promise.
- **Consumer apps.** Transit and Citymapper warn about tight connections and reroute after a miss; DB Navigator labels connections "expected to be reached"; Moovit Assistant (2026) flags short transfer times. [98][126][99] None of these can hold a bus for you unless the operator runs CP.

### 16.2 The reality in Cyprus

- The official GTFS has no transfers.txt and no parent stations (layer 15), so no timed or guaranteed connection is published anywhere, including between intercity coaches and city buses at Nicosia, Limassol and Larnaca, or between city buses and airport lines.
- I found no public evidence of an operator connection protection scheme or a passenger travel guarantee in Cyprus.
- The NAP does publish a SIRI-ET service (layer 15), so the Ministry's telematics platform already speaks SIRI; CT and CM are part of the same standard family.
- Service is sparse (median 1 to 3 peak departures per stop per two hours, layer 12), so a missed connection typically costs 30 to 60 minutes. That makes protection, early warning and good alternatives far more valuable than in a high-frequency city.

### 16.3 Aloya today, and the gaps

- Planning: minimum transfer buffer 90 s and transfer walks up to 600 m (raptor-core.ts); each change costs 0.5 x the joined line's headway (capped at 30 min) less slack relief, plus 60 s overhead or 20 s within a station (plan-score.ts); the ranking adds 9 minutes per change; a skip-risk term covers drivers not stopping.
- On the trip: useDisruptionWatch.ts raises "connection-at-risk" when the wait window drops below 60 s and is slipping, and "missed-connection" afterwards; the rider can then ask for a replan (reroute.functions.ts).

The gaps:

1. **Warnings come too late.** A 60-second margin leaves no time to act. With a probability model (layer 13) Aloya could warn several minutes ahead, while there are still options: stay on to a later transfer stop, get off earlier for another line, or take a bike.
2. **No alternative transfer points.** The plan fixes one transfer stop; it never compares other stops where the two lines meet or run close, which often differ in walking, safety and timing.
3. **No pre-computed backup** per connection (layer 13).
4. **No channel to operators.** Aloya cannot ask a driver to wait, and drivers cannot see that connecting riders are coming.
5. **Transfer times are generic.** 90 s plus straight-line walking ignores crossing a dual carriageway, finding the right bay, or the driver pulling away early; Aloya's own rider traces could measure real transfer times per stop pair.

### 16.4 Improvements (with the phases Samuel asked for)

1. **Connection score in planning.** Use P(make it) from layer 13 for every change; drop or demote options below about 70% unless they are the only ones, and show "Connection: likely / tight / risky". Effort S after layer 13. Impact Very high.
2. **Early, actionable warnings across the trip phases.**
   - *On the first bus, from the moment the feeder's prediction slips:* recompute P(make it) every GTFS-RT update; warn when it falls below 60%, giving the best alternative in the same message.
   - *Approaching the transfer:* compare the planned transfer stop with every other stop where the current line meets the connecting line or a substitute line within 300 m, and suggest "stay on 2 more stops, change at X, safer connection" or "get off now at Y for line Z".
   - *During the transfer:* if the connecting bus is late or gone, show the first-arriving useful line (strategy logic) and the Nextbike or scooter option with live stock.
   - *After the transfer:* keep checking the remaining legs and the final walk.
   Effort M. Impact Very high.
3. **Alternative transfer points in the planner.** When RAPTOR finds a two-ride itinerary, enumerate other feasible transfer pairs on the same two lines (or parallel lines) and keep the most robust as a stored alternative, so the live trip can switch without a server call. Effort M. Impact High.
4. **Per-stop-pair transfer times learned from riders.** From anonymised live trips, measure how long real transfers take at each stop pair and replace the generic 90 s plus walk with the learned median plus a margin (p80). Publish them as a transfers.txt overlay (layer 15). Effort M. Impact High.
5. **"Riders connecting" signal for drivers, via a pilot with one operator.** Aggregate the count of Aloya riders on a late feeder who plan to board a specific connecting trip, and offer it to the operator's control room as a simple feed (SIRI-CM shaped, or a web dashboard). Start with intercity coach to city bus at one hub, as UTA and IDTO did. Effort M (needs partner). Impact High.
6. **Hold request, only where the operator agrees.** In a pilot, let riders tap "I'm on the late 30, connecting to the 158" so the control room can decide; the IDTO results show automatic requests matching what riders would ask. Effort M. Impact High where adopted.
7. **Timed-transfer evidence for the Ministry.** Use Aloya's data to list the 20 busiest observed transfers with their missed-connection rates and propose small timetable shifts or timed transfers. Effort S. Impact Medium to High (systemic).
8. **Aloya travel promise (later, if funded).** A limited guarantee modelled on SL's: if Aloya's recommended plan with a "likely" connection fails and the rider would be 20 minutes or more late, Aloya offers a credit towards a Bolt or taxi ride. Start as a capped marketing pilot with a sponsor or the operators; do not launch without a budget. Effort M. Impact High for trust and car-free confidence.
9. **Transfer briefing card.** Before each change: which bay, which side of the road, a photo of the stop (stop_photos exists), the walking line, and "the 158 usually waits about 1 minute here" when learned. Effort S. Impact Medium to High.
10. **Measure it.** Track planned versus achieved connections per stop pair and per line in D1, and show the missed-connection rate on the internal QA page, so every change in this layer is judged by data. Effort S. Impact Medium.

## Layer 17: Park and ride and parking data

### 17.1 What the best in the world do

- **Evidence first: P&R can help or hurt.** Parkhurst's work on UK bus-based P&R (Transport Policy 2000) found traffic avoided inside urban areas in seven of eight schemes, but warned of extra traffic outside them from motorists detouring to sites, users switching from buses, and new trips. [162] Mingardo's survey of 738 users at nine rail-based P&R sites around Rotterdam and The Hague (Journal of Transport Geography 30, 2013) highlighted "abstraction from public transport": some users previously made the whole trip by public transport. [163] Meek et al. found 50% to 71% of weekday UK bus-based P&R users had previously driven. [164, 165] A meta-analysis of 40 studies and 180 sites (EJTIR, 2015) found the public transport mode and the point of interception are the most important factors in whether a site mainly attracts its target group (people who would otherwise drive the whole way). [166]
- **Implication for an app:** suggest P&R to people who would otherwise drive all the way, intercept them as close to their origin as possible, and never push a P&R detour on someone who could take the bus from home.
- **Real-time parking in planners.** OpenTripPlanner's vehicle parking updaters ingest facilities and live occupancy from Liipi (Finland), ParkAPI, Bikely and Bikeep (secure bike parking) and SIRI-FM, and route car or bike legs to a facility with space before the transit leg. [167] MOTIS supports park and ride in its multimodal routing (layer 14).
- **EU data duty.** MMTIS lists parking places (including accessible spaces), Park and Ride stops, secure bike parking and parking payment methods as static data, parking tariffs as level 4 data due by 1 Dec 2025, and free parking spaces (dynamic) for the TEN-T network by 1 Dec 2026. [143]

### 17.2 The reality in Cyprus

- **Official P&R sites (CyNAP Datex II, published 30 Oct 2026):** 9 facilities: GSP Stadium, Aradippou, Kalo Chorio, Kato Polemidia, Agios Tychonas, Spyros Kyprianou Athletic Centre, Tsirio Stadium, Alambra and Alphamega Arena. Polygons and names only; no capacity, opening hours, price or occupancy. [168, 169, 170]
- **Dedicated P&R bus:** the Pame Express GTFS (feed 11, agency "PAME EXPRESS") has one line, GSP1, GSP Stadium to the Ministry of Finance via Makariou and Lemesou avenues, with 80 trips on weekdays (first departures from 06:30, last around 18:30) and none on Saturday 7 or Sunday 8 Nov 2026; the feed lists one fare of €2.70. [171] The other official sites rely on ordinary city or intercity lines.
- **General parking:** CyNAP lists 651 car parks (names and points only, for example Nicosia municipal car parks at Faneromenis and Lidras); no capacity, tariffs or occupancy are published. [168, 169, 170]
- **Bike parking:** CyNAP has bicycle racks and bike rental station datasets (XML), and Nextbike stations act as de facto secure bike parking. [168, 169, 170]

### 17.3 Aloya today, and the gaps

- src/data/park-and-ride.ts is a hand-curated list (named hubs include GSP Stadium, Engomi / UCY ring, Strovolos Municipal Hall, Mall of Cyprus, Lakatamia transport hub, My Mall Limassol, Limassol Mall, Polemidia junction and Limassol New Port), chosen on the rule "parking is real and the nearest stop has a route at least every 30 min in the peak". park-and-ride.functions.ts drives to a hub with Mapbox driving-traffic and runs the live planner from the hub, shown as an alternative card.
- Gaps:
  1. Five of the nine official sites (Aradippou, Kalo Chorio, Agios Tychonas, Tsirio, Alambra) and the Larnaca area are missing; some Aloya hubs (for example malls) are not official P&R sites, which is fine but should be labelled as "informal parking".
  2. P&R is a side card, not a leg inside the planner, so it cannot be combined with a better stop, compared fairly with bus-from-home, or chosen mid-trip.
  3. No targeting: it does not check whether the rider has a car or would otherwise drive, so it risks the abstraction effect the research warns about.
  4. No capacity or occupancy, no Pame Express timetable link to the GSP1 line, no "park and cycle" option.

### 17.4 Improvements

1. **Ingest the official P&R and parking datasets.** Load CyNAP parkandride (9 sites, polygons) and parking_areas (651 points) nightly into a parking table with source and licence (CC BY 4.0), merge with the curated hubs, and label each as official P&R, municipal car park or informal. Effort S. Impact High.
2. **Make P&R a first-class access leg.** Add a `drive` access leg (first leg only, as HydRA advises) from origin to official P&R sites and selected car parks, with Mapbox driving-traffic time plus a parking search and walk penalty, then hand to RAPTOR. Only offered when the rider says they have a car. Effort M. Impact High.
3. **Target the right riders.** Show P&R only when the bus-from-home option is poor (no departure within 30 minutes, or more than 2 changes) or the rider is on a "driving" profile; never when a direct bus from home is within 10 minutes of the P&R option. This follows the meta-analysis finding that interception point drives effectiveness. Effort S. Impact High (avoids pulling bus riders into cars).
4. **Wire Pame Express GSP1 properly.** Show GSP1 departures on the GSP Stadium P&R card, weekday-only hours, the €2.70 fare from the feed, and the walking line from the car park to the stop. Effort S. Impact Medium.
5. **Crowd-sourced occupancy.** Ask P&R users a one-tap "plenty / filling / full" on arrival, decay it over 30 minutes, and show it; later offer the series to the NAP as MMTIS dynamic level 2 data. Effort S. Impact Medium.
6. **Park and cycle, park and scoot.** For P&R sites near Nextbike stations or Bolt zones, offer car then bike or scooter, which removes the dependence on a frequent bus at the site. Effort S once layer 11 legs exist. Impact Medium.
7. **Parking cost comparison.** Where municipal tariffs are known (enter them by hand for the main Nicosia, Limassol and Larnaca municipal car parks until MMTIS level 4 tariff data appears), show "Drive and park in town: about X min plus €Y parking; P&R: Z min, €2.70" so the money case for P&R and bus is visible. Effort S. Impact Medium to High for mode shift.
8. **Event and stadium mode.** GSP, Alphamega Arena and Tsirio are official P&R sites and stadiums; on match and concert days, show P&R and bus options in event pages (ties to the events layer). Effort S. Impact Medium.
9. **Larnaca and Paphos gap evidence.** Use Aloya's driving and planning queries to show where P&R demand appears without a site, and share it with the Ministry and municipalities. Effort S. Impact Medium (systemic).
10. **Secure bike parking layer.** Add CyNAP bicycle racks and Nextbike stations to the map as bike parking, supporting bike and ride at major stops. Effort S. Impact Low to Medium.

## Layer 18: Intercity, airport, flight-aware and ferry routing

### 18.1 What the best in the world do

- **Flight-aware ground transport.** The useful pattern is: the rider gives a flight number (or the app reads it from a booking), the app watches the flight's live status, and it re-times the trip to the airport (leave-by time from scheduled departure minus check-in and security buffers) or from the airport (start planning at actual landing plus baggage time). Flight data APIs such as AeroDataBox offer flight status by number, airport arrival and departure boards (FIDS) with live updates where covered, and push alerts on status change. [172]
- **Data limits matter.** OpenSky's REST API is excellent for live aircraft positions, but its "Arrivals by Airport" and "Departures by Airport" endpoints are updated by a nightly batch, "only arrivals from the previous day or earlier are available", and anonymous users get 400 credits per day per endpoint group, with live flight queries costing 4 credits. [173] AeroDataBox's free Basic plan gives 400 API units a month (RapidAPI, hard limit, attribution required), Pro $8 a month for 5,000 units; a FIDS call returns up to 12 hours on most plans. [174, 175][176]
- **Intercity planning.** Journey planners treat coaches as scheduled transit with seat inventory where operators expose it; long-distance coach and rail are also covered by EU passenger rights rules that the MMTIS level 4 observed-delay data supports (for coach services of 250 km or more, which no Cyprus route reaches). [143]
- **Ferry data.** MMTIS includes maritime ferries as scheduled transport; observed delays of more than 90 minutes for sea passenger services are level 4 data. [143]

### 18.2 The reality in Cyprus

**Intercity buses (official GTFS feed 5, Tuesday 3 Nov 2026):** 286 trips over 48 route directions. The busiest pairs:

| Route | Trips each way | First and last departure |
|---|---|---|
| 42 Nicosia to Larnaca / Larnaca to Nicosia | 22 / 22 | 07:15 to 22:00 / 06:00 to 20:15 |
| 45 Limassol to Larnaca / Larnaca to Limassol | 20 / 20 | 05:40 to 21:20 / 05:55 to 21:15 |
| 25 Limassol to Nicosia / Nicosia to Limassol | 19 / 18 | 05:30 to 22:00 / 05:40 to 19:30 |
| 43 Paralimni, Agia Napa, Larnaca (both ways) | 16 / 16 | about 05:55 to 21:30 |
| 56 Limassol to Paphos / Paphos to Limassol | 15 / 12 | 08:00 to 21:00 / 05:45 to 20:00 |
| 23 Nicosia, Agia Napa, Paralimni (both ways) | 9 / 9 | 07:15 to 20:00 / 05:50 to 17:45 |
| 26 Nicosia to Paphos / Paphos to Nicosia | 7 / 6 | 09:00 to 18:00 / 08:00 to 19:00 |

So the corridors are hourly at best, and Nicosia to Paphos has six or seven direct trips a day.

**Airports.**

- Larnaca (LCA) is served by LPT city lines in feed 10: 425 (airport and Larnaca town, 36 trips from the airport between 06:30 and 24:00 on 3 Nov 2026), 429, 430, 432 and 407.
- Paphos (PFO) is served by OSYPA lines 612 and 613 (feed 2), with departures from the airport until 01:00 the next morning.
- The Kapnos Airport Shuttle (airport to Nicosia, Limassol and other cities) is not in the official GTFS; Aloya reads it from the operator's ecoachmanager API.

**Ferry.** The only scheduled passenger ferry from the Republic of Cyprus is the seasonal Limassol to Piraeus link, operated by Scandro Holding with AF Marina in 2026: first sailing 29 May, last return 1 September, 22 round trips, about 31 hours, fares from about €40 to €41 per person. [177][178, 179] The operator said in August 2026 the route could stop after 2027 without renewed state subsidy. [180] There is no winter service and no Larnaca sailing in 2026.

### 18.3 Aloya today, and the gaps

- plan-airports.ts snaps airport endpoints to the terminal stops (LCA 10:6117, PFO 2:1813) and the rank adds a 45-minute penalty to airport options that arrive too close to the flight. kapnos.functions.ts reads Kapnos times and seat counts. Airport landing pages combine Kapnos departures with a "flights" pulse.
- **A real defect:** the flights pulse (src/routes/api/public/hooks/pulse-flights.ts) calls OpenSky `/flights/arrival` and `/flights/departure` for the last two hours to say "arrivals next hour". OpenSky documents those endpoints as batch-updated nightly with only previous-day data, so the live window will normally come back empty (the code treats 404 as "no flights"), and the airport page can show "airport quiet in the next hour" when it is not.
- Gaps:
  1. No flight number input, so trips to and from the airport are not tied to a real flight.
  2. No check-in or baggage buffers per airline or terminal.
  3. No ferry awareness at all (seasonal Limassol port trips, port access by bus).
  4. Intercity seat availability exists for Kapnos but not for Intercity buses.
  5. The airport penalty is a fixed number rather than "latest safe arrival" computed from the flight.

### 18.4 Improvements

1. **Fix the flights pulse.** Replace the OpenSky arrival and departure calls with either AeroDataBox FIDS for LCLK and LCPH (one 12-hour call per airport every few hours stays inside small plans) or OpenSky `/states/all` within a bounding box around each airport for live landings, and label the source. Effort S. Impact High (a visible bug on airport pages).
2. **Flight-aware trip mode.** Let riders enter a flight number; fetch status once when entered and again a few hours and 60 minutes before (cheap on a small plan), compute leave-by = departure minus airline buffer (default 2 hours before for most flights, a rider-editable setting) minus p90 journey time (layer 13), and push "leave by 05:40". Effort M. Impact High.
3. **Arrival-side planning.** For arriving flights, start the ground plan at actual landing plus a baggage allowance and show the next Kapnos, 425 or 612 departures that are reachable, with "last bus tonight" warnings. Effort M. Impact High for visitors and returning residents.
4. **Airport "latest safe arrival" instead of a fixed penalty.** Replace the 45-minute airport penalty with a constraint derived from the flight time and buffer when known, and a default otherwise. Effort S. Impact Medium.
5. **Intercity corridor cards.** For trips between cities, show the corridor timetable (for example "42 Nicosia to Larnaca, about hourly, last 22:00") with the city-bus feeders at both ends and the park and ride or Nextbike first mile (layers 11, 12, 17). Effort S. Impact High (intercity trips are where people drive most).
6. **Last-departure guard.** Warn in planning and on the trip when a chosen intercity or airport bus is the last of the day, and offer the taxi fallback with the regulated tariff estimate already in Aloya. Effort S. Impact High.
7. **Ferry mode, seasonal.** From late May to early September, add the Limassol to Piraeus sailings as a scheduled leg with port access by bus (EMEL) and a boarding cut-off (boarding opens 4 hours before and closes 1 hour before departure per the 2026 announcements), and show the season dates outside it. Effort S. Impact Low to Medium (seasonal, small volume).
8. **Intercity seat signal.** Use crowd reports and, if Intercity offers an API like Kapnos, seat availability; otherwise show "often full on Friday evenings" from Aloya's own crowding table (route_crowding exists). Effort M. Impact Medium.
9. **Airport accessibility and luggage tips.** For airport legs, prefer low-step options and fewer changes when the rider sets "travelling with luggage". Effort S. Impact Medium.
10. **Monitor and report.** Record Kapnos and Intercity punctuality from GTFS-RT and rider traces, and publish them in the open data offer (layer 15), since airport reliability drives trust. Effort S. Impact Medium.

## Layer 19: Night, rural and demand-responsive transport

### 19.1 What the best in the world do

- **Demand-responsive transport (DRT) in planners.** GTFS Flex (published by MobilityData as part of the GTFS family) describes zones, booking rules and pick-up windows, so planners can route "book a ride from your village to the main road stop" as a leg. OpenTripPlanner supports Flex routing in its sandbox and MOTIS 2 ingests GTFS-Flex feeds. [182][183][130] Academic work integrates non-scheduled lines into fast transit routing (layer 11, ref 9).
- **Where DRT works.** The EU Urban Mobility Observatory's 2025 case study says DRT fits rural, suburban and peripheral areas with low demand and should be embedded in SUMPs, integrated with ticketing and digital routing information, and co-designed with users. [184] The Interreg "Rural Mobility" project (2024 to 2027) targets on-demand buses and MaaS for the 129 million EU citizens in sparsely populated areas. [185]
- **Night travel.** Good practice is honest last-departure information, guaranteed fallbacks (taxi or DRT), and safer walking routes after dark; the Dutch walking-distance study (layer 12) found street lighting is second only to frequency in how far people will walk to a stop.

### 19.2 The reality in Cyprus

Own analysis of the official GTFS (feeds of 31 Oct 2026), counting every scheduled departure at every stop:

| Day | Stop departures in total | 21:00 to 23:00 | 23:00 to 05:00 | Stops with any departure 23:00 to 05:00 |
|---|---|---|---|---|
| Tuesday 3 Nov 2026 | 161,419 | 9,547 (5.9%) | 4,670 (2.9%) | 1,199 |
| Saturday 7 Nov 2026 (Limassol data missing, see note) | 91,095 | 6,680 (7.3%) | 5,727 (6.3%) | 1,359 |
| Sunday 8 Nov 2026 (Limassol data missing) | 79,170 | 5,753 (7.3%) | 3,525 (4.5%) | 726 |

Note: the Limassol EMEL feed only contains service dates from 31 Oct to 6 Nov 2026, although its feed_info claims validity to 28 Jan 2027 (layer 15). Weekend figures therefore exclude Limassol.

Rural and thin service on a weekday (Tuesday 3 Nov 2026), served stops with four or fewer departures in the whole day:

- Paphos (OSYPA): 295 of 889 served stops (33%).
- Limassol (EMEL): 216 of 1,390.
- Larnaca (LPT): 181 of 998.
- Nicosia (NPT): 52 of 1,769.
- Famagusta (OSEA): 4 of 446.
- Intercity: 28 of 123.

So the long tail of villages, especially in Paphos district, has one or two buses each way per day.

**Existing DRT in Cyprus.**

- Cyprus Public Transport (operator of NPT and LPT) started a Demand Responsive Transport pilot in July 2023 aimed at people with disabilities, and lists DRT among its innovation concepts. [186][187]
- Limassol has an on-demand service (WeeDrive), described by the EU-funded Policy Mix 4 Mobility team in September 2026 as "successfully established primarily for children and families". [188, 189]
- Neither appears in the official GTFS (no Flex files) or on the NAP.

**Night fallbacks.** Aloya already encodes the regulated taxi tariff with a higher night rate (€1.05 per km at night against €0.85 by day, €3.42 flag fall, €5 minimum).

### 19.3 Aloya today, and the gaps

- The planner widens the access radius to 3 km when nearby stops have fewer than 3 departures in the next 2 hours, and extends the search horizon to 24 hours and then the next day, so rural riders do get an answer such as "first bus tomorrow 06:10".
- headway-chance.ts handles the "no vehicle visible" case; last-mile-chain.functions.ts offers a taxi for the final leg; useShortcutDetector suggests walking near the end.
- Gaps:
  1. No DRT legs: the Limassol on-demand service and the CPT DRT pilot are invisible.
  2. No explicit night mode: no "last bus home" warnings before the evening, no night-safe walking preference, no comparison of "wait 50 minutes or taxi for €12".
  3. Rural first and last mile is walking only (layer 11), although a 2 to 3 km cycle or a short taxi to the main road is often the realistic answer.
  4. Calendar projection exists (schedule-calendar.ts projects short-calendar feeds forward by weekday, which covers the Limassol case), but the rider is not told clearly when a city's times are projected rather than published.

### 19.4 Improvements

1. **Surface and alert on projected calendars.** Aloya already projects short calendars by weekday (schedule-calendar.ts). Add a visible note on affected results ("Limassol times projected from last week's timetable") and an automatic alert to the team and to motionbuscard@gmail.com when a feed covers fewer than 14 future days. Effort S. Impact High (trust and data quality).
2. **"Last bus home" reminders.** From the rider's saved home and current location, compute the last workable departure each evening and notify 30 and 10 minutes before it (opt-in), with the taxi estimate as the fallback. Effort S. Impact High.
3. **Night mode in planning.** After 21:00, raise the walking penalty on unlit or isolated paths (OSM `lit=*`, main roads preferred), prefer stops with shelters (crowd data), and show "wait 50 min" against "taxi about €X now" honestly. Effort M. Impact High for women, students and shift workers.
4. **DRT as a planner leg.** Model WeeDrive (Limassol) and any CPT DRT as GTFS-Flex style zones with booking links; start with a static zone polygon and service hours, entered by hand with the operators' agreement, and show "book on-demand bus" options inside itineraries. Effort M. Impact Medium to High.
5. **Rural first mile: cycle or short taxi to the trunk road.** For origins where the nearest stop has four or fewer daily departures, test "taxi or bike 2 to 4 km to the intercity or trunk stop" options (layer 11 legs), and show them when they save at least 30 minutes. Effort S once legs exist. Impact High in Paphos district.
6. **Shared taxi matching (later).** Where several Aloya riders request similar late-night or rural trips, suggest sharing a regulated taxi; start as a simple "others going your way" list without payment handling. Effort M. Impact Medium.
7. **Evidence pack for the Ministry and districts.** Use the stop-level analysis above plus Aloya's own unmet searches ("no option" results by village and hour) to argue for DRT zones in thin areas, especially Paphos villages. Effort S. Impact High (systemic, supports the bonus part F on car dependence).
8. **Village timetable cards.** For stops with four or fewer daily departures, show the full day on one card ("06:10, 13:40, 17:20") instead of "next bus" only, because riders plan their day around them. Effort S. Impact Medium.
9. **School and family trips.** Since the Limassol on-demand bus is used mainly by children and families, add a "family" or "school run" profile that surfaces it and safer walking routes. Effort S. Impact Medium.
10. **Night punctuality learning.** Track late-evening reliability separately (delay_stats already has hour of day) and widen buffers for the last services, because missing the last bus has the highest cost. Effort S. Impact Medium.

## Layer 20: Personalisation and learned routines

### 20.1 What the best in the world do

- **Learning routines from traces.** Liao, Patterson, Fox and Kautz (Artificial Intelligence, 2007) built a hierarchical Markov model that learns a person's daily movements, frequent mode-change places (bus stops, car parks) and destinations from raw GPS, and detects novel behaviour or errors such as boarding the wrong bus; their "Opportunity Knocks" prototype used it to guide people. [191]
- **Learning preferences from choices.** Chidlovskii (CEUR 1392) converted travellers' actual trips into pairwise preferences and learned a ranking function that re-ranks a planner's top results, improving relevance in Nancy and Adelaide. [192] The Tor Vergata personal traveller advisor keeps an individual utility function per traveller and updates it from revealed choices. [193] Lathia et al. used fare-card data to personalise trip time estimates, beating both a non-personalised baseline and published times. [194]
- **Present trade-offs, not hidden weights.** Recent multimodal planning work notes that consumer planners expose only limited preference controls and rarely surface the trade-offs (walking tolerance, transfer aversion, time against cost) to users. [195]
- **Privacy.** Location histories are personal data under the GDPR; keeping raw traces on the device and storing only coarse, consented patterns on the server is the defensible design, and MMTIS explicitly says NAP data must not include personal data. [143]

### 20.2 The reality in Cyprus

- Aloya's audience mixes residents commuting on sparse lines, students, visitors and newcomers. With most stops served every 30 minutes or worse (layer 12), the value of knowing someone's routine is high: a reminder five minutes early is the difference between catching the bus and waiting half an hour.
- No Cyprus operator offers personalised information today; the motion bus card is a fare card, and its data is not public.

### 20.3 Aloya today, and the gaps

What exists:

- commute-learner.functions.ts records each completed multi-leg trip as (origin cell, destination cell, day of week, 30-minute bucket) on a grid of about 150 m (0.0015 degrees), stored in D1 `commute_patterns` with labels and counts, so the home screen can offer "Your usual 8 AM to work".
- saved_places, accessibility preferences (accessibility-prefs.ts, stored locally), arrive-by promises, and today-rhythm notes per weekday and city.
- The "learning rescore" in planMultiLeg is network-wide (learned delays, runtimes), not personal.

The gaps:

1. **Routine is used for a card, not for planning.** It does not pre-compute tomorrow's commute, watch it overnight, or warn before the rider leaves.
2. **No personal preference model.** Walking tolerance, willingness to cycle or scoot, transfer aversion and risk preference (layers 12, 13) are the same for everyone, apart from accessibility settings.
3. **No learning from choices.** Which option the rider picks from the list, and which suggestions they ignore, is not fed back.
4. **No departure-time habits.** The rider's usual leave time is known roughly but not used for "leave in 4 minutes" nudges or for choosing the better stop at that time.
5. **Privacy design is implicit.** Server-side patterns exist; there is no visible "what Aloya knows about my routine" screen with delete controls.

### 20.4 Improvements

1. **Routine autopilot.** For each confirmed routine (at least 3 trips in the same cell pair and bucket over 3 weeks), pre-plan the next occurrence the evening before and again 30 minutes before, applying layers 12, 13 and 16 (better stop, p90 arrival, connection score), and send one push: "Leave 07:42 for the 22 at Makariou, arrive by 08:20 (9 in 10)". Effort M. Impact Very high.
2. **Personal preference vector.** Store per rider: walking metres they accept, cycling and scooter willingness, transfer penalty, risk percentile, heat sensitivity. Initialise from three onboarding questions with sensible defaults, then update from choices (improvement 3). Feed it into plan-score.ts weights. Effort M. Impact High.
3. **Learn from choices, simply.** Log which itinerary the rider starts out of those shown and fit a small per-user logistic adjustment on features already computed (minutes, changes, walk metres, wheels minutes, P(make)), as Chidlovskii's re-ranking does. Run it on the device to keep data local; sync only the few weights. Effort M. Impact High.
4. **Leave-now nudges tied to live data.** For a routine trip, track the actual bus position from GTFS-RT and send "leave now" when walk time plus a 2-minute margin equals the predicted arrival at the stop. Effort S. Impact High.
5. **Routine-aware better stop.** When the routine stop is sparse at the rider's usual time but a better stop is within their learned tolerance, suggest a permanent switch: "Your 08:05 departure is often late; the stop 6 minutes away has 3 lines towards your work." Effort S. Impact High.
6. **Habit-based micromobility.** If a rider repeatedly cycles a first mile, pre-check Nextbike stock at their usual station before their usual time and warn if empty. Effort S. Impact Medium.
7. **Privacy-first architecture.** Keep raw location traces on the device only; send coarse patterns (cell pair, weekday mask, half-hour bucket) with explicit consent; provide a "My routines" screen with pause, edit and delete, and a data export. Document it in the privacy notice. Effort S to M. Impact High (trust, GDPR).
8. **Car-free coaching, gently.** For riders who also use the park and ride or taxi options, show a monthly summary: trips by bus, bike and scooter, money saved against driving and parking, and one concrete suggestion to replace a regular car trip. This supports the goal of less car dependence (bonus part F). Effort S. Impact Medium to High.
9. **Shared household or caregiver routines.** Let a parent follow a child's school routine with consent, using the same live trip phases (ties to the family use of the Limassol on-demand bus, layer 19). Effort M. Impact Medium.
10. **Measure personalisation honestly.** A/B test routine autopilot and personal weights against defaults on the share of trips started on time, missed connections and app-reported satisfaction; keep the change only if it wins. Effort S. Impact Medium.

## Part B summary: top 10 improvements across layers 11 to 20

Ranked by impact on getting more trips onto public transport in Cyprus, then by effort.

1. **Continuous en-route re-optimisation (layers 11, 13, 16).** The server builds an "envelope" of connections that could still beat the plan; the phone re-runs a small Connection Scan whenever GTFS-RT updates and just before every stop. At each phase it checks: a better stop or scooter before boarding; "get off here for line X" on the first bus; alternative transfer points while approaching the change; first-arriving line or bike during the wait; the remaining legs after it. Published results (IJCAI 2025) show full dynamic replanning saves 10.6 to 30.2 minutes on the 20% to 66% of trips it changes. Effort L. Impact Very high.
2. **Bike, scooter and ride legs inside itineraries (layer 11).** New `cycle`, `scoot` and first or last mile `ride_hail` leg kinds and an MCR-style micromobility phase in RAPTOR, using Nextbike's official GBFS and the 255 CyNAP Bolt zones. Effort M. Impact Very high.
3. **"Go to a better stop" with an explicit contrast card (layer 12).** Frequency-aware candidate selection, multi-mode access and the generalised-cost rule; in Nicosia about one served stop in three has a much more frequent stop within 800 m. Effort S to M. Impact Very high.
4. **Connection probability and risk-adjusted ranking (layers 13, 16).** Empirical delay percentiles from Aloya's own arrival_truth, P(make it) per change, expected arrival including the fallback, "9 in 10 by" times and early warnings minutes ahead instead of a 60-second alarm. Effort M. Impact Very high.
5. **Fix the airport flights pulse and add flight-aware trips (layer 18).** The current OpenSky arrival and departure calls only return previous-day data, so airport pages can say "quiet" wrongly; switch to a FIDS source and add flight-number based leave-by and arrival planning. Effort S then M. Impact High.
6. **Routine autopilot with leave-now nudges (layer 20).** Pre-plan each learned commute, watch it overnight and send one well-timed push using the better-stop, p90 and connection logic. Effort M. Impact Very high.
7. **MOTIS 2 as a second engine in shadow mode (layer 14).** Self-host on a free or very cheap server with Cyprus OSM, GTFS, GTFS-RT and GBFS, compare with Aloya's planner, fall back gracefully, and keep Aloya's ranking on top. Effort M. Impact High.
8. **Data quality and standards hygiene (layer 15).** CI validation of each GTFS release (it would have flagged the Limassol feed's 7-day calendar), derived stop groups and a transfers overlay, SIRI-ET fallback, the official Nextbike GBFS, and honest attribution in Aloya's own GBFS. Effort S. Impact High.
9. **Targeted park and ride as a real leg (layer 17).** Ingest the 9 official P&R sites and 651 car parks from CyNAP, offer P&R only to riders who would otherwise drive the whole way, and show the money comparison with driving and parking in town. Effort S to M. Impact High for car-dependent commuters.
10. **Night and rural safety net (layer 19).** "Last bus home" reminders, night-safe walking, honest wait-or-taxi comparisons, village day cards, first-mile bike or taxi to trunk roads in thin areas such as Paphos district (33% of its served stops have four or fewer departures a day), and DRT legs for the Limassol on-demand bus once agreed. Effort S to M. Impact High.



# Part C: Integrations, partners and the open platform (layers 21 to 30)

Aloya 50-layer smart mobility research. Part C covers everything outside the bus feed that Aloya plugs into, and everything that might one day plug into Aloya: the economics of Mobility as a Service, micromobility, taxis and ride-hail, ticketing and payments, Aloya as a platform for others, the competitive field (Google, Apple, Moovit, Transitous and local apps), cars and parking, tourism, employers and universities, and government, EU law and open data.

Samuel's vision for this part, from the brief: Aloya is not a bus app. It is a smart mobility platform for Cyprus that integrates many partners and is open for others to integrate it. Part C tests that vision against the code as it stands and against what partners, regulators and competitors actually allow.

Code references point at repo programmeradu/aloyacy-8f3d9cd7, branch redesign-roam, commit 1508f3f (full sha 1508f3ff4f387f758369bcb7f996d0f4658e4261, checked 31 Oct 2026). The branch was read only; nothing was changed on it.

A note on sources. Facts marked "earlier research pass" come from the raw findings file part-c-raw.md, written by an earlier run whose report did not carry its URLs. They were not re-opened in this pass and should be re-checked before anyone relies on them in public. Everything else carries the URL that was opened or searched in this pass.

## Five things that need fixing before any partner conversation

1. **JCC Smart login with user passwords and spoofed browser headers.** src/lib/jcc.functions.ts sends the rider's JCC Smart email and password from Aloya's server to apihub.jcc.com.cy (lines 44 to 59), sets origin and referer to https://www.jccsmart.com/ and a desktop Safari user agent (lines 11 to 18) so the request "looks like a normal browser session" (comment, lines 20 to 21), then reads the card's last 30 transactions (lines 168 to 183). The file's own header says it exists because "apihub.jcc.com.cy locks CORS to jccsmart.com" (lines 2 to 3). The same logic is copied into a public, unauthenticated CORS endpoint, src/routes/api/public/wallet.ts (headers at lines 18 to 26, CORS `*` at lines 35 to 40), which also sends a spoofed referer to publictransport.com.cy (lines 28 to 33). No agreement with JCC is recorded anywhere in the repo. This is the single largest legal and trust risk in the product.
2. **The licence says proprietary.** LICENSE is titled "Aloya, Proprietary Software License" and grants no licence beyond evaluation (sections 2 and 3); README.md line 258 says "Proprietary, all rights reserved"; COMMERCIAL.md describes single-deployment, source-available and full asset transfer grants. Memory from earlier sessions recorded the project as MIT. A platform that wants others to integrate it cannot be ambiguous about this.
3. **About 60 open public routes.** Of the 63 route files under src/routes/api/public that are not cron hooks or Open Graph images, 59 send `Access-Control-Allow-Origin: *`. None needs an API key. The only throttles are per-device checks keyed on a device id the caller supplies (sighting.ts line 14 and 90, stop-photo.server.ts lines 100 to 110), which a script can vary at will. Paid upstreams sit behind some of them: ElevenLabs and OpenAI text to speech (tts.ts), OpenAI speech to text (stt.ts), Gemini (wallet/ocr.ts line 121 to 136, and parse-trip-intent.ts via src/lib/ai-planner.functions.ts line 55), and Mapbox Search Box, which src/lib/maps.server.ts lines 7 to 8 note is "billed per request" (places-autocomplete.ts). The brief called these "Google" endpoints; at 1508f3f the maps backend is Mapbox, not Google Maps (maps.server.ts lines 1 to 5 say Google Places, Geocoding and Routes were replaced in Oct 2026 after the Google Cloud account suspension), while Gemini is still Google. .env.example lines 21 to 28 still document Google Maps keys, which is stale.
4. **Kapnos is read from an undocumented booking API.** src/lib/kapnos.functions.ts line 30 fetches https://kapnos.ecoachmanager.com/coachtrip/api/trip-type-all, described in the file as "the live booking API behind kapnosairportshuttle.com" (lines 9 to 12). There is no agreement with Kapnos.
5. **The Bolt hand-off earns nothing.** src/lib/mobility-links.ts lines 21 to 31 build a Bolt AppsFlyer OneLink with `pid=aloya`. That media source id was chosen by Aloya, not issued by Bolt, so no attribution or payment flows back. Bolt's documented paid route for third parties is the Bolt Business referral scheme (layer 23).

## Layer 21: What MaaS taught the world (and why Aloya should not resell tickets)

### 21.1 What the best in the world do

- **MaaS Global (Whim) failed.** The Finnish pioneer filed for bankruptcy in the Helsinki District Court on 14 March 2024 (Mobiili.fi, 16 Mar 2024, citing the insolvency register). Mobility Payments reported it had "burned through €75.5 million in less than seven years" (15 Mar 2024). In 2022 it lost €9.3m on turnover of €3.8m, had about 10,000 active monthly users in Helsinki and 38 staff, down from a peak of 120 (Traffic Technology Today and CCAM-TAC, 21 Mar 2024). Sustainable Bus named the B2C subscription model as a reason for the losses (22 Mar 2024). Umob bought the technology and the Whim app on 18 April 2024 (umob.app press release) and moved it to a pay-per-ride model (Zag Daily, 18 Apr 2024). Founder Sampo Hietanen reflected on the collapse in ITS International (21 Aug 2024).
- **Citymapper stopped selling travel.** Citymapper PASS, its London subscription bundle, ended on 18 June 2023; Citymapper said it "was restricted to London only and there were many limitations that did not allow us to scale it outside of one city" (citymapper.com/news/2597). Its self-service SDKs and APIs ended on 23 June 2023 (citymapper.com/news/2596). Via acquired Citymapper on 15 to 16 March 2023 (Via press release; Via 10-K for 2025), and Via's filing now describes Citymapper's value as data infrastructure, co-branding and in-app advertising for agency customers.
- **The agency as integrator works.** Berlin's BVG Jelbi, built on Trafi, had about 400 locations, about 70,000 bookable vehicles, more than seven million rentals at Jelbi sites since 2019 and over 1.2 million downloads by the end of 2025 (BVG press release, 29 Dec 2025). The public operator owns the customer and the hubs; private operators plug in.
- **Earlier research pass (not re-opened):** Umob takes a provider fee per booking at the same price to the rider, plus employer budgets with one invoice and CO2 reports; Ummadum went bankrupt on 4 Dec 2025; Transit's paid Royale tier is sponsored by agencies in some cities; SBB EasyRide (FAIRTIQ technology) is SBB's fastest-growing sales channel.

### 21.2 Cyprus reality and data

- Cyprus has no single account across bus, bike, scooter, taxi and car sharing. Each operator has its own app (Motion and Pame for buses, Nextbike, Bolt, Electra, RideNow, toGO, Kapnos).
- Bus ticketing is a state system: the Motion card on every public operator, with GMV contracted for account-based ticketing on 750 buses run by six companies (ITS International, 16 Nov 2023). Resale of bus tickets by a third party would need the Ministry's permission and would sit on that state platform.
- Bolt's only published paid route for outsiders is Bolt Business referrals (layer 23). No Cyprus operator was found offering a public reseller or affiliate API.

### 21.3 Aloya today, and its gaps

- Aloya does not transact for any partner. Kapnos, Bolt and Nextbike are deep links (kapnos.functions.ts line 20 "we don't transact"; mobility-links.ts).
- Aloya's only revenue code in the repo is Stripe billing for Aloya Pro (COMMERCIAL.md "Stripe billing"). Every hand-off to a partner earns nothing today.
- src/routes/api/public/partners/apply.ts is a waitlist form that writes to partner_applications; its header says "This is not a console, not keys, not usage, those wait for a paying Truth API customer." There is no partner model behind it yet.

### 21.4 Improvements

1. **Write the rule down: no ticket resale, no consumer bundle (S, very high).** Whim's losses and Citymapper PASS's closure both came from carrying the cost of travel. Aloya should stay a planner, guide and referrer. Put this in a one-page partner policy in the repo (docs/partners.md) so every later decision is checked against it.
2. **Earn on referrals and B2B, not on margin (M, high).** Three income lines that need no capital: the Bolt Business referral scheme (layer 23), employer commute reports and budgets (layer 29), and a paid data or API tier for partners (layer 25). Each is a flat fee or subscription; none needs Aloya to hold riders' money.
3. **Measure every hand-off now (S, high).** Log each outbound partner tap (partner, mode, origin stop, destination stop, hour, no user id) to the existing analytics. Without counts, no partner conversation can start. Use these counts as the evidence in the Kapnos, Electra, RideNow and Bolt approaches.
4. **Position Aloya as the agency's Jelbi, not a rival (L, very high).** The Jelbi lesson is that the public operator owns the customer. Offer CPT, EMEL, OSYPA and OSEA a white-label or co-branded planning layer (Aloya's planner and alerts inside their brand) rather than competing with Pame. This is also the route to EU funding (layer 30).
5. **Do not build a wallet of stored value (S, medium).** Stored value would bring e-money licensing questions; leave money with the operators and with Motion.

Effort and impact: items 1 and 3 are days of work and unblock every other layer in Part C.

## Layer 22: Micromobility (bikes, scooters and mopeds anywhere in the trip)

Samuel's point from the brief applies here: micromobility is not only the first or last mile. A bike or scooter can be the middle of a trip, for example to cross from one bus corridor to a faster one. That only works if Aloya knows where vehicles are, what they cost, and where they may legally be ridden and parked.

### 22.1 What the best in the world do

- **GBFS is the open standard.** MobilityData's General Bikeshare Feed Specification is a public, pull-based, near real-time feed of stations and vehicles. Its data policy page gives cities model tender language requiring "a publicly accessible API that conforms to the General Bikeshare Feed Specification" with no authentication and an open licence (gbfs.org/documentation/data-policy). Transit publishes best practice for cities requiring public GBFS feeds, citing Los Angeles permit language (resources.transitapp.com, article 296).
- **Licence fields.** The specification recommends an open data licence and says every data set SHOULD state it, using `license_id` (an SPDX identifier, added in v3.0) or `license_url` in system_information.json (gbfs.org reference; GBFS v3.0 gbfs.md).
- **Jelbi** shows micromobility at transit hubs: Voi, Lime, Dott, Nextbike, Bolt and others bookable in one app at about 400 hubs (BVG, 29 Dec 2025; Google Play listing).

### 22.2 Cyprus reality and data

- **Nextbike** runs docked bikes in five regions (Limassol, Nicosia, Larnaca, Paphos, Famagusta) per src/lib/bikeshare.functions.ts lines 3 to 6. Earlier research pass: Nextbike publishes GBFS v2.3 under CC0 with a 60 s refresh.
- **Bolt scooters** run in Nicosia. The national access point publishes a "boltstations" dataset of mandated parking zones (src/lib/bolt-scooter.functions.ts lines 5 and 32). Earlier research pass: Bolt scooters cost from €0.15 per minute and Bolt publishes no GBFS feed for Cyprus.
- **Electra** (Digital Valley Ltd, Nicosia) offers shared e-mopeds from €0.22 per minute in Limassol, Larnaca and Nicosia, with e-bikes and e-scooters from €0.15 per minute listed as "soon" (electra.space, home page; T&C PDF names Digital Valley Ltd). It also sells a €230 per month moped subscription (Bazaraki listing, 10 Apr 2026). No public feed was found.
- **Law.** Two amending laws to the 2018 Bicycles and Personal Mobility Devices Law were published in the Official Gazette on 22 April 2026 (Law 107(I)/2026 on cylaw.org) and came into force on 19 May 2026, raising the minimum e-scooter age from 14 to 17, regulating where devices may be used and setting rules for rental operators (Cyprus Mail and Politis, 19 May 2026; ETSC, 26 May 2026). E-scooters may be used only on roads with a limit of up to 30 km/h and on cycle paths (Cyprus Mail, 1 Sep 2026). A draft decree, in consultation until 26 Sep 2026, allows police and municipal wardens to impound scooters for 30 to 90 days for riding in a prohibited area, riding under 17, or a device capable of more than 25 km/h (Cyprus Mail, 27 Aug 2026; Philenews). Nicosia Municipality is creating more than 100 scooter parking points and expanding 30 km/h zones (Philenews). The decree is a draft as of the latest source found; the brief's "from Sep 2026" date for impoundment is not confirmed as in force.

### 22.3 Aloya today, and its gaps

- **Nextbike is integrated** through https://maps.nextbike.net/maps/nextbike-live.json?city=190,206,940,957,889 (bikeshare.functions.ts line 32), Nextbike's live JSON rather than its GBFS feed. The file sets honest rules: never recommend a station with 0 bikes or a destination with 0 free racks, assume 16 km/h, add 90 s to unlock and 60 s to return, and only suggest cycling when it saves at least 3 minutes (lines 15 to 22). The licence of nextbike-live.json was not checked in this pass; the GBFS feed's licence is the safer basis.
- **Bolt scooters are integrated** only as Nicosia parking zones from the NAP (bolt-scooter.functions.ts), plus the unpaid deep link in mobility-links.ts. Aloya cannot see live scooter positions or battery.
- **Electra is not integrated.**
- **Aloya republishes a merged feed.** src/routes/api/public/gbfs[.]json.ts publishes GBFS 2.3 auto-discovery for "Nextbike (5 cities, docked bikes) and Bolt (Nicosia, e-scooter parking zones)" so that catalogues, OpenTripPlanner and Transitland can pick it up (lines 1 to 9). Its system_information (gbfs/system_information[.]json.ts lines 24 to 36) has `start_date: "2024-01-01"`, which predates Aloya, and no licence field; `purchase_url` points at aloya.cy, where nothing can be purchased; and the operator line names "Bolt Cyprus" as an aggregated operator though Bolt has not agreed to this.
- **Mid-trip micromobility.** Whether the planner can insert a bike or scooter leg between two bus legs is a routing question covered in Part B; this layer only notes that the data layer supports bikes at both ends of a trip, not live scooters anywhere.

### 22.4 Improvements

1. **Fix the merged GBFS feed this week (S, high).** In system_information: set `start_date` to the day the feed first went live; drop or correct `purchase_url`; add `license_url` (GBFS 2.3 has no `license_id`; that field arrived in v3.0) pointing at a page that states each source's licence (Nextbike's GBFS licence as published; the NAP's licence for Bolt zones); keep `attribution_organization_name`. Rename the operator line to "Aloya (aggregator) using Nextbike and Cyprus NAP data" until Bolt agrees otherwise.
2. **Switch Nextbike to its GBFS feed (S, medium).** Reading the GBFS endpoint gives a stated licence and the standard rental_uris already used by nextbike links (mobility-links.ts lines 13 to 16).
3. **Ask Electra and Bolt for public GBFS (S to write, high if granted).** Cite the GBFS data policy and the EU MMTIS deadline of 1 Dec 2026 for vehicle-sharing availability data (layer 30). Offer Aloya's hand-off counts (layer 21, item 3) as the value they get back.
4. **Show legal riding and parking, not just vehicles (M, high).** Combine the NAP scooter zones, the 30 km/h rule and Nicosia's new parking points into a "can I ride and park here" layer. When a scooter leg would end outside a permitted zone, plan the walk from the nearest zone instead. With impoundment of 30 to 90 days in the draft decree, a wrong suggestion now has a real cost to the rider.
5. **Age gate the scooter suggestion (S, medium).** Do not suggest an e-scooter leg to riders who have told Aloya they are under 17, and say why.
6. **Middle-of-trip legs (M, high, shared with Part B).** Allow a bike or scooter leg between two transit legs when it reaches a stop with a markedly better next departure, using only modes Aloya can see live (Nextbike now; Electra and Bolt after item 3).

## Layer 23: Ride-hail, taxis and airport shuttles

### 23.1 What the best in the world do

- **Ride-hail inside other products.** Bolt launched a ChatGPT integration across all its markets at once on 29 to 30 July 2026: riders see an upfront price estimate, route options, driver arrival time and a suggested pickup point, then the details transfer to the Bolt app, where booking and payment are completed; in-chat payment is planned later (Bolt blog, 29 Jul 2026; Zag Daily, 28 Jul 2026; Cities Today, 10 Aug 2026). The pattern is a hand-off with context, not a resale.
- **Paid referral for companies.** Bolt Business pays through PartnerStack. The PartnerStack listing and Bolt's legal terms describe €150 per company after its first ride, and the referred company gets 25% off 20 rides (market.partnerstack.com/page/bolt; bolt.eu Bolt Business referral terms, clause 3.2). Bolt's own referral page says €150 after 5 rides and up to €200 per company, with a further €50 when the company becomes active (bolt.eu/en-ie/business/refer-a-company). The two routes publish different thresholds; read them separately.
- **Transit plus taxi in one planner.** Jelbi includes Taxi Berlin alongside sharing services (Google Play listing).

### 23.2 Cyprus reality and data

- **Bolt** is the dominant ride-hail app. Earlier research pass: Uber left Cyprus in 2016; other options include inDrive, CabCY, Alfa, VIPS, Yango and Travel & Express shared intercity taxis; Bolt has no public booking API, and Bolt Business Ride Booker is available through Iomob.
- **Kapnos Airport Shuttle** has run shared airport transfers since 2008 covering Larnaca (LCA) and Paphos (PFO) airports, with stops at Nicosia Shuttle Station on Kyrenias Avenue, Ayia Napa and Protaras (kapnosairportshuttle.com and /timetables). It says it operates over 100 daily departures (Kapnos blog, 3 Jun 2026) and expanded Paphos airport services in June 2026 (Cyprus Mail and Sigmalive, 29 Jun 2026). Its routes went live on Google Maps on 20 Feb 2026, announced by Igor Akimov (LinkedIn). Its booking system runs at kapnos.ecoachmanager.com/coachtrip/ (page footer "2026 Kapnos Airp..."). Earlier research pass: €9 from Larnaca airport to Nicosia, sold on Klook, no affiliate scheme; contact named as Marios Socratous.
- **The public alternative to Kapnos** for Larnaca airport to Nicosia is a two-ticket trip via route 425 that is cheaper but roughly twice as long and stops running in the afternoon (buscyprus.cy guide, updated 16 Oct 2026).

### 23.3 Aloya today, and its gaps

- **Kapnos.** kapnos.functions.ts reads the undocumented endpoint `/coachtrip/api/trip-type-all` (line 30), which returns "every active route with its pickup/dropoff coordinates and the next ~60 scheduled departures per route, including seat availability" (lines 9 to 12). It sets honest rules (suggest only when both ends are within walking range of the same direction-aware route, filter departures already gone, show seat availability as is) and deep-links to kapnosairportshuttle.com (lines 343 to 344). The public route at src/routes/api/public/kapnos.ts re-exposes this with CORS `*`, so anyone can use Aloya as a proxy to Kapnos's booking backend. There is no agreement; the endpoint can change or be blocked without notice, and showing a third party's live seat counts without permission is a risk.
- **Bolt.** mobility-links.ts builds `https://bolt.onelink.me/UdR6/aloya?pid=aloya&c=aloya_last_mile|aloya_scooter&...` (lines 21 to 31). The comment explains it opens the Bolt app because bolt.onelink.me carries Bolt's app links, and that Bolt publishes no pickup or destination parameters (lines 3 to 11). The `pid` is self-chosen; AppsFlyer media sources are configured by the app owner, so this link earns nothing and may not even be counted.
- **No taxi fares.** maps.server.ts mentions a "taxi quote" caller (line 4), but there is no licensed taxi fare source or booking.

### 23.4 Improvements

1. **Join the Bolt Business referral scheme now (S, medium).** It is free to join and pays per company, which matches the employer layer (layer 29). Put the referral link on a "For employers" page and in commute reports, not in the rider's taxi button, since it rewards company sign-ups, not rides.
2. **Write to Kapnos (S to write, high).** Ask for three things in order of preference: written permission to use the trip-type endpoint with a named rate limit; a referral arrangement for bookings that start in Aloya; or a GTFS feed (they already publish to Google Maps via the work described by Igor Akimov). Offer Aloya's tap counts as evidence. Until there is an answer, cache the feed for at least 15 minutes, stop exposing it through the public CORS route, and stop showing live seat counts.
3. **Make the Bolt hand-off honest (S, medium).** Until Bolt issues a partner id, label the button "Open Bolt" and stop implying a partnership. Ask Bolt Cyprus for a partner media source when the hand-off counts justify it.
4. **Bolt in AI assistants (M, medium).** Aloya already exposes an MCP server (layer 25). When a rider asks Aloya's assistant for a taxi, hand off to Bolt the same way ChatGPT does: price estimate in Aloya where a lawful source exists, then open Bolt. Do not scrape fares.
5. **Taxi as a fallback inside a bus plan (M, high).** When a missed connection leaves a long wait (Part A, layer 6), offer "taxi to the next stop on this route" as one option with an honest note that the fare is set by the operator. This is a hand-off, not a booking.

## Layer 24: Ticketing and payments (Motion, JCC and what comes next)

### 24.1 What the best in the world do

- **Account-based ticketing (ABT)** keeps the passenger's account in the cloud and treats the card, phone, watch or bank card as an identifier, which makes fare capping and multi-operator fares easier (GMV press release on Cyprus).
- **Open payment at the validator.** GMV rolled out contactless EMV bank card payment across most of the Madrid regional consortium's concessions after a December 2024 pilot (GMV press release).
- **Third-party apps read, operators sell.** The common pattern among planners is to show fares and deep-link to the operator's own ticketing; the failures in layer 21 came from apps carrying the cost of the fare.

### 24.2 Cyprus reality and data

- **Fares, Nicosia and Larnaca (CPT), from 3 Aug 2026:** urban single €2.70 cash or €2.00 on a Motion card; night single €4.70 or €3.50; 30 days €66.90 on a personalised card or €93.60 anonymous; 365 days €668.50 (publictransport.com.cy, ticket fares page). The cash fare rose from €2.40 to €2.70 (Kathimerini English, 3 Aug 2026).
- **Fares, Limassol (EMEL), from 5 Nov 2026:** single from the driver €2.50, still €2.00 from Motion eWallet; night €4.00; day €7.00; 7 days €35.00; 30 days €50.00 personalised or €60.00 anonymous; reduced fares only on a Motion card from that date (limassolbuses.com, "Fare changes", 27 Aug 2026; an earlier notice dated 11 Aug gave 12 Oct, superseded).
- **Usage.** CPT carried 12.3 million passengers in 2025 and 82.6% of its passengers use Motion (Cyprus Mail and CBN, 16 Sep 2026; CPT LinkedIn, 15 Sep 2026). Earlier research pass: 8.78M trips Jan to Aug 2026 (+14.5%), 63% on 30-day passes. CPT's spokesman said ticket sales rose 50% between 2019 and 2025 and that fares are set by contract until 2028 (AlphaNews, 14 Oct 2026).
- **ABT and card payment.** The Ministry awarded GMV an ABT contract for 750 buses run by six companies, with a bank card pilot in Famagusta (ITS International, 16 Nov 2023). OSEA fitted 89 Famagusta buses with POS terminals (Kathimerini English, 26 May 2025). On 30 Oct 2026 the Transport Minister said the card payment system already running in Limassol would be extended to other cities and that online booking for intercity coaches is being studied (Sigmalive and info.cy, 30 Oct 2026). CPT says it is ready to extend to card payments "as soon as new functions are approved" (Cyprus Mail, 15 Oct 2026). Intercity remains cash, €5 to €8 by distance (aloya.cy/fares, citing the same tariff).
- **JCC Smart** is the account system behind Motion top-ups; publictransport.com.cy says online top-up is "thru online payment with Jcc" (fares and cards page).

### 24.3 Aloya today, and its gaps

- **JCC login proxy.** As set out at the top of this part: jcc.functions.ts posts the rider's email and password (converted to char codes "so we look like a normal browser session", lines 20 to 24) to `/smartauthms/api/v1/Account/Login`, refreshes tokens (lines 117 to 143), and reads `/smartms/api/v1/BusFare/Transactions` for the last 30 days (lines 168 to 183), deriving balance from the newest transaction (lines 243 to 250). The header says credentials are never logged or stored and that tokens live in the browser's localStorage (lines 3 to 5). src/routes/wallet.tsx line 11 calls it from the web wallet, and src/routes/api/public/wallet.ts repeats it as an unauthenticated CORS `*` endpoint for the native app, adding a spoofed referer to publictransport.com.cy's web service (lines 28 to 33).
- Why this matters, in plain terms. Aloya's server holds a third party's password in transit and impersonates that third party's own website to get past a control (the CORS lock) that JCC put there deliberately. If JCC changes its API, the feature breaks; if JCC objects, Aloya has no defence; if Aloya's server or logs were ever compromised, riders' JCC credentials would be exposed. A public endpoint that accepts JCC passwords from any origin also makes Aloya a ready-made credential-testing proxy against JCC. Whether this breaks JCC's terms or any law was not established in this pass; a lawyer should look at it. What is certain is that it would end any partnership conversation with JCC, the Ministry or GMV.
- **Wallet passes and OCR.** COMMERCIAL.md lists Google Wallet passes and the repo has src/routes/api/public/wallet/pass.ts and wallet/ocr.ts (card scanning via Gemini, OpenAI or a gateway). These are fine in principle but share the open-CORS problem (layer 25).
- **Fares content.** aloya.cy/fares and aloya.cy/motion-card already publish the August 2026 tariff, which is useful and accurate against the CPT page.

### 24.4 Improvements

1. **Turn off the password proxy now (S, very high).** Remove the login and refresh actions from src/routes/api/public/wallet.ts immediately (that endpoint is open to the world). On the web, hide "Sign in with JCC" behind a flag that is off by default. Keep a manual balance mode: the rider types or scans the card number and Aloya links to publictransport.com.cy's own balance check and top-up pages, which is what the operator provides.
2. **Label anything left as unofficial (S, high).** If any JCC-derived feature stays for testing, label it "Unofficial. Not provided by JCC or Motion" and never send a password to Aloya's server.
3. **Ask for read-only partner access during the ABT rollout (M to arrange, very high).** Write to the Ministry's ABT project and to JCC: Aloya would like a consented, read-only, token-based (OAuth style) feed of a rider's balance, pass expiry and recent validations, so it can say "your 30-day pass ends tomorrow" and "this trip will cost €2.00 on Motion". ABT is the moment to ask, because the account model is being built now.
4. **Fare engine in the planner (M, high).** Show each plan's fare in the rider's own terms: cash, Motion anonymous, Motion personalised, discounted, and the 60-minute free transfer (two transfers within 60 minutes for €2.00 on eWallet, per info.cy quoting the CPT table). Different operators have different rules (EMEL's eWallet single stays €2.00 while cash becomes €2.50 from 5 Nov 2026).
5. **Card payment availability flag (S, medium).** Track by operator and route whether bank card payment is accepted on board (Limassol yes, others not yet per the Minister on 30 Oct 2026), and show "cash or Motion only" where true. Update as the rollout spreads.
6. **Do not sell tickets (S, high).** Repeat of layer 21. Deep-link to the operator's top-up and, when intercity online booking arrives, to that.

## Layer 25: Letting others integrate Aloya (APIs, licence, MCP and widgets)

### 25.1 What the best in the world do

- **Standards first.** For public transport, GTFS and GTFS-RT; for shared vehicles, GBFS (public data) and MDS, which the Open Mobility Foundation describes as regulator-facing and not public (MDS version guidance; gbfs.org FAQ). MDS 2.1 was released in July 2026 (OMF, 20 Jul 2026). TOMP-API, the transport operator to MaaS provider API, is openly published by the TOMP working group (github.com/TOMP-WG/TOMP-API). Earlier research pass: TOMP-API v2.0 adoption is weak.
- **Clear terms beat clever code.** Transitous publishes a short usage policy (open-source clients, light usage, contact before heavy use, keep attribution) and enforces it (transitous.org/api; GitHub issue 2399, Aug 2026). Citymapper closed its self-service API in June 2023 rather than run it without a business model (citymapper.com/news/2596).
- **Keys and quotas.** Any public API that calls paid upstreams uses per-client keys, quotas and origin restrictions; this is ordinary practice, not a differentiator.

### 25.2 Cyprus reality and data

- The national bus data is open: GTFS, SIRI and GTFS-RT on the Cyprus National Access Point and data.gov.cy (traffic4cyprus.org.cy SIRI dataset page; data.gov.cy dataset 1069). Earlier research pass: Transitland lists the bus feed as CC-BY-4.0 (f-intercity~buses~cy).
- Because the base data is open, Aloya's value to integrators is not the timetable; it is the cleaned, merged and corrected layer on top (reliability, stop corrections, micromobility merge, Kapnos once permitted) and the planner.

### 25.3 Aloya today, and its gaps

- **Licence conflict.** LICENSE (proprietary, evaluation only), README line 256 to 260 and COMMERCIAL.md all say proprietary. Earlier memory said MIT. Nothing in the repo grants any outside developer a right to use Aloya's API output.
- **Open routes.** 59 of the 63 non-hook, non-OG route files send CORS `*` with no key. Cron hooks are protected (18 of 19 hook files check CRON_SECRET or similar; ping-gap-compute.ts uses cronGuard from src/lib/cron-auth.server.ts), and bedrock-test.ts and metrics.ts are admin-gated. Examples of costly or sensitive open routes: plan.ts (the planner; comment lines 6 to 9 say it is CORS-open so "any other first-party native client" can call it), places-autocomplete.ts (Mapbox Search Box, billed per request), walk-directions.ts (Mapbox Directions), tts.ts (ElevenLabs then OpenAI then gateway, input clipped at 400 characters by TtsSchema), stt.ts (OpenAI speech to text), parse-trip-intent.ts (Gemini or OpenAI), wallet/ocr.ts (Gemini), streetview.ts (Mapillary, free but token-bound), kapnos.ts and wallet.ts (third parties). A single script can run up Aloya's Mapbox, ElevenLabs, OpenAI and Gemini bills.
- **MCP server.** src/lib/mcp/index.ts defines "aloya-mcp" version 0.2.0 with tools search_stops, get_stop_arrivals, watch_stop_arrivals and plan_trip (instructions at line 12; tests in index.test.ts). src/routes/mcp.ts mounts it at /mcp with OAuth protected-resource metadata (auto-generated by @lovable.dev/mcp-js). Whether it is reachable in production was not verified in this pass.
- **Partner intake.** partners/apply.ts collects applications with a 24-hour email dedupe and a honeypot field ("company"), but there is no key issuance or usage tracking.
- **GBFS republishing** is covered in layer 22.

### 25.4 Improvements

1. **Resolve the licence in one sentence (S, very high).** Decide and write down: the code stays proprietary (current files) and the public API and data outputs are offered under separate terms. Suggested split: code proprietary; Aloya-derived open data (for example corrected stop positions and the GBFS merge) under CC BY 4.0 with attribution to Aloya and to each source; API access under written API terms. Update memory and README so nobody believes it is MIT.
2. **Keys, quotas and origin rules on costly routes (M, very high).** Add a small middleware used by every public route: (a) first-party clients (web app origin, native app with an app attestation or signed token) pass; (b) third parties need an API key issued from partners/apply; (c) per-key and per-IP quotas stored in the existing database or an edge KV; (d) CORS restricted to app.aloya.cy, aloya.cy and registered partner origins for plan, places-autocomplete, walk-directions, tts, stt, parse-trip-intent, wallet/ocr, kapnos and wallet. Keep read-only, cheap, cacheable routes (stops, gbfs.json, realtime snapshot) open with CDN caching.
3. **Budget alarms on upstreams (S, high).** Set hard monthly caps in Mapbox, ElevenLabs, OpenAI and Gemini consoles and alert at 50% and 80%, so abuse fails safe.
4. **Publish the MCP server properly (S, medium).** Verify /mcp is live, document the four tools, require a key for watch_stop_arrivals (long polling is the expensive one), and list it in MCP directories. This is the cheapest way to make Aloya "integrable" by AI assistants, mirroring Bolt's ChatGPT move (layer 23).
5. **Document deep links (S, medium).** A public page listing stable URLs: open a stop, a line, a plan from A to B, a live trip share. Partners such as hotels and universities (layers 28 and 29) can then link without an API.
6. **Embeddable departures widget (M, high).** A script tag or iframe showing the next departures for one or more stops, with Aloya attribution and a "plan in Aloya" link. This is the product for hotels, campuses, employers and municipalities.
7. **Attribution everywhere (S, medium).** Show "Data: Cyprus NAP (CC BY 4.0), Nextbike, ..." in the app and in API responses, as the open licences require and as Transitous and others expect.
8. **Do not adopt TOMP-API or MDS yet (S, low).** Neither has Cyprus counterparts today. Revisit only if a Cyprus city asks for MDS from scooter operators and wants Aloya to help.

## Layer 26: Google Maps, Apple Maps, Moovit, Transitous and the local apps

### 26.1 What the best in the world do

- **Google Maps** covers transit wherever agencies publish GTFS to it, and is adding a learned commute "Transit mode" on Android (Android Authority teardown, 20 Jan 2026, cited in Part A layer 1).
- **Moovit** combines operator data with crowd reports from a network of local editors and offers live directions with get-off alerts (moovit.com/about-us; Moovit Nicosia guide page).
- **Transitous** is a community-run, provider-neutral routing service on the open-source MOTIS engine, free for open-source, non-commercial, light-usage clients, with source licences tracked per feed (transitous.org; transitous.org/api; Träwelling licensing help page). Its maintainers apply the open-source requirement strictly (GitHub issue 2399, Aug 2026). A July 2026 issue notes that Transitous also carries non-commercial (NC) data and that commercial open-source clients may not be able to use all of it (issue 2293).

### 26.2 Cyprus reality and data

- **Google.** Kapnos routes went live on Google Maps on 20 Feb 2026 after years of advocacy by Igor Akimov and volunteers (LinkedIn post, 20 Feb 2026; reshared by Alexia Solomou, 27 Feb 2026). Earlier research pass: EMEL appeared on Google around Feb 2026 and coverage is still described as patchy.
- **Moovit** lists NPT, OSEA, Intercity, LPT and EMEL lines with real-time tracking, and Paphos agencies including OSYPA, Intercity Buses and Kapnos Airport (Moovit Nicosia, Paphos and line pages). Its Nicosia pages advertise "Ride & Pay with Moovit in Nicosia" (Moovit Pay). Whether Moovit Pay actually works in Cyprus was not verified; the text may be a global template.
- **Apple Maps** coverage of Cyprus transit was not verified in this pass.
- **Official apps.** The Ministry's "Cyprus Bus" app by MOTION (built by GMV, package com.gmv.cyprusbus2) gives timetables and live arrivals island-wide (motionbuscard.org.cy/app). CPT's relaunched Pame app (15 Sep 2026) offers live arrivals, a journey planner, maps and Motion top-up (publictransport.com.cy Pame page; Cyprus Mail, 16 Sep 2026).
- **Independent field** found in this pass: BusCyprus (buscyprus.cy and buscyprus.app), cyprustransport.com.cy, info.cy/buses, cyprusbus.app, CyBuses (cybuses.com) and Urbaneel (urbaneel.com). Earlier research pass also listed BusAPP and buscyprus.com.
- **Transitous.** Earlier research pass: Cyprus coverage is partial, and realtime was added in PR #1427.

### 26.3 Aloya today, and its gaps

- Aloya reads the same national GTFS and GTFS-RT as everyone else (Part A layer 5), so live arrivals are not a differentiator. The open bus data that powers Aloya also powers at least six other Cyprus apps and sites listed above.
- Aloya's distinct assets in the code are its reliability and ETA work (route-reliability.ts, stop-reliability.ts, eta-log.ts, hooks/eta-backtest.ts), crowd signals (sighting.ts, stop-skip-report.ts, rider-fix.ts), multimodal links (Nextbike, Bolt zones, Kapnos, park and ride in park-and-ride.ts, EV chargers in src/lib/ev-chargers.functions.ts) and the in-trip companion described in Part A.
- Aloya is not listed in the Mobility Database or contributing to Transitous, so other tools cannot discover its GBFS merge.

### 26.4 Improvements

1. **Compete on trust, not on coverage (S to decide, very high).** Make "how sure we are" the visible differentiator: confidence on every ETA, ghost-bus warnings and honest fallbacks (Part A layer 5). Nobody in the Cyprus field publishes this.
2. **Win on Cyprus multimodal coverage (M, high).** Kapnos with permission (layer 23), Electra and Bolt with GBFS (layer 22), UCY shuttles (layer 29), car sharing deep links (layer 27). Each is something Google and Moovit do not have.
3. **List the GBFS merge in the Mobility Database (S, medium)** after the fixes in layer 22, so it is discoverable and so Aloya is credited as a Cyprus data source.
4. **Contribute upstream to Transitous (S, medium).** Fix or add the Cyprus feed configuration and licence metadata in the Transitous repo. Do not use the Transitous API in Aloya's commercial app: its policy requires open-source, non-commercial clients. Contributing builds reputation with the European open transport community at no cost.
5. **Track competitors monthly (S, low).** A short checklist: Pame, Cyprus Bus, Moovit, Google, BusCyprus. What changed, what Aloya should copy, what Aloya does better.

## Layer 27: Cars without owning one (EV charging, car sharing, rental and parking)

The goal in the brief is fewer private cars. People who keep a car often do so for the few trips buses cannot do. Car sharing, park and ride and honest parking information let Aloya serve those trips without pushing people back into ownership.

### 27.1 What the best in the world do

- **Car sharing inside the transit app.** Jelbi offers Miles and Sixt share car sharing alongside buses and trains, with parking included in provider business areas (Google Play listing, carsharing variant).
- **Parking data as public data.** The EU MMTIS rules make "availability and location of vehicle-sharing and car parking spaces" and parking tariffs dynamic data due on national access points by 1 Dec 2026 (DG MOVE presentation, TTS Italia, Nov 2024; Regulation 2024/490).

### 27.2 Cyprus reality and data

- **EV charging.** A Transport Ministry letter of 7 Oct 2026 counts 384 publicly accessible charging points at 221 stations: 76 stations in Nicosia, 57 Limassol, 32 Paphos, 29 Larnaca, 27 Famagusta. The Ministry plans 94 new fast-charging points by 2028 (76 at 150 kW for cars, 18 at 200 to 350 kW for heavy vehicles) for about €10m under the Recovery and Resilience Plan (Cyprus Mail, 23 Oct 2026; Philenews; electrive, 26 Oct 2026). A Cyprus Mail article of 6 Aug 2026 had counted roughly 250 public charging stations at the start of 2026; counts differ by definition. EAC runs the e-charge network (eac.com.cy).
- **Car sharing.** RideNow: 850+ cars across Cyprus, all automatic, start in one city and finish in another (Limassol, Nicosia, Larnaca, Paphos and both airports) (App Store listing); short-ride tariff €1 start plus €0.07 per minute plus €0.27 per km with fuel included and a €19 airport drop-off fee (ridenow.tech/short_rides); airport parking fee from €10, rising to €25 or more at peak (ridenow.tech/airports); RideNow Business with one monthly invoice (ridenow.tech/business). toGO: from €0.29 per minute plus €0.25 per km for a Kia Rio, hourly and daily packages, airport surcharge (togorent.com/price.html). Earlier research pass: toGO has 35 cars; CAROL offers peer-to-peer car sharing. The Republic had 30,444 licensed rental cars in 2025 (rentalsincyprus.com blog, secondary source).
- **Parking.** Limassol's smart parking system covers about 2,500 spaces (around 1,500 on-street and 876 off-street) under a €5.17m plus VAT contract with Blue Sun Automation, with sensors, an app with real-time availability and electronic payment, launched in early July 2026 (Cyprus Mail, 26 Jun 2026; Politis; Fast Forward, 11 Jun 2025). EasyPark is live on Limassol streets "since 2026" (easypark.com/en-cy). Earlier research pass: Smart Parking Nicosia (Yodiwo with JCC), Find2Park, plate recognition in Larnaca and sensors in Paphos.

### 27.3 Aloya today, and its gaps

- **EV chargers** are read from the NAP's electric_vehicle_chargers DATEX II dataset (src/lib/ev-chargers.functions.ts, feed URL line 20, on fixcyprus.cy/gnosis/open/api/nap/datasets/).
- **Park and ride** exists as a public route (park-and-ride.ts).
- **Car sharing** (RideNow, toGO, CAROL) is not integrated. **Parking availability** is not integrated.

### 27.4 Improvements

1. **Car sharing deep links (S, medium).** Add RideNow and toGO as "drive part of the way" options with their published tariffs shown as estimates and a link to each app. Use cases: the trip home after the last bus, a rural leg with no service, and the airport (RideNow ends at both airports).
2. **Park and ride that knows about parking (M, high).** For drivers from villages, plan "drive to a park and ride or a free car park, then bus". Ask Limassol Municipality for its smart parking feed (it will be due on the NAP under MMTIS from 1 Dec 2026, layer 30) and show live free spaces where available.
3. **Honest car comparison (S, high).** For any trip, show what the car really costs: fuel or charging plus parking at the destination (Limassol tariffs once published) versus the bus fare. This is the cheapest nudge toward transit and needs only public tariffs.
4. **EV chargers near stops (S, low).** For EV owners using park and ride, show chargers within walking distance of the stop from the existing NAP dataset.
5. **Approach RideNow Business jointly with employers (M, medium).** RideNow already sells one-invoice business accounts; Aloya's employer reports (layer 29) can recommend "bus plus RideNow for the odd trip" as an alternative to a company car.

## Layer 28: Tourism (visitors who arrive without a car)

### 28.1 What the best in the world do

- Airports and hotels that want guests on public transport give them one clear answer at the moment of arrival: which bus, where it stops, what it costs and how to pay. The Kapnos and BusCyprus airport guides show how much demand there is for that one answer in Cyprus (layer 23).

### 28.2 Cyprus reality and data

- **Arrivals.** Cyprus recorded 580,889 tourist arrivals in September 2026, the best September on record and up 1.8% on September 2025, but January to September 2026 totalled 3,401,538, down 5.6% (CYSTAT press release, 19 Oct 2026). In September, the UK supplied 31.7% (184,345) and Israel 18.1% (105,249); 84.8% travelled for holidays (CYSTAT; Politis, 20 Oct 2026). Earlier research pass: 4.53M arrivals in 2025.
- **Airports.** Larnaca and Paphos handled a record 13.75 million passengers in 2025, up 12% (Hermes Airports via Routes, 16 Jan 2026). Phase II works will raise capacity by 2027 to 12.4 million a year at Larnaca and 5 million at Paphos (Aviation Week, 19 Jan 2026).
- **Getting from the airport.** Kapnos runs direct shuttles; the public alternative from Larnaca airport to Nicosia is a slower two-ticket trip via route 425 (buscyprus.cy). Kapnos also lists Ayia Napa and Protaras stops (kapnosairportshuttle.com/timetables).
- **Earlier research pass (not re-opened):** Deputy Ministry of Tourism 2027 budget €59.4M with a rural focus; DP World Limassol cruise terminal about 6 km from the centre; the MEDCruise General Assembly in Limassol in 2027.

### 28.3 Aloya today, and its gaps

- Aloya already gathers tourism-relevant signals: hooks/pulse-flights.ts and hooks/pulse-cruises.ts feed the Pulse view, src/routes/api/public/airport.ts serves airport content, and Kapnos is suggested when one end of a trip is at an airport (kapnos.functions.ts header).
- There is no landing page for "I just landed", no hotel-facing product and no cruise-day guide.

### 28.4 Improvements

1. **"Just landed" pages for LCA and PFO (S, high).** One page per airport and destination (Nicosia, Larnaca city, Limassol, Paphos, Ayia Napa, Protaras), with the next Kapnos departure (once permitted), the public bus alternative, fares by payment method, the walk to the stop, and a QR code for printing at arrival halls and car rental desks. Use the existing aloya.cy content pages pattern.
2. **Hotel departures widget (M, high).** The embeddable widget from layer 25, preset for a hotel: nearest stops, next departures, "to the airport" and "to the old town" buttons. Pitch through the Cyprus Hotel Association (earlier research pass) and through individual hotels near frequent routes.
3. **Cruise-day guide for Limassol (S, medium).** On days when hooks/pulse-cruises.ts sees a ship in port, show a cruise guide: terminal to centre by bus, bike or taxi, and back-on-board times. Earlier research pass notes the terminal is about 6 km from the centre and that MEDCruise meets in Limassol in 2027, a natural moment to pitch the port and the operator.
4. **English, Hebrew and other languages (M, medium).** With the UK and Israel together near half of September's arrivals, the visitor pages should be in English first and Hebrew next; Polish and German follow (CYSTAT September shares).
5. **Rural access pitch (M, medium).** If the Deputy Ministry's 2027 focus is rural tourism (earlier research pass), propose village access guides: which villages have any bus, on which days, and what the honest alternatives are (car sharing intercity, layer 27).

## Layer 29: Employers and universities (commutes with a decision maker)

Individual riders choose one trip at a time. Employers and universities choose for thousands of people at once and can pay for it. They are also where Aloya can earn without touching fares.

### 29.1 What the best in the world do

- **Business accounts with one invoice.** Bolt Business and RideNow Business both sell company accounts with central billing and reports (Bolt PartnerStack listing; ridenow.tech/business). Earlier research pass: Umob sells employer mobility budgets with one invoice and CO2 reports.
- **Campus apps with shuttle times.** Cyprus International University's own app shows upcoming campus bus departures on home screen widgets and checks students on to buses by QR code (ciu.edu.tr, CIU Mobile page). That is the bar a campus expects.

### 29.2 Cyprus reality and data

- **University of Cyprus shuttles.** UCY tendered "provision of transport services for students and staff" (UCY-2026-010-ΥΑΔ), estimated at €300,000 excluding VAT over 36 months, published 19 Jun 2026, closing 21 Jul 2026 (EU Publications Office; Mercell). UCY's HR site says the inter-campus routes (old Kallipoleos buildings to the new campus) run from 28 Sep 2026 and are operated by Lazarou C. Coaches Ltd (ucy.ac.cy/hr bus routes page). These shuttles are not in the national GTFS (earlier research pass; consistent with the UCY page linking to its own PDF timetables).
- **Fares for students.** CPT gives 50% off on a personalised Motion card (publictransport.com.cy fare table, "Personalised Card 50% Discount" column); EMEL reduced fares are 50% of standard and, from 5 Nov 2026, only on a Motion card (limassolbuses.com). Earlier research pass: EMEL accepts student cards from 8 universities; pupils pay €5 a month or €30 a year; UCLan Cyprus is served by route 424.
- **Tax.** Earlier research pass: no Cyprus tax exemption was found for employer-paid transit passes. This was not re-checked.
- **Crowding signal.** Aloya's own day rhythm notes that "UCY and EUC let out around 14:00, expect crowded 121 and 138 across the river" (packages/core/src/today-rhythm.ts line 38).

### 29.3 Aloya today, and its gaps

- No campus or employer product. The only university awareness in code is the crowding hint above.
- UCY shuttles are not in Aloya's data, so a student planning between campuses sees only public buses.

### 29.4 Improvements

1. **Add the UCY shuttles as a supplementary GTFS (M, high).** Transcribe the Fall 2026 to 2027 timetable from UCY's PDF into a small GTFS feed (agency "Lazarou C. Coaches for UCY"), mark it as schedule-only, and merge it into the planner. Ask UCY for permission and for each semester's timetable by email; offer the feed back to UCY and to the NAP.
2. **Campus widget (S, high once layer 25 item 6 exists).** Next shuttle and next public bus from each campus gate, for UCY, EUC, UNIC, UCLan and others, embedded on the university's student portal. Free for universities; it is distribution for Aloya.
3. **Student fare helper (S, medium).** In the fare engine (layer 24), let a rider mark "student" and show the 50% personalised Motion fare with a link to apply, noting EMEL's Motion-only rule from 5 Nov 2026.
4. **Employer commute report (M, high, paid).** For a company: where staff live (postcode level, with consent), which of them have a usable bus within a set walk and time, the car-versus-bus cost and CO2 per person, and the three changes (shift times, a shuttle, a park and ride) that would move the most staff. Sell it as a fixed-fee report; add Bolt Business and RideNow Business referrals for the trips buses cannot do (layers 23 and 27).
5. **Ask the question on tax (S, medium).** Before pitching "give staff a bus pass", get a Cyprus tax adviser's written view on whether employer-paid passes are a taxable benefit. If they are, say so; the CO2 and parking-space savings may still carry the case.

## Layer 30: Government, EU law, funding and open data

### 30.1 What the best in the world do

- **EU rules force data open.** Delegated Regulation (EU) 2024/490, amending 2017/1926 (MMTIS), requires data holders to provide static and dynamic travel data through each country's National Access Point in set formats, and makes NAP APIs for static data "publicly accessible to data users, where relevant subject to registration" (EUR-Lex). The dynamic data timetable runs from 1 Dec 2025 to 1 Dec 2028 (MMTIS implementation handbook, Nov 2024). DG MOVE's summary: by 1 Dec 2025, disruptions, estimated departure and arrival times and the status of access node features; by 1 Dec 2026, parking tariffs and the availability and location of vehicle-sharing and car parking spaces (TTS Italia presentation, Nov 2024). NAPCORE notes 31 Dec 2026 for urban nodes under TEN-T and 31 Dec 2028 for the whole network for access node identifiers (NAPCORE report D2.4.1).
- **Cities as partners.** EIT Urban Mobility funds consortia that include cities; its Strategic Innovation call names "a fourth essential partner: cities" (eiturbanmobility.eu call page).

### 30.2 Cyprus reality and data

- **NAP.** Cyprus's NAP is traffic4cyprus.org.cy, run by the Public Works Department, which publishes GTFS-RT and SIRI for buses (dataset pages) and, via fixcyprus.cy, DATEX datasets including boltstations and electric_vehicle_chargers (Aloya code). data.gov.cy dataset 1069 bundles GTFS, SIRI, a stops CSV and route shapefiles for all operators.
- **Audit and politics.** The Audit Office criticised bus services in October 2026 (Part A sources: Politis, 14 Oct 2026); CPT pushed back and said it had already moved on (Cyprus Mail, 15 Oct 2026). On 30 Oct 2026 the Minister conceded gaps in timetables at stops, payment and intercity booking (Sigmalive; info.cy). CPT's chief has argued that bus priority on the Nicosia motorway shows buses can beat cars at peak (CBN, 27 Oct 2026).
- **Funding open now (all times CET):**
  - EIT Urban Mobility Financial Support to Startups: up to €2.5m per startup, taking equity (target 5 to 10%), only for startups in an active pre-seed, seed or Series A round with private investors; cut-off 4 on 16 Nov 2026 17:00, then 11 Jan 2027 and 12 Apr 2027 (eiturbanmobility.eu call page; grant-grants.com summary, 21 Oct 2026).
  - EIT Urban Mobility SME Market Expansion 2027: up to €60,000 for an SME with at least 3 full-time staff and a solution at TRL 7 or above with previous customers; closes 1 Dec 2026 17:00 (eit.europa.eu; eiturbanmobility.eu, 9 Oct 2026).
  - EIT Urban Mobility Strategic Innovation Open Call: up to €2m per project, up to 65% of eligible costs, consortium of at least two independent organisations from two different EU or associated countries; 4th cut-off 28 Jan 2027 17:00, 5th 3 Jun 2027; about €60m over 2026 to 2028 (call manual v5, 21 Sep 2026; TrustList, 26 Oct 2026; RIC Gabrovo summary).
  - Earlier research pass: the RIF Pre-Seed call closed on 11 Sep 2026; CIVITAS is another route; an Urban Futures Symposium is on 26 to 27 Nov 2026.

### 30.3 Aloya today, and its gaps

- Aloya consumes NAP data well (GTFS-RT relay in workers/gtfs-relay, DATEX for traffic, Bolt zones and EV chargers) and republishes a GBFS merge (layer 22). It has no formal relationship with the Public Works Department, the Ministry or any municipality.
- It does not meet the eligibility of the two startup-focused EIT calls today as far as this pass could establish: the startup call needs a live equity round with private investors, and the SME call needs 3 full-time staff and paying customers at TRL 7.

### 30.4 Improvements

1. **Offer the NAP a free data quality service (S, high).** Aloya already computes reliability, ghost buses and stop position errors (Part A). Send the Public Works Department a monthly data quality note (feed outages, stale vehicles, stops off by more than 50 m) with no strings attached. This builds the relationship every other item here depends on.
2. **Use the 1 Dec 2026 MMTIS deadline (S, high).** Write to Limassol and Nicosia municipalities and to Bolt, Electra, RideNow and EasyPark: parking availability and tariffs and vehicle-sharing availability are due on the NAP from 1 Dec 2026; Aloya can help convert and validate (GBFS for vehicles, DATEX for parking) and will display the data. Be careful to describe the obligation accurately: the Regulation covers existing digital machine-readable data via the NAP (NAPCORE FAQ), it does not force anyone to create new data.
3. **Target the Strategic Innovation call, 28 Jan 2027, with a city (L, very high).** This is the best fit: it funds deployment with cities, up to €2m, and requires a consortium from two countries. Build a consortium of a Cyprus municipality (Nicosia or Limassol), Aloya, a Cyprus university and an operator or tech partner from another EU country, around one measurable goal from this book (for example, location-aware alerts plus mid-trip micromobility on two corridors, with ridership and car-trip reduction measured). Aloya must budget its 35% co-funding share.
4. **Skip the 16 Nov 2026 startup cut-off unless a round is live (S, medium).** It needs an active priced round with private investors. If one is opened for Aloya, the 11 Jan 2027 cut-off is the next chance.
5. **Find the city partner in November (S, high).** Use the Urban Futures Symposium on 26 to 27 Nov (earlier research pass; date not re-checked) and direct emails to municipal mobility officers. Given Samuel's stated preference for written routes, lead with a two-page written proposal and the data quality note from item 1.
6. **Fix the trust issues first (S, very high).** No ministry, municipality or EU evaluator will partner with a product that logs in to JCC with users' passwords or reads a private operator's booking API without permission. Layers 23, 24 and 25 items come first.

## Part C summary: the top ten, in order

| # | Action | Layer | Effort | Impact |
|---|---|---|---|---|
| 1 | Turn off the JCC password proxy (public wallet endpoint first), keep a manual balance mode, label anything left as unofficial, then ask the Ministry and JCC for read-only partner access during ABT | 24 | S then M | Very high |
| 2 | Resolve the licence: code proprietary, open data outputs under CC BY 4.0, API under written terms; correct the MIT note in memory | 25 | S | Very high |
| 3 | API keys, per-key and per-IP quotas, restricted CORS on plan, places-autocomplete, walk-directions, tts, stt, parse-trip-intent, wallet/ocr, kapnos and wallet; budget caps on Mapbox, ElevenLabs, OpenAI and Gemini | 25 | M | Very high |
| 4 | Join the Bolt Business referral scheme; relabel the Bolt button until Bolt issues a partner id | 23 | S | Medium |
| 5 | Write to Kapnos for permission, a referral deal or GTFS; meanwhile cache, stop the public proxy and stop showing seat counts | 23 | S | High |
| 6 | Fix the GBFS merge (start_date, purchase_url, license_url, operator line), switch Nextbike to GBFS, list in the Mobility Database | 22, 26 | S | High |
| 7 | Ask Electra and Bolt for GBFS citing MMTIS 1 Dec 2026; add RideNow and toGO deep links | 22, 27 | S to M | High |
| 8 | UCY shuttles as supplementary GTFS; hotel and campus departures widget; "just landed" airport pages | 28, 29 | M | High |
| 9 | Publish and document the MCP server and deep links | 25 | S | Medium |
| 10 | Compete on trust (ETA confidence, honest fallbacks); prepare the EIT Strategic Innovation bid for 28 Jan 2027 with a Cyprus city | 26, 30 | L | Very high |

## What this part could not establish

- Whether the MCP server at /mcp is live in production.
- Apple Maps transit coverage in Cyprus.
- Whether Moovit Pay works in Cyprus or is template text on Moovit's pages.
- The licence of Nextbike's nextbike-live.json endpoint (as opposed to its GBFS feed).
- Whether the e-scooter impoundment decree is in force (latest source found describes it as a draft in consultation until 26 Sep 2026).
- Whether the JCC integration breaches JCC's terms or any law. This needs a lawyer; the recommendation to switch it off does not depend on the answer.
- Facts marked "earlier research pass" were carried over from part-c-raw.md without their URLs and were not re-opened.


# Part D: Data and AI (Layers 31 to 40)

Written 31 Oct 2026 for the Aloya 50-layer research book. Code references are to repo programmeradu/aloyacy-8f3d9cd7, branch redesign-roam, read at commit 56dab8f (31 Oct 2026). Live data checks (the national GTFS-RT feed and the CyNAP open endpoints) were run from the sandbox on 31 Oct 2026. Built from the first-run seed (part-d-seed.md), then re-checked against the code and deepened; where the code check changed a seed claim, the section says so.

Layers: 31 Open datasets, 32 Crowding, 33 AI assistant, 34 Feed anomaly and quality, 35 B2B/B2G analytics, 36 Heat and weather routing, 37 Cost, time and carbon comparison, 38 Safety, 39 Offline, 40 Multilingual.

Shared facts used in several layers:
- Live GTFS-RT read, 31 Oct 2026 17:45 UTC (19:45 Nicosia), from the direct feed Aloya uses (gtfs-rt.server.ts line 32): header 7 s old, GTFS-RT 2.0, 166 vehicles, all with trip_id, speed and bearing; vehicle timestamps a median 45 s old; 268 trip updates carrying 4,670 stop-time updates, all with a delay value; 0 service alerts; 0 occupancy values. 136 of the 166 vehicles' trips had a trip update; 132 trip updates had no vehicle (these may include trips that had not started).
- Audit Office special report on Nicosia buses (published 14 Oct 2026; fieldwork Nov to Dec 2025, 110 staff riding as ordinary passengers): 63% would not choose the bus again; 55% of stops had no route information; 32% had no shelter and another 22% had neither shelter nor seating; app and website stop positions were 85 to 135 m off in some cases; some lines run hourly or two-hourly; six of nine test journeys needed two buses; no card payment on board; car owners do not automatically save money by switching (Cyprus Mail, 14 Oct 2026).

## Layer 31: Open datasets

### 31.1 What the best in the world do
- Transport for London treats its data as a public product: over 17,000 developers have registered, its Unified API powers over 600 travel apps in the UK, and over 42% of Londoners use apps powered by its data. Deloitte estimated the benefit at up to £130m a year (TfL, Open data policy). The Unified API exposes AirQuality, BikePoint, Journey, Line, Occupancy, Road, StopPoint and Vehicle in one place (TfL Unified API portal), and its general tier allows 500 requests a minute per key (TfL API FAQ).
- France's national access point, transport.data.gouv.fr, validates every dataset and publishes three daily indicators per resource: availability (checked hourly), conformity (no blocking error in the validation report) and freshness. It runs the MobilityData GTFS validator and shows error counts on each feed page; the SNCF GTFS-RT trip-updates feed, for example, showed 100% availability and 567 validation errors when read (doc.transport.data.gouv.fr, Indicateurs de qualité; SNCF dataset page; Nouveautés).
- Norway's Entur combines the national access point, a national journey planner (OpenTripPlanner) and open APIs, so any developer can build on the same data the national app uses (Entur, Transport Ticketing Global 2025 presentation).
- EU law is pushing the same way. Delegated Regulation (EU) 2024/490 amends the MMTIS rules so dynamic data must flow through national access points: estimated departure and arrival times and disruptions on the TEN-T network by December 2025; shared-vehicle availability and parking by December 2026; all data EU-wide by December 2028 (EUR-Lex 2024/490; doc.transport.data.gouv.fr, Dates limites de publication).

### 31.2 The reality in Cyprus and the data available
- The Cyprus National Access Point (CyNAP, traffic4cyprus.org.cy) is run by the Public Works Department and built by KIOS (University of Cyprus). It lists 42 datasets, all under CC-BY-4.0, from 7 providers: Public Works Department (35), Waze (2), Bolt, the Electrical and Mechanical Services department (EV chargers), the Department of Lands and Surveys (road network), Elovate and Nextbike (traffic4cyprus.org.cy/dataset, pages 1 to 3).
- Public transport: static GTFS for EMEL (Limassol), OSYPA (Paphos), OSEA (Famagusta), NPT (Nicosia), LPT (Larnaca), Intercity and Pame Express, refreshed "up to every 3 months"; GTFS-RT and SIRI real-time feeds refreshed "up to 1 min" (CyNAP dataset pages). data.gov.cy mirrors the GTFS, a stops CSV and route shapefiles (data.gov.cy dataset 1069).
- Infrastructure layers on CyNAP: bus lanes, bus stops, bus stations, bus routes, cycleways, bicycle racks, bike-share stations, pedestrian crossings, traffic signals, parking areas, park and ride, Low Speed Emission Zones and their entrances, speed limits, road gradients per 100 m, tunnels, bridges, CCTV, traffic detectors, Bluetooth sensors, Waze traffic and Waze alerts (CyNAP dataset list).
- I tested the open endpoint pattern Aloya already uses (`https://fixcyprus.cy/gnosis/open/api/nap/datasets/<name>/`) on 31 Oct 2026. Without any login these returned DATEX II v3 XML: bus_lanes (26 lane segments), cycleways (48 segments), pedestrian_crossings (384 points), bicycle_racks (28 sites), parking_areas (651 facilities), waze_alerts (241 live items) and bus_stations (16). park_and_ride, nextbike, lez and trafficevents returned 404 under those names, so their slugs differ. 384 pedestrian crossings for the whole island means that dataset only covers part of the network (Public Works Department roads).
- The traffic platform behind CyNAP had 120 road sensors in Nicosia, on interurban roads and at port and airport accesses, with expansion to about 500 planned using EU cohesion and recovery funds (Interoperable Europe, Cyprus 2025 supporting document). The 2025 ITS progress report says the OMNIA-MISTIC platform publishes 17 APIs to the NAP (EC, Cyprus ITS progress report 2025).
- Other public sources: the Department of Labour Inspection runs 9 air-quality stations with an hourly JSON API for current readings and a historical range API (data.gov.cy; airquality.dli.mlsi.gov.cy); data.gov.cy holds about 1,957 datasets, including annual traffic counts per road section with a bus column, and road-accident statistics (data.gov.cy home page and traffic census datasets). Mapillary's API exposes detected point features including street lights, benches, bike racks, crosswalks and pedestrian traffic lights (Mapillary API, Points).

### 31.3 Aloya today
- Already used: Motion GTFS from motionbuscard.org.cy (scripts/ingest-schedule.ts); the GTFS-RT relay worker; CyNAP Bolt stations and EV chargers through the open gnosis API (bolt-scooter.functions.ts, ev-chargers.functions.ts); CyNAP DATEX traffic incidents through an env-configured URL (hooks/pulse-traffic.ts, whose comment assumes the feed is registration-gated); Nextbike; JCC; Kapnos; OpenSky; Cruisemapper; Open-Meteo (forecast, air quality, marine); the Met Department warnings page via Firecrawl; and the Mapillary Graph API for street view (streetview.ts).
- Not used: bus lanes, cycleways, pedestrian crossings, bicycle racks, parking areas, park and ride, bus stations, LEZ, traffic signals, gradients, Waze alerts, the official DLI air-quality API, the traffic census, and Mapillary detected features.
- Licence gap: the live basemap is Esri World Imagery, and src/lib/basemap.ts itself says this is "NOT licensed for production use without an Esri/ArcGIS agreement". That is a legal risk on a public product.
- Attribution gap: CyNAP data is CC-BY-4.0, which requires attribution. There is per-map attribution (MapAttribution) but no single data-sources page.
- Openness gap: Aloya consumes open data but publishes little back. It has an MCP server with four tools (src/lib/mcp: search_stops, get_stop_arrivals, watch_stop_arrivals, plan_trip) and several /api/public routes, but no documented public API, no feed of its own corrected arrivals, and no data licence.

### 31.4 Improvements
1. **CyNAP layer ingest.** A nightly cron fetches bus_lanes, cycleways, pedestrian_crossings, bicycle_racks, parking_areas and bus_stations, parses DATEX II v3 with the fast-xml-parser already used in pulse-traffic.ts, and stores GeoJSON in D1 or R2. Uses: cycle legs prefer cycleways, walking legs cross at real crossings, park and ride picks known car parks, and racks are shown at the end of a bike leg. Effort M. Impact high, because it feeds mixed-mode trips and the "better stop nearby" logic.
2. **Waze alerts in the replanner.** The open waze_alerts feed (241 live items at test time) gives accidents, closures and jams with coordinates. Match alerts within about 50 m of a bus shape ahead of a live trip and raise "accident on your route" before the bus is late. Effort M. Impact high. Re-test the "registration-gated" assumption in pulse-traffic.ts at the same time, because the gnosis open endpoints worked without registration.
3. **Swap the basemap to a licensed source** (Mapbox Satellite on the existing token, or MapTiler, both already options in basemap.ts). Effort S. Impact: removes a legal risk.
4. **Official air quality.** Read the DLI hourly API (9 stations) next to Open-Meteo air quality. Use the station for "measured now" and Open-Meteo for "forecast", and label which is which. Effort S. Impact medium (dust days, see Layer 36).
5. **Mapillary features for stops.** For each stop, query `object--bench`, `object--street-light` and `object--trash-can` within 25 m, store counts, and use them to seed the existing stop-condition attributes (seating, lighting) as "detected, not confirmed" until a rider confirms. Effort M. Impact medium for night safety (Layer 38) and heat (Layer 36).
6. **Traffic census for honest car comparisons.** Use the data.gov.cy annual traffic counts by road section to show where buses share roads with the heaviest car traffic. This feeds the bus-lane case in the B2G pack (Layer 35). Effort S. Impact medium.
7. **A /data page.** List every source, its licence (CC-BY-4.0 for CyNAP), its refresh rate and when Aloya last read it successfully. This meets the attribution duty and builds trust. Effort S. Impact medium.
8. **Aloya as a publisher.** Document the MCP server and the /api/public routes as a partner API with keys and rate limits. Later, publish Aloya's corrected arrivals as GTFS-RT so others can integrate Aloya, which matches the "open for others to integrate" vision. Effort L. Impact high, strategically.
9. **Get ahead of the MMTIS deadlines.** Shared-vehicle availability and parking are due through NAPs by December 2026 (2024/490). Offer the Public Works Department help with GBFS for Nextbike and Bolt and with parking occupancy, and build the readers now so Aloya is first to use them. Effort S to watch, M to integrate. Impact high.

## Layer 32: Crowding

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

## Layer 33: AI assistant

### 33.1 What the best in the world do
- Google Maps put Gemini into navigation in November 2025 (driving first, then all modes including public transport, walking and cycling), replacing Google Assistant; riders can ask "When will I arrive?", "What's my next stop?" or "What's the weather like at my destination?" (Google blog, 5 Nov 2025; 9to5Google, 26 Nov 2025). In March 2026 it launched Ask Maps, a conversational search; in August 2026 Ask Maps gained a live transit widget, a "virtual departure board" inside the chat that updates delays minute by minute, and rolled out in English to over 150 countries and territories (Google blog, 12 Mar 2026 and 6 Aug 2026). On 21 Oct 2026 Gemini reached Google Maps on CarPlay (The Verge, 21 Oct 2026). This is Aloya's real competitor for "ask in plain words".
- The research warning: on the TravelPlanner benchmark (ICML 2024), GPT-4-Turbo with tools reached a 0.6% final pass rate on multi-constraint travel plans, and the other models tested passed none (Xie et al., arXiv 2402.01622). Later work reached 97.9% on the same test set by having code, not the language model, enforce the constraints (OpenSymbolic, Feb 2026). The lesson for transit: let the model understand the request and phrase the answer; let a deterministic planner produce every time, stop and fare.
- Google's own design keeps this split: live transit in Ask Maps appears as a widget fed by the real-time feed, not as model-written text (Google blog, 6 Aug 2026).

### 33.2 The reality in Cyprus and the data available
- Riders mix English, Greek, Greeklish and place names with several spellings (Lefkosia / Nicosia, Lemesos / Limassol). A parser has to handle all of them, and GTFS stop names are often in capitals with accents (the redesign already strips the feed accent from card stop names, per the latest commit).
- Cyprus left summer time on 25 Oct 2026, so Nicosia is UTC+2 until the last Sunday of March. Any code that assumes +3 hours produces times an hour off for five months a year.
- Free and cheap model capacity exists. Groq's free plan allows openai/gpt-oss-20b at 30 requests a minute and 1,000 a day, 8K tokens a minute and 200K tokens a day (Groq rate limits page). Cloudflare Workers AI gives 10,000 Neurons a day free on every plan, then $0.011 per 1,000 Neurons; @cf/openai/gpt-oss-20b costs 18,182 Neurons per million input tokens and 27,273 per million output tokens (Cloudflare Workers AI pricing, updated 20 Oct 2026). My estimate: an intent parse of about 600 input and 150 output tokens costs about 15 Neurons, so the free Cloudflare allowance covers roughly 650 parses a day before any charge.

### 33.3 Aloya today
- `src/lib/ai-planner.functions.ts` turns free text into a JSON intent (from, to, leaveBy, arriveBy, day hint, confidence) and leaves the route to the RAPTOR planner. This is the right architecture. `packages/core/src/nl-intent.ts` runs a regex pass first and merges: the model wins on place names, the regex wins on time arithmetic. A deterministic override (`extractExplicitTime`) recomputes explicit clock times.
- Providers, tried in order: Gemini 2.5 Flash (Google's OpenAI-compatible endpoint), gpt-4o-mini (OpenAI), and Gemini 2.5 Flash through the Lovable gateway. Temperature 0.2, JSON mode, 10 s timeout. No Groq and no Workers AI, although the app already runs on Cloudflare.
- No quota guard: `/api/public/parse-trip-intent` has no rate limit and no cache (it sends `Cache-Control: no-store`), so a bot or a busy day can exhaust a free tier or run up a bill.
- Time zone, corrected from the seed: the seed said the prompt "hard-codes" +180 minutes. In fact +180 is only the fallback when the caller sends no offset; both callers (useNLPlanner.ts line 141 and RoamSearchSheet.tsx line 307) send the phone's own offset. Two real bugs remain: (a) a visitor whose phone is still on home time gets times in the wrong zone, because the offset should be Cyprus time, not the phone's; (b) for "tomorrow" or any date after a clock change, today's offset is applied to the target day.
- `nl-suggestions.functions.ts` makes personal suggestion chips from trip history and trending destinations without a model. The MCP server (src/lib/mcp) exposes plan_trip and live arrivals to outside assistants, a strong base for item 6.
- What the assistant cannot do today: answer questions during a trip ("will I make my change?", "is there a faster bus now?"), explain a delay, compare modes, or act (set an alert, share an ETA).

### 33.4 Improvements
1. **Fix the time zone.** Compute every time with `Asia/Nicosia` rules (packages/core/src/cy-time.ts already exists) for the target date, ignore the phone's offset, and remove the +180 fallback. Add tests that parse "tomorrow 7am" on 24 Oct and on 25 Oct 2026. Effort S. Impact high: wrong times are the worst failure an assistant can have.
2. **Cheaper, sturdier providers.** Put Groq gpt-oss-20b first (free tier above) and Cloudflare Workers AI gpt-oss-20b as the fallback (runs next to the app; about 650 free parses a day by my estimate), keeping Gemini as the last resort. Keep the single OpenAI-compatible client the code already uses. Effort S. Impact: lower cost and fewer outages.
3. **Quota guard.** Regex first, and skip the model when the regex result is complete; cache by normalised text plus hour for 10 minutes; a per-device limit (for example 30 parses an hour); a daily cap with graceful fallback to the regex result. Effort S. Impact high for cost safety.
4. **Tool-calling trip companion.** Move from "parse once" to an assistant that calls Aloya's own tools: get_arrivals, plan_trip, replan_from_here, walk_time_to_stop, weather_at, fare_for, share_eta, set_alert. Rule: every number the rider sees (minutes, euros, stop names) must come from a tool result, never from the model's text; the model only chooses tools and phrases the answer. This is the TravelPlanner lesson applied. Typical questions: "Will I make the 30 at Solomou?", "Is there something faster now?", "Can I scooter part of the way?". Effort L. Impact high, and it is the only way to beat Ask Maps on Cyprus detail.
5. **Greek and Greeklish evaluation set.** Collect 200 real anonymised queries (English, Greek, Greeklish, mixed place spellings) with expected intents, run them in CI on every prompt or model change, and track the pass rate. Effort M. Impact high for quality.
6. **Open the assistant to other assistants.** Document the existing MCP server so ChatGPT, Claude or Gemini users in Cyprus can ask about buses through Aloya, with "Powered by Aloya" attribution. Add watch_trip and replan tools. This fits the "open for others to integrate" vision. Effort M. Impact medium to high.
7. **Voice on the move.** speech.ts already uses the Web Speech API; add push-to-talk in the trip HUD with short spoken answers ("Your bus is 4 minutes away and you are 6 minutes from the stop: walk faster, or take the next one in 9 minutes"). Effort M. Impact medium (hands busy, bright sun, older riders).
8. **Explain, do not just answer.** When the assistant suggests a different stop or mode, it states the reason in one line from data (for example "line A every 10 min, line B every 40 min"); itinerary-rationale.ts already builds such reasons. Effort S. Impact medium: trust.

## Layer 34: Feed anomaly and quality

### 34.1 What the best in the world do
- MobilityData maintains the canonical GTFS Schedule validator (Apache 2.0; web, desktop, command line and Docker). It produces HTML and JSON reports and is acceptance-tested against the feeds in the Mobility Database, so rule changes do not suddenly break valid feeds. Projects built on it run it daily against 2,400+ public feeds and turn notices into plain-language grades, or expose results as Prometheus metrics (MobilityData gtfs-validator README).
- France's national access point publishes, per resource, an hourly availability check, a daily conformity check and a freshness indicator, with history, so anyone can see a feed's track record (doc.transport.data.gouv.fr, Indicateurs de qualité).
- Independent Cyprus developers already do this for themselves: BusCyprus runs a GTFS-RT proxy between the source and its OneBusAway server so that, when a rider says "the bus never came", it can tell within minutes whether the feed said so or the app did, and keeps scripts that diff GTFS-RT against the static bundle (NAYEE, The open transit stack behind BusCyprus, 11 Oct 2026).

### 34.2 The reality in Cyprus and the data available
- GPS problems are known and public. At the first Cyprus Transport Hackathon (17 Jan 2026, co-organised by the Ministry of Transport, KIOS and others), the winning team said bus GPS "teleports", sometimes into neighbouring countries, mostly because of regional GPS jamming and local effects near embassies and bases, and that the location service sometimes delivers nothing, so "you see zero buses on a map ... even the government one". They estimated the loss at "less than 1 per cent throughout the year and all routes" but said it "significantly ruins the experience". Their fix predicts positions from about 30 parameters (route, stop, speed, weather, traffic, Cyprus calendar) only when GPS disappears. They also said uptake of volunteer solutions by the Ministry has been slow (Cyprus Mail, 20 Jan 2026).
- Stop data is being fixed at the source. The Public Works Department put out a €420,000 tender to inventory about 9,000 stops (about 5,300 on regular routes and 3,700 school stops that are not yet in the system), recording coordinates to within 30 cm, shelter type, name and number, display status, crossing, traffic light and bike parking, with monthly GIS updates over an eight-year contract (Cyprus FAQ, 23 Oct 2026, citing the tender documents). The Audit Office had found app stop positions 85 to 135 m off (Cyprus Mail, 14 Oct 2026).
- My live checks on 31 Oct 2026:
  - Real-time (19:45 Nicosia): 166 vehicles, positions a median 45 s old, 268 trip updates, 0 service alerts, 0 occupancy (see the shared facts at the top of this part). The feed carries no service alerts at all, so detours and cancellations reach riders only through operator web pages.
  - Static GTFS from motionbuscard.org.cy, all seven feeds regenerated at 05:31 on 31 Oct (feed_version stamps such as NPT20261031053139). Every feed uses calendar_dates.txt only. Six feeds list service dates up to 24 to 29 Jan 2027, but **EMEL (Limassol) lists only seven days, 31 Oct to 6 Nov 2026**, although its feed_info.txt claims a feed_end_date of 28 Jan 2027. So any Limassol trip planned for 7 Nov or later finds no buses, and the metadata hides it.
  - wheelchair_boarding is blank for every stop in every feed (889 OSYPA, 446 OSEA, 123 Intercity, 1,401 EMEL, 1,778 NPT, 1,040 LPT, 23 Pame Express).
  - translations.txt carries Greek only (NPT: 21,224 Greek rows); no other language.
  - Fares in the feeds: NPT and LPT have €2.70 and €0.70 fares; OSYPA and EMEL list €2 (EMEL also a €0 fare); Intercity has 6,227 fare rows. These matter for Layer 37.

### 34.3 Aloya today
- Already strong, and better than any other Cyprus app I found: agency-aware ghost-trip tagging (ghost-trips.ts, urban 180 s, Intercity 300 s, rider sightings override stale pings); feed-delta.server.ts pairs feed pings with rider GPS to measure feed error in metres and seconds; eta-backtest.server.ts scores logged predictions nightly into eta_accuracy and keeps inferred arrivals separate; device reputation weights rider fixes; ping-gap stats; skip-rate reports.
- scripts/validate-gtfs-snapshot.mjs checks real-time snapshots (Cyprus bounding box, integer delays, sane timestamps) but no workflow runs it, and nothing runs the MobilityData static validator.
- Schedule ingest runs nightly at 03:00 UTC (cron-schedule.ts NIGHTLY_JOBS, ingest-schedule). Motion's files were stamped 05:31, which I read as Cyprus time (03:31 UTC). If that reading is right, Aloya always ingests the previous day's files, and with EMEL's seven-day window Limassol has only six days of trips in Aloya. The checked-in shards in public/data/schedule/by-date run only to 20261027; the live ingest may write elsewhere, so check what production serves.
- Nothing checks the service-date horizon per feed, so the EMEL seven-day window would go unnoticed.
- The bounding box in validate-gtfs-snapshot.mjs (lat 34.5 to 35.7, lng 32.2 to 34.6) would catch buses "in neighbouring countries" but not a bus that jumps 3 km inside Cyprus; geo-fusion and rider-physics handle some of that at display time.

### 34.4 Improvements
1. **Nightly feed health job.** After ingest: run the MobilityData validator (Docker image ghcr.io/mobilitydata/gtfs-validator) on all seven feeds; record errors and warnings per feed; compute the service-date horizon per feed (last date with trips) and alert when it is under 14 days; compare feed_end_date with the real last service date. Store results in D1 and show them on an internal page. Effort M. Impact high: the EMEL seven-day window is exactly what this catches.
2. **Move ingest after Motion publishes.** Run it at 04:15 UTC (after the 05:31 Cyprus-time stamp), and retry at 06:00 UTC if the feed_version did not change. Effort S. Impact medium.
3. **Real-time health per operator, every minute.** Track feed age, vehicles reporting versus trips scheduled now, share of trips with a vehicle, positions outside Cyprus, jumps faster than a bus can drive (for example over 120 km/h between pings), and frozen vehicles (same position for 10 minutes while the trip is "moving"). When an operator degrades, switch the UI for that operator to "scheduled times" with a clear banner, instead of showing bad live data. Effort M. Impact high for trust.
4. **Use the bus stop inventory.** When the Public Works Department publishes the 30 cm stop survey (monthly GIS updates), ingest it and replace feed coordinates where the gap exceeds 20 m; until then, use rider-confirmed stop positions (stop-condition reports) to flag stops whose feed position looks wrong. Effort M. Impact high for walking times and "better stop nearby" routing.
5. **Gap filling, honestly labelled.** When a vehicle stops reporting mid-trip, predict its position from the last ping, the shape, historical speed for that segment and hour (Aloya already logs pings to the R2 data lake), and show it as "estimated" with a dotted icon. This is the hackathon idea, run inside Aloya. Effort M. Impact medium.
6. **Bias correction only where it is proven.** eta-backtest.server.ts already measures whether Aloya's ETA beats the operator's. Add per route and hour corrections only where the nightly backtest shows a gain over 30 days, and remove them automatically when they stop helping. Effort M. Impact medium to high.
7. **Report problems back.** Send the Ministry and Motion a short weekly email or report: validator errors, horizon warnings, offline periods, worst stops by position error. This builds the relationship that the hackathon team said is missing, and leads into the B2G product (Layer 35). Effort S. Impact high strategically.
8. **Accessibility data gap.** Since wheelchair_boarding is empty everywhere, collect step-free status through the existing stop-condition flow and publish it back as open data. Effort S on top of existing code. Impact medium.

## Layer 35: B2B and B2G analytics

### 35.1 What the best in the world do
- Swiftly sells agencies a data platform (real-time predictions, GPS playback, on-time performance, run times, rider alerts) priced per vehicle. Public order forms show the scale: the City of Beaumont's 2022 quote for 20 vehicles had a list subtotal of $61,600 a year, $49,280 after a 20% discount, plus one-off implementation per vehicle; Banning Pass Transit paid $1,200 per vehicle per year for real-time passenger information in 2020; MARTA's one-year base term was $495,445.63 (Beaumont order form; Banning order form; MARTA agenda report).
- What agencies get for it: County Connection (California) reports that Swiftly gave it 40% more stop-level data and recovered 10.5% of missing stop data, and that a service change built on it raised on-time performance 5.6% on seven routes and 2.8% systemwide (County Connection staff report, June 2025).
- The EU is creating the demand. The revised TEN-T Regulation (EU) 2024/1679 requires a SUMP for each urban node by 31 December 2027 and requires Member States to collect urban mobility indicators per urban node; the Commission adopted the Implementing Regulation with the common indicator set on 9 July 2026 (EC DG MOVE news, 9 Jul 2026; EGUM opinion). The indicator fiches cover greenhouse gas emissions, congestion, accidents, modal share, access to mobility services, air pollution and noise (EU Urban Mobility Observatory, 23 Jul 2024).

### 35.2 The reality in Cyprus and the data available
- The buyer exists and has a budget line for exactly this. The Research and Innovation Foundation's "AI in Government" programme ran Challenge 4 for the Ministry of Transport, "Smart Optimisation of Public Transport", with €0.65 million; 27 proposals were submitted by 13 March 2026 and results were announced in May 2026. RIF lists "AI in Government: New Challenges" as a forthcoming call expected in Q4 2026 (RIF announcements, 16 Mar and 18 May 2026; RIF home page, read 31 Oct 2026).
- Traffic signals: the 125-junction Regional Urban Traffic Control system (75 Nicosia, 50 Limassol) to replace SCOOT, budgeted at €7.1 million plus VAT and co-funded by the THALIA 2021-2027 programme, is held up in the Administrative Court; it will give priority to public transport, and the Public Works Department expects a 28% cut in public transport travel time (philenews, 25 Jul 2026). Separately, a small tender adds vehicle-actuated detectors at 15 junctions.
- **Correction to the seed and to some press:** the 15-junction tender is worth about €41,900 excluding VAT, not €41.9 million. Politis quotes the engineer: "Our tender is for 15 traffic-light installations and is worth about €42,000", and the tender listing shows EUR 41,900 (Politis, 19 Aug 2026; TendersOnTime notice PS/14/2026/G(O)). Cyprus Mail's "€41.9 million" headline is wrong. The tender's before-and-after measurement requirement is still useful: Aloya could supply bus travel times through those junctions.
- Operators: Cyprus Public Transport carried 12.3 million passengers in 2025, more than one million a month since May 2024, and 82.6% of passengers use the Motion card (Cyprus Mail, 16 Sep 2026). The Audit Office said several faults "could have been identified earlier through regular audits and the implementation of the relevant provisions of the contract" (Cyprus Mail, 14 Oct 2026), so the Ministry needs independent monitoring.
- Hackathon lesson: the winning team said the Ministry has been slow to take up volunteer solutions "when they fall outside established procedures" (Cyprus Mail, 20 Jan 2026). The route in is a funded call or a tender, not a free offer.

### 35.3 Aloya today
- A B2B core already exists: `src/lib/truth-api.server.ts` ("Aloya Truth API (v1) ... The B2B clearing house layer") serves the same arrival classifier riders see and logs every API prediction to `eta_predictions` with `surface: 'api'` so it is scored nightly; `/api/public/partners/apply` is a partner waitlist and says plainly that a console, keys and usage "wait for a paying Truth API customer".
- Measurement assets: nightly ETA backtest (eta_accuracy), reliability scoring per route (reliability.functions.ts: on time means within ±120 s, and "rated" needs 30 or more weighted samples), skip-rate and ping-gap stats, feed-versus-rider deltas, and a raw data archive to R2 (lake.server.ts, archive-lake nightly job).
- COMMERCIAL.md describes licensing the code (single deployment, source-available, full asset transfer). There is no operator dashboard, no report export and no SUMP indicator mapping.

### 35.4 Improvements
1. **Quarterly operator report card (PDF and web).** Per operator and route: on-time share (±120 s, as already coded), headway regularity on frequent lines, ghost trips, skipped stops, feed uptime and age, ETA accuracy of the operator feed versus Aloya's, stops with position errors, and service-date horizon problems (Layer 34). Publish a short public version; sell the detailed one. Effort M (the data exists). Impact high: it is the evidence the Audit Office said was missing.
2. **Bid in "AI in Government: New Challenges" (Q4 2026).** Prepare now: a two-page capability note, the report card as a sample, and a pilot offer (for example one district, six months, fixed price). Effort S to prepare. Impact high: a funded first customer.
3. **SUMP indicator pack.** Map Aloya outputs onto the EU indicator fields: access to mobility services (share of residents within a walk of a stop with a given frequency, from GTFS plus population grids), public transport travel time against car time on key corridors (Layer 37), and safety hot spots from rider reports (Layer 38). Sell it to municipalities and to the Ministry's SUMP work. Effort M. Impact medium to high, rising toward the 2027 deadline.
4. **Bus delay at signals.** Using rider GPS and feed positions, measure bus delay at each signalised junction on bus routes. Offer it to the Public Works Department as before-and-after evidence for the 15-detector project and as the baseline for bus priority in the 125-junction system. Effort M. Impact high strategically.
5. **Turn the Truth API into a product.** Keys, rate limits, usage logging, a status page and a price list (per call or flat). First customers could be hotels, airport shuttles, employers' commuter benefits, and other apps that want better ETAs than the raw feed. Effort M. Impact medium.
6. **Employer and campus commute dashboards.** For a company or university: where staff live versus bus coverage, door-to-door times by bus, bike and car, and the cost and carbon of each (Layer 37). This doubles as a tool to move people off cars. Effort M. Impact medium.
7. **Price against Swiftly honestly.** Do not compete on features Aloya lacks (operator tools, passenger counters). Position as "independent measurement plus rider app" for a small market, priced per district per year. Effort S. Impact: clarity in sales.

## Layer 36: Heat and weather routing

### 36.1 What the best in the world do
- Arizona State University's Cool Routes (published June 2026) updates hourly with weather forecasts and uses building and tree data to compute mean radiant temperature along each street; in Phoenix this can exceed 150°F in full sun and fall below 100°F in shade. In tests it found a cooler alternative for 70% of trips and cut the heat load by about 4.5 degrees on average without adding much distance; it is open source and designed to support walking, cycling and transit (ASU News, 10 Jun 2026; Planetizen, 16 Jun 2026).
- Barcelona Metropolitan Area launched a web tool in July 2026 that scores routes out of 100 for "coolness" and walkability using temperature, shade, pavement heat, slope and pavement width, and shows climate shelters (Diari de Catalunya, 14 Jul 2026). Its predecessor, Cool Walks, offered a direct, a shady and a "vampire mode" route that avoids the sun, plus drinking fountains (The Guardian, 23 Jun 2021).
- Google Maps code strings found in November 2025 ("Shade", "Sun", "%s in sun") point to sun and shade labels on walking routes (Android Authority, 6 Nov 2025). A Dubai study found the shadiest path to metro stations was on average only 1.3% longer than the shortest, with 8.8% less sun exposure (Computers, Environment and Urban Systems, Dec 2025).

### 36.2 The reality in Cyprus and the data available
- Heat is a mobility barrier for months a year. In July 2026 Nicosia exceeded 43°C on 11 days, with 43.2°C at Athalassa on 23 July and a monthly mean of 38.6°C there (Cyprus Mail, 6 Aug 2026). On 13 Aug 2025 a red warning for 45°C inland came with a ban on outdoor work from 11:00 to 17:00 (Cyprus Mail, 13 Aug 2025). Cyprus Institute research links high day and night temperatures to more deaths and hospital admissions (Cyprus Mail, 22 Jun 2026).
- Stops make it worse: 32% of Nicosia stops examined had no shelter and 22% more had neither shelter nor seating (Audit Office, Cyprus Mail, 14 Oct 2026), and some lines run hourly, so a missed bus can mean an hour in the sun.
- Data available and checked on 31 Oct 2026:
  - The Department of Meteorology publishes raw 10-minute readings from 55 automatic weather stations (temperature, humidity, wind, radiation at some sites) and a text file of Net Effective Temperature for 7 stations, both refreshed in near real time (dom.org.cy/AWS/ALL_STATIONS_average.html; dom.org.cy/AWS/AWS_NET.txt; read at 19:40 local time).
  - MeteoAlarm publishes Cyprus warnings as a CAP Atom feed under CC BY 4.0 equivalent terms (feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-cyprus; empty when read, as no warnings were active).
  - Open-Meteo's free API is for non-commercial use only, limited to 10,000 calls a day and 300,000 a month, with no uptime guarantee; commercial use needs a paid plan or self-hosting the open-source server (Open-Meteo pricing page).
  - Shade inputs: CyNAP and Mapillary give stops, crossings and detected street furniture (Layer 31); the rider-reported stop conditions in Aloya include has_shelter.

### 36.3 Aloya today
- Corrected and extended from the seed: Aloya has more weather data than the seed said. `open-meteo.server.ts` fetches current conditions only (temperature, apparent temperature, weather code, wind, day or night). But Pulse also ingests Open-Meteo air quality per zone (hooks/pulse-air.ts, PM2.5, PM10, ozone, NO2, European AQI), scrapes the Met Department warnings page through Firecrawl into pulse_signals (hooks/pulse-met-warnings.ts), serves a dust advisory with covered-wait advice (/api/public/dust-advisory, DustAdvisoryBanner.tsx on the trips page), and adds a heat clause to the crowd hint at 33°C or more (CrowdHint.tsx).
- The router ignores all of it: raptor, plan-score and multileg-rank read no weather, no shade and no shelter. has_shelter is collected but used only for stop SEO text (stop-seo.ts).
- Licence and cost risk: Aloya is a commercial product calling Open-Meteo's free endpoint, which its terms reserve for non-commercial use. Firecrawl scraping of the warnings page costs money and breaks when the page changes, while MeteoAlarm offers the same warnings as a structured feed.

### 36.4 Improvements
1. **Heat-aware walk and wait cost in the planner.** When the feels-like temperature at the stop is 35°C or more (hourly forecast for the trip time), multiply walking minutes in the sun by a penalty (for example 1.3) and waiting minutes at a stop without a confirmed shelter by a larger one (for example 1.5). The planner will then prefer a sheltered stop a little further away, a more frequent line, or a short scooter leg. Tune the factors with riders. Effort M. Impact high: this is Samuel's "better stop a few blocks away" logic, applied to heat.
2. **Hourly forecast, not just "now".** Add hourly apparent_temperature, uv_index and precipitation_probability for the trip window, and the wait-time forecast at the transfer stop. Effort S. Impact high.
3. **Official sources first.** Use the Met Department's 10-minute station data for "measured now" (55 stations) and its Net Effective Temperature file for heat stress; use MeteoAlarm CAP for warnings and retire the Firecrawl scrape. Effort S. Impact: accuracy, lower cost, fewer breakages.
4. **Fix the weather licence.** Either buy an Open-Meteo commercial plan, self-host Open-Meteo (open source), or switch forecast calls to a source whose terms allow commercial use; cache per 1 km grid per hour so call volume stays small. Effort S. Impact: removes a legal risk.
5. **Red-warning mode.** When an orange or red heat warning is active: banner on Home and in trips, routing that avoids long sunny walks between 11:00 and 17:00, "leave later" suggestions when the bus is frequent, and a check that the rider will not wait more than about 5 minutes in the sun. Effort M. Impact high for older riders and workers.
6. **Shelter map from three sources.** Combine rider has_shelter reports, Mapillary bench and street-light detections and, once published, the Public Works Department stop inventory (which records shelter type). Show "shade at stop: yes / no / unknown" on stop cards. Effort M. Impact medium to high.
7. **Dust and rain.** Use PM10 above the stop to advise covered waits (already partly built) and treat heavy rain the same way as heat in the wait penalty, since unsheltered stops are exposed to both. Effort S. Impact medium.
8. **Shade-aware walking legs (later).** Port the Cool Routes approach (open-source) using building footprints and sun position for the trip hour; start with Nicosia's centre and university areas. Effort L. Impact medium.

## Layer 37: Cost, time and carbon comparison

### 37.1 What the best in the world do
- Citymapper and Google Maps show the fare beside each option and compare modes side by side (bus, walk, cycle, taxi or ride-hail), so the rider sees at a glance what each choice costs in money and time. Google Maps shows estimated CO2 for routes in many markets. (General practice; see Part A for app-specific sources.)
- Emissions factors are standard and free. The UK government's 2025 conversion factors (DESNZ) give 0.10385 kg CO2e per passenger km for an average local bus and about 0.166 kg CO2e per km for an average car (whole vehicle), and the 2026 set was published on 11 June 2026 (GOV.UK conversion factors collection; factor values as listed by Greentryst and SCIF from the 2025 set). These are UK figures: a Cypriot bus with few passengers emits more per passenger, a full one far less.

### 37.2 The reality in Cyprus and the data available
Official fares, checked on 31 Oct 2026:
- **Nicosia and Larnaca (Cyprus Public Transport), from 3 Aug 2026:** single €2.70 cash, €2.00 on a Motion card (anonymous or personalised), €1.00 with the 50% discount; night (21:00 to 04:00) €4.70 cash, €3.50 Motion, €1.75 discount. Rural or feeder €0.70 cash, €0.60 card. With the e-wallet, two transfers within **60 minutes** of the first tap cost at most €2.00 in total. All-cities daily ticket €20 (CPT ticket fares page).
- **Limassol (EMEL), from 5 Nov 2026:** single €2.50 cash to the driver, €2.00 from the e-wallet; night €4.00 (was €3.00); day pass €7.00; 7-day €35.00; 30-day €50 personalised or €60 anonymous. Reduced fares (50%) are now sold only on a Motion card, not on board (EMEL announcement, 27 Aug 2026; Politis, 16 Sep 2026).
- **Paphos (OSYPA):** single €2.00, night (after 21:00) €3.00, daily €6.50, weekly personalised €25, monthly personalised €50 (Pafos Buses tickets page).
- **Intercity:** the Intercity GTFS feed lists 6,227 fare rows priced €4, €5, €6, €7, €8 and €10 (my read of fare_attributes.txt, feed 5, 31 Oct 2026). The OSYPA page says intercity fares on Motion cards depend on the route, with a minimum of €3.
- **Taxis (official urban tariff):** day (06:01 to 20:30) €3.80 start and €0.95 per km; night (20:31 to 06:00) €4.80 start and €1.10 per km; waiting €17 or €19 an hour; €1.40 per piece of luggage; €2 public-holiday supplement; plus 20% for five passengers and 40% for six (Visit Cyprus, Transportation page). Kathimerini reported in September 2026 that some airport and waiting charges would rise (Kathimerini, 19 Sep 2026).
- Why this matters: the Audit Office survey found the most common reasons not to use buses are no suitable route (43%), infrequent service (30%) and buses off schedule (28%) (via Cyprus FAQ, 23 Oct 2026). Showing that the bus costs €2 against a €12 taxi is one of the few arguments a bus app can win.

### 37.3 Aloya today
- `packages/core/src/boarding-pay.ts` says "Published Motion fares, from 3 August 2026" and applies one urban table (€2.00 Motion or €2.70 cash by day, €3.50 or €4.70 at night) to all five urban agencies (NPT, LMS, LCA, PFO, FAM; feeds 2, 4, 6, 9, 10, 11). That is right only for Nicosia and Larnaca. Limassol riders are told cash is €2.70 (it is €2.00 now and €2.50 from 5 Nov) and night is €4.70 (it is €3.00 now and €4.00 from 5 Nov). Paphos riders are told cash is €2.70 (it is €2.00) and night €4.70 (it is €3.00). Famagusta (OSEA) is unverified.
- Intercity is shown as "€5.00 to €8.00 by distance, cash only". The feed has fares from €4 to €10, and other operators' pages say e-wallet payment is possible on intercity; this line needs the per-route fare from the feed.
- The aloya.cy Motion card page says transfers are free "for 90 minutes"; CPT's rule is at most €2.00 for two transfers within 60 minutes. This is a public copy error.
- `packages/core/src/taxi-quote.ts` uses the "2024 schedule": €3.42 start, €0.85 per km day, €1.05 per km night, €5 minimum. The official tariff is now €3.80 and €0.95 by day, €4.80 and €1.10 at night, so Aloya's taxi quotes are about 10 to 15% low, and the night start charge is not modelled.
- `airport-cost.ts` builds the airport cost lines from these constants, so it inherits both errors.
- There is a `done.co2` string in the Roam dictionary but no CO2 calculation and no component uses it.

### 37.4 Improvements
1. **Fix fares per operator now (before 5 Nov 2026).** Replace the single urban table with a per-operator table with effective dates: CPT (NPT, LCA), EMEL (LMS: current and from 5 Nov), OSYPA (PFO), OSEA (FAM, verify), Intercity (from the feed's fare_attributes and fare_rules per origin and destination). Add a unit test per operator and a "checked on" date. Effort S. Impact high: wrong prices on the main screen lose trust immediately.
2. **Update taxi constants to the official tariff** (€3.80 or €4.80 start, €0.95 or €1.10 per km, waiting, luggage, holiday supplement, 5 and 6 passenger uplifts) and show the source date. Effort S. Impact medium to high.
3. **Correct the 90-minute transfer copy** on aloya.cy to CPT's 60-minute rule, and state that it applies to the e-wallet. Effort S. Impact medium.
4. **Fare engine from GTFS, with official overrides.** Read fare_attributes and fare_rules from each feed nightly, compare them with the operator's published table, and alert on any difference (Layer 34 health job). Effort M. Impact high: the feeds already disagree with some operator pages.
5. **One comparison card per trip:** bus (fare by payment method and time of day), walk, Nextbike or scooter (where available), taxi (official meter estimate), and car (fuel plus parking estimate), each with door-to-door time and kg CO2e. Default to the cheapest and fastest; let the rider pin a preference. Effort M. Impact high.
6. **Carbon with honest wording.** Use DESNZ factors as a starting point (bus 0.104 kg per passenger km, car 0.166 kg per vehicle km), label them "estimate", and later replace the bus factor with a Cyprus figure from operator fuel data or occupancy (Layer 32). Show yearly savings for a regular commute ("about X kg a year"). Effort S. Impact medium.
7. **Fare capping and passes advice.** From the rider's own trip history, tell them when a day pass, 7-day or 30-day pass would have been cheaper, and when the e-wallet saves money (Limassol cash single rises to €2.50 while e-wallet stays €2.00). Effort M. Impact medium to high: real money for riders on tight budgets.

## Layer 38: Safety

### 38.1 What the best in the world do
- Toronto's TTC runs a **Request Stop** programme: anyone travelling alone by bus between 21:00 and 05:00 can ask to get off between regular stops, one stop ahead, where the operator can stop safely. Its SafeTTC app has a "Report a Problem" button (text, photos or video straight to Transit Control, monitored 24/7) and a "Call Police" button (TTC safety pages; SafeTTC page).
- British Transport Police take discreet reports by text to 61016, monitored 24/7; reports rose more than eightfold since 2016 to 255,088 a year (BTP 61016 page; GOV.UK, 15 Sep 2025). Minneapolis Metro Transit's "Text for Safety" gets 20 to 25 messages a day and connects riders to trained staff who can call Transit Police (Metro Transit 2026 safety report).
- The pattern: a quiet way to report while still on board, a fast route to emergency services, and live location shared with someone the rider trusts.

### 38.2 The reality in Cyprus and the data available
- Emergency numbers: 112 or 199 (same police control centre, English spoken), 1460 police citizens' line for non-urgent reports, 1440 SPAVO for domestic violence (24 hours), 1466 children at risk, 8000 7773 Samaritans (16:00 to midnight) (Expatify, 29 Oct 2026; New to Cyprus emergency numbers sheet, checked 26 Sep 2026; SPAVO site). There is also a SafeCY civil defence app (OSAC Cyprus report, Jun 2026).
- Violence on buses is a live issue: in April 2026 a Nicosia bus driver was bitten on the head and suffered a broken leg after a passenger attack, which unions called the tenth serious assault on bus drivers in two years; they asked for driver cabins, emergency alert buttons and cameras across the fleet (Cyprus Mail, 15 and 21 Apr 2026; Politis, 15 Apr 2026). In July 2026 an EMEL driver in Germasogeia was assaulted and passengers helped restrain the attacker (Knews, 16 Jul 2026). The union also linked disputes to old stop locations that drivers no longer serve, which is a data problem Aloya can help with (Layer 34).
- Night service exists (CPT night fares apply 21:00 to 04:00), and the Audit Office found many stops without lighting or shelter (Layer 36).

### 38.3 Aloya today
- Share-ETA exists only in the native mobile app: `mobile/components/ShareEtaButton.tsx` and `mobile/lib/useShareEta.ts` post a position every 20 seconds and stop only on a long-press. The API (`/api/public/eta-share`, create, ping and end, hashed write key) and the public viewer (`src/routes/eta.$token.tsx`) are in the web app, but the web Roam app has no button to start sharing.
- `shared_trips.expires_at` defaults to 4 hours after creation (migration 20260701161832). Nothing ends the share when the rider arrives, and there is no "arrived" message to the watcher.
- No emergency feature anywhere: no 112 button, no 1440 or 1460 link, no discreet report, no "request stop" style advice, no night-mode guidance.
- Good foundations: stop conditions include lighting and shelter reports, and rider GPS physics checks protect the data from fake reports.

### 38.4 Improvements
1. **Safety sheet, one tap from the trip screen.** Large buttons: Call 112, Police non-urgent 1460, SPAVO 1440 (described plainly, without labelling the rider), plus "share my live trip". Show the current stop or road and the bus line so the rider can read them out to the operator. Effort S. Impact high.
2. **Share live trip from the web app too,** with automatic end on arrival (within 100 m of the destination for 2 minutes, or when the last leg ends), an "arrived safely" message to the watcher, and expiry at planned arrival plus 60 minutes instead of a flat 4 hours. Effort M. Impact high.
3. **"Check on me" timer.** The rider sets an expected arrival; if they have not arrived or tapped "I'm fine" 10 minutes later, the watcher is told and given the last position. Effort M. Impact medium to high, for night riders and parents.
4. **Discreet incident report.** A quiet form (no sound, dark screen) with line, direction, stop and time pre-filled from the live trip, and the category (harassment, aggression, unsafe driving, unsafe stop). Store it, show the rider who it went to, and send a weekly anonymised summary to operators and the Ministry (with Layer 35). Effort M. Impact high, and it supports the drivers' union case.
5. **Night routing.** After 21:00 prefer lit and sheltered stops (rider reports plus Mapillary street lights from Layer 31), shorter waits, and walking routes along main roads; show "last bus" warnings early. Effort M. Impact medium to high.
6. **Ask operators for a Request Stop pilot.** Cyprus has no such rule as far as I found. Propose a night request-stop trial on a few suburban lines, with Aloya showing riders where it applies. Effort S to propose. Impact medium; it depends on operators.
7. **Privacy by default.** Live location only while sharing is on, a visible indicator, one-tap stop, no history kept after expiry. Effort S. Impact: trust and GDPR safety.

## Layer 39: Offline

### 39.1 What the best in the world do
- Google Maps lets riders download map areas, but its own help page says: "When you're offline, transit, bicycling, or walking directions are unavailable" (Google Maps Help, Download areas and navigate offline). Offline areas auto-update on Wi-Fi when they are within 15 days of expiry. So the biggest map app gives bus riders nothing offline, which is a real gap.
- Good offline transit practice is: timetables stored on the phone, a planner that runs on the phone, a vector map of the area, and a clear label that times are "scheduled" rather than live. Open, single-file vector maps (Protomaps PMTiles built from OpenStreetMap) let an app ship a whole city or country map as one static file served from its own storage (Protomaps documentation).

### 39.2 The reality in Cyprus and the data available
- The two biggest visitor groups are on non-EU phone plans. In 2025 the UK supplied 31.8% of Cyprus's 4.53 million tourists and Israel 13.0% (CYSTAT, Tourism Statistics 2025, 4 May 2026). Neither is covered by EU "Roam like at home", so many visitors keep mobile data off and rely on hotel or café Wi-Fi.
- Signal gaps: rural and mountain bus routes (Troodos, Tillyria, Akamas edges) and indoor stations lose signal; I did not find a public Cyprus coverage dataset to quantify this, so treat it as an assumption to test with rider reports.
- Data needed offline is small. Aloya's own shards (public/data/schedule): the base files (feeds, routes, services, stops, trips) are about 330 KB gzipped, and one day of stop-times plus stop-trips is about 1.14 MB gzipped (20261027 shard: 658 KB + 481 KB). A week of all-Cyprus timetables is therefore roughly 8 MB.

### 39.3 Aloya today
- Already good: `src/lib/offline-schedules.ts` pre-downloads the base files and N upcoming day shards into the `aloya-schedule-v1` Cache Storage bucket and IndexedDB (`offline-timetable-db.ts`); `public/sw.js` (198 lines) serves schedules cache-first, keeps the schedule cache across app updates, uses stale-while-revalidate for assets, network-first for navigation, and falls back to `offline.html`. `OfflineBanner` appears across the app and `OfflineSchedulesCard` in the Me sheet lets riders manage downloads.
- Gaps:
  - The planner runs only on the server. `packages/core/src/raptor-core.ts` is pure TypeScript with tests, but it is called only from `src/lib/raptor.server.ts`, so offline riders can see timetables but cannot plan a trip.
  - No offline map. The basemap is Esri World Imagery raster tiles, which `src/lib/basemap.ts` itself says is "NOT licensed for production use without an Esri/ArcGIS agreement", and there are no stored tiles, so offline the map is blank.
  - Downloads are manual; there is no auto-refresh on Wi-Fi and no warning when the stored days run out.
  - Offline answers are not labelled as scheduled-only in the trip views.

### 39.4 Improvements
1. **Run RAPTOR in the browser when offline.** Load raptor-core in a Web Worker with the cached shards; when the network fails or the rider turns on "offline mode", plan on the phone and mark results "scheduled times, no live data". Effort M (the core is already pure and tested). Impact high: no major app does offline transit planning in Cyprus.
2. **Licensed vector basemap with an offline pack.** Replace Esri imagery in production with a licensed source (the code already lists Mapbox Satellite or MapTiler), and add an OpenStreetMap vector basemap as a PMTiles file per district (or all Cyprus) for offline use, with ODbL attribution. Effort M. Impact high: it fixes a licence risk and gives offline maps.
3. **Auto-download on Wi-Fi.** When the rider is on Wi-Fi and charging (where the platform allows), refresh the next 7 days of shards (about 8 MB) and the map pack monthly; show "offline ready until Thu 6 Nov". Effort S. Impact high for tourists.
4. **Tourist pack.** For visitors arriving by air: a one-tap "Download Cyprus for my trip" sheet at first launch with trip dates, airport bus routes and fares (Layer 37), and the emergency numbers (Layer 38). Effort S. Impact high for 45% of visitors on non-EU plans.
5. **Honest degraded states.** Offline: show scheduled times with a grey "scheduled" tag; stale live data (over 2 minutes): show "last seen 3 min ago"; feed outage (Layer 34): switch that operator to scheduled. Effort S. Impact medium to high for trust.
6. **Queue actions offline.** Store stop-condition reports, crowding taps (Layer 32) and safety reports (Layer 38) locally and send them when back online, with time and place recorded at the moment of the report. Effort S. Impact medium.
7. **Watch the EMEL horizon.** Because Limassol's feed carries only seven days (Layer 34), offline Limassol riders may hold fewer days than other districts; show the real last date per district. Effort S. Impact medium.

## Layer 40: Multilingual

### 40.1 What the best in the world do
- GTFS has a standard file for this, translations.txt, which lets a feed carry stop names, route names and headsigns in other languages, so apps can show official local names without guessing (GTFS Schedule reference, translations.txt).
- Leading apps localise the interface widely, keep official place names as published, and add the local-script name beside a translated one so riders can match signs. Right-to-left (RTL) languages need mirrored layouts, not just translated strings (W3C, Structural markup and right-to-left text in HTML).
- Machine translation plus native review is now the normal way small teams ship many languages; the check that matters is a native speaker on transit-specific words (stop, transfer, validator, night fare).

### 40.2 The reality in Cyprus and the data available
- Greek and Turkish are the official languages of the Republic of Cyprus. Language spoken best, 2021 census (government-controlled area, 923,381 people): Greek 733,732; English 44,482; Russian 21,642; Arabic 19,663; Romanian 18,691; Bulgarian 14,678; Indian languages 8,370; Filipino 7,554; Sinhala 6,060 (CYSTAT census table 1891616, as compiled on Wikipedia, Demographics of Cyprus). 22.1% of residents were not Cypriot citizens; foreign citizens were 40.0% of Paphos district and 21.7% of Limassol district (CYSTAT, Census 2021 final results, 9 Aug 2024).
- Visitors: in 2025 the UK supplied 31.8% of 4.53 million tourists, Israel 13.0%, Poland 8.2%, Germany 6.1%, Greece 3.9% and Sweden 3.4% (CYSTAT, Tourism Statistics 2025).
- The feeds already carry Greek: the Nicosia feed's translations.txt has 1,761 Greek stop names, 1,765 stop descriptions, 17,513 trip headsigns and 185 route names (for example stop 1, "Πλατεία Διονυσίου Σολωμού"), while the main stops.txt names are in Latin script (my read of feed 9, 31 Oct 2026). Translations are Greek only.
- On buses, the stop inventory tender will check whether displays and voice announcements work in Greek and English (Cyprus FAQ, 23 Oct 2026), so other languages will exist only in apps.

### 40.3 Aloya today
- Two separate i18n systems: `src/lib/i18n.ts` (Locale = "en" | "el") with `packages/core/src/dictionaries` (en and el, about 1,390 keys), and `src/lib/roam-i18n.ts` (828 lines) for the Roam redesign. Two systems mean strings get missed and translations drift.
- Only English and Greek. No RTL support: the only `dir` attribute in the code is `dir="ltr"` in the email layout, and the root document always declares `<html lang="en">` (src/routes/__root.tsx), even in Greek, which confuses screen readers and browser translation.
- The schedule ingest does not read translations.txt (no reference in scripts/ingest-schedule.ts), so a Greek-language rider still sees Latin-script stop names and headsigns although the feed has the Greek ones.
- Speech output exists (speech.ts) and could speak in the chosen language.
- The AI parser (Layer 33) already accepts free text in any language the model knows, which is a quick win for languages the UI does not yet support.

### 40.4 Improvements
1. **Use the feed's Greek names.** Ingest translations.txt and show Greek stop names, headsigns and route names when the UI is Greek, with the Latin name beneath for matching signs. Effort S. Impact high: it is official data already published.
2. **Set `lang` and `dir` correctly.** Set `<html lang>` from the active locale on every page; add `dir="rtl"` for RTL locales; use CSS logical properties (margin-inline-start and so on) so layouts mirror. Effort S for lang, M for RTL readiness. Impact: accessibility now, RTL later.
3. **Merge the two i18n systems** into one dictionary with key coverage tests (a CI check that fails when a key is missing in any shipped language). Effort M. Impact high for quality.
4. **Language order, by evidence:** Russian (third language spoken by residents, large Limassol community), Arabic (fourth, RTL), Hebrew (13% of tourists, RTL; shares RTL work with Arabic), Turkish (official language of the Republic), then Romanian, Bulgarian and Polish (residents and the third tourist market). Revised from the seed, which put Hebrew first; residents ride daily, tourists for a week. Effort M per language after the merge. Impact high.
5. **Translation process.** Machine translation for the first draft, a native reviewer per language for transit terms and tone, a glossary (Motion card, e-wallet, night fare, request stop), and official stop names never translated, only transliterated beside the Greek. Effort S per language. Impact: quality.
6. **Ask in any language, answer in theirs.** Let the AI assistant reply in the language the rider wrote in, using tool results for every fact (Layer 33), even before the UI supports that language. Effort S. Impact medium to high for visitors.
7. **Spoken guidance in the chosen language.** Use speech synthesis voices for the active locale for "next stop" and "get off now", with Greek stop names read from the feed. Effort S. Impact medium, larger for visually impaired riders.

## Part D top 10 (ranked by impact for riders and for Aloya, then by effort)

1. **Fix fares per operator before 5 Nov 2026 (L37).** `boarding-pay.ts` applies the Nicosia and Larnaca table to all five urban operators, so Limassol and Paphos riders see wrong cash and night prices, and EMEL's cash single becomes €2.50 (e-wallet €2.00) and night €4.00 on 5 Nov. Intercity in the feed ranges €4 to €10, not "€5 to €8, cash only". Also update taxi constants to the official €3.80 / €0.95 day and €4.80 / €1.10 night tariff, and correct the aloya.cy "90 minutes" transfer copy to CPT's 60 minutes. Effort S.
2. **Nightly feed health job (L34).** Run the MobilityData validator, check each feed's real service-date horizon (EMEL lists only 31 Oct to 6 Nov while claiming 28 Jan 2027), move ingest after Motion's 05:31 publish, and switch an operator to "scheduled times" when its live data degrades. Effort M.
3. **AI assistant: correct time zone, cheaper providers, quota guard, then tools (L33).** Use Asia/Nicosia rules for the target date (Cyprus is UTC+2 since 25 Oct), put Groq and Workers AI gpt-oss-20b ahead of Gemini, rate-limit and cache the public parse endpoint, then build a tool-calling companion where every number comes from Aloya's own tools. Effort S, then L.
4. **Safety sheet and safe sharing (L38).** One tap to 112, 1460 and 1440; share-live-trip in the web app with auto-end on arrival and an "arrived safely" message; discreet incident reports that feed a weekly summary to operators. Effort S to M.
5. **Heat-aware planning on official data (L36).** Add a sun-walk and unsheltered-wait penalty at feels-like 35°C or more, use the Met Department's 55 stations and MeteoAlarm CAP instead of scraping, and fix the Open-Meteo licence (free tier is non-commercial). Effort S to M.
6. **Use the Greek names already in the feed and fix `lang` (L40).** Ingest translations.txt (Greek stop names and headsigns), set `<html lang>` per locale, merge the two i18n systems, then add Russian, Arabic, Hebrew and Turkish with RTL. Effort S, then M per language.
7. **Offline trip planning (L39).** Run raptor-core in a Web Worker on cached shards (about 8 MB a week), add a licensed vector basemap with an offline pack, auto-download on Wi-Fi, and a tourist pack for the 45% of visitors on non-EU phone plans. Google Maps gives no transit directions offline. Effort M.
8. **Crowding from riders (L32).** Remove or revive the dead `route_load_estimates` pipeline, add a one-tap seats/standing/packed report, parse GTFS-RT occupancy for the day Motion adds it, and use crowding in replanning. Effort S to M.
9. **Operator report card and a funded first customer (L35).** Turn the existing backtest, reliability and feed-delta data into a quarterly report card; prepare a bid for RIF "AI in Government: New Challenges" (expected Q4 2026); measure bus delay at signals for the Public Works Department. Correct the seed: the 15-junction tender is about €41,900, not €41.9 million; the 125-junction bus-priority system (€7.1 million) is held up in court. Effort M.
10. **Open data intake and a /data page (L31).** Ingest CyNAP layers (bus lanes, cycleways, crossings, racks), Waze alerts and Mapillary street furniture; publish a /data attribution page; offer to help the Public Works Department meet the December 2026 MMTIS deadlines. Effort S to M.

Corrections to the seed made in this part: the AI time zone is not hard-coded (it uses the phone's offset, which is still wrong for visitors and across clock changes); the smart-lights tender is €41,900, not €41.9 million; Aloya already has more weather data (air quality, warnings, dust advisory) than the seed said, but none of it reaches the router; share-ETA exists only in the native mobile app; the language order puts resident languages (Russian, Arabic) before Hebrew.



# Part E: Product, growth, business and quality (layers 41 to 50)

Author: research subagent, 31 Oct 2026 (EET). Repo read: programmeradu/aloyacy-8f3d9cd7, branch redesign-roam (via the GitHub API and raw files; the sandbox shell was unavailable all session). Live app tested: https://aloya-app.samueladuberekorang.workers.dev on 31 Oct 2026 19:34 EET.

Conventions: every number below comes from the cited source. Where something is my inference it is marked "inferred". Effort: S (days), M (2 to 6 weeks), L (more than 6 weeks).

## Layer 41: Competitor teardown and gap matrix

### 41.1 What the best in the world do
- Citymapper: GO mode with step by step guidance, get-off alerts that work offline, a Lock Screen Live Activity, and live ETA sharing by link that recipients open on the mobile web without the app. Citymapper made its Club features free in version 11 and kept an ad-free tier. Via later acquired Citymapper. Sources: citymapper.com/news/867, Citymapper store listings.
- Transit (Montreal): GO crowdsourcing, where riders who tap GO share their bus position with riders downstream at 1 to 2 seconds latency instead of the roughly 15 seconds of a typical transponder; Share Trip launched 1 Sept 2026 with automatic stop on arrival; Royale subscription (USD 24.99 per year or 4.99 per month) that more than 150 agencies sponsor for all their riders. Sources: blog.transitapp.com/autogo, nowtoronto.com (2 Sept 2026), transitapp.com/en/features/share-live-trips.
- Moovit: 1.5 billion users in 112 countries; covers Cyprus (NPT, EMEL, OSYPA, Intercity, Kapnos) with live directions and get-off notifications; Moovit+ (2023) paywalls SafeRide trip sharing, Compare Routes, Arrival Updates and Live Location; sells white-label MaaS and analytics to governments. Sources: moovit.com press releases (31 Jul 2023, 22 Nov 2023), moovitapp.com Nicosia pages.
- Google Maps: CPT told the Audit Office on 15 Oct 2026 that all CPT routes are on Google Maps; EMEL live ETAs went live early 2026 and intercity was added on 11 Mar 2026 (from earlier research in this session).
- Apple Maps: no transit directions in Cyprus (Cyprus is absent from Apple's feature availability list, which includes Greece).
- ummadum (Tyrol, Austria; the likely meaning of "Umadum"): rewards kilometres by bike, foot, public transport or carpool with points (1 point = 1 cent) redeemable at local shops, funded by municipalities and employers. 10K+ downloads, rating 4.1. No Cyprus presence found.

### 41.2 Reality in Cyprus and the data available
- Official app Pame (Cyprus Public Transport, built by Meep): live arrivals, map, planner, Motion top-up. Meep claims 130K+ downloads, 8K+ active users, 1M+ planned trips. Play rating about 2.8 to 3.1. Reviews complain that login is forced to see fares and timetables and that Greek search is weak.
- Ministry "Cyprus Bus" (GMV): iOS rating 2.0, Play 2.3 to 2.7 from 743 reviews, last updated 29 Oct 2024; reviews say search and planning are broken.
- Independent apps: BusCyprus (ads, all operators plus Nextbike, 6 languages), BusAPP.cy (planner launched 28 Sept 2026, up to 2 changes, arrive-by, saved journeys on device, no tickets, no background notifications), Cyprus Bus Guide (offline, 194 routes, no live data), Urbaneel (free, no account, live tracking), "Cyprus Transport" on the App Store (live map from official open data, offline-first, EN/EL/RU), cyprusbus.info, cybuses.com, limassolbus.online, cyprusbybus.
- Bolt operates rides, Minibus, Bolt Business, Bolt Plus and Nicosia scooters; public transport ticketing pilots inside Bolt were reported for 2026.
- Data: the Cyprus National Access Point traffic4cyprus.org.cy publishes static GTFS, GTFS-RT and SIRI real-time (update frequency "up to 1 min", maintained by the Public Works Department). Source: traffic4cyprus.org.cy/en/dataset/publictransportrealtime_siri.

### 41.3 Aloya today and its gaps
Strengths seen in the live test: excellent Greek and fuzzy place search ("Larnacka Airporth" resolves to Larnaca International Airport), dense trip cards with a "Why this option" rationale, Kapnos partner fares, live trip mode with Greek street names, a blunt reliability panel on route pages ("8% on time"), probabilistic stop copy ("About 25% chance one arrives before 19:55"), an honest Pulse network view, no-login posture, and a Green Line explainer. The repo also has an Expo native app (mobile/), Nextbike and Bolt scooter functions, EV chargers, Kapnos itineraries and a commute learner.

Gap matrix (Y = has it, P = partial, N = no; Aloya column from the live test and repo):

| Capability | Aloya | Pame | Moovit | Google Maps | Transit | Citymapper |
|---|---|---|---|---|---|---|
| Live arrivals Cyprus | Y | Y | Y | Y | N (not in Cyprus) | N (not in Cyprus) |
| Map that renders | N (broken in live test) | Y | Y | Y | n/a | n/a |
| Greek-first search | Y | P | P | Y | n/a | n/a |
| Confidence or reliability per ETA | Y | N | N | N | P | N |
| Smart leave-now alerts using walk time and bus position | P (leave-time adjuster uses weather and delay only) | N | P (paid) | N | Y | Y |
| Get-off alerts offline | P (alight detector in code; web only) | N | Y | N | Y | Y |
| Live trip sharing by link | P (group and eta token routes exist) | N | P (paid) | Y | Y | Y |
| Micromobility in the middle of a trip | P (Nextbike, Bolt functions; first and last mile chain) | N | P | P | Y | Y |
| Ticketing or Motion top-up | N | Y | N | N | P | N |
| Native app in stores | N (Expo app exists, not shipped) | Y | Y | Y | Y | Y |
| Offline timetables | P (bundled static GTFS) | N | P | P | Y | P |
| Accessibility routing | P (step free, shaded stops prefs) | N | P | P | P | P |

### 41.4 Concrete improvements
1. Fix the map first (see layer 50, issue 1). Without a map Aloya loses the head-to-head with every competitor. Effort S, impact very high.
2. Win on trust, not breadth: surface the existing freshness classifier (live, rider-confirmed, predicted, ghost, scheduled) as one consistent badge on every ETA and in notifications. Nobody else in Cyprus does this. Data: packages/core/src/freshness.ts. Effort S, impact high.
3. Steal Transit's GO crowdsourcing: when a rider is on board with GO on, publish their position as a vehicle observation for downstream riders (opt in, coarse, expiring). The repo already has rider sightings, device reputation and vehicle pings tables. Effort M, impact high on lines Pulse lists as "Busy lines we can't see".
4. Make the free tier contain what Moovit paywalls (trip sharing, arrival updates, compare routes). Effort S, impact medium.
5. Ship the Expo app to both stores (layer 49). Effort M, impact high.
6. Partner rather than fight Pame: offer a "Top up in Pame" deep link and, longer term, Motion card balance via official API if CPT opens one. Effort S then L, impact medium.
7. Publish a public comparison page ("Aloya vs official app") only with verifiable claims and dates. Effort S, impact medium.

## Layer 42: Rewards and gamification that drive mode shift, without cheesiness

### 42.1 What the best in the world do
- Singapore INSINC (Stanford and LTA): shifted 7.49% of peak trips, 10.1% among heavy peak users; a "Magic Box" raffle lifted the shift to 9.34%; habits took 4+ weeks to form (from earlier research this session).
- A Singapore fare rebate randomised trial found a 5.5% pre-peak shift that persisted for 7 months (earlier research this session).
- Transportation Research Part D (2025): point incentives raised the chance of switching from car by 15%+; same-day offers worked best (earlier research).
- Counter-evidence: Nature Human Behaviour (2019) ran five commuter nudge field experiments (n = 68,915) and all failed; a 2024 Transportation Research Part F review of 49 papers finds empirical evidence still lacking; there is a documented novelty effect and familiarisation rebound; FHWA (2024) warns against rewarding behaviour that would have happened anyway (earlier research).
- ummadum: points as real money at local shops, funded by municipalities or employers, so the user is never the payer.
- Transit: "helpfulness" ranks per line for GO contributors, a reward for helping others rather than for travelling.

### 42.2 Reality in Cyprus
- Fares are already low and subsidised: Nicosia and Larnaca urban fares from 3 Aug 2026 are EUR 2.70 cash or EUR 2.00 with Motion by day; students 13 to 18 and university students get 50% off (earlier research). Small cash rewards therefore compete with a small price, which helps: a free ride is a large relative reward.
- Car dependence is the real problem (BRIEF). No public Cyprus mode-shift incentive programme was found in this session.

### 42.3 Aloya today and its gaps
No rewards or gamification surfaced in the live app. The repo has device reputation, rider sightings and "Shelter here? Yes/No" crowd prompts, which are the raw material for contribution-based recognition. There is no measure of mode shift, so any reward would currently pay for behaviour that would happen anyway.

### 42.4 Concrete improvements
1. Reward change, not usage. Only reward a trip when it replaces a car trip the user would plausibly have made (first ride on a new route, a peak trip shifted to shoulder time, a park-and-ride trip). Data: trip history on device, park-and-ride stops (Kolossi P3 Alphamega site, 102 spaces, from 2 Jan 2025). Effort M, impact high.
2. Sponsored, not self-funded, rewards in the ummadum model: municipalities, employers (B2B, layer 47) and shops fund points; Aloya never sells data to fund them. Effort L, impact high.
3. Same-day, raffle-style offers (INSINC "Magic Box" logic): "Leave at 07:40 instead of 08:00 today and enter tonight's draw for a monthly pass." Effort M, impact medium to high.
4. Contribution recognition instead of badges for riding: a quiet "You helped 43 riders on line 30 this week" card when GO sharing or crowd reports helped others. Effort S, impact medium.
5. A personal, private impact ledger (km by bus, money saved versus driving, CO2 avoided) with sources for each factor; no leaderboards by default. Effort S, impact medium.
6. Evaluate properly: randomise offers (A/B) and measure persistence after 4 and 12 weeks; stop anything that fades. Effort M, impact high on credibility.
7. Anti-cheesiness rules: no confetti, no streak guilt, no push notifications for rewards, opt in only, British English, Greek translations reviewed by a native speaker.

## Layer 43: Social and group travel

### 43.1 What the best in the world do
- Citymapper: share a live ETA by WhatsApp, iMessage, Messenger, SMS or email; recipients follow on the mobile web without the app; also share stops, routes and lines.
- Transit Share Trip (1 Sept 2026): followers see the stage of the journey (walking, riding, transferring); several links can be opened together for a "GO party"; sharing is off by default and stops on arrival.
- Google Maps: "Share trip progress" stops automatically on arrival and shows the sharer's battery level; collaborative lists with emoji voting for planning outings (Nov 2023).
- Moovit+ SafeRide: designated safety contacts, behind a paywall.

### 43.2 Reality in Cyprus
Cypriot life is highly social and much planning happens in WhatsApp groups (inferred, no source checked). Students, tourists and event crowds travel in groups. No Cyprus transport app found offers group travel.

### 43.3 Aloya today and its gaps
The live app offers "Watch together, live": a no-account avatar and name picker with 15 avatars and a short code link. The repo has group/[code], eta/[token] and plan/[token] routes on both web and mobile, and D1 migrations for shared trip write keys, member mode and member avatars. Gaps: no automatic stop on arrival was verified; no battery or "stage of journey" indicator was seen; no meeting point planner ("everyone arrive at Eleftheria Square by 20:00"); invitees cannot pick their own route to a shared destination; Greek-mode strings were partly untranslated in the trip banner (layer 50, issue 5).

### 43.4 Concrete improvements
1. Arrive-together planner: one organiser sets a place and time; each member gets a personal plan with their own leave-by time; the group view shows who is on track. Data: existing planner plus group code. Effort M, impact high.
2. Auto-expiry and privacy defaults: links expire at arrival or after a set time, location is snapped to the route rather than raw GPS, and the sharer sees who is watching. Effort S, impact high on trust.
3. Journey stage and confidence in the shared view ("on bus 30, 6 stops, live"), reusing the freshness badge. Effort S, impact medium.
4. "Wait for me" transfer etiquette: if a member is late for a shared transfer, suggest the next common departure to everyone. Effort M, impact medium.
5. Event groups: one link for a whole fan club or class trip with headcount at boarding (layer 46). Effort M, impact medium.
6. WhatsApp-friendly Open Graph previews (dynamic OG rendering already exists) in EN and EL. Effort S, impact medium.

## Layer 44: Cross-island travel: the north and the Green Line crossings

### 44.1 What the best in the world do
Border-aware journey planners (for example in the Schengen area before and after controls, or at Gibraltar) show crossing points, opening hours, document requirements and queue times as part of the route rather than as a separate article (general practice; no single source checked this session).

### 44.2 Reality in Cyprus
- Green Line Regulation 866/2004: the line is not an EU external border. Crossings: Ledra Palace and Ledra Street (pedestrian), Agios Dhometios/Metehan (the busiest; EU-funded expansion completed 13 Feb 2026, adding a traffic lane), Pergamos, Strovilia, Astromeritis-Zodhia, Kato Pyrgos-Karavostasi (Limnitis), Lefka-Apliki and Deryneia.
- No direct public bus crosses the line; travellers take a bus to Nicosia, cross on foot, and catch a northern bus or taxi (Lonely Planet). Private shuttles run from Larnaca Airport to the north (northern operators include KIBHAS); a World Bank Nicosia strategy recommends bi-communal bus routes such as airport to airport.
- Hire cars from the south are usually uninsured in the north; northern insurance is sold at most vehicle gates but not at Lefka.
- The Republic considers Ercan and the northern ports illegal points of entry; since 2019 third-country nationals arriving via the north are barred from crossing south. The Foreign Minister said on 23 Oct 2026 that crossing rules would not change under Schengen.
- 2024 crossings: 1.35M by Greek Cypriots and 1.81M by Turkish Cypriots (EU report COM(2026)324).
- Legal risk: Cyprus Law 71(I)/2013 penalises maps, including digital maps, that use place names differing from the official gazetteer (up to 3 years and/or EUR 50,000).

### 44.3 Aloya today and its gaps
Aloya has an honest Green Line page: "Republic buses only", "Ledra is the pedestrian crossing", and a definition of Famagusta as the Republic catchment. The planner stops at the line. Gaps: no crossing hours, no walking route to and through Ledra, no "what to bring", no north-side onward options.

### 44.4 Concrete improvements
1. Crossing-aware routing to the line: plan to the nearest suitable crossing for a destination north of the line, with walking time, pedestrian or vehicle status and documents. Data: a hand-maintained crossings table with hours, reviewed monthly. Effort M, impact medium.
2. Naming policy: label northern places with the official gazetteer name first, and show any other name only as a secondary search alias, to stay within Law 71(I)/2013. Get a written legal opinion before launch. Effort S, impact high on legal risk.
3. Third-country national warning: if the user's arrival airport is Ercan, show the Republic's entry rule before suggesting any southbound route. Effort S, impact high on harm avoidance.
4. Car hire insurance note on any vehicle crossing route. Effort S, impact medium.
5. Do not ingest northern operator timetables until the naming and legal review is done; then consider partnerships with northern operators for information only. Effort L, impact medium.

## Layer 45: Families: school children, parent tracking, students

### 45.1 What the best in the world do
- Transit Share Trip is explicitly promoted for students travelling to school alone; it stops sharing on arrival.
- Life360 is the cautionary tale: The Markup (Dec 2021) found it sold precise location data on tens of millions of users, including children, to about a dozen brokers; location sales were USD 16M, nearly 20% of 2020 revenue; it then stopped selling precise data except to Arity and moved to aggregated sales.

### 45.2 Reality in Cyprus
- School bus: EUR 5 per month or EUR 30 per year with a personalised Motion card (Sept 2025 to Aug 2027, EUR 17 per month subsidy); free for large families and guaranteed minimum income recipients; from 14 Sept 2026 pupils without a card cannot board. Children under 6 ride free; ages 6 to 12 get 50% off regular buses; under 12s ride school buses free (earlier research this session).
- GDPR in Cyprus: Law 125(I)/2018 article 8 sets the digital age of consent at 14; below 14 a parent must give or authorise consent. A draft bill would raise it to 16 (Lex Mundi guide).
- The Commissioner's DPIA guidance lists location tracking by mobile apps as a high-risk processing example.

### 45.3 Aloya today and its gaps
No family or student mode. School routes and student fares were not seen in the planner. The generic watch-together link could be used by parents, but without consent controls suited to minors.

### 45.4 Concrete improvements
1. "Arrived safely" mode: the child starts a trip, the parent gets three events only (boarded, transfer made, arrived), never a continuous dot. Data: alight detector and journey phases. Effort M, impact high.
2. Consent by design: users under 14 cannot enable sharing without a parent's authorisation; the child always sees when sharing is on; no history kept after 24 hours. Effort M, impact high on compliance.
3. Student fare awareness: show the 50% student fare and school bus card status in fare estimates when the user sets "student". Effort S, impact medium.
4. School run planner for parents: compare driving with school bus plus walk, in time and money. Effort M, impact medium on car trips.
5. Never monetise children's location; write that into the privacy policy and B2B contracts. Effort S, impact high on trust.
6. Run a DPIA before shipping any tracking feature. Effort S, impact high.

## Layer 46: Events, stadiums, festivals and surge handling

### 46.1 What the best in the world do
Event-aware planners publish special event timetables in advance, route people to park-and-ride, and stagger departures after the final whistle (general practice in large networks; no single source checked this session).

### 46.2 Reality in Cyprus
- Limassol Wine Festival: the Deputy Ministry of Tourism ran free pre-booked coaches from Nicosia, Larnaca, Ayia Napa and Paphos (2024 dates and times published by Limassol municipality). In 2022 the municipality made EMEL line 30 free to the festival.
- Limassol Carnival: Intercity Buses ran additional routes on 2 Mar 2025 and published route diversions for carnival events in Feb 2026.
- Kataklysmos 2026, Larnaca: a special express park and ride from GSZ Stadium to the central bus station, every 30 minutes, 18:00 to 00:30 on 31 May and 1 Jun 2026.
- Nicosia: Express route X200 (from 2 Jun 2025) links Tamasos station, GSP Stadium, the General Hospital and the University of Cyprus.
- Visit Cyprus publishes an annual events PDF (2026 edition dated 6 Oct 2026).
- These are published as PDFs and Facebook posts, not as GTFS changes (inferred from the formats found).

### 46.3 Aloya today and its gaps
Pulse showed an editorial card "Matchnight in Larnaca. Expect Antonis Papadopoulos Stadium traffic from 17:30. Routes 407 run heavy." with no date and no source (layer 50, issue 9). There is no structured event calendar, no special service ingestion, and no post-event crowd guidance.

### 46.4 Concrete improvements
1. Event calendar ingestion: fixtures (Cyprus league), the Visit Cyprus events PDF and municipal festivals into a dated events table with venue coordinates. Effort M, impact medium.
2. Special service ingestion: turn operator PDFs (Kataklysmos park and ride, carnival extras, festival coaches) into temporary GTFS trips that the planner can route on. Effort M, impact high on event nights.
3. Every event card carries a date, a source link and an expiry, and disappears afterwards. Effort S, impact high on trust.
4. Post-event guidance: after the final whistle, recommend walking to a quieter stop 5 to 10 minutes away or waiting 20 minutes, using live vehicle load where available and crowd reports otherwise. Effort M, impact medium.
5. Park and ride first: when the destination is a stadium or festival, rank park and ride options (Kolossi, GSZ) above driving to the venue. Effort S, impact medium on car trips.
6. Offer municipalities and clubs a white-label event page (B2G and B2B, layer 47). Effort M, impact medium.

## Layer 47: Business models: B2C, B2B, B2G, affiliate and data, including what failed elsewhere

### 47.1 What the best in the world do, and what failed
- B2C subscription failed at scale: MaaS Global (Whim) raised over EUR 160M (Sifted), had about 10,000 active users in Helsinki and 1 million users overall, lost EUR 9.3M on EUR 3.8M revenue in 2022, cut staff from 120 to 28, and filed for bankruptcy in March 2024; commentators blamed the B2C subscription bundle. umob bought the assets.
- Citymapper made Club features free in version 11 after launching Club at USD 2.99 per month, and was acquired by Via.
- What works: Transit's Royale is sponsored by more than 150 agencies for all their riders (B2G pays, rider gets it free); Moovit sells white-label apps, analytics and advertising to governments and was bought by Intel/Mobileye for about USD 900M in 2020; TNO and Cutter describe a shift from B2C MaaS to government-led "public mobility".
- Data sales are a reputational trap: Life360 earned USD 16M from location sales in 2020 and was forced to retreat after The Markup's reporting; Strava's 2018 global heatmap revealed military bases.

### 47.2 Reality in Cyprus
- Small market: Pame claims 8K+ active users. Fares are low, so a rider subscription has little headroom.
- Buyers exist: the Ministry and CPT (official app rated about 2 to 3 stars), five regional operators, municipalities, employers with parking problems, hotels and tourist businesses, Hermes Airports, and partners such as Kapnos, Nextbike and Bolt.
- Cyprus hosts the British Sovereign Base Areas (Akrotiri and Dhekelia); any aggregated movement map must avoid Strava-type disclosures (inferred risk).

### 47.3 Aloya today and its gaps
COMMERCIAL.md describes licensing options (single deployment, source available, full asset transfer) and still calls the code proprietary, while it was made public and MIT licensed in Oct 2026 (from memory notes). README lists Stripe billing for "Aloya Pro". The Expo config asks iOS for App Tracking Transparency "to measure which features help Cyprus riders", which is unnecessary for first-party analytics and a trust risk. The Pass tab shows a 7 day pass price with no way to buy (layer 50, issue 20).

### 47.4 Concrete improvements
1. Keep the rider app free; do not lead with a B2C subscription (Whim lesson). Effort S, impact high.
2. B2G: offer the trust layer (freshness, reliability, ghost bus detection, ETA backtesting) as an operator dashboard and an accuracy audit for CPT and the Ministry, priced per month. Data: existing eta_accuracy, truth_ledger and ghost-trips code. Effort M, impact high.
3. B2B commuter programmes: employers fund passes and rewards (layer 42) and get anonymised commute reports for parking and ESG. Effort M, impact medium to high.
4. Affiliate with clear labels: Kapnos booking, Bolt rides, Nextbike, car hire with north insurance notes; disclose "Aloya may earn a commission". Effort S, impact medium.
5. Data products only as aggregated, k-anonymous, delayed statistics with exclusion zones around military and sensitive sites; never raw traces; never children's data. Effort M, impact medium, risk managed.
6. Fix the licence story: one licence in LICENSE, README and COMMERCIAL.md. Effort S, impact high on credibility.
7. Remove the ATT prompt unless cross-app tracking is truly needed. Effort S, impact medium on trust and review.
8. Grants: EU and Cyprus innovation funds for sustainable mobility as non-dilutive income (not researched in depth this session).

## Layer 48: Standards and regulation: ITS Directive revision, MMTIS, Cyprus NAP, EAA 2025 and GDPR

### 48.1 What the rules say
- ITS Directive revision, Directive (EU) 2023/2661: Member States had to transpose it by 21 Dec 2025; a new Article 6a makes data in Annex III available for set coverage and dates.
- MMTIS Delegated Regulation (EU) 2024/490, amending 2017/1926: dynamic data via National Access Points becomes mandatory on a timeline from 1 Dec 2025 to 1 Dec 2028 (points 2.1 and 2.2 of the Annex: comprehensive TEN-T by 1 Dec 2025 and 1 Dec 2026, the rest of the network by 1 Dec 2028); NeTEx is required for scheduled timetables; the regulation only covers data that already exists in digital form.
- European Accessibility Act, Directive 2019/882, transposed in Cyprus by Law 57(I)/2024 (published 2 May 2024), applies from 28 Jun 2025 to websites, mobile apps, e-tickets and real-time information of bus, air, rail and water passenger services. Micro-enterprises providing services (fewer than 10 staff and turnover or balance sheet up to EUR 2M) are exempt.
- GDPR plus Cyprus Law 125(I)/2018: digital age of consent 14. EDPB Guidelines 01/2020 on connected vehicles and mobility apps recommend local processing and treat location data as warranting special attention. Cyprus's DPIA list was criticised by the EDPB (Opinion 10/2019) for not naming location data; the Commissioner's guidance nonetheless gives location tracking by apps as an example of high-risk processing.

### 48.2 Reality in Cyprus
- The NAP traffic4cyprus.org.cy publishes GTFS static, GTFS-RT and SIRI real-time for all public bus operators, plus Bolt scooter stations (earlier research).
- Aloya consumes, rather than publishes, these feeds, so most MMTIS duties fall on data holders. Aloya's obligations are attribution, licence compliance and, if it ever holds dynamic data of its own (for example Kapnos or crowd data), possibly publishing metadata to the NAP.

### 48.3 Aloya today and its gaps
- EAA: Aloya is likely exempt as a micro-enterprise (inferred), but CPT and operators are not; a compliant Aloya is a sales argument in B2G. Live test found likely contrast failures, no dark mode and some unlabelled states (layer 50).
- Map imagery: src/lib/basemap.ts ships Esri World Imagery, which its own comment says is "NOT licensed for production use without an Esri/ArcGIS agreement".
- GDPR: no DPIA found in the repo; ATT prompt in the iOS config; background location declared for "on-trip alerts".

### 48.4 Concrete improvements
1. Accessibility conformance to EN 301 549 / WCAG 2.2 AA anyway, with an accessibility statement in EN and EL. Effort M, impact high.
2. NeTEx readiness: add a NeTEx import path alongside GTFS so Aloya keeps working if Cyprus publishes NeTEx first. Effort M, impact medium.
3. Licence hygiene: switch the basemap to the licensed Mapbox satellite or light style already configured, or sign an Esri agreement; keep the attribution component. Effort S, impact high on legal risk.
4. DPIA and records of processing for location, crowd reports, group sharing and children's use; publish a short summary. Effort S, impact high.
5. Data minimisation: snap shared positions to the route, keep raw traces on device, expire group data within 24 hours. Effort M, impact high.
6. Register Aloya's own dynamic data (crowd confirmations) on the NAP as an open dataset once quality is proven; this positions Aloya as a data partner. Effort M, impact medium.

## Layer 49: PWA versus native: Capacitor or Expo, push, Live Activities, background location, and what smart alerts need

### 49.1 What the platforms allow
- iOS web push works only for web apps added to the Home Screen (iOS 16.4+); Declarative Web Push arrived in iOS and iPadOS 18.4 and needs no service worker; there is no Background Sync, Periodic Background Sync or Background Fetch on iOS PWAs (firt.dev compatibility table, 13 Oct 2026). From iOS 26, sites added to the Home Screen open as web apps by default.
- No PWA on any platform can watch location in the background, so a PWA cannot know that the rider has left home and is walking to the stop while the screen is off.
- Native: iOS region monitoring is capped at 20 regions per app; Android geofencing at 100 per app and needs ACCESS_BACKGROUND_LOCATION from Android 10. Google Play requires a declaration form, a prominent in-app disclosure and a video for background location, which must be core functionality.
- Live Activities need a Widget Extension with ActivityKit, iOS 16.1+; installing a Capacitor plugin alone does not create one.
- Capacitor's own geolocation plugin does not support background location; community and commercial plugins do (capacitor-community/background-geolocation, Transistorsoft, Capawesome, Capgo). Wrappers risk App Store guideline 4.2 rejection if they feel like a repackaged website.

### 49.2 Reality for Aloya
The repo already contains an Expo / React Native app that mirrors the web routes one to one, shares packages/core, and declares UIBackgroundModes location and remote-notification, NSSupportsLiveActivities, Android background location, notifications and boot permissions, deep links for /group, /plan and /eta, and EAS build profiles. This is a real native peer, not a wrapper, so the Capacitor question is mostly settled: Expo is the right path.

### 49.3 Aloya today and its gaps
- Samuel's main complaint (alerts fire as if he is already at the stop) cannot be fully solved on the PWA because the web cannot track him in the background.
- src/lib/leave-time-adjuster.ts only shifts reminders for weather (Open-Meteo) and recent route delay; it does not use the rider's live position, walking time or the live position of the specific vehicle.
- The live PWA's /manifest.json returned the SPA 404 page and no install prompt was seen (layer 50, issue 4).
- NSSupportsLiveActivities is set, but no Widget Extension was found in mobile/ (inferred from the file tree; needs confirming).

### 49.4 Concrete improvements
1. Smart alert engine (server plus device): alert only when slack = (vehicle ETA at stop) minus (walking time from current position) crosses thresholds; examples: slack under 2 min means "Hurry, you'll miss it, next one in 18 min"; slack negative means "You'll miss this one. Walk 4 min to stop X for line 30 in 6 min." Inputs: device location (native background, or foreground on web), walking time from the routing engine, vehicle ETA from GTFS-RT with its confidence tier. Effort M, impact very high.
2. State machine per leg (at home, walking, at stop, on board, approaching transfer, transferring, arrived) so alerts fit the phase; suppress "at stop" alerts until the device is within about 50 m of the stop. Effort M, impact very high.
3. Native first for alerts: ship the Expo app with region monitoring of the next 1 to 3 stops only (well under the 20 and 100 limits), significant location change otherwise, and silent push to refresh. Effort M, impact very high.
4. Live Activity and Android ongoing notification showing "Leave in 3 min / Bus 30 in 7 min / live". Effort M, impact high.
5. PWA fallback: fix the manifest, add Declarative Web Push for iOS 18.4+, and be honest in the UI that alerts work best with the app open or with the native app. Effort S, impact medium.
6. Play and App Store compliance pack: background location disclosure text in EN and EL, video, privacy policy link; remove the ATT prompt. Effort S, impact high on approval.

## Layer 50: QA: scenario catalogue, Playwright automation and a live hands-on pass

### 50.1 What the best do
Teams test time and place deterministically: Playwright's context geolocation and permissions, page.clock (setFixedTime, install, pauseAt, fastForward, runFor), context.setOffline, and network mocking with page.route. Note: setOffline cuts the service worker only in Chromium, so offline tests should also drop connections at the test server for WebKit and Firefox.

### 50.2 Test harness (Playwright, TypeScript)

    // tests/e2e/fixtures.ts
    import { test as base, expect } from '@playwright/test';
    export const NICOSIA = { latitude: 35.1725, longitude: 33.3617 };
    export const test = base.extend<{ at: (lat:number, lng:number)=>Promise<void> }>({
      at: async ({ context }, use) => {
        await context.grantPermissions(['geolocation']);
        await use(async (latitude, longitude) => context.setGeolocation({ latitude, longitude }));
      },
    });
    export async function freezeClock(page, time: number | string) {
      await page.clock.install({ time: new Date(time) }); // before page.goto; pass a real instant such as Date.UTC(...)
    }
    export async function mockRealtime(page, body: unknown) {
      await page.route('**/api/public/realtime**', r => r.fulfill({ json: body }));
    }

    // playwright.config.ts (excerpt)
    // use: { timezoneId: 'Asia/Nicosia', locale: 'en-GB', viewport: { width: 390, height: 844 } }
    // projects: chromium-mobile, webkit-mobile, chromium-desktop, el-GR locale

Example: home, walking 10 min, bus 5 min away (the core smart-alert case).

    test('home: walk 10 min, bus 5 min, warns rider will miss it', async ({ page, at }) => {
      await freezeClock(page, Date.UTC(2026, 10, 2, 5, 50)); // Mon 2 Nov 2026, 07:50 Cyprus time (UTC+2)
      await at(35.1650, 33.3550);                     // home, about 800 m from stop
      await mockRealtime(page, fixtures.bus30EtaSeconds(300, 'live'));
      await page.goto('/trip/fixture-home-to-work');
      await page.getByRole('button', { name: /start this trip/i }).click();
      await expect(page.getByText(/you're 10 min away/i)).toBeVisible();
      await expect(page.getByText(/bus .* 5 min/i)).toBeVisible();
      await expect(page.getByText(/next one|walk to/i)).toBeVisible(); // offers alternative
      await expect(page.getByText(/at your stop/i)).toHaveCount(0);    // no false "at stop"
    });

Example: dead GPS.

    test('dead GPS: graceful fallback, no stuck loader', async ({ page, context }) => {
      await context.clearPermissions();
      await page.goto('/');
      await expect(page.getByText(/search for (a stop|the address)/i)).toBeVisible();
      await expect(page.getByText(/finding stops near you/i)).toHaveCount(0);
    });
### 50.3 Scenario catalogue (expected behaviour; automation: G = setGeolocation, C = clock, R = route mock of realtime or planner, O = offline, L = locale, V = viewport)

| # | Scenario | Expected behaviour | Auto |
|---|---|---|---|
| 1 | Home, walking 10 min, bus 5 min away | Warns rider will miss it; offers next bus or alternative stop; never says "at your stop" | G C R |
| 2 | Home, walking 5 min, bus 12 min | "Leave in 7 min" countdown; single alert at leave time | G C R |
| 3 | Home, walking 5 min, bus 6 min | "Leave now" alert once | G C R |
| 4 | At stop, bus 3 min live | "Bus in 3 min, live" | G C R |
| 5 | At stop, bus predicted only | Shows predicted tier, not live | G C R |
| 6 | At stop, ghost bus (scheduled, no vehicle) | Ghost label and next reliable option | G C R |
| 7 | Dead GPS (permission denied) | Typed search fallback; no stuck loader | G |
| 8 | GPS timeout | Error after timeout with retry and search | G R |
| 9 | GPS accuracy 500 m | Shows "approximate location", widens stop radius | G |
| 10 | GPS jumps 2 km (spoof or glitch) | Ignores outlier, no alert storm | G C |
| 11 | Late bus, delay grows from 2 to 9 min | Updates countdown; one "running late" alert, not one per poll | C R |
| 12 | Late bus makes transfer impossible | Proposes new connection before alighting | C R |
| 13 | Missed transfer (rider still on first bus past transfer stop) | Detects, re-plans from current position | G C R |
| 14 | Missed bus at stop (vehicle passed) | "Bus left", next departure and alternatives | G C R |
| 15 | Bus early by 2 min | Warns when slack shrinks; on-time definition respected | C R |
| 16 | Bus cancelled (trip removed from feed) | Cancellation notice, alternatives | C R |
| 17 | Feed down (realtime 500) | Falls back to schedule with clear label | R |
| 18 | Feed stale (timestamp 10 min old) | Marks data stale; no live badge | C R |
| 19 | Airport at night (LCA, 01:30) | Night options (Kapnos, night fare) or honest "no bus until 05:xx", taxi suggestion | C R |
| 20 | Airport arrival with delayed flight | Re-plans from landing time | C R |
| 21 | Tourist offline (airplane mode after load) | Cached timetables and saved trip usable; offline banner | O |
| 22 | Tourist offline, cold start | Shell loads from service worker or explains offline | O |
| 23 | Back online after offline | Refreshes live data, removes banner | O R |
| 24 | Greek UI, all tabs | No English strings left (Trip In Progress banner) | L |
| 25 | Greek search "Πλατεία Ελευθερίας" | Relevant results | R |
| 26 | Accentless Greek search | Same results as accented | R |
| 27 | Greeklish search "Plateia Eleftherias" | Relevant results | R |
| 28 | Misspelt place | Fuzzy top hit | R |
| 29 | Nonsense query | "No places found" empty state | R |
| 30 | Empty submit | Disabled or inline validation | - |
| 31 | Same origin and destination | Friendly message | R |
| 32 | Destination north of the Green Line | Route to crossing, naming policy respected | R |
| 33 | Destination unreachable by bus | Walk, bike, taxi options, honest message | R |
| 34 | Arrive by 08:30 | Latest departure that arrives on time | C R |
| 35 | Leave at 23:50 crossing midnight | Correct next-day service dates | C R |
| 36 | Sunday or holiday timetable | Uses correct calendar | C R |
| 37 | DST change (last Sunday of October) | Times correct across the change | C |
| 38 | Daylight-saving spring forward | No duplicate or missing departures | C |
| 39 | Step-free preference | Avoids non-accessible stops where known | R |
| 40 | Short walks preference | Caps walking distance | R |
| 41 | Shaded stops preference in summer | Ranks shaded stops | R |
| 42 | Scooter in middle of trip | Offers bus, scooter, bus chain when faster | R |
| 43 | Nextbike dock empty | Excludes or warns | R |
| 44 | Better stop across the road with more frequent line | Suggested with walk time | G R |
| 45 | Trip in progress, app backgrounded and resumed | Restores state | C |
| 46 | End trip | Clears banner on all tabs | - |
| 47 | Start second trip while one active | Asks to replace | - |
| 48 | Alight alert two stops before | Fires once at the right stop | G C R |
| 49 | Alight alert offline | Still fires from cached stop list | G O |
| 50 | Group link opened by a non-user | Read-only live view in browser | - |
| 51 | Group link after arrival | Expired message | C |
| 52 | Group with 10 members | Performance acceptable, no overlap | R |
| 53 | Share link preview (Open Graph) | Correct title and image in EN and EL | R |
| 54 | Deep link reload on every tab URL | Renders correct tab | - |
| 55 | Unknown route 404 | Branded 404 with Go home | - |
| 56 | Browser back from trip results | Returns to planner | - |
| 57 | Narrow phone 360 px | No overflow | V |
| 58 | Large text (200%) | Layout holds | V |
| 59 | Desktop 1440 px | Usable layout or declared mobile design | V |
| 60 | Keyboard-only navigation | All controls reachable with visible focus | - |
| 61 | Screen reader labels on icon buttons | Every icon button has a name | - |
| 62 | Colour contrast | WCAG AA on labels and tabs | - |
| 63 | Reduced motion | No essential animation | V |
| 64 | Dark mode system preference | Respects it or documents light only | V |
| 65 | Map tiles fail | Clear fallback, rest of page usable, retry works | R |
| 66 | Map tiles succeed | Map renders on all map pages | - |
| 67 | Pulse numbers | Show "as of HH:MM" | C R |
| 68 | Pulse editorial card past expiry | Hidden | C |
| 69 | Event night card | Dated, sourced | C R |
| 70 | Weather heavy rain | Leave-time buffer applied with reason | R |
| 71 | Open-Meteo down | No crash, no buffer | R |
| 72 | Pass: camera unavailable | Friendly message, manual entry | - |
| 73 | Pass: invalid card date | Validation message | - |
| 74 | Pass: 7 day pass row | Either buy path or no implied product | - |
| 75 | Saved home, no GPS | Next bus near home works | R |
| 76 | Remove saved home | Removed everywhere | - |
| 77 | Clear site data | App starts clean, no errors | - |
| 78 | Slow 3G | Skeletons, no layout jump, under 5 s to useful content | R |
| 79 | API returns malformed JSON | Error state, no white screen | R |
| 80 | Rate limited (429) | Back-off and message | R |
| 81 | Push permission denied | In-app alerts still work | - |
| 82 | Push received while on another tab | Opens the right trip | - |
| 83 | Clock skew on device (5 min fast) | Server time used for countdowns | C R |
| 84 | Timezone not Asia/Nicosia (tourist phone on UK time) | Shows Cyprus local times, labelled | C L |
| 85 | Long route names and Greek headsigns | No truncation of key info | V |
| 86 | Kapnos partner link | Opens Kapnos, labelled as leaving Aloya | - |
| 87 | Getting around Cyprus link | Labelled cross-domain or in-app | - |
| 88 | Service worker update | New version prompt, no stale shell | - |
| 89 | Manifest and install | Valid manifest, installable | - |
| 90 | Privacy: location never sent when sharing off | No location in network log | G R |
### 50.4 Live hands-on QA pass (31 Oct 2026, 19:34 EET, desktop browser about 1920 px, no sign-in)

| # | Issue | Severity |
|---|---|---|
| 1 | Map never loads on any page that embeds one (Now, trip results, trip guidance, Lines, Pulse, route, stop, airport); "Try again" does not recover. The code ships Esri raster tiles (src/lib/basemap.ts); root cause not confirmed from the UI | Critical |
| 2 | "Finding stops near you" stays as plain text when location is denied; reads as stuck | Medium |
| 3 | Fixed mobile column about 408 to 430 px on desktop, no responsive layout | Medium |
| 4 | /manifest.json returns the SPA 404 page; no install prompt seen | Medium |
| 5 | Greek mode leaves "Trip In Progress" and "End Trip" in English in the top banner | Medium |
| 6 | "Getting around Cyprus" silently leaves the app for aloya.cy with a separate cookie banner | Medium |
| 7 | Pulse headline numbers have no "as of" time | Low |
| 8 | "Busy lines we can't see" copy is unclear ("Almost no rider phones") | Low |
| 9 | "Matchnight in Larnaca" card has no date and no source | Low |
| 10 | Pass scanner shows raw "Camera unavailable. Requested device not found." | Low |
| 11 | Zero-result search shows no empty state | Low |
| 12 | Motion trip cards show no fare (only Kapnos does) | Low |
| 13 | "op N min" on stop pages is unexplained | Low |
| 14 | Pulse numbers change between loads with no live cue | Low |
| 15 | Likely WCAG AA contrast failures on small grey labels, radio outlines, inactive tabs | Low (Medium for EAA sales) |
| 16 | No dark mode or appearance setting | Low |
| 17 | Leave and Arrive by controls not exercised (untested) | Low |
| 18 | Browser Back from /trips stayed on /trips (needs controlled check) | Low |
| 19 | Trip in progress banner on every tab with no per-tab dismiss (design choice) | Low |
| 20 | Pass shows a 7 day personalised pass at EUR 33.40 with no way to buy | Low |
| 21 | Pulse highlight on Famagusta has no legend | Low |
| 22 | Direct sort pill not verified | Low |

Repo-level findings (from reading redesign-roam): Esri imagery not licensed for production (basemap.ts comment); LICENSE, README and COMMERCIAL.md say proprietary while the repo was made public and MIT licensed in Oct 2026 (from memory notes; confirm); iOS ATT prompt declared in mobile/app.json; leave-time adjuster ignores rider position and vehicle position.

What works well: Greek and fuzzy search; dense trip cards with "Why this option"; live trip mode with countdown and turn-by-turn walking; watch together with no account; graceful location denial with typed fallback and a saved home that powers "Next bus near here"; transparent reliability and probability copy; EN and EL switch across the tab bar; branded 404; visible keyboard focus; End trip clears state.

## Part E summary: top 10 improvements

1. Fix the map on every page and move to a production-licensed basemap (Critical, S).
2. Build the smart alert engine: slack = vehicle ETA minus walking time from the live position, with a per-leg state machine; no "at stop" alerts until near the stop (S to M, very high impact; answers Samuel's core complaint).
3. Ship the Expo native app with background region monitoring of the next stops, a Live Activity and silent push (M).
4. Show one freshness and confidence badge on every ETA and alert (S).
5. GO-style opt-in crowdsourced vehicle positions for lines with poor feed coverage (M).
6. Arrive-together group planner with auto-expiring, route-snapped sharing and a child-safe "arrived" mode under the Cyprus age-14 consent rule (M).
7. Event layer: dated, sourced event cards; special services from operator PDFs as temporary trips; park and ride first (M).
8. Business model: free rider app; B2G trust and accuracy dashboard; employer-funded commuter programmes and rewards for real mode change; no raw data sales (M to L).
9. Compliance pack: WCAG 2.2 AA and an accessibility statement, DPIA, remove ATT, unify the licence, Green Line naming policy (S to M).
10. PWA hygiene: valid manifest, Declarative Web Push, Greek strings complete, empty states, "as of" stamps, fares on every card (S).

## Top QA issues
1. Critical: map does not load anywhere.
2. Medium: missing manifest and install path.
3. Medium: stuck-looking "Finding stops near you" when location is denied.
4. Medium: untranslated Greek strings in the trip banner.
5. Medium: silent cross-domain jump to aloya.cy.
6. Medium: no desktop layout.
7. Repo: unlicensed Esri imagery in production code; ATT prompt; licence mismatch.



# Part F (bonus): Can Aloya reduce car dependence in Cyprus?

Written 31 October 2026. Every number below carries its source in the same line or in the source list at the end of each section. Where a figure could not be verified, the text says so. British spelling, no em or en dashes.

## The short answer

Aloya's vision (one smart layer over every bus, bike, scooter, taxi and ride in Cyprus, re-optimising at every phase of a trip) can make public transport easier to use, more trusted and better connected. The international evidence says that on its own this moves ridership by low single-digit percentages and nudges car use down modestly among people who engage. It does not, by itself, break car dependence in a country where 85% of adults never use public transport (Eurostat, 2024 data). Breaking that needs frequency, bus priority, parking pricing, land use and employer action, which the state, municipalities, operators and employers control. Aloya's biggest lever is therefore not the app alone but what the app makes visible: verified data on where the bus system fails, turned into advocacy, government insight and employer programmes. The chapter "The honest car-dependence verdict", after the QA programme, gives the full verdict, the comparative evidence gathered for sections F2 and F3, and how Aloya can contribute. (The version of Part F on the research50 branch contains this short answer and section F1; sections F2 to F7 were not written into it.)

## F1. Car dependence in Cyprus: the evidence

### F1.1 Headline indicators

| Indicator | Value | Source |
|---|---|---|
| Passenger cars per 1,000 inhabitants | 670 in 2025 (provisional), up from 659 in 2024, 647 in 2023 and 305 in 1990 | Eurostat road_eqs_carhab; Eurostat Statistics Explained "Passenger cars in the EU" (31 Jul 2026) |
| EU rank | Among the top three in the EU. Eurostat's text names Italy first (709) "followed by Cyprus (670)", while also listing Finland at 671 and Luxembourg at 668 | Eurostat Statistics Explained (31 Jul 2026) |
| EU average | 0.55 cars per inhabitant in 2023 (Cyprus 0.65 that year) | Eurostat news, 21 May 2025 |
| Adults who never use public transport | 85% in 2024, the highest in the EU (EU 50.6%; Luxembourg 15.7%) | Eurostat news, 11 Mar 2026 (dataset ilc_atst01) |
| Licensed saloon cars | 625,625; total licensed vehicles 819,081; rental cars 27,073; taxis 1,780; public buses 2,765 (latest year in the table) | CyStat, Cyprus in Figures 2025 |
| Public transport passenger trips, whole island | 28.1 million in 2025, up 64.5% on 2022 | Ministry of Transport (MTCW) 2025 report, gov.cy, 16 Mar 2026 |
| Cyprus Public Transport (Nicosia and Larnaca) | 9,548,978 rides in Nicosia and 2,626,818 in Larnaca in 2025; over one million a month since May 2024 | CPT LinkedIn post, 17 Jan 2026; CPT at the Pame app launch, Sep 2026 |

The trend in ridership is genuinely upward, but it starts from a very low base, and car ownership is still rising faster than almost anywhere in the EU.

### F1.2 Modal share of public transport

There is no single national modal split survey. The best available figures:

- **Greater Nicosia:** public transport about 3% of trips and cycling 1.5% to 2% (Nicosia Interreg Action Plan, 2019; EIB/JASPERS essay, June 2022). In September 2026 the Mayor of Nicosia, Charalambos Prountzos, said bus use "accounts for no more than four or five per cent of the modal split", after more than €1 billion spent on the bus system since 2010 (Cyprus Mail, 29 Sep 2026; Politis, 29 Sep 2026).
- **Larnaca:** the SUMP household survey found car or van driver 81%, car passenger 8%, foot 7%, bus 2%, bicycle 2% (Larnaca SUMP Final Report, Public Works Department, May 2021). The same report notes that the national energy and climate plan implies public transport should reach 13% of trips and walking 12%.
- **Larnaca, EU SUM living lab (indicative only):** a project survey reports car 85.5% and bus 8.7% of trips in 2023, and car 80% and bus 13% in March 2026. Some series on the dashboard add up to more than 100%, so treat it as a sample survey, not an official split. The same dashboard reports the door-to-door time ratio of public transport to car improving from 2.9 times to 1.8 times between September 2023 and March 2026 (SUM Open Data Platform, Larnaca living lab).
- **Limassol:** 92.1% car, 1.5% public transport, 5.8% walking, 0.7% cycling, with about 14 km of segregated cycle lanes in 2018 (study of Southern European island cycling cities, University of Malta repository, citing Demetriou 2019). The Limassol mayor said in 2022 that private vehicle use "exceeds 92%" (Limassol Chamber, Oct 2022).

### F1.3 Congestion

- TomTom Traffic Index 2025, Nicosia: average congestion 54.3% (up 1.5 points on 2024), 118 hours lost in rush hour per driver, and a morning rush-hour 10 km trip taking 33 min 42 s at 17.8 km/h (tomtom.com/traffic-index/city/nicosia). Nicosia is the only Cypriot city in the index. Note that the previous edition reported 41% and 99 hours for 2024 (Knews, 3 Dec 2025); TomTom revised its method between editions, so the two years should not be compared directly.
- The new Transport Minister, Evie Tsolaki, called congestion "a serious problem, particularly in Nicosia and Limassol", and linked Limassol's to growth in Agia Fyla, Agios Athanasios, Mesa Geitonia and Germasogeia (Sigmalive, 14 Oct 2026).
- The September school return visibly worsens traffic: primary classes run 7:45 to 13:05, and parents add afternoon trips to private lessons (Knews, 1 Sep 2026).

### F1.4 Emissions

- Transport is the largest source of the emissions Cyprus must cut under the EU Effort Sharing Regulation: 46%, mainly road transport (Cyprus final updated NECP 2021 to 2030, 2024).
- Across all sectors, transport was 21.2% of Cyprus's greenhouse gas emissions in 2023 (European Parliament EPRS briefing, 2025).
- Road transport emitted about 2,046 kt CO2-equivalent in 2021, of which petrol cars and light trucks 967 kt and diesel light trucks 804 kt; heavy trucks and buses together 252 kt (Cyprus Institute, carbon pricing draft, May 2024).
- The 2025 electric vehicle scheme gave 2,429 grants worth €21.5 million, registering 1,820 new EVs and scrapping 609 old cars (MTCW 2025 report). EVs cut tailpipe emissions but not congestion or parking demand.

### F1.5 Parking

- The Nicosia SUMP proposes **controlled parking in the commercial and historic centre** alongside six 30 km/h zones, ten traffic-calmed neighbourhoods, bus priority, a cycle network and urban freight management (sustainablemobility.cy, SUMP Nicosia Final Action Plan 2025).
- Example of current pricing: Nicosia's Old GSP car park charges nothing for 30 minutes, €2 for one hour, €3 for three, €6 for ten, with €60 monthly passes for local workers (Knews, 4 Jul 2025). Prices this low make the car competitive with a €2 bus fare.
- I found no city-wide workplace parking charge, parking cash-out rule or parking levy in Cyprus. Workplace parking is generally free at the point of use; this is an evidence gap to fill, not a verified fact.

### F1.6 The bus system and its contracts

- **Who runs what:** Cyprus Public Transport (CPT) runs Nicosia and Larnaca since July 2020; EMEL runs Limassol; OSYPA Paphos; OSEA free Famagusta; Intercity runs between towns; PEAL serves Tillyria. In 2023 the state paid about €75 million to the seven contractors, including €30.8 million to Nicosia and €14.2 million to Limassol (FastForward, 15 Jul 2024, citing the minister's answer to parliament).
- **Contract performance problems:** the Paphos concessionaire had bought only 32 of 72 required new buses, with penalties of €4,512,967 by July (Audit Office, reported by Cyprus Inform). The Audit Office's Special Report 29/2026 on Nicosia (published 14 Oct 2026) found that 63% of 110 undercover staff would not use the bus again; stop locations online were off by about 85 m and 135 m in examples; abolished stops still appeared in digital systems; 55% of stops had no route information, only 13% had real-time displays, 32% had no shelter; some routes ran only every one to two hours; six of nine test trips needed two buses; bank cards were not accepted; and for car owners the bus was not always cheaper (Politis, 14 Oct 2026). CPT disputed the sample (almost all were car owners) and cited its own 79.7% satisfaction survey (Cyprus Inform, 15 Oct 2026; Reporter, 15 Sep 2026).
- **2024 to 2026 changes:** €74 million contract for 300 smart stops with real-time displays (Cyprus Mail, 20 Jun 2024); express and park-and-ride routes; Google Maps bus routing since May 2026 (Sigmalive, 14 Oct 2026); revamped Pame app (CPT, 16 Sep 2026); fares raised on 3 August 2026 (cash €2.70, Motion card €2.00, night €4.70 and €3.50) while school students pay €5 a month or €30 a year with a state subsidy of €17 or €190 (Cyprus Mail, 20 Jul 2026; Knews, 29 Aug 2025).
- **Driver shortage:** CPT announced the suspension of the Pame Express park-and-ride from 23 March 2026 for lack of drivers; it was kept running after a ministry meeting, with 500 to 600 daily users (Cyprus Mail, 11, 15 and 26 Mar 2026). Barriers cited: about 18 months and over €3,000 to obtain a professional licence, and a Greek-language requirement (Cyprus Mail, 11 Mar and 7 Aug 2026). The operators' association asked to lower the minimum age from 21 to 18 for routes under 50 km (Cyprus Mail, 24 Jan 2025). The driver shortage also blocked earlier school-time changes and on-demand services (Cyprus Mail, 8 Jan 2025; AlphaNews, 2 Dec 2024).
- **The next contracts:** the Nicosia bus contract expires in 2030 and consultations on the new specifications have begun (Philenews, 29 Sep 2026); the mayor referred to new contracts for 2030 to 2040 (Sigmalive, 29 Sep 2026). **This is the single most important window for anyone who wants to change how buses perform.** I did not find a published draft of the new specifications.
- **New minister's stance:** Tsolaki accepted that some journey times are excessive and promised route reviews, more frequent services where demand requires, better use of bus lanes ("These lanes need to be filled with buses"), a public information campaign and possibly moving public services out of city centres (Sigmalive, 14 Oct 2026).

### F1.7 SUMPs, bus lanes, park and ride, tram and BRT

- **Nicosia SUMP:** final action plan 2025 (measures listed in F1.5). An ERDF project worth €5 million (THALEIA 2021 to 2027) is building bus lanes and signal priority on Limassol/Makariou Avenue and Strovolos/Severis Avenue, the corridors reserved for a future tram (sustainablemobility.cy).
- **Limassol and Larnaca SUMPs:** the Recovery and Resilience Plan milestone was at least 40 km of sustainable routes, including 29 km of cycleways and 11 km of bus lanes, and four park-and-ride or similar sites, by Q1 2026 (Resilience Plan extract, sustainablemobility.cy). The Limassol SUMP's ten-year budget exceeds €390 million (Limassol Chamber, 2022). In July 2026 MPs called for a review of Limassol SUMP works, saying some had worsened traffic and safety (Cyprus Mail, 9 Jul 2026), and Public Works agreed only limited changes before the RRF deadline of 21 July 2026 (Politis, 6 Jul 2026). The political backlash matters: road-space reallocation is contested.
- **Park and ride:** Nicosia's GSP stadium site opened in September 2023 with a 1.8 km bus lane from the Strovolos roundabout to the Kalispera lights; the first test trip Alambra to Solomou took 40 minutes, about 20 minutes faster than before (Cyprus Mail, 4 Sep 2023). It carried 80,000 journeys in 2023, removing 350 to 400 cars (Cyprus Mail, 8 Apr 2024), but averaged only 350 passengers a day and removed 200 to 250 of the 4,000 vehicles entering at peak, at about €800,000 cost (Philenews, 20 Aug 2024). Pame Express carried 99,419 rides in 2025 (CPT). Larnaca tendered Aradippou (67 spaces) and Kalo Chorio (195) (EU Urban Mobility Observatory, Aug 2024). CPT's chairman says the motorway bus lane shows buses can beat cars at peak and asks for more priority (CBN, 27 Oct 2026).
- **Tram:** discussed for 26 years (Politis, 18 Oct 2026). A 2015 study found it not viable; the ministry will update it after the Nicosia and Limassol mayors jointly asked (Sigmalive, 14 Oct 2026). The ministry's department believes the EIB would not fund it because bus use is too low (Philenews, 29 Sep 2026), echoing the EIB's own 2022 advice to "get on the bus first". Prountzos proposes about 20 km at €25 to €30 million per km, so €500 to €600 million (Sigmalive, 29 Sep 2026).
- **BRT:** I found no formally designated bus rapid transit scheme in Cyprus. The tram-axis bus lanes are the closest thing.

### F1.8 What F1 means for Aloya

Cyprus is a textbook car-dependent system: very high ownership, cheap and plentiful parking, sprawling suburbs, a bus network that many find slow, infrequent or confusing, and a labour shortage capping service growth. Ridership is rising, but from 2% to 5% shares. Any honest claim about Aloya must start there.


# Roadmap: every recommendation, merged {#roadmap}

This table merges the top recommendations of Parts A to F into one list and removes overlaps (for example, the smart alert engine appears in Parts A and E, and the licence fix in Parts C and E). Each row names the layers where the detail lives. Effort and impact are the parts' own ratings; where two parts rated the same item differently, both are shown.

- **Now:** small effort (S) with high impact, or a deadline before December 2026. These are mostly fixes to things that are wrong today.
- **Next:** medium effort (M) with high or very high impact, building the core of the smart companion and the platform.
- **Later:** large effort (L), or work that depends on partners, funding or the earlier steps.

## Now

| # | Action | Layers | Effort | Impact |
|---|---|---|---|---|
| N1 | Hotfix the home-start alert bug: no clock-only "Board now", "Pick up the pace" or "Still on BUS X?"; no GPS-less auto-advance or "at-stop" alerts on transfer walks and waits; keep alerts_sent across re-uploads; one tag scheme | 1, 4, 7b | S | Very high |
| N2 | Per-operator fares with effective dates (EMEL €2.50 cash from 5 Nov 2026), intercity €4 to €10 from the feed, official taxi tariff, 60-minute transfer copy | 24, 37 | S | High |
| N3 | Nightly feed health: MobilityData validator, real service-date horizon per feed (EMEL ends 6 Nov 2026), ingest after Motion's 05:31 publish, fall back to "scheduled times" when live data degrades; CI validation of each GTFS release | 15, 34 | S to M | High |
| N4 | Turn off the JCC password proxy, public wallet endpoint first; manual balance mode; label anything left as unofficial | 24 | S | Very high |
| N5 | Settle the licence: code proprietary, open data outputs under CC BY 4.0, API under written terms; make LICENSE, README and COMMERCIAL.md agree | 25, 48 | S | Very high |
| N6 | API keys, per-key and per-IP quotas, restricted CORS on plan, places-autocomplete, walk-directions, tts, stt, parse-trip-intent, wallet/ocr, kapnos and wallet; budget caps on Mapbox, ElevenLabs, OpenAI and Gemini | 25 | M | Very high |
| N7 | Fix the map on every page and move to a production-licensed basemap; keep attribution | 39, 48, 50 | S | Critical |
| N8 | Remove or revive the dead crowding pipeline (route_load_estimates) | 32 | S | Honesty, less dead code |
| N9 | Kapnos: ask permission, a referral deal or GTFS; meanwhile cache, stop the public proxy and stop showing seat counts | 23 | S | High |
| N10 | Bolt: join the Bolt Business referral scheme; relabel the Bolt button until Bolt issues a partner id | 23 | S | Medium |
| N11 | Fix the GBFS merge (start_date, purchase_url, license_url, operator line), switch Nextbike to its official GBFS, list in the Mobility Database | 15, 22, 26 | S | High |
| N12 | Ask Electra and Bolt for GBFS, citing the MMTIS date of 1 Dec 2026; add RideNow and toGO deep links | 22, 27 | S to M | High |
| N13 | One freshness and confidence badge on every ETA and alert; ghost and stale rules applied to all alerts; every time labelled live, estimated or timetable | 5, 41 | S then M | High to very high |
| N14 | Fix the airport flights pulse (OpenSky calls return only previous-day data) by moving to a FIDS source | 18 | S | High |
| N15 | AI assistant: Asia/Nicosia time rules for the target date, Groq and Workers AI ahead of Gemini, rate-limit and cache the public parse endpoint | 33 | S | High |
| N16 | Get-off alerts by stop count on the server, only after the rider is confirmed on board, with missed-stop recovery | 7 | S | High |
| N17 | Personal walking pace and mobility profile; four hard-coded 1.35 m/s constants become one shared default | 2, 9 | S | High |
| N18 | PWA hygiene: valid manifest, Declarative Web Push, Greek strings complete, empty states, "as of" stamps, fares on every card | 40, 49, 50 | S | Medium to high |
| N19 | Greek names from translations.txt already in the feeds; correct `<html lang>` per locale; merge the two i18n systems | 40 | S | High |
| N20 | Compliance quick wins: remove the iOS ATT prompt unless truly needed; accessibility statement; DPIA started | 10, 48, 49 | S | Medium to high |

## Next

| # | Action | Layers | Effort | Impact |
|---|---|---|---|---|
| X1 | Rider state (unknown, walking, at stop, on board, missed) from the phone, never raw coordinates; "Are you at the stop yet?" when unknown | 1, 10 | M | Very high |
| X2 | One leave decision shared by phone and server: walking time at the rider's pace against the bus's corrected arrival, states relax, get ready, leave now, run, you'll miss it, each with the next option | 1, 41 | M | Very high |
| X3 | One alert ledger and four tiers: caps, update in place, TTL on every push, per-tier user control | 4 | M | High |
| X4 | "Go to a better stop" contrast card: frequency-aware candidates, walk, cycle, scoot or ride access, generalised cost | 12 | S to M | Very high |
| X5 | Bike, scooter and ride legs inside itineraries anywhere in the trip, MCR-style micromobility phase in RAPTOR, Nextbike GBFS and the 255 CyNAP Bolt zones | 11, 22 | M | Very high |
| X6 | Connection probability and risk-adjusted ranking from Aloya's own arrival_truth: P(make it) per change, "9 in 10 by" times, early warnings | 13, 16 | M | Very high |
| X7 | Routine autopilot: learn commutes on the device, pre-plan and watch overnight, one well-timed leave-now push | 20 | M | Very high |
| X8 | Native companion: fix the Expo build, background location only during trips, region monitoring of next stops, Live Activity and Android Live Update, silent push; Wake Lock on the web meanwhile | 3, 8, 49 | M to L | High |
| X9 | Flight-aware trips: flight-number based leave-by and arrival planning | 18 | M | High |
| X10 | MOTIS 2 as a second routing engine in shadow mode, with Aloya's ranking on top | 14 | M | High |
| X11 | Park and ride as a real leg: 9 official P&R sites and 651 car parks from CyNAP, offered only to riders who would otherwise drive, with the money comparison | 17 | S to M | High for car-dependent commuters |
| X12 | Night and rural safety net: last-bus-home reminders, night-safe walking, wait-or-taxi comparison, village day cards, first-mile bike or taxi, DRT legs once agreed | 19 | S to M | High |
| X13 | Safety sheet (112, 1460, 1440), share-live-trip on the web with auto-end and "arrived safely", discreet incident reports | 38 | S to M | High |
| X14 | Heat-aware planning: sun-walk and unsheltered-wait penalty at feels-like 35°C or more, Met Department stations and MeteoAlarm CAP, Open-Meteo licence fixed | 36 | S to M | High |
| X15 | Offline trip planning: raptor-core in a Web Worker on cached shards, offline vector basemap pack, tourist pack | 39 | M | High |
| X16 | Crowding from riders: one-tap seats, standing or packed report; parse GTFS-RT occupancy when Motion adds it; GO-style opt-in crowdsourced vehicle positions for lines with poor coverage | 32, 41 | S to M, M | Medium to high |
| X17 | More languages: Russian, Arabic, Hebrew and Turkish with RTL | 40 | M per language | Medium |
| X18 | Open data intake (CyNAP bus lanes, cycleways, crossings, racks, Waze alerts, Mapillary street furniture) and a /data attribution page; offer help with the December 2026 MMTIS deadlines | 30, 31 | S to M | Medium |
| X19 | Compliance pack: WCAG 2.2 AA, DPIA completed, Play and App Store background location disclosures, Green Line naming policy | 9, 10, 44, 48, 49 | S to M | High |
| X20 | Publish and document the MCP server and deep links; embeddable departures widget | 25 | S to M | Medium to high |
| X21 | UCY shuttles as supplementary GTFS; hotel and campus departures widget; "just landed" airport pages | 28, 29 | M | High |
| X22 | Arrive-together group planner with auto-expiring, route-snapped sharing and a child-safe "arrived" mode under the Cyprus age-14 consent rule | 43, 45 | M | Medium to high |
| X23 | Event layer: dated, sourced event cards; special services from operator PDFs as temporary trips; park and ride first | 46 | M | Medium |
| X24 | Operator report card from the backtest, reliability and feed-delta data; RIF "AI in Government" bid; bus delay at signals for the Public Works Department | 35 | M | High |
| X25 | Prepare the EIT Strategic Innovation bid for 28 Jan 2027 with a Cyprus city | 30 | M | Very high |

## Later

| # | Action | Layers | Effort | Impact |
|---|---|---|---|---|
| L1 | Continuous en-route re-optimisation: a server "envelope" of connections that could still beat the plan, a small Connection Scan on the phone at every GTFS-RT update, phase by phase across transfers, with micromobility in the middle | 7b, 11, 13, 16 | L | Very high |
| L2 | Server push replanning: detect a miss anywhere, re-plan on the two IJCAI triggers, one-tap replan from the notification, CPT detour announcements ingested | 6 | L | High |
| L3 | Tool-calling AI companion in which every number comes from Aloya's own tools | 33 | L | High |
| L4 | Read-only JCC partner access through the Ministry during the account-based ticketing rollout | 24 | M | Very high |
| L5 | Business model: free rider app; B2G trust and accuracy dashboard; employer-funded commuter programmes and rewards for real mode change; earn on referrals and B2B, not ticket margin; no raw data sales | 21, 29, 35, 42, 47 | M to L | High |
| L6 | Compete on trust (ETA confidence, honest fallbacks) against Google Maps, Moovit and the local apps | 26 | L | Very high |
| L7 | Car-dependence contribution: turn verified data on where the bus system fails into advocacy, government insight and employer programmes, timed for the 2030 Nicosia bus contract specifications (synthesis of Part F) | Part F, 29, 35 | L | High |


# The QA programme {#qa-programme}

Layer 50 holds the full Playwright harness, the 90-scenario catalogue and the results of the live hands-on pass of 31 Oct 2026. This chapter turns them into a programme: what to test, in which order, how often, and what blocks a release. Where this chapter proposes process rather than reporting a finding, it says so.

## What the live pass found

The live pass (31 Oct 2026, 19:34 EET, desktop browser about 1920 px, no sign-in, on aloya-app.samueladuberekorang.workers.dev) logged 22 issues: one critical, five medium and sixteen low.

- **Critical:** the map never loads on any page that embeds one, and "Try again" does not recover.
- **Medium:** "Finding stops near you" reads as stuck when location is denied; a fixed mobile column of about 408 to 430 px on desktop; /manifest.json returns the app's 404 page, so there is no install path; Greek mode leaves "Trip In Progress" and "End Trip" in English; "Getting around Cyprus" silently leaves for aloya.cy with a separate cookie banner.
- **Repo-level:** Esri imagery not licensed for production; an iOS ATT prompt declared in mobile/app.json; the licence mismatch; the leave-time adjuster ignores rider and vehicle position.
- **What works well:** Greek and fuzzy search, dense trip cards with "Why this option", live trip mode with countdown and walking directions, watching together with no account, and a typed fallback when location is denied.

## The harness

Playwright with TypeScript, as set out in section 50.2: geolocation through `context.setGeolocation`, a frozen clock through `page.clock.install` before navigation, realtime and planner responses mocked with `page.route`, offline through `context.setOffline`, and four projects (chromium-mobile, webkit-mobile, chromium-desktop and an el-GR locale), all with timezone Asia/Nicosia. Two points matter for reliability:

- Clock fixtures must be real instants. The core smart-alert example now freezes the clock at `Date.UTC(2026, 10, 2, 5, 50)`, which is Monday 2 Nov 2026 at 07:50 in Cyprus (UTC+2 after the 25 Oct clock change).
- `setOffline` cuts the service worker only in Chromium, so offline tests for WebKit and Firefox should also drop connections at the test server.

## Test suites from the catalogue

The 90 scenarios in section 50.3 group into fourteen suites. Numbers refer to the catalogue.

| Suite | Scenarios | Covers |
|---|---|---|
| Smart alerts and timing | 1 to 6, 11 to 16, 45 to 49 | The home-start case, leave countdowns, ghost buses, late, early, cancelled and missed buses, missed transfers, alight alerts, backgrounded trips |
| Location | 7 to 10, 75, 76, 90 | Denied, timed-out, inaccurate and jumping GPS; saved home; no location sent when sharing is off |
| Live data and feeds | 17, 18, 67, 68, 83 | Feed down, feed stale, "as of" stamps, expired editorial cards, device clock skew |
| Time edge cases | 34 to 38, 84 | Arrive by, crossing midnight, holidays, both clock changes, a tourist phone on another time zone |
| Airport, tourist and offline | 19 to 23 | Night arrivals, delayed flights, offline after load, cold start offline, reconnecting |
| Language and search | 24 to 31, 85 | Greek UI, Greek, accentless and Greeklish search, misspellings, empty and nonsense queries, long Greek headsigns |
| Routing choices | 32, 33, 39 to 44 | North of the Green Line, unreachable by bus, step-free, short walks, shade, scooter mid-trip, empty Nextbike dock, the better stop |
| Groups and sharing | 50 to 53 | Group links for non-users, expiry, ten members, link previews |
| Navigation and PWA | 54 to 56, 77, 81, 82, 86 to 89 | Deep links, 404, back button, clearing data, push permission and routing, partner and cross-domain links, service worker updates, manifest |
| Layout and accessibility | 57 to 64 | 360 px, 200% text, desktop, keyboard, screen reader names, contrast, reduced motion, dark mode |
| Map | 65, 66 | Tiles failing and tiles loading on every map page |
| Weather and events | 69 to 71 | Event cards, rain buffers, Open-Meteo down |
| Pass | 72 to 74 | Camera unavailable, invalid card dates, the 7-day pass row |
| Resilience | 78 to 80 | Slow 3G, malformed JSON, rate limiting |

## Order of work (proposed)

1. **Regression tests for the urgent fixes first.** Scenarios 1 to 3 (home start), 65 and 66 (map), 24 (Greek banner), 89 (manifest) and 7 (stuck loader) cover live-pass issues directly. The fare fix needs a unit test per operator, as Layer 37 recommends, and the feed horizon needs the nightly check from Layer 34. A test that public API routes refuse calls without a key belongs with the Layer 25 fix (this book's proposal).
2. **Then the smart-alert suite**, because it encodes Samuel's core complaint and protects the rider state and leave decision as they are built (Layers 1, 4, 7, 7b).
3. **Then routing, time edge cases and offline**, which guard the Part B and Part D work.
4. **Then accessibility and layout**, which also prepare the WCAG 2.2 AA statement and the European Accessibility Act position (Layers 9 and 48).

## Cadence and release gates (proposed)

- **Every pull request:** a smoke set of the urgent-fix regressions and the smart-alert suite on chromium-mobile.
- **Nightly:** the full catalogue on all four projects, plus the feed health job against the day's GTFS release.
- **After each GTFS release from Motion:** the time edge cases and fares against the new feeds.
- **Release gate:** no open Critical issue; every scenario tied to an urgent fix passes; a failing Medium issue needs a written reason to ship.
- **Hands-on pass:** repeat the live pass on a real phone in Greek and English after each major release, since some behaviour (background alerts, Live Activities, install) cannot be fully automated.


# The honest car-dependence verdict {#verdict}

## The verdict

Aloya's vision, one smart layer over every bus, bike, scooter, taxi and ride in Cyprus that re-optimises at every phase of a trip, can make public transport easier to use, more trusted and better connected. On its own it will not break car dependence. The international evidence says information and app measures move ridership by low single-digit percentages and nudge car use down modestly among the people who engage. Cyprus starts from one of the hardest positions in Europe: 670 passenger cars per 1,000 inhabitants in 2025 (provisional), 85% of adults who never use public transport (the highest share in the EU), public transport at about 3% to 5% of trips in Nicosia and about 1.5% in Limassol, cheap parking, sprawl and a driver shortage that caps service growth (Part F, section F1).

What breaks car dependence elsewhere is frequency, bus priority, parking pricing, land use and employer action. In Cyprus those are controlled by the state, municipalities, operators and employers, not by an app. Aloya's biggest lever is therefore not the app alone but what the app makes visible: verified data on where the bus system fails, turned into advocacy, government insight and employer programmes.

## What the evidence from elsewhere says

The evidence below was gathered for Part F (sections F2 and F3) and is recorded in the Part F research notes (part-f-notes.md on the research50 branch). Sources are as recorded in those notes and were not re-opened for this book; the comparative sections F2 to F7 were not written into part-f.md itself.

**Apps and MaaS (F2 evidence).**

- **Whim, Helsinki:** Whim users' public transport share was 73% (normalised) against 48% for Helsinki residents with similar demographics (Ramboll "Whimpact", 2019, commissioned by MaaS Global, 2018 data, about 70,000 registered users). The University of Sydney's ITLS criticised the study for self-selection (30 Apr 2019). The "38% of daily car trips replaceable" figure is an estimate. MaaS Global went bankrupt in March 2024, with about 10,000 monthly active users in Helsinki and 2022 losses of €9.3 million on turnover of €3.8 million (Traffic Technology Today, 21 Mar 2024).
- **UbiGo, Gothenburg** (Nov 2013 to Apr 2014, 195 users in 83 households): private car use fell 50% and car sharing rose 200% in travel diaries, but recruitment was targeted and the project compensated participants for not using their cars; the service ended for business-model reasons (Sochor et al., Transportation, 2018).
- **SMILE, Vienna** (2014 to 2015, about 1,000 users, 80% male): 48% increased public transport use, 21% reduced private car use.
- **Jelbi, Berlin** (BVG whitepaper, July 2025): about 350 stations, 60,000 vehicles and 1.1 million downloads. At pilot hubs car use fell from 46% to 37% (Biesdorf) and from 36% to 28% (Adlershof) between 2021 and 2024 in BVG's own uncontrolled surveys; 33% of heavy sharing users said they would give up a car against 14% of non-users; a typical station costs about €25,000 against €700,000 for 50 garage spaces.
- **Real-time information:** NYC Bus Time added a median 1.7% in ridership (about 118 rides per route per weekday); Chicago Bus Tracker 1.8% to 2.2%; Seattle's OneBusAway users perceived their wait as equal to the actual wait, and 91% reported waiting less.
- **Soft measures:** a meta-analysis of 41 controlled studies found a 7% reduction in car modal share (Semenescu et al., 2020); UK personalised travel planning in eight areas cut car driver trips by 11% on average; the UK "Smarter Choices" work put the national potential at about 11% of traffic, up to 21% at urban peaks, best combined with hard measures. Hensher et al. (2024) found very limited evidence that MaaS has achieved its societal objectives, and the ITF/OECD expects little direct substitution of cars by MaaS early on.

**Hard measures (F3 evidence).**

- **Free fares:** Tallinn (2013) saw public transport use rise 14% within a year, but only about 1.2% is attributable to free fares once supply is controlled for; the rest came with priority lanes and frequency. In Luxembourg (2020), daily car use fell from 34.5% to 29.9% between 2020 and 2023 surveys (not causal), and of car-only users 54.7% stayed car-only; the LISER brief concludes push measures such as parking management are needed. In Dunkirk (2018), free fares came with a network redesign and 48% of new users had switched from the car.
- **Parking cash-out:** Shoup (1997), eight firms and 1,694 employees: solo driving fell 17% (share from 76% to 63%) and transit use rose 50%. Paying for workplace parking reduces the odds of driving by 11% to 30% (Christiansen et al., 2017).
- **Fares and frequency:** bus fare elasticity is about minus 0.4 in the short run and about minus 1.0 in the long run; service elasticity is about 0.4, with headway most sensitive where service was hourly or half-hourly before (TRL593; TCRP 95). Many Cyprus lines are exactly that infrequent.
- **Road safety** (context, not a mode-shift result): Cyprus had 45 road deaths per million in 2025, 10% more than 2024, against an EU average of 43 (European Commission, reported 27 Oct 2026).

## What else Cyprus needs

From Part F section F1 and the evidence above:

- **Frequency and priority:** more frequent buses where demand requires, route reviews where journey times are excessive, and bus lanes that are actually used. The minister's own words: "These lanes need to be filled with buses" (Sigmalive, 14 Oct 2026).
- **Parking:** controlled parking in the Nicosia centre is in the SUMP; current prices (Old GSP: free for 30 minutes, €2 for an hour) keep the car competitive with a €2 bus fare. No city-wide workplace parking charge or cash-out rule was found.
- **Drivers:** the professional licence takes about 18 months and over €3,000; the driver shortage has already suspended or capped services.
- **Contracts:** the Nicosia bus contract expires in 2030 and consultations on the new specifications have begun. This is the single most important window for anyone who wants buses to perform better.
- **Land use and employers:** relocating public services, school-run traffic and free workplace parking all sit outside transport operations.

## How Aloya can contribute

These are the parts' own recommendations that bear most directly on mode shift:

1. **Make the bus trustworthy and easy** (Parts A, B and D): honest ETAs, the smart leave decision, the better stop, micromobility anywhere in the trip and transfer protection. This is the low single-digit effect, and it is worth having.
2. **Show the real comparison** (Layer 37): one card per trip with bus, walk, bike or scooter, taxi and car, each with door-to-door time, cost and carbon.
3. **Target the people who can switch** (Layer 17): park and ride offered only to riders who would otherwise drive the whole way.
4. **Work through employers and universities** (Layers 29, 42 and 47): commute programmes, employer-funded rewards for real mode change, and Bolt Business referrals, where the parking cash-out evidence is strongest.
5. **Be the evidence engine** (Layers 34 and 35): turn Aloya's backtest, reliability and feed data into an operator report card and B2G insight, and bring it to the 2030 contract consultations, the SUMP reviews and the MMTIS work.

**Bottom line.** Aloya can help more people use public transport, and it can become the most credible source of evidence on why Cypriots do not. It cannot replace frequency, priority and parking policy. Claiming more than that would weaken the case; claiming exactly that, with the data to back it, is Aloya's strongest position.


# Sources {#sources}

One deduplicated list of every source cited in Parts A to F, in order of first appearance. Each entry shows the layers (L) or Part F sections that cite it. Bracketed numbers in Part B point to this list. "Code:" entries refer to repo programmeradu/aloyacy-8f3d9cd7, branch redesign-roam, at the commits named at the start of each part.

<div class="srclist">

1. <https://help.transitapp.com/article/549-how-to-use-go> <span class="cite">(L1, L3, L4, L7, L8)</span>
2. <https://help.transitapp.com/article/93-how-to-use-transit> <span class="cite">(L1, L10)</span>
3. <https://blog.transitapp.com/new-zealand-finally-gets-transit-b7b9bf4c50ef/> <span class="cite">(L1, L10)</span>
4. <https://scmetro.org/wp-content/uploads/2026/03/DIGITAL-Transit101-Booklet-2026.pdf> <span class="cite">(L1, L6)</span>
5. <https://citymapper.com/news/517/go-your-personal-trip-assistant> <span class="cite">(L1, L4, L7)</span>
6. <https://citymapper.com/news/2553/citymapper-introduces-ios-lock-screen-navigation> <span class="cite">(L1, L7, L7b, L8, L11)</span>
7. <https://www.howtogeek.com/google-maps-features-that-make-public-transit-less-confusing/> <span class="cite">(L1, L6, L7)</span>
8. <https://www.androidauthority.com/android-transit-mode-3633735/> <span class="cite">(L1, L3, L8, L10, L26)</span>
9. Cyprus Mail, Pame app and CPT figures (16 Sep 2026). <https://cyprus-mail.com/2026/09/16/cyprus-public-transport-enters-new-digital-era-with-revamped-pame-app-enhanced-website> <span class="cite">(L1, L24, L26, L35)</span>
10. <https://cyprus-faq.com/en/south/news/pame-app-obnovlenie-cpt-kipr/> <span class="cite">(L1)</span>
11. GTFS-RT dataset. <https://traffic4cyprus.org.cy/en/dataset/publictransportrealtime_gtfs_rt> <span class="cite">(L1, L5, L30, L31)</span>
12. <https://buscyprus.app/gtfs-rt-info> <span class="cite">(L1, L5)</span>
13. Audit Office report via Politis. <https://en.politis.com.cy/news/cy-news/1051591/bus-report-exposes-why-commuters-are-turning-away-from-public-transport> <span class="cite">(L1, L4, L5, L30, F1)</span>
14. <https://www.kathimerini.com.cy/gr/kypros/test-g-elegkti-stis-astikes-sygkoinonies-me-thetiko-prosimo> <span class="cite">(L1, L6)</span>
15. Code: src/routes/api/public/trip-alerts.ts, src/lib/trip-alerts.server.ts, src/lib/trip-store.ts, src/lib/trip-sync.functions.ts, packages/core/src/multileg-journey.ts, packages/core/src/journey-live.ts, mobile/lib/groupBackgroundLocation.ts, mobile/build_info.json (redesign-roam @ 1508f3f) <span class="cite">(L1)</span>
16. <https://citymapper.com/news/2266/turn-by-turn-directions-for-walking> <span class="cite">(L2)</span>
17. <https://citymapper.com/news/2589/> <span class="cite">(L2, L7b, L8)</span>
18. <https://docs.opentripplanner.org/en/latest/RouteRequest/> <span class="cite">(L2, L7b)</span>
19. <https://ic.kaist.ac.kr/publications/papers/cho2010autogait.pdf> <span class="cite">(L2)</span>
20. <https://formative.jmir.org/2025/1/e73722> <span class="cite">(L2)</span>
21. <https://arxiv.org/pdf/1805.03368> <span class="cite">(L2)</span>
22. <https://www.fhwa.dot.gov/publications/research/safety/pedbike/05085/chapt8.cfm> <span class="cite">(L2, L9)</span>
23. <https://doi.org/10.1093/ageing/afs076> <span class="cite">(L2, L9)</span>
24. <https://economytoday.sigmalive.com/ey-gia-leoforeia-l/sias-lanthasmena-oraria-alaloym-pliroforisis-ki-alles-adynamies/> <span class="cite">(L2, L9)</span>
25. Cyprus Mail, Audit Office report (14 Oct 2026). <https://cyprus-mail.com/2026/10/14/63-per-cent-of-passengers-would-not-use-the-bus-again> <span class="cite">(L2, L7b, L8, L32, L34, L35, L36)</span>
26. Code: packages/core/src/geo.ts, packages/core/src/multileg-legs.ts, packages/core/src/raptor-core.ts, src/lib/walk-links.server.ts, src/lib/walk-refine.server.ts (redesign-roam @ 1508f3f) <span class="cite">(L2)</span>
27. Note: the first run cited an Ulm University step-versus-GPS speed figure (1.0 to 1.1 km/h versus 1.1 to 2.4 km/h). Its source is a 2021 master's thesis behind a registered-user wall (dbis.eprints.uni-ulm.de/id/eprint/2067), which could not be opened to verify, so the figure is not used here <span class="cite">(L2)</span>
28. <https://firt.dev/notes/pwa-ios> <span class="cite">(L3, L7, L49)</span>
29. <https://webkit.org/blog/16535/meet-declarative-web-push/> <span class="cite">(L3, L10, L49)</span>
30. <https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities> <span class="cite">(L3, L8)</span>
31. <https://developer.android.com/develop/ui/views/notifications/live-update> <span class="cite">(L3, L8)</span>
32. <https://developer.android.com/develop/sensors-and-location/location/geofencing> <span class="cite">(L3, L49)</span>
33. <https://www.androidpolice.com/nobody-is-using-live-updates> <span class="cite">(L3, L4, L8)</span>
34. <https://play.google.com/store/apps/details?id=app.meep.cyprus.pame> <span class="cite">(L3)</span>
35. Code: src/lib/useGeoWatch.ts, src/lib/useFusedFix.ts, src/lib/useJourneySideEffects.ts, public/sw.js, mobile/lib/groupBackgroundLocation.ts, mobile/lib/liveActivities.ts, mobile/build_info.json (redesign-roam @ 1508f3f) <span class="cite">(L3)</span>
36. <https://doi.org/10.21511/im.17(2).2021.10> <span class="cite">(L4)</span>
37. <https://www.rfc-editor.org/rfc/rfc8030.html> <span class="cite">(L4)</span>
38. Code: src/lib/trip-alerts.server.ts, src/lib/push.functions.ts, src/lib/notify.server.ts, src/lib/trip-sync.functions.ts, workers/pulse-cron/src/jobs.ts, packages/core/src/multileg-journey.ts (redesign-roam @ 1508f3f) <span class="cite">(L4)</span>
39. <https://github.com/TransitApp/ETA-Accuracy-Benchmark> <span class="cite">(L5)</span>
40. <https://www.goswift.ly/blog/banish-ghost-and-zombie-buses> <span class="cite">(L5)</span>
41. <https://help.transitapp.com/article/91-what-is-go-crowdsourcing> <span class="cite">(L5)</span>
42. <https://play.google.com/store/apps/details?id=com.thetransitapp.droid> <span class="cite">(L5, L7b)</span>
43. <https://gtfsscorecard.org/agency/intercity-buses-cyprus/> <span class="cite">(L5, L9)</span>
44. <https://en.alphanews.live/cyprus/the-service-is-not-in-crisis-cpts-response-to-the-audit-offices-findings-on-buses/> <span class="cite">(L5, L7)</span>
45. <https://cyprus-mail.com/2026/10/15/cyprus-public-transport-dismisses-audit-report-says-it-has-already-moved-on> <span class="cite">(L5, L24, L30)</span>
46. Code: src/routes/api/public/trip-alerts.ts, src/lib/gtfs-rt.server.ts, src/lib/ghost-trips.ts, src/lib/threshold-cache.server.ts, src/routes/api/public/rider-fix.ts, packages/core/src/eta-backtest.ts, src/lib/useRealtime.ts (redesign-roam @ 1508f3f) <span class="cite">(L5)</span>
47. <https://www.ijcai.org/proceedings/2025/0937.pdf> <span class="cite">(L6, L7b)</span>
48. Delling, Pajor, Werneck, "Round-Based Public Transit Routing", ALENEX 2012. <https://www.microsoft.com/en-us/research/wp-content/uploads/2012/01/raptor_alenex.pdf> <span class="cite">(L6, L11)</span>
49. <https://citymapper.com/news/777/10-citymapper-tools-to-help-you-master-new-york> <span class="cite">(L6)</span>
50. <https://www.publictransport.com.cy/announcements> <span class="cite">(L6)</span>
51. CyNAP, "Bolt e-Scooter Stations" (Datex II, CC BY 4.0). <https://www.traffic4cyprus.org.cy/dataset/bolt> <span class="cite">(L6, L7b, L12)</span>
52. <https://electra.space/> <span class="cite">(L6, L7b, L22)</span>
53. Code: packages/core/src/wait-or-bail.ts, packages/core/src/other-stop.ts, src/lib/reroute.functions.ts, src/lib/wrong-stop-reroute.ts, packages/core/src/multileg-journey.ts, packages/core/src/journey-live.ts, src/lib/publictransport.functions.ts (redesign-roam @ 1508f3f) <span class="cite">(L6)</span>
54. Citymapper, "Get Off Alerts" and "Lock Screen Navigation". <https://citymapper.com/news/823/get-off-alerts> <span class="cite">(L7, L11)</span>
55. <https://citymapper.com/news/2395/citymapper-in-your-ear> <span class="cite">(L7, L9)</span>
56. <https://blog.google/products-and-platforms/products/maps/never-miss-your-stop-again-step-step-directions-transit-navigation> <span class="cite">(L7)</span>
57. <https://cyprus-mail.com/2024/11/14/people-with-disabilities-humiliated-when-using-buses> <span class="cite">(L7, L9)</span>
58. <https://www.gov.cy/metafores-epikoinonies-erga/topothetisi-tou-ypourgeiou-metaforon-epikoinonion-kai-ergon-anaforika-me-anisychies-tis-pagkyprias-organosis-tyflon/> <span class="cite">(L7)</span>
59. <https://neakypros.com.cy/index.php/news/121938> <span class="cite">(L7, L9)</span>
60. <https://cyprus-faq.com/en/south/news/nezryachie-kipr-trotuary-samokaty-perekhody/> <span class="cite">(L7, L9)</span>
61. CPT response. <https://www.kiprinform.com/en/news/cyprus-public-transport-challenges-audit-findings-points-to-service-upgrades> <span class="cite">(L7, F1)</span>
62. Code: packages/core/src/alight-countdown.ts, src/components/journey/AlightCountdownCard.tsx, src/lib/useJourneySideEffects.ts, public/sw.js, src/routes/api/public/trip-alerts.ts, src/lib/wrong-stop-reroute.ts (redesign-roam @ 1508f3f) <span class="cite">(L7)</span>
63. <https://github.com/plhery/ScootRadar/blob/main/docs/cypriot-scooter-feeds.md> <span class="cite">(L7b)</span>
64. <https://cyprus-mail.com/2026/09/01/bolt-unconcerned-over-new-e-scooter-regulations> <span class="cite">(L7b, L22)</span>
65. <https://cyprus-mail.com/2026/08/27/e-scooter-offences-could-bring-90-day-impoundment> <span class="cite">(L7b, L22)</span>
66. <https://cyprus-mail.com/2026/09/10/e-scooter-injuries-rise-as-citations-reach-5000-this-year> <span class="cite">(L7b)</span>
67. <https://www.kiprinform.com/en/articles/e-scooters-in-cyprus/> <span class="cite">(L7b)</span>
68. <https://cylaw.org/nomoi/arith/2026_1_106.pdf> <span class="cite">(L7b)</span>
69. Code: packages/core/src/multileg-journey.ts, src/lib/reliability.functions.ts, src/lib/bolt-scooter.functions.ts, src/routes/api/public/bike-share.ts (redesign-roam @ 1508f3f) <span class="cite">(L7b)</span>
70. <https://citymapper.com/news/597/go-your-personal-trip-assistant> <span class="cite">(L8)</span>
71. <https://www.engadget.com/2017-12-09-google-maps-commute-tracking.html> <span class="cite">(L8)</span>
72. <https://domcar.com.cy/en/live/digest/the-pame-app-has-been-updated-in-cyprus/> <span class="cite">(L8)</span>
73. Code: src/lib/trip-alerts.server.ts, mobile/lib/liveActivities.ts, mobile/widgets/NearestStopWidget.tsx, mobile/build_info.json (redesign-roam @ 1508f3f) <span class="cite">(L8)</span>
74. <https://transportation.uiowa.edu/cambus/transit> <span class="cite">(L9)</span>
75. <https://europeanaccessibilityact2025.com/art-2-eaa/> <span class="cite">(L9)</span>
76. <https://en.sigmalive.com/complaints-over-unsafe-buses-transporting-blind-students-to-nicosia> <span class="cite">(L9)</span>
77. <https://land.cy/article/new-smart-bus-stops-designed-for-convenience-or-controversy> <span class="cite">(L9)</span>
78. <https://cyprus-faq.com/en/south/news/kipr-ministr-tsolaki-cpt-otvet-auditoram-avtobusy-nikosii> <span class="cite">(L9)</span>
79. Code: src/lib/accessibility-prefs.ts, src/lib/accessibility-weights.ts, src/lib/stop-condition.server.ts, src/lib/useJourneySideEffects.ts (redesign-roam @ 1508f3f) <span class="cite">(L9)</span>
80. <https://pubmed.ncbi.nlm.nih.gov/23524645> <span class="cite">(L10)</span>
81. <https://www.edpb.europa.eu/system/files/documents/2021-03/edpb_guidelines_202001_connected_vehicles_v2.0_adopted_en.pdf> <span class="cite">(L10, L48)</span>
82. <https://www.dlapiperdataprotection.com/index.html?c=CY&t=law> <span class="cite">(L10)</span>
83. Code: src/lib/trip-sync.functions.ts, src/routes/api/public/rider-fix.ts, supabase/migrations/20260914000000_permanent_db_retention_and_upsert.sql, src/lib/lake.server.ts, src/routes/api/public/hooks/archive-lake.ts, src/lib/accessibility-prefs.ts, src/routes/privacy.tsx (redesign-roam @ 1508f3f) <span class="cite">(L10)</span>
84. Same authors, Transportation Science 49(3), 2015. <https://doi.org/10.1287/trsc.2014.0534> <span class="cite">(L11)</span>
85. Delling, Dibbelt, Pajor, Wagner, Werneck, "Computing Multimodal Journeys in Practice", SEA 2013. <http://tpajor.com/assets/paper/ddpww-cmjp-13.pdf> <span class="cite">(L11)</span>
86. Dibbelt, Pajor, Strasser, Wagner, "Connection Scan Algorithm", ACM JEA 23, 2018. <https://doi.org/10.1145/3274661> <span class="cite">(L11, L13)</span>
87. <https://arxiv.org/abs/1703.05997> <span class="cite">(L11)</span>
88. Baum et al., "UnLimited TRAnsfers for Multi-Modal Route Planning", ESA 2019. <https://drops.dagstuhl.de/storage/00lipics/lipics-vol144-esa2019/LIPIcs.ESA.2019.14/LIPIcs.ESA.2019.14.pdf> <span class="cite">(L11)</span>
89. Baum et al., "ULTRA", Transportation Science 2023. <https://doi.org/10.1287/trsc.2022.0198> <span class="cite">(L11)</span>
90. Code. <https://github.com/kit-algo/ULTRA> <span class="cite">(L11)</span>
91. Sauer, Wagner, Zündorf, "Faster Multi-Modal Route Planning With Bike Sharing Using ULTRA", SEA 2020. <https://drops.dagstuhl.de/storage/00lipics/lipics-vol160-sea2020/LIPIcs.SEA.2020.16/LIPIcs.SEA.2020.16.pdf> <span class="cite">(L11)</span>
92. Potthoff, Sauer, "Efficient Algorithms for Fully Multimodal Journey Planning", ATMOS 2022. <https://drops.dagstuhl.de/storage/01oasics/oasics-vol106-atmos2022/OASIcs.ATMOS.2022.14/OASIcs.ATMOS.2022.14.pdf> <span class="cite">(L11)</span>
93. "Fast Multimodal Journey Planning for Three Criteria". <https://arxiv.org/html/2110.12954v1> <span class="cite">(L11)</span>
94. "Routing in Multimodal Transportation Networks with Non-Scheduled Lines", SEA 2022. <https://drops.dagstuhl.de/storage/00lipics/lipics-vol233-sea2022/LIPIcs.SEA.2022.6/LIPIcs.SEA.2022.6.pdf> <span class="cite">(L11)</span>
95. López, Lozano, "Shortest hyperpaths in a multimodal hypergraph with real-time information on some transit lines", Transportation Research Part A, 2020. <https://doi.org/10.1016/j.tra.2019.09.020> <span class="cite">(L11)</span>
96. TERP, IEEE Internet of Things Journal, 2019. <https://doi.org/10.1109/jiot.2019.2894511> <span class="cite">(L11)</span>
97. Abuaisha, Shen, Harabor, Stuckey, Wallace, "Dynamic Replanning for Improved Public Transport Routing", IJCAI 2025. <https://arxiv.org/html/2505.14193v1> <span class="cite">(L11, L13)</span>
98. Transit app FAQ. <https://transitapp.com/faqs-en> <span class="cite">(L11, L16)</span>
99. Moovit Help Center, "Moovit Assistant" (19 Aug 2026). <https://support.moovitapp.com/hc/en-us/articles/35543186031634-Moovit-Assistant-Smarter-Trip-Planning-Than-Ever-Before> <span class="cite">(L11, L16)</span>
100. OpenTripPlanner 2 docs, Vehicle Rental Service Directory. <https://docs.opentripplanner.org/en/latest/sandbox/VehicleRentalServiceDirectory/> <span class="cite">(L11, L14)</span>
101. Cyprus GTFS feeds: (files 2, 4, 5, 6, 9, 10, 11 _google_transit.zip, version 20261031). <https://motionbuscard.org.cy/opendata> <span class="cite">(L11)</span>
102. Mulley, Ho, Ho, Hensher, Rose, "Will bus travellers walk further for a more frequent service? An international study using a stated preference approach", Transport Policy 69, 2018. <https://ideas.repec.org/a/eee/trapol/v69y2018icp88-97.html> <span class="cite">(L12)</span>
103. Working paper. <https://ses.library.usyd.edu.au/bitstream/handle/2123/19115/ITLS-WP-17-17.pdf> <span class="cite">(L12)</span>
104. Porto Alegre stated preference study, Transportes 29(3), 2021. <https://doi.org/10.14295/transportes.v29i3.2647> <span class="cite">(L12)</span>
105. "Characteristics associated with willingness to walk further than necessary to the bus stop", Journal of Transport and Health, 2021. <https://www.sciencedirect.com/science/article/abs/pii/S2214140521001699> <span class="cite">(L12)</span>
106. "Exploring the role of public transport service and walking route related factors to identify maximum walking distances to bus stops in the Netherlands", Journal of Public Transportation, 2024. <https://doi.org/10.1016/j.jpubtr.2024.100096> <span class="cite">(L12)</span>
107. "Level of service and the transit neighbourhood: Observations from Dublin city and suburbs", Research in Transportation Economics, 2018. <https://doi.org/10.1016/j.retrec.2018.07.014> <span class="cite">(L12)</span>
108. El-Geneidy et al., "New evidence on walking distances to transit stops", McGill TRAM. <https://www.tram.mcgill.ca/Research/Publications/Transit_service_area.pdf> <span class="cite">(L12)</span>
109. "Walking and bicycle catchment areas of tram stops: factors and insights", MT-ITS 2019. <https://doi.org/10.1109/mtits.2019.8883361> <span class="cite">(L12)</span>
110. Bus wait time model with headway variance, TRR 663, 1978. <https://onlinepubs.trb.org/Onlinepubs/trr/1978/663/663-012.pdf> <span class="cite">(L12, L13)</span>
111. Fan, Machemehl, "Do Transit Users Just Wait for Buses or Wait with Strategies?", TRR 2111, 2009. <https://doi.org/10.3141/2111-19> <span class="cite">(L12)</span>
112. Luethi, Weidmann, Nash, "Passenger arrival rates at public transport stations", 2007. <https://www.andynash.com/nash-publications/Luethi2007-pax-arrivals-TRB-paper.pdf> <span class="cite">(L12)</span>
113. "A Behavioural Explanation of the Association Between Bus and Passenger Arrivals at a Bus Stop", Transportation Science 9(3). <https://dl.acm.org/doi/10.1287/trsc.9.3.248> <span class="cite">(L12)</span>
114. Spiess, Florian, "Optimal strategies: A new assignment model for transit networks", Transportation Research B 23(2), 1989. <https://doi.org/10.1016/0191-2615(89)90034-9> <span class="cite">(L12)</span>
115. Nextbike live feed. (read 31 Oct 2026). <https://maps.nextbike.net/maps/nextbike-live.json?city=190,206,940,957,889> <span class="cite">(L12)</span>
116. Nextbike Cyprus GBFS. <https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_cy/gbfs.json> <span class="cite">(L12)</span>
117. Resource. <https://fixcyprus.cy/gnosis/open/api/nap/datasets/boltstations/> <span class="cite">(L12)</span>
118. Own analysis: work/partb-better-stop-analysis.py on the official GTFS feeds <span class="cite">(L12)</span>
119. Dibbelt, Strasser, Wagner, "Delay-Robust Journeys in Timetable Networks with Minimum Expected Arrival Time", ATMOS 2014. <https://drops.dagstuhl.de/entities/document/10.4230/OASIcs.ATMOS.2014.1> <span class="cite">(L13)</span>
120. Redmond, Campbell, Ehmke, "Reliability in public transit networks considering backup itineraries", EJOR 300(3), 2022. <https://ideas.repec.org/a/eee/ejores/v300y2022i3p852-864.html> <span class="cite">(L13)</span>
121. Böhmová et al., "Robust Routing in Urban Public Transportation: Evaluating Strategies that Learn From the Past", ATMOS 2015. <https://drops.dagstuhl.de/entities/document/10.4230/OASIcs.ATMOS.2015.68> <span class="cite">(L13)</span>
122. Bez, Sauer, "Fast and Delay-Robust Multimodal Journey Planning", 2023. <https://arxiv.org/pdf/2310.20554> <span class="cite">(L13)</span>
123. OpenTripPlanner, Empirical Delay sandbox (OTP 2.9). <https://docs.opentripplanner.org/en/latest/sandbox/EmpiricalDelay/> <span class="cite">(L13, L14)</span>
124. Bahn-Vorhersage. <https://bahnvorhersage.de/> <span class="cite">(L13)</span>
125. Bahnsparer, "Zuverlässigkeit und Ankunftsmodelle". <https://bahnsparer.de/technik/zuverlaessigkeit?lang=de> <span class="cite">(L13)</span>
126. DB Navigator. <https://www.bahn.de/service/mobile/db-navigator> <span class="cite">(L13, L16)</span>
127. GTFS Realtime Reference, StopTimeEvent.uncertainty. <https://gtfs.org/documentation/realtime/reference/> <span class="cite">(L13, L15)</span>
128. Own decode of the Cyprus GTFS-RT feed, 31 Oct 2026 19:43 EET. <http://20.19.98.194:8328/Api/api/gtfs-realtime> <span class="cite">(L13, L32, L34)</span>
129. OTP System Requirements. <https://docs.opentripplanner.org/en/latest/System-Requirements/> <span class="cite">(L14)</span>
130. MOTIS repository README. <https://github.com/motis-project/motis> <span class="cite">(L14, L19)</span>
131. Transitous API and usage policy. <https://transitous.org/api/> <span class="cite">(L14, L25, L26)</span>
132. Transitous Cyprus feed list. <https://raw.githubusercontent.com/public-transport/transitous/main/feeds/cy.json> <span class="cite">(L14)</span>
133. Conveyal/r5 issue 575. <https://github.com/conveyal/r5/issues/575> <span class="cite">(L14)</span>
134. Valhalla issue 5381, GTFS-Realtime support. <https://github.com/valhalla/valhalla/issues/5381> <span class="cite">(L14)</span>
135. Valhalla discussion 6069, 60-day service window. <https://github.com/valhalla/valhalla/discussions/6069> <span class="cite">(L14)</span>
136. GraphHopper 11.0 release notes. <https://www.graphhopper.com/blog/2025/10/14/graphhopper-routing-engine-11-0-released/> <span class="cite">(L14)</span>
137. GraphHopper reader-gtfs (GTFS-RT in PtRouterImpl). <https://github.com/graphhopper/graphhopper/blob/master/reader-gtfs/src/main/java/com/graphhopper/gtfs/PtRouterImpl.java> <span class="cite">(L14)</span>
138. Hove-io/navitia README notice. <https://github.com/hove-io/navitia> <span class="cite">(L14)</span>
139. Cloudflare Workers limits (updated 29 Oct 2026). <https://developers.cloudflare.com/workers/platform/limits/> <span class="cite">(L14)</span>
140. Cloudflare Containers pricing (updated 5 Oct 2026). <https://developers.cloudflare.com/containers/pricing/> <span class="cite">(L14)</span>
141. Oracle Cloud Always Free resources. <https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm> <span class="cite">(L14)</span>
142. Geofabrik Cyprus extract (37,856,760 bytes, Last-Modified 31 Oct 2026). <https://download.geofabrik.de/europe/cyprus.html> <span class="cite">(L14)</span>
143. Commission Delegated Regulation (EU) 2024/490 amending (EU) 2017/1926. <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32024R0490> <span class="cite">(L15, L16, L17, L18, L20, L48)</span>
144. MMTIS implementation handbook (European Commission, Nov 2024). <https://transport.ec.europa.eu/document/download/0b75db16-35b1-41df-8229-5c8abfec534d_en?filename=MMTIS_implementation_handbook.pdf> <span class="cite">(L15, L30, L48)</span>
145. DATA4PT, D3.2 Profile preparation. <https://data4pt-project.eu/wp-content/uploads/2024/09/D.3.2-Profile-Preparation_v.f1.pdf> <span class="cite">(L15)</span>
146. GBFS specification. <https://gbfs.org/specification/> <span class="cite">(L15)</span>
147. Cyprus National Access Point, CKAN API (package list and resources). <https://www.traffic4cyprus.org.cy/api/3/action/package_search?rows=100> <span class="cite">(L15)</span>
148. <https://www.traffic4cyprus.org.cy/dataset/publictransportrealtime_siri> <span class="cite">(L15)</span>
149. Nextbike Cyprus GBFS system_information. <https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_cy/en/system_information.json> <span class="cite">(L15)</span>
150. Own checks of the seven GTFS zips and the NAP Datex II files on 31 Oct 2026 <span class="cite">(L15)</span>
151. US DOT ITS Knowledge Resources, UTA Connection Protection lesson. <https://www.itskrs.its.dot.gov/2006-l00228> <span class="cite">(L16)</span>
152. Evaluation test plans. <https://rosap.ntl.bts.gov/view/dot/3888> <span class="cite">(L16)</span>
153. Chung, Shalaby, "Development of Control Strategy for Intermodal Connection Protection of Timed-Transfer Transit Routes", TRR 2006, 2007. <https://journals.sagepub.com/doi/10.3141/2006-01> <span class="cite">(L16)</span>
154. "Transit Holding Control Model for Real-Time Connection Protection", Journal of Transportation Engineering Part A 146(4), 2020. <https://ascelibrary.org/doi/10.1061/JTEPBS.0000332> <span class="cite">(L16)</span>
155. US DOT ITS Knowledge Resources, IDTO T-CONNECT results. <https://www.itskrs.its.dot.gov/2021-b01613> <span class="cite">(L16)</span>
156. Caltrans research results. <https://dot.ca.gov/-/media/dot-media/programs/research-innovation-system-information/documents/research-results/task2663-rrs-5-19-a11y.pdf> <span class="cite">(L16)</span>
157. EN 15531-3 (SIRI functional services, CT and CM). <https://standards.globalspec.com/std/14560303/en-15531-3> <span class="cite">(L16)</span>
158. Bruns, "SIRI", DATEX II presentation. <https://datex2.eu/wp-content/uploads/2023/12/2_Bruns_SIRI.pdf> <span class="cite">(L16)</span>
159. "Short-term bus travel time prediction for transfer synchronization with intelligent uncertainty handling", Expert Systems with Applications, 2023. <https://doi.org/10.1016/j.eswa.2023.120751> <span class="cite">(L16)</span>
160. SL, "Refund for delays and disruptions". <https://sl.se/en/help-and-contact/refund-for-delays-and-disruptions> <span class="cite">(L16)</span>
161. Skånetrafiken, "Ersättning vid försening". <https://www.skanetrafiken.se/kundservice/forseningsersattning/ersattning-vid-forsening> <span class="cite">(L16)</span>
162. Parkhurst, "Influence of bus-based park and ride facilities on users' car traffic", Transport Policy 7(2), 2000. <https://ideas.repec.org/a/eee/trapol/v7y2000i2p159-172.html> <span class="cite">(L17)</span>
163. Mingardo, "Transport and environmental effects of rail-based Park and Ride: evidence from the Netherlands", Journal of Transport Geography 30, 2013. <https://repub.eur.nl/pub/39335> <span class="cite">(L17)</span>
164. Meek et al. (2008), as cited in Modal integration of bus and car in UK local transport policy and related literature. <https://www.sciencedirect.com/science/article/pii/S096669230200011X> <span class="cite">(L17)</span>
165. Meek, Ison, Enoch, "Park and ride: lessons from the UK experience". <https://dspace.lboro.ac.uk/2134/4352> <span class="cite">(L17)</span>
166. "A meta-analysis of the effectiveness of park-and-ride facilities", European Journal of Transport and Infrastructure Research, 2015. <https://journals.open.tudelft.nl/ejtir/article/view/3099> <span class="cite">(L17)</span>
167. OpenTripPlanner, Vehicle Parking Updaters. <https://docs.opentripplanner.org/en/latest/sandbox/VehicleParking/> <span class="cite">(L17)</span>
168. CyNAP datasets: Park and Ride. <https://fixcyprus.cy/gnosis/open/api/nap/datasets/parkandride/> <span class="cite">(L17)</span>
169. Parking Areas. <https://fixcyprus.cy/gnosis/open/api/nap/datasets/parking_areas/> <span class="cite">(L17)</span>
170. Catalogue. <https://www.traffic4cyprus.org.cy/dataset> <span class="cite">(L17, L31)</span>
171. Pame Express GTFS (feed 11). <https://motionbuscard.org.cy/opendata/downloadfile?file=GTFS%5C11_google_transit.zip&rel=True> <span class="cite">(L17)</span>
172. AeroDataBox API features. <https://aerodatabox.com/api> <span class="cite">(L18)</span>
173. OpenSky Network REST API documentation (limitations, credits, arrivals and departures by airport). <https://openskynetwork.github.io/opensky-api/rest.html> <span class="cite">(L18)</span>
174. AeroDataBox pricing. <https://aerodatabox.com/pricing> <span class="cite">(L18)</span>
175. RapidAPI plan details. <https://rapidapi.com/aedbx-aedbx/api/aerodatabox/pricing> <span class="cite">(L18)</span>
176. AeroDataBox terms update (FIDS page sizes), Sep 2026. <https://aerodatabox.com/2026-09-terms-update> <span class="cite">(L18)</span>
177. Deputy Ministry of Shipping press conference, 15 Apr 2026. <https://www.gov.cy/naftilia/synentefxi-typou-tou-yfypourgeiou-naftilias-gia-ti-thalassia-epivatiki-syndesi-kyprou-elladas/> <span class="cite">(L18)</span>
178. Cyprus Mail, "Cyprus-Greece ferry bookings open", 22 Apr 2026. <https://cyprus-mail.com/2026/04/22/cyprus-greece-ferry-bookings-open> <span class="cite">(L18)</span>
179. Newscyprus.eu fares and boarding times. <https://www.newscyprus.eu/en/news/parom-kipr-greciia-kakovy-raspisanie-i-rascenki-na-bilety-v-2026-godu> <span class="cite">(L18)</span>
180. Politis, "Limassol-Piraeus Ferry Faces Uncertain Future Without State Subsidy", 7 Aug 2026. <https://en.politis.com.cy/news/economy/1024668/limassol-piraeus-ferry-faces-uncertain-future-without-state-subsidy> <span class="cite">(L18)</span>
181. Own analysis of GTFS feeds 2, 5 and 10 (version 20261031) for 3 Nov 2026 <span class="cite">(L18)</span>
182. GTFS Flex (MobilityData). <https://gtfs.org/community/extensions/flex/> <span class="cite">(L19)</span>
183. OpenTripPlanner Flex Routing sandbox. <https://docs.opentripplanner.org/en/latest/sandbox/Flex/> <span class="cite">(L19)</span>
184. EU Urban Mobility Observatory, "Strategic planning for Demand Responsive Transport: Insights from European projects", 28 Nov 2025. <https://urban-mobility-observatory.transport.ec.europa.eu/strategic-planning-demand-responsive-transport-insights-european-projects_en> <span class="cite">(L19)</span>
185. Interreg Europe, Rural Mobility. <https://www.interregeurope.eu/rural-mobility> <span class="cite">(L19)</span>
186. Cyprus Public Transport, "CPT at a Glance". <https://www.publictransport.com.cy/whoweare/cpt-at-a-glance> <span class="cite">(L19)</span>
187. Cyprus Public Transport, research and innovation projects. <https://www.publictransport.com.cy/innovation/research-innovation> <span class="cite">(L19)</span>
188. IÖW / Policy Mix 4 Mobility posts, 21 Sep 2026. <https://mastodon.social/@ioew/117308945275930518> <span class="cite">(L19)</span>
189. <https://www.linkedin.com/posts/ioew-berlin_bikesharing-learningfromlimassol-activity-7507759450531807232-CrpR> <span class="cite">(L19)</span>
190. Own analysis of GTFS feeds 2, 4, 5, 6, 9 and 10 (version 20261031) for 3, 7 and 8 Nov 2026 <span class="cite">(L19)</span>
191. Liao, Patterson, Fox, Kautz, "Learning and inferring transportation routines", Artificial Intelligence, 2007. <https://www.cs.virginia.edu/~rmw7my/papers/learning-transport-routines-journal.pdf> <span class="cite">(L20)</span>
192. Chidlovskii, "Improved Trip Planning by Learning from Travelers' Choices", CEUR Workshop Proceedings 1392. <https://ceur-ws.org/Vol-1392/paper-03.pdf> <span class="cite">(L20)</span>
193. "Individual utility-based path suggestions in transit trip planners", IET Intelligent Transport Systems. <https://digital-library.theiet.org/doi/pdf/10.1049/iet-its.2015.0138?download=true> <span class="cite">(L20)</span>
194. Lathia, Capra, Magliocchetti et al., "Individuals among commuters: Building personalised transport information services from fare collection systems". <https://nlathia.github.io/papers/lathia_PMC12.pdf> <span class="cite">(L20)</span>
195. "OPENPATH: A Supervisor-Specialist Agent System for Personalized, Accessible, and Multi-stop Urban Trip Planning", arXiv 2606.07486. <https://arxiv.org/pdf/2606.07486> <span class="cite">(L20)</span>
196. Code read: src/lib/commute-learner.functions.ts, migrations-d1 (commute_patterns), src/lib/accessibility-prefs.ts, packages/core/src/today-rhythm.ts <span class="cite">(L20)</span>
197. <https://mobiili.fi/2024/03/16/suomalainen-maas-global-kaatui-konkurssiin-ehti-kerata-rahoitusta-yli-90-miljoonaa-euroa/> <span class="cite">(L21)</span>
198. <https://www.mobility-payments.com/2024/03/15/from-guru-to-poster-child-for-maas-failures-whim-app-founder-calls-it-quits/> <span class="cite">(L21)</span>
199. <https://www.traffictechnologytoday.com/news/mobility-as-a-service/maas-global-declares-bankruptcy.html> <span class="cite">(L21)</span>
200. <https://www.ccam-tac.org/news/maas-global-declares-bankruptcy/> <span class="cite">(L21)</span>
201. <https://www.sustainable-bus.com/news/maas-global-bankruptcy-whim/> <span class="cite">(L21)</span>
202. <https://umob.app/press/umob-acquires-maas-global> <span class="cite">(L21)</span>
203. <https://zagdaily.com/micromobility/maas-global-is-not-dead-long-live-maas> <span class="cite">(L21)</span>
204. <https://www.itsinternational.com/its17/feature/sampo-hietanen-most-likely-youre-going-be-magnificent-corpse-out-all> <span class="cite">(L21)</span>
205. <https://citymapper.com/news/2597/pass-comes-to-an-end> <span class="cite">(L21)</span>
206. <https://citymapper.com/news/2596/sdks-and-apis-come-to-an-end> <span class="cite">(L21, L25)</span>
207. <https://ridewithvia.com/news/via-acquires-citymapper-to-expand-its-end-to-end-transittech-solution> <span class="cite">(L21)</span>
208. <https://www.sec.gov/Archives/edgar/data/1603015/000160301526000008/via-20251231.htm> <span class="cite">(L21)</span>
209. <https://www.bvg.de/de/unternehmen/medienportal/pressemitteilungen/20251223-pm-jelbi> <span class="cite">(L21, L22)</span>
210. <https://www.itsinternational.com/gmv-provide-account-based-ticketing-cyprus-buses/> <span class="cite">(L21, L24)</span>
211. Code: src/lib/kapnos.functions.ts, src/lib/mobility-links.ts, src/routes/api/public/partners/apply.ts, COMMERCIAL.md (redesign-roam @ 1508f3f) <span class="cite">(L21)</span>
212. <https://gbfs.org/documentation/data-policy> <span class="cite">(L22)</span>
213. <https://www.gbfs.org/documentation/reference/> <span class="cite">(L22)</span>
214. <https://github.com/MobilityData/gbfs/blob/v3.0/gbfs.md> <span class="cite">(L22)</span>
215. <https://resources.transitapp.com/article/296-best-practices-for-requiring-public-gbfs-feeds> <span class="cite">(L22)</span>
216. <https://www.electra.space/tac/ElectraCY_T&C.pdf> <span class="cite">(L22)</span>
217. <https://www.bazaraki.com/adv/5713444_e-moped-for-rent/> <span class="cite">(L22)</span>
218. <https://www.cylaw.org/nomoi/arith/2026_1_107.pdf> <span class="cite">(L22)</span>
219. <https://cyprus-mail.com/2026/05/19/e-scooter-age-limit-rise-to-17-goes-into-force> <span class="cite">(L22)</span>
220. <https://www.en.politis.com.cy/news/1006295/cyprus-sets-minimum-age-for-e-scooter-use-at-17-years> <span class="cite">(L22)</span>
221. <https://etsc.eu/greece-and-cyprus-tighten-national-rules-on-e-scooters> <span class="cite">(L22)</span>
222. <https://en.philenews.com/local/cyprus-e-scooter-seizure-decree-nicosia-parking/> <span class="cite">(L22)</span>
223. Code: src/lib/bikeshare.functions.ts, src/lib/bolt-scooter.functions.ts, src/lib/mobility-links.ts, src/routes/api/public/gbfs[.]json.ts, src/routes/api/public/gbfs/system_information[.]json.ts (redesign-roam @ 1508f3f) <span class="cite">(L22)</span>
224. <https://bolt.eu/en/blog/chat-gpt-integration> <span class="cite">(L23)</span>
225. <https://zagdaily.com/connected/bolt-integrates-ride-hailing-into-chatgpt> <span class="cite">(L23)</span>
226. <https://cities-today.com/bolt-adds-ride-hailing-to-chatgpt/> <span class="cite">(L23)</span>
227. <https://market.partnerstack.com/page/bolt> <span class="cite">(L23, L29)</span>
228. <https://bolt.eu/en/legal/bolt-business/tnc-business-referral/> <span class="cite">(L23)</span>
229. <https://bolt.eu/en-ie/business/refer-a-company/> <span class="cite">(L23)</span>
230. <https://kapnosairportshuttle.com/> <span class="cite">(L23)</span>
231. <https://kapnosairportshuttle.com/timetables> <span class="cite">(L23, L28)</span>
232. <https://kapnosairportshuttle.com/blog/cyprus-shuttle-book> <span class="cite">(L23)</span>
233. <https://cyprus-mail.com/2026/06/29/kapnos-expands-shuttle-services-to-and-from-paphos-airport> <span class="cite">(L23)</span>
234. <https://www.linkedin.com/posts/igorakimov1_cyprus-publictransport-googlemaps-activity-7430608887290064896-EQDv> <span class="cite">(L23, L26)</span>
235. <http://kapnos.ecoachmanager.com/coachtrip/> <span class="cite">(L23)</span>
236. <https://buscyprus.cy/blog/airport/larnaca-airport-to-nicosia-by-bus> <span class="cite">(L23, L26, L28)</span>
237. Code: src/lib/kapnos.functions.ts, src/routes/api/public/kapnos.ts, src/lib/mobility-links.ts, src/lib/maps.server.ts (redesign-roam @ 1508f3f) <span class="cite">(L23)</span>
238. <https://www.gmv.com/en/communication/press-room/press-releases/intelligent-transportation-systems/gmv-continues-modernize> <span class="cite">(L24)</span>
239. <https://www.gmv.com/en/communication/press-room/press-releases/transportation-bus/gmv-implements-emv-payment-system> <span class="cite">(L24)</span>
240. Cyprus Public Transport, Ticket fares (from 3 Aug 2026). <https://www.publictransport.com.cy/cms/page/cash-tickets> <span class="cite">(L24, L29, L37)</span>
241. <https://www.publictransport.com.cy/cms/page/fares-and-cards> <span class="cite">(L24)</span>
242. <https://knews.kathimerini.com.cy/en/news/monday-commute-gets-more-expensive-in-nicosia-and-larnaca> <span class="cite">(L24)</span>
243. EMEL, Fare changes from 5 Nov 2026 (27 Aug 2026). <https://limassolbuses.com/fare-changes-2/> <span class="cite">(L24, L29, L37)</span>
244. <https://info.cy/cyprus-buses-fares> <span class="cite">(L24)</span>
245. <https://www.cbn.com.cy/article/133592/cyprus-public-transport-enters-a-new-digital-era-with-a-revamped-pame-app-and-new-enhanced-website-videos> <span class="cite">(L24)</span>
246. <https://en.alphanews.live/cyprus/e2-70-bus-fare-how-the-company-responds-to-questions-about-the-ticket-price-and-what-it-says-about-the-lack-of-pos-terminals/> <span class="cite">(L24)</span>
247. <https://knews.kathimerini.com.cy/en/news/contactless-payments-coming-to-famagusta-buses-this-october> <span class="cite">(L24)</span>
248. <https://en.sigmalive.com/cyprus-plans-improvements-to-bus-services-and-ticketing-system/> <span class="cite">(L24, L30)</span>
249. <https://info.cy/n-327--cyprus-to-expand-card-payments-on-buses-and-add-online-bookings> <span class="cite">(L24)</span>
250. <https://aloya.cy/fares> <span class="cite">(L24)</span>
251. Code: src/lib/jcc.functions.ts, src/routes/wallet.tsx, src/routes/api/public/wallet.ts, src/routes/api/public/wallet/pass.ts, src/routes/api/public/wallet/ocr.ts (redesign-roam @ 1508f3f) <span class="cite">(L24)</span>
252. <https://www.openmobilityfoundation.org/about-mds/mds-version-guidance> <span class="cite">(L25)</span>
253. <https://www.openmobilityfoundation.org/mds-new-tools-for-safer-streets> <span class="cite">(L25)</span>
254. <https://gbfs.org/documentation/faq> <span class="cite">(L25)</span>
255. <https://github.com/TOMP-WG/TOMP-API> <span class="cite">(L25)</span>
256. <https://github.com/public-transport/transitous/issues/2399> <span class="cite">(L25, L26)</span>
257. <https://www.traffic4cyprus.org.cy/en/dataset/publictransportrealtime_siri> <span class="cite">(L25, L41)</span>
258. Dataset 1069. <https://www.data.gov.cy/en/dataset/1069> <span class="cite">(L25, L30, L31)</span>
259. Code: LICENSE, README.md, COMMERCIAL.md, .env.example, src/routes/api/public/* (plan.ts, places-autocomplete.ts, walk-directions.ts, tts.ts, stt.ts, parse-trip-intent.ts, wallet/ocr.ts, streetview.ts, kapnos.ts, wallet.ts, sighting.ts, partners/apply.ts, bedrock-test.ts, metrics.ts, hooks/*), src/lib/schemas/public-api.ts, src/lib/maps.server.ts, src/lib/ai-planner.functions.ts, src/lib/stop-photo.server.ts, src/lib/mcp/index.ts, src/routes/mcp.ts (redesign-roam @ 1508f3f) <span class="cite">(L25)</span>
260. <https://moovit.com/about-us> <span class="cite">(L26)</span>
261. <https://moovitapp.com/index/en/public_transit-Nicosia-4443> <span class="cite">(L26, L41)</span>
262. <https://moovitapp.com/index/en/public_transit-line-5-Nicosia-4443-1804341-72909783-1> <span class="cite">(L26)</span>
263. <https://moovitapp.com/index/en/public_transit-%CE%A0%CE%AC%CF%86%CE%BF%CF%82_Paphos-5837> <span class="cite">(L26)</span>
264. <https://transitous.org/> <span class="cite">(L26)</span>
265. <https://github.com/public-transport/transitous/issues/2293> <span class="cite">(L26)</span>
266. <https://help.traewelling.de/en/features/timetable/licensing/> <span class="cite">(L26)</span>
267. <https://www.linkedin.com/posts/alexiasolomou_excellent-news-for-public-transport-in-cyprus-activity-7433250933746257921-S37Q> <span class="cite">(L26)</span>
268. <https://www.motionbuscard.org.cy/app> <span class="cite">(L26)</span>
269. <https://www.publictransport.com.cy/cms/page/bus-bike-pame-app> <span class="cite">(L26)</span>
270. <https://cyprustransport.com.cy/tickets> <span class="cite">(L26)</span>
271. <https://info.cy/buses/limassol> <span class="cite">(L26)</span>
272. <https://cyprusbus.app/> <span class="cite">(L26)</span>
273. <https://urbaneel.com/limassol/> <span class="cite">(L26, L41)</span>
274. Code: src/routes/api/public/route-reliability.ts, stop-reliability.ts, eta-log.ts, hooks/eta-backtest.ts, sighting.ts, stop-skip-report.ts, rider-fix.ts, park-and-ride.ts, src/lib/ev-chargers.functions.ts (redesign-roam @ 1508f3f) <span class="cite">(L26)</span>
275. <https://play.google.com/store/apps/details?hl=en_US&id=com.trafi.whitelabel.bvg&listing=carsharing> <span class="cite">(L27)</span>
276. <https://www.ttsitalia.it/wp-content/uploads/2024/11/Petra-Soderqvist_DG_MOVE.pdf> <span class="cite">(L27, L30)</span>
277. <https://cyprus-mail.com/2026/10/23/ministry-to-install-94-new-ev-charging-ports-at-e10m-cost> <span class="cite">(L27)</span>
278. <https://en.philenews.com/local/cyprus-94-fast-ev-charging-points-2028-transport-ministry> <span class="cite">(L27)</span>
279. <https://www.electrive.com/2026/10/26/cyprus-expands-public-charging-network> <span class="cite">(L27)</span>
280. <https://cyprus-mail.com/2026/08/06/cypruss-ev-charging-network-and-the-85000-target> <span class="cite">(L27)</span>
281. <https://www.eac.com.cy/EN/NonRegulatedActivities/chargingstation/Pages/default1.aspx> <span class="cite">(L27)</span>
282. <https://apps.apple.com/cy/app/ridenow-pro-carsharing/id6743093894> <span class="cite">(L27)</span>
283. <https://ridenow.tech/short_rides> <span class="cite">(L27)</span>
284. <https://ridenow.tech/airports> <span class="cite">(L27)</span>
285. <https://ridenow.tech/business> <span class="cite">(L27, L29)</span>
286. <https://www.togorent.com/price.html> <span class="cite">(L27)</span>
287. <https://rentalsincyprus.com/blog> <span class="cite">(L27)</span>
288. <https://cyprus-mail.com/2026/06/26/limassol-set-to-launch-smart-parking-system-in-early-july> <span class="cite">(L27)</span>
289. <https://en.politis.com.cy/news/1014847/limassol-to-launch-smart-parking-system-in-early-july> <span class="cite">(L27)</span>
290. <https://fastforward.com.cy/tech/limassol-signs-eu52m-deal-smart-parking-system> <span class="cite">(L27)</span>
291. <https://www.easypark.com/en-cy/where-to-park> <span class="cite">(L27)</span>
292. Code: src/lib/ev-chargers.functions.ts, src/routes/api/public/park-and-ride.ts (redesign-roam @ 1508f3f) <span class="cite">(L27)</span>
293. <https://library.cystat.gov.cy/NEW/Tourists_Arrivals%26Residents_Returns-Sep26-EN-191026.pdf> <span class="cite">(L28)</span>
294. <https://en.politis.com.cy/news/1054728/record-september-for-cyprus-tourism-but-2026-arrivals-still-trail-last-year> <span class="cite">(L28)</span>
295. <https://cyprus-mail.com/2026/10/19/cyprus-tourism-is-closing-the-gap-though-not-everyone-is-coming-back> <span class="cite">(L28)</span>
296. <https://www.routesonline.com/airports/8258/hermes-airports/news/299665741/cyprus-airports-reach-all-time-high-passenger-traffic-in-2025/> <span class="cite">(L28)</span>
297. <https://aviationweek.com/air-transport/airports-networks/sustaining-surge-how-cyprus-airports-are-powering-record-passenger> <span class="cite">(L28)</span>
298. Code: src/routes/api/public/hooks/pulse-flights.ts, hooks/pulse-cruises.ts, airport.ts, src/lib/kapnos.functions.ts (redesign-roam @ 1508f3f) <span class="cite">(L28)</span>
299. <https://ciu.edu.tr/en/student-life/campus-services/ciu-mobile> <span class="cite">(L29)</span>
300. <https://op.europa.eu/en/web/public-procurement/procurement-details/-/procurement/7ae10a71-d22d-4250-a22e-d54039c814e2> <span class="cite">(L29)</span>
301. <https://app.mercell.com/tender/2075555708/> <span class="cite">(L29)</span>
302. <https://www.ucy.ac.cy/hr/home/bus-routes/> <span class="cite">(L29)</span>
303. Code: packages/core/src/today-rhythm.ts (redesign-roam @ 1508f3f) <span class="cite">(L29)</span>
304. <https://eur-lex.europa.eu/eli/reg_del/2024/490/oj> <span class="cite">(L30)</span>
305. <https://www.napcore.eu/documents/D2.4.1_Mapping%20access%20nodes%20identifiers%20MS_final.pdf> <span class="cite">(L30)</span>
306. <https://napcore.eu/wp-content/uploads/2025/04/NAPCORE-WG5_Communication-Package_FAQs-on-the-Delegated-Regulations.pdf> <span class="cite">(L30, L48)</span>
307. CPT chairman. <https://www.cbn.com.cy/article/135223/felipe-cosmen-priority-measures-and-new-tech-will-encourage-more-people-to-take-the-bus-in-cyprus-video> <span class="cite">(L30, F1)</span>
308. <https://www.eiturbanmobility.eu/call-for-proposals/financial-support-to-startups-open-call-3> <span class="cite">(L30)</span>
309. <https://grant-grants.com/news/tpost/eit-urban-mobility-financial-support-startups> <span class="cite">(L30)</span>
310. <https://www.eit.europa.eu/our-activities/opportunities/sme-market-expansion-open-call-2027> <span class="cite">(L30)</span>
311. <https://www.eiturbanmobility.eu/sme-market-expansion-open-call-2027/> <span class="cite">(L30)</span>
312. <https://www.eiturbanmobility.eu/call-for-proposals/strategic-innovation-open-call> <span class="cite">(L30)</span>
313. <https://www.eiturbanmobility.eu/wp-content/uploads/2026/09/Strategic-Innovation-Call-Manual_v5_21092026_final.pdf> <span class="cite">(L30)</span>
314. <https://trustlist.uk/news/eit-urban-mobility-open-call-up-to-eur-2m-per-consortium-next-cut-off-28-january-2027> <span class="cite">(L30)</span>
315. <https://ric-gabrovo.com/wp6-eit-urban-mobility/> <span class="cite">(L30)</span>
316. Code: workers/gtfs-relay, src/lib/bolt-scooter.functions.ts, src/lib/ev-chargers.functions.ts, src/routes/api/public/gbfs[.]json.ts (redesign-roam @ 1508f3f) <span class="cite">(L30)</span>
317. TfL, Open data policy. <https://tfl.gov.uk/info-for/open-data-users/open-data-policy> <span class="cite">(L31)</span>
318. TfL Unified API portal. <https://tops.tfl.gov.uk/> <span class="cite">(L31, L32)</span>
319. API FAQ. <https://api-portal.tfl.gov.uk/faq> <span class="cite">(L31)</span>
320. Transport.data.gouv.fr quality indicators. <https://doc.transport.data.gouv.fr/outils/outils-disponibles-sur-le-pan/indicateurs-de-qualite> <span class="cite">(L31, L34)</span>
321. SNCF dataset. <https://transport.data.gouv.fr/datasets/horaires-sncf?locale=fr> <span class="cite">(L31)</span>
322. Nouveautés. <https://transport.data.gouv.fr/nouveautes?locale=fr> <span class="cite">(L31)</span>
323. Deadlines. <https://doc.transport.data.gouv.fr/le-point-d-acces-national/cadre-juridique/dates-limites-de-publication> <span class="cite">(L31)</span>
324. Entur presentation, TTG 2025. <https://cdn.asp.events/CLIENT_CL_Conf_BDA05934_5056_B731_4C9EEBBE0C2416C2/sites/transport-ticketing-globa/media/2025-presentations/12.40-2025-TTG-Building-a-Nationwide-Multimodal-Ticketing-Platform.pdf> <span class="cite">(L31)</span>
325. Delegated Regulation (EU) 2024/490. <https://eur-lex.europa.eu/eli/reg_del/2024/490/oj/eng> <span class="cite">(L31)</span>
326. Static. <https://traffic4cyprus.org.cy/en/dataset/publictransportstatic> <span class="cite">(L31)</span>
327. Live endpoint test, 31 Oct 2026: (and cycleways, pedestrian_crossings, bicycle_racks, parking_areas, waze_alerts, bus_stations). <https://fixcyprus.cy/gnosis/open/api/nap/datasets/bus_lanes/> <span class="cite">(L31)</span>
328. Interoperable Europe, Cyprus 2025. <https://interoperable-europe.ec.europa.eu/sites/default/files/custom-page/attachment/2026-06/iopeu-monitoring_2025-supporting-document_cyprus_final.pdf> <span class="cite">(L31)</span>
329. EC, Cyprus ITS progress report 2025. <https://transport.ec.europa.eu/document/download/af766a37-f7ef-48fe-8d35-59ed45f699e6_en?filename=cy_its_progress_report_2025.pdf> <span class="cite">(L31)</span>
330. Data.gov.cy. <https://www.data.gov.cy/en> <span class="cite">(L31)</span>
331. DLI current air API. <https://data.gov.cy/el/dataset/trehoyses-metriseis-atmosfairikon-rypon-api> <span class="cite">(L31)</span>
332. Traffic census. <https://data.gov.cy/el/dataset/etisia-apografi-kykloforias-motorways> <span class="cite">(L31)</span>
333. Cyprus Air Quality. <https://www.airquality.dli.mlsi.gov.cy/> <span class="cite">(L31)</span>
334. Mapillary points. <https://www.mapillary.com/developer/api-documentation/points> <span class="cite">(L31)</span>
335. Code: src/lib/basemap.ts, src/routes/api/public/hooks/pulse-traffic.ts, src/lib/bolt-scooter.functions.ts, src/lib/ev-chargers.functions.ts, src/routes/api/public/streetview.ts, src/lib/mcp/index.ts, scripts/ingest-schedule.ts <span class="cite">(L31)</span>
336. Google Transit Partners, Provide vehicle occupancy data with GTFS. <https://support.google.com/transitpartners/answer/10106342?hl=en> <span class="cite">(L32)</span>
337. Google Transit Partners, Crowdsourced Transit predictions. <https://support.google.com/transitpartners/answer/9551309?hl=en> <span class="cite">(L32)</span>
338. Google blog, Navigate new normals with Google Maps (21 Jul 2021). <https://blog.google/products-and-platforms/products/maps/new-normals-with-google-maps/> <span class="cite">(L32)</span>
339. Transit blog, Public transit riders are helping one another avoid crowds (13 Oct 2020). <https://blog.transitapp.com/public-transit-riders-are-helping-one-another-avoid-crowds-c929a4fe6c7d/> <span class="cite">(L32)</span>
340. Moovit help centre, Ver 5.70. <https://support.moovitapp.com/hc/en-us/articles/360022062080> <span class="cite">(L32)</span>
341. Reporter / KYPE, Larnaca school buses (17 Sep 2026). <https://www.reporter.com.cy/article/1463445/> <span class="cite">(L32)</span>
342. Larnakaonline, A' Technical School of Nicosia (30 Oct 2025). <https://larnakaonline.com.cy/2025/10/30/a-techniki-scholi-lefkosias-katangelia-mathiton-gia-yperplirotita-se-leoforeio/> <span class="cite">(L32)</span>
343. Code: src/lib/crowd.functions.ts, src/components/CrowdHint.tsx, src/routes/api/public/route-load.ts, supabase/migrations/20260527135631_e3cd8308-3981-4fc4-bb09-3fba339fd042.sql, migrations-d1/0001_init.sql, src/lib/crowd-coverage.server.ts, src/components/pulse/CrowdEyesCard.tsx <span class="cite">(L32)</span>
344. Google blog, Gemini navigation features (5 Nov 2025). <https://blog.google/products-and-platforms/products/maps/gemini-navigation-features-landmark-lens/> <span class="cite">(L33)</span>
345. 9to5Google, Gemini for all navigation modes (26 Nov 2025). <https://9to5google.com/2025/11/26/google-maps-gemini-navigation-rollout/> <span class="cite">(L33)</span>
346. Google blog, Ask Maps and Immersive Navigation (12 Mar 2026). <https://blog.google/products-and-platforms/products/maps/ask-maps-immersive-navigation> <span class="cite">(L33)</span>
347. Google blog, Ask Maps gets more helpful (6 Aug 2026). <https://blog.google/products-and-platforms/products/maps/order-food-in-ask-maps/> <span class="cite">(L33)</span>
348. The Verge, Gemini on CarPlay (21 Oct 2026). <https://www.theverge.com/transportation/1015281/gemini-ai-apple-carplay-voice-google-maps> <span class="cite">(L33)</span>
349. Xie et al., TravelPlanner. <https://arxiv.org/abs/2402.01622> <span class="cite">(L33)</span>
350. Results table. <https://arxiv.org/html/2402.01622v4> <span class="cite">(L33)</span>
351. OpenSymbolic, TravelPlanner 97.9% (20 Feb 2026). <https://www.opensymbolic.ai/blog/travelplanner-benchmark> <span class="cite">(L33)</span>
352. Groq rate limits. <https://console.groq.com/docs/rate-limits> <span class="cite">(L33)</span>
353. Cloudflare Workers AI pricing. <https://developers.cloudflare.com/workers-ai/platform/pricing/> <span class="cite">(L33)</span>
354. Code: src/lib/ai-planner.functions.ts, packages/core/src/nl-intent.ts, src/components/nl/useNLPlanner.ts, src/components/roam/search/RoamSearchSheet.tsx, src/routes/api/public/parse-trip-intent.ts, src/lib/nl-suggestions.functions.ts, src/lib/mcp/index.ts, src/lib/speech.ts, packages/core/src/cy-time.ts <span class="cite">(L33)</span>
355. MobilityData gtfs-validator. <https://github.com/MobilityData/gtfs-validator> <span class="cite">(L34)</span>
356. NAYEE, The open transit stack behind BusCyprus (11 Oct 2026). <https://nayee.net/blog/the-open-transit-stack-behind-buscyprus> <span class="cite">(L34)</span>
357. Cyprus Mail, Transport Hackathon (20 Jan 2026). <https://cyprus-mail.com/2026/01/20/ai-driven-approach-to-bus-tracking-takes-first-prize-at-cyprus-transport-hackathon> <span class="cite">(L34, L35)</span>
358. Cyprus FAQ, 9,000 bus stops inventory tender (23 Oct 2026). <https://www.cyprus-faq.com/en/south/news/kipr-inventarizaciya-9000-avtobusnyh-ostanovok/> <span class="cite">(L34, L37, L40)</span>
359. Static GTFS downloads, 31 Oct 2026: (and feeds 2, 4, 5, 9, 10, 11). <https://www.motionbuscard.org.cy/opendata/downloadfile?file=GTFS%5C6_google_transit.zip&rel=True> <span class="cite">(L34)</span>
360. Code: src/lib/ghost-trips.ts, src/lib/feed-delta.server.ts, src/lib/eta-backtest.server.ts, scripts/validate-gtfs-snapshot.mjs, scripts/ingest-schedule.ts, src/lib/cron-schedule.ts, workers/pulse-cron/wrangler.jsonc, public/data/schedule/by-date <span class="cite">(L34)</span>
361. City of Beaumont, Swiftly pricing calculator and order form (04/2022). <https://mccmeetingspublic.blob.core.usgovcloudapi.net/beaumntca-meet-ada51768922143e7aa781ac02b57d63d/ITEM-Attachment-001-d951d98eeee9456cac722302bfdc07cb.pdf> <span class="cite">(L35)</span>
362. Banning Pass Transit, Trillium-Swiftly order form (Apr 2020). <https://banningca.gov/DocumentCenter/View/7351/Att-1-Trillium-Swiftly-Proposal> <span class="cite">(L35)</span>
363. MARTA agenda report, Swiftly contract. <https://itsmarta.civicweb.net/document/152652/> <span class="cite">(L35)</span>
364. County Connection staff report, Swiftly modules (Jun 2025). <https://countyconnection.com/wp-content/uploads/2025/06/5.FINAL_Swiftly-Modules.pdf> <span class="cite">(L35)</span>
365. EC DG MOVE, Implementing Regulation on urban mobility indicators (9 Jul 2026). <https://transport.ec.europa.eu/news-events/news/commission-adopts-implementing-regulation-strengthen-sustainable-urban-mobility-through-harmonised-2026-07-09_en> <span class="cite">(L35)</span>
366. EU Urban Mobility Observatory, indicator fiches (23 Jul 2024). <https://urban-mobility-observatory.transport.ec.europa.eu/news-events/news/new-urban-mobility-indicator-fiches-released-support-sump-implementation-2024-07-23_en> <span class="cite">(L35)</span>
367. EGUM opinion on SUMP indicators. <https://transport.ec.europa.eu/document/download/cb890007-af95-46e8-8f9c-1a29c1efefac_en?filename=EGUM_SUMP_subgroup_SUMI_opinion.pdf> <span class="cite">(L35)</span>
368. RIF, AI in Government Challenge 4 submissions (16 Mar 2026). <https://www.research.org.cy/en/completion-of-proposal-submission-for-the-ai-in-government-program-call-for-proposals-challenge-4/> <span class="cite">(L35)</span>
369. Results (18 May 2026). <https://www.research.org.cy/en/announcement-of-evaluation-results-for-aiingovt-0725-challenge-4-call-of-the-ai-in-government-challenge-4-programme/> <span class="cite">(L35)</span>
370. Forthcoming calls. <https://www.research.org.cy/en> <span class="cite">(L35)</span>
371. Philenews, smart traffic lights 125 junctions (25 Jul 2026). <https://en.philenews.com/local/public-works-smart-traffic-lights-nicosia-limassol> <span class="cite">(L35)</span>
372. Politis, 15 junctions at €41,900 (19 Aug 2026). <https://en.politis.com.cy/news/cy-news/1026947/smart-traffic-lights-planned-for-nicosia-limassol> <span class="cite">(L35)</span>
373. TendersOnTime, PS/14/2026/G(O). <https://www.tendersontime.com/tenders-details/supply-installation-and-operation-vehicle-actuated-signal-va-systems-signal-controlled-junctions-8c8ca86/> <span class="cite">(L35)</span>
374. Code: src/lib/truth-api.server.ts, src/routes/api/public/partners/apply.ts, src/lib/reliability.functions.ts, src/lib/eta-backtest.server.ts, src/lib/lake.server.ts, COMMERCIAL.md <span class="cite">(L35)</span>
375. ASU News, Cool Routes (10 Jun 2026). <https://news.asu.edu/20260610-environment-and-sustainability-new-cool-routes-app-maps-shadiest-routes-your-walk> <span class="cite">(L36)</span>
376. Planetizen, Cool Routes (16 Jun 2026). <https://www.planetizen.com/news/2026/06/137813-cool-routes-app-plots-shady-walks-arid-arizona> <span class="cite">(L36)</span>
377. Diari de Catalunya, AMB cool walking routes (14 Jul 2026). <https://diaricatalunya.cat/en/barcelones/general/new-app-to-find-the-coolest-walking-routes-in-barcelona> <span class="cite">(L36)</span>
378. The Guardian, Cool Walks Barcelona (23 Jun 2021). <https://www.theguardian.com/environment/2021/jun/23/cool-walks-app-maps-shady-spots-barcelona> <span class="cite">(L36)</span>
379. Android Authority, Google Maps sun and shade strings (6 Nov 2025). <https://www.androidauthority.com/google-maps-sun-shade-apk-teardown-3613515/> <span class="cite">(L36)</span>
380. Shade-oriented pathfinding, Dubai (Dec 2025). <https://www.sciencedirect.com/science/article/pii/S0198971525000900> <span class="cite">(L36)</span>
381. Cyprus Mail, July 2026 temperatures (6 Aug 2026). <https://cyprus-mail.com/2026/08/06/july-not-a-record-month-for-temperatures-despite-heatwave> <span class="cite">(L36)</span>
382. Cyprus Mail, red warning 45C (13 Aug 2025). <https://cyprus-mail.com/2025/08/13/red-weather-warning-issued-for-high-temperatures> <span class="cite">(L36)</span>
383. Cyprus Mail, heat and health (22 Jun 2026). <https://cyprus-mail.com/2026/06/22/why-cyprus-extreme-heat-is-more-dangerous-than-you-think> <span class="cite">(L36)</span>
384. Department of Meteorology AWS data. <https://www.dom.org.cy/AWS/ALL_STATIONS_average.html> <span class="cite">(L36)</span>
385. Net Effective Temperature. <https://www.dom.org.cy/AWS/AWS_NET.txt> <span class="cite">(L36)</span>
386. MeteoAlarm Cyprus feed. <https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-cyprus> <span class="cite">(L36)</span>
387. Open-Meteo pricing and terms. <https://open-meteo.com/en/pricing> <span class="cite">(L36)</span>
388. Code: src/lib/open-meteo.server.ts, src/lib/weather.functions.ts, src/routes/api/public/hooks/pulse-air.ts, src/routes/api/public/hooks/pulse-met-warnings.ts, src/routes/api/public/dust-advisory.ts, src/components/DustAdvisoryBanner.tsx, src/components/CrowdHint.tsx, packages/core/src/stop-condition.ts, src/lib/stop-seo.ts, src/lib/raptor.server.ts, packages/core/src/plan-score.ts <span class="cite">(L36)</span>
389. Politis, Limassol bus fares to rise (16 Sep 2026). <https://www.en.politis.com.cy/news/cy-news/1033287/limassol-bus-fares-to-rise-from-november> <span class="cite">(L37)</span>
390. Pafos Buses, tickets. <https://www.pafosbuses.com/tickets> <span class="cite">(L37)</span>
391. Intercity GTFS feed 5, fare_attributes.txt (31 Oct 2026). <https://www.motionbuscard.org.cy/opendata/downloadfile?file=GTFS%5C5_google_transit.zip&rel=True> <span class="cite">(L37)</span>
392. Visit Cyprus, Transportation (urban taxi tariff). <https://www.visitcyprus.com/useful-info/transportation> <span class="cite">(L37)</span>
393. Kathimerini, taxi fare changes (19 Sep 2026). <https://www.kathimerini.com.cy/gr/oikonomiki/oikonomia/nees-times-sta-komistra-ton-taxi-%E2%80%93-ti-akribainei> <span class="cite">(L37)</span>
394. GOV.UK, GHG conversion factors collection. <https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting> <span class="cite">(L37)</span>
395. 2025 values as listed. <https://www.greentryst.com/emission-factors/road-business-travel-bus-average-local-bus-scope-3-defra-2025> <span class="cite">(L37)</span>
396. 2025 values as listed. <https://scif.org.uk/news/how-we-calculate-travel-emissions/> <span class="cite">(L37)</span>
397. Aloya marketing, Motion card page. <https://aloya.cy/motion-card> <span class="cite">(L37)</span>
398. Code: packages/core/src/boarding-pay.ts, packages/core/src/taxi-quote.ts, packages/core/src/airport-cost.ts, roam-i18n done.co2 <span class="cite">(L37)</span>
399. TTC safety tips and Request Stop. <https://www.ttc.ca/riding-the-ttc/safety-and-security/Bus-streetcar-subway-and-station-safety-tips> <span class="cite">(L38)</span>
400. SafeTTC app. <https://www.ttc.ca/riding-the-ttc/safety-and-security/safe-ttc-app> <span class="cite">(L38)</span>
401. British Transport Police, 61016. <https://www.btp.police.uk/police-forces/british-transport-police/areas/campaigns/61016-text-service/> <span class="cite">(L38)</span>
402. GOV.UK, See it Say it Sorted relaunch (15 Sep 2025). <https://www.gov.uk/government/news/new-look-same-message-see-it-say-it-sorted> <span class="cite">(L38)</span>
403. Metro Transit 2026 safety and rider experience report. <https://www.metrotransit.org/media/zu1btyjy/2026-transit-safety-and-rider-experience-report.pdf> <span class="cite">(L38)</span>
404. Expatify, emergency numbers in Cyprus (29 Oct 2026). <https://expatifyguide.com/living/emergency-numbers-in-cyprus/> <span class="cite">(L38)</span>
405. New to Cyprus, emergency numbers sheet (26 Sep 2026). <https://newtocyprus.com/downloads/cyprus-emergency-numbers.pdf> <span class="cite">(L38)</span>
406. SPAVO. <https://domviolence.org.cy/en> <span class="cite">(L38)</span>
407. OSAC Cyprus country security report (Jun 2026). <https://www.osac.gov/Content/Report/c93b5a53-7258-4721-a239-1de42ee5a330> <span class="cite">(L38)</span>
408. Cyprus Mail, drivers threaten strike (15 Apr 2026). <https://cyprus-mail.com/2026/04/15/bus-drivers-threaten-strike-action-over-passenger-attack> <span class="cite">(L38)</span>
409. Drivers demand safety measures (21 Apr 2026). <https://cyprus-mail.com/2026/04/21/bus-drivers-demand-safety-measures-following-incident> <span class="cite">(L38)</span>
410. Politis, driver seriously injured (15 Apr 2026). <https://www.en.politis.com.cy/social-lens/998364/bus-driver-seriously-injured-in-passenger-attack-safety-concerns-grow> <span class="cite">(L38)</span>
411. Knews, EMEL driver assaulted (16 Jul 2026). <https://knews.kathimerini.com.cy/en/news/passenger-arrested-after-assault-on-female-bus-driver-in-limassol> <span class="cite">(L38)</span>
412. Code: mobile/components/ShareEtaButton.tsx, mobile/lib/useShareEta.ts, src/routes/api/public/eta-share.ts, src/routes/eta.$token.tsx, supabase/migrations/20260701161832_7824e729-e27b-42e5-8c86-354b101592f4.sql, packages/core/src/stop-condition.ts <span class="cite">(L38)</span>
413. Google Maps Help, Download areas and navigate offline. <https://support.google.com/maps/answer/6291838> <span class="cite">(L39)</span>
414. Protomaps documentation (PMTiles basemaps). <https://docs.protomaps.com/> <span class="cite">(L39)</span>
415. CYSTAT, Tourism Statistics 2025 (4 May 2026). <https://www.gov.cy/en/economy-and-finance/tourism-statistics-2025> <span class="cite">(L39, L40)</span>
416. Press release PDF. <https://library.cystat.gov.cy/NEW/Tourism%20Statistics-2025-EN-040526.pdf> <span class="cite">(L39)</span>
417. Code: src/lib/offline-schedules.ts, src/lib/offline-timetable-db.ts, public/sw.js, src/components/OfflineBanner.tsx, OfflineSchedulesCard, packages/core/src/raptor-core.ts, src/lib/raptor.server.ts, src/lib/basemap.ts, public/data/schedule (file sizes read at HEAD 56dab8f) <span class="cite">(L39)</span>
418. GTFS Schedule reference, translations.txt. <https://gtfs.org/documentation/schedule/reference/#translationstxt> <span class="cite">(L40)</span>
419. W3C, Structural markup and right-to-left text in HTML. <https://www.w3.org/International/questions/qa-html-dir> <span class="cite">(L40)</span>
420. CYSTAT, Census 2021 final results (9 Aug 2024). <https://www.gov.cy/en/economy-and-finance/census-of-population-and-housing-2021-final-results> <span class="cite">(L40)</span>
421. CYSTAT census table, population by language spoken best (1891616): (figures as compiled at. <https://cystatdb.cystat.gov.cy/pxweb/en/8.CYSTAT-DB/8.CYSTAT-DB__Population__Census%20of%20Population%20and%20Housing%202021__Population__Population%20-%20Language%2C%20Religion%2C%20Ethnic%20Religious%20Group/1891616G.px/> <span class="cite">(L40)</span>
422. CYSTAT census table, population by language spoken best (1891616): (figures as compiled at. <https://en.wikipedia.org/wiki/Demographics_of_Cyprus> <span class="cite">(L40)</span>
423. Nicosia GTFS feed 9, translations.txt (31 Oct 2026). <https://www.motionbuscard.org.cy/opendata/downloadfile?file=GTFS%5C9_google_transit.zip&rel=True> <span class="cite">(L40)</span>
424. Code: src/lib/i18n.ts, packages/core/src/dictionaries, src/lib/roam-i18n.ts, src/routes/__root.tsx, src/lib/email-templates/_layout.tsx, scripts/ingest-schedule.ts, src/lib/speech.ts <span class="cite">(L40)</span>
425. <https://blog.transitapp.com/autogo/> <span class="cite">(L41, L42)</span>
426. <https://transitapp.com/en/features/share-live-trips> <span class="cite">(L41, L43)</span>
427. <https://nowtoronto.com/news/transit-app-update-real-time-sharing> <span class="cite">(L41, L45)</span>
428. <https://citymapper.com/news/867/share-your-eta-as-you-move> <span class="cite">(L41, L43)</span>
429. <https://moovit.com/press-releases/moovit-plus-features> <span class="cite">(L41, L43)</span>
430. <https://apps.apple.com/cm/app/cyprus-transport/id6787795065> <span class="cite">(L41)</span>
431. Live app test, 31 Oct 2026 <span class="cite">(L41)</span>
432. Repo README.md and COMMERCIAL.md (redesign-roam) <span class="cite">(L41)</span>
433. Earlier session sources (Transportation Research Part F 2024 review <span class="cite">(L42)</span>
434. Singapore INSINC <span class="cite">(L42)</span>
435. Transportation Research Part D 2025 <span class="cite">(L42)</span>
436. Nature Human Behaviour 2019 <span class="cite">(L42)</span>
437. FHWA 2024) <span class="cite">(L42)</span>
438. Ummadum app listing <span class="cite">(L42)</span>
439. <https://www.gov.cy/metafores-epikoinonies-erga/leitourgia-dorean-park-and-ride-sto-stadio-alfamega-sto-kolossi-anakoinonei-to-ypourgeio-metaforon-epikoinonion-kai-ergon/> <span class="cite">(L42)</span>
440. <https://9to5google.com/2018/10/18/google-maps-trip-sharing-android-ios/> <span class="cite">(L43)</span>
441. <https://techcrunch.com/2023/11/15/google-maps-gets-more-social-feature-help-you-collaborate-with-friends/> <span class="cite">(L43)</span>
442. Repo: migrations-d1/0002 to 0005, mobile/app/group/[code].tsx <span class="cite">(L43)</span>
443. <https://cyprus.representation.ec.europa.eu/news/eu-funded-works-completed-agios-dhometiosmetehan-crossing-2026-02-13_en> <span class="cite">(L44)</span>
444. <https://www.lonelyplanet.com/articles/getting-around-cyprus> <span class="cite">(L44)</span>
445. <https://documents1.worldbank.org/curated/en/854931621588525204/pdf/Final-Strategy-and-Recommendations.pdf> <span class="cite">(L44)</span>
446. <https://aloya.cy/green-line> <span class="cite">(L44)</span>
447. Earlier session sources: Regulation 866/2004 <span class="cite">(L44)</span>
448. US travel advisory (13 Aug 2026) <span class="cite">(L44)</span>
449. COM(2026)324 <span class="cite">(L44)</span>
450. Law 71(I)/2013 <span class="cite">(L44)</span>
451. <https://themarkup.org/privacy/2021/12/06/the-popular-family-safety-app-life360-is-selling-precise-location-data-on-its-tens-of-millions-of-user> <span class="cite">(L45)</span>
452. <https://themarkup.org/privacy/2022/04/01/following-markup-investigation-u-s-regulators-questioned-life360s-data-practices> <span class="cite">(L45, L47)</span>
453. <https://www.cylaw.org/nomoi/enop/ind/2018_1_125/section-sc37ee18bb-ce6a-46ae-9441-b2ce6c435b56.html> <span class="cite">(L45, L48)</span>
454. <https://www.lexmundi.com/guides/global-data-privacy-guide/jurisdictions/europe/cyprus/> <span class="cite">(L45)</span>
455. <https://www.dataprotection.gov.cy/dataprotection/dataprotection.nsf/page2b_en/page2b_en?opendocument> <span class="cite">(L45)</span>
456. <https://www.limassol.org.cy/en/wine-festival-transportation> <span class="cite">(L46)</span>
457. <https://cyprus-mail.com/2022/09/17/free-transport-for-limassol-wine-festival-visitors> <span class="cite">(L46)</span>
458. (additional routes to Limassol Carnival, 26 Feb 2025). <https://intercity-buses.com/en/> <span class="cite">(L46)</span>
459. <http://production.larnakaregion.com.dedi3501.your-server.de/storage/app/media/EVENT%20DIARY/park-and-ride-kataklysmos-2026-kataklysmos-2026-special-park-ride-service.pdf> <span class="cite">(L46)</span>
460. <https://publictransport.com.cy/cms/page/express-route-x200> <span class="cite">(L46)</span>
461. <https://www.visitcyprus.com/wp-content/uploads/2026/10/ANNUAL_EVENTS_16_2026.pdf> <span class="cite">(L46)</span>
462. Live app test, Pulse tab, 31 Oct 2026 <span class="cite">(L46)</span>
463. <https://www.fleeteurope.com/en/maas/europe/features/umob-acquires-bankrupt-maas-global> <span class="cite">(L47)</span>
464. <https://m2050.media/en/maas-global-whim-files-for-bankruptcy-a-turning-point-for-the-sector/> <span class="cite">(L47)</span>
465. <https://sifted.eu/articles/maas-whim-bankrupt-news> <span class="cite">(L47)</span>
466. <https://www.globalfleet.com/en/maas/europe/analysis/maas-10-dead-say-hello-public-mobility> <span class="cite">(L47)</span>
467. <https://www.cutter.com/article/maas-delivering-its-promise-pragmatic-insights-perspectives> <span class="cite">(L47)</span>
468. <https://www.theguardian.com/world/2018/jan/28/fitness-tracking-app-gives-away-location-of-secret-us-army-bases> <span class="cite">(L47)</span>
469. <https://moovit.com/press-releases/moovit-plus-launch-business-strategy> <span class="cite">(L47)</span>
470. Repo: COMMERCIAL.md, README.md, mobile/app.json (redesign-roam) <span class="cite">(L47)</span>
471. <https://eur-lex.europa.eu/eli/dir/2023/2661/oj/eng> <span class="cite">(L48)</span>
472. <https://cylaw.org/nomoi/enop/ind/2024_1_57/section-sc88225479-c440-4671-85a0-29cbe8122fbb.html> <span class="cite">(L48)</span>
473. <https://conformahq.com/european-accessibility-act/cyprus> <span class="cite">(L48)</span>
474. <https://eur-lex.europa.eu/EN/legal-content/summary/accessibility-of-products-and-services.html> <span class="cite">(L48)</span>
475. <https://dataprotection.ro/servlet/ViewDocument?id=1742> <span class="cite">(L48)</span>
476. Repo: src/lib/basemap.ts (redesign-roam) <span class="cite">(L48)</span>
477. <https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/> <span class="cite">(L49)</span>
478. <https://support.google.com/googleplay/android-developer/answer/9799150> <span class="cite">(L49)</span>
479. <https://radar.com/blog/limitations-of-ios-geofencing> <span class="cite">(L49)</span>
480. <https://capacitorjs.com/docs/apis/geolocation> <span class="cite">(L49)</span>
481. <https://capgo.app/plugins/capacitor-live-activities/> <span class="cite">(L49)</span>
482. <https://developer.apple.com/app-store/review/guidelines> <span class="cite">(L49)</span>
483. Repo: mobile/app.json, src/lib/leave-time-adjuster.ts (redesign-roam) <span class="cite">(L49)</span>
484. <https://playwright.dev/docs/emulation> <span class="cite">(L50)</span>
485. <https://playwright.dev/docs/clock> <span class="cite">(L50)</span>
486. <https://playwright.dev/docs/api/class-clock> <span class="cite">(L50)</span>
487. <https://progressivewebapps.com/testing/automated-testing/> <span class="cite">(L50)</span>
488. Live app QA pass, 31 Oct 2026 19:34 EET (browser session aloya-qa) <span class="cite">(L50)</span>
489. Repo files: src/lib/basemap.ts, src/lib/leave-time-adjuster.ts, mobile/app.json, COMMERCIAL.md <span class="cite">(L50)</span>
490. Eurostat road_eqs_carhab. <https://ec.europa.eu/eurostat/databrowser/view/road_eqs_carhab/default/table> <span class="cite">(F1)</span>
491. Eurostat Statistics Explained. <https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Passenger_cars_in_the_EU> <span class="cite">(F1)</span>
492. Eurostat news 21 May 2025. <https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20250521-1> <span class="cite">(F1)</span>
493. Eurostat news 11 Mar 2026. <https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20260311-2> <span class="cite">(F1)</span>
494. CyStat Cyprus in Figures 2025. <https://library.cystat.gov.cy/NEW/CYPRUS_IN_FIGURES-2025-EN-121225.pdf> <span class="cite">(F1)</span>
495. MTCW 2025 report. <https://www.gov.cy/metafores-epikoinonies-erga/o-ypourgos-metaforon-epikoinonion-kai-ergon-parousiase-ton-apologismos-ergou-tou-ypourgeiou-metaforon-epikoinonion-kai-ergon-gia-to-2025/> <span class="cite">(F1)</span>
496. CPT 2025 rides. <https://www.linkedin.com/posts/cyprus-public-transport_cypruspublictransport-cpt-pameapp-activity-7418219283727503360-bXku> <span class="cite">(F1)</span>
497. EIB essay. <https://www.eib.org/en/stories/nicosia-tram-infrastructure> <span class="cite">(F1)</span>
498. Interreg Nicosia Action Plan. <https://www.interregeurope.eu/sites/default/files/inline/file_1575907520.pdf> <span class="cite">(F1)</span>
499. Larnaca SUMP. <https://www.mcw.gov.cy/mtcw/pwd/pwd.nsf/2AFCA415358C6C66C225874B00289C9B/$file/2.WP13_D13.1_LR.pdf> <span class="cite">(F1)</span>
500. SUM ODP Larnaca. <https://odp.sum-project.eu/living-lab-city/8> <span class="cite">(F1)</span>
501. Limassol cycling study. <https://www.um.edu.mt/library/oar/bitstream/123456789/124564/1/Policies_to_promote_cycling_in_Southern_European_island_cities.pdf> <span class="cite">(F1)</span>
502. Limassol Chamber. <https://www.limassolchamber.eu/En/articles/1596/2022/10/10/SUMP-and-the-northern-bypass---the-way> <span class="cite">(F1)</span>
503. TomTom Nicosia. <https://www.tomtom.com/traffic-index/city/nicosia/> <span class="cite">(F1)</span>
504. Knews TomTom 2024. <https://knews.kathimerini.com.cy/en/news/stuck-in-traffic-nicosia-emerges-as-one-of-the-world-s-slowest-city-drives> <span class="cite">(F1)</span>
505. Sigmalive 14 Oct 2026. <https://en.sigmalive.com/transport-minister-outlines-bus-tram-and-limassol-road-plans-for-2027> <span class="cite">(F1)</span>
506. Knews 1 Sep 2026. <https://knews.kathimerini.com.cy/en/news/september-traffic-is-back-and-the-school-run-hasn-t-even-started> <span class="cite">(F1)</span>
507. NECP 2024. <https://commission.europa.eu/document/download/3f73ef54-3448-4fbf-8287-98941f7cea2b_en?filename=CY+%E2%80%93+FINAL+UPDATED+NECP+2021-2030+%28English%29.pdf> <span class="cite">(F1)</span>
508. EPRS. <https://www.europarl.europa.eu/RegData/etudes/BRIE/2025/769495/EPRS_BRI%282025%29769495_EN.pdf> <span class="cite">(F1)</span>
509. CyI carbon pricing. <https://repository.cyi.ac.cy/bitstream/CyI/2488/1/CyI_Carbon%20Pricing%20and%20Fiscal%20Impact_May2024_draft.pdf> <span class="cite">(F1)</span>
510. SUMP overview. <https://sustainablemobility.cy/en/studies/> <span class="cite">(F1)</span>
511. Old GSP parking. <https://knews.kathimerini.com.cy/en/news/nicosia-s-old-gsp-goes-hi-tech-with-cashless-hassle-free-parking> <span class="cite">(F1)</span>
512. FastForward subsidies. <https://fastforward.com.cy/business/public-transport-7-bus-companies-shared-eu75-million-2023> <span class="cite">(F1)</span>
513. OSYPA audit. <https://www.kiprinform.com/en/news/audit-office-says-osypa-has-yet-to-acquire-40-contractually-required-buses/> <span class="cite">(F1)</span>
514. Smart stops. <https://cyprus-mail.com/2024/06/20/cyprus-to-install-300-smart-bus-stops> <span class="cite">(F1)</span>
515. Fares. <https://www.cyprus-mail.com/2026/07/20/bus-fare-hike-to-go-live-in-august> <span class="cite">(F1)</span>
516. Fares. <https://knews.kathimerini.com.cy/en/news/government-launches-personalized-student-bus-cards-with-reduced-fares> <span class="cite">(F1)</span>
517. Driver shortage. <https://cyprus-mail.com/2026/03/15/driver-shortage-derails-nicosia-bus-route> <span class="cite">(F1)</span>
518. Driver shortage. <https://cyprus-mail.com/2026/03/26/pame-express-to-run-two-more-months-amid-driver-shortage> <span class="cite">(F1)</span>
519. Driver shortage. <https://cyprus-mail.com/2026/08/07/new-transport-minister-to-consider-park-and-ride-expansion> <span class="cite">(F1)</span>
520. Driver shortage. <https://cyprus-mail.com/2025/01/24/bus-sector-calls-to-lower-driver-age-to-18> <span class="cite">(F1)</span>
521. Tram. <https://en.philenews.com/local/nicosia-limassol-mayors-tram-transport-ministry/> <span class="cite">(F1)</span>
522. Tram. <https://en.sigmalive.com/nicosia-mayor-calls-for-trams-to-be-considered-for-the-capital/> <span class="cite">(F1)</span>
523. Tram. <https://www.en.politis.com.cy/news/cy-news/1053752/nicosia-tram-dreams-stall-as-traffic-worsens> <span class="cite">(F1)</span>
524. Tram-axis bus lanes. <https://sustainablemobility.cy/en/projects/construction-of-bus-lanes-on-the-tram-axes-in-nicosia/> <span class="cite">(F1)</span>
525. RRF milestones. <https://sustainablemobility.cy/wp-content/uploads/2024/10/Resilience-Plan-for-Cyprus.pdf> <span class="cite">(F1)</span>
526. Limassol SUMP review. <https://cyprus-mail.com/2026/07/09/mps-demand-review-of-limassol-mobility-plan> <span class="cite">(F1)</span>
527. Park and ride. <https://cyprus-mail.com/2023/09/04/first-day-of-nicosias-new-park-and-ride-an-absolute-success> <span class="cite">(F1)</span>
528. Park and ride. <https://cyprus-mail.com/2024/04/08/charges-to-be-introduced-for-park-and-ride> <span class="cite">(F1)</span>
529. Park and ride. <https://en.philenews.com/insider/pame-express-bus-shuttle-faces-scrutiny-over-cost-effectiveness/> <span class="cite">(F1)</span>
530. Park and ride. <https://urban-mobility-observatory.transport.ec.europa.eu/news-events/news/larnaca-unveils-park-and-ride-plan-ease-traffic-2024-08-21_en> <span class="cite">(F1)</span>

</div>
