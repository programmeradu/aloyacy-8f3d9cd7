-- Re-enable realtime broadcasts for tables protected by per-user RLS so the
-- client UI updates instantly across devices/tabs without polling.
-- Each table already restricts SELECT to auth.uid() = user_id, so realtime
-- events are filtered per-subscriber by Supabase and only the owner sees them.

ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_departures;
ALTER PUBLICATION supabase_realtime ADD TABLE public.commute_patterns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alert_counters;

-- Ensure UPDATEs broadcast the full row (needed for filtered subscriptions).
ALTER TABLE public.subscriptions REPLICA IDENTITY FULL;
ALTER TABLE public.scheduled_departures REPLICA IDENTITY FULL;
ALTER TABLE public.commute_patterns REPLICA IDENTITY FULL;