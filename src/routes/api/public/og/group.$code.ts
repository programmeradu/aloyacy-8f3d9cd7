// Dynamic OG image for /group/:code — SVG card showing the live group trip
// (destination, host, members converging, next arrival). Refetched on every
// request so shared previews update as friends join and move.

import { createFileRoute } from "@tanstack/react-router";
import {
  OG_HEIGHT,
  OG_PALETTE,
  OG_WIDTH,
  clip,
  esc,
  ogPngResponse,
} from "@/lib/og-render.server";

export const Route = createFileRoute("/api/public/og/group/$code")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const code = String(params.code || "").toUpperCase().slice(0, 12);

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

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
        const kicker = (group ? `Watch together · ${code}` : "Group trip").toUpperCase();
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

        const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <defs>
    <linearGradient id="fade" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="${OG_PALETTE.limestone}" stop-opacity="0"/>
      <stop offset="0.3" stop-color="${OG_PALETTE.limestone}" stop-opacity="0.95"/>
      <stop offset="1" stop-color="${OG_PALETTE.limestone}" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${OG_PALETTE.limestone}"/>
  <rect x="0" y="0" width="8" height="${OG_HEIGHT}" fill="${OG_PALETTE.aegeanDeep}"/>
  <rect x="520" y="0" width="680" height="${OG_HEIGHT}" fill="url(#fade)"/>

  <g transform="translate(48, 52)">
    <rect width="40" height="40" rx="12" fill="${OG_PALETTE.ink}"/>
    <text x="20" y="30" text-anchor="middle" font-family="Bricolage Grotesque, Georgia, serif" font-size="24" font-weight="800" fill="${OG_PALETTE.limestone}">A</text>
    <text x="54" y="26" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="16" font-weight="700" letter-spacing="2" fill="${OG_PALETTE.ink}">ALOYA · CYPRUS</text>
  </g>

  <g transform="translate(600, 170)">
    <circle cx="6" cy="6" r="6" fill="${OG_PALETTE.aegeanDeep}"/>
    <text x="22" y="12" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="15" font-weight="700" letter-spacing="2.4" fill="${OG_PALETTE.aegeanDeep}">${esc(kicker)}</text>
  </g>

  <text x="600" y="222" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="20" font-weight="500" fill="${OG_PALETTE.inkSoft}">${esc(host)} · Converging on</text>

  <text x="600" y="304" font-family="Bricolage Grotesque, Georgia, serif" font-size="64" font-weight="800" letter-spacing="-1.4" fill="${OG_PALETTE.ink}">${esc(destination)}</text>

  <g transform="translate(600, 360)">
    <rect width="540" height="150" rx="22" fill="rgba(255,255,255,0.82)" stroke="${OG_PALETTE.line}"/>
    <circle cx="30" cy="46" r="7" fill="${OG_PALETTE.ochre}"/>
    <text x="52" y="54" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="22" font-weight="700" fill="${OG_PALETTE.ink}">${esc(etaLine)}</text>
    <circle cx="30" cy="102" r="7" fill="${OG_PALETTE.olive}"/>
    <text x="52" y="110" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="20" font-weight="500" fill="${OG_PALETTE.inkSoft}">${esc(peopleLine)}</text>
  </g>

  <text x="48" y="596" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="13" font-weight="700" letter-spacing="2.6" fill="${OG_PALETTE.inkSoft}">LIVE · WATCH TOGETHER</text>
  <text x="${OG_WIDTH - 48}" y="596" text-anchor="end" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="13" font-weight="500" letter-spacing="2.4" fill="${OG_PALETTE.inkSoft}">APP.ALOYA.CY/GROUP/${esc(code)}</text>
</svg>`;

        return await ogPngResponse(svg, 30);
      },
    },
  },
});
