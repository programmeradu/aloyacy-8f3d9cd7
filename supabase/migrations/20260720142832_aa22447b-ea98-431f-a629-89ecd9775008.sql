
CREATE TABLE public.bedrock_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  access_key_hint text,
  auth_mode text NOT NULL,
  region text NOT NULL,
  model_id text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  est_cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  http_status integer,
  ok boolean NOT NULL DEFAULT false,
  error text
);

CREATE INDEX bedrock_usage_created_at_idx ON public.bedrock_usage (created_at DESC);
CREATE INDEX bedrock_usage_key_hint_idx ON public.bedrock_usage (access_key_hint, created_at DESC);

GRANT ALL ON public.bedrock_usage TO service_role;

ALTER TABLE public.bedrock_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no direct access" ON public.bedrock_usage FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
