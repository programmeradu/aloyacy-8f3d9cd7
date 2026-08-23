-- Delivery ledger for the unified notification layer.
--
-- Every push Aloya sends — arrival-promise nudges, departure reminders, trip
-- alerts — records one row here through src/lib/notify.server.ts. It answers
-- "did the rider actually get told?" without digging through worker logs, and
-- gives the in-app notification centre something to read later.
--
-- The insert is best-effort: the app keeps delivering if this table is absent,
-- so applying the migration is safe at any time.

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  tag text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  url text,
  device_id text,
  sent integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  pruned integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Reads are always "this device, most recent first".
CREATE INDEX IF NOT EXISTS notification_deliveries_device_time_idx
  ON public.notification_deliveries (device_id, created_at DESC);

-- Written only by the service role (server hooks). Riders read their own
-- device's history; there is no anon read path.
GRANT SELECT ON public.notification_deliveries TO authenticated;
GRANT ALL ON public.notification_deliveries TO service_role;

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role manages deliveries" ON public.notification_deliveries;
CREATE POLICY "service role manages deliveries"
  ON public.notification_deliveries FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Keep the ledger small; 30 days is plenty for support and the history feed.
DELETE FROM public.notification_deliveries WHERE created_at < now() - interval '30 days';
