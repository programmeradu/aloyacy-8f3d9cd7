// Header chrome + not-live empty state for the trip-info screen.

import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { palette } from "@/constants/theme";

export function TripHeader({
  stale,
  onBack,
}: {
  stale: boolean;
  onBack: () => void;
}) {
  return (
    <View
      style={{
        paddingHorizontal: 20,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 18,
      }}
    >
      <Pressable
        onPress={onBack}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: palette.line,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: "Geist_600SemiBold",
            fontSize: 16,
            color: palette.ink,
            marginTop: -2,
          }}
        >
          ←
        </Text>
      </Pressable>
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          fontSize: 10,
          letterSpacing: 2.2,
          color: stale ? palette.ochre : palette.aegeanDeep,
          textTransform: "uppercase",
        }}
      >
        {stale ? "Feed stale" : "Live"}
      </Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

export function TripNotLive({ loading }: { loading: boolean }) {
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
      <Text
        style={{
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 34,
          lineHeight: 38,
          letterSpacing: -0.8,
          color: palette.ink,
        }}
      >
        {loading ? "Loading trip…" : "Trip not live"}
      </Text>
      <Text
        style={{
          marginTop: 10,
          fontFamily: "Geist_500Medium",
          fontSize: 13,
          lineHeight: 20,
          color: palette.inkSoft,
        }}
      >
        We can't find this trip in the live feed. It may have finished or be
        between scheduled runs. Pull to refresh or head back to your stop.
      </Text>
      {loading && (
        <View style={{ paddingVertical: 32, alignItems: "center" }}>
          <ActivityIndicator color={palette.aegeanDeep} />
        </View>
      )}
    </View>
  );
}

export function TripHero({
  short,
  color,
  fleet,
  title,
  meta,
}: {
  short: string;
  color?: string;
  fleet: string;
  title: string;
  meta: string;
}) {
  const { RouteChip } = require("@/components/RouteChip") as typeof import("@/components/RouteChip");
  return (
    <View style={{ paddingHorizontal: 20, marginBottom: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <RouteChip short={short} color={color} />
        <Text
          style={{
            flex: 1,
            fontFamily: "Geist_700Bold",
            fontSize: 10,
            letterSpacing: 2.2,
            color: palette.inkSoft,
            textTransform: "uppercase",
          }}
        >
          {fleet}
        </Text>
      </View>
      <Text
        style={{
          marginTop: 12,
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 32,
          lineHeight: 36,
          letterSpacing: -0.7,
          color: palette.ink,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          marginTop: 8,
          fontFamily: "Geist_500Medium",
          fontSize: 13,
          lineHeight: 19,
          color: palette.inkSoft,
        }}
      >
        {meta}
      </Text>
    </View>
  );
}
