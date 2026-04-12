# Store submission

Everything in this folder is what the agent cannot fill in for you — credentials,
listing copy, and screenshots. Once the values below are in place, an EAS
build is one command away.

## 1. Apple App Store Connect

You need (one-time):

- A paid Apple Developer Program seat for team **REPLACE_WITH_APPLE_TEAM_ID**.
- App Store Connect → My Apps → "+" → New App
  - Platform: iOS
  - Name: **Aloya**
  - Primary language: English (U.S.)
  - Bundle ID: `cy.aloya.app` (must already be registered under your team's
    Certificates, Identifiers & Profiles)
  - SKU: `aloya-ios-v1`
  - User Access: Full Access
- Note the **Apple ID (email)**, **App Store Connect App ID (numeric)** and
  **Apple Team ID** — paste them into `mobile/eas.json` `submit.production.ios`
  in place of the `REPLACE_WITH_*` placeholders.

Then sign in once on this machine:

```bash
cd mobile
eas login
eas credentials   # provisions distribution cert + push key on EAS servers
```

## 2. Google Play Console

- Create the app in Play Console:
  - App name: **Aloya**
  - Default language: English (United States)
  - App or game: App
  - Free or paid: Free
  - Declarations: confirm
- Reserve the package name **`cy.aloya.app`** (set in `app.json`).
- Generate a service-account key for the **Google Play Android Developer API**:
  1. Google Cloud Console → IAM & Admin → Service Accounts → Create
  2. Grant role **Service Account User**
  3. Keys → Add Key → JSON → download
  4. Save the JSON file as `mobile/store/play-service-account.json` (this folder
     is gitignored — never commit it).
  5. In Play Console → Setup → API access → grant the service account
     "Release manager" for the Aloya app.

## 3. Build + submit

```bash
cd mobile

# First, link the Expo project (one-time)
eas init --id 0fa01088-812a-4d3e-b487-32fa9ca55cdb

# Internal dev build (loads your local Metro)
eas build --profile development --platform all

# Closed beta (TestFlight + Play Internal testing)
eas build --profile preview --platform all
eas submit --profile preview --platform ios
eas submit --profile preview --platform android

# Production
eas build --profile production --platform all
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

## 4. Listing copy

See `listing.md` for the exact strings to paste into App Store Connect and
Play Console (title, subtitle, description, keywords, support URL, privacy
URL, categories, age rating answers).

## 5. Privacy

- Privacy policy URL: https://aloyacy.lovable.app/legal/privacy
- Support URL:        https://aloyacy.lovable.app/help
- Marketing URL:      https://aloyacy.lovable.app

If those pages don't exist yet, write them before the first submission —
both stores reject without a working privacy policy URL.

## 6. Screenshots

Required sizes for the first submission:

- iPhone 6.7" (1290×2796) — at minimum: Home/Plan, Live map, Trip details
- iPhone 6.5" (1284×2778) — same set
- iPad 13" (2064×2752) — only if `supportsTablet: true` stays on
- Android phone (1080×1920+) — same three shots, 16:9 or 9:16

Recommended capture: real device in TestFlight (preview profile) under
`scheme: aloya` deep link.
