# Native-Only Features Implementation Plan

Implement four advanced native features to provide a premium, integrated experience on iOS and Android.

## Proposed Changes

### 1. Haptic Arrival Patterns
Enhance trip alerts with distinct, multi-pulse haptic patterns.

#### [mobile/lib/tripAlerts.ts](file:///C:/Users/USER/Documents/GitHub/aloyacy-8f3d9cd7/mobile/lib/tripAlerts.ts)
- Replace generic `Haptics.impactAsync` with custom pulse sequences.
- "Alight Soon" will use a "Double Heavy Pulse".
- "Arrived" will use a "Triple Success Pulse".

---

### 2. Live Activities & Dynamic Island (iOS)
Show live arrival countdowns on the Lock Screen and Dynamic Island.

#### [NEW] [mobile/lib/liveActivities.ts](file:///C:/Users/USER/Documents/GitHub/aloyacy-8f3d9cd7/mobile/lib/liveActivities.ts)
- Helper to start, update, and end `ActivityKit` sessions.
- Syncs the live ETA from `useJourney` to the iOS Dynamic Island.

#### [mobile/app.json](file:///C:/Users/USER/Documents/GitHub/aloyacy-8f3d9cd7/mobile/app.json)
- Add `NSSupportsLiveActivities` to `infoPlist`.

---

### 3. Home Screen Widgets
A "Nearest Stop" widget for quick access to live departures.

#### [NEW] [mobile/widgets/NearestStopWidget.tsx](file:///C:/Users/USER/Documents/GitHub/aloyacy-8f3d9cd7/mobile/widgets/NearestStopWidget.tsx)
- Define the layout and data-fetching logic for a native home screen widget.

---

### 4. Voice Assistant Integration
"Hey Siri, when's my bus?" support.

#### [mobile/lib/push.ts](file:///C:/Users/USER/Documents/GitHub/aloyacy-8f3d9cd7/mobile/lib/push.ts)
- Register `NSUserActivity` when a trip is active.
- Add `Shortcut` metadata to allow Siri to suggest the app.

---

## Verification Plan

### Automated Tests
- Run `bun tsc` to verify type safety of the new hooks and helpers.

### Manual Verification
- Verify the haptic patterns trigger correctly on phase transitions.
- Audit the `app.json` for all necessary native permissions and capability keys.
- Check the backend `shared_trips` table to ensure the data required for widgets is available via public endpoints.
