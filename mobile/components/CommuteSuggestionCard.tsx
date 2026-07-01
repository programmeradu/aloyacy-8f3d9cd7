// Mobile mirror of `src/components/CommuteSuggestionCard.tsx`. Surfaces
// the rider's top learned commute pattern from `commute_patterns` as a
// one-tap suggestion on the home screen. Tap seeds the planner with the
// resolved from/to and hands off to the Plan tab (same handoff protocol
// as AskAloya).
//
// Silent (returns null) when the user is signed out, no pattern
// qualifies, or the query is still loading — keeping the home feed
// honest.

import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { palette } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { useAuthSession } from "@/lib/auth";

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

async function fetchTopCommute(
  userId: string,
): Promise<CommuteSuggestion | null> {
  const now = new Date();
  const dow = now.getDay();
  const dowBit = 1 << dow;
  const bucketNow = now.getHours() * 2 + (now.getMinutes() >= 30 ? 1 : 0);

  const { data: rows } = await supabase
    .from("commute_patterns")
    .select(
      "from_label,to_label,from_lat,from_lng,to_lat,to_lng,time_bucket,dow_mask,count",
    )
    .eq("user_id", userId)
    .gte("count", 2)
    .order("count", { ascending: false })
    .limit(20);
  if (!rows || rows.length === 0) return null;

  const scored = rows
    .map((r) => {
      const dowMatch = (r.dow_mask & dowBit) !== 0 ? 1 : 0;
      const diff = Math.min(
        Math.abs(r.time_bucket - bucketNow),
        48 - Math.abs(r.time_bucket - bucketNow),
      );
      const timeScore = Math.max(0, 1 - diff / 6);
      return {
        ...r,
        score: r.count + dowMatch * 1.5 + timeScore * 2,
        diffBuckets: diff,
      };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (best.score < 2 || best.diffBuckets > 8) return null;

  const hh = Math.floor(best.time_bucket / 2);
  const mm = best.time_bucket % 2 === 0 ? "00" : "30";
  return {
    fromLabel: best.from_label ?? "Saved start",
    toLabel: best.to_label ?? "Saved destination",
    fromLat: best.from_lat,
    fromLng: best.from_lng,
    toLat: best.to_lat,
    toLng: best.to_lng,
    usualTime: `${String(hh).padStart(2, "0")}:${mm}`,
    count: best.count,
  };
}

export function CommuteSuggestionCard() {
  const { session } = useAuthSession();
  const userId = session?.user?.id ?? null;

  const { data } = useQuery({
    enabled: !!userId,
    queryKey: ["commute-suggestion", userId],
    queryFn: () => fetchTopCommute(userId!),
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
