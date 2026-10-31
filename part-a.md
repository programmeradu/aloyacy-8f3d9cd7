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

### 6.5 Sources

- https://www.ijcai.org/proceedings/2025/0937.pdf
- https://www.microsoft.com/en-us/research/wp-content/uploads/2012/01/raptor_alenex.pdf
- https://scmetro.org/wp-content/uploads/2026/03/DIGITAL-Transit101-Booklet-2026.pdf
- https://citymapper.com/news/777/10-citymapper-tools-to-help-you-master-new-york
- https://www.howtogeek.com/google-maps-features-that-make-public-transit-less-confusing/
- https://www.publictransport.com.cy/announcements
- https://www.traffic4cyprus.org.cy/dataset/bolt
- https://electra.space/
- https://www.kathimerini.com.cy/gr/kypros/test-g-elegkti-stis-astikes-sygkoinonies-me-thetiko-prosimo
- Code: packages/core/src/wait-or-bail.ts, packages/core/src/other-stop.ts, src/lib/reroute.functions.ts, src/lib/wrong-stop-reroute.ts, packages/core/src/multileg-journey.ts, packages/core/src/journey-live.ts, src/lib/publictransport.functions.ts (redesign-roam @ 1508f3f)

---

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

### 7.5 Sources

- https://citymapper.com/news/823/get-off-alerts
- https://citymapper.com/news/517/go-your-personal-trip-assistant
- https://citymapper.com/news/2395/citymapper-in-your-ear
- https://citymapper.com/news/2553/citymapper-introduces-ios-lock-screen-navigation
- https://help.transitapp.com/article/549-how-to-use-go
- https://blog.google/products-and-platforms/products/maps/never-miss-your-stop-again-step-step-directions-transit-navigation
- https://www.howtogeek.com/google-maps-features-that-make-public-transit-less-confusing/
- https://cyprus-mail.com/2024/11/14/people-with-disabilities-humiliated-when-using-buses
- https://www.gov.cy/metafores-epikoinonies-erga/topothetisi-tou-ypourgeiou-metaforon-epikoinonion-kai-ergon-anaforika-me-anisychies-tis-pagkyprias-organosis-tyflon/
- https://neakypros.com.cy/index.php/news/121938
- https://cyprus-faq.com/en/south/news/nezryachie-kipr-trotuary-samokaty-perekhody/
- https://en.alphanews.live/cyprus/the-service-is-not-in-crisis-cpts-response-to-the-audit-offices-findings-on-buses/
- https://www.kiprinform.com/en/news/cyprus-public-transport-challenges-audit-findings-points-to-service-upgrades
- https://firt.dev/notes/pwa-ios
- Code: packages/core/src/alight-countdown.ts, src/components/journey/AlightCountdownCard.tsx, src/lib/useJourneySideEffects.ts, public/sw.js, src/routes/api/public/trip-alerts.ts, src/lib/wrong-stop-reroute.ts (redesign-roam @ 1508f3f)

---

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

### 7b.5 Sources

- https://www.ijcai.org/proceedings/2025/0937.pdf
- https://citymapper.com/news/2589/
- https://citymapper.com/news/2553/citymapper-introduces-ios-lock-screen-navigation
- https://play.google.com/store/apps/details?id=com.thetransitapp.droid
- https://docs.opentripplanner.org/en/latest/RouteRequest/
- https://cyprus-mail.com/2026/10/14/63-per-cent-of-passengers-would-not-use-the-bus-again
- https://www.traffic4cyprus.org.cy/dataset/bolt
- https://github.com/plhery/ScootRadar/blob/main/docs/cypriot-scooter-feeds.md
- https://cyprus-mail.com/2026/09/01/bolt-unconcerned-over-new-e-scooter-regulations
- https://cyprus-mail.com/2026/08/27/e-scooter-offences-could-bring-90-day-impoundment
- https://cyprus-mail.com/2026/09/10/e-scooter-injuries-rise-as-citations-reach-5000-this-year
- https://www.kiprinform.com/en/articles/e-scooters-in-cyprus/
- https://cylaw.org/nomoi/arith/2026_1_106.pdf
- https://electra.space/
- Code: packages/core/src/multileg-journey.ts, src/lib/reliability.functions.ts, src/lib/bolt-scooter.functions.ts, src/routes/api/public/bike-share.ts (redesign-roam @ 1508f3f)

