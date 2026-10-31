// Share card for /group/:code: where the group meets, who hosts, how many
// are on the way and the next arrival. Member positions never go on a public
// image. Redrawn at most every 5 minutes as people join.
import { createFileRoute } from "@tanstack/react-router";
import { getD1 } from "@/lib/db";
import { ogRender } from "@/lib/og-runtime.server";
import { genericGroupCard, groupCard } from "@/lib/og-roam-cards.server";
import { groupPortrait } from "@/lib/og-roam-portrait.server";
import { cardLink, portraitKey, wantsPortrait } from "@/lib/og-portrait.server";

type Row = {
  code: string;
  destination_label: string;
  destination_lat: number;
  destination_lng: number;
  created_by_name: string | null;
  members: number;
  arrived: number;
  next_eta: number | null;
};

export const Route = createFileRoute("/api/public/og/group/$code")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const code = String(params.code ?? "").toUpperCase();
        let row: Row | null = null;
        if (/^[A-Z0-9]{3,16}$/.test(code)) {
          try {
            row = await getD1()
              .prepare(
                `SELECT g.code, g.destination_label, g.destination_lat, g.destination_lng, g.created_by_name,
                   (SELECT count(*) FROM trip_group_members m WHERE m.group_id = g.id AND m.status != 'left') AS members,
                   (SELECT count(*) FROM trip_group_members m WHERE m.group_id = g.id AND m.status = 'arrived') AS arrived,
                   (SELECT min(eta_minutes) FROM trip_group_members m WHERE m.group_id = g.id AND m.status = 'active' AND m.eta_minutes > 0) AS next_eta
                 FROM trip_groups g WHERE g.code = ? LIMIT 1`,
              )
              .bind(code)
              .first<Row>();
          } catch {
            row = null;
          }
        }
        if (!row) return ogRender(request, "page/group", 604800, genericGroupCard, ["/og/group.png"]);
        const r = row;
        const slot = Math.floor(Date.now() / 300_000);
        if (wantsPortrait(request))
          return ogRender(
            request,
            portraitKey(request, `group/${code}/${slot}`),
            300,
            (s) =>
              groupPortrait(
                {
                  code: r.code,
                  destination: r.destination_label,
                  host: r.created_by_name,
                  members: Number(r.members) || 0,
                  arrived: Number(r.arrived) || 0,
                  nextEta: r.next_eta != null ? Number(r.next_eta) : null,
                  place: { lat: r.destination_lat, lng: r.destination_lng },
                },
                s,
                { link: cardLink(request, `/group/${code}`) },
              ),
            ["/og/group.png"],
          );
        return ogRender(
          request,
          `group/${code}/${slot}`,
          300,
          (s) =>
            groupCard(
              {
                code: r.code,
                destination: r.destination_label,
                host: r.created_by_name,
                members: Number(r.members) || 0,
                arrived: Number(r.arrived) || 0,
                nextEta: r.next_eta != null ? Number(r.next_eta) : null,
                place: { lat: r.destination_lat, lng: r.destination_lng },
              },
              s,
            ),
          ["/og/group.png"],
        );
      },
    },
  },
});
