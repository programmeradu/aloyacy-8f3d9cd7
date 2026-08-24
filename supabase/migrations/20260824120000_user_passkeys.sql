-- Migration: user_passkeys
-- Stores WebAuthn / Passkey credentials for 1-tap biometric rider sign-in

CREATE TABLE IF NOT EXISTS public.user_passkeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_name TEXT NOT NULL DEFAULT 'Passkey',
  transports TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for lightning-fast credential lookups
CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id ON public.user_passkeys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_passkeys_credential_id ON public.user_passkeys(credential_id);

-- Enable Row Level Security
ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view own passkeys" ON public.user_passkeys;
CREATE POLICY "Users can view own passkeys"
  ON public.user_passkeys
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own passkeys" ON public.user_passkeys;
CREATE POLICY "Users can insert own passkeys"
  ON public.user_passkeys
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own passkeys" ON public.user_passkeys;
CREATE POLICY "Users can delete own passkeys"
  ON public.user_passkeys
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Permissions
GRANT ALL ON public.user_passkeys TO service_role;
GRANT SELECT, INSERT, DELETE ON public.user_passkeys TO authenticated;
