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
