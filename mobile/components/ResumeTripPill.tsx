// Persistent "Resume trip" pill — native mirror of
// `src/components/ResumeTripPill.tsx`. Whenever an active trip exists
// but the user is not on the trip screen, a compact pill floats above
// the tab bar. One tap re-enters the live companion.

import { View, Text, Pressable, Platform } from "react-native";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import { useActiveTrip } from "@/lib/trip-store";

export function ResumeTripPill() {
  const insets = useSafeAreaInsets();
  const active = useActiveTrip();
  const pathname = usePathname();

  if (!active) return null;
  // Hide on the trip companion itself and while onboarding.
  if (pathname?.startsWith("/trip/")) return null;
  if (pathname === "/welcome") return null;

  const bus = active.option.legs.find((l) => l.kind === "bus");
  const routeShort = bus && bus.kind === "bus" ? bus.routeShort : null;
  const destination = active.to.label;

  const tabBarHeight = Platform.OS === "ios" ? 84 : 68;
  const bottom = tabBarHeight + 10;

  const onPress = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    router.push(`/trip/${active.option.id}`);
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom,
        alignItems: "center",
        paddingHorizontal: 16,
      }}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          width: "100%",
          maxWidth: 420,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          backgroundColor: palette.ink,
          borderRadius: 999,
          paddingVertical: 10,
          paddingLeft: 10,
          paddingRight: 6,
          shadowColor: "#000",
          shadowOpacity: 0.28,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 12 },
          elevation: 10,
          opacity: pressed ? 0.92 : 1,
          transform: [{ translateY: pressed ? 1 : 0 }],
        })}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: palette.aegeanDeep,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "BricolageGrotesque_800ExtraBold",
              fontSize: 14,
              color: palette.limestone,
              letterSpacing: -0.3,
            }}
          >
            {routeShort ?? "•"}
          </Text>
          <View
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: palette.ochre,
              borderWidth: 2,
              borderColor: palette.ink,
            }}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 10,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "rgba(250,247,240,0.7)",
            }}
          >
            Trip in progress
          </Text>
          <Text
            numberOfLines={1}
            style={{
              marginTop: 1,
              fontFamily: "BricolageGrotesque_700Bold",
              fontSize: 15,
              letterSpacing: -0.3,
              color: palette.limestone,
            }}
          >
            {routeShort ? (
              <>
                <Text style={{ color: palette.ochre }}>Bus {routeShort}</Text>
                {"  "}to {destination}
              </>
            ) : (
              destination
            )}
          </Text>
        </View>
        <View
          style={{
            backgroundColor: palette.limestone,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
          }}
        >
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 12,
              color: palette.ink,
              letterSpacing: -0.2,
            }}
          >
            Resume  →
          </Text>
        </View>
      </Pressable>
    </View>
  );
}
