// Native group watch screen — mirrors src/routes/group.$code.tsx.
//
// Everyone converging on one place, live. No account required to watch;
// joining just needs a display name + location permission. Identity model:
// each device gets a persisted memberToken per group (AsyncStorage), so
// the same phone is always recognized as the same person.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Share,
  Image,
  StatusBar,
  Platform,
} from "react-native";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { palette } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { API_BASE } from "@/lib/api";
import { GroupMap, type GroupMapMember } from "@/components/GroupMap";
import {
  startGroupBackgroundLocation,
  stopGroupBackgroundLocation,
} from "@/lib/groupBackgroundLocation";

const HERO =
  "https://app.aloya.cy/__l5e/assets-v1/5c4831ab-cd68-46d1-ae67-05259fc19a64/group-converge-hero.jpg";
const PING_INTERVAL_MS = 25_000;
const STALE_MS = 75_000;
const TOKEN_KEY = (code: string) => `aloya.group.${code}.token`;
const NAME_KEY = "aloya.group.lastName";

const MEMBER_TONES = [palette.aegeanDeep, palette.ochre, palette.olive, palette.ink] as const;

type GroupRow = {
  id: string;
  code: string;
  destination_label: string;
  destination_lat: number;
  destination_lng: number;
  created_by_name: string | null;
  created_at: string;
  expires_at: string;
};

type MemberRow = {
  id: string;
  group_id: string;
  member_token: string;
  display_name: string;
  origin_label: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_updated: string | null;
  eta_minutes: number | null;
  status: string;
  is_creator: boolean;
  joined_at: string;
};

async function callGroups<T>(action: "join" | "ping" | "leave", payload: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}/api/public/trip-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "·";
}

function formatEta(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes <= 0) return "Arriving";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "no location yet";
  const diffSec = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 45) return "just now";
  if (diffSec < 3600) return `${Math.round(diffSec / 60)} min ago`;
  return `${Math.round(diffSec / 3600)} h ago`;
}

function isStale(iso: string | null): boolean {
  if (!iso) return true;
  return Date.now() - new Date(iso).getTime() > STALE_MS;
}

function toMapMembers(members: MemberRow[], meToken: string | null): GroupMapMember[] {
  return members
    .filter((m) => m.status === "active")
    .map((m) => ({
      id: m.id,
      displayName: m.display_name,
      lat: m.last_lat,
      lng: m.last_lng,
      lastUpdated: m.last_updated,
      isMe: m.member_token === meToken,
      isCreator: m.is_creator,
    }));
}

