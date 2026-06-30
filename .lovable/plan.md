
# Aloya Mobile (Rider) — Build Plan

A native iOS + Android rider app in `/mobile` (Expo SDK 56 + expo-router + NativeWind), sharing all business logic with the web app via a new `packages/core` workspace. Web behavior is unchanged: `src/lib/*` pure helpers become thin re-exports from `@aloya/core` so existing imports keep working.

Scope: **rider-only** (no ministry/operator surfaces). Same backend (Lovable Cloud / Supabase), same realtime feed, same GTFS data, same trust waves shipped on web.

---

## Wave 0 — Monorepo + shared core (foundation, ship first)

Goal: web keeps working, mobile can import the same logic.

- Convert the repo to a Bun workspaces monorepo at the root:
  - `package.json` adds `"workspaces": ["packages/*", "mobile"]` (web stays at the root for zero-disruption deploy).
  - New `packages/core` with its own `package.json` (name `@aloya/core`, type module, no React/RN/Vite deps — pure TS + zod + date-fns).
- Move **pure, platform-agnostic** helpers from `src/lib/*` into `packages/core/src/`:
  - `gtfs.ts`, `shapes.ts`, `geo.ts`, `geo-fusion.ts`, `freshness.ts`, `eta-v2.ts`, `headsigns.ts`, `journey-phase.ts`, `journey-copy.ts`, `itinerary-types.ts`, `itinerary-rationale.ts`, `learned-types.ts`, `accessibility-prefs.ts` (types only), `accessibility-weights.ts`, `cities.ts`, `pulse-zones.ts`, `motion-pass.ts`, `dictionaries/*`, `i18n` (storage adapter factory — see below).
- `src/lib/<name>.ts` becomes a one-line re-export: `export * from "@aloya/core/<name>";`. Every existing `@/lib/...` import in the web app keeps working untouched.
- Platform-specific helpers stay in `src/lib/` (browser-only: `pwa.ts`, `useGeolocation.ts`, `useGoogleMaps.ts`, `useNfc.ts`, `useQr.ts`, `cloud-sync.ts`, `analytics.ts`, anything reading `window`/`localStorage`/`document`/`navigator`). Mobile re-implements these against RN APIs.
- Server-only files (`*.server.ts`, `*.functions.ts`) stay in `src/lib/`. Mobile calls them over HTTP via `/api/public/*` endpoints already in production.
- Storage adapter pattern for things that need persistence (locale, settings cache, geo cache, trip store): `packages/core` exports a `setStorageAdapter({ getItem, setItem, removeItem })`. Web injects `localStorage` in `src/start.ts`; mobile injects `AsyncStorage` in `mobile/app/_layout.tsx`. Zero forks of the logic.

Acceptance: `bun run build` (web) and `cd mobile && bunx expo start` both succeed; no behavioural diff in the web app.

---

## Wave 1 — Rider shell + live ETAs

Goal: a rider on iOS/Android can find a stop, see departures, and trust the ETA — same trust signals as web.

- App shell: tab nav (Home, Trips, Saved, More) with NativeWind tokens mirroring `src/styles.css` (limestone bg, aegean, ochre, olive, ink). Bricolage Grotesque + Geist via `expo-font`. Light theme only.
- Screens:
  - `index` — Today: greeting (reuse `greeting.ts`), nearby stops, resume-trip pill, weather/dust chip.
  - `stop/[stopId]` — departure board with `EtaPill`-equivalent native component (confidence dot + tier label, reusing `eta-v2` + `freshness` from `@aloya/core`).
  - `route/[routeId]` — route detail with reliability badge.
  - `search` — places + stops (Google Places via existing `maps.functions.ts` over HTTP).
- Realtime: hits `https://aloyacy.lovable.app/api/public/realtime` (already public, CORS-open, 15 s cache). React Query with 15 s `staleTime`.
- Geolocation via `expo-location` (foreground perm + watcher); mirrors `useGeolocation`/`useGeoWatch` API surface so screens reuse the same hook contract.
- Auth: `expo-auth-session` for Google OAuth → same Supabase project. Anonymous-by-default like web (`anon-auth.ts`).
- Sighting button (Wave 1.3 parity): native 44px row → `POST /api/public/sighting`.

Acceptance: search a stop, see departures, confidence labels match web one-to-one, tap a ghost departure → confirm sighting → tier upgrades within 15 s.

---

## Wave 2 — Daily-use quality (rationale, a11y, multimodal walk, P&R, multi-city)

