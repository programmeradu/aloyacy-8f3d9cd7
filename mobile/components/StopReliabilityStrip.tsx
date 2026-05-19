// Editorial "At this stop" reliability card. Big tabular-nums display
// number that scales gracefully up to 100%, tonal wash per tier, tier
// chip in the corner, plain-language summary + hint. Mirrors the web
// `ReliabilityBadge` stack variant.

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
  rail: string;
};

const TIER_TONE: Record<ReliabilityTier, Tone> = {
  high: {
    num: palette.olive,
    chipBg: "rgba(106,117,96,0.18)",
    chipInk: palette.olive,
    label: "Reliable",
    wash: ["rgba(106,117,96,0.20)", "rgba(106,117,96,0)"],
    rail: palette.olive,
  },
  medium: {
    num: palette.ink,
    chipBg: palette.ochreSoft,
    chipInk: palette.ink,
    label: "Steady",
    wash: ["rgba(201,133,58,0.22)", "rgba(201,133,58,0)"],
    rail: palette.ochre,
  },
  low: {
    num: DESTRUCTIVE,
    chipBg: "rgba(178,58,42,0.12)",
    chipInk: DESTRUCTIVE,
    label: "Uneven",
    wash: ["rgba(178,58,42,0.18)", "rgba(178,58,42,0)"],
    rail: DESTRUCTIVE,
  },
  unknown: {
    num: palette.inkSoft,
    chipBg: palette.limestoneSoft,
    chipInk: palette.inkSoft,
    label: "Learning",
    wash: ["rgba(90,87,78,0.08)", "rgba(90,87,78,0)"],
    rail: palette.inkSoft,
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

  const railPct = rated ? Math.max(4, Math.min(100, onTimePct)) : 0;

  return (
    <View
      style={{
        position: "relative",
        overflow: "hidden",
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: palette.line,
        borderRadius: 22,
      }}
    >
      <LinearGradient
        colors={tone.wash}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        pointerEvents="none"
      />

      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 18 }}>
        {/* Eyebrow + tier chip */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 9.5,
              letterSpacing: 2.4,
              color: palette.inkSoft,
              textTransform: "uppercase",
            }}
          >
            At this stop
          </Text>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: tone.chipBg,
            }}
          >
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 9.5,
                letterSpacing: 1.8,
                color: tone.chipInk,
              }}
            >
              {tone.label.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Hero number */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: 8,
            marginBottom: 4,
          }}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              fontFamily: "BricolageGrotesque_800ExtraBold",
              fontSize: 56,
              lineHeight: 58,
              letterSpacing: -2,
              color: tone.num,
              fontVariant: ["tabular-nums"],
              includeFontPadding: false,
            }}
          >
            {rated ? onTimePct : "—"}
            {rated ? (
              <Text
                style={{
                  fontFamily: "BricolageGrotesque_700Bold",
                  fontSize: 28,
                  letterSpacing: -1,
                  color: tone.num,
                }}
              >
                %
              </Text>
            ) : null}
          </Text>
          {rated ? (
            <Text
              style={{
                marginBottom: 12,
                fontFamily: "Geist_700Bold",
                fontSize: 10,
                letterSpacing: 2,
                color: palette.inkSoft,
                textTransform: "uppercase",
              }}
            >
              On time
            </Text>
          ) : null}
        </View>

        {/* Rail */}
        {rated ? (
          <View
            style={{
              height: 4,
              borderRadius: 999,
              backgroundColor: "rgba(31,30,24,0.06)",
              marginTop: 10,
              marginBottom: 12,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${railPct}%`,
                height: "100%",
                backgroundColor: tone.rail,
                borderRadius: 999,
              }}
            />
          </View>
        ) : (
          <View style={{ height: 6 }} />
        )}

        {/* Copy */}
        <Text
          style={{
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 17,
            lineHeight: 21,
            color: palette.ink,
            letterSpacing: -0.3,
          }}
        >
          {summary}
        </Text>
        <Text
          style={{
            marginTop: 3,
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            lineHeight: 18,
            color: palette.inkSoft,
          }}
        >
          {hint}
        </Text>
      </View>
    </View>
  );
}
