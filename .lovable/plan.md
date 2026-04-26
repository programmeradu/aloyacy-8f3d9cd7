## Context

You're viewing the app on **Expo Web** (`localhost:8081`). `expo-maps` is a native module — it renders Apple Maps on iOS and Google Maps on Android but has **no web implementation**, so `MapView.tsx` intentionally returns a limestone `WebFallback` tile in the browser. That's why "the map disappeared" on stop / route / trip pages in the Expo web preview. On a real device (Expo Go dev build or EAS build) the same screens already show a live map.

Two ways forward on the map front, and I want your call before I spend the effort:

- **A. Keep web as fallback tile** (current). Cheap. Everything premium goes into iOS/Android where riders actually live.
- **B. Add a real web map to `MapView.tsx`** using Google Maps JS (same key + tracking pattern as the web app). Then stop/route/trip/index/airport screens render the same live map on Expo Web too.

I recommend **B** so you can QA on your laptop without a device. Same file, platform-branched: Google Maps JS on web, Apple/Google native on device.

## Scope for this pass

Regardless of A/B, deliver mobile parity with the web app:

### 1. Animated bus glide (native + web-if-B)
- Copy `src/assets/bus-premium.png` into `mobile/assets/` and register in `mobile/lib/assets.ts`.
- New `mobile/lib/animatedBus.ts`: RAF-driven tween between 20 s realtime ticks, bearing-aware interpolation, polyline-snapping when a shape is available (mirrors `src/components/AnimatedBus.tsx`).
- Wire into `MapView.tsx`: vehicle markers use the bus PNG as icon (`iconResource` on Google, `IconMarkerAnnotation` on Apple), coordinates + rotation update at 30 fps from the RAF loop.

### 2. Map coverage audit
Web has maps on: `index`, `stop.$stopId`, `route.$routeId`, `trip.$id`, `trip-info.$tripId`, `airport.$code`, `MultiLegCompanion`, `WalkGuidance`.
Mobile already has: all of the above **except `WalkGuidance`**. I'll port the web `WalkGuidance` map block into `mobile/components/WalkGuidance.tsx`.

### 3. Premium chip + card system
Rebuild these to match web fidelity, no shortcuts:
- **`RouteChip.tsx`** — route number badge with GTFS `route_color` bar, headsign, tone-aware; used on cards and departure rows.
- **`StopCode` component (new)** — the "Stop 1234" numeral pill with mono type, limestone-soft ground, aegean rule; currently just raw text in `StopCard`.
- **`BusNumberBadge` (new)** — the fleet-number pill riders see on the map callout + trip HUD.
- **`StopCard.tsx`** — background-image treatment using `stop-departures-hero` / `route-card-accent` assets from `mobile/lib/assets.ts`, layered wash so type stays legible, matches web `StopCard` composition.
- **`DepartureRow.tsx`** — bring in RouteChip + StopCode consistency, tier chip + confidence icon alignment.
- Route-list cards on `/route/[id]` and search results get the same accent-asset background.

### 4. Editorial background assets on map screens
Web wraps `MapPreview` in a card with `route-vignette` / `coast-hero` washes. Mobile screens currently render the map raw. Add the same limestone card frame + optional asset hero to each screen's map block.

## Technical notes (skip if not interesting)

- `expo-maps` marker icon API: Google accepts `icon: { assetName }` referencing a native drawable OR a `require()`'d asset URI; Apple accepts `iconImage`. We'll use the `require()` form so the bus PNG ships in the JS bundle.
- Animation state lives outside React (mutable ref of `{ tripId → { lat, lng, rot } }`) and a `useSyncExternalStore` hook re-renders only the map at 30 fps — avoids re-rendering the whole screen.
- Web map (if B) uses the same `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` the web app already uses, loaded via a `<script>` tag injected from `mobile/app/+html.tsx`.

## Deliverables

```text
mobile/
  assets/bus-premium.png            (new — copied from web)
  lib/animatedBus.ts                (new)
  lib/assets.ts                     (extended)
  components/
    MapView.tsx                     (bus PNG marker + RAF glide; web branch if B)
    RouteChip.tsx                   (rebuild premium)
    StopCode.tsx                    (new)
    BusNumberBadge.tsx              (new)
    StopCard.tsx                    (asset backgrounds)
    DepartureRow.tsx                (chip alignment)
    WalkGuidance.tsx                (add map block)
  app/
    stop/[stopId].tsx               (map card frame + asset)
    route/[routeId].tsx             (map card frame + asset)
    trip/[id].tsx                   (map card frame + asset)
    trip-info/[tripId].tsx          (map card frame + asset)
    airport/[code].tsx              (map card frame + asset)
    (tabs)/index.tsx                (nearby stop cards → premium)
```

## Question before I start

1. **Web map — A (keep fallback) or B (real Google JS map)?**
2. Anything you want me to skip from the deliverables list above to keep this shippable in one pass?
