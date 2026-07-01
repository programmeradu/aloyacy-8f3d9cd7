// Compact, human-readable "At this stop" reliability card. Mirrors the
// web `StopReliabilityStrip` in `src/routes/stop.$stopId.tsx` — same
// summary + hint copy, same tier chip, no jargon, no bar.

import { View, Text } from "react-native";
import { palette } from "@/constants/theme";
import type { ReliabilityTier } from "@/lib/reliability";

const DESTRUCTIVE = "#B23A2A";

type Tone = {
  num: string;
  chipBg: string;
  chipInk: string;
  label: string;
};

const TIER_TONE: Record<ReliabilityTier, Tone> = {
  high: {
    num: palette.olive,
    chipBg: "rgba(106,117,96,0.22)",
    chipInk: palette.olive,
    label: "Reliable",
  },
  medium: {
    num: palette.ink,
    chipBg: palette.ochreSoft,
    chipInk: palette.ink,
    label: "Steady",
  },
  low: {
    num: DESTRUCTIVE,
    chipBg: "rgba(178,58,42,0.12)",
    chipInk: DESTRUCTIVE,
    label: "Uneven",
  },
  unknown: {
    num: palette.inkSoft,
    chipBg: palette.limestoneSoft,
    chipInk: palette.inkSoft,
    label: "Learning",
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
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: palette.line,
        borderRadius: 18,
        paddingVertical: 14,
        paddingHorizontal: 16,
      }}
    >
      <View
        style={{
          width: 54,
          height: 54,
          borderRadius: 27,
          backgroundColor: tone.chipBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 19,
            lineHeight: 20,
            color: tone.num,
            letterSpacing: -0.3,
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
              letterSpacing: 1.6,
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
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 15,
            lineHeight: 19,
            color: palette.ink,
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
  );
}
