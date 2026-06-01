// Dynamic OG image for /plan/:token — social previews of a planned trip
// (meeting point, bus, timing). Fetches the shared plan on every request
// so previews reflect the actual planned journey — not a generic card.

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

        // Chip layout math — variable widths, laid out from left.
        const chips: Array<{ w: number; body: string }> = [];
        const chipTime = `${dep} → ${arr}`;
        chips.push({
          w: 260,
          body: `<rect x="0" y="0" width="260" height="86" rx="16" fill="${OG_PALETTE.ink}"/>
            <text x="18" y="30" font-family="${OG_FONT_BODY}" font-weight="700" font-size="12" letter-spacing="2" fill="${OG_PALETTE.limestone}" fill-opacity="0.7">${esc(day.toUpperCase())}</text>
            <text x="18" y="66" font-family="${OG_FONT_DISPLAY}" font-weight="800" font-size="30" letter-spacing="-0.4" fill="${OG_PALETTE.limestone}">${esc(chipTime)}</text>`,
        });
        const journeyText = `${dur}${transfers ? ` · ${transfers} transfer${transfers === 1 ? "" : "s"}` : ""}`;
        chips.push({
          w: 220,
          body: `<rect x="0" y="0" width="220" height="86" rx="16" fill="${OG_PALETTE.white}" fill-opacity="0.78" stroke="${OG_PALETTE.line}" stroke-width="1"/>
            <text x="18" y="30" font-family="${OG_FONT_BODY}" font-weight="700" font-size="12" letter-spacing="2" fill="${OG_PALETTE.inkSoft}">JOURNEY</text>
            <text x="18" y="66" font-family="${OG_FONT_DISPLAY}" font-weight="800" font-size="30" letter-spacing="-0.4" fill="${OG_PALETTE.ink}">${esc(journeyText)}</text>`,
        });
        if (routeShort) {
          chips.push({
            w: 150,
            body: `<rect x="0" y="0" width="150" height="86" rx="16" fill="${OG_PALETTE.aegeanDeep}"/>
              <text x="18" y="30" font-family="${OG_FONT_BODY}" font-weight="700" font-size="12" letter-spacing="2" fill="${OG_PALETTE.limestone}" fill-opacity="0.8">BUS</text>
              <text x="18" y="66" font-family="${OG_FONT_DISPLAY}" font-weight="800" font-size="30" letter-spacing="-0.4" fill="${OG_PALETTE.limestone}">${esc(routeShort)}</text>`,
          });
        }
        let chipX = 0;
        const chipsSvg = chips
          .map((c) => {
            const s = `<g transform="translate(${chipX},0)">${c.body}</g>`;
            chipX += c.w + 14;
            return s;
          })
          .join("");

        const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${OG_PALETTE.limestone}" stop-opacity="0"/>
      <stop offset="0.28" stop-color="${OG_PALETTE.limestone}" stop-opacity="0.94"/>
      <stop offset="1" stop-color="${OG_PALETTE.limestone}" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${OG_PALETTE.limestone}"/>
  <image href="${esc(bg)}" x="0" y="0" width="${OG_WIDTH}" height="${OG_HEIGHT}" preserveAspectRatio="xMidYMid slice"/>
  <rect x="520" y="0" width="680" height="${OG_HEIGHT}" fill="url(#wash)"/>

  <!-- Wordmark -->
  <g transform="translate(48,52)">
    <rect x="0" y="0" width="40" height="40" rx="12" fill="${OG_PALETTE.ink}"/>
    <text x="20" y="29" text-anchor="middle" font-family="${OG_FONT_DISPLAY}" font-weight="800" font-size="24" fill="${OG_PALETTE.limestone}">A</text>
    <text x="54" y="27" font-family="${OG_FONT_BODY}" font-weight="700" font-size="16" letter-spacing="2" fill="${OG_PALETTE.ink}">ALOYA · CYPRUS</text>
  </g>

  <!-- Kicker -->
  <g transform="translate(560,148)">
    <circle cx="6" cy="0" r="6" fill="${OG_PALETTE.ochre}"/>
    <text x="22" y="6" font-family="${OG_FONT_BODY}" font-weight="700" font-size="15" letter-spacing="2.4" fill="${OG_PALETTE.ochre}">${esc(kicker.toUpperCase())}</text>
  </g>

  <!-- From / To -->
  <text x="560" y="196" font-family="${OG_FONT_BODY}" font-weight="500" font-size="14" letter-spacing="2" fill="${OG_PALETTE.inkSoft}">FROM</text>
  <text x="560" y="234" font-family="${OG_FONT_DISPLAY}" font-weight="800" font-size="30" letter-spacing="-0.4" fill="${OG_PALETTE.ink}">${esc(originLabel)}</text>
  <text x="560" y="278" font-family="${OG_FONT_BODY}" font-weight="500" font-size="14" letter-spacing="2" fill="${OG_PALETTE.inkSoft}">TO</text>
  <text x="560" y="330" font-family="${OG_FONT_DISPLAY}" font-weight="800" font-size="52" letter-spacing="-1" fill="${OG_PALETTE.ink}">${esc(destination)}</text>

  <!-- Chips -->
  <g transform="translate(560,380)">${chipsSvg}</g>

  <!-- Footer -->
  <text x="48" y="596" font-family="${OG_FONT_BODY}" font-weight="700" font-size="13" letter-spacing="2.6" fill="${OG_PALETTE.inkSoft}">PLAN · SHARE BEFORE YOU LEAVE</text>
  <text x="${OG_WIDTH - 48}" y="596" text-anchor="end" font-family="${OG_FONT_BODY}" font-weight="500" font-size="13" letter-spacing="2.4" fill="${OG_PALETTE.inkSoft}">APP.ALOYA.CY/PLAN</text>
</svg>`;

        return ogSvgResponse(svg, 60);
      },
    },
  },
});
