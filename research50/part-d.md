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
