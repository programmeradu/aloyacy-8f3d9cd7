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

const HERO =
  "https://app.aloya.cy/__l5e/assets-v1/852729ae-901a-476c-9b8f-0a68b9924687/plan-share-hero.jpg";

type Leg = {
  kind?: "ride" | "walk" | "wait";
  routeShort?: string;
  routeId?: string;
  board?: { name?: string; departureUnix?: number };
  alight?: { name?: string; arrivalUnix?: number };
  from?: { name?: string };
  to?: { name?: string };
  name?: string;
  durationSec?: number;
  stopCount?: number;
};

type PlanShare = {
  token: string;
  creator_name: string | null;
  note: string | null;
  origin_label: string;
  origin_lat: number;
  origin_lng: number;
  destination_label: string;
  destination_lat: number;
  destination_lng: number;
  departure_unix: number;
  arrival_unix: number;
  total_duration_sec: number;
  transfers: number;
  legs: Leg[];
  created_at: string;
  expires_at: string;
};

function fmtTime(unix: number) {
  return new Date(unix * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
function fmtDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
function fmtDur(sec: number) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h} h` : `${h} h ${rem}`;
}

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
        message: plan
          ? `Aloya plan · ${plan.origin_label} → ${plan.destination_label} · ${fmtDate(plan.departure_unix)} ${fmtTime(plan.departure_unix)}\n${url}`
          : url,
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

/* ——————————————————————————— Hero ——————————————————————————— */

function Hero({ plan, isLoading }: { plan: PlanShare | null; isLoading: boolean }) {
  return (
    <View style={{ height: 340, position: "relative", backgroundColor: palette.limestoneSoft }}>
      <Image
        source={{ uri: HERO }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%", opacity: 0.92 }}
        resizeMode="cover"
      />
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 200, backgroundColor: palette.limestone, opacity: 0.72 }} />
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 100, backgroundColor: palette.limestone }} />

      <View style={{ position: "absolute", left: 20, right: 20, bottom: 22 }}>
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 10,
            letterSpacing: 2.2,
            textTransform: "uppercase",
            color: palette.inkSoft,
          }}
        >
          A trip plan on Aloya
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 32,
            lineHeight: 36,
            letterSpacing: -0.6,
            color: palette.ink,
          }}
          numberOfLines={3}
        >
          {isLoading
            ? "Loading plan…"
            : plan
              ? `${plan.origin_label} → ${plan.destination_label}`
              : "Plan not found"}
        </Text>
      </View>
    </View>
  );
}

function BackChip({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: "rgba(246,241,231,0.92)",
        borderWidth: 1,
        borderColor: palette.line,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontFamily: "Geist_700Bold", fontSize: 12, color: palette.ink }}>‹ Back</Text>
    </Pressable>
  );
}

function ShareChip({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: palette.ink,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ fontFamily: "Geist_700Bold", fontSize: 12, color: palette.white }}>Share</Text>
    </Pressable>
  );
}

/* ——————————————————————————— Cards ——————————————————————————— */

function NoteCard({ name, note }: { name: string; note: string }) {
  return (
    <View
      style={{
        backgroundColor: palette.ochreSoft,
        borderRadius: 20,
        padding: 18,
        borderWidth: 1,
        borderColor: "rgba(201,133,58,0.35)",
      }}
    >
      <Text
        style={{
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 10,
          letterSpacing: 2.2,
          textTransform: "uppercase",
          color: palette.ink,
        }}
      >
        {name} says
      </Text>
      <Text
        style={{
          marginTop: 8,
          fontFamily: "BricolageGrotesque_700Bold",
          fontSize: 18,
          lineHeight: 24,
          color: palette.ink,
        }}
      >
        {note}
      </Text>
    </View>
  );
}

function SummaryCard({ plan }: { plan: PlanShare }) {
  return (
    <View
      style={{
        backgroundColor: palette.white,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: palette.line,
      }}
    >
      <Text
        style={{
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 10,
          letterSpacing: 2.2,
          textTransform: "uppercase",
          color: palette.aegeanDeep,
        }}
      >
        {fmtDate(plan.departure_unix)}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 10, gap: 20 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: "JetBrainsMono_500Medium", fontSize: 9, letterSpacing: 1.8, textTransform: "uppercase", color: palette.inkSoft }}>
            Leave
          </Text>
          <Text style={{ marginTop: 4, fontFamily: "BricolageGrotesque_800ExtraBold", fontSize: 28, lineHeight: 32, color: palette.ink }}>
            {fmtTime(plan.departure_unix)}
          </Text>
        </View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={{ fontFamily: "JetBrainsMono_500Medium", fontSize: 9, letterSpacing: 1.8, textTransform: "uppercase", color: palette.inkSoft }}>
            Arrive
          </Text>
          <Text style={{ marginTop: 4, fontFamily: "BricolageGrotesque_800ExtraBold", fontSize: 28, lineHeight: 32, color: palette.ink }}>
            {fmtTime(plan.arrival_unix)}
          </Text>
        </View>
      </View>
      <View
        style={{
          marginTop: 16,
          paddingTop: 14,
          borderTopWidth: 1,
          borderColor: palette.line,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontFamily: "Geist_600SemiBold", fontSize: 12, color: palette.inkSoft }}>
          {fmtDur(plan.total_duration_sec)} in transit
        </Text>
        <Text style={{ fontFamily: "Geist_600SemiBold", fontSize: 12, color: palette.inkSoft }}>
          {plan.transfers === 0 ? "No changes" : plan.transfers === 1 ? "1 change" : `${plan.transfers} changes`}
        </Text>
      </View>
    </View>
  );
}

function ItineraryCard({ plan }: { plan: PlanShare }) {
  return (
    <View
      style={{
        backgroundColor: palette.white,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: palette.line,
        overflow: "hidden",
      }}
    >
      <View style={{ padding: 16, borderBottomWidth: 1, borderColor: palette.line }}>
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 10,
            letterSpacing: 2.2,
            textTransform: "uppercase",
            color: palette.inkSoft,
          }}
        >
          Step by step
        </Text>
      </View>
      {plan.legs.map((leg, i) => (
        <LegRow key={i} leg={leg} last={i === plan.legs.length - 1} />
      ))}
    </View>
  );
}

function LegRow({ leg, last }: { leg: Leg; last: boolean }) {
  const kind = leg.kind ?? "ride";
  const isRide = kind === "ride";
  const isWalk = kind === "walk";
  const fromName = leg.board?.name ?? leg.from?.name ?? leg.name ?? "—";
  const toName = leg.alight?.name ?? leg.to?.name ?? "";
  const depart = leg.board?.departureUnix ? fmtTime(leg.board.departureUnix) : null;
  const arrive = leg.alight?.arrivalUnix ? fmtTime(leg.alight.arrivalUnix) : null;

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 14,
        padding: 16,
        borderTopWidth: last ? 0 : 0,
        borderBottomWidth: last ? 0 : 1,
        borderColor: palette.line,
      }}
    >
      <View style={{ width: 46, alignItems: "center" }}>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 8,
            backgroundColor: isRide ? palette.ink : isWalk ? palette.aegeanSoft : palette.limestoneSoft,
          }}
        >
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 11,
              letterSpacing: 0.6,
              color: isRide ? palette.white : palette.ink,
            }}
          >
            {isRide ? (leg.routeShort ?? "Bus") : isWalk ? "Walk" : "Wait"}
          </Text>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: "Geist_700Bold", fontSize: 14, lineHeight: 20, color: palette.ink }} numberOfLines={2}>
          {isRide ? `Board at ${fromName}` : isWalk ? `Walk to ${toName || fromName}` : fromName}
        </Text>
        {isRide && toName ? (
          <Text style={{ marginTop: 2, fontFamily: "Geist_500Medium", fontSize: 12, lineHeight: 18, color: palette.inkSoft }} numberOfLines={2}>
            Off at {toName}
          </Text>
        ) : null}
        <Text style={{ marginTop: 6, fontFamily: "JetBrainsMono_500Medium", fontSize: 10, letterSpacing: 1.6, textTransform: "uppercase", color: palette.inkSoft }}>
          {depart && arrive
            ? `${depart} → ${arrive}`
            : leg.durationSec
              ? fmtDur(leg.durationSec)
              : depart ?? ""}
        </Text>
      </View>
    </View>
  );
}

function MeetCard({ plan }: { plan: PlanShare }) {
  const meetName = plan.legs.find((l) => (l.kind ?? "ride") === "ride")?.board?.name ?? plan.origin_label;
  const meetTime = plan.legs.find((l) => (l.kind ?? "ride") === "ride")?.board?.departureUnix ?? plan.departure_unix;
  return (
    <View
      style={{
        backgroundColor: palette.aegeanSoft,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: "rgba(31,108,130,0.15)",
      }}
    >
      <Text
        style={{
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 10,
          letterSpacing: 2.2,
          textTransform: "uppercase",
          color: palette.aegeanDeep,
        }}
      >
        Meet at
      </Text>
      <Text
        style={{
          marginTop: 8,
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 22,
          lineHeight: 26,
          color: palette.ink,
        }}
      >
        {meetName}
      </Text>
      <Text style={{ marginTop: 8, fontFamily: "Geist_600SemiBold", fontSize: 13, color: palette.ink }}>
        Bus leaves {fmtTime(meetTime)}. Aim to be there five minutes earlier.
      </Text>
    </View>
  );
}

function CTAStack({ plan, onShare }: { plan: PlanShare; onShare: () => void }) {
  const openInApp = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: "/(tabs)/plan",
      params: {
        fromLabel: plan.origin_label,
        fromLat: String(plan.origin_lat),
        fromLng: String(plan.origin_lng),
        toLabel: plan.destination_label,
        toLat: String(plan.destination_lat),
        toLng: String(plan.destination_lng),
      },
    });
  }, [plan]);

  return (
    <View style={{ gap: 10 }}>
      <Pressable
        onPress={openInApp}
        style={({ pressed }) => ({
          paddingVertical: 16,
          borderRadius: 16,
          backgroundColor: palette.ink,
          alignItems: "center",
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ fontFamily: "Geist_700Bold", fontSize: 14, letterSpacing: 0.4, color: palette.white }}>
          Open this plan in Aloya
        </Text>
      </Pressable>
      <Pressable
        onPress={onShare}
        style={({ pressed }) => ({
          paddingVertical: 14,
          borderRadius: 16,
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: palette.line,
          alignItems: "center",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ fontFamily: "Geist_600SemiBold", fontSize: 13, color: palette.ink }}>
          Share this link
        </Text>
      </Pressable>
    </View>
  );
}

function ExpiryLine({ expiresAt }: { expiresAt: string }) {
  const label = useMemo(() => {
    const diffH = Math.max(0, (new Date(expiresAt).getTime() - Date.now()) / 3600_000);
    if (diffH < 1) return "This link expires within the hour.";
    if (diffH < 24) return `This link expires in about ${Math.round(diffH)} hours.`;
    return `This link expires in ${Math.round(diffH / 24)} days.`;
  }, [expiresAt]);
  return (
    <Text style={{ marginTop: 4, fontFamily: "Geist_500Medium", fontSize: 11, textAlign: "center", color: palette.inkSoft }}>
      {label}
    </Text>
  );
}

/* ——————————————————————————— Skeleton / missing ——————————————————————————— */

function SkeletonBlock({ height }: { height: number }) {
  return (
    <View
      style={{
        height,
        backgroundColor: palette.white,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: palette.line,
      }}
    />
  );
}

function MissingState({ token }: { token: string }) {
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 32 }}>
      <View
        style={{
          backgroundColor: palette.white,
          borderRadius: 24,
          padding: 24,
          borderWidth: 1,
          borderColor: palette.line,
        }}
      >
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 10,
            letterSpacing: 2.2,
            textTransform: "uppercase",
            color: palette.ochre,
          }}
        >
          Plan unavailable
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 22,
            lineHeight: 26,
            color: palette.ink,
          }}
        >
          This plan link has expired or was removed.
        </Text>
        <Text style={{ marginTop: 8, fontFamily: "Geist_500Medium", fontSize: 13, lineHeight: 19, color: palette.inkSoft }}>
          Plan links stay live for 7 days. Ask whoever sent it to share a new one, or plan the same trip fresh in Aloya.
        </Text>
        <Pressable
          onPress={() => router.replace("/(tabs)/plan")}
          style={({ pressed }) => ({
            marginTop: 16,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: palette.ink,
            alignItems: "center",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontFamily: "Geist_700Bold", fontSize: 13, color: palette.white }}>Plan a trip</Text>
        </Pressable>
      </View>
      {token ? (
        <Text style={{ marginTop: 12, textAlign: "center", fontFamily: "JetBrainsMono_500Medium", fontSize: 10, letterSpacing: 1.6, color: palette.inkSoft }}>
          Token: {token.slice(0, 6)}…
        </Text>
      ) : null}
    </View>
  );
}
