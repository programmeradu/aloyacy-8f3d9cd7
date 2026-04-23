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
7. ✅ **Saved screen** (`mobile/app/(tabs)/saved.tsx`) → `useSavedPlaces`/`useRecents`, pin/unpin with haptics, RecentRow inline label editor, pro-gate via `useProSubscription`, native `NotificationsCard` (Expo perms + Linking to Settings), `OfflineSchedulesCard`, `GoProCard` upsell for free riders.
8. ✅ **Plan screen** (`mobile/app/(tabs)/plan.tsx`) → Google Places autocomplete (new `/api/public/places-autocomplete` + `/api/public/place`) with debounced suggestions, native datetime `TimePicker` (now / depart at / arrive by), `useQuery` + `refetchInterval: 30s` keyed off realtime tick, parallel `useQueries` for PnR/Kapnos/Dust/bike/scooter/chain. Native `ParkAndRideCardMobile`, `KapnosShuttleCardMobile`, `DustAdvisoryBannerMobile`, `RemindMeButtonMobile` (Expo local notifications + pro-gate via `useProSubscription`). Pull-to-refresh, feed-stale label, empty state.

## Wave C — Map + deep screens

9. ✅ **`MapView` primitive** (`mobile/components/MapView.tsx`) — Expo Maps (Apple on iOS, Google on Android) + filtered live `useRealtime` vehicles (focusTripId / focusRouteId / restrictTripIds / vehicleOverrides parity with web), polyline decoder, grid clustering for dense stop pins, derived camera framing, user-location dot, limestone web fallback + empty overlay.
10. ✅ **Trip-info screen** (`mobile/app/trip-info/[tripId].tsx`) — same arrivals/nextIdx model as web, route hero + RouteChip + bus label + meta (stops · km · ends at), MapView scoped to this trip with tone-tagged stop markers (highlight/next/passed/upcoming), NextStop / ETA-clock / Status composite, full stop timeline with delay deltas, haptic stop-press, pull-to-refresh, feed-stale chip, deep-link back to `?from=` stop.
11. **Route screen finish** (`mobile/app/route/[routeId].tsx`) — vignette art, next-departure dark hero, runs list, stop-sequence with live bus dot, ReliabilityBadge, MapView.
12. **Live Trip Companion** — sliced into 12a/12b/12c.
    - 12a ✅ **Sensors + Journey core** — `mobile/lib/useCompass.ts` (Magnetometer, low-pass filter), `mobile/lib/useFusedFix.ts` (expo-location BestForNavigation + `@aloya/core/geo-fusion` Kalman + 2 Hz dead-reckon ticker + snap-to-route), `mobile/lib/useJourney.ts` (full phase machine: walking → at-stop → hurry-soft/urgent → boarding → on-bus → alight-soon → walking-to-dest → arrived, GPS×feed fusion, vehicle-lost fallback, auto-confirm boarding, missed-bus detection), `mobile/lib/tripAlerts.ts` (one-shot local notifications + haptics per phase). TODOs for 12b: `/api/public/drive-eta` blend + bundled `route_stops.json` for wrong-stop reroute hint.
    - 12b ✅ **Single-leg Companion screen** — `mobile/app/trip/[id].tsx` (phase hero + countdowns + delay label, live MapView with polyline / focused vehicle / rider dot / fused vehicle override, honest feed/vehicle/ghost banners, JourneyHUD wiring, static & live WalkGuidance, journey timeline, alight alert). `mobile/components/JourneyHUD.tsx` (Start, HurryBanner, LiveStepCard, AtStopCard, BoardingPrompt with 30s auto-confirm, MissedBusCard rescue via `/api/public/plan`, RidingCard with fused ETA + "I'm off" button, ArrivedCard). `mobile/components/WalkGuidance.tsx` (native turn-by-turn with Street View + maneuver fallback SVG, current-step highlight). `src/routes/api/public/walk-directions.ts` CORS wrapper + `mobile/lib/walk.ts` client. Multi-leg trips get a "coming in 12c" notice.
    - 12c ✅ **Multi-leg Companion** — `mobile/lib/useMultiLegJourney.ts` (native port of the phase machine: walking-to-board → waiting-to-board → riding → alight-soon → walking-to-transfer → waiting-for-connection → missed-connection → walking-to-destination → arrived, with GPS×feed fusion, distance-floored alight ETA, auto-advance of walk/wait legs, GPS-sustained boarding auto-confirm, missed-connection detection, current-vehicle GPS fallback, and local one-shot trip alerts). `mobile/components/MultiLegCompanion.tsx` (leg ribbon, phase-aware hero, honest feed/ghost/vehicle-lost/next-not-tracked banners, dual-vehicle map with `restrictTripIds` + `vehicleOverrides`, per-phase action HUD including missed-connection rescue, current-leg walk turn-by-turn via `fetchWalkingDirections`, full itinerary timeline). Wired from `mobile/app/trip/[id].tsx` — replaces the 12b `MultiLegNotice`. Web-only extras (drive-ETA fusion, wrong-stop reroute, disruption watcher, last-mile chain, live re-plan sheet, training/commute signals) intentionally deferred to keep parity with the mobile single-leg companion.
