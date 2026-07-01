// Native reliability badge — stack variant only (used in the route hero).
// Mirrors `src/components/ReliabilityBadge.tsx` semantics: tier drives the
// dot colour, headline pct + average-delay subline; unknown shows an em-dash
// instead of a fake number.

import { View, Text } from "react-native";
import { palette } from "@/constants/theme";
import type { ReliabilityTier } from "@/lib/reliability";

const DESTRUCTIVE = "#B23A2A";

const TIER_DOT: Record<ReliabilityTier, string> = {
  high: palette.olive,
  medium: palette.ochre,
  low: DESTRUCTIVE,
  unknown: palette.inkSoft,
};

const TIER_TEXT: Record<ReliabilityTier, string> = {
  high: palette.olive,
  medium: palette.ink,
  low: DESTRUCTIVE,
  unknown: palette.inkSoft,
};

type Props = {
  tier: ReliabilityTier;
  onTimePct: number;
  meanDelaySec: number;
  sampleCount: number;
};

export function ReliabilityBadge({ tier, onTimePct, meanDelaySec, sampleCount }: Props) {
  const isRated = tier !== "unknown";
  const subline = isRated
    ? meanDelaySec >= 30
      ? `Avg ${Math.round(meanDelaySec)}s late`
      : meanDelaySec <= -30
        ? `Avg ${Math.round(Math.abs(meanDelaySec))}s early`
        : "Avg on time"
    : "Learning this line";

  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            backgroundColor: TIER_DOT[tier],
          }}
        />
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 10,
            letterSpacing: 2.2,
            color: palette.inkSoft,
          }}
        >
          ON-TIME
        </Text>
      </View>
      <Text
        style={{
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 30,
          lineHeight: 32,
          color: TIER_TEXT[tier],
          letterSpacing: -0.8,
        }}
      >
        {isRated ? `${onTimePct}%` : "—"}
      </Text>
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          fontSize: 10,
          letterSpacing: 1.6,
          color: palette.inkSoft,
        }}
      >
        {subline}
        {isRated ? `  ·  ${sampleCount} samples` : ""}
      </Text>
    </View>
  );
}
