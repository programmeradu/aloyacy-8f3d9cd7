// Subscribes to Supabase Realtime for the signed-in user's data tables and
// invalidates the matching React Query caches so any open tab / device
// reflects the change within ~1s of it happening server-side.
//
// Tables watched (RLS scopes events to the current user):
//   - subscriptions        → ProGate, billing screens, paywall
//   - scheduled_departures → "remind me" list, departure-tick processor
//   - commute_patterns     → Commute suggestion card, learned suggestions
//   - alert_counters       → service-alerts badge (anon-readable, app-wide)
//
// Mount once at the root so we don't open duplicate channels per route.

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useUserDataRealtime() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    // Public counter — works for signed-out users too.
    const counters = supabase
      .channel("rt-alert-counters")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alert_counters" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["alert-counters"] });
          queryClient.invalidateQueries({ queryKey: ["service-alerts"] });
        },
      )
      .subscribe();

    if (!user) {
      return () => {
        void supabase.removeChannel(counters);
      };
    }

    const userChan = supabase
      .channel(`rt-user-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscriptions",
          filter: `user_id=eq.${user.id}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["subscription"] }),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "scheduled_departures",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["scheduled-departures"] });
          queryClient.invalidateQueries({ queryKey: ["reminders"] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "commute_patterns",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["commute-suggestion"] });
          queryClient.invalidateQueries({ queryKey: ["trip-suggestions"] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(counters);
      void supabase.removeChannel(userChan);
    };
  }, [user, queryClient]);
}
