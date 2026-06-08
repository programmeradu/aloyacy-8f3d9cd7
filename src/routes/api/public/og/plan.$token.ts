// Dynamic OG image for /plan/:token — SVG card showing the shared trip
// (from, to, departure/arrival, bus line, transfers). Fetched on every
// request so previews reflect the actual planned journey.

import { createFileRoute } from "@tanstack/react-router";
import {
  OG_HEIGHT,
  OG_PALETTE,
  OG_WIDTH,
  clip,
  esc,
  ogPngResponse,
} from "@/lib/og-render.server";

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
      GET: async ({ params }) => {
        const token = String(params.token || "").slice(0, 64);

        // Load lazily inside the handler — supabaseAdmin lives in a *.server
        // file that must not be pulled into the client module graph.
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

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
        const kicker = (creator ? `Shared by ${creator}` : "A trip plan on Aloya").toUpperCase();

        const dep = plan?.departure_unix ? fmtTime(plan.departure_unix) : "—";
        const arr = plan?.arrival_unix ? fmtTime(plan.arrival_unix) : "—";
        const day = plan?.departure_unix ? fmtDate(plan.departure_unix).toUpperCase() : "";
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
          ? `
    <g transform="translate(880, 470)">
      <rect width="220" height="82" rx="16" fill="${OG_PALETTE.aegeanDeep}"/>
      <text x="18" y="30" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="12" font-weight="700" letter-spacing="2" fill="${OG_PALETTE.limestone}" opacity="0.8">BUS</text>
      <text x="18" y="66" font-family="Bricolage Grotesque, Georgia, serif" font-size="30" font-weight="800" letter-spacing="-0.4" fill="${OG_PALETTE.limestone}">${esc(routeShort)}</text>
    </g>`
          : "";

        const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <defs>
    <linearGradient id="fade" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="${OG_PALETTE.limestone}" stop-opacity="0"/>
      <stop offset="0.28" stop-color="${OG_PALETTE.limestone}" stop-opacity="0.95"/>
      <stop offset="1" stop-color="${OG_PALETTE.limestone}" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${OG_PALETTE.limestone}"/>
  <!-- editorial vertical accent -->
  <rect x="0" y="0" width="8" height="${OG_HEIGHT}" fill="${OG_PALETTE.ochre}"/>
  <rect x="480" y="0" width="720" height="${OG_HEIGHT}" fill="url(#fade)"/>

  <!-- brand mark -->
  <g transform="translate(48, 52)">
    <rect width="40" height="40" rx="12" fill="${OG_PALETTE.ink}"/>
    <text x="20" y="30" text-anchor="middle" font-family="Bricolage Grotesque, Georgia, serif" font-size="24" font-weight="800" fill="${OG_PALETTE.limestone}">A</text>
    <text x="54" y="26" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="16" font-weight="700" letter-spacing="2" fill="${OG_PALETTE.ink}">ALOYA · CYPRUS</text>
  </g>

  <!-- kicker -->
  <g transform="translate(560, 150)">
    <circle cx="6" cy="6" r="6" fill="${OG_PALETTE.ochre}"/>
    <text x="22" y="12" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="15" font-weight="700" letter-spacing="2.4" fill="${OG_PALETTE.ochre}">${esc(kicker)}</text>
  </g>

  <!-- from -->
  <text x="560" y="212" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="14" font-weight="500" letter-spacing="2" fill="${OG_PALETTE.inkSoft}">FROM</text>
  <text x="560" y="252" font-family="Bricolage Grotesque, Georgia, serif" font-size="30" font-weight="800" letter-spacing="-0.4" fill="${OG_PALETTE.ink}">${esc(originLabel)}</text>

  <!-- to -->
  <text x="560" y="304" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="14" font-weight="500" letter-spacing="2" fill="${OG_PALETTE.inkSoft}">TO</text>
  <text x="560" y="366" font-family="Bricolage Grotesque, Georgia, serif" font-size="52" font-weight="800" letter-spacing="-1" fill="${OG_PALETTE.ink}">${esc(destination)}</text>

  <!-- chip: day / time -->
  <g transform="translate(560, 470)">
    <rect width="280" height="82" rx="16" fill="${OG_PALETTE.ink}"/>
    <text x="18" y="30" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="12" font-weight="700" letter-spacing="2" fill="${OG_PALETTE.limestone}" opacity="0.7">${esc(day)}</text>
    <text x="18" y="66" font-family="Bricolage Grotesque, Georgia, serif" font-size="30" font-weight="800" letter-spacing="-0.4" fill="${OG_PALETTE.limestone}">${esc(chipTime)}</text>
  </g>

  <!-- chip: journey -->
  <g transform="translate(${routeShort ? 880 : 860}, 470)">
    ${routeShort ? "" : `<rect width="300" height="82" rx="16" fill="rgba(255,255,255,0.78)" stroke="${OG_PALETTE.line}"/>
    <text x="18" y="30" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="12" font-weight="700" letter-spacing="2" fill="${OG_PALETTE.inkSoft}">JOURNEY</text>
    <text x="18" y="66" font-family="Bricolage Grotesque, Georgia, serif" font-size="30" font-weight="800" letter-spacing="-0.4" fill="${OG_PALETTE.ink}">${esc(journeyText)}</text>`}
  </g>
  ${routeShort ? `<g transform="translate(560, 566)">
    <text font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="14" font-weight="600" fill="${OG_PALETTE.inkSoft}">${esc(journeyText)}</text>
  </g>` : ""}
  ${busChip}

  <!-- footer -->
  <text x="48" y="596" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="13" font-weight="700" letter-spacing="2.6" fill="${OG_PALETTE.inkSoft}">PLAN · SHARE BEFORE YOU LEAVE</text>
  <text x="${OG_WIDTH - 48}" y="596" text-anchor="end" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="13" font-weight="500" letter-spacing="2.4" fill="${OG_PALETTE.inkSoft}">APP.ALOYA.CY/PLAN</text>
</svg>`;

        return await ogPngResponse(svg, 60);
      },
    },
  },
});
