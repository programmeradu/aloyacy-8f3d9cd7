# Part D: Data and AI (Layers 31 to 40)

Written 31 Oct 2026 for the Aloya 50-layer research book. Code references are to repo programmeradu/aloyacy-8f3d9cd7, branch redesign-roam, read at commit 56dab8f (31 Oct 2026). Live data checks (the national GTFS-RT feed and the CyNAP open endpoints) were run from the sandbox on 31 Oct 2026. Built from the first-run seed (part-d-seed.md), then re-checked against the code and deepened; where the code check changed a seed claim, the section says so.

Layers: 31 Open datasets, 32 Crowding, 33 AI assistant, 34 Feed anomaly and quality, 35 B2B/B2G analytics, 36 Heat and weather routing, 37 Cost, time and carbon comparison, 38 Safety, 39 Offline, 40 Multilingual.

Shared facts used in several layers:
- Live GTFS-RT read, 31 Oct 2026 17:45 UTC (19:45 Nicosia), from the direct feed Aloya uses (gtfs-rt.server.ts line 32): header 7 s old, GTFS-RT 2.0, 166 vehicles, all with trip_id, speed and bearing; vehicle timestamps a median 45 s old; 268 trip updates carrying 4,670 stop-time updates, all with a delay value; 0 service alerts; 0 occupancy values. 136 of the 166 vehicles' trips had a trip update; 132 trip updates had no vehicle (these may include trips that had not started).
- Audit Office special report on Nicosia buses (published 14 Oct 2026; fieldwork Nov to Dec 2025, 110 staff riding as ordinary passengers): 63% would not choose the bus again; 55% of stops had no route information; 32% had no shelter and another 22% had neither shelter nor seating; app and website stop positions were 85 to 135 m off in some cases; some lines run hourly or two-hourly; six of nine test journeys needed two buses; no card payment on board; car owners do not automatically save money by switching (Cyprus Mail, 14 Oct 2026).

---

## Layer 31. Open datasets

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
5. **Mapillary features for stops.** For each stop, query object--bench, object--street-light and object--trash-can within 25 m, store counts, and use them to seed the existing stop-condition attributes (seating, lighting) as "detected, not confirmed" until a rider confirms. Effort M. Impact medium for night safety (Layer 38) and heat (Layer 36).
6. **Traffic census for honest car comparisons.** Use the data.gov.cy annual traffic counts by road section to show where buses share roads with the heaviest car traffic. This feeds the bus-lane case in the B2G pack (Layer 35). Effort S. Impact medium.
7. **A /data page.** List every source, its licence (CC-BY-4.0 for CyNAP), its refresh rate and when Aloya last read it successfully. This meets the attribution duty and builds trust. Effort S. Impact medium.
8. **Aloya as a publisher.** Document the MCP server and the /api/public routes as a partner API with keys and rate limits. Later, publish Aloya's corrected arrivals as GTFS-RT so others can integrate Aloya, which matches the "open for others to integrate" vision. Effort L. Impact high, strategically.
9. **Get ahead of the MMTIS deadlines.** Shared-vehicle availability and parking are due through NAPs by December 2026 (2024/490). Offer the Public Works Department help with GBFS for Nextbike and Bolt and with parking occupancy, and build the readers now so Aloya is first to use them. Effort S to watch, M to integrate. Impact high.

