
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subscriptions_device ON public.push_subscriptions(device_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- No client-side access; only the service role (server functions) reads/writes.
-- Intentionally no policies => anon/auth roles cannot select/insert/update/delete.
