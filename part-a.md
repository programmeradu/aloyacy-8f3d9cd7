# Part A: Smart alerts and the in-trip companion (layers 1 to 10, plus 7b)

Aloya 50-layer smart mobility research. Part A covers what the rider experiences from the moment they decide to travel until they step off the last vehicle: when to leave, how fast they walk, what the phone can do in the background, which notifications fire, how far the live bus data can be trusted, what happens when things go wrong, getting off at the right stop, re-optimising across transfers, the lock screen and watch, accessibility and privacy.

Code references point at repo programmeradu/aloyacy-8f3d9cd7, branch redesign-roam, commit 1508f3f (checked 31 Oct 2026). Earlier runs cited commits 5d818e8a and 56dab8f2; every reference below was re-checked at 1508f3f and line numbers updated where they had moved.

## The bug Samuel raised, in one paragraph

When a trip is started at home, Aloya's server sends alerts that assume the rider is already at the stop, because the server never knows where the rider is. The trip-alerts job (src/routes/api/public/trip-alerts.ts, run every minute by workers/pulse-cron/src/jobs.ts line 25) decides every alert from clock arithmetic alone: "Pick up the pace" when the bus is 30 to 120 seconds away (lines 101 to 104), "BUS X is at the stop. Board now." when the bus is within 30 seconds of the stop (lines 106 to 109), "Still on BUS X?" once the scheduled boarding time passes (lines 117 to 130, via currentRideTripId in src/lib/trip-alerts.server.ts lines 125 to 140), and a leave-by alert based on walk_in_sec frozen at planning time (lines 94 to 99; walkInSec is set in src/lib/trip-store.ts line 163). The active_trips table (supabase/migrations/20260523123133, mirrored in migrations-d1/0001_init.sql) and the upload schema (src/lib/trip-sync.functions.ts lines 17 to 33) carry no rider position, no on-board flag and no missed flag. On the phone, packages/core/src/multileg-journey.ts lines 347 to 349 advance a walk leg to "arrived" when the planned walk time plus 120 seconds has passed even with no GPS fix, and lines 351 to 353 do the same for a wait leg; lines 409 to 430 then emit "at-stop" notifications for the transfer walk and the wait, which src/lib/push.functions.ts lines 186 to 187 render as "You're at <stop>. Wait near the curb." Every call to setActiveTrip re-uploads the trip with alerts_sent reset to an empty list (trip-sync.functions.ts line 51), so alerts already sent can fire again, and the server tags (aloya-board-soon-<trip>, trip-alerts.server.ts lines 54 to 101) differ from the phone's tags (aloya-<kind>, push.functions.ts line 253), so the same alert can appear twice. Fix: the server must stop deciding from the clock alone. It needs a rider state (unknown, walking, at stop, on board, missed) from the phone, it must ask when the state is unknown, and the leave decision must compare walking time against the bus's live position.

---

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

### 1.5 Sources

- https://help.transitapp.com/article/549-how-to-use-go
- https://help.transitapp.com/article/93-how-to-use-transit
- https://blog.transitapp.com/new-zealand-finally-gets-transit-b7b9bf4c50ef/
- https://scmetro.org/wp-content/uploads/2026/03/DIGITAL-Transit101-Booklet-2026.pdf
- https://citymapper.com/news/517/go-your-personal-trip-assistant
- https://citymapper.com/news/2553/citymapper-introduces-ios-lock-screen-navigation
- https://www.howtogeek.com/google-maps-features-that-make-public-transit-less-confusing/
- https://www.androidauthority.com/android-transit-mode-3633735/
- https://cyprus-mail.com/2026/09/16/cyprus-public-transport-enters-new-digital-era-with-revamped-pame-app-enhanced-website
- https://cyprus-faq.com/en/south/news/pame-app-obnovlenie-cpt-kipr/
- https://traffic4cyprus.org.cy/en/dataset/publictransportrealtime_gtfs_rt
- https://buscyprus.app/gtfs-rt-info
- https://en.politis.com.cy/news/cy-news/1051591/bus-report-exposes-why-commuters-are-turning-away-from-public-transport
- https://www.kathimerini.com.cy/gr/kypros/test-g-elegkti-stis-astikes-sygkoinonies-me-thetiko-prosimo
- Code: src/routes/api/public/trip-alerts.ts, src/lib/trip-alerts.server.ts, src/lib/trip-store.ts, src/lib/trip-sync.functions.ts, packages/core/src/multileg-journey.ts, packages/core/src/journey-live.ts, mobile/lib/groupBackgroundLocation.ts, mobile/build_info.json (redesign-roam @ 1508f3f)

