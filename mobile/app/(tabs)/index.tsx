import { useMemo } from "react";
import { ScrollView, View, Text, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { palette } from "@/constants/theme";
import { Card } from "@/components/Card";
import { useGeoFix, useStopsBundle } from "@/lib/hooks";
import { distanceMeters, formatDistance, timeOfDayGreeting } from "@/lib/format";

// Limassol harbour — sane default when the rider hasn't granted GPS yet.
const FALLBACK = { lat: 34.6786, lng: 33.0454 };

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const { fix, status } = useGeoFix();
  const bundle = useStopsBundle();

  const here = fix ?? FALLBACK;
  const usingFallback = !fix;

  const nearby = useMemo(() => {
    if (!bundle.data) return [];
    return bundle.data.stops
      .map((s) => ({ ...s, d: distanceMeters(here, s) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 6);
  }, [bundle.data, here.lat, here.lng]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.limestone }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 20,
        paddingBottom: 24,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 12,
          color: palette.oliveSoft,
          letterSpacing: 1.2,
        }}
      >
        ALOYA · CYPRUS
      </Text>
      <Text
        style={{
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 38,
          lineHeight: 42,
          color: palette.ink,
          marginTop: 8,
          letterSpacing: -1,
        }}
      >
        {timeOfDayGreeting()}.
      </Text>
      <Text
        style={{
          fontFamily: "Geist_500Medium",
          fontSize: 16,
          color: palette.inkSoft,
          marginTop: 6,
        }}
      >
        {usingFallback
          ? "Showing Limassol — enable location for stops near you."
          : "Stops nearest to you, live."}
      </Text>

      <Pressable
        onPress={() => router.push("/search")}
        style={({ pressed }) => ({
          marginTop: 22,
          backgroundColor: palette.white,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: palette.line,
          paddingHorizontal: 18,
          paddingVertical: 16,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: "Geist_500Medium",
            color: palette.inkSoft,
            fontSize: 15,
          }}
        >
          Search stops, routes, places…
        </Text>
      </Pressable>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 30,
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 20,
            color: palette.ink,
            letterSpacing: -0.4,
          }}
        >
          Nearby stops
        </Text>
        {status === "denied" && (
          <Text
            style={{
              fontFamily: "Geist_600SemiBold",
              fontSize: 12,
              color: palette.ochre,
            }}
          >
            Location off
          </Text>
        )}
      </View>

      {bundle.isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: "center" }}>
          <ActivityIndicator color={palette.aegeanDeep} />
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {nearby.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => router.push(`/stop/${s.id}`)}
              style={({ pressed }) => ({
                transform: [{ scale: pressed ? 0.985 : 1 }],
              })}
            >
              <Card style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: palette.aegeanSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "JetBrainsMono_500Medium",
                      fontSize: 11,
                      color: palette.aegeanDeep,
                      letterSpacing: 0.5,
                    }}
                  >
                    {s.agency}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: "Geist_600SemiBold",
                      fontSize: 16,
                      color: palette.ink,
                    }}
                  >
                    {s.name}
                  </Text>
                  <Text
                    style={{
                      fontFamily: "JetBrainsMono_500Medium",
                      fontSize: 12,
                      color: palette.inkSoft,
                      marginTop: 2,
                    }}
                  >
                    {formatDistance(s.d)} · stop {s.code}
                  </Text>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
