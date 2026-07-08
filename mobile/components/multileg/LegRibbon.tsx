// Horizontal leg ribbon — one pill per leg, current one inked, done ones olive.

import { ScrollView, Text, View } from "react-native";
import { palette } from "@/constants/theme";
import type { MultiLegLive } from "@/lib/useMultiLegJourney";
import type { Itinerary } from "@/lib/journey-types";

// ---------------------------------------------------------------------------
// Leg ribbon
// ---------------------------------------------------------------------------
export function LegRibbon({
  itin,
  live,
}: {
  itin: Itinerary;
  live: MultiLegLive;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: 20,
        gap: 8,
        flexDirection: "row",
      }}
    >
      {itin.legs.map((leg, i) => {
        const isActive = i === live.currentLegIndex;
        const isDone =
          i < live.currentLegIndex || live.phase === "arrived";
        const bg = isActive
          ? palette.ink
          : isDone
            ? palette.oliveSoft
            : palette.white;
        const fg = isActive
          ? palette.limestone
          : isDone
            ? palette.white
            : palette.ink;
        const label =
          leg.kind === "ride"
            ? leg.routeShort
            : leg.kind === "walk"
              ? "Walk"
              : "Wait";
        return (
          <View
            key={i}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: bg,
              borderWidth: 1,
              borderColor: isActive ? palette.ink : palette.line,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 10,
                color: fg,
                opacity: 0.7,
              }}
            >
              {i + 1}
            </Text>
            <Text
              style={{
                fontFamily: "Geist_600SemiBold",
                fontSize: 12,
                color: fg,
                letterSpacing: -0.2,
              }}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}
