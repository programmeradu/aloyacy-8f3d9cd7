
CREATE TABLE public.trip_plan_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creator_name text,
  origin_label text NOT NULL,
  origin_lat double precision NOT NULL,
  origin_lng double precision NOT NULL,
  destination_label text NOT NULL,
  destination_lat double precision NOT NULL,
  destination_lng double precision NOT NULL,
  departure_unix bigint NOT NULL,
  arrival_unix bigint NOT NULL,
  total_duration_sec integer NOT NULL,
  transfers integer NOT NULL DEFAULT 0,
  legs jsonb NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE INDEX trip_plan_shares_token_idx ON public.trip_plan_shares(token);
CREATE INDEX trip_plan_shares_owner_idx ON public.trip_plan_shares(owner_id);

GRANT SELECT ON public.trip_plan_shares TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_plan_shares TO authenticated;
GRANT ALL ON public.trip_plan_shares TO service_role;

ALTER TABLE public.trip_plan_shares ENABLE ROW LEVEL SECURITY;

-- Anyone with the link (which contains the unguessable token) can read a
-- non-expired plan. Token itself is the capability.
CREATE POLICY "Public can read unexpired plan shares"
  ON public.trip_plan_shares
  FOR SELECT
  TO anon, authenticated
  USING (expires_at > now());

-- Signed-in users create their own shares. Anonymous creators use the
-- server route (service role) so we don't grant anon INSERT here.
CREATE POLICY "Signed-in users create their own plan shares"
  ON public.trip_plan_shares
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners update their own plan shares"
  ON public.trip_plan_shares
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners delete their own plan shares"
  ON public.trip_plan_shares
  FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());
