// Editorial timeline of every stop on the trip, tappable into stop detail.

import { View, Text, Pressable } from "react-native";
import { palette } from "@/constants/theme";
import { stopDelayBadge, type TripBoardStop, type TripStopMeta } from "@aloya/core/trip-board";

function fmtClock(unix: number) {
  return new Date(unix * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StopTimeline({
  stops,
  highlightStopId,
  onStopPress,
}: {
  stops: TripBoardStop<TripStopMeta>[];
  highlightStopId?: string;
  onStopPress: (stopId: string) => void;
}) {
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <Text
          style={{
            flexShrink: 1,
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 22,
            lineHeight: 26,
            letterSpacing: -0.4,
            color: palette.ink,
          }}
        >
          All stops
        </Text>
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 9.5,
            letterSpacing: 1.8,
            color: palette.inkSoft,
            textTransform: "uppercase",
            paddingBottom: 2,
          }}
        >
          Live   Scheduled
        </Text>
      </View>

      <View
        style={{
          borderRadius: 24,
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: palette.line,
          overflow: "hidden",
        }}
      >
        {stops.map((s, i) => {
          const isHighlight = s.stopId === highlightStopId;
          const dotColor = s.passed
            ? "rgba(63,74,54,0.4)"
            : s.next
              ? palette.ochre
              : palette.aegeanDeep;
          const badge = stopDelayBadge(s.delaySec);
          const tags = [
            s.meta?.code ? `#${s.meta.code}` : `Stop ${s.index + 1}`,
            s.next ? "Approaching" : null,
            isHighlight ? "You" : null,
          ].filter(Boolean) as string[];
          return (
            <Pressable
              key={`${s.stopId}-${i}`}
              onPress={() => onStopPress(s.stopId)}
              accessibilityRole="button"
              accessibilityLabel={`${s.meta?.name ?? s.stopId}, ${fmtClock(s.arrivalUnix)}`}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                paddingHorizontal: 18,
                paddingVertical: 14,
                borderBottomWidth: i < stops.length - 1 ? 1 : 0,
                borderBottomColor: palette.line,
                backgroundColor: isHighlight
                  ? "rgba(63,155,178,0.10)"
                  : pressed
                    ? "rgba(237,230,214,0.6)"
                    : "transparent",
              })}
            >
              <View style={{ alignItems: "center", width: 14 }}>
                <View
                  style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dotColor }}
                />
                {i < stops.length - 1 && (
                  <View
                    style={{
                      position: "absolute",
                      top: 14,
                      width: 1,
                      height: 36,
                      backgroundColor: palette.line,
                    }}
                  />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={2}
                  style={{
                    fontFamily: "BricolageGrotesque_700Bold",
                    fontSize: 16,
                    lineHeight: 20,
                    color: s.passed ? palette.inkSoft : palette.ink,
                    textDecorationLine: s.passed ? "line-through" : "none",
                  }}
                >
                  {s.meta?.name ?? `Stop ${s.stopId}`}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    marginTop: 3,
                    fontFamily: "Geist_700Bold",
                    fontSize: 10,
                    letterSpacing: 1.6,
                    color: palette.inkSoft,
                    textTransform: "uppercase",
                  }}
                >
                  {tags.join("   ")}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text
                  style={{
                    fontFamily: "BricolageGrotesque_700Bold",
                    fontSize: 17,
                    lineHeight: 20,
                    color: s.next ? palette.ochre : s.passed ? palette.inkSoft : palette.ink,
                  }}
                >
                  {fmtClock(s.arrivalUnix)}
                </Text>
                {badge && (
                  <Text
                    style={{
                      marginTop: 3,
                      fontFamily: "Geist_700Bold",
                      fontSize: 9.5,
                      letterSpacing: 1.4,
                      color: palette.inkSoft,
                      textTransform: "uppercase",
                    }}
                  >
                    {badge}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text
        style={{
          marginTop: 14,
          fontFamily: "Geist_500Medium",
          fontSize: 12,
          lineHeight: 18,
          color: palette.inkSoft,
        }}
      >
        Times update every 15 seconds from the operator's live feed. When the bus
        drops off the feed, we hold the scheduled time.
      </Text>
    </View>
  );
}
