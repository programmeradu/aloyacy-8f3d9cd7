import { useMemo } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { palette } from "@/constants/theme";
import { Card } from "@/components/Card";
import { RouteChip } from "@/components/RouteChip";
import { useRealtime, useStopsBundle } from "@/lib/hooks";

export default function RouteDetailScreen() {
  const { routeId } = useLocalSearchParams<{ routeId: string }>();
  const insets = useSafeAreaInsets();
  const rt = useRealtime();
  const bundle = useStopsBundle();
  const meta = bundle.data?.routes[routeId];

  const liveVehicles = useMemo(
    () => (rt.data?.vehicles ?? []).filter((v) => v.routeId === routeId),
    [rt.data, routeId],
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.limestone }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 20,
        paddingBottom: 40,
      }}
    >
      <Pressable
        onPress={() => router.back()}
        hitSlop={10}
        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, marginBottom: 14 })}
      >
        <Text
          style={{
            fontFamily: "Geist_600SemiBold",
            fontSize: 14,
            color: palette.aegeanDeep,
          }}
        >
          ← Back
        </Text>
      </Pressable>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <RouteChip short={meta?.short ?? "—"} color={meta?.color} />
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 11,
            color: palette.oliveSoft,
            letterSpacing: 1,
          }}
        >
          ROUTE
        </Text>
      </View>
      <Text
        style={{
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 28,
          lineHeight: 32,
          color: palette.ink,
          marginTop: 10,
          letterSpacing: -0.6,
        }}
      >
        {meta?.long ?? "Loading…"}
      </Text>

      <Card style={{ marginTop: 26, padding: 18 }}>
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 11,
            color: palette.oliveSoft,
            letterSpacing: 1,
          }}
        >
          LIVE VEHICLES
        </Text>
        <Text
          style={{
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 44,
            color: palette.ink,
            marginTop: 6,
            letterSpacing: -1.5,
          }}
        >
          {liveVehicles.length}
        </Text>
        <Text
          style={{
            fontFamily: "Geist_500Medium",
            color: palette.inkSoft,
            fontSize: 13,
            marginTop: 4,
          }}
        >
          {liveVehicles.length === 0
            ? "Nothing moving on this route right now."
            : "On the road and reporting position."}
        </Text>
      </Card>

      <Text
        style={{
          fontFamily: "Geist_500Medium",
          fontSize: 13,
          color: palette.inkSoft,
          marginTop: 24,
          lineHeight: 19,
        }}
      >
        Live map, stop sequence, and reliability badge land in Wave 2.
      </Text>
    </ScrollView>
  );
}
