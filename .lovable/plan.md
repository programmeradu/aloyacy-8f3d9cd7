
# Strategic build plan — five phases, shipped in order

Account-free by default. A Supabase **anonymous user** is created silently on first launch so cloud sync, push, and trip history work without a sign-up wall. The user is only prompted to add an email/password (or Google) when they tap **Upgrade to Pro** — at that point the anonymous account is *linked* to the real identity, preserving all their data.

Inspector mode is dropped from scope.

---

## Phase 1 — Schedule ingest fix (the silent killer)

The bug: `public/data/schedule/by-date/` ends 2026-06-05; today is 2026-06-08. Every future-time plan returns empty.

1. **New server route** `src/routes/api/public/hooks/ingest-schedule.ts` — downloads the 7 Cyprus GTFS feeds, builds per-date shards for today + next 13 days, uploads to the existing `schedule` Storage bucket. Auth via `apikey` anon-key header.
2. **`src/lib/schedule-loader.server.ts`** — try Storage public URL first, fall back to bundled `/data/schedule/...`. Fresh data without redeploys.
3. **pg_cron** daily at 03:00 Cyprus time hitting the hook.
4. **Run once now** via `invoke-server-function` so today works immediately.
5. **`raptor.server.ts` + `journey-scheduled.server.ts`** — `searchHorizonSec` parameter: 4h default, 24h when `departAtUnix`/`arriveByUnix` passed; anchor scan at `departureUnix`.
6. **`multileg.functions.ts`** — distinguish shard-404 from "no itineraries"; surface `noScheduleAvailable` + `requestedDate`.
7. **`trips.tsx`** — inline notice when no timetable exists for the requested date.
8. **`nl-suggestions.functions.ts` (exists, currently static) + `NLPlannerCard.tsx`** — dynamic chips: personal repeat, time-of-day intent, trending nearby, tomorrow-anchor, POI fallback. Refetch every 10 min and on geolocation change.

## Phase 2 — Anonymous cloud sync (no sign-up wall)

Goal: trip history, saved places, Motion card, Pro entitlement, push subs follow the rider across devices — without ever asking them to create an account.

1. **Enable anonymous sign-ins** via `configure_auth` (`external_anonymous_users_enabled: true`).
2. **`src/lib/anon-auth.ts`** — on `__root.tsx` mount, if no session, `supabase.auth.signInAnonymously()`. Idempotent. Single guard.
3. **Schema migration** — new tables, all `user_id uuid references auth.users` + RLS scoped to `auth.uid()`:
   - `saved_places` (label, lat, lng, kind)
   - `trip_history_cloud` (mirror of local format)
   - `motion_card` (one row per user — number, holder, jcc tokens encrypted, balance cache)
   - `user_settings` (locale, notif prefs, onboarding completion)
   - GRANTs to `authenticated` only; `service_role ALL`.
4. **Sync engine** `src/lib/cloud-sync.ts` — debounced two-way sync between localStorage and Supabase. Last-write-wins on `updated_at`. Runs on focus + every 60s + on local change.
5. **Pro entitlement** — existing `subscriptions` table already keyed by user_id; `usePro` reads from it via `getProStatus` server fn. Anonymous user already has a `user_id`, so Stripe checkout passes it as `client_reference_id`.
6. **Upgrade-flow account linking** — when user taps Upgrade to Pro:
   - `PaywallSheet` first asks: *"Save your card to your phone or your account?"* If account: collect email + password OR Google.
   - Call `supabase.auth.updateUser({ email, password })` (links anon → permanent). Or `linkIdentity({ provider: 'google' })`. All cloud data preserved automatically because `user_id` is unchanged.
   - Then proceed to Stripe checkout.
7. **`useAuth.ts`** — expose `{ user, isAnonymous, isPermanent, upgradeWithEmail, upgradeWithGoogle }`. Never show a sign-in wall anywhere else.

## Phase 3 — Onboarding (3 screens)

Lazy-mounted route `/welcome`, redirects to `/` after completion. Stored in `user_settings.onboarded_at`. Shown on first launch only.

1. **Screen 1 — Location.** Bespoke illustration (Cyprus coastline, generated). One CTA: "Use my location". Skip link.
2. **Screen 2 — Notifications.** "We'll only ping you about your trip." Subscribe via existing `push.functions.ts`. Skip link.
3. **Screen 3 — Motion card (optional).** "Add now or later." Routes to `/wallet` or `/`. Skip always available.

Each screen: editorial typography, generated asset, no icon library.

## Phase 4 — Greek localization (English + Greek; Turkish deferred)

1. **`src/lib/i18n.ts`** — lightweight typed dictionary, no library. `t(key, vars?)` reads from `dictionaries/{en,el}.ts`. Locale from `user_settings.locale`, fallback to `navigator.language`, default `en`.
2. **Extract strings** — sweep components for hardcoded copy, replace with `t(...)`. Prioritized: home, trips, wallet, journey HUD, paywall, onboarding.
3. **`LocaleSwitcher`** — small text toggle "EN / EL" in the home header.
4. **`<html lang>`** updated in `__root.tsx` based on locale.

Turkish noted as future Phase 4.5.

## Phase 5 — Privacy + Terms

1. **`/privacy`** and **`/terms`** route files — static MDX-style content in TSX, real legal copy tailored to Cyprus + GDPR + Apple/Google/Stripe requirements (data collected, third parties, retention, contact, jurisdiction).
2. **Footer links** in onboarding screen 1 and paywall sheet.
3. **Cookie/consent banner** — minimal, GDPR-compliant, dismissable, stored locally.
4. **`<head>` metadata** for both routes; canonical URLs.

---

## Technical notes

- **Supabase anonymous auth.** Native Supabase feature. Each device gets a permanent `user_id` on first launch; that id survives across sessions via the existing localStorage session persistence. Linking via `updateUser` or `linkIdentity` upgrades the same row in `auth.users` — no data migration needed.
- **Stripe + anonymous users.** `client_reference_id = user_id` on Checkout Session; webhook writes to `subscriptions` keyed by that id. Already wired this way.
- **JCC tokens.** Currently in localStorage. Phase 2 stores them server-side encrypted via `pgsodium` (or via Supabase Vault if simpler). Decision: store client-side encrypted with a device-bound key, server only sees ciphertext. Keeps zero-trust posture.
- **Sync conflict policy.** Last-write-wins by `updated_at`; if same timestamp, server wins. Acceptable for the data shapes here.
- **Bundle impact.** Greek dictionary adds ~15KB. Cloud sync adds ~3KB. Onboarding lazy-loaded.

## Order of execution

Phase 1 ships first (fixes the live bug). Phase 2 second (unlocks everything else). Phases 3 → 5 can ship in parallel after that but I'll do them in order for review hygiene.

## Open question

**Anonymous user storage of JCC tokens** — client-encrypted (zero-trust, slightly more complex) vs server-side via Vault (simpler, requires trust)? I'll default to **client-encrypted with a device key** unless you say otherwise.

Approve and I'll start Phase 1 immediately.
