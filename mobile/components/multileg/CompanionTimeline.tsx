// Full journey timeline for the multi-leg companion.

import { View, Text } from "react-native";
import { palette } from "@/constants/theme";
import type { Itinerary } from "@/lib/journey-types";
import { KICKER, fmtClock } from "./kit";
import { LegTimelineRow } from "./LegTimelineRow";

export function CompanionTimeline({
  itin,
  currentLegIndex,
  arrived,
}: {
  itin: Itinerary;
  currentLegIndex: number;
  arrived: boolean;
}) {
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <Text
          style={{
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 22,
            lineHeight: 24,
            letterSpacing: -0.4,
            color: palette.ink,
            flexShrink: 1,
          }}
        >
          Your journey
        </Text>
        <Text
          style={{ ...KICKER, color: palette.inkSoft, paddingBottom: 3, textAlign: "right" }}
        >
          {Math.round(itin.totalDurationSec / 60)} min — arr {fmtClock(itin.arrivalUnix)}
        </Text>
      </View>
      <View
        style={{
          borderRadius: 28,
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: palette.line,
          padding: 20,
          gap: 18,
        }}
      >
        {itin.legs.map((leg, i) => (
          <LegTimelineRow
            key={i}
            leg={leg}
            isActive={i === currentLegIndex}
            isDone={i < currentLegIndex || arrived}
          />
        ))}
      </View>
    </View>
  );
}
