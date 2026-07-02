// Dynamic OG image for /group/:code — social previews of a live group
// trip. Fetches destination + latest member snapshot on every request so
// shared links update as friends join, move, and get closer to arrival.
//
// Rendered as an SVG card (see src/lib/og-render.server.ts) so it ships
// identically in Node dev and Cloudflare Workers production without any
// WASM asset resolution surprises.

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
  ogSvgResponse,
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

        const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${OG_PALETTE.limestone}" stop-opacity="0"/>
      <stop offset="0.32" stop-color="${OG_PALETTE.limestone}" stop-opacity="0.94"/>
      <stop offset="1" stop-color="${OG_PALETTE.limestone}" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${OG_PALETTE.limestone}"/>
  <image href="${esc(bg)}" x="0" y="0" width="${OG_WIDTH}" height="${OG_HEIGHT}" preserveAspectRatio="xMidYMid slice"/>
  <rect x="560" y="0" width="640" height="${OG_HEIGHT}" fill="url(#wash)"/>

  <!-- Wordmark -->
  <g transform="translate(48,52)">
    <rect x="0" y="0" width="40" height="40" rx="12" fill="${OG_PALETTE.ink}"/>
    <text x="20" y="29" text-anchor="middle" font-family="${OG_FONT_DISPLAY}" font-weight="800" font-size="24" fill="${OG_PALETTE.limestone}">A</text>
    <text x="54" y="27" font-family="${OG_FONT_BODY}" font-weight="700" font-size="16" letter-spacing="2" fill="${OG_PALETTE.ink}">ALOYA · CYPRUS</text>
  </g>

  <!-- Kicker -->
  <g transform="translate(600,168)">
    <circle cx="6" cy="0" r="6" fill="${OG_PALETTE.aegeanDeep}"/>
    <text x="22" y="6" font-family="${OG_FONT_BODY}" font-weight="700" font-size="15" letter-spacing="2.4" fill="${OG_PALETTE.aegeanDeep}">${esc(kicker.toUpperCase())}</text>
  </g>

  <!-- Sub-kicker -->
  <text x="600" y="216" font-family="${OG_FONT_BODY}" font-weight="500" font-size="20" fill="${OG_PALETTE.inkSoft}">${esc(host)} · Converging on</text>

  <!-- Destination -->
  <text x="600" y="298" font-family="${OG_FONT_DISPLAY}" font-weight="800" font-size="68" letter-spacing="-1.6" fill="${OG_PALETTE.ink}">${esc(destination)}</text>

  <!-- Live status card -->
  <g transform="translate(600,340)">
    <rect x="0" y="0" width="540" height="150" rx="22" fill="${OG_PALETTE.white}" fill-opacity="0.72" stroke="${OG_PALETTE.line}" stroke-width="1"/>
    <circle cx="28" cy="46" r="6" fill="${OG_PALETTE.ochre}"/>
    <text x="46" y="52" font-family="${OG_FONT_BODY}" font-weight="700" font-size="22" fill="${OG_PALETTE.ink}">${esc(etaLine)}</text>
    <circle cx="28" cy="100" r="6" fill="${OG_PALETTE.olive}"/>
    <text x="46" y="106" font-family="${OG_FONT_BODY}" font-weight="500" font-size="20" fill="${OG_PALETTE.inkSoft}">${esc(peopleLine)}</text>
  </g>

  <!-- Footer -->
  <text x="48" y="596" font-family="${OG_FONT_BODY}" font-weight="700" font-size="13" letter-spacing="2.6" fill="${OG_PALETTE.inkSoft}">LIVE · WATCH TOGETHER</text>
  <text x="${OG_WIDTH - 48}" y="596" text-anchor="end" font-family="${OG_FONT_BODY}" font-weight="500" font-size="13" letter-spacing="2.4" fill="${OG_PALETTE.inkSoft}">APP.ALOYA.CY/GROUP/${esc(code)}</text>
</svg>`;

        return ogSvgResponse(svg, 30);
      },
    },
  },
});
