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
import { useActiveTrip } from "@/lib/trip-store";

import {
  HERO,
  MEMBER_TONES,
  NAME_KEY,
  PING_INTERVAL_MS,
  STALE_MS,
  TOKEN_KEY,
  callGroups,
  formatEta,
  initials,
  isStale,
  timeAgo,
  toMapMembers,
  type GroupRow,
  type MemberRow,
} from "@/components/group/kit";
import { Hero, IdentityRibbon } from "@/components/group/GroupHeader";
import { ConvergeCard, MembersList } from "@/components/group/GroupMembers";
import { JoinCard } from "@/components/group/JoinCard";
import { LiveCard } from "@/components/group/LiveCard";
import { PlanRouteCard } from "@/components/group/PlanRouteCard";
import { HowThisWorks, SkeletonCard, MissingState } from "@/components/group/GroupStates";

export default function GroupWatchScreen() {
  const params = useLocalSearchParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();
  const queryClient = useQueryClient();

  // Load persisted member token for this code (browser-local capability).
  const [myToken, setMyToken] = useState<string | null>(null);
  useEffect(() => {
    if (!code) return;
    void AsyncStorage.getItem(TOKEN_KEY(code)).then((t) => setMyToken(t));
  }, [code]);

  const viewQuery = useQuery({
    queryKey: ["mobile-trip-group-view", code, myToken],
    enabled: !!code,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_trip_group_view", {
        p_code: code,
        p_member_token: myToken ?? undefined,
      });
      if (error) throw error;
      return (data as (GroupRow & { members: MemberRow[]; me_id: string | null }) | null) ?? null;
    },
    refetchInterval: 15_000,
  });

  const group: GroupRow | null = viewQuery.data
    ? (({ members: _m, me_id: _me, ...g }) => g as GroupRow)(viewQuery.data)
    : null;
  const groupId = group?.id ?? null;
  const meId = viewQuery.data?.me_id ?? null;
  const members: MemberRow[] = viewQuery.data?.members ?? [];
  const groupQuery = viewQuery;
  const membersQuery = { data: members, isLoading: viewQuery.isLoading, isError: viewQuery.isError };
  void groupId;
  void queryClient;
  void membersQuery;

  const me = useMemo(
    () => (meId ? members.find((m) => m.id === meId) ?? null : null),
    [members, meId],
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
                members={toMapMembers(members, meId)}
                destination={{ lat: group.destination_lat, lng: group.destination_lng }}
                destinationLabel={group.destination_label}
              />
              {!expired && group ? <PlanRouteCard group={group} joined={!!me} /> : null}
              <MembersList members={members} meId={meId} />

              {!expired && !me && <JoinCard code={group.code} onJoined={setMyToken} />}
              {!expired && me && myToken && (
                <LiveCard
                  group={group}
                  me={me}
                  memberToken={myToken}
                  onLeft={async () => {
                    await stopGroupBackgroundLocation();
                    setMyToken(null);
                    await AsyncStorage.removeItem(TOKEN_KEY(code));
                  }}
                  onEnded={async () => {
                    await stopGroupBackgroundLocation();
                    void queryClient.invalidateQueries({ queryKey: ["mobile-trip-group-view", code] });
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