- Trip planner screen calls existing `planMultiLeg` server fn over HTTP (new `/api/public/plan` thin wrapper added to web — JSON in/out — guarded by `apikey` header so it stays internal).
- `ItineraryCard` ported to RN — rationale tags, accessibility-weighted rerank already happens server-side via the shared planner.
- WalkGuidance: `react-native-maps` polyline + Street View via `WebView` (reusing existing `/api/public/streetview` proxy).
- Park & Ride card surfaces from the planner response; "Open driving directions" uses `Linking.openURL("comgooglemaps://...")` with Apple Maps fallback.
- City auto-bias (`cities.ts`) shared from core — works identically on mobile.
- Accessibility prefs stored locally via `AsyncStorage` and synced to `user_settings` when signed in (reuse `cloud-sync` HTTP surface).

Acceptance: plan a Limassol trip on iOS, get the same itinerary + same rationale tags as web, P&R fires under the same conditions.

---

## Wave 3 — Advanced multimodal (intercity intel, last-mile chain, bike-share, scooters)

- Route detail surfaces `IntercityPatternsCard` for IC agency — pulls from `getIntercityInsights` HTTP wrapper.
- `LastMileChainCard` shown on trip results + during walking-to-destination phase; Bolt deep link `bolt://`, Apple/Google Maps deep links, `tel:` for dispatcher.
- Nextbike card + Bolt scooter card — same suggester logic, same honesty rules (never claim live scooter counts).
- Background location for journey companion (`expo-location` background task) — opt-in, only active while a trip is in progress.

Acceptance: parity with web Wave 3 for all four advanced features on iOS + Android.

---

## Wave 4 — Push, offline, payments, polish

- Push notifications via `expo-notifications` registered against existing `push.functions.ts` (table already exists). Pre-board alerts, ghost-bus, disruption replan.
- Offline schedules: prefetch the static GTFS JSON bundle from `public/data/schedule/*` into `expo-file-system` on first launch, refresh weekly.
- Wallet: passes already work over HTTP. Card scan uses `expo-camera` + Vision Camera for OCR (replace `tesseract.js` which is web-only).
- Stripe via `@stripe/stripe-react-native` against the same backend (`stripe.server.ts`); embedded checkout opens in a `WebView` fallback where native sheet isn't applicable.
- App Store + Play Store submission: EAS Build profiles, app icons/splash already in `mobile/assets/`, privacy strings, ATT prompt for analytics, App Store screenshots from real screens.

Acceptance: TestFlight + Play Internal Testing build with push, offline boot, payments, full trust waves working end-to-end.

---

## Technical notes

- **No business-logic fork.** Anything testable as a pure function lives in `packages/core` and is consumed by both web and mobile. Web’s `src/lib/<name>.ts` becomes `export * from "@aloya/core/<name>";` so route files, hooks, and components keep their `@/lib/...` imports unchanged.
- **No new backend.** Mobile is a pure client of the existing Lovable Cloud + `/api/public/*` HTTP surface. Server functions stay server-only.
- **Storage adapter** keeps `i18n`, `accessibility-prefs`, `trip-store`, `paywall-store`, `geo` cache from forking — they read/write through an injected adapter (localStorage on web, AsyncStorage on mobile).
- **TypeScript** uses project references: `tsconfig.json` (web) and `mobile/tsconfig.json` both reference `packages/core/tsconfig.json`. Mobile path alias `@/*` stays mobile-local; shared imports use `@aloya/core/*`.
- **Build**: web build flow is untouched (Vite + Cloudflare). Mobile uses EAS for native builds; Expo dev server runs out-of-tree.
- **Lockfile**: single root `bun.lockb`; mobile's existing `package.json` becomes a workspace member, its deps hoist where compatible.

## Risks + mitigations

- *RN renderer for shadcn components*: shadcn doesn't run on RN. We rebuild the small set of UI primitives the rider needs natively (Card, Button, Sheet, Tabs) with NativeWind — explicitly NOT a port of every shadcn component.
- *Google Maps key exposure*: mobile uses the existing `GOOGLE_MAPS_BROWSER_KEY` referrer-restricted for WebView, and a new mobile-restricted key for native Maps SDK (added via Connectors when Wave 2 lands).
- *Background location review (App Store)*: only requested in Wave 4, only while a trip is active, with clear in-context prompt and disclosure copy.

## Out of scope (for the whole mobile app)

- Operator/ministry surfaces.
- Anything not already shipped on web. Mobile follows web parity per wave — no new product invented here.
