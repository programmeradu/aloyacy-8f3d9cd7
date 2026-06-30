import { useMemo } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { palette } from "@/constants/theme";
import { Card } from "@/components/Card";
import { RouteChip } from "@/components/RouteChip";
import { IntercityPatternsCard } from "@/components/IntercityPatternsCard";
import { useRealtime, useStopsBundle } from "@/lib/hooks";
import { fetchIntercityInsights } from "@/lib/wave3";

export default function RouteDetailScreen() {
  const { routeId } = useLocalSearchParams<{ routeId: string }>();
  const insets = useSafeAreaInsets();
  const rt = useRealtime();
  const bundle = useStopsBundle();
  const meta = bundle.data?.routes[routeId];

  // IC routes get cross-island intelligence; urban routes don't (yet).
  const isIntercity = useMemo(() => {
    if (!meta) return false;
    return meta.feedId === 6 || /^IC/i.test(meta.short ?? "");
  }, [meta]);

  const intel = useQuery({
    queryKey: ["intercity-intel", routeId],
    queryFn: () => fetchIntercityInsights(routeId!),
    enabled: !!routeId && isIntercity,
    staleTime: 30 * 60_000,
  });

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
          {isIntercity ? "INTERCITY ROUTE" : "ROUTE"}
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

      {isIntercity && intel.data && <IntercityPatternsCard data={intel.data} />}
    </ScrollView>
  );
}
