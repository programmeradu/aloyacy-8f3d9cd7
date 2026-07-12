// Native shared-ETA viewer — mirrors src/routes/eta.$token.tsx.
//
// A friend shares their live bus trip link. The watcher opens this screen
// to see the rider's current position on the map, their destination, and
// the live ETA. No account or install required on web, but this native
// screen provides a smoother experience for app users.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  Share,
  Alert,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { palette } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { GroupMap, type GroupMapMember } from "@/components/GroupMap";

const HERO =
  "https://app.aloya.cy/__l5e/assets-v1/852729ae-901a-476c-9b8f-0a68b9924687/plan-share-hero.jpg";

type SharedTripRow = {
  token: string;
  origin_label: string | null;
  destination_label: string;
  destination_lat: number;
  destination_lng: number;
  last_lat: number | null;
  last_lng: number | null;
  last_updated: string | null;
  eta_minutes: number | null;
  status: string;
  created_at: string;
  expires_at: string;
};

function fmtTime(date: Date) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function timeAgo(iso: string | null, now: number): string {
  if (!iso) return "no location yet";
  const diffSec = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (diffSec < 45) return "just now";
  if (diffSec < 3600) return `${Math.round(diffSec / 60)} min ago`;
  return `${Math.round(diffSec / 3600)} h ago`;
}

export default function EtaWatchScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const cleanToken = (token ?? "").trim();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  const q = useQuery({
    queryKey: ["mobile-shared-trip", cleanToken],
    enabled: !!cleanToken,
    queryFn: async (): Promise<SharedTripRow | null> => {
      const { data, error } = await supabase
        .from("shared_trips")
        .select("*")
        .eq("token", cleanToken)
        .maybeSingle();
      if (error) throw error;
      return (data as SharedTripRow | null) ?? null;
    },
    refetchInterval: 15_000,
  });

  const trip = q.data as SharedTripRow | null;

  const share = useCallback(async () => {
    if (!cleanToken) return;
    void Haptics.selectionAsync();
    const url = `https://app.aloya.cy/eta/${cleanToken}`;
    try {
      await Share.share({
        message: trip
          ? `Watch my live bus trip to ${trip.destination_label} on Aloya: ${url}`
          : url,
        url,
      });
    } catch {
      await Clipboard.setStringAsync(url);
      Alert.alert("Link copied", url);
    }
  }, [cleanToken, trip]);

  const hasFix = trip?.last_lat != null && trip?.last_lng != null;
  const expired = trip ? new Date(trip.expires_at).getTime() < now || trip.status === "ended" : false;
  const stale = trip?.last_updated ? (now - new Date(trip.last_updated).getTime()) / 1000 > 90 : true;

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
          <Hero trip={trip} expired={expired} isLoading={q.isLoading} />

          <SafeAreaView edges={["top"]} style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8 }}>
              <BackChip onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))} />
              {trip && <ShareChip onPress={share} />}
            </View>
          </SafeAreaView>

          {q.isLoading ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <ActivityIndicator color={palette.aegeanDeep} />
            </View>
          ) : !trip ? (
            <MissingState token={cleanToken} />
          ) : (
            <View style={{ paddingHorizontal: 20, marginTop: 20, gap: 16 }}>
              <StatusCard trip={trip} expired={expired} stale={stale} now={now} />

              {hasFix && !expired && (
                <GroupMap
                  members={[
                    {
                      id: "rider",
                      displayName: "Rider",
                      lat: trip!.last_lat!,
                      lng: trip!.last_lng!,
                      lastUpdated: trip!.last_updated,
                      isMe: false,
                      isCreator: false,
                    }
                  ]}
                  destination={{ lat: trip.destination_lat, lng: trip.destination_lng }}
                  destinationLabel={trip.destination_label}
                  height={300}
                />
              )}

              <DestinationCard trip={trip} />

              <CTAStack onPlan={() => router.push("/(tabs)/plan")} />

              <ExpiryLine expiresAt={trip.expires_at} />
            </View>
          )}
        </ScrollView>
      </View>
    </>
  );
}

/* ——————————————————————————— Hero ——————————————————————————— */

