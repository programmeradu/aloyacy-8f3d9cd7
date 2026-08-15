# Commercial terms

Aloya is proprietary software (see [LICENSE](./LICENSE)). This document
describes what a buyer or licensee receives, what they may do with it, and
what obligations travel with the code. It is descriptive; nothing here is
binding until a signed agreement exists.

## What is included

| Area | Contents |
| --- | --- |
| Web application | TanStack Start v1 app (`src/`) — live arrivals, trip planning, journey guidance, group trips, wallet passes, Stripe billing, dynamic Open Graph rendering |
| Shared core | `packages/core` — routing/RAPTOR planner, ETA model, GTFS shaping, reliability scoring; framework-agnostic and fully typed |
| Mobile application | `mobile/` — Expo/React Native rider app mirroring the web feature set, with native location, haptics, NFC and push |
| Edge workers | `workers/` — GTFS-RT relay (raw-socket Cloudflare Worker) and pulse cron |
| Backend | `supabase/migrations` — schema, RLS policies, grants, RPCs; `deploy/supabase` — self-hosted Docker stack |
| Quality assets | Vitest suites (web + mobile), coverage floors, CI quality gate, env-parity and secret-scan scripts, structured logging, `/api/public/health` |
| Documentation | `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `.env.example` with every variable documented |

## What is not included

- Live production data, Supabase project contents, or user records.
- Third-party accounts and credentials: Google Maps Platform, Google Wallet
  issuer, Stripe, Resend, Cloudflare, Expo/EAS, AWS. A licensee provisions
  their own and supplies their own keys.
- Transit agency data rights. GTFS and GTFS-RT feeds are published by their
  operators under their own terms; a licensee is responsible for their own
  permission to consume and redistribute them.
- The "Aloya" name, logo, domains and bespoke illustration assets, unless the
  signed agreement explicitly transfers the brand.

## Deployment rights (typical grants)

| Grant | Scope |
| --- | --- |
| Single-deployment licence | One production deployment operated by the licensee, unlimited end users, no resale or sublicensing of the source |
| Source-available licence | Above, plus the right to modify and self-host; modifications remain covered by this licence |
| Full asset transfer | Copyright, brand, domains and repository history assign to the buyer; the seller retains no rights and grants no exclusivity beyond the agreement |

White-labelling, reselling to other transit markets, and OEM redistribution
require an explicit clause; none are granted by default.

## Operational obligations for a licensee

- Provide your own secrets. `.env.example` lists every variable the app reads;
  `bun run check:env` enforces parity in CI.
- Keep RLS enabled. Every public-schema table ships with grants and policies;
  removing them exposes rider data.
- Honour GDPR duties for location and account data collected from riders.
- Respect transit operator attribution requirements on any surface that
  displays their schedule or realtime data.

## Third-party components

The Software depends on open-source packages retained under their own
licences — predominantly MIT and Apache-2.0. Notable ones: React, TanStack
Router/Start/Query, Tailwind CSS, Radix UI, shadcn/ui (`src/components/ui`,
vendored MIT), Supabase JS, Stripe JS, Expo and React Native, `jose`,
`gtfs-realtime-bindings`, `@resvg/resvg-wasm`, `mapillary-js`, `tesseract.js`,
`recharts`, `zod`.

Generate the full manifest before any transfer:

```bash
bunx license-checker-rseidelsohn --production --summary
```

No copyleft (GPL/AGPL) dependency is present in the production tree; confirm
with the command above at handover time.

## Security posture at handover

- CI gate: lint (`--max-warnings=0`) → typecheck → env parity → secret scan →
  web + mobile coverage floors → `bun audit --audit-level=high` → build. No
  step uses `continue-on-error`.
- No secret literals in the tree; `bun run scan:secrets` walks the repo.
- All external input boundaries parse with `zod`.
- Structured JSON logging; a guard test fails the build on raw `console.*` in
  server routes.

## Contact

Licensing enquiries: open an issue on the repository the code was delivered
through, or reply on the thread the delivery came from.
