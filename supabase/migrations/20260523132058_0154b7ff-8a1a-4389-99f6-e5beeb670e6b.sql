CREATE TABLE public.walk_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_stop_id TEXT NOT NULL,
  to_stop_id TEXT NOT NULL,
  distance_m INTEGER NOT NULL,
  duration_sec INTEGER NOT NULL,
  polyline TEXT NOT NULL,
  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT walk_links_canonical_order CHECK (from_stop_id <= to_stop_id),
  CONSTRAINT walk_links_pair_unique UNIQUE (from_stop_id, to_stop_id)
);

CREATE INDEX idx_walk_links_from ON public.walk_links (from_stop_id);
CREATE INDEX idx_walk_links_to ON public.walk_links (to_stop_id);

ALTER TABLE public.walk_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all client access to walk_links"
ON public.walk_links
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);