import { useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { palette } from "@/constants/theme";
import { Card } from "@/components/Card";
import { EtaPill } from "@/components/EtaPill";
import { RouteChip } from "@/components/RouteChip";
import { useRealtime, useStopsBundle } from "@/lib/hooks";
import { etaFromUnix } from "@/lib/format";

export default function StopDetailScreen() {
  const { stopId } = useLocalSearchParams<{ stopId: string }>();
  const insets = useSafeAreaInsets();
  const rt = useRealtime();
  const bundle = useStopsBundle();

  const stop = useMemo(
    () => bundle.data?.stops.find((s) => s.id === stopId),
    [bundle.data, stopId],
  );

  const departures = useMemo(() => {
    if (!rt.data) return [];
    const now = Date.now();
    return rt.data.arrivals
      .filter((a) => a.stopId === stopId && a.arrivalUnix * 1000 > now - 60_000)
      .sort((a, b) => a.arrivalUnix - b.arrivalUnix)
      .slice(0, 12);
  }, [rt.data, stopId]);

  const stale = rt.data?.stale === true;

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

      <Text
        style={{
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 12,
          color: palette.oliveSoft,
          letterSpacing: 1.2,
        }}
      >
        STOP {stop?.code ?? stopId}
      </Text>
      <Text
        style={{
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 30,
          lineHeight: 34,
          color: palette.ink,
          marginTop: 6,
          letterSpacing: -0.6,
        }}
      >
        {stop?.name ?? "Loading…"}
      </Text>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 26,
          marginBottom: 10,
        }}
      >
        <Text
          style={{
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 18,
            color: palette.ink,
          }}
        >
          Departures
        </Text>
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 11,
            color: stale ? palette.ochre : palette.oliveSoft,
            letterSpacing: 0.8,
          }}
        >
          {stale ? "FEED STALE" : "LIVE · 15s"}
        </Text>
      </View>

      {rt.isLoading || bundle.isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: "center" }}>
          <ActivityIndicator color={palette.aegeanDeep} />
        </View>
      ) : departures.length === 0 ? (
        <Card style={{ padding: 20 }}>
          <Text
            style={{
              fontFamily: "Geist_500Medium",
              color: palette.inkSoft,
              fontSize: 14,
              lineHeight: 20,
            }}
          >
            No live departures right now. The schedule may have ended for today
            or the feed is between updates.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {departures.map((d, i) => {
            const meta = bundle.data?.routes[d.routeId];
            const eta = etaFromUnix(d.arrivalUnix);
            return (
              <Pressable
                key={`${d.tripId}-${i}`}
                onPress={() => router.push(`/route/${d.routeId}`)}
                style={({ pressed }) => ({
                  transform: [{ scale: pressed ? 0.985 : 1 }],
                })}
              >
                <Card
                  style={{
                    padding: 14,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <RouteChip
                    short={meta?.short ?? "—"}
                    color={meta?.color}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: "Geist_600SemiBold",
                        fontSize: 15,
                        color: palette.ink,
                      }}
                    >
                      {meta?.long ?? "Route"}
                    </Text>
                  </View>
                  <EtaPill label={eta.label} tier={eta.tier} stale={stale} />
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
