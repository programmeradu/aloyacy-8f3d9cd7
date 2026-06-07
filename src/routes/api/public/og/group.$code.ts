// Dynamic OG image for /group/:code — social previews of a live group
// trip. Fetches destination + latest member snapshot on every request so
// shared links update as friends join, move, and get closer to arrival.
//
// Rendered as PNG via workers-og (satori + resvg-wasm) so previews show
// on Facebook, WhatsApp, Twitter/X, iMessage, LinkedIn — SVG is silently
// dropped by every one of those.

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

const GROUP_BG_PATH = "/__l5e/assets-v1/c1152100-2b4c-41b1-ae85-6efb490103e0/og-group-bg.jpg";

export const Route = createFileRoute("/api/public/og/group/$code")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const code = String(params.code || "").toUpperCase().slice(0, 12);
        const bg = `${new URL(request.url).origin}${GROUP_BG_PATH}`;

        const { data: group } = await supabaseAdmin
          .from("trip_groups")
          .select("id, code, destination_label, created_by_name")
          .eq("code", code)
          .maybeSingle();

        let memberCount = 0;
        let arrivedCount = 0;
        let nextEta: number | null = null;
        let creator = group?.created_by_name ?? null;

        if (group?.id) {
          const { data: members } = await supabaseAdmin
            .from("trip_group_members")
            .select("display_name, eta_minutes, status, is_creator")
            .eq("group_id", group.id);
          if (members) {
            memberCount = members.length;
            arrivedCount = members.filter((m) => m.status === "arrived").length;
            const etas = members
              .map((m) => m.eta_minutes)
              .filter((v): v is number => typeof v === "number" && v >= 0);
            if (etas.length) nextEta = Math.min(...etas);
            if (!creator) creator = members.find((m) => m.is_creator)?.display_name ?? null;
          }
        }

        const destination = clip(group?.destination_label ?? "A trip on Aloya", 30);
        const kicker = group ? `Watch together · ${code}` : "Group trip";
        const host = creator ? `Hosted by ${clip(creator, 22)}` : "Public group trip";
        const etaLine =
          nextEta != null
            ? `Next arrival in ${nextEta} min`
            : memberCount > 0
              ? "Live positions updating"
              : "Waiting for the group to join";
        const peopleLine =
          memberCount === 0
            ? "Be the first to join"
            : `${memberCount} ${memberCount === 1 ? "person" : "people"} converging${arrivedCount ? ` · ${arrivedCount} arrived` : ""}`;

        const html = `
<div style="display:flex;width:${OG_WIDTH}px;height:${OG_HEIGHT}px;background:${OG_PALETTE.limestone};font-family:${OG_FONT_BODY};position:relative;">
  <img src="${esc(bg)}" width="${OG_WIDTH}" height="${OG_HEIGHT}" style="position:absolute;top:0;left:0;width:${OG_WIDTH}px;height:${OG_HEIGHT}px;object-fit:cover;"/>
  <div style="display:flex;position:absolute;top:0;left:520px;width:680px;height:${OG_HEIGHT}px;background:linear-gradient(to right, rgba(243,237,225,0), rgba(243,237,225,0.94) 22%, ${OG_PALETTE.limestone} 100%);"></div>

  <div style="display:flex;align-items:center;position:absolute;top:52px;left:48px;">
    <div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:12px;background:${OG_PALETTE.ink};color:${OG_PALETTE.limestone};font-family:${OG_FONT_DISPLAY};font-weight:800;font-size:24px;">A</div>
    <div style="display:flex;margin-left:14px;color:${OG_PALETTE.ink};font-weight:700;font-size:16px;letter-spacing:2px;">ALOYA · CYPRUS</div>
  </div>

  <div style="display:flex;flex-direction:column;position:absolute;top:150px;left:600px;width:540px;">
    <div style="display:flex;align-items:center;color:${OG_PALETTE.aegeanDeep};font-weight:700;font-size:15px;letter-spacing:2.4px;">
      <div style="display:flex;width:12px;height:12px;border-radius:999px;background:${OG_PALETTE.aegeanDeep};margin-right:12px;"></div>
      ${esc(kicker.toUpperCase())}
    </div>
    <div style="display:flex;margin-top:18px;color:${OG_PALETTE.inkSoft};font-weight:500;font-size:20px;">${esc(host)} · Converging on</div>
    <div style="display:flex;margin-top:22px;color:${OG_PALETTE.ink};font-family:${OG_FONT_DISPLAY};font-weight:800;font-size:68px;letter-spacing:-1.6px;line-height:1;">${esc(destination)}</div>

    <div style="display:flex;flex-direction:column;margin-top:38px;padding:26px 28px;border-radius:22px;background:rgba(255,255,255,0.78);border:1px solid ${OG_PALETTE.line};">
      <div style="display:flex;align-items:center;color:${OG_PALETTE.ink};font-weight:700;font-size:22px;">
        <div style="display:flex;width:12px;height:12px;border-radius:999px;background:${OG_PALETTE.ochre};margin-right:16px;"></div>
        ${esc(etaLine)}
      </div>
      <div style="display:flex;align-items:center;margin-top:16px;color:${OG_PALETTE.inkSoft};font-weight:500;font-size:20px;">
        <div style="display:flex;width:12px;height:12px;border-radius:999px;background:${OG_PALETTE.olive};margin-right:16px;"></div>
        ${esc(peopleLine)}
      </div>
    </div>
  </div>

  <div style="display:flex;position:absolute;left:48px;bottom:34px;color:${OG_PALETTE.inkSoft};font-weight:700;font-size:13px;letter-spacing:2.6px;">LIVE · WATCH TOGETHER</div>
  <div style="display:flex;position:absolute;right:48px;bottom:34px;color:${OG_PALETTE.inkSoft};font-weight:500;font-size:13px;letter-spacing:2.4px;">APP.ALOYA.CY/GROUP/${esc(code)}</div>
</div>`;

        return ogPngResponse(html, 30);
      },
    },
  },
});
