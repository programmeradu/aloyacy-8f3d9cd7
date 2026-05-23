-- Phase 4: extend active_trips to carry full multi-leg itineraries.
-- Adds a jsonb `legs` column that stores the Itinerary DTO (ride + walk + wait
-- legs in order) used by the leg-aware cron alert dispatcher. Legacy single-leg
-- columns (board_*, alight_*, route_short, walk_in_sec, walk_out_sec) remain in
-- place so trips upserted by older clients keep working — they're now optional.
-- alerts_sent already stores text[] keys; we'll start prefixing per-leg keys
-- with the leg index (e.g. `at-stop:0`, `alight-soon:1`) so the same row can
-- track every alert across all ride legs without collisions.

ALTER TABLE public.active_trips
  ADD COLUMN IF NOT EXISTS legs jsonb,
  ADD COLUMN IF NOT EXISTS itinerary_id text,
  ADD COLUMN IF NOT EXISTS total_arrival_unix bigint;

-- Make legacy single-leg fields nullable (they already were, but be explicit
-- about new clients that will only populate `legs`).
ALTER TABLE public.active_trips
  ALTER COLUMN route_short DROP NOT NULL,
  ALTER COLUMN board_stop_id DROP NOT NULL,
  ALTER COLUMN board_name DROP NOT NULL,
  ALTER COLUMN board_unix DROP NOT NULL,
  ALTER COLUMN alight_stop_id DROP NOT NULL,
  ALTER COLUMN alight_name DROP NOT NULL,
  ALTER COLUMN alight_unix DROP NOT NULL;