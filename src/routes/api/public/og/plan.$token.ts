// Share card for /plan/:token: where the shared trip goes, from where, when it
// arrives and leaves, its lines and length, drawn on the real network with
// the bus legs on their GTFS road shapes.

import { createFileRoute } from "@tanstack/react-router";
import { PlanTokenParam } from "@/lib/http/og-params";
import { planCard, type PlanLegOg } from "@/lib/og-roam-cards.server";
import { loadShapes, pngResponse } from "@/lib/og-roam.server";

type PlanRow = {
  creator_name: string | null;
  origin_label: string | null;
  destination_label: string | null;
  departure_unix: number | null;
  arrival_unix: number | null;
  total_duration_sec: number | null;
  transfers: number | null;
  legs: unknown;
};

const TZ = "Asia/Nicosia";
const fmtTime = (unix: number) =>
  new Date(unix * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  });
const fmtDate = (unix: number) =>
  new Date(unix * 1000).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: TZ,
  });
function fmtDur(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

function legsOf(raw: unknown): PlanLegOg[] {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  return v.filter(
    (l): l is PlanLegOg =>
      !!l && typeof l === "object" && typeof (l as PlanLegOg).kind === "string",
  );
}

export const Route = createFileRoute("/api/public/og/plan/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        // A malformed token skips the lookup and still returns a branded card.
        const parsed = PlanTokenParam.safeParse(params.token);
        const token = parsed.success ? parsed.data : null;
        let plan: PlanRow | null = null;
        if (token) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data } = await supabaseAdmin
              .from("trip_plan_shares")
              .select(
                "creator_name, origin_label, destination_label, departure_unix, arrival_unix, total_duration_sec, transfers, legs",
              )
              .eq("token", token)
              .maybeSingle();
            plan = (data as PlanRow | null) ?? null;
          } catch {
            plan = null;
          }
        }
        const svg = planCard(
          {
            origin: plan?.origin_label ?? null,
            destination: plan?.destination_label ?? null,
            creator: plan?.creator_name ?? null,
            depart: plan?.departure_unix ? fmtTime(plan.departure_unix) : null,
            arrive: plan?.arrival_unix ? fmtTime(plan.arrival_unix) : null,
            day: plan?.departure_unix ? fmtDate(plan.departure_unix) : null,
            duration: plan?.total_duration_sec ? fmtDur(plan.total_duration_sec) : null,
            transfers: plan?.transfers ?? 0,
            legs: legsOf(plan?.legs),
          },
          await loadShapes(),
        );
        return pngResponse(svg, 60);
      },
    },
  },
});
