// Dynamic OG image for /group/:code — social previews of a live group
// trip. The endpoint fetches the latest destination + member snapshot on
// every request so shared links update as friends join, move, and get
// closer to arrival.
//
// Public + read-only. No auth required because the URL is derived from the
// group code (already the capability), and only non-PII summary data is
// rendered onto the image.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { OG_PALETTE, clip, esc, renderOgCard } from "@/lib/og-render.server";

const GROUP_BG = "/__l5e/assets-v1/c1152100-2b4c-41b1-ae85-6efb490103e0/og-group-bg.jpg";

export const Route = createFileRoute("/api/public/og/group/$code.png")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const code = String(params.code || "").toUpperCase().slice(0, 12);
        const origin = new URL(request.url).origin;

        // Snapshot the group + members. If it's expired or missing we still
        // render a branded fallback so shared links never look broken.
        const { data: group } = await supabaseAdmin
          .from("trip_groups")
          .select("code, destination_label, created_by_name, expires_at")
          .eq("code", code)
          .maybeSingle();

        let memberCount = 0;
        let arrivedCount = 0;
        let nextEta: number | null = null;
        let creator = group?.created_by_name ?? null;

        if (group) {
          const { data: members } = await supabaseAdmin
            .from("trip_group_members")
            .select("display_name, eta_minutes, status, is_creator")
            .eq("group_id", (await supabaseAdmin
              .from("trip_groups")
              .select("id")
              .eq("code", code)
              .maybeSingle()).data?.id ?? "");
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

        const destination = clip(group?.destination_label ?? "A trip on Aloya", 48);
        const kicker = group ? `Watch together · ${code}` : "Group trip";
        const host = creator ? `Hosted by ${clip(creator, 24)}` : "Public group trip";
        const etaLine = nextEta != null
          ? `Next arrival in ${nextEta} min`
          : memberCount > 0
            ? "Live positions updating"
            : "Waiting for the group to join";
        const peopleLine = memberCount === 0
          ? "Be the first to join"
          : `${memberCount} ${memberCount === 1 ? "person" : "people"} converging${arrivedCount ? ` · ${arrivedCount} arrived` : ""}`;

        const bg = `${origin}${GROUP_BG}`;

        const html = `
<div style="display:flex;width:1200px;height:630px;position:relative;background:${OG_PALETTE.limestone};font-family:'Body';">
  <img src="${bg}" width="1200" height="630" style="position:absolute;top:0;left:0;width:1200px;height:630px;object-fit:cover;" />
  <div style="position:absolute;top:0;right:0;width:640px;height:630px;background:linear-gradient(90deg, rgba(243,237,225,0) 0%, rgba(243,237,225,0.94) 32%, ${OG_PALETTE.limestone} 100%);display:flex;"></div>

  <div style="position:absolute;top:44px;left:44px;display:flex;align-items:center;gap:12px;">
    <div style="display:flex;width:36px;height:36px;border-radius:10px;background:${OG_PALETTE.ink};align-items:center;justify-content:center;color:${OG_PALETTE.limestone};font-family:'Display';font-size:22px;">A</div>
    <div style="display:flex;font-family:'Body';font-weight:700;font-size:16px;letter-spacing:2px;text-transform:uppercase;color:${OG_PALETTE.ink};">Aloya · Cyprus</div>
  </div>

  <div style="position:absolute;top:150px;right:60px;width:560px;display:flex;flex-direction:column;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
      <div style="display:flex;width:10px;height:10px;border-radius:999px;background:${OG_PALETTE.aegeanDeep};"></div>
      <div style="display:flex;font-family:'Body';font-weight:700;font-size:14px;letter-spacing:2.4px;text-transform:uppercase;color:${OG_PALETTE.aegeanDeep};">${esc(kicker)}</div>
    </div>
    <div style="display:flex;font-family:'Body';font-weight:500;font-size:18px;color:${OG_PALETTE.inkSoft};margin-bottom:8px;">${esc(host)} · Converging on</div>
    <div style="display:flex;font-family:'Display';font-weight:800;font-size:64px;line-height:1.02;letter-spacing:-1.6px;color:${OG_PALETTE.ink};margin-bottom:26px;">${esc(destination)}</div>

    <div style="display:flex;flex-direction:column;gap:14px;padding:22px 24px;border-radius:22px;background:rgba(255,255,255,0.72);border:1px solid ${OG_PALETTE.line};">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="display:flex;width:8px;height:8px;border-radius:999px;background:${OG_PALETTE.ochre};"></div>
        <div style="display:flex;font-family:'Body';font-weight:700;font-size:20px;color:${OG_PALETTE.ink};">${esc(etaLine)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="display:flex;width:8px;height:8px;border-radius:999px;background:${OG_PALETTE.olive};"></div>
        <div style="display:flex;font-family:'Body';font-weight:500;font-size:18px;color:${OG_PALETTE.inkSoft};">${esc(peopleLine)}</div>
      </div>
    </div>
  </div>

  <div style="position:absolute;left:44px;bottom:36px;display:flex;font-family:'Body';font-weight:700;font-size:12px;letter-spacing:2.6px;text-transform:uppercase;color:${OG_PALETTE.inkSoft};">Live · Watch together</div>
  <div style="position:absolute;right:44px;bottom:36px;display:flex;font-family:'Body';font-weight:500;font-size:12px;letter-spacing:2.4px;text-transform:uppercase;color:${OG_PALETTE.inkSoft};">app.aloya.cy/group/${esc(code)}</div>
</div>`;

        return renderOgCard(html, 30);
      },
    },
  },
});
