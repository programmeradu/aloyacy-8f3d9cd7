// Share card for /plan/:token: the shared plan itself (from, to, leave and
// arrive times in Cyprus time, each bus leg in its line colour). Plans are
// immutable, so a card is drawn once and cached a day.
import { createFileRoute } from "@tanstack/react-router";
import { getD1 } from "@/lib/db";
import { ogRender, cyDay, cyTime } from "@/lib/og-runtime.server";
import { genericPlanCard, planCard, type PlanLegOg } from "@/lib/og-roam-cards.server";

type Row = {
  creator_name: string | null;
  origin_label: string;
  destination_label: string;
  departure_unix: number;
  arrival_unix: number;
  total_duration_sec: number;
  transfers: number;
  legs: string;
};
type Pt = { stopId?: string; lat?: number; lng?: number };
type Leg = {
  kind?: string;
  routeId?: string;
  routeShort?: string;
  board?: Pt;
  alight?: Pt;
  from?: { lat?: number; lng?: number };
  to?: { lat?: number; lng?: number };
};

const pt = (p?: { lat?: number; lng?: number }) =>
  p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    ? { lat: p.lat as number, lng: p.lng as number }
    : undefined;

export const Route = createFileRoute("/api/public/og/plan/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = String(params.token ?? "");
        let row: Row | null = null;
        if (/^[A-Za-z0-9]{8,64}$/.test(token)) {
          try {
            row = await getD1()
              .prepare(
                `SELECT creator_name, origin_label, destination_label, departure_unix, arrival_unix,
                        total_duration_sec, transfers, legs
                   FROM trip_plan_shares WHERE token = ? LIMIT 1`,
              )
              .bind(token)
              .first<Row>();
          } catch {
            row = null;
          }
        }
        if (!row) return ogRender(request, "page/plan", 604800, genericPlanCard, ["/og/plan.png"]);
        const r = row;
        let legs: Leg[] = [];
        try {
          legs = JSON.parse(r.legs) as Leg[];
        } catch {
          legs = [];
        }
        const mapped: PlanLegOg[] = legs.map((l) => {
          const routeId = l.routeId ? String(l.routeId).replace(/^\d+:/, "") : undefined;
          return {
            kind: l.kind ?? (routeId || l.routeShort ? "ride" : "walk"),
            routeId,
            routeShort: l.routeShort,
            from: pt(l.from),
            to: pt(l.to),
            board: l.board,
            alight: l.alight,
          };
        });
        return ogRender(
          request,
          `plan/${token}`,
          86400,
          (s) =>
            planCard(
              {
                origin: r.origin_label,
                destination: r.destination_label,
                creator: r.creator_name,
                depart: r.departure_unix ? cyTime(r.departure_unix) : null,
                arrive: r.arrival_unix ? cyTime(r.arrival_unix) : null,
                day: r.departure_unix ? cyDay(r.departure_unix) : null,
                duration: r.total_duration_sec ? `${Math.round(r.total_duration_sec / 60)} min` : null,
                transfers: r.transfers ?? 0,
                legs: mapped,
              },
              s,
            ),
          ["/og/plan.png"],
        );
      },
    },
  },
});