export default function GroupWatchScreen() {
  const params = useLocalSearchParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();
  const queryClient = useQueryClient();

  const groupQuery = useQuery({
    queryKey: ["mobile-trip-group", code],
    enabled: !!code,
    queryFn: async (): Promise<GroupRow | null> => {
      const { data, error } = await supabase
        .from("trip_groups")
        .select("*")
        .eq("code", code)
        .maybeSingle();
      if (error) throw error;
      return (data as GroupRow | null) ?? null;
    },
  });

  const group = groupQuery.data ?? null;
  const groupId = group?.id ?? null;

  const membersQuery = useQuery({
    queryKey: ["mobile-trip-group-members", groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<MemberRow[]> => {
      const { data, error } = await supabase
        .from("trip_group_members")
        .select("*")
        .eq("group_id", groupId!)
        .order("joined_at", { ascending: true });
      if (error) throw error;
      return (data as MemberRow[]) ?? [];
    },
    refetchInterval: 20_000,
  });

  useEffect(() => {
    if (!groupId) return;
    const channel = supabase
      .channel(`mobile-trip-group-${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trip_group_members", filter: `group_id=eq.${groupId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["mobile-trip-group-members", groupId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [groupId, queryClient]);

  // Load persisted member token for this code
  const [myToken, setMyToken] = useState<string | null>(null);
  useEffect(() => {
    if (!code) return;
    void AsyncStorage.getItem(TOKEN_KEY(code)).then((t) => setMyToken(t));
  }, [code]);

  const members = membersQuery.data ?? [];
  const me = useMemo(
    () => (myToken ? members.find((m) => m.member_token === myToken) ?? null : null),
    [members, myToken],
  );

  // Continuous location ping while joined — foreground for immediate
  // updates, background (TaskManager) so pings continue when the app is
  // minimised or the screen is off.
  useEffect(() => {
    if (!me || !myToken) return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    let lastPing = 0;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== "granted") return;
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 30, timeInterval: 20_000 },
        (loc) => {
          if (cancelled) return;
          const now = Date.now();
          if (now - lastPing < PING_INTERVAL_MS) return;
          lastPing = now;
          void callGroups("ping", {
            memberToken: myToken,
            position: { lat: loc.coords.latitude, lng: loc.coords.longitude },
          });
        },
      );
      // Also start background updates so a pocketed phone keeps pinging.
      void startGroupBackgroundLocation(myToken, code);
    })();
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [me?.id, myToken, code]);

  // Auto-stop background updates if the trip has ended.
  const expired = group ? new Date(group.expires_at).getTime() < Date.now() : false;
  useEffect(() => {
    if (expired) void stopGroupBackgroundLocation();
  }, [expired]);

  const isLoading = groupQuery.isLoading;
  const isMissing = !isLoading && (groupQuery.isError || !group);

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
          <Hero group={group} expired={expired} isLoading={isLoading} />
          <SafeAreaView edges={["top"]} style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8 }}>
              <BackChip onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))} />
              {group ? <CodeChip code={group.code} expired={expired} /> : null}
            </View>
          </SafeAreaView>

          {isLoading ? (
            <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
              <SkeletonCard />
              <View style={{ height: 16 }} />
              <SkeletonCard />
            </View>
          ) : isMissing ? (
            <MissingState code={code} />
          ) : group ? (
            <View style={{ paddingHorizontal: 20, marginTop: 20, gap: 16 }}>
              <IdentityRibbon
                me={me}
                hasToken={!!myToken}
                expired={expired}
                hostName={group.created_by_name}
              />
              <ConvergeCard members={members} expired={expired} />
              <GroupMap
                members={toMapMembers(members, myToken)}
                destination={{ lat: group.destination_lat, lng: group.destination_lng }}
                destinationLabel={group.destination_label}
              />
              <MembersList members={members} meToken={myToken} />
              {!expired && !me && <JoinCard code={group.code} onJoined={setMyToken} />}
              {!expired && me && (
                <LiveCard
                  group={group}
                  me={me}
                  onLeft={async () => {
                    await stopGroupBackgroundLocation();
                    setMyToken(null);
                    await AsyncStorage.removeItem(TOKEN_KEY(code));
                  }}
                  onEnded={async () => {
                    await stopGroupBackgroundLocation();
                    void queryClient.invalidateQueries({ queryKey: ["mobile-trip-group", code] });
                  }}
                />
              )}
              <HowThisWorks />
            </View>
          ) : null}
        </ScrollView>
      </View>
    </>
  );
}

/* ————————————————————————————————— Hero ————————————————————————————————— */

function Hero({ group, expired, isLoading }: { group: GroupRow | null; expired: boolean; isLoading: boolean }) {
  return (
    <View style={{ height: 340, position: "relative", backgroundColor: palette.limestoneSoft }}>
      <Image source={{ uri: HERO }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.9 }} resizeMode="cover" />
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 260,
          backgroundColor: "transparent",
        }}
      >
        {/* Layered gradient fake — matches web from-limestone/10 → limestone */}
        <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(246,241,231,0.15)" }} />
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 200, backgroundColor: palette.limestone, opacity: 0.75 }} />
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 90, backgroundColor: palette.limestone }} />
      </View>

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
          Everyone converging on
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 34,
            lineHeight: 38,
            letterSpacing: -0.8,
            color: palette.ink,
          }}
          numberOfLines={3}
        >
          {isLoading ? "Loading trip…" : group?.destination_label ?? "Group trip"}
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

function CodeChip({ code, expired }: { code: string; expired: boolean }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: "rgba(246,241,231,0.92)",
        borderWidth: 1,
        borderColor: palette.line,
      }}
    >
      {!expired && <PulseDot />}
      <Text
        style={{
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 10,
          letterSpacing: 2.2,
          color: palette.ink,
        }}
      >
        {expired ? "Ended" : `Live · ${code}`}
      </Text>
    </View>
  );
}

function PulseDot() {
  return <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: palette.aegeanDeep }} />;
}