---

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

### 2.5 Sources

- https://citymapper.com/news/2266/turn-by-turn-directions-for-walking
- https://citymapper.com/news/2589/
- https://docs.opentripplanner.org/en/latest/RouteRequest/
- https://ic.kaist.ac.kr/publications/papers/cho2010autogait.pdf
- https://formative.jmir.org/2025/1/e73722
- https://arxiv.org/pdf/1805.03368
- https://www.fhwa.dot.gov/publications/research/safety/pedbike/05085/chapt8.cfm
- https://doi.org/10.1093/ageing/afs076
- https://economytoday.sigmalive.com/ey-gia-leoforeia-l/sias-lanthasmena-oraria-alaloym-pliroforisis-ki-alles-adynamies/
- https://cyprus-mail.com/2026/10/14/63-per-cent-of-passengers-would-not-use-the-bus-again
- Code: packages/core/src/geo.ts, packages/core/src/multileg-legs.ts, packages/core/src/raptor-core.ts, src/lib/walk-links.server.ts, src/lib/walk-refine.server.ts (redesign-roam @ 1508f3f)

Note: the first run cited an Ulm University step-versus-GPS speed figure (1.0 to 1.1 km/h versus 1.1 to 2.4 km/h). Its source is a 2021 master's thesis behind a registered-user wall (dbis.eprints.uni-ulm.de/id/eprint/2067), which could not be opened to verify, so the figure is not used here.

---

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

### 3.5 Sources

- https://firt.dev/notes/pwa-ios
- https://webkit.org/blog/16535/meet-declarative-web-push/
- https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities
- https://developer.android.com/develop/ui/views/notifications/live-update
- https://developer.android.com/develop/sensors-and-location/location/geofencing
- https://www.androidpolice.com/nobody-is-using-live-updates
- https://www.androidauthority.com/android-transit-mode-3633735/
- https://help.transitapp.com/article/549-how-to-use-go
- https://play.google.com/store/apps/details?id=app.meep.cyprus.pame
- Code: src/lib/useGeoWatch.ts, src/lib/useFusedFix.ts, src/lib/useJourneySideEffects.ts, public/sw.js, mobile/lib/groupBackgroundLocation.ts, mobile/lib/liveActivities.ts, mobile/build_info.json (redesign-roam @ 1508f3f)

---

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

### 4.5 Sources

- https://citymapper.com/news/517/go-your-personal-trip-assistant
- https://help.transitapp.com/article/549-how-to-use-go
- https://www.androidpolice.com/nobody-is-using-live-updates
- https://doi.org/10.21511/im.17(2).2021.10
- https://www.rfc-editor.org/rfc/rfc8030.html
- https://en.politis.com.cy/news/cy-news/1051591/bus-report-exposes-why-commuters-are-turning-away-from-public-transport
- Code: src/lib/trip-alerts.server.ts, src/lib/push.functions.ts, src/lib/notify.server.ts, src/lib/trip-sync.functions.ts, workers/pulse-cron/src/jobs.ts, packages/core/src/multileg-journey.ts (redesign-roam @ 1508f3f)

---

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

### 5.5 Sources

- https://github.com/TransitApp/ETA-Accuracy-Benchmark
- https://www.goswift.ly/blog/banish-ghost-and-zombie-buses
- https://help.transitapp.com/article/91-what-is-go-crowdsourcing
- https://play.google.com/store/apps/details?id=com.thetransitapp.droid
- https://traffic4cyprus.org.cy/en/dataset/publictransportrealtime_gtfs_rt
- https://buscyprus.app/gtfs-rt-info
- https://gtfsscorecard.org/agency/intercity-buses-cyprus/
- https://en.politis.com.cy/news/cy-news/1051591/bus-report-exposes-why-commuters-are-turning-away-from-public-transport
- https://en.alphanews.live/cyprus/the-service-is-not-in-crisis-cpts-response-to-the-audit-offices-findings-on-buses/
- https://cyprus-mail.com/2026/10/15/cyprus-public-transport-dismisses-audit-report-says-it-has-already-moved-on
- Code: src/routes/api/public/trip-alerts.ts, src/lib/gtfs-rt.server.ts, src/lib/ghost-trips.ts, src/lib/threshold-cache.server.ts, src/routes/api/public/rider-fix.ts, packages/core/src/eta-backtest.ts, src/lib/useRealtime.ts (redesign-roam @ 1508f3f)

---
