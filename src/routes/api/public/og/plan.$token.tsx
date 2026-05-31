// Dynamic OG image for /plan/:token — social previews of a planned trip
// (meeting point, bus, timing). Fetches the shared plan on every request
// so previews reflect the actual planned journey — not a generic card.

import { createFileRoute } from "@tanstack/react-router";
import { ImageResponse } from "@vercel/og";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { OG_PALETTE, clip, loadOgFonts, ogCacheHeaders } from "@/lib/og-render.server";

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

        const destination = clip(plan?.destination_label ?? "A trip plan", 40);
        const originLabel = clip(plan?.origin_label ?? "Anywhere in Cyprus", 40);
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
                  src={`${origin}${PLAN_BG}`}
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
                    width: "680px",
                    height: "630px",
                    backgroundImage: `linear-gradient(90deg, rgba(243,237,225,0) 0%, rgba(243,237,225,0.94) 28%, ${OG_PALETTE.limestone} 100%)`,
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

                <div style={{ display: "flex", flexDirection: "column", position: "absolute", top: 128, right: 60, width: 600 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                    <div style={{ display: "flex", width: 10, height: 10, borderRadius: 999, backgroundColor: OG_PALETTE.ochre }} />
                    <div style={{ display: "flex", fontFamily: "Body", fontWeight: 700, fontSize: 14, letterSpacing: 2.4, textTransform: "uppercase", color: OG_PALETTE.ochre }}>
                      {kicker}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", marginBottom: 22 }}>
                    <div style={{ display: "flex", fontFamily: "Body", fontWeight: 500, fontSize: 15, letterSpacing: 2, textTransform: "uppercase", color: OG_PALETTE.inkSoft, marginBottom: 6 }}>From</div>
                    <div style={{ display: "flex", fontFamily: "Display", fontWeight: 800, fontSize: 34, lineHeight: 1.05, letterSpacing: -0.6, color: OG_PALETTE.ink, marginBottom: 14 }}>{originLabel}</div>
                    <div style={{ display: "flex", fontFamily: "Body", fontWeight: 500, fontSize: 15, letterSpacing: 2, textTransform: "uppercase", color: OG_PALETTE.inkSoft, marginBottom: 6 }}>To</div>
                    <div style={{ display: "flex", fontFamily: "Display", fontWeight: 800, fontSize: 48, lineHeight: 1.02, letterSpacing: -1, color: OG_PALETTE.ink }}>{destination}</div>
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", flexDirection: "column", padding: "14px 18px", borderRadius: 16, backgroundColor: OG_PALETTE.ink, color: OG_PALETTE.limestone, minWidth: 200 }}>
                      <div style={{ display: "flex", fontFamily: "Body", fontWeight: 700, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", opacity: 0.7 }}>{day}</div>
                      <div style={{ display: "flex", fontFamily: "Display", fontWeight: 800, fontSize: 28, letterSpacing: -0.4 }}>{dep} → {arr}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", padding: "14px 18px", borderRadius: 16, backgroundColor: "rgba(255,255,255,0.75)", border: `1px solid ${OG_PALETTE.line}` }}>
                      <div style={{ display: "flex", fontFamily: "Body", fontWeight: 700, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: OG_PALETTE.inkSoft }}>Journey</div>
                      <div style={{ display: "flex", fontFamily: "Display", fontWeight: 800, fontSize: 28, letterSpacing: -0.4, color: OG_PALETTE.ink }}>
                        {dur}{transfers ? ` · ${transfers} transfer${transfers === 1 ? "" : "s"}` : ""}
                      </div>
                    </div>
                    {routeShort ? (
                      <div style={{ display: "flex", flexDirection: "column", padding: "14px 18px", borderRadius: 16, backgroundColor: OG_PALETTE.aegeanDeep, color: OG_PALETTE.limestone }}>
                        <div style={{ display: "flex", fontFamily: "Body", fontWeight: 700, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", opacity: 0.75 }}>Bus</div>
                        <div style={{ display: "flex", fontFamily: "Display", fontWeight: 800, fontSize: 28, letterSpacing: -0.4 }}>{routeShort}</div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div style={{ display: "flex", position: "absolute", left: 44, bottom: 36, fontFamily: "Body", fontWeight: 700, fontSize: 12, letterSpacing: 2.6, textTransform: "uppercase", color: OG_PALETTE.inkSoft }}>
                  Plan · Share before you leave
                </div>
                <div style={{ display: "flex", position: "absolute", right: 44, bottom: 36, fontFamily: "Body", fontWeight: 500, fontSize: 12, letterSpacing: 2.4, textTransform: "uppercase", color: OG_PALETTE.inkSoft }}>
                  app.aloya.cy/plan
                </div>
              </div>
            ),
            {
              width: 1200,
              height: 630,
              fonts,
              headers: ogCacheHeaders(60),
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
