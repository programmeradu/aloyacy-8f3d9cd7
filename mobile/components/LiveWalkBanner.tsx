// Live in-walk turn header. Native mirror of
// `src/components/LiveWalkBanner.tsx`. Sits above WalkGuidance so once
// the rider is actually walking, the screen is dominated by the imminent
// maneuver + a meters countdown, instead of forcing them to scan the
// list to figure out which step they're on.
//
// Renders nothing until GPS + directions are ready.

import { useMemo } from "react";
import { View, Text } from "react-native";
import { palette } from "@/constants/theme";
import { projectOnSteps, WALK_M_PER_S, type WalkStep } from "@aloya/core/geo";

const KICKER = {
  fontFamily: "Geist_700Bold" as const,
  fontSize: 10,
  letterSpacing: 2.2,
  textTransform: "uppercase" as const,
};
const ARRIVAL_M = 25;

function fmtMeters(m: number): string {
  if (m < 10) return "< 10 m";
  if (m < 1000) return `${Math.round(m / 5) * 5} m`;
  return `${(m / 1000).toFixed(1)} km`;
}
function fmtEta(sec: number): string {
  if (sec < 60) return "< 1 min";
  return `${Math.round(sec / 60)} min`;
}

export function LiveWalkBanner({
  title,
  steps,
  fix,
  to,
}: {
  title: string;
  steps: WalkStep[];
  fix: { lat: number; lng: number } | null;
  to: { lat: number; lng: number };
}) {
  const projection = useMemo(() => {
    if (!fix || steps.length === 0) return null;
    return projectOnSteps({ lat: fix.lat, lng: fix.lng }, steps, to);
  }, [fix, steps, to]);
  if (!projection || steps.length === 0) return null;

  const step = steps[projection.currentIndex];
  const next = steps[projection.currentIndex + 1];
  const isFinal = projection.currentIndex >= steps.length - 1;
  const atTurn = projection.metersToStepEnd < ARRIVAL_M;
  const maneuver = (step.maneuver || "straight").toLowerCase().replace(/[-_]/g, " ");
  const etaSec = Math.max(60, Math.round(projection.metersToDestination / WALK_M_PER_S));

  return (
    <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
      <View
        style={{
          borderRadius: 28,
          backgroundColor: palette.ink,
          padding: 22,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ ...KICKER, color: "rgba(245,240,229,0.65)" }}>{title}</Text>
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 10,
              letterSpacing: 1.6,
              color: "rgba(245,240,229,0.55)",
              textTransform: "uppercase",
              fontVariant: ["tabular-nums"],
            }}
          >
            {fmtMeters(projection.metersToDestination)} — {fmtEta(etaSec)}
          </Text>
        </View>

        <View
          style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: "rgba(245,240,229,0.10)",
              borderWidth: 1,
              borderColor: "rgba(245,240,229,0.18)",
            }}
          >
            <Text style={{ ...KICKER, color: "rgba(245,240,229,0.85)" }}>{maneuver}</Text>
          </View>
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 11,
              letterSpacing: 1.6,
              color: palette.aegeanSoft,
              textTransform: "uppercase",
              fontVariant: ["tabular-nums"],
            }}
          >
            {atTurn ? "now" : `in ${fmtMeters(projection.metersToStepEnd)}`}
          </Text>
        </View>

        <Text
          style={{
            marginTop: 10,
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 26,
            lineHeight: 30,
            letterSpacing: -0.6,
            color: palette.limestone,
          }}
        >
          {step.instruction}
        </Text>

        {next && !isFinal ? (
          <View
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: "rgba(245,240,229,0.15)",
            }}
          >
            <Text style={{ ...KICKER, color: "rgba(245,240,229,0.55)" }}>Then</Text>
            <Text
              style={{
                marginTop: 4,
                fontFamily: "Geist_600SemiBold",
                fontSize: 14,
                lineHeight: 20,
                color: "rgba(245,240,229,0.85)",
              }}
            >
              {next.instruction}
            </Text>
          </View>
        ) : isFinal ? (
          <View
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: "rgba(245,240,229,0.15)",
            }}
          >
            <Text style={{ ...KICKER, color: "rgba(148,168,80,0.90)" }}>Last step</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
