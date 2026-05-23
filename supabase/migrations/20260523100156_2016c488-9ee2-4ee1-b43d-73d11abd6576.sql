-- Lock down push_subscriptions: explicitly deny anon/authenticated access.
-- Only the service_role (used by server functions via supabaseAdmin) may
-- read or write. This prevents anyone from harvesting endpoints/credentials
-- or modifying another device's subscription if a permissive policy is
-- ever added by mistake.

-- Restrictive policy that denies all access to anon and authenticated roles
-- for every command. service_role bypasses RLS, so server-side code keeps
-- working unchanged.
CREATE POLICY "Deny all client access to push_subscriptions"
ON public.push_subscriptions
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);
