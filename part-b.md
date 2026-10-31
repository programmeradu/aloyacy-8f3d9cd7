# Part B: Routing intelligence (layers 11 to 20)

Researched and written 31 October 2026. Code references are to repo programmeradu/aloyacy-8f3d9cd7, branch redesign-roam, read at commit 5d818e8 (HEAD moved to 56dab8f during the work, a journeys UI fix). Cyprus timetable figures come from the seven official GTFS feeds published at motionbuscard.org.cy (feed version dated 20261031, valid 31 Oct 2026 to 28 Jan 2027), analysed for Tuesday 3 November 2026 with the script saved at work/partb-better-stop-analysis.py.

Effort scale: S = days, M = one to three weeks, L = a month or more. Impact: Low, Medium, High, Very high.

---

## Layer 11. True multimodal routing: any mode joins any transit leg, anywhere, including mid-trip, and keeps re-optimising

### 11.1 What the best in the world do

**The algorithms.**

- **RAPTOR and McRAPTOR.** Delling, Pajor and Werneck introduced RAPTOR (Round-bAsed Public Transit Optimized Router) at ALENEX 2012, later in Transportation Science 49(3), 2015. It works directly on the timetable in rounds, one round per extra vehicle, scanning each route at most once per round, and needs no preprocessing, so it copes with live delays. McRAPTOR keeps a "bag" of Pareto-optimal labels per stop so it can optimise extra criteria such as walking or fare. [1][2]
- **MCR (multimodal McRAPTOR).** Delling, Dibbelt, Pajor, Wagner and Werneck ("Computing Multimodal Journeys in Practice", SEA 2013) extended McRAPTOR to unrestricted walking, cycling, bike share and taxi. Each round has a timetable phase and a phase that runs a multi-label Dijkstra on the street networks. Picking up a hire bike counts as a "trip", so bike share sits between buses exactly like another vehicle. They argue users optimise three things: arrival time, convenience (number of trips, walking) and cost. Because the full Pareto set is too large, they score it with fuzzy dominance and show only the top few. Their London tests found that limiting transfer walks to 10 minutes barely hurt quality, but also limiting the first and last walk to 15 minutes badly hurt it (the heuristic MCR-t10-r15 matched only 38% of the reference top three). With taxis added, an all-taxi journey dominates unless cost is a criterion. [3]
- **CSA (Connection Scan Algorithm).** Dibbelt, Pajor, Strasser and Wagner (JEA 23, 2018) store every connection (a vehicle going from one stop to the next) in one array sorted by departure, and scan it once. It adapts trivially to delays and has a variant (MEAT) for expected arrival under uncertain delays. [4]
- **ULTRA (UnLimited TRAnsfers).** Baum, Buchhold, Sauer, Wagner and Zündorf (ESA 2019; Transportation Science 2023) precompute a small set of "transfer shortcuts" over an unrestricted walking, cycling or e-scooter graph, so RAPTOR, CSA or Trip-Based routing can use unlimited transfers with no speed loss. Initial and final transfers use Bucket-CH. On Germany, ULTRA-CSA answered in 142.5 ms against 1,696 ms for multimodal CSA. [5][6]
- **Bike share with ULTRA.** Sauer, Wagner and Zündorf (SEA 2020) handled several competing bike-share operators, either by tracking which operator's bike the rider holds or by expanding the network per operator. [7]
- **McULTRA, McTB and HydRA.** Potthoff and Sauer (ALENEX 2022; ATMOS 2022) showed that time spent in each non-scheduled mode must be its own criterion, otherwise sensible "less walking, one more bus" answers disappear. Their "multimodal discomfort scenario" forbids switching mode in the middle of a single transfer, adds a fixed overhead per mode (they used 300 s for an e-scooter, 0 s for walking, scooter 15 km/h, walking 4.5 km/h), and computes a "restricted Pareto set" (journeys within 25% of an anchor journey's trips and duration). UBM-HydRA answers in about 30 ms on London, Switzerland and Stuttgart. They argue cars should be access or egress modes only, not transfer modes, because car legs cause a combinatorial explosion of poor journeys. [8]
- **Non-scheduled lines.** SEA 2022 work integrates lines with fixed stop sequences but no timetable (on-demand), and bike share, into Trip-Based routing. [9]
- **Hypergraph models.** López and Lozano (Transportation Research Part A, 2020) compute shortest hyperpaths in a multimodal hypergraph where some lines publish real-time arrivals: a hyperpath is a strategy ("board whichever of these lines comes first") rather than one fixed path. TERP (IEEE IoT Journal, 2019) builds a London network with bus, tube, bike-share stock and walking, optimising duration and reliability together. [10][11]

**Continuous en-route re-optimisation (Samuel's addition).**

- Abuaisha, Shen, Harabor, Stuckey and Wallace ("Dynamic Replanning for Improved Public Transport Routing", IJCAI 2025) formalise exactly what Samuel describes. Key observation: a rider can only act at a stop, so replanning just before arriving at every stop is the finest useful granularity. They compare static plans, a single snapshot replan, replanning only when your own journey is delayed, and full dynamic replanning at every stop. Against a single snapshot replan, full replanning changed the outcome for 20% to 66% of queries depending on city and saved 10.6 to 30.2 minutes on average for those. Even against "replan only when my journey is late", it still saved 4.6 to 6.0 minutes on 10% to 21% of queries, because another line running late can create a newly catchable, faster connection. Their "push" design has the server compute an envelope (only the connections that could still beat the current arrival time, 2.8% to 7.5% of the timetable), send it to the phone, and let the phone re-run CSA locally whenever delay updates arrive; the server is called again only when the rider's own journey slips (3.7% to 6.0% of stops). Pushed data averaged 1.4 to 4.8 MB per journey on cities far larger than Cyprus. [12]
- Transit (the app) GO "will automatically reroute you if you miss your bus" and tells you to walk faster to make a connection; Citymapper GO gives get-off alerts that work offline and reroutes walks. Neither publicly documents proactive "get off early for a faster line" advice. [13][14]
- Moovit Assistant (August 2026) analyses route options in real time and flags short transfer times. [15]

**Engines that already do multimodal.** OpenTripPlanner 2 supports bike, scooter and car rental from GBFS (including a GBFS v3 manifest directory) and the "keep the vehicle at the destination" option. [16] MOTIS and Transitous are covered in layer 14.

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
5. **Server-built envelope, on-phone continuous replanning (the "push" design).** At trip start, the Worker computes the journey plus an envelope: every connection that could still beat the planned arrival, using lower-bound travel times between stops (two Dijkstra searches on a precomputed time-independent stop graph, as in [12]). The phone stores it and re-runs a small CSA locally whenever a GTFS-RT update arrives and always just before each stop. The Worker is called again only when the rider's own plan slips. This fits the 10 ms Worker CPU limit because the heavy work runs on the phone. Effort L. Impact Very high.
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

### 11.5 Sources

[1] Delling, Pajor, Werneck, "Round-Based Public Transit Routing", ALENEX 2012. https://www.microsoft.com/en-us/research/wp-content/uploads/2012/01/raptor_alenex.pdf
[2] Same authors, Transportation Science 49(3), 2015. https://doi.org/10.1287/trsc.2014.0534
[3] Delling, Dibbelt, Pajor, Wagner, Werneck, "Computing Multimodal Journeys in Practice", SEA 2013. http://tpajor.com/assets/paper/ddpww-cmjp-13.pdf
[4] Dibbelt, Pajor, Strasser, Wagner, "Connection Scan Algorithm", ACM JEA 23, 2018. https://doi.org/10.1145/3274661 ; https://arxiv.org/abs/1703.05997
[5] Baum et al., "UnLimited TRAnsfers for Multi-Modal Route Planning", ESA 2019. https://drops.dagstuhl.de/storage/00lipics/lipics-vol144-esa2019/LIPIcs.ESA.2019.14/LIPIcs.ESA.2019.14.pdf
[6] Baum et al., "ULTRA", Transportation Science 2023. https://doi.org/10.1287/trsc.2022.0198 ; code https://github.com/kit-algo/ULTRA
[7] Sauer, Wagner, Zündorf, "Faster Multi-Modal Route Planning With Bike Sharing Using ULTRA", SEA 2020. https://drops.dagstuhl.de/storage/00lipics/lipics-vol160-sea2020/LIPIcs.SEA.2020.16/LIPIcs.SEA.2020.16.pdf
[8] Potthoff, Sauer, "Efficient Algorithms for Fully Multimodal Journey Planning", ATMOS 2022. https://drops.dagstuhl.de/storage/01oasics/oasics-vol106-atmos2022/OASIcs.ATMOS.2022.14/OASIcs.ATMOS.2022.14.pdf ; "Fast Multimodal Journey Planning for Three Criteria", https://arxiv.org/html/2110.12954v1
[9] "Routing in Multimodal Transportation Networks with Non-Scheduled Lines", SEA 2022. https://drops.dagstuhl.de/storage/00lipics/lipics-vol233-sea2022/LIPIcs.SEA.2022.6/LIPIcs.SEA.2022.6.pdf
[10] López, Lozano, "Shortest hyperpaths in a multimodal hypergraph with real-time information on some transit lines", Transportation Research Part A, 2020. https://doi.org/10.1016/j.tra.2019.09.020
[11] TERP, IEEE Internet of Things Journal, 2019. https://doi.org/10.1109/jiot.2019.2894511
[12] Abuaisha, Shen, Harabor, Stuckey, Wallace, "Dynamic Replanning for Improved Public Transport Routing", IJCAI 2025. https://arxiv.org/html/2505.14193v1
[13] Transit app FAQ. https://transitapp.com/faqs-en
[14] Citymapper, "Get Off Alerts" and "Lock Screen Navigation". https://citymapper.com/news/823/get-off-alerts ; https://citymapper.com/news/2553/citymapper-introduces-ios-lock-screen-navigation
[15] Moovit Help Center, "Moovit Assistant" (19 Aug 2026). https://support.moovitapp.com/hc/en-us/articles/35543186031634-Moovit-Assistant-Smarter-Trip-Planning-Than-Ever-Before
[16] OpenTripPlanner 2 docs, Vehicle Rental Service Directory. https://docs.opentripplanner.org/en/latest/sandbox/VehicleRentalServiceDirectory/
Cyprus GTFS feeds: https://motionbuscard.org.cy/opendata (files 2, 4, 5, 6, 9, 10, 11 _google_transit.zip, version 20261031).

---

## Layer 12. "Go to a better stop": frequency- and speed-aware access by walking, cycling, scooting or a ride

### 12.1 What the best in the world do

**What riders actually do.** The evidence that people go further for better service is strong and consistent:

- Stated preference across cities (Mulley, Ho, Ho, Hensher and Rose, Transport Policy 69, 2018): riders would walk 226 m to 302 m further in Australian capitals, and 370 m to 475 m further in the UK and US, for a 10-minute cut in headway. [1]
- A Porto Alegre study found 520 m extra walking accepted for 10 minutes less waiting. [2]
- In a survey of 1,402 bus users, half were willing to walk further (on average 521 m) to their usual stop if frequency improved. [3]
- Dutch stated preference (879 respondents): bus frequency at the stop and street lighting on the route are the strongest influences on the maximum distance people will walk. [4]
- Dublin: catchments of high-quality bus services reached over 1,400 m, comparable to or larger than light rail and metro; 65% of bus trip origins were more than 500 m from the stop. [5]
- Montréal (McGill): each extra minute of waiting reduces the distance users walk by a little over 2 m on average, and distances walked to buses are shorter than to rail. [6]
- Tram feeder study: median walking feeder distance 380 m, median cycling feeder distance 1,025 m, so cycling roughly triples the useful catchment. [7]

**How waiting really works.** The classic "expected wait = half the headway" assumes random arrivals and perfectly regular buses. The general formula is E[W] = E[H]/2 x (1 + Var(H)/E[H]^2), so irregular service makes the wait longer than half the headway. [8] Real riders time their arrival at longer headways: Austin data put the switch from random to non-random arrivals at an 11-minute headway [9]; Zürich found some people consult schedules even at 5-minute headways [10]; London bus stops with 6 to 31 minute headways showed waits about 30% lower than random arrival would give. [11] For an app that knows the timetable and live position, the rider can wait at home or at their desk, so the honest cost of a sparse stop is not the wait at the kerb but a later arrival at the destination, plus the risk of missing the one bus.

**Strategies over single lines.** Spiess and Florian's "optimal strategies" (Transportation Research B, 1989) formalise choosing an attractive set of lines at a stop and boarding the first to arrive: combined waiting depends on combined frequency, and a line is added to the set only if it lowers expected total time. This is how a stop served by four lines that all go your way beats a nearer stop served by one. [12]

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

- Nextbike Cyprus (31 Oct 2026 snapshot of its public live feed): 96 stations in Limassol, 89 in Nicosia, 48 in Larnaca, 44 in Paphos, 35 in Famagusta, with 877 bikes available island-wide. Nextbike also publishes an official GBFS v2 feed (system id nextbike_cy, CC0 licence). [13][14]
- Bolt e-scooters in Nicosia: the CyNAP Datex II feed (publication time 30 Oct 2026) lists 255 Bolt parking zones with a stated total capacity of 1,779 places; live vehicle positions are not public. [15]
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

### 12.5 Sources

[1] Mulley, Ho, Ho, Hensher, Rose, "Will bus travellers walk further for a more frequent service? An international study using a stated preference approach", Transport Policy 69, 2018. https://ideas.repec.org/a/eee/trapol/v69y2018icp88-97.html ; working paper https://ses.library.usyd.edu.au/bitstream/handle/2123/19115/ITLS-WP-17-17.pdf
[2] Porto Alegre stated preference study, Transportes 29(3), 2021. https://doi.org/10.14295/transportes.v29i3.2647
[3] "Characteristics associated with willingness to walk further than necessary to the bus stop", Journal of Transport and Health, 2021. https://www.sciencedirect.com/science/article/abs/pii/S2214140521001699
[4] "Exploring the role of public transport service and walking route related factors to identify maximum walking distances to bus stops in the Netherlands", Journal of Public Transportation, 2024. https://doi.org/10.1016/j.jpubtr.2024.100096
[5] "Level of service and the transit neighbourhood: Observations from Dublin city and suburbs", Research in Transportation Economics, 2018. https://doi.org/10.1016/j.retrec.2018.07.014
[6] El-Geneidy et al., "New evidence on walking distances to transit stops", McGill TRAM. https://www.tram.mcgill.ca/Research/Publications/Transit_service_area.pdf
[7] "Walking and bicycle catchment areas of tram stops: factors and insights", MT-ITS 2019. https://doi.org/10.1109/mtits.2019.8883361
[8] Bus wait time model with headway variance, TRR 663, 1978. https://onlinepubs.trb.org/Onlinepubs/trr/1978/663/663-012.pdf
[9] Fan, Machemehl, "Do Transit Users Just Wait for Buses or Wait with Strategies?", TRR 2111, 2009. https://doi.org/10.3141/2111-19
[10] Luethi, Weidmann, Nash, "Passenger arrival rates at public transport stations", 2007. https://www.andynash.com/nash-publications/Luethi2007-pax-arrivals-TRB-paper.pdf
[11] "A Behavioural Explanation of the Association Between Bus and Passenger Arrivals at a Bus Stop", Transportation Science 9(3). https://dl.acm.org/doi/10.1287/trsc.9.3.248
[12] Spiess, Florian, "Optimal strategies: A new assignment model for transit networks", Transportation Research B 23(2), 1989. https://doi.org/10.1016/0191-2615(89)90034-9
[13] Nextbike live feed. https://maps.nextbike.net/maps/nextbike-live.json?city=190,206,940,957,889 (read 31 Oct 2026)
[14] Nextbike Cyprus GBFS. https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_cy/gbfs.json
[15] CyNAP, "Bolt e-Scooter Stations" (Datex II, CC BY 4.0). https://www.traffic4cyprus.org.cy/dataset/bolt ; resource https://fixcyprus.cy/gnosis/open/api/nap/datasets/boltstations/
Own analysis: work/partb-better-stop-analysis.py on the official GTFS feeds.

---

## Layer 13. Reliability-weighted and probabilistic routing

### 13.1 What the best in the world do

- **Minimum expected arrival time (MEAT) and decision graphs.** Dibbelt, Strasser and Wagner (ATMOS 2014) compute not one path but a decision graph of every stop and vehicle that might be relevant, with delays modelled stochastically, minimising expected arrival while bounding the latest arrival over all sub-paths, and show how to present it compactly. The Connection Scan Algorithm paper (JEA 2018) includes a MEAT variant. [1][2]
- **Backup itineraries.** Redmond, Campbell and Ehmke (European Journal of Operational Research 300(3), 2022) maximise the probability of reaching the destination within a travel time budget, choosing a primary itinerary plus backups for each transfer that might fail. [3]
- **Learning from the past.** Böhmová et al. (ATMOS 2013, 2015) computed reliable journeys from historic delay data in Zürich. [4]
- **Dynamic replanning beats static backup plans.** The IJCAI 2025 study (layer 11) notes that precomputed backup plans miss earlier-arrival opportunities that live replanning catches; the two are complementary: a robust plan first, then replanning. [5]
- **Delay-robust multimodal routing.** Bez and Sauer (2023) made ULTRA delay-robust so shortcuts stay valid under delays up to a bound. [6]
- **Empirical delay in a production engine.** OpenTripPlanner 2.9 added an Empirical Delay module (contributed by Entur): historical p50 and p90 delay per trip and stop, by day-type calendar, used to add realistic transfer buffers, rank alternatives by historical reliability and adjust predictions beyond the real-time horizon, and to tell riders "90% of the time this bus arrives within 5 minutes of schedule". [7]
- **Connection scores shown to riders.** Bahn-Vorhersage shows a "connection score" for German trains computed from machine-learning delay predictions and transfer time; a 90% score means a 10% chance that at least one connection fails. Bahnsparer shows a calibrated reliability value and a "9 out of 10 by" arrival time from past trips. The DB Navigator labels connections "expected to be reached" and can filter to "only connections that can still be made". [8][9][10]
- **Prediction uncertainty in the data standard.** GTFS-Realtime StopTimeEvent has an optional `uncertainty` field; omitted means unknown. [11]
- **Bus delay distributions are skewed.** The IJCAI 2025 study used exponential delays with mean 5 min off-peak and 10 min peak for buses in mixed traffic, a reasonable prior when local data is thin. [5] Classic waiting-time theory adds headway variance: E[W] = E[H]/2 x (1 + Var(H)/E[H]^2). [12]

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

### 13.5 Sources

[1] Dibbelt, Strasser, Wagner, "Delay-Robust Journeys in Timetable Networks with Minimum Expected Arrival Time", ATMOS 2014. https://drops.dagstuhl.de/entities/document/10.4230/OASIcs.ATMOS.2014.1
[2] Dibbelt, Pajor, Strasser, Wagner, "Connection Scan Algorithm", JEA 2018. https://doi.org/10.1145/3274661
[3] Redmond, Campbell, Ehmke, "Reliability in public transit networks considering backup itineraries", EJOR 300(3), 2022. https://ideas.repec.org/a/eee/ejores/v300y2022i3p852-864.html
[4] Böhmová et al., "Robust Routing in Urban Public Transportation: Evaluating Strategies that Learn From the Past", ATMOS 2015. https://drops.dagstuhl.de/entities/document/10.4230/OASIcs.ATMOS.2015.68
[5] Abuaisha et al., "Dynamic Replanning for Improved Public Transport Routing", IJCAI 2025. https://arxiv.org/html/2505.14193v1
[6] Bez, Sauer, "Fast and Delay-Robust Multimodal Journey Planning", 2023. https://arxiv.org/pdf/2310.20554
[7] OpenTripPlanner, Empirical Delay sandbox (OTP 2.9). https://docs.opentripplanner.org/en/latest/sandbox/EmpiricalDelay/
[8] Bahn-Vorhersage. https://bahnvorhersage.de/
[9] Bahnsparer, "Zuverlässigkeit und Ankunftsmodelle". https://bahnsparer.de/technik/zuverlaessigkeit?lang=de
[10] DB Navigator. https://www.bahn.de/service/mobile/db-navigator
[11] GTFS Realtime Reference, StopTimeEvent.uncertainty. https://gtfs.org/documentation/realtime/reference/
[12] TRR 663 (1978), bus waiting time with headway variance. https://onlinepubs.trb.org/Onlinepubs/trr/1978/663/663-012.pdf
Own decode of the Cyprus GTFS-RT feed, 31 Oct 2026 19:43 EET: http://20.19.98.194:8328/Api/api/gtfs-realtime

---

## Layer 14. Routing engines for Aloya on a free Cloudflare budget: OTP2, MOTIS 2, R5, Valhalla, GraphHopper, Navitia, Transitous

### 14.1 What the best in the world do, engine by engine

| Engine | What it is | Multimodal and real-time | Hosting needs | Fit for Aloya |
|---|---|---|---|---|
| **OpenTripPlanner 2** (Java, LGPL) | The most widely deployed open journey planner (Entur in Norway, Digitransit in Finland). RAPTOR-based transit search. | GTFS, NeTEx, GTFS-RT, SIRI, GBFS rental (including the GBFS v3 manifest directory), park and ride, GTFS-Flex (sandbox), fares, ride-hailing, emissions, and since 2.9 Empirical Delay (p50 and p90 delays). [1][2] | Memory-hungry: "from less than one GB to more than 100 GB"; all of Finland takes a bit over 10 GB, Germany 95 GB. Single-thread speed and CPU cache matter. Entur runs c4-standard-8 instances. [3] | Excellent features; Cyprus is small, so it would likely fit in a few GB, but it needs a JVM server running all the time. |
| **MOTIS 2** (C++, MIT) | Modular Open Transportation Information System; powers Transitous. | OSM, multiple GTFS and NeTEx feeds (including GTFS-Flex and Fares v2), GTFS-RT, SIRI-ET/SX/FM, VDV 454, GBFS with geofencing, station status and vehicle availability; routing, geocoding, reverse geocoding and map tiles in one binary; REST API with OpenAPI spec and a JS client. "Optimised for high performance with low memory usage"; a full year of timetable costs barely more RAM than a month. [4] | Single binary: `motis import` then `motis server`. Smallest footprint of the full-featured engines. | Best technical match for a self-hosted, low-cost Cyprus planner. |
| **Transitous** (community MOTIS 2 instance) | Free, global MOTIS 2 API at api.transitous.org, run by volunteers. | Already ingests all seven Cyprus operators' GTFS (via Transitland) and per-operator GTFS-RT endpoints `.../gtfs-realtime/{2,4,5,6,9,10,11}`. No Cyprus GBFS yet. [5][6] | None for Aloya. | Policy: only open-source, non-commercial, low-resource projects; over 720 `/plan` requests per day needs coordination; commercial use not allowed. [5] Aloya is MIT-licensed but has paid (Pro) features, so production use is not appropriate; testing, benchmarking and contributing data are. |
| **R5** (Java, MIT) | Conveyal's engine for accessibility analysis. | Multimodal, departure-time windows. | JVM. | Conveyal's maintainers say R5 is focused on analysis, not passenger-facing journey planning; point-to-point routing is second-class. [7] Use it (or r5r) for network analysis, not for the app. |
| **Valhalla** (C++, MIT) | Road routing engine with a `multimodal` costing that combines walking and GTFS transit. | No GTFS-Realtime support and no plans from the core team ("Commercial interest in public transit is sadly pretty low"). Transit service days limited to 60 days from tile creation. [8][9] | Small, tiled. | Good for walking, cycling and driving legs (it could replace Mapbox for walk and bike routing), not for the transit core. |
| **GraphHopper** (Java, Apache 2.0) | Road routing plus a `reader-gtfs` public transit module with GTFS-RT. Version 11.0 (Oct 2025) added a much faster transit solver. [10][11] | GTFS and GTFS-RT; I found no GBFS support in the open-source PT module. | JVM. | Viable but less complete for multimodal than OTP or MOTIS. |
| **Navitia** (Hove) | Long-standing open-source passenger information API. | Multimodal. | Heavy, multi-service. | Hove announced it is progressively closing its GitHub repositories; the historic version stays available. [12] Not a safe foundation. |

### 14.2 The reality for Aloya: budget and data size

- **Cloudflare Workers Free:** 10 ms CPU per HTTP request, 128 MB memory per isolate, 100,000 requests per day, 50 subrequests per request, 5 Cron Triggers per account. Workers Paid ($5 per month) raises CPU to 30 s by default and up to 5 min. [13] Aloya already hit the CPU wall, which is why the timetable search runs in the browser.
- **Cloudflare Containers** are not available on the Free plan; on Workers Paid they include 25 GiB-hours of memory and 375 vCPU-minutes per month, with instance types from 256 MiB up to 12 GiB. [14] A routing engine that must stay warm all day would exceed the included hours (a 4 GiB "standard-1" instance running 24/7 is about 2,900 GiB-hours per month), so Containers suit occasional batch jobs, not a resident planner.
- **Oracle Cloud Always Free** now gives 2 Ampere A1 OCPUs and 12 GB memory in total, 200 GB block storage and 10 TB monthly egress, but idle instances (95th percentile CPU, network and memory all under 20% for 7 days) may be reclaimed. [15] That is enough for MOTIS 2 or OTP2 for Cyprus.
- **Data size:** the Cyprus OpenStreetMap extract is about 38 MB (Geofabrik, 31 Oct 2026, whole island) and the seven GTFS feeds total about 13 MB zipped. [16] Both are tiny by routing-engine standards.
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

### 14.5 Sources

[1] OpenTripPlanner 2 documentation (sandbox list, GBFS, Flex, park and ride). https://docs.opentripplanner.org/en/latest/sandbox/VehicleRentalServiceDirectory/
[2] OTP Empirical Delay. https://docs.opentripplanner.org/en/latest/sandbox/EmpiricalDelay/
[3] OTP System Requirements. https://docs.opentripplanner.org/en/latest/System-Requirements/
[4] MOTIS repository README. https://github.com/motis-project/motis
[5] Transitous API and usage policy. https://transitous.org/api/
[6] Transitous Cyprus feed list. https://raw.githubusercontent.com/public-transport/transitous/main/feeds/cy.json
[7] conveyal/r5 issue 575. https://github.com/conveyal/r5/issues/575
[8] Valhalla issue 5381, GTFS-Realtime support. https://github.com/valhalla/valhalla/issues/5381
[9] Valhalla discussion 6069, 60-day service window. https://github.com/valhalla/valhalla/discussions/6069
[10] GraphHopper 11.0 release notes. https://www.graphhopper.com/blog/2025/10/14/graphhopper-routing-engine-11-0-released/
[11] GraphHopper reader-gtfs (GTFS-RT in PtRouterImpl). https://github.com/graphhopper/graphhopper/blob/master/reader-gtfs/src/main/java/com/graphhopper/gtfs/PtRouterImpl.java
[12] hove-io/navitia README notice. https://github.com/hove-io/navitia
[13] Cloudflare Workers limits (updated 29 Oct 2026). https://developers.cloudflare.com/workers/platform/limits/
[14] Cloudflare Containers pricing (updated 5 Oct 2026). https://developers.cloudflare.com/containers/pricing/
[15] Oracle Cloud Always Free resources. https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
[16] Geofabrik Cyprus extract (37,856,760 bytes, Last-Modified 31 Oct 2026). https://download.geofabrik.de/europe/cyprus.html

---
## Layer 15. Cyprus data standards: GTFS, GTFS-RT, SIRI, GBFS (Nextbike, Bolt), NeTEx, Datex II and the National Access Point under MMTIS

### 15.1 What the best in the world do

- **The EU rulebook.** Delegated Regulation (EU) 2017/1926 on multimodal travel information services (MMTIS), amended by Delegated Regulation (EU) 2024/490, requires every Member State to run a National Access Point (NAP) and data holders to publish static data in NeTEx (CEN/TS 16614) and dynamic data in SIRI (CEN/TS 15531), "or any digital machine-readable format that can be proven fully compatible and interoperable with those standards ... including for example through automatic converters and validators", represented through EU minimum profiles or national profiles. [1]
- **Deadlines in the amended regulation:** [1]
  - static levels 1 to 3 (timetables, stops, operators, fares, parking places, Park and Ride stops, bike-share stations, scooter parking zones) were due between 1 Dec 2019 and 1 Dec 2024;
  - level 4 (historic delays and observed delays and cancellations, parking tariffs) by 1 Dec 2025 for the whole network;
  - dynamic level 1 (disruptions, real-time estimated times, delays, cancellations, "guaranteed connections monitoring") by 1 Dec 2025 for the comprehensive TEN-T network;
  - dynamic level 2 (parking tariffs, car-sharing, bike-sharing and scooter-sharing availability and location, free car parking spaces) by 1 Dec 2026 for TEN-T;
  - both levels for the rest of the network by 1 Dec 2028; vehicle occupancy (level 3) at each Member State's choice.
- **Obligations that touch apps like Aloya:** Article 7 says travel information service providers shall, on request, provide routing results to another travel information service provider. Article 8 says ranking criteria must be transparent and not based on commercial considerations, the first itinerary shown must not mislead, and the data source and update interval must be indicated when the data holder requires it. [1]
- **Best-practice NAPs** (for example the Norwegian Entur and the Swiss opentransportdata.swiss) publish NeTEx and SIRI alongside GTFS and GTFS-RT, with validators and quality reports. The DATA4PT project produced the EU minimum profiles for NeTEx and SIRI. [2][3]
- **GBFS** (General Bikeshare Feed Specification, MobilityData) is the open standard for shared bikes and scooters, with stations, vehicles, geofencing zones and pricing; the current specification is in the v3 line. [4]
- **GTFS best practice** includes transfers.txt (minimum and timed transfers), parent stations for multi-bay stops, wheelchair_boarding and wheelchair_accessible, and GTFS-RT with Service Alerts and, optionally, occupancy and the `uncertainty` field. [5]

### 15.2 The reality in Cyprus

**The NAP is real and fairly rich.** traffic4cyprus.org.cy (CKAN) lists 42 datasets, almost all CC BY 4.0. [6] Relevant to routing:

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

**GBFS.** Nextbike publishes an official GBFS v2 feed for Cyprus (`nextbike_cy`, CC0, feed contact gbfs@nextbike.net, ttl 60 s) with station_information, station_status, free_bike_status, vehicle_types, system_hours, system_regions and pricing plans. [7] Bolt publishes no public GBFS for Cyprus; only the static zone list on the NAP.

**NeTEx.** No NeTEx dataset is listed on the Cyprus NAP. [6]

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

### 15.5 Sources

[1] Commission Delegated Regulation (EU) 2024/490 amending (EU) 2017/1926. https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32024R0490
[2] MMTIS implementation handbook (European Commission, Nov 2024). https://transport.ec.europa.eu/document/download/0b75db16-35b1-41df-8229-5c8abfec534d_en?filename=MMTIS_implementation_handbook.pdf
[3] DATA4PT, D3.2 Profile preparation. https://data4pt-project.eu/wp-content/uploads/2024/09/D.3.2-Profile-Preparation_v.f1.pdf
[4] GBFS specification. https://gbfs.org/specification/
[5] GTFS Realtime reference. https://gtfs.org/documentation/realtime/reference/
[6] Cyprus National Access Point, CKAN API (package list and resources). https://www.traffic4cyprus.org.cy/api/3/action/package_search?rows=100 ; https://www.traffic4cyprus.org.cy/dataset/publictransportrealtime_siri
[7] Nextbike Cyprus GBFS system_information. https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_cy/en/system_information.json
Own checks of the seven GTFS zips and the NAP Datex II files on 31 Oct 2026.

---
