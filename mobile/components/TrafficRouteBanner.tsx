// Compact banner shown above the disruption banner inside MultiLegCompanion
// when a live traffic incident (roadworks/closure/accident/congestion) sits
// on the rider's active corridor. Sourced from CyNAP DATEX II via pulse.

import { View, Text } from "react-native";
import { palette } from "@/constants/theme";
import type { TrafficRouteAlert } from "@/lib/useTrafficWatch";

const TONE: Record<"low" | "medium" | "high", { bg: string; fg: string; label: string }> = {
  low: { bg: "#FFF7E6", fg: palette.ochre, label: "Slow spot" },
  medium: { bg: "#FFE9CC", fg: "#B7530F", label: "Traffic on your route" },
  high: { bg: "#FFDAD3", fg: "#8A2410", label: "Serious disruption ahead" },
};

export function TrafficRouteBanner({ alert }: { alert: TrafficRouteAlert }) {
  const tone = TONE[alert.highest];
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
      <View
        style={{
          backgroundColor: tone.bg,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: tone.fg + "33",
          padding: 14,
          gap: 4,
        }}
      >
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 10,
            letterSpacing: 2,
            color: tone.fg,
            textTransform: "uppercase",
          }}
        >
          {tone.label}
        </Text>
        <Text
          style={{
            fontFamily: "Geist_600SemiBold",
            fontSize: 14,
            lineHeight: 19,
            color: palette.ink,
          }}
        >
          {alert.headline}
        </Text>
      </View>
    </View>
  );
}
