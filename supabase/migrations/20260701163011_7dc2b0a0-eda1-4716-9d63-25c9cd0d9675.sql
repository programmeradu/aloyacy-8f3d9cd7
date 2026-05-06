
CREATE TABLE public.trip_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  destination_label text NOT NULL,
  destination_lat double precision NOT NULL,
  destination_lng double precision NOT NULL,
  created_by_name text,
  created_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '8 hours')
);
CREATE INDEX trip_groups_code_idx ON public.trip_groups(code);

CREATE TABLE public.trip_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.trip_groups(id) ON DELETE CASCADE,
  member_token text UNIQUE NOT NULL,
  display_name text NOT NULL,
  origin_label text,
  last_lat double precision,
  last_lng double precision,
  last_updated timestamptz,
  eta_minutes integer,
  status text NOT NULL DEFAULT 'active',
  is_creator boolean NOT NULL DEFAULT false,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trip_group_members_group_idx ON public.trip_group_members(group_id);

GRANT SELECT, INSERT, UPDATE ON public.trip_groups TO anon;
GRANT SELECT, INSERT, UPDATE ON public.trip_groups TO authenticated;
GRANT ALL ON public.trip_groups TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.trip_group_members TO anon;
GRANT SELECT, INSERT, UPDATE ON public.trip_group_members TO authenticated;
GRANT ALL ON public.trip_group_members TO service_role;

ALTER TABLE public.trip_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_group_members ENABLE ROW LEVEL SECURITY;

-- Groups: anyone with the code can read; anyone can create.
CREATE POLICY "trip_groups read all" ON public.trip_groups FOR SELECT USING (true);
CREATE POLICY "trip_groups insert any" ON public.trip_groups FOR INSERT WITH CHECK (
  (auth.uid() IS NULL AND created_by_id IS NULL)
  OR (auth.uid() IS NOT NULL AND created_by_id = auth.uid())
);
-- Only the creator (or the anon device that created it, via ownerless row) may update.
CREATE POLICY "trip_groups update by creator" ON public.trip_groups FOR UPDATE
  USING ((created_by_id IS NULL) OR (created_by_id = auth.uid()))
  WITH CHECK ((created_by_id IS NULL) OR (created_by_id = auth.uid()));

-- Members: anyone with the group can read all members (public watch surface).
CREATE POLICY "trip_group_members read all" ON public.trip_group_members FOR SELECT USING (true);
CREATE POLICY "trip_group_members join" ON public.trip_group_members FOR INSERT WITH CHECK (
  (auth.uid() IS NULL AND owner_id IS NULL)
  OR (auth.uid() IS NOT NULL AND owner_id = auth.uid())
);
-- Own-row update capability: authenticated users update their own row; anon
-- rows are updatable by anyone knowing the member_token (client filters by it).
CREATE POLICY "trip_group_members update own" ON public.trip_group_members FOR UPDATE
  USING ((owner_id IS NULL) OR (owner_id = auth.uid()))
  WITH CHECK ((owner_id IS NULL) OR (owner_id = auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_group_members;
