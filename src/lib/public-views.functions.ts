// Public, token-gated read models (formerly SECURITY DEFINER RPCs called from
// the browser): a live ETA share and a trip group page.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getTripGroupView = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({ code: z.string().min(4).max(16), memberToken: z.string().max(200).optional().nullable() }).parse,
  )
  .handler(async ({ data }) => {
    const { data: view, error } = await supabaseAdmin.rpc("get_trip_group_view", {
      p_code: data.code.toUpperCase(),
      p_member_token: data.memberToken ?? null,
    });
    if (error) throw new Error(error.message);
    return (view ?? null) as Record<string, any> | null;
  });

export const getSharedTripView = createServerFn({ method: "GET" })
  .inputValidator(z.object({ token: z.string().min(4).max(200) }).parse)
  .handler(async ({ data }) => {
    const { data: view, error } = await supabaseAdmin.rpc("get_shared_trip_view", { p_token: data.token });
    if (error) throw new Error(error.message);
    return (view ?? null) as Record<string, any> | null;
  });