### 31.5 Sources
- TfL, Open data policy: https://tfl.gov.uk/info-for/open-data-users/open-data-policy
- TfL Unified API portal: https://tops.tfl.gov.uk/ ; API FAQ: https://api-portal.tfl.gov.uk/faq
- transport.data.gouv.fr quality indicators: https://doc.transport.data.gouv.fr/outils/outils-disponibles-sur-le-pan/indicateurs-de-qualite ; SNCF dataset: https://transport.data.gouv.fr/datasets/horaires-sncf?locale=fr ; Nouveautés: https://transport.data.gouv.fr/nouveautes?locale=fr ; deadlines: https://doc.transport.data.gouv.fr/le-point-d-acces-national/cadre-juridique/dates-limites-de-publication
- Entur presentation, TTG 2025: https://cdn.asp.events/CLIENT_CL_Conf_BDA05934_5056_B731_4C9EEBBE0C2416C2/sites/transport-ticketing-globa/media/2025-presentations/12.40-2025-TTG-Building-a-Nationwide-Multimodal-Ticketing-Platform.pdf
- Delegated Regulation (EU) 2024/490: https://eur-lex.europa.eu/eli/reg_del/2024/490/oj/eng
- CyNAP dataset list: https://www.traffic4cyprus.org.cy/dataset (pages 1 to 3); GTFS-RT dataset: https://traffic4cyprus.org.cy/en/dataset/publictransportrealtime_gtfs_rt ; static: https://traffic4cyprus.org.cy/en/dataset/publictransportstatic
- Live endpoint test, 31 Oct 2026: https://fixcyprus.cy/gnosis/open/api/nap/datasets/bus_lanes/ (and cycleways, pedestrian_crossings, bicycle_racks, parking_areas, waze_alerts, bus_stations)
- Interoperable Europe, Cyprus 2025: https://interoperable-europe.ec.europa.eu/sites/default/files/custom-page/attachment/2026-06/iopeu-monitoring_2025-supporting-document_cyprus_final.pdf
- EC, Cyprus ITS progress report 2025: https://transport.ec.europa.eu/document/download/af766a37-f7ef-48fe-8d35-59ed45f699e6_en?filename=cy_its_progress_report_2025.pdf
- data.gov.cy: https://www.data.gov.cy/en ; dataset 1069: https://data.gov.cy/en/dataset/1069 ; DLI current air API: https://data.gov.cy/el/dataset/trehoyses-metriseis-atmosfairikon-rypon-api ; traffic census: https://data.gov.cy/el/dataset/etisia-apografi-kykloforias-motorways
- Cyprus Air Quality: https://www.airquality.dli.mlsi.gov.cy/
- Mapillary points: https://www.mapillary.com/developer/api-documentation/points
- Code: src/lib/basemap.ts, src/routes/api/public/hooks/pulse-traffic.ts, src/lib/bolt-scooter.functions.ts, src/lib/ev-chargers.functions.ts, src/routes/api/public/streetview.ts, src/lib/mcp/index.ts, scripts/ingest-schedule.ts

---


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

## Layer 33. AI assistant

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

### 33.5 Sources
- Google blog, Gemini navigation features (5 Nov 2025): https://blog.google/products-and-platforms/products/maps/gemini-navigation-features-landmark-lens/
- 9to5Google, Gemini for all navigation modes (26 Nov 2025): https://9to5google.com/2025/11/26/google-maps-gemini-navigation-rollout/
- Google blog, Ask Maps and Immersive Navigation (12 Mar 2026): https://blog.google/products-and-platforms/products/maps/ask-maps-immersive-navigation
- Google blog, Ask Maps gets more helpful (6 Aug 2026): https://blog.google/products-and-platforms/products/maps/order-food-in-ask-maps/
- The Verge, Gemini on CarPlay (21 Oct 2026): https://www.theverge.com/transportation/1015281/gemini-ai-apple-carplay-voice-google-maps
- Xie et al., TravelPlanner: https://arxiv.org/abs/2402.01622 ; results table: https://arxiv.org/html/2402.01622v4
- OpenSymbolic, TravelPlanner 97.9% (20 Feb 2026): https://www.opensymbolic.ai/blog/travelplanner-benchmark
- Groq rate limits: https://console.groq.com/docs/rate-limits
- Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Code: src/lib/ai-planner.functions.ts, packages/core/src/nl-intent.ts, src/components/nl/useNLPlanner.ts, src/components/roam/search/RoamSearchSheet.tsx, src/routes/api/public/parse-trip-intent.ts, src/lib/nl-suggestions.functions.ts, src/lib/mcp/index.ts, src/lib/speech.ts, packages/core/src/cy-time.ts

---

## Layer 34. Feed anomaly and quality

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

