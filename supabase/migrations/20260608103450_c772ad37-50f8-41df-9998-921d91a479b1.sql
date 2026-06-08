
-- ============================================================
-- user_settings — one row per user
-- ============================================================
CREATE TABLE public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  locale TEXT NOT NULL DEFAULT 'en',
  notif_trip_alerts BOOLEAN NOT NULL DEFAULT true,
  notif_disruptions BOOLEAN NOT NULL DEFAULT true,
  onboarded_at TIMESTAMPTZ,
  consent_analytics BOOLEAN NOT NULL DEFAULT false,
  consent_cookies_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_settings: owner read"
  ON public.user_settings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "user_settings: owner insert"
  ON public.user_settings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_settings: owner update"
  ON public.user_settings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_settings: owner delete"
  ON public.user_settings FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- saved_places — favourite labelled spots (home, work, custom)
-- ============================================================
CREATE TABLE public.saved_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('home', 'work', 'custom')),
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX saved_places_user_idx ON public.saved_places(user_id);
CREATE UNIQUE INDEX saved_places_user_kind_unique
  ON public.saved_places(user_id, kind) WHERE kind IN ('home','work');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_places TO authenticated;
GRANT ALL ON public.saved_places TO service_role;

ALTER TABLE public.saved_places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_places: owner all"
  ON public.saved_places FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER saved_places_updated_at
  BEFORE UPDATE ON public.saved_places
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- trip_history_cloud — user-scoped mirror of the local trip log
-- (kept separate from the analytics `trip_history` table which is
--  device-scoped and feeds the cross-user trending model).
-- ============================================================
CREATE TABLE public.trip_history_cloud (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  taken_at TIMESTAMPTZ NOT NULL,
  from_lat DOUBLE PRECISION NOT NULL,
  from_lng DOUBLE PRECISION NOT NULL,
  from_label TEXT NOT NULL,
  to_lat DOUBLE PRECISION NOT NULL,
  to_lng DOUBLE PRECISION NOT NULL,
  to_label TEXT NOT NULL,
  route_id TEXT,
  duration_sec INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX trip_history_cloud_user_idx ON public.trip_history_cloud(user_id, taken_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_history_cloud TO authenticated;
GRANT ALL ON public.trip_history_cloud TO service_role;

ALTER TABLE public.trip_history_cloud ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trip_history_cloud: owner all"
  ON public.trip_history_cloud FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- motion_card — the rider's Motion bus card (one row per user)
-- jcc_tokens_encrypted is opaque ciphertext sealed client-side
-- with a device-derived key; the server never sees plaintext.
-- ============================================================
CREATE TABLE public.motion_card (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  card_number TEXT NOT NULL CHECK (char_length(card_number) BETWEEN 6 AND 32),
  holder TEXT,
  tier TEXT,
  valid_until TEXT,
  card_type TEXT,
  balance_eur NUMERIC(10,2) NOT NULL DEFAULT 0,
  balance_updated_at TIMESTAMPTZ,
  jcc_email TEXT,
  jcc_display_name TEXT,
  jcc_tokens_encrypted TEXT,
  jcc_linked_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  pass_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.motion_card TO authenticated;
GRANT ALL ON public.motion_card TO service_role;

ALTER TABLE public.motion_card ENABLE ROW LEVEL SECURITY;

CREATE POLICY "motion_card: owner all"
  ON public.motion_card FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER motion_card_updated_at
  BEFORE UPDATE ON public.motion_card
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
