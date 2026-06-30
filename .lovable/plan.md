# Aloya Mobile Parity Plan

The web app (`src/`) is the floor. Mobile (`mobile/`) must mirror every shipped screen with the same APIs, the same states (loading / empty / error / offline / pro-gate), and the same editorial depth — then enhance with native (haptics, gestures, camera, NFC, push, sensors). No hardcoded data, no stubs, no stripped surfaces.

This plan is tracked in `.lovable/mobile-parity-plan.md` and updated after every wave.

---

## Wave A — Foundation primitives (unblocks everything) ✅

1. ✅ **Port `eta-v2`** → `mobile/lib/eta-v2.ts` (uses `@aloya/core/geo` + `@aloya/core/freshness`, getStop resolved via runtime stop registry).
2. ✅ **Port `freshness`** → `mobile/lib/freshness.ts` (re-export of `@aloya/core/freshness`).
3. ✅ **Port `trip-store`** → `mobile/lib/trip-store.ts` (AsyncStorage + in-memory cache + emitter; multi-leg helpers included; hydrated at app boot).
4. ✅ **Build RN `DepartureRow`** → `mobile/components/DepartureRow.tsx` + `mobile/components/ConfidenceIcon.tsx` (react-native-svg signal bars).

Infra: `@aloya/core` wired as a workspace dep in `mobile/package.json`; metro now watches `packages/core` and resolves from root `node_modules`; `useStopsBundle` seeds the runtime stop registry; `hydrateTripStore()` runs on app boot.

## Wave B — Close P0 screens

5. ✅ **Stop screen rewire** (`mobile/app/stop/[stopId].tsx`) → SmartEtaV2 + DepartureRow + ghost-bus banner + haptics + pull-to-refresh. (SightingButton + ShareSheet deferred to Wave C.)
6. ✅ **Home screen rewire** (`mobile/app/(tabs)/index.tsx`) → live ETAs via `smartEtaV2`, RN `StopCard` with tier chip + ConfidenceIcon, pull-to-refresh, feed-stale label, empty state. WeatherStamp, QuickStat tiles, NLPlannerCard, CommuteSuggestionCard, landmark chips deferred to Wave D polish.
7. **Saved screen** (`mobile/app/(tabs)/saved.tsx`) → `useSavedPlaces`, `useRecents`, pin/unpin, `OfflineSchedulesCard`, pro-gate, NotificationsCard.
8. **Plan screen** (`mobile/app/(tabs)/plan.tsx`) → Google Places autocomplete via `maps.functions`, time picker, `useQuery` + `refetchInterval`, ParkAndRideCard, KapnosShuttleCard, DustAdvisoryBanner, RemindMeButton, pro-gate.

## Wave C — Map + deep screens

9. **`MapView` primitive** (`mobile/components/MapView.tsx`) — Expo Maps + live vehicle overlay + polylines + clustering.
10. **Trip-info screen** (`mobile/app/trip-info/[tripId].tsx`) — next-stop card, ETA card, status card, stop-list with delay, MapView.
11. **Route screen finish** (`mobile/app/route/[routeId].tsx`) — vignette art, next-departure dark hero, runs list, stop-sequence with live bus dot, ReliabilityBadge, MapView.
12. **Live Trip Companion** (`mobile/app/trip/[id].tsx`) — phase card, JourneyHUD, walk guidance, MapView with fusing, stale banners, MultiLegCompanion. Port `useJourney` + `useCompass` to Expo sensors.
13. **Airport screen** (`mobile/app/airport/[code].tsx`) — Kapnos coach cards + SmartEtaV2 departures + ShareSheet.

## Wave D — Editorial + onboarding + polish

14. **Pulse / Today tab** (`mobile/app/(tabs)/pulse.tsx`) — Today editorial (hero, tiles, verdict, Greek word), RoadPulseCard, PulseLiveSection. Add as a new tab.
15. **Wallet expansion** — balance, JCC sync, PassSheet, fare grid, transactions, ProAccountCard, AccessibilityPrefsCard. Promote to its own tab if needed.
16. **Native onboarding** (`mobile/app/welcome.tsx`) — 3-step carousel using Expo Location + Notifications + MotionCard.
17. **More tab wiring + global polish** — Language (Expo Localization + i18n port), Accessibility prefs, Notifications toggle, Privacy/Terms links, Reanimated `FadeInDown` entrance on every section.

---

## Working rules (per wave)

- Read the web file of truth first; mirror its data shape and states exactly.
- New mobile components match Mediterranean editorial direction — limestone bg, aegean/ochre/olive/ink, Bricolage + Geist + JetBrains Mono, no emojis, no bullet dots, no thin weights, no Lucide.
- Every screen ships with loading + empty + error + offline + pro-gate states from day one.
- After each wave, update this plan with status (✅ shipped / 🟡 partial / ⏳ next) and re-run an audit against the web counterpart.
- Native enhancements (haptics, share sheet, sensors, NFC) layer on top — never substitute for parity.

## Out of scope (already deferred)

- NFC tap-to-read (queued post-parity).
- B2G / operator surfaces — citizen app only.
- Long-form `/guide/getting-around-cyprus` editorial — web-only.
