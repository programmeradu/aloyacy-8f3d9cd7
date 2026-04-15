// Mobile dust / air-quality advisory banner — sits above the alt-mode
// suggestions so health-sensitive riders see it first. Calm ochre wash on
// white, bespoke sun-through-haze mark via react-native-svg.
import { View, Text } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import { palette } from "@/constants/theme";
import type { DustAdvisory } from "@/lib/dust";

function washColor(severity: DustAdvisory["severity"]): string {
  switch (severity) {
    case "heavy-dust":
      return "#F7D6A8";
    case "dust-front":
      return "#F5E1BE";
    case "haze":
      return "#F2E6CC";
    default:
      return palette.ochreSoft;
  }
}

export function DustAdvisoryBannerMobile({
  advisory,
}: {
  advisory: DustAdvisory;
}) {
  return (
    <View
      style={{
        backgroundColor: washColor(advisory.severity),
        borderRadius: 20,
        borderWidth: 1,
        borderColor: palette.line,
        padding: 16,
        flexDirection: "row",
        gap: 14,
        alignItems: "flex-start",
      }}
      accessibilityRole="alert"
    >
      <SunThroughHaze />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 10,
            color: palette.ochre,
            letterSpacing: 0.6,
          }}
        >
          AIR QUALITY ADVISORY
        </Text>
        <Text
          style={{
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 16,
            lineHeight: 20,
            color: palette.ink,
            marginTop: 4,
            letterSpacing: -0.2,
          }}
        >
          {advisory.headline}
        </Text>
        <Text
          style={{
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            lineHeight: 19,
            color: palette.inkSoft,
            marginTop: 6,
          }}
        >
          {advisory.advice}
        </Text>
        {advisory.pm10 != null && (
          <Text
            style={{
              fontFamily: "JetBrainsMono_500Medium",
              fontSize: 11,
              color: palette.inkSoft,
              letterSpacing: 0.4,
              marginTop: 8,
            }}
          >
            PM10 {Math.round(advisory.pm10)} µg/m³ · {advisory.zoneLabel}
          </Text>
        )}
      </View>
    </View>
  );
}

function SunThroughHaze() {
  return (
    <Svg width={40} height={40} viewBox="0 0 40 40">
      <Circle cx={20} cy={18} r={9} fill={palette.ochre} opacity={0.85} />
      <Line x1={4} y1={14} x2={36} y2={14} stroke={palette.ochre} strokeWidth={1.6} strokeLinecap="round" opacity={0.55} />
      <Line x1={2} y1={22} x2={38} y2={22} stroke={palette.ochre} strokeWidth={1.6} strokeLinecap="round" opacity={0.55} />
      <Line x1={6} y1={30} x2={34} y2={30} stroke={palette.ochre} strokeWidth={1.6} strokeLinecap="round" opacity={0.55} />
    </Svg>
  );
}
