-- Arrival promises — "get me to Larnaca by 16:00 tomorrow".
--
-- A promise is a standing commitment the watcher keeps re-planning until the
-- rider sets off. One row per promise; the watcher rewrites plan_json,
-- ladder_json, leave_by_unix and reason_short on every re-plan and appends the
-- nudges it has already sent so a retried cron tick can never double-notify.
--
-- Apply against the self-hosted stack:
--   psql "$TARGET_DB_URL" -f deploy/supabase/sql/20260822_arrival_promises.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.arrival_promises (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL,

  target_arrival_unix      bigint NOT NULL,
  margin_pref              text NOT NULL DEFAULT 'normal',

  origin_label             text NOT NULL,
  origin_lat               double precision NOT NULL,
  origin_lng               double precision NOT NULL,
  destination_label        text NOT NULL,
  destination_lat          double precision NOT NULL,
  destination_lng          double precision NOT NULL,

  -- Current best itinerary + the full departure ladder shown to the rider.
  plan_json                jsonb NOT NULL DEFAULT '{}'::jsonb,
  ladder_json              jsonb NOT NULL DEFAULT '[]'::jsonb,

  leave_by_unix            bigint NOT NULL,
  baseline_leave_by_unix   bigint NOT NULL,
  buffer_sec               integer NOT NULL DEFAULT 0,
  reason_short             text,

  status                   text NOT NULL DEFAULT 'watching',
  nudges_sent              text[] NOT NULL DEFAULT '{}',

  last_replan_at           timestamptz,
  replan_count             integer NOT NULL DEFAULT 0,
  push_subscription_id     uuid,
  expo_device_id           text,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arrival_promises_watch_idx
  ON public.arrival_promises (status, leave_by_unix);
CREATE INDEX IF NOT EXISTS arrival_promises_user_idx
  ON public.arrival_promises (user_id, target_arrival_unix DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.arrival_promises TO authenticated;
GRANT ALL ON public.arrival_promises TO service_role;

ALTER TABLE public.arrival_promises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Riders manage their own arrival promises" ON public.arrival_promises;
CREATE POLICY "Riders manage their own arrival promises"
  ON public.arrival_promises FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS arrival_promises_updated_at ON public.arrival_promises;
CREATE TRIGGER arrival_promises_updated_at
  BEFORE UPDATE ON public.arrival_promises
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Single-flight leases for background jobs. The watcher claims 'arrival-watch'
-- before doing any work and exits when the lease is held by a live run.
CREATE TABLE IF NOT EXISTS public.job_leases (
  job_name    text PRIMARY KEY,
  holder      text NOT NULL,
  expires_at  timestamptz NOT NULL,
  paused      boolean NOT NULL DEFAULT false,
  pause_reason text,
  fail_count  integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.job_leases TO service_role;
ALTER TABLE public.job_leases ENABLE ROW LEVEL SECURITY;
-- No policies: service_role only (RLS is bypassed for it), nothing client-side.

-- Atomic claim. Returns true only for the caller that actually took the lease.
CREATE OR REPLACE FUNCTION public.claim_job_lease(
  p_job text,
  p_holder text,
  p_ttl_seconds integer DEFAULT 110
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  took boolean;
BEGIN
  INSERT INTO public.job_leases (job_name, holder, expires_at, updated_at)
  VALUES (p_job, p_holder, now() + make_interval(secs => p_ttl_seconds), now())
  ON CONFLICT (job_name) DO UPDATE
    SET holder = EXCLUDED.holder,
        expires_at = EXCLUDED.expires_at,
        updated_at = now()
    WHERE public.job_leases.expires_at < now()
      AND public.job_leases.paused = false
  RETURNING true INTO took;

  RETURN COALESCE(took, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_job_lease(p_job text, p_holder text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.job_leases
     SET expires_at = now() - interval '1 second', updated_at = now()
   WHERE job_name = p_job AND holder = p_holder;
$$;

COMMIT;
