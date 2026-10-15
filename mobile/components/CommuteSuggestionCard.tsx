// Mobile mirror of `src/components/CommuteSuggestionCard.tsx`. Surfaces
// the rider's top learned commute pattern (/api/public/commute-suggestion,
// same scoring as the web server function) as a
// one-tap suggestion on the home screen. Tap seeds the planner with the
// resolved from/to and hands off to the Plan tab (same handoff protocol
// as AskAloya).
//
// Silent (returns null) when the user is signed out, no pattern
// qualifies, or the query is still loading — keeping the home feed
// honest.

import { View, Text, Pressable } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { palette } from "@/constants/theme";
import { fetchWithSession, useSession } from "@/lib/auth";

type CommuteSuggestion = {
  fromLabel: string;
  toLabel: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  usualTime: string;
  count: number;
};

async function fetchTopCommute(): Promise<CommuteSuggestion | null> {
  // Patterns are bucketed in the rider's local time; the server runs in UTC.
  const qs = new URLSearchParams({ tzOffset: String(new Date().getTimezoneOffset()) });
  try {
    const res = await fetchWithSession(`/api/public/commute-suggestion?${qs}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { suggestion?: CommuteSuggestion | null };
    return body.suggestion ?? null;
  } catch {
    return null;
  }
}

export function CommuteSuggestionCard() {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  const { data } = useQuery({
    enabled: !!userId,
    queryKey: ["commute-suggestion", userId],
    queryFn: fetchTopCommute,
    staleTime: 5 * 60_000,
  });

  const s = data ?? null;
  if (!s) return null;

  const onPress = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    try {
      await AsyncStorage.setItem(
        "aloya:nl-plan",
        JSON.stringify({
          from: { label: s.fromLabel, lat: s.fromLat, lng: s.fromLng },
          to: { label: s.toLabel, lat: s.toLat, lng: s.toLng },
          leaveByISO: null,
          arriveByISO: null,
          rawText: `${s.fromLabel} to ${s.toLabel}`,
        }),
      );
    } catch {}
    router.push("/(tabs)/plan");
  };

  return (
    <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          borderRadius: 28,
          backgroundColor: palette.aegeanSoft,
          borderWidth: 1,
          borderColor: "rgba(63,155,178,0.22)",
          paddingVertical: 18,
          paddingHorizontal: 20,
          opacity: pressed ? 0.9 : 1,
          transform: [{ translateY: pressed ? 1 : 0 }],
        })}
      >
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 10,
            letterSpacing: 2.2,
            textTransform: "uppercase",
            color: palette.aegeanDeep,
          }}
        >
          Your usual trip  ·  {s.usualTime}
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 22,
            lineHeight: 26,
            letterSpacing: -0.5,
            color: palette.ink,
          }}
        >
          {s.fromLabel}
          <Text style={{ color: palette.inkSoft }}>  to  </Text>
          {s.toLabel}
        </Text>
        <View
          style={{
            marginTop: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 10,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: palette.inkSoft,
            }}
          >
            Tap to plan now
          </Text>
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 14,
              color: palette.aegeanDeep,
            }}
          >
            →
          </Text>
        </View>
      </Pressable>
    </View>
  );
}
