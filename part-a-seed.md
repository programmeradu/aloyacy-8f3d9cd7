# Part A seed findings (r50-a-alerts, first run; workspace was down so it could not write files)

Top 10:
1. Departure alert rule: T_walk = route distance / learned pace (default 1.25 m/s, elderly 0.9) + crossing allowance; T_bus = predicted arrival, made more cautious by measured prediction error; leave = T_bus - T_walk - buffer (buffer grows with unreliability, doubled when the bus runs every 60-120 min). States: none, Get ready (5 min before leave), Leave now, You'll miss it plus next bus. One notification per state. Unknown location: ask "Are you at the stop?", never assume.
2. Learned walking pace (AutoGait, stride vs step rate fitted to short GPS samples). Step-based speed error 1.0-1.1 km/h vs GPS 1.1-2.4 km/h (Ulm study).
3. Ghost buses and outages: the Cyprus GTFS-RT feed has trip updates and vehicle positions only (no cancellations, no alerts), refreshed up to 1 min, and goes offline (BusCyprus). Data older than about 2 min is stale; no matched vehicle near trip start means likely cancelled; label every time live or scheduled.
4. Kalman correction over the feed times; measure with the Transit ETA Accuracy Benchmark thresholds (0-3 min away: -0.5/+1.5; 3-6: -1/+2.5; 6-10: -1/+3.5; 10-15: -1.5/+4.5).
5. In-trip phases (before boarding, first bus, approaching transfer, transfer, after): connection probability from the arrival spread plus walk plus the connecting bus's spread. Replan triggers only when the current plan is delayed or a delayed bus becomes catchable (IJCAI 2025). RAPTOR replans in ms. Suggest getting off early or scooting only if it saves at least 3 min or saves the connection (Bolt Nicosia scooter stations on the national portal, Electra). Confirm the user is aboard by matching GPS track to vehicle.
6. Get-off alerts 2 stops before and at the stop; off-route detection, then a recovery route. Audit Office: poor on-board info; the blind association says the installed stop announcements are off.
7. Notification rules: one alert per phase, update in place (tag + Web Push Topic), Urgency high only for leave-now, transfer and get-off, TTL; iOS Time Sensitive only in a native wrapper. 17,500-user study: more pushes raised uninstalls.
8. PWA limits: no background location on iOS/Android; iOS push 16.4+ only when installed. Now: Wake Lock (fixed for installed apps in iOS 18.4), Declarative Web Push, Apple Watch mirroring. Later Capacitor + transistorsoft background geolocation, iOS Live Activities (8 h), Android 16 Live Updates, geofences (iOS 20, Android 100). No CarPlay/AA transit category.
9. Accessibility: EAA applies since 28 Jun 2025 (WCAG 2.1 AA via EN 301 549). Intercity GTFS lists all 123 stops and 799 trips with wheelchair access unknown. Build: elderly pace, screen-reader labels, haptics plus voice, plain step mode, "which bus is mine" cue.
10. Privacy: ePrivacy Art 5(3) + GDPR consent; 4 points identify 95% (de Montjoye 2013); on-device computation, minimal IDs to server, no location history, delete at trip end, while-using permission, separate consent for crowdsourcing, DPIA.

