
CREATE TABLE public.shared_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  origin_label text,
  destination_label text NOT NULL,
  destination_lat double precision NOT NULL,
  destination_lng double precision NOT NULL,
  last_lat double precision,
  last_lng double precision,
  last_updated timestamptz,
  eta_minutes integer,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '4 hours')
);
CREATE INDEX shared_trips_token_idx ON public.shared_trips(token);
CREATE INDEX shared_trips_owner_idx ON public.shared_trips(owner_id);

GRANT SELECT, INSERT, UPDATE ON public.shared_trips TO anon;
GRANT SELECT, INSERT, UPDATE ON public.shared_trips TO authenticated;
GRANT ALL ON public.shared_trips TO service_role;

ALTER TABLE public.shared_trips ENABLE ROW LEVEL SECURITY;

-- Anyone with the token can read (the token itself is the capability).
CREATE POLICY "shared_trips read all"
  ON public.shared_trips FOR SELECT
  USING (true);

-- Insert: authed users can create shares tied to their id; anon can create ownerless shares.
CREATE POLICY "shared_trips insert"
  ON public.shared_trips FOR INSERT
  WITH CHECK (
    (auth.uid() IS NULL AND owner_id IS NULL)
    OR (auth.uid() IS NOT NULL AND owner_id = auth.uid())
  );

-- Update: owner can update their rows; ownerless rows are updatable by anyone knowing the token.
CREATE POLICY "shared_trips update"
  ON public.shared_trips FOR UPDATE
  USING (
    (owner_id IS NULL) OR (owner_id = auth.uid())
  )
  WITH CHECK (
    (owner_id IS NULL) OR (owner_id = auth.uid())
  );