/* ——————————————————————————— Identity ribbon ——————————————————————————— */

function IdentityRibbon({
  me,
  hasToken,
  expired,
  hostName,
}: {
  me: MemberRow | null;
  hasToken: boolean;
  expired: boolean;
  hostName: string | null;
}) {
  let body: string;
  if (expired) body = "This group has ended. History stays visible below.";
  else if (me?.is_creator) body = `You appear as ${me.display_name}. You started this group.`;
  else if (me) body = `You appear as ${me.display_name}. Your live position is visible to the group.`;
  else if (hasToken) body = "Rejoining — one moment.";
  else body = hostName ? `${hostName} started this trip. Join to share your ETA.` : "Join the trip to share your live ETA.";

  return (
    <View
      style={{
        backgroundColor: palette.white,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: palette.line,
        padding: 16,
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
        You in this group
      </Text>
      <Text style={{ marginTop: 6, fontFamily: "Geist_600SemiBold", fontSize: 14, lineHeight: 20, color: palette.ink }}>
        {body}
      </Text>
    </View>
  );
}

/* ——————————————————————————— Converge card ——————————————————————————— */

function ConvergeCard({ members, expired }: { members: MemberRow[]; expired: boolean }) {
  const active = members.filter((m) => m.status === "active" && m.eta_minutes != null);
  const etas = active
    .map((m) => m.eta_minutes)
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b);
  const min = etas[0];
  const max = etas[etas.length - 1];

  let headline = "Waiting for everyone's ETA";
  let sub = "As people join and share location, arrivals appear here.";
  if (expired) {
    headline = "Trip ended";
    sub = "Everyone who joined is listed below.";
  } else if (etas.length >= 2 && min != null && max != null) {
    const spread = max - min;
    if (spread <= 2) {
      headline = `Everyone in ~${Math.round(max)} min`;
      sub = "You'll all arrive within a couple of minutes of each other.";
    } else {
      headline = `First in ${Math.round(min)} · last in ${Math.round(max)}`;
      sub = `A ${Math.round(spread)}-minute spread. Slowest sets the meeting time.`;
    }
  } else if (etas.length === 1 && min != null) {
    headline = `Arriving in ${Math.round(min)} min`;
    sub = "You're the only one sharing location right now.";
  }

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
        Meet time
      </Text>
      <Text
        style={{
          marginTop: 8,
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 26,
          lineHeight: 30,
          letterSpacing: -0.6,
          color: palette.ink,
        }}
      >
        {headline}
      </Text>
      <Text style={{ marginTop: 8, fontFamily: "Geist_500Medium", fontSize: 13, lineHeight: 19, color: palette.inkSoft }}>
        {sub}
      </Text>
    </View>
  );
}

/* ——————————————————————————— Members list ——————————————————————————— */