function Hero({ trip, expired, isLoading }: { trip: SharedTripRow | null; expired: boolean; isLoading: boolean }) {
  return (
    <View style={{ height: 340, position: "relative", backgroundColor: palette.limestoneSoft }}>
      <Image
        source={{ uri: HERO }}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.92 }}
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
          Live trip on Aloya
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
            ? "Loading trip…"
            : trip
              ? `Heading to ${trip.destination_label}`
              : "Trip not found"}
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

function StatusCard({ trip, expired, stale, now }: { trip: SharedTripRow; expired: boolean; stale: boolean; now: number }) {
  const eta = trip.eta_minutes;
  const arrived = trip.status === "ended" || (eta != null && eta <= 0);

  return (
    <View
      style={{
        backgroundColor: arrived ? palette.oliveSoft : palette.aegeanSoft,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: arrived ? "rgba(63,74,54,0.15)" : "rgba(31,108,130,0.15)",
      }}
    >
      <Text
        style={{
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 10,
          letterSpacing: 2.2,
          textTransform: "uppercase",
          color: arrived ? palette.olive : palette.aegeanDeep,
        }}
      >
        {expired ? "Trip ended" : arrived ? "Arrived" : "On the way"}
      </Text>
      <View style={{ marginTop: 8, flexDirection: "row", alignItems: "baseline", gap: 10 }}>
        <Text
          style={{
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 48,
            lineHeight: 52,
            color: palette.ink,
          }}
        >
          {expired ? "—" : arrived ? "0" : (eta ?? "—")}
        </Text>
        {!arrived && !expired && (
          <Text style={{ fontFamily: "BricolageGrotesque_700Bold", fontSize: 24, color: palette.inkSoft }}>
            min
          </Text>
        )}
      </View>
      <Text style={{ marginTop: 4, fontFamily: "Geist:600SemiBold", fontSize: 13, color: palette.ink }}>
        {expired
          ? "This live link has expired."
          : arrived
            ? "Rider has reached the destination."
            : `Estimated arrival at ${fmtTime(new Date(now + (eta ?? 0) * 60000))}.`}
      </Text>
      {stale && !expired && !arrived && (
        <Text style={{ marginTop: 8, fontFamily: "Geist_500Medium", fontSize: 11, color: palette.ochre }}>
          Signal lost · last seen {timeAgo(trip.last_updated, now)}
        </Text>
      )}
    </View>
  );
}

function DestinationCard({ trip }: { trip: SharedTripRow }) {
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
          color: palette.inkSoft,
        }}
      >
        Destination
      </Text>
      <Text
        style={{
          marginTop: 8,
          fontFamily: "BricolageGrotesque_700Bold",
          fontSize: 20,
          lineHeight: 24,
          color: palette.ink,
        }}
      >
        {trip.destination_label}
      </Text>
      {trip.origin_label && (
        <Text style={{ marginTop: 4, fontFamily: "Geist_500Medium", fontSize: 13, color: palette.inkSoft }}>
          From {trip.origin_label}
        </Text>
      )}
    </View>
  );
}

function CTAStack({ onPlan }: { onPlan: () => void }) {
  return (
    <View style={{ gap: 10 }}>
      <Pressable
        onPress={onPlan}
        style={({ pressed }) => ({
          paddingVertical: 16,
          borderRadius: 16,
          backgroundColor: palette.ink,
          alignItems: "center",
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ fontFamily: "Geist_700Bold", fontSize: 14, letterSpacing: 0.4, color: palette.white }}>
          Plan your own trip
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

/* ——————————————————————————— Missing state ——————————————————————————— */

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
          Trip unavailable
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
          This live link has expired or was removed.
        </Text>
        <Text style={{ marginTop: 8, fontFamily: "Geist_500Medium", fontSize: 13, lineHeight: 19, color: palette.inkSoft }}>
          Live links stay active while the trip is in progress and for a short time after.
        </Text>
        <Pressable
          onPress={() => router.replace("/(tabs)")}
          style={({ pressed }) => ({
            marginTop: 16,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: palette.ink,
            alignItems: "center",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontFamily: "Geist_700Bold", fontSize: 13, color: palette.white }}>Back to Aloya</Text>
        </Pressable>
      </View>
    </View>
  );
}