Sources:
https://motionbuscard.org.cy/opendata/downloadfile?file=Static%5COpenDataDictionary.pdf&rel=True
https://traffic4cyprus.org.cy/en/dataset/publictransportrealtime_gtfs_rt
https://buscyprus.app/gtfs-rt-info
https://nayee.net/blog/the-open-transit-stack-behind-buscyprus
https://www.en.politis.com.cy/news/cy-news/1051591/ (Audit Office Oct 2026: real-time info at 13% of stops)
https://github.com/TransitApp/ETA-Accuracy-Benchmark
https://www.goswift.ly/blog/banish-ghost-and-zombie-buses
https://www.ijcai.org/proceedings/2025/0937.pdf
https://www.microsoft.com/en-us/research/wp-content/uploads/2012/01/raptor_alenex.pdf
https://docs.opentripplanner.org/en/latest/RouteRequest/
https://ideas.repec.org/a/kap/netspa/v23y2023i2d10.1007_s11067-021-09541-w.html
https://firt.dev/notes/pwa-ios
https://webkit.org/blog/16535/meet-declarative-web-push/
https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities
https://developer.android.com/develop/ui/views/notifications/live-update
https://developer.android.com/develop/sensors-and-location/location/geofencing
https://www.rfc-editor.org/rfc/rfc8030.html
https://www.fhwa.dot.gov/publications/research/safety/pedbike/05085/chapt8.cfm
https://doi.org/10.1093/ageing/afs076
https://ic.kaist.ac.kr/publications/papers/cho2010autogait.pdf
https://doi.org/10.21511/im.17(2).2021.10
https://europeanaccessibilityact2025.com/art-2-eaa/
https://gtfsscorecard.org/agency/intercity-buses-cyprus/
https://www.edpb.europa.eu/system/files/documents/2021-03/edpb_guidelines_202001_connected_vehicles_v2.0_adopted_en.pdf
https://pubmed.ncbi.nlm.nih.gov/23524645
https://www.dlapiperdataprotection.com/index.html?c=CY&t=law

## Second run findings (r50-a-alerts-2; its 55 KB part-a.md was lost in a sandbox reset)
Root cause of the home-start bug (code at 5d818e8a / 56dab8f2):
- src/routes/api/public/trip-alerts.ts runs every minute (workers/pulse-cron/src/jobs.ts:25) and decides on timestamps only:
  - L106-109 "BUS X is at <stop>. Board now."
  - L101-104 "Pick up the pace" (assumes still walking)
  - L117-130 "Still on BUS X?" (currentRideTripId, trip-alerts.server.ts:125-140)
  - L132-148 get-ready / "You should be at"
  - L94-99 leave-by uses the walk_in_sec fixed at planning time (trip-store.ts:163)
- active_trips (supabase migration 20260523123133, migrations-d1/0001_init.sql:4-22) and trip-sync.functions.ts:17-33 have no position, on-board or missed fields.
- packages/core/src/multileg-journey.ts:348-349 advances the walk after the planned time + 2 min with no GPS fix (line 353 does the same for wait). L405-426 send at-stop for transfer walk and wait; push.functions.ts:185-188 text "You're at <stop>. Wait near the curb."
- setActiveTrip (trip-store.ts:110-118, 182-249) re-uploads with alerts_sent: [] (trip-sync.functions.ts:51), so repeats.
- The phone and the server use different tags, so alerts duplicate. journey-live.ts (foreground only) treats no fix as on time and detects a miss only if the rider is still at the stop.
Top 10: hotfix (remove clock-only alerts, no at-stop on transfer or wait, drop the auto-advance, keep alerts_sent, unify tags); send rider state, not coordinates (unknown, walking, at stop, on board, missed) and ask when unknown; one shared leave decision (relax, get ready, leave now, run, you'll miss it plus next); catch a missed bus anywhere plus a one-tap replan; learned pace (Aloya assumes 1.35 m/s; over-80s 0.94-0.97); server-side multi-leg with connection probability and mid-trip micromobility; one alert ledger with 4 tiers and caps; server uses the same corrected ETAs and ghost rules, labelled live, estimated or timetable; Wake Lock, a real Live Activity (mobile/lib/liveActivities.ts is a stub returning a fixed id) and an Android ongoing notification; privacy, with no retention or deletion job found.
Re-verified: Audit Office report 29/2026 (13% of stops with real-time displays, 55% with no route info, 63% wouldn't ride again, stop pins 85/135 m off, some routes 1-2 hourly); CPT Pame app 16 Sep 2026; Eurostat 670 cars/1000 (2025); 9% of riders used the bus less due to wrong real-time info.
