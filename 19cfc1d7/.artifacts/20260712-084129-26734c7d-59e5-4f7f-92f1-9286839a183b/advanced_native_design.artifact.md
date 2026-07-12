# Technical Design: Advanced Native Features

Design for high-end native features to differentiate the Aloya mobile experience from the web app.

## 1. Contact Book Integration
**Goal**: Allow users to share a live tracking link with a friend directly from their phone's contacts.

### Architecture
- **Library**: `expo-contacts`
- **Flow**:
  1.  **Permission**: Graceful ask when user taps "Share with Friend" on an active trip.
  2.  **Selection**: A native-style modal with a searchable contact list (Name + Phone).
  3.  **Sharing**:
      - Generate a Supabase shared trip token (via existing logic).
      - Use `expo-sms` or `Share.share` (Native Share Sheet) to send the `cy.aloya.app/eta/[token]` link.
- **Privacy**: We will *never* upload the contact list to the server. Matching/Searching happens entirely on-device.

---

## 2. SQLite Offline Mode (GTFS)
**Goal**: Replace the current JSON-file prefetch with a high-performance SQLite database for full offline schedule lookups.

### Architecture
- **Library**: `expo-sqlite/next`
- **Data Model**:
  - `stops`: id, name, lat, lng, code
  - `routes`: id, short_name, color, type
  - `stop_times`: trip_id, stop_id, arrival_time, departure_time
- **Sync Strategy**:
  - Download a compressed `.sqlite` file from the backend (pre-indexed).
  - Use `expo-file-system` to place it in the app's document directory.
  - **Fallback Logic**: If `fetch` to `/api/public/stops` fails, `useNearbyStops` will query the local SQLite DB instead.

---

## 3. Native AR Navigation
**Goal**: Provide a "Heads Up" view for finding the exact location of a bus stop or a walking transfer.

### Architecture
- **Libraries**: `expo-camera`, `expo-sensors` (DeviceMotion)
- **Math**:
  - Use the **Haversine formula** to calculate distance to the target coordinate.
  - Use the **Magnetometer** to determine the user's real-world bearing.
  - Calculate the "Relative Bearing" (difference between user's heading and the target's bearing).
- **UI**:
  - A camera background with a floating 3D-like "Bus Stop" icon.
  - An "Arrow" overlay that points left/right if the stop is out of view.
  - Distance countdown in the center of the screen.
- **Trigger**: A "Live AR" button on the Walk Guidance card.

---

## Proposed Implementation Plan

### Phase 1: Contact Sharing
1.  [NEW] `mobile/components/ContactPicker.tsx`: Searchable contact list component.
2.  [MOD] `mobile/app/eta/[token].tsx`: Add "Share with Contact" button.

### Phase 2: SQLite Migration
1.  [NEW] `mobile/lib/db.ts`: SQLite initialization and GTFS query helpers.
2.  [MOD] `mobile/lib/offline.ts`: Update download logic to fetch `.db` files.

### Phase 3: AR Viewfinder
1.  [NEW] `mobile/app/ar-guide.tsx`: Full-screen AR navigation view.
2.  [NEW] `mobile/lib/math_geo.ts`: Bearing and projection math helpers.