function MembersList({ members, meToken }: { members: MemberRow[]; meToken: string | null }) {
  if (members.length === 0) {
    return (
      <View
        style={{
          backgroundColor: palette.white,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: palette.line,
          padding: 20,
        }}
      >
        <Text style={{ fontFamily: "Geist_500Medium", fontSize: 13, color: palette.inkSoft }}>
          No one has joined yet. Share the code to invite people.
        </Text>
      </View>
    );
  }
  return (
    <View
      style={{
        backgroundColor: palette.white,
        borderRadius: 20,
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
          On the way
        </Text>
      </View>
      {members.map((m, i) => {
        const tone = MEMBER_TONES[i % MEMBER_TONES.length];
        const isMe = m.member_token === meToken;
        const stale = m.status === "active" && m.last_lat != null && isStale(m.last_updated);
        return (
          <View
            key={m.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              padding: 16,
              borderTopWidth: i === 0 ? 0 : 1,
              borderColor: palette.line,
              backgroundColor: isMe ? "rgba(215,232,236,0.35)" : "transparent",
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                backgroundColor: stale ? "#9a9689" : tone,
                alignItems: "center",
                justifyContent: "center",
                opacity: stale ? 0.7 : 1,
              }}
            >
              <Text style={{ fontFamily: "Geist_700Bold", fontSize: 13, color: palette.white }}>
                {initials(m.display_name)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Geist_700Bold", fontSize: 15, color: palette.ink }} numberOfLines={1}>
                {m.display_name}
                {isMe ? "  — you" : ""}
                {m.is_creator ? "  · host" : ""}
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  fontFamily: "Geist_500Medium",
                  fontSize: 12,
                  color: stale ? palette.ochre : palette.inkSoft,
                }}
              >
                {m.status === "left"
                  ? "Left the group"
                  : m.last_lat == null
                    ? "Waiting for location"
                    : stale
                      ? `Signal lost · last seen ${timeAgo(m.last_updated)}`
                      : `Updated ${timeAgo(m.last_updated)}`}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontFamily: "BricolageGrotesque_700Bold", fontSize: 18, color: palette.ink }}>
                {m.status === "left" ? "—" : formatEta(m.eta_minutes)}
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  fontFamily: "JetBrainsMono_500Medium",
                  fontSize: 9,
                  letterSpacing: 1.6,
                  textTransform: "uppercase",
                  color: palette.inkSoft,
                }}
              >
                ETA
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ——————————————————————————— Join card ——————————————————————————— */

function JoinCard({ code, onJoined }: { code: string; onJoined: (t: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(NAME_KEY).then((s) => {
      if (s) setName(s);
    });
  }, []);

  const submit = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Add your name", "Others in the group will see how they know you.");
      return;
    }
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      // Ask for location up front so we can send it on join
      let origin: { lat: number; lng: number } | undefined;
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          origin = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        }
      } catch {
        // location is optional at join — the ping loop will retry once granted
      }

      const res = await callGroups<{ memberToken: string }>("join", {
        code,
        displayName: trimmed,
        origin,
      });
      if (!res?.memberToken) {
        Alert.alert("Couldn't join", "The group may have ended or the code is wrong.");
        return;
      }
      await AsyncStorage.setItem(TOKEN_KEY(code), res.memberToken);
      await AsyncStorage.setItem(NAME_KEY, trimmed);
      onJoined(res.memberToken);
    } finally {
      setBusy(false);
    }
  }, [name, code, onJoined]);

  return (
    <View
      style={{
        backgroundColor: palette.ink,
        borderRadius: 24,
        padding: 20,
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
        Join this trip
      </Text>
      <Text
        style={{
          marginTop: 8,
          fontFamily: "BricolageGrotesque_700Bold",
          fontSize: 22,
          lineHeight: 26,
          color: palette.white,
        }}
      >
        Share your ETA with the group
      </Text>
      <Text style={{ marginTop: 8, fontFamily: "Geist_500Medium", fontSize: 12, lineHeight: 18, color: "rgba(255,255,255,0.7)" }}>
        Your live position stays visible only to people in this group and only while the trip is active.
      </Text>

      <View style={{ marginTop: 16 }}>
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 10,
            letterSpacing: 1.8,
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.5)",
          }}
        >
          How you'll appear
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor="rgba(255,255,255,0.35)"
          autoCapitalize="words"
          maxLength={40}
          returnKeyType="done"
          onSubmitEditing={submit}
          style={{
            marginTop: 8,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 14,
            backgroundColor: "rgba(255,255,255,0.08)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.15)",
            fontFamily: "Geist_600SemiBold",
            fontSize: 15,
            color: palette.white,
          }}
        />
      </View>

      <Pressable
        onPress={submit}
        disabled={busy}
        style={({ pressed }) => ({
          marginTop: 14,
          borderRadius: 14,
          paddingVertical: 14,
          alignItems: "center",
          backgroundColor: busy ? "rgba(201,133,58,0.6)" : palette.ochre,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ fontFamily: "Geist_700Bold", fontSize: 14, letterSpacing: 0.4, color: palette.ink }}>
          {busy ? "Joining…" : "Join the group"}
        </Text>
      </Pressable>
    </View>
  );
}

/* ——————————————————————————— Live card (already joined) ——————————————————————————— */