### 34.5 Sources
- MobilityData gtfs-validator: https://github.com/MobilityData/gtfs-validator
- transport.data.gouv.fr quality indicators: https://doc.transport.data.gouv.fr/outils/outils-disponibles-sur-le-pan/indicateurs-de-qualite
- NAYEE, The open transit stack behind BusCyprus (11 Oct 2026): https://nayee.net/blog/the-open-transit-stack-behind-buscyprus
- Cyprus Mail, Transport Hackathon (20 Jan 2026): https://cyprus-mail.com/2026/01/20/ai-driven-approach-to-bus-tracking-takes-first-prize-at-cyprus-transport-hackathon
- Cyprus FAQ, 9,000 bus stops inventory tender (23 Oct 2026): https://www.cyprus-faq.com/en/south/news/kipr-inventarizaciya-9000-avtobusnyh-ostanovok/
- Cyprus Mail, Audit Office report (14 Oct 2026): https://cyprus-mail.com/2026/10/14/63-per-cent-of-passengers-would-not-use-the-bus-again
- Static GTFS downloads, 31 Oct 2026: https://www.motionbuscard.org.cy/opendata/downloadfile?file=GTFS%5C6_google_transit.zip&rel=True (and feeds 2, 4, 5, 9, 10, 11)
- Live GTFS-RT decode, 31 Oct 2026 17:45 UTC: http://20.19.98.194:8328/Api/api/gtfs-realtime
- Code: src/lib/ghost-trips.ts, src/lib/feed-delta.server.ts, src/lib/eta-backtest.server.ts, scripts/validate-gtfs-snapshot.mjs, scripts/ingest-schedule.ts, src/lib/cron-schedule.ts, workers/pulse-cron/wrangler.jsonc, public/data/schedule/by-date

---

## Layer 35. B2B and B2G analytics

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

### 35.5 Sources
- City of Beaumont, Swiftly pricing calculator and order form (04/2022): https://mccmeetingspublic.blob.core.usgovcloudapi.net/beaumntca-meet-ada51768922143e7aa781ac02b57d63d/ITEM-Attachment-001-d951d98eeee9456cac722302bfdc07cb.pdf
- Banning Pass Transit, Trillium-Swiftly order form (Apr 2020): https://banningca.gov/DocumentCenter/View/7351/Att-1-Trillium-Swiftly-Proposal
- MARTA agenda report, Swiftly contract: https://itsmarta.civicweb.net/document/152652/
- County Connection staff report, Swiftly modules (Jun 2025): https://countyconnection.com/wp-content/uploads/2025/06/5.FINAL_Swiftly-Modules.pdf
- EC DG MOVE, Implementing Regulation on urban mobility indicators (9 Jul 2026): https://transport.ec.europa.eu/news-events/news/commission-adopts-implementing-regulation-strengthen-sustainable-urban-mobility-through-harmonised-2026-07-09_en
- EU Urban Mobility Observatory, indicator fiches (23 Jul 2024): https://urban-mobility-observatory.transport.ec.europa.eu/news-events/news/new-urban-mobility-indicator-fiches-released-support-sump-implementation-2024-07-23_en
- EGUM opinion on SUMP indicators: https://transport.ec.europa.eu/document/download/cb890007-af95-46e8-8f9c-1a29c1efefac_en?filename=EGUM_SUMP_subgroup_SUMI_opinion.pdf
- RIF, AI in Government Challenge 4 submissions (16 Mar 2026): https://www.research.org.cy/en/completion-of-proposal-submission-for-the-ai-in-government-program-call-for-proposals-challenge-4/ ; results (18 May 2026): https://www.research.org.cy/en/announcement-of-evaluation-results-for-aiingovt-0725-challenge-4-call-of-the-ai-in-government-challenge-4-programme/ ; forthcoming calls: https://www.research.org.cy/en
- philenews, smart traffic lights 125 junctions (25 Jul 2026): https://en.philenews.com/local/public-works-smart-traffic-lights-nicosia-limassol
- Politis, 15 junctions at €41,900 (19 Aug 2026): https://en.politis.com.cy/news/cy-news/1026947/smart-traffic-lights-planned-for-nicosia-limassol
- TendersOnTime, PS/14/2026/G(O): https://www.tendersontime.com/tenders-details/supply-installation-and-operation-vehicle-actuated-signal-va-systems-signal-controlled-junctions-8c8ca86/
- Cyprus Mail, Pame app and CPT figures (16 Sep 2026): https://cyprus-mail.com/2026/09/16/cyprus-public-transport-enters-new-digital-era-with-revamped-pame-app-enhanced-website
- Cyprus Mail, Audit Office (14 Oct 2026): https://cyprus-mail.com/2026/10/14/63-per-cent-of-passengers-would-not-use-the-bus-again ; Hackathon (20 Jan 2026): https://cyprus-mail.com/2026/01/20/ai-driven-approach-to-bus-tracking-takes-first-prize-at-cyprus-transport-hackathon
- Code: src/lib/truth-api.server.ts, src/routes/api/public/partners/apply.ts, src/lib/reliability.functions.ts, src/lib/eta-backtest.server.ts, src/lib/lake.server.ts, COMMERCIAL.md

---

## Layer 36. Heat and weather routing

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

