// Share card for /group/:code: the meeting point on the real network, the
// host, how many people are on the way and the soonest arrival. Refetched on
// every request so previews follow the group. Member positions are never drawn.

import { createFileRoute } from "@tanstack/react-router";
import { GroupCodeParam } from "@/lib/http/og-params";
import { groupCard, type GroupOg } from "@/lib/og-roam-cards.server";
import { loadShapes, pngResponse } from "@/lib/og-roam.server";

type GroupRow = {
  id: string;
  code: string;
  destination_label: string | null;
  destination_lat: number | null;
  destination_lng: number | null;
  created_by_name: string | null;
};
type MemberRow = {
  display_name: string | null;
  eta_minutes: number | null;
  status: string | null;
  is_creator: boolean | null;
};

export const Route = createFileRoute("/api/public/og/group/$code")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        // Unusable codes never reach the database; the card falls back to its
        // generic form rather than erroring at a crawler.
        const parsed = GroupCodeParam.safeParse(params.code);
        const code = parsed.success ? parsed.data : null;
        const og: GroupOg = {
          code,
          destination: null,
          host: null,
          members: 0,
          arrived: 0,
          nextEta: null,
          place: null,
        };
        if (code) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data } = await supabaseAdmin
              .from("trip_groups")
              .select(
                "id, code, destination_label, destination_lat, destination_lng, created_by_name",
              )
              .eq("code", code)
              .maybeSingle();
            const group = (data as GroupRow | null) ?? null;
            if (group) {
              og.destination = group.destination_label;
              og.host = group.created_by_name;
              if (group.destination_lat != null && group.destination_lng != null)
                og.place = {
                  lat: Number(group.destination_lat),
                  lng: Number(group.destination_lng),
                };
              const { data: members } = await supabaseAdmin
                .from("trip_group_members")
                .select("display_name, eta_minutes, status, is_creator")
                .eq("group_id", group.id);
              const list = (members as MemberRow[] | null) ?? [];
              og.members = list.length;
              og.arrived = list.filter((m) => m.status === "arrived").length;
              const etas = list
                .map((m) => m.eta_minutes)
                .filter((v): v is number => typeof v === "number" && v >= 0);
              if (etas.length) og.nextEta = Math.min(...etas);
              if (!og.host) og.host = list.find((m) => m.is_creator)?.display_name ?? null;
            } else {
              og.code = null;
            }
          } catch {
            // Database unavailable: the generic group card still renders.
          }
        }
        return pngResponse(groupCard(og, await loadShapes()), 30);
      },
    },
  },
});
