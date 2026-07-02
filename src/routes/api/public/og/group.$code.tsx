// Dynamic OG image for /group/:code — social previews of a live group
// trip. Fetches destination + latest member snapshot on every request so
// shared links update as friends join, move, and get closer to arrival.

import { createFileRoute } from "@tanstack/react-router";
import { ImageResponse } from "@vercel/og";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { OG_PALETTE, clip, loadOgFonts, ogCacheHeaders } from "@/lib/og-render.server";

const GROUP_BG = "/__l5e/assets-v1/c1152100-2b4c-41b1-ae85-6efb490103e0/og-group-bg.jpg";

export const Route = createFileRoute("/api/public/og/group/$code")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const code = String(params.code || "").toUpperCase().slice(0, 12);
        const origin = new URL(request.url).origin;

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

        const destination = clip(group?.destination_label ?? "A trip on Aloya", 44);
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

        try {
          const fonts = await loadOgFonts();
          return new ImageResponse(
            (
              <div
                style={{
                  display: "flex",
                  width: "1200px",
                  height: "630px",
                  position: "relative",
                  backgroundColor: OG_PALETTE.limestone,
                  fontFamily: "Body",
                }}
              >
                <img
                  src={`${origin}${GROUP_BG}`}
                  width={1200}
                  height={630}
                  style={{ position: "absolute", top: 0, left: 0, width: "1200px", height: "630px", objectFit: "cover" }}
                />
                <div
                  style={{
                    display: "flex",
                    position: "absolute",
                    top: 0,
                    right: 0,
                    width: "640px",
                    height: "630px",
                    backgroundImage: `linear-gradient(90deg, rgba(243,237,225,0) 0%, rgba(243,237,225,0.94) 32%, ${OG_PALETTE.limestone} 100%)`,
                  }}
                />

                <div style={{ display: "flex", position: "absolute", top: 44, left: 44, alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      display: "flex",
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: OG_PALETTE.ink,
                      alignItems: "center",
                      justifyContent: "center",
                      color: OG_PALETTE.limestone,
                      fontFamily: "Display",
                      fontSize: 24,
                    }}
                  >
                    A
                  </div>
                  <div style={{ display: "flex", fontFamily: "Body", fontWeight: 700, fontSize: 16, letterSpacing: 2, textTransform: "uppercase", color: OG_PALETTE.ink }}>
                    Aloya · Cyprus
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", position: "absolute", top: 148, right: 60, width: 560 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                    <div style={{ display: "flex", width: 10, height: 10, borderRadius: 999, backgroundColor: OG_PALETTE.aegeanDeep }} />
                    <div style={{ display: "flex", fontFamily: "Body", fontWeight: 700, fontSize: 14, letterSpacing: 2.4, textTransform: "uppercase", color: OG_PALETTE.aegeanDeep }}>
                      {kicker}
                    </div>
                  </div>
                  <div style={{ display: "flex", fontFamily: "Body", fontWeight: 500, fontSize: 18, color: OG_PALETTE.inkSoft, marginBottom: 8 }}>
                    {host} · Converging on
                  </div>
                  <div style={{ display: "flex", fontFamily: "Display", fontWeight: 800, fontSize: 64, lineHeight: 1.02, letterSpacing: -1.6, color: OG_PALETTE.ink, marginBottom: 26 }}>
                    {destination}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                      padding: "22px 24px",
                      borderRadius: 22,
                      backgroundColor: "rgba(255,255,255,0.72)",
                      border: `1px solid ${OG_PALETTE.line}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ display: "flex", width: 8, height: 8, borderRadius: 999, backgroundColor: OG_PALETTE.ochre }} />
                      <div style={{ display: "flex", fontFamily: "Body", fontWeight: 700, fontSize: 20, color: OG_PALETTE.ink }}>{etaLine}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ display: "flex", width: 8, height: 8, borderRadius: 999, backgroundColor: OG_PALETTE.olive }} />
                      <div style={{ display: "flex", fontFamily: "Body", fontWeight: 500, fontSize: 18, color: OG_PALETTE.inkSoft }}>{peopleLine}</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", position: "absolute", left: 44, bottom: 36, fontFamily: "Body", fontWeight: 700, fontSize: 12, letterSpacing: 2.6, textTransform: "uppercase", color: OG_PALETTE.inkSoft }}>
                  Live · Watch together
                </div>
                <div style={{ display: "flex", position: "absolute", right: 44, bottom: 36, fontFamily: "Body", fontWeight: 500, fontSize: 12, letterSpacing: 2.4, textTransform: "uppercase", color: OG_PALETTE.inkSoft }}>
                  app.aloya.cy/group/{code}
                </div>
              </div>
            ),
            {
              width: 1200,
              height: 630,
              fonts,
              headers: ogCacheHeaders(30),
            },
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(`og render failed: ${msg}`, { status: 500, headers: ogCacheHeaders(10) });
        }
      },
    },
  },
});
