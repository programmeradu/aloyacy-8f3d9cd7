// Dynamic OG image for /plan/:token — social previews of a planned trip
// (meet point, bus, timing). The endpoint fetches the shared plan on every
// request so previews reflect the actual planned journey — not a generic
// card.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { OG_PALETTE, clip, esc, renderOgCard } from "@/lib/og-render.server";

const PLAN_BG = "/__l5e/assets-v1/07a36f1e-f5b3-4387-a769-42d43792c7b1/og-plan-bg.jpg";

function fmtTime(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Nicosia",
  });
}
function fmtDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Nicosia",
  });
}
function fmtDur(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export const Route = createFileRoute("/api/public/og/plan/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const token = String(params.token || "").slice(0, 64);
        const origin = new URL(request.url).origin;

        const { data: plan } = await supabaseAdmin
          .from("trip_plan_shares")
          .select(
            "creator_name, origin_label, destination_label, departure_unix, arrival_unix, total_duration_sec, transfers, legs",
          )
          .eq("token", token)
          .maybeSingle();

        const destination = clip(plan?.destination_label ?? "A trip plan", 42);
        const originLabel = clip(plan?.origin_label ?? "Anywhere in Cyprus", 42);
        const creator = plan?.creator_name ? clip(plan.creator_name, 22) : null;
        const kicker = creator ? `Shared by ${creator}` : "A trip plan on Aloya";

        const dep = plan?.departure_unix ? fmtTime(plan.departure_unix) : "—";
        const arr = plan?.arrival_unix ? fmtTime(plan.arrival_unix) : "—";
        const day = plan?.departure_unix ? fmtDate(plan.departure_unix) : "";
        const dur = plan?.total_duration_sec ? fmtDur(plan.total_duration_sec) : "";
        const transfers = plan?.transfers ?? 0;

        // Pull the first bus route short-name so the card names the actual bus.
        let routeShort: string | null = null;
        if (Array.isArray(plan?.legs)) {
          for (const leg of plan.legs as Array<Record<string, unknown>>) {
            if (leg && leg.kind === "ride" && typeof leg.routeShort === "string") {
              routeShort = leg.routeShort as string;
              break;
            }
          }
        }

        const bg = `${origin}${PLAN_BG}`;

        const html = `
<div style="display:flex;width:1200px;height:630px;position:relative;background:${OG_PALETTE.limestone};font-family:'Body';">
  <img src="${bg}" width="1200" height="630" style="position:absolute;top:0;left:0;width:1200px;height:630px;object-fit:cover;" />
  <div style="position:absolute;top:0;right:0;width:680px;height:630px;background:linear-gradient(90deg, rgba(243,237,225,0) 0%, rgba(243,237,225,0.94) 28%, ${OG_PALETTE.limestone} 100%);display:flex;"></div>

  <div style="position:absolute;top:44px;left:44px;display:flex;align-items:center;gap:12px;">
    <div style="display:flex;width:36px;height:36px;border-radius:10px;background:${OG_PALETTE.ink};align-items:center;justify-content:center;color:${OG_PALETTE.limestone};font-family:'Display';font-size:22px;">A</div>
    <div style="display:flex;font-family:'Body';font-weight:700;font-size:16px;letter-spacing:2px;text-transform:uppercase;color:${OG_PALETTE.ink};">Aloya · Cyprus</div>
  </div>

  <div style="position:absolute;top:130px;right:60px;width:600px;display:flex;flex-direction:column;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
      <div style="display:flex;width:10px;height:10px;border-radius:999px;background:${OG_PALETTE.ochre};"></div>
      <div style="display:flex;font-family:'Body';font-weight:700;font-size:14px;letter-spacing:2.4px;text-transform:uppercase;color:${OG_PALETTE.ochre};">${esc(kicker)}</div>
    </div>

    <div style="display:flex;flex-direction:column;margin-bottom:22px;">
      <div style="display:flex;font-family:'Body';font-weight:500;font-size:15px;letter-spacing:2px;text-transform:uppercase;color:${OG_PALETTE.inkSoft};margin-bottom:6px;">From</div>
      <div style="display:flex;font-family:'Display';font-weight:800;font-size:34px;line-height:1.05;letter-spacing:-0.6px;color:${OG_PALETTE.ink};margin-bottom:14px;">${esc(originLabel)}</div>
      <div style="display:flex;font-family:'Body';font-weight:500;font-size:15px;letter-spacing:2px;text-transform:uppercase;color:${OG_PALETTE.inkSoft};margin-bottom:6px;">To</div>
      <div style="display:flex;font-family:'Display';font-weight:800;font-size:48px;line-height:1.02;letter-spacing:-1px;color:${OG_PALETTE.ink};">${esc(destination)}</div>
    </div>

    <div style="display:flex;gap:12px;">
      <div style="display:flex;flex-direction:column;padding:14px 18px;border-radius:16px;background:${OG_PALETTE.ink};color:${OG_PALETTE.limestone};min-width:160px;">
        <div style="display:flex;font-family:'Body';font-weight:700;font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.7;">${esc(day)}</div>
        <div style="display:flex;font-family:'Display';font-weight:800;font-size:30px;letter-spacing:-0.4px;">${esc(dep)} → ${esc(arr)}</div>
      </div>
      <div style="display:flex;flex-direction:column;padding:14px 18px;border-radius:16px;background:rgba(255,255,255,0.75);border:1px solid ${OG_PALETTE.line};">
        <div style="display:flex;font-family:'Body';font-weight:700;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${OG_PALETTE.inkSoft};">Journey</div>
        <div style="display:flex;font-family:'Display';font-weight:800;font-size:30px;letter-spacing:-0.4px;color:${OG_PALETTE.ink};">${esc(dur || "—")}${transfers ? ` · ${transfers} transfer${transfers === 1 ? "" : "s"}` : ""}</div>
      </div>
      ${routeShort ? `
      <div style="display:flex;flex-direction:column;padding:14px 18px;border-radius:16px;background:${OG_PALETTE.aegeanDeep};color:${OG_PALETTE.limestone};">
        <div style="display:flex;font-family:'Body';font-weight:700;font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.75;">Bus</div>
        <div style="display:flex;font-family:'Display';font-weight:800;font-size:30px;letter-spacing:-0.4px;">${esc(routeShort)}</div>
      </div>` : ""}
    </div>
  </div>

  <div style="position:absolute;left:44px;bottom:36px;display:flex;font-family:'Body';font-weight:700;font-size:12px;letter-spacing:2.6px;text-transform:uppercase;color:${OG_PALETTE.inkSoft};">Plan · Share before you leave</div>
  <div style="position:absolute;right:44px;bottom:36px;display:flex;font-family:'Body';font-weight:500;font-size:12px;letter-spacing:2.4px;text-transform:uppercase;color:${OG_PALETTE.inkSoft};">app.aloya.cy/plan</div>
</div>`;

        return renderOgCard(html, 60);
      },
    },
  },
});