---

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

### 8.5 Sources

- https://help.transitapp.com/article/549-how-to-use-go
- https://citymapper.com/news/2553/citymapper-introduces-ios-lock-screen-navigation
- https://citymapper.com/news/2589/
- https://citymapper.com/news/597/go-your-personal-trip-assistant
- https://www.engadget.com/2017-12-09-google-maps-commute-tracking.html
- https://www.androidauthority.com/android-transit-mode-3633735/
- https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities
- https://developer.android.com/develop/ui/views/notifications/live-update
- https://www.androidpolice.com/nobody-is-using-live-updates
- https://cyprus-mail.com/2026/10/14/63-per-cent-of-passengers-would-not-use-the-bus-again
- https://domcar.com.cy/en/live/digest/the-pame-app-has-been-updated-in-cyprus/
- Code: src/lib/trip-alerts.server.ts, mobile/lib/liveActivities.ts, mobile/widgets/NearestStopWidget.tsx, mobile/build_info.json (redesign-roam @ 1508f3f)

---

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

### 9.5 Sources

- https://citymapper.com/news/2395/citymapper-in-your-ear
- https://transportation.uiowa.edu/cambus/transit
- https://gtfsscorecard.org/agency/intercity-buses-cyprus/
- https://www.fhwa.dot.gov/publications/research/safety/pedbike/05085/chapt8.cfm
- https://doi.org/10.1093/ageing/afs076
- https://europeanaccessibilityact2025.com/art-2-eaa/
- https://cyprus-mail.com/2024/11/14/people-with-disabilities-humiliated-when-using-buses
- https://neakypros.com.cy/index.php/news/121938
- https://cyprus-faq.com/en/south/news/nezryachie-kipr-trotuary-samokaty-perekhody/
- https://en.sigmalive.com/complaints-over-unsafe-buses-transporting-blind-students-to-nicosia
- https://land.cy/article/new-smart-bus-stops-designed-for-convenience-or-controversy
- https://cyprus-faq.com/en/south/news/kipr-ministr-tsolaki-cpt-otvet-auditoram-avtobusy-nikosii
- https://economytoday.sigmalive.com/ey-gia-leoforeia-l/sias-lanthasmena-oraria-alaloym-pliroforisis-ki-alles-adynamies/
- Code: src/lib/accessibility-prefs.ts, src/lib/accessibility-weights.ts, src/lib/stop-condition.server.ts, src/lib/useJourneySideEffects.ts (redesign-roam @ 1508f3f)

---

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

### 10.5 Sources

- https://pubmed.ncbi.nlm.nih.gov/23524645
- https://www.edpb.europa.eu/system/files/documents/2021-03/edpb_guidelines_202001_connected_vehicles_v2.0_adopted_en.pdf
- https://www.dlapiperdataprotection.com/index.html?c=CY&t=law
- https://help.transitapp.com/article/93-how-to-use-transit
- https://blog.transitapp.com/new-zealand-finally-gets-transit-b7b9bf4c50ef/
- https://www.androidauthority.com/android-transit-mode-3633735/
- https://webkit.org/blog/16535/meet-declarative-web-push/
- Code: src/lib/trip-sync.functions.ts, src/routes/api/public/rider-fix.ts, supabase/migrations/20260914000000_permanent_db_retention_and_upsert.sql, src/lib/lake.server.ts, src/routes/api/public/hooks/archive-lake.ts, src/lib/accessibility-prefs.ts, src/routes/privacy.tsx (redesign-roam @ 1508f3f)

---