### 36.5 Sources
- ASU News, Cool Routes (10 Jun 2026): https://news.asu.edu/20260610-environment-and-sustainability-new-cool-routes-app-maps-shadiest-routes-your-walk
- Planetizen, Cool Routes (16 Jun 2026): https://www.planetizen.com/news/2026/06/137813-cool-routes-app-plots-shady-walks-arid-arizona
- Diari de Catalunya, AMB cool walking routes (14 Jul 2026): https://diaricatalunya.cat/en/barcelones/general/new-app-to-find-the-coolest-walking-routes-in-barcelona
- The Guardian, Cool Walks Barcelona (23 Jun 2021): https://www.theguardian.com/environment/2021/jun/23/cool-walks-app-maps-shady-spots-barcelona
- Android Authority, Google Maps sun and shade strings (6 Nov 2025): https://www.androidauthority.com/google-maps-sun-shade-apk-teardown-3613515/
- Shade-oriented pathfinding, Dubai (Dec 2025): https://www.sciencedirect.com/science/article/pii/S0198971525000900
- Cyprus Mail, July 2026 temperatures (6 Aug 2026): https://cyprus-mail.com/2026/08/06/july-not-a-record-month-for-temperatures-despite-heatwave
- Cyprus Mail, red warning 45C (13 Aug 2025): https://cyprus-mail.com/2025/08/13/red-weather-warning-issued-for-high-temperatures
- Cyprus Mail, heat and health (22 Jun 2026): https://cyprus-mail.com/2026/06/22/why-cyprus-extreme-heat-is-more-dangerous-than-you-think
- Cyprus Mail, Audit Office (14 Oct 2026): https://cyprus-mail.com/2026/10/14/63-per-cent-of-passengers-would-not-use-the-bus-again
- Department of Meteorology AWS data: https://www.dom.org.cy/AWS/ALL_STATIONS_average.html ; Net Effective Temperature: https://www.dom.org.cy/AWS/AWS_NET.txt
- MeteoAlarm Cyprus feed: https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-cyprus
- Open-Meteo pricing and terms: https://open-meteo.com/en/pricing
- Code: src/lib/open-meteo.server.ts, src/lib/weather.functions.ts, src/routes/api/public/hooks/pulse-air.ts, src/routes/api/public/hooks/pulse-met-warnings.ts, src/routes/api/public/dust-advisory.ts, src/components/DustAdvisoryBanner.tsx, src/components/CrowdHint.tsx, packages/core/src/stop-condition.ts, src/lib/stop-seo.ts, src/lib/raptor.server.ts, packages/core/src/plan-score.ts

---

## Layer 37. Cost, time and carbon comparison

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

### 37.5 Sources
- Cyprus Public Transport, Ticket fares (from 3 Aug 2026): https://www.publictransport.com.cy/cms/page/cash-tickets
- EMEL, Fare changes from 5 Nov 2026 (27 Aug 2026): https://limassolbuses.com/fare-changes-2/
- Politis, Limassol bus fares to rise (16 Sep 2026): https://www.en.politis.com.cy/news/cy-news/1033287/limassol-bus-fares-to-rise-from-november
- Pafos Buses, tickets: https://www.pafosbuses.com/tickets
- Intercity GTFS feed 5, fare_attributes.txt (31 Oct 2026): https://www.motionbuscard.org.cy/opendata/downloadfile?file=GTFS%5C5_google_transit.zip&rel=True
- Visit Cyprus, Transportation (urban taxi tariff): https://www.visitcyprus.com/useful-info/transportation
- Kathimerini, taxi fare changes (19 Sep 2026): https://www.kathimerini.com.cy/gr/oikonomiki/oikonomia/nees-times-sta-komistra-ton-taxi-%E2%80%93-ti-akribainei
- Cyprus FAQ, bus stop inventory and survey (23 Oct 2026): https://www.cyprus-faq.com/en/south/news/kipr-inventarizaciya-9000-avtobusnyh-ostanovok/
- GOV.UK, GHG conversion factors collection: https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting ; 2025 values as listed: https://www.greentryst.com/emission-factors/road-business-travel-bus-average-local-bus-scope-3-defra-2025 and https://scif.org.uk/news/how-we-calculate-travel-emissions/
- Aloya marketing, Motion card page: https://aloya.cy/motion-card
- Code: packages/core/src/boarding-pay.ts, packages/core/src/taxi-quote.ts, packages/core/src/airport-cost.ts, roam-i18n done.co2

---
