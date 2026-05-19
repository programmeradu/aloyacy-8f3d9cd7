// Compact, editorial "At this stop" reliability card. Mirrors the
// web `StopReliabilityStrip` in `src/routes/stop.$stopId.tsx` — same
// summary + hint copy, same tier chip, plus a tonal radial-style wash
// (via LinearGradient) so it reads at Awwwards quality on native.

import { View, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { palette } from "@/constants/theme";
import type { ReliabilityTier } from "@/lib/reliability";

const DESTRUCTIVE = "#B23A2A";

type Tone = {
  num: string;
  chipBg: string;
  chipInk: string;
  label: string;
  wash: [string, string];
};

const TIER_TONE: Record<ReliabilityTier, Tone> = {
  high: {
    num: palette.olive,
    chipBg: "rgba(106,117,96,0.22)",
    chipInk: palette.olive,
    label: "Reliable",
    wash: ["rgba(106,117,96,0.18)", "rgba(106,117,96,0)"],
  },
  medium: {
    num: palette.ink,
    chipBg: palette.ochreSoft,
    chipInk: palette.ink,
    label: "Steady",
    wash: ["rgba(201,133,58,0.20)", "rgba(201,133,58,0)"],
  },
  low: {
    num: DESTRUCTIVE,
    chipBg: "rgba(178,58,42,0.14)",
    chipInk: DESTRUCTIVE,
    label: "Uneven",
    wash: ["rgba(178,58,42,0.16)", "rgba(178,58,42,0)"],
  },
  unknown: {
    num: palette.inkSoft,
    chipBg: palette.limestoneSoft,
    chipInk: palette.inkSoft,
    label: "Learning",
    wash: ["rgba(90,87,78,0.06)", "rgba(90,87,78,0)"],
  },
};

type Props = {
  tier: ReliabilityTier;
  onTimePct: number;
  meanDelaySec: number;
};

export function StopReliabilityStrip({ tier, onTimePct, meanDelaySec }: Props) {
  const rated = tier !== "unknown";
  const late = meanDelaySec > 0;
  const tone = TIER_TONE[tier];

  const summary = !rated
    ? "Still learning this stop"
    : Math.abs(meanDelaySec) < 60
      ? "Usually runs on time"
      : late
        ? meanDelaySec < 180
          ? "Usually a minute or two late"
          : "Often runs late"
        : Math.abs(meanDelaySec) < 180
          ? "Sometimes leaves a touch early"
          : "Often leaves early";

  const hint = !rated
    ? "Not enough rider data yet"
    : tier === "high"
      ? "Safe to plan tight connections"
      : tier === "medium"
        ? "Give yourself a small buffer"
        : "Leave a few minutes of buffer";

  return (
    <View
      style={{
        position: "relative",
        overflow: "hidden",
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: palette.line,
        borderRadius: 20,
      }}
    >
      {/* Tonal wash — diagonal from top-left, tier colour. */}
      <LinearGradient
        colors={tone.wash}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
        pointerEvents="none"
      />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          paddingVertical: 16,
          paddingHorizontal: 18,
        }}
      >
        <View
          style={{
            width: 58,
            height: 58,
            borderRadius: 29,
            backgroundColor: tone.chipBg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "BricolageGrotesque_700Bold",
              fontSize: 20,
              lineHeight: 22,
              color: tone.num,
              letterSpacing: -0.4,
              fontVariant: ["tabular-nums"],
            }}
          >
            {rated ? onTimePct : "—"}
          </Text>
          {rated ? (
            <Text
              style={{
                marginTop: 2,
                fontFamily: "Geist_700Bold",
                fontSize: 8,
                letterSpacing: 1.8,
                color: palette.inkSoft,
              }}
            >
              ON TIME
            </Text>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 9,
              letterSpacing: 2.2,
              color: palette.inkSoft,
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            At this stop
          </Text>
          <Text
            style={{
              fontFamily: "BricolageGrotesque_700Bold",
              fontSize: 15.5,
              lineHeight: 19,
              color: palette.ink,
              letterSpacing: -0.2,
            }}
          >
            {summary}
          </Text>
          <Text
            style={{
              marginTop: 2,
              fontFamily: "Geist_500Medium",
              fontSize: 12.5,
              lineHeight: 17,
              color: palette.inkSoft,
            }}
          >
            {hint}
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 9,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: tone.chipBg,
          }}
        >
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 9,
              letterSpacing: 1.8,
              color: tone.chipInk,
            }}
          >
            {tone.label.toUpperCase()}
          </Text>
        </View>
      </View>
    </View>
  );
}
