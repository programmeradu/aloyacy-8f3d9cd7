// Native shared-plan viewer — mirrors src/routes/plan.$token.tsx.
//
// A friend gets a link before anyone leaves: where to meet, which bus,
// when it leaves, when the group arrives. No account, no install: they
// tap the link and see the plan in the Aloya app instead of the browser.

import { useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  Share,
  Alert,
  StatusBar,
} from "react-native";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { palette } from "@/constants/theme";
import { API_BASE } from "@/lib/api";
import { Hero, BackChip, ShareChip } from "@/components/plan-share/PlanShareHero";
import {
  NoteCard,
  SummaryCard,
  ItineraryCard,
  MeetCard,
  CTAStack,
  ExpiryLine,
} from "@/components/plan-share/PlanShareCards";
import {
  SkeletonBlock,
  MissingState,
} from "@/components/plan-share/PlanShareStates";


import {
  planClock as fmtTime,
  planDate as fmtDate,
  planDuration as fmtDur,
  changesLabel,
  legCopy,
  meetPoint,
  expiryLabel,
  planShareMessage,
  type PlanShare,
  type PlanShareLeg as Leg,
} from "@aloya/core/plan-share";



export default function PlanShareScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const cleanToken = (token ?? "").trim();

  const q = useQuery({
    queryKey: ["mobile-plan-share", cleanToken],
    enabled: !!cleanToken,
    queryFn: async (): Promise<PlanShare | null> => {
      const res = await fetch(
        `${API_BASE}/api/public/plan-share?token=${encodeURIComponent(cleanToken)}`,
        { headers: { Accept: "application/json" } },
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`plan_lookup_failed_${res.status}`);
      return (await res.json()) as PlanShare;
    },
    retry: 1,
    staleTime: 60_000,
  });

  const plan = q.data ?? null;

  const share = useCallback(async () => {
    if (!cleanToken) return;
    void Haptics.selectionAsync();
    const url = `https://app.aloya.cy/plan/${cleanToken}`;
    try {
      await Share.share({
        message: planShareMessage(plan, url),
        url,
      });
    } catch {
      await Clipboard.setStringAsync(url);
      Alert.alert("Link copied", url);
    }
  }, [cleanToken, plan]);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.limestone },
        }}
      />
      <StatusBar barStyle="dark-content" />
      <View style={{ flex: 1, backgroundColor: palette.limestone }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        >
          <Hero plan={plan} isLoading={q.isLoading} />
          <SafeAreaView edges={["top"]} style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8 }}>
              <BackChip onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                {plan && <ShareChip onPress={share} />}
              </View>
            </View>
          </SafeAreaView>

          {q.isLoading ? (
            <View style={{ paddingHorizontal: 20, marginTop: 24, gap: 14 }}>
              <SkeletonBlock height={140} />
              <SkeletonBlock height={220} />
            </View>
          ) : !plan ? (
            <MissingState token={cleanToken} />
          ) : (
            <View style={{ paddingHorizontal: 20, marginTop: 20, gap: 16 }}>
              {plan.note && plan.creator_name ? (
                <NoteCard name={plan.creator_name} note={plan.note} />
              ) : null}
              <SummaryCard plan={plan} />
              <ItineraryCard plan={plan} />
              <MeetCard plan={plan} />
              <CTAStack plan={plan} onShare={share} />
              <ExpiryLine expiresAt={plan.expires_at} />
            </View>
          )}
        </ScrollView>
      </View>
    </>
  );
}