13. ✅ **Airport screen** (`mobile/app/airport/[code].tsx`) — LCA/PFO parity with the web page. Public wrapper `src/routes/api/public/airport.ts` + `mobile/lib/airport.ts` client feed `getAirportPage` (Kapnos coach lines + airport meta) into the RN screen, pinned to the airport GTFS stop (6117 / 1813). Editorial hero, MapView with airport marker + `restrictTripIds` to on-airport departures, native Kapnos `CoachLineCard` (day chip, seats-low/sold, Times/Book Linking CTAs), then live urban `DepartureRow`s driven by `smartEtaV2` (same dedupe/≤180-min filter as the stop screen). Ghost-bus banner, feed-stale label, empty state, native `Share`, haptic row press, pull-to-refresh, invalid-code fallback.

## Wave D — Editorial + onboarding + polish

14. ✅ **Pulse tab** (`mobile/app/(tabs)/pulse.tsx`) — full editorial parity with the web `/pulse` route driven by a single new public wrapper (`src/routes/api/public/pulse.ts`) that composes `getTodayBriefing` + `getLivePulse` + `getPulseHourStrip` + `getPulseLive`. Native Today editorial (bespoke SVG hero per theme, dateline chip, focus badge, headline / lede, tile grid with per-kind SVG glyphs, verdict block, Greek word of the day, local / tourist fact card), RoadPulseCard (hero eyebrow + big on-time %, late / on-time / early proportion bar with legs, honest "between runs" empty state, 24h ActivityComb SVG anchored on now-hour), and LiveSignals section (MetWarning, News rotator with tap-to-open + Haptics, Sea, Air with dust advisory band, Traffic incidents, Cruises, Flights per airport, Events, Fixtures). New Pulse tab wired into `mobile/app/(tabs)/_layout.tsx` with a bespoke `PulseIcon` in `mobile/components/TabIcon.tsx`. Client types in `mobile/lib/pulse.ts` mirror the web payloads without pulling web-server modules into the RN bundle. Pull-to-refresh, loading / error states, generatedAt footer.
15. ✅ **Wallet expansion** (`mobile/app/(tabs)/wallet.tsx`) — promoted from a More-tab tile into its own tab (WalletIcon in `TabIcon.tsx`, More tab hidden via `href: null`). New public aggregator `src/routes/api/public/wallet.ts` bundles the JCC + publictransport actions (login / refresh / sync / verify / options) behind one CORS-friendly endpoint; `mobile/lib/walletApi.ts` mirrors the exact web response shapes. `mobile/lib/motionPass.ts` extended to full parity with `packages/core/src/motion-pass.ts` (JCC link tokens, transactions, eligible passes, cardType, topups, in-memory subscriber list). Native `MotionCardVisual` (bespoke SVG card face + live QR + camera scan launcher), `PassSheet` (card / balance / topup / link modes with keyboard-avoiding sheet), `FareTile` grid, `TransactionList`, `TopupHistory`, `RenewPasses` (clipboard copy + opens the top-up portal), `ProAccountCard` (Pro entitlement + Stripe portal via `expo-web-browser`), and `AccessibilityPrefsCard` (local `useAccessibilityPrefs` on AsyncStorage — step-free, prefer-shade, walking-cap stepper). Auto-syncs public balance (>5 min stale) + JCC transactions (>10 min stale) on mount, plus pull-to-refresh. Bottom of the screen absorbs the retired More-tab content (AuthCard, NotificationsCard, OfflineSchedulesCard, Privacy/Terms/About rows) so nothing is lost.
16. ✅ **Native onboarding** (`mobile/app/welcome.tsx`) — 3-step carousel (Location + Notifications + Motion card) gated on first launch via `aloya.onboarded.v1`.
17. ✅ **Settings + global polish** — new `mobile/app/settings.tsx` reached from the Wallet "App settings" row: language switcher (EN/EL/RU) backed by `mobile/lib/i18n.ts` (compact dictionary + `useLocale` hook with expo-localization detection and AsyncStorage override under `aloya.locale.v1`), accessibility prefs (`AccessibilityPrefsCard`), notifications (`NotificationsCard`), offline schedules, account (`AuthCard`), and legal rows (About / Privacy / Terms). Tab labels now render through `t("tab.*")`. Global entrance polish via `mobile/components/FadeSection.tsx` — Reanimated `FadeInDown` with per-index stagger and a `AccessibilityInfo.isReduceMotionEnabled` fallback, applied to the Settings screen and to Wallet's fare grid / history / account sections. Version footer reads from `expo-constants`.

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
