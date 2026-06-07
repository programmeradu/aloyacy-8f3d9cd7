// Dynamic OG image for /plan/:token — social previews of a planned trip
// (meeting point, bus, timing). Fetches the shared plan on every request
// so previews reflect the actual planned journey — not a generic card.
//
// Rendered as PNG via workers-og so previews show on every social
// platform. See src/lib/og-render.server.ts for renderer notes.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  OG_FONT_BODY,
  OG_FONT_DISPLAY,
  OG_HEIGHT,
  OG_PALETTE,
  OG_WIDTH,
  clip,
  esc,
  ogPngResponse,
} from "@/lib/og-render.server";

const PLAN_BG_PATH = "/__l5e/assets-v1/07a36f1e-f5b3-4387-a769-42d43792c7b1/og-plan-bg.jpg";

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
        const bg = `${new URL(request.url).origin}${PLAN_BG_PATH}`;

        const { data: plan } = await supabaseAdmin
          .from("trip_plan_shares")
          .select(
            "creator_name, origin_label, destination_label, departure_unix, arrival_unix, total_duration_sec, transfers, legs",
          )
          .eq("token", token)
          .maybeSingle();

        const destination = clip(plan?.destination_label ?? "A trip plan", 26);
        const originLabel = clip(plan?.origin_label ?? "Anywhere in Cyprus", 34);
        const creator = plan?.creator_name ? clip(plan.creator_name, 22) : null;
        const kicker = creator ? `Shared by ${creator}` : "A trip plan on Aloya";

        const dep = plan?.departure_unix ? fmtTime(plan.departure_unix) : "—";
        const arr = plan?.arrival_unix ? fmtTime(plan.arrival_unix) : "—";
        const day = plan?.departure_unix ? fmtDate(plan.departure_unix) : "";
        const dur = plan?.total_duration_sec ? fmtDur(plan.total_duration_sec) : "—";
        const transfers = plan?.transfers ?? 0;

        let routeShort: string | null = null;
        if (Array.isArray(plan?.legs)) {
          for (const leg of plan.legs as Array<Record<string, unknown>>) {
            if (leg && leg.kind === "ride" && typeof leg.routeShort === "string") {
              routeShort = leg.routeShort as string;
              break;
            }
          }
        }

        const chipTime = `${dep} → ${arr}`;
        const journeyText = `${dur}${transfers ? ` · ${transfers} transfer${transfers === 1 ? "" : "s"}` : ""}`;

        const busChip = routeShort
          ? `<div style="display:flex;flex-direction:column;justify-content:space-between;padding:14px 18px;border-radius:16px;background:${OG_PALETTE.aegeanDeep};color:${OG_PALETTE.limestone};">
              <div style="display:flex;font-weight:700;font-size:12px;letter-spacing:2px;opacity:0.8;">BUS</div>
              <div style="display:flex;font-family:${OG_FONT_DISPLAY};font-weight:800;font-size:30px;letter-spacing:-0.4px;">${esc(routeShort)}</div>
            </div>`
          : "";

        const html = `
<div style="display:flex;width:${OG_WIDTH}px;height:${OG_HEIGHT}px;background:${OG_PALETTE.limestone};font-family:${OG_FONT_BODY};position:relative;">
  <img src="${esc(bg)}" width="${OG_WIDTH}" height="${OG_HEIGHT}" style="position:absolute;top:0;left:0;width:${OG_WIDTH}px;height:${OG_HEIGHT}px;object-fit:cover;"/>
  <div style="display:flex;position:absolute;top:0;left:480px;width:720px;height:${OG_HEIGHT}px;background:linear-gradient(to right, rgba(243,237,225,0), rgba(243,237,225,0.94) 20%, ${OG_PALETTE.limestone} 100%);"></div>

  <div style="display:flex;align-items:center;position:absolute;top:52px;left:48px;">
    <div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:12px;background:${OG_PALETTE.ink};color:${OG_PALETTE.limestone};font-family:${OG_FONT_DISPLAY};font-weight:800;font-size:24px;">A</div>
    <div style="display:flex;margin-left:14px;color:${OG_PALETTE.ink};font-weight:700;font-size:16px;letter-spacing:2px;">ALOYA · CYPRUS</div>
  </div>

  <div style="display:flex;flex-direction:column;position:absolute;top:130px;left:560px;width:600px;">
    <div style="display:flex;align-items:center;color:${OG_PALETTE.ochre};font-weight:700;font-size:15px;letter-spacing:2.4px;">
      <div style="display:flex;width:12px;height:12px;border-radius:999px;background:${OG_PALETTE.ochre};margin-right:12px;"></div>
      ${esc(kicker.toUpperCase())}
    </div>

    <div style="display:flex;margin-top:26px;color:${OG_PALETTE.inkSoft};font-weight:500;font-size:14px;letter-spacing:2px;">FROM</div>
    <div style="display:flex;margin-top:8px;color:${OG_PALETTE.ink};font-family:${OG_FONT_DISPLAY};font-weight:800;font-size:30px;letter-spacing:-0.4px;">${esc(originLabel)}</div>

    <div style="display:flex;margin-top:22px;color:${OG_PALETTE.inkSoft};font-weight:500;font-size:14px;letter-spacing:2px;">TO</div>
    <div style="display:flex;margin-top:8px;color:${OG_PALETTE.ink};font-family:${OG_FONT_DISPLAY};font-weight:800;font-size:52px;letter-spacing:-1px;line-height:1;">${esc(destination)}</div>

    <div style="display:flex;margin-top:34px;">
      <div style="display:flex;flex-direction:column;justify-content:space-between;padding:14px 18px;border-radius:16px;background:${OG_PALETTE.ink};color:${OG_PALETTE.limestone};margin-right:14px;">
        <div style="display:flex;font-weight:700;font-size:12px;letter-spacing:2px;opacity:0.7;">${esc(day.toUpperCase())}</div>
        <div style="display:flex;font-family:${OG_FONT_DISPLAY};font-weight:800;font-size:30px;letter-spacing:-0.4px;">${esc(chipTime)}</div>
      </div>
      <div style="display:flex;flex-direction:column;justify-content:space-between;padding:14px 18px;border-radius:16px;background:rgba(255,255,255,0.78);border:1px solid ${OG_PALETTE.line};color:${OG_PALETTE.ink};margin-right:14px;">
        <div style="display:flex;color:${OG_PALETTE.inkSoft};font-weight:700;font-size:12px;letter-spacing:2px;">JOURNEY</div>
        <div style="display:flex;font-family:${OG_FONT_DISPLAY};font-weight:800;font-size:30px;letter-spacing:-0.4px;">${esc(journeyText)}</div>
      </div>
      ${busChip}
    </div>
  </div>

  <div style="display:flex;position:absolute;left:48px;bottom:34px;color:${OG_PALETTE.inkSoft};font-weight:700;font-size:13px;letter-spacing:2.6px;">PLAN · SHARE BEFORE YOU LEAVE</div>
  <div style="display:flex;position:absolute;right:48px;bottom:34px;color:${OG_PALETTE.inkSoft};font-weight:500;font-size:13px;letter-spacing:2.4px;">APP.ALOYA.CY/PLAN</div>
</div>`;

        return ogPngResponse(html, 60);
      },
    },
  },
});
