# Offline cache — web + mobile

Status: **DEFERRED** — saved 2026-07-02 for later. Ping me with "let's do the offline cache plan" (or similar) and I'll pick this up.

Two surfaces, two mechanisms, one shared philosophy: the app opens instantly with the last-good data when the network is gone, and refreshes silently when it comes back.

## What gets cached (both platforms)

- **App shell** (web only): HTML, JS, CSS, fonts, icons — so the app launches offline.
- **Static GTFS payloads**: `public/data/*.json`, `gtfs-shapes.json`, `gtfs-headsigns.json` — stable, safe to cache aggressively.
- **Query results** (both): all TanStack Query caches persist to disk, so the last-seen pulse, plans, saved trips, group state, wallet balance, etc. render immediately on cold start.
- **Live data** (pulse, realtime, ETAs): NetworkFirst on web, cached-with-stale-marker on mobile. Never cache-first — riders need fresh numbers.
- **Media/tiles**: Google Maps tiles are handled by their own SDK — we do not intercept.

Not cached: auth tokens (handled by Supabase), OAuth callbacks (`/~oauth`), server functions with side effects.

## Web (vite-plugin-pwa)

1. Add `vite-plugin-pwa` with `registerType: "autoUpdate"`, `generateSW`, `injectRegister: null`, `devOptions: { enabled: false }`.
2. Runtime caching:
   - HTML navigations → `NetworkFirst` (excludes `/~oauth`, `/api/*`).
   - `/public/data/*.json`, hashed JS/CSS → `CacheFirst`, 30 days.
   - `/api/public/realtime`, `/api/public/pulse`, `/api/public/*` GETs → `NetworkFirst`, 60s cache with 1-day SWR fallback, so a dead network still renders the last snapshot with a stale badge.
   - Google Fonts → `CacheFirst`, 1 year.
3. Registration wrapper (`src/lib/register-sw.ts`) — the only registrar; refuses to register when any of these hold: `!import.meta.env.PROD`, inside iframe, hostname is a Lovable preview host, or URL has `?sw=off`. In refused contexts, unregisters existing `/sw.js` registrations.
4. Hook the wrapper into `src/start.ts` (client entry) once.
5. Persist TanStack Query cache to `localStorage` via `@tanstack/query-sync-storage-persister` + `persistQueryClient`. Buster keyed to app version so a deploy invalidates stale shapes.
6. Small offline banner: subscribes to `navigator.onLine`, shows "Offline — showing last-known bus data" at the top on route changes when offline.

## Mobile (Expo / React Native)

No service workers on native. Same UX via layered caches:

1. Install `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister` (AsyncStorage already present).
2. Wrap `QueryClientProvider` with `PersistQueryClientProvider` in `mobile/app/_layout.tsx`. `maxAge: 24h`, buster keyed to `expo-application` bundle version.
3. Persist small state slices (active trip, saved trips, wallet) via existing `mobile/lib/*` stores — audit + add AsyncStorage persistence where missing.
4. Bundle static GTFS JSON directly in the app via `assets/data/` require() so they are always available offline (no network trip on cold start).
5. Network status via `@react-native-community/netinfo` → global `useOnline()` hook. When offline: React Query switches to `networkMode: "offlineFirst"`, mutations queue via `onlineManager`, bottom banner shows the same copy.
6. On foreground return-online: invalidate `["pulse"]`, `["realtime"]`, `["saved-trips"]` so freshest data replaces the cached snapshot without a visible spinner.

## Shared UI contract

- Same copy on both platforms: "Offline — showing last-known bus data. We'll refresh when you're back."
- Same stale badges on live cards (pulse, realtime ETAs, group members): dim + "as of HH:MM" label when `data.updatedAt` is older than 60s while offline.
- No blocking spinners on cold start — always render the persisted snapshot first, then reconcile.

## Preview safety (web)

The registration wrapper is the only thing that touches `navigator.serviceWorker`. It never registers in dev, iframe, Lovable preview hosts, or when `?sw=off` is present, and actively unregisters any stale `/sw.js` in those contexts. This keeps the Lovable editor preview clean while offline mode ships to the published site.

## Files touched

**Web**
- `vite.config.ts` — add `VitePWA` plugin config.
- `src/lib/register-sw.ts` — new, guarded registrar + unregister-on-preview.
- `src/start.ts` — invoke the wrapper.
- `src/router.tsx` — attach `persistQueryClient` to the QueryClient.
- `src/components/OfflineBanner.tsx` — new, mounted in `__root.tsx`.
- `src/routes/__root.tsx` — mount the banner.

**Mobile**
- `mobile/package.json` — add `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister`, `@react-native-community/netinfo`.
- `mobile/app/_layout.tsx` — swap to `PersistQueryClientProvider`, register `onlineManager` with NetInfo, mount banner.
- `mobile/lib/online.ts` — new `useOnline()` hook.
- `mobile/lib/gtfs.ts` — read bundled static data first, network as refresh.
- `mobile/components/OfflineBanner.tsx` — new.

## Out of scope

- No offline map tiles (Google's terms + storage cost).
- No offline mutations for wallet top-ups / payments.
- Push notifications and background location run through their own workers/services — untouched.
