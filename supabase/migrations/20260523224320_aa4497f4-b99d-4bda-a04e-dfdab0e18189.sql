-- Tighten EXECUTE on the SECURITY DEFINER helper. Default grants to
-- anon/authenticated are revoked; only service_role keeps EXECUTE.
REVOKE ALL ON FUNCTION public.bump_alert_counter(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bump_alert_counter(text) FROM anon;
REVOKE ALL ON FUNCTION public.bump_alert_counter(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bump_alert_counter(text) TO service_role;