function LiveCard({
  group,
  me,
  onLeft,
  onEnded,
}: {
  group: GroupRow;
  me: MemberRow;
  onLeft: () => Promise<void>;
  onEnded: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);

  const share = useCallback(async () => {
    void Haptics.selectionAsync();
    const url = `https://app.aloya.cy/group/${group.code}`;
    const message = `Join my trip to ${group.destination_label} on Aloya. Code ${group.code}\n${url}`;
    try {
      await Share.share({ message, url });
    } catch {
      await Clipboard.setStringAsync(url);
      Alert.alert("Link copied", url);
    }
  }, [group]);

  const leave = useCallback(() => {
    Alert.alert("Leave the group?", "Others will stop seeing your live position.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          try {
            await callGroups("leave", { memberToken: me.member_token });
            await onLeft();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }, [me.member_token, onLeft]);

  const endTrip = useCallback(() => {
    Alert.alert(
      "End this group trip?",
      "The group will be disbanded for everyone immediately. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End trip",
          style: "destructive",
          onPress: async () => {
            setEnding(true);
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            try {
              await callGroups("end", { memberToken: me.member_token });
              await onEnded();
            } finally {
              setEnding(false);
            }
          },
        },
      ],
    );
  }, [me.member_token, onEnded]);

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
        You're live in this group
      </Text>
      <Text style={{ marginTop: 8, fontFamily: "Geist_600SemiBold", fontSize: 14, lineHeight: 20, color: palette.ink }}>
        Your ETA updates every ~25 seconds while you're on the way.
      </Text>

      <Pressable
        onPress={share}
        style={({ pressed }) => ({
          marginTop: 16,
          paddingVertical: 14,
          borderRadius: 14,
          backgroundColor: palette.ink,
          alignItems: "center",
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ fontFamily: "Geist_700Bold", fontSize: 14, letterSpacing: 0.4, color: palette.white }}>
          Invite more people
        </Text>
      </Pressable>
      <Pressable
        onPress={leave}
        disabled={busy}
        style={({ pressed }) => ({
          marginTop: 10,
          paddingVertical: 12,
          borderRadius: 14,
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: palette.line,
          alignItems: "center",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ fontFamily: "Geist_600SemiBold", fontSize: 13, color: palette.inkSoft }}>
          {busy ? "Leaving…" : "Leave the group"}
        </Text>
      </Pressable>
      {me.is_creator && (
        <Pressable
          onPress={endTrip}
          disabled={ending}
          style={({ pressed }) => ({
            marginTop: 10,
            paddingVertical: 12,
            borderRadius: 14,
            backgroundColor: "rgba(184,52,52,0.08)",
            borderWidth: 1,
            borderColor: "rgba(184,52,52,0.35)",
            alignItems: "center",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontFamily: "Geist_700Bold", fontSize: 13, color: "#8a2828" }}>
            {ending ? "Ending trip…" : "End group trip for everyone"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/* ——————————————————————————— How this works ——————————————————————————— */

function HowThisWorks() {
  const items = [
    { k: "Location", v: "Only shared with people in this group, only while the trip is live." },
    { k: "Identity", v: "Anyone can join — no account needed. Names are what people see." },
    { k: "ETA", v: "Computed from your live position using Google Routes. It updates as you move." },
    { k: "End", v: "The host can end the trip. It also expires automatically after 6 hours." },
  ];
  return (
    <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
      <Text
        style={{
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 10,
          letterSpacing: 2.2,
          textTransform: "uppercase",
          color: palette.inkSoft,
        }}
      >
        How this works
      </Text>
      <View style={{ marginTop: 12, gap: 10 }}>
        {items.map((it) => (
          <View key={it.k} style={{ flexDirection: "row", gap: 12 }}>
            <Text
              style={{
                width: 78,
                fontFamily: "Geist_700Bold",
                fontSize: 12,
                color: palette.ink,
              }}
            >
              {it.k}
            </Text>
            <Text style={{ flex: 1, fontFamily: "Geist_500Medium", fontSize: 12, lineHeight: 18, color: palette.inkSoft }}>
              {it.v}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ——————————————————————————— Skeleton / missing ——————————————————————————— */

function SkeletonCard() {
  return (
    <View
      style={{
        height: 120,
        backgroundColor: palette.white,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: palette.line,
      }}
    />
  );
}

function MissingState({ code }: { code: string }) {
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 32, gap: 12 }}>
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
          Group not found
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
          {code ? `We couldn't find "${code}".` : "No code in the link."}
        </Text>
        <Text style={{ marginTop: 8, fontFamily: "Geist_500Medium", fontSize: 13, lineHeight: 19, color: palette.inkSoft }}>
          Group links expire after the trip ends. Ask the host to start a new one.
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
