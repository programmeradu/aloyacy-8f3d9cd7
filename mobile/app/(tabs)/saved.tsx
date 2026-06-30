// Saved — native mirror of `src/routes/saved.tsx`.
//
// Surfaces pinned places, recent destinations, and (for Pro) the
// Notifications + Offline Schedules controls. Free riders see the
// GoProCard upsell so the surface is never empty / never lies about
// what's behind the paywall.

import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import {
  removeSavedPlace,
  upsertSavedPlace,
  useRecents,
  useSavedPlaces,
  type RecentDestination,
  type SavedPlace,
} from "@/lib/trip-store";
import { useProSubscription } from "@/lib/usePro";
import { useSession } from "@/lib/auth";
import { NotificationsCard } from "@/components/NotificationsCard";
import { OfflineSchedulesCard } from "@/components/OfflineSchedulesCard";
import { GoProCard } from "@/components/GoProCard";

const TONE_CYCLE: SavedPlace["tone"][] = ["aegean", "ochre", "olive"];

const TONE_BG: Record<SavedPlace["tone"], string> = {
  aegean: palette.aegeanSoft,
  ochre: palette.ochreSoft,
  olive: "rgba(63,74,54,0.12)",
};
const TONE_FG: Record<SavedPlace["tone"], string> = {
  aegean: palette.aegeanDeep,
  ochre: palette.ochre,
  olive: palette.olive,
};

export default function SavedScreen() {
  const insets = useSafeAreaInsets();
  const saved = useSavedPlaces();
  const recents = useRecents();
  const { signedIn } = useSession();
  const { isPro, loading: proLoading } = useProSubscription();

  const requirePro = useCallback(
    (fn: () => void) => {
      if (!signedIn) {
        Alert.alert(
          "Sign in to pin",
          "Saved places live with your Aloya account so they follow you across devices.",
        );
        return;
      }
      if (isPro) {
        fn();
        return;
      }
      Alert.alert(
        "Aloya Pro",
        "Pinning places, quiet alerts, and offline schedules are part of Aloya Pro.",
      );
    },
    [signedIn, isPro],
  );

  function pinRecent(r: RecentDestination, label: string) {
    requirePro(() => {
      Haptics.selectionAsync().catch(() => {});
      const tone = TONE_CYCLE[saved.length % 3];
      upsertSavedPlace({
        id: r.id,
        label,
        name: r.name,
        lat: r.lat,
        lng: r.lng,
        tone,
        pinned: true,
        createdAt: Date.now(),
      });
    });
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.limestone }}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 20,
        paddingBottom: 48,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 12,
          letterSpacing: 2,
          color: palette.oliveSoft,
          textTransform: "uppercase",
        }}
      >
        Your places
      </Text>
      <Text
        style={{
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 36,
          lineHeight: 40,
          color: palette.ink,
          letterSpacing: -1,
          marginTop: 8,
        }}
      >
        Saved{" "}
        <Text
          style={{
            color: palette.aegeanDeep,
            fontStyle: "italic",
            fontFamily: "BricolageGrotesque_700Bold",
          }}
        >
          on Aloya
        </Text>
      </Text>

      {/* Pinned */}
      <Text
        style={{
          fontFamily: "BricolageGrotesque_700Bold",
          fontSize: 22,
          color: palette.ink,
          marginTop: 28,
          marginBottom: 12,
          letterSpacing: -0.4,
        }}
      >
        Pinned
      </Text>

      {saved.length === 0 ? (
        <View
          style={{
            backgroundColor: palette.white,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: palette.line,
            padding: 20,
          }}
        >
          <Text
            style={{
              fontFamily: "BricolageGrotesque_700Bold",
              fontSize: 18,
              color: palette.ink,
            }}
          >
            Nothing pinned yet
          </Text>
          <Text
            style={{
              fontFamily: "Geist_500Medium",
              fontSize: 13,
              lineHeight: 19,
              color: palette.inkSoft,
              marginTop: 6,
            }}
          >
            Pin home, work, the beach. Live departures appear here, ready to
            glance at.
          </Text>
          <Pressable
            onPress={() => router.push("/plan")}
            style={({ pressed }) => ({
              alignSelf: "flex-start",
              marginTop: 14,
              backgroundColor: palette.ink,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 999,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: "Geist_600SemiBold",
                fontSize: 12,
                color: palette.limestone,
                letterSpacing: 0.3,
              }}
            >
              Plan a trip
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {saved.map((p) => (
            <View
              key={p.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                backgroundColor: palette.white,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: palette.line,
                padding: 14,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 16,
                  backgroundColor: TONE_BG[p.tone],
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: "BricolageGrotesque_800ExtraBold",
                    fontSize: 18,
                    color: TONE_FG[p.tone],
                  }}
                >
                  {(p.label[0] ?? p.name[0] ?? "•").toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontFamily: "JetBrainsMono_500Medium",
                    fontSize: 10,
                    letterSpacing: 1.8,
                    color: palette.inkSoft,
                    textTransform: "uppercase",
                  }}
                  numberOfLines={1}
                >
                  {p.label}
                </Text>
                <Text
                  style={{
                    fontFamily: "BricolageGrotesque_700Bold",
                    fontSize: 17,
                    lineHeight: 21,
                    color: palette.ink,
                    marginTop: 2,
                  }}
                  numberOfLines={2}
                >
                  {p.name}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  removeSavedPlace(p.id);
                }}
                style={({ pressed }) => ({
                  backgroundColor: palette.limestoneSoft,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: palette.line,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text
                  style={{
                    fontFamily: "Geist_600SemiBold",
                    fontSize: 12,
                    color: palette.ink,
                  }}
                >
                  Unpin
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* Recent */}
      <Text
        style={{
          fontFamily: "BricolageGrotesque_700Bold",
          fontSize: 22,
          color: palette.ink,
          marginTop: 32,
          marginBottom: 12,
          letterSpacing: -0.4,
        }}
      >
        Recent
      </Text>

      {recents.length === 0 ? (
        <View
          style={{
            backgroundColor: palette.white,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: palette.line,
            padding: 18,
          }}
        >
          <Text
            style={{
              fontFamily: "Geist_500Medium",
              fontSize: 13,
              lineHeight: 19,
              color: palette.inkSoft,
            }}
          >
            Your recent destinations will show up here as you plan trips.
          </Text>
        </View>
      ) : (
        <View
          style={{
            backgroundColor: palette.white,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: palette.line,
            overflow: "hidden",
          }}
        >
          {recents.map((r, i) => (
            <RecentRow
              key={r.id}
              r={r}
              onPin={pinRecent}
              divider={i < recents.length - 1}
            />
          ))}
        </View>
      )}

      {/* Pro surfaces */}
      <View style={{ marginTop: 32, gap: 16 }}>
        {proLoading ? null : isPro ? (
          <>
            <NotificationsCard />
            <OfflineSchedulesCard />
          </>
        ) : (
          <GoProCard />
        )}
      </View>
    </ScrollView>
  );
}

function RecentRow({
  r,
  onPin,
  divider,
}: {
  r: RecentDestination;
  onPin: (r: RecentDestination, label: string) => void;
  divider: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState("Favourite");
  const when = new Date(r.lastUsed).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: palette.line,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 16,
            lineHeight: 20,
            color: palette.ink,
          }}
          numberOfLines={2}
        >
          {r.name}
        </Text>
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 10,
            letterSpacing: 1.8,
            color: palette.inkSoft,
            textTransform: "uppercase",
            marginTop: 4,
          }}
        >
          {when}
        </Text>
      </View>
      {editing ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            autoFocus
            value={label}
            onChangeText={setLabel}
            placeholder="Home"
            placeholderTextColor="rgba(90,87,78,0.5)"
            style={{
              width: 96,
              backgroundColor: palette.limestoneSoft,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: palette.line,
              paddingHorizontal: 10,
              paddingVertical: 6,
              fontFamily: "Geist_500Medium",
              fontSize: 13,
              color: palette.ink,
            }}
          />
          <Pressable
            onPress={() => {
              onPin(r, label.trim() || "Favourite");
              setEditing(false);
            }}
            style={({ pressed }) => ({
              backgroundColor: palette.aegeanDeep,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 999,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: "Geist_600SemiBold",
                fontSize: 12,
                color: palette.limestone,
              }}
            >
              Save
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => setEditing(true)}
          style={({ pressed }) => ({
            backgroundColor: palette.ink,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: "Geist_600SemiBold",
              fontSize: 12,
              color: palette.limestone,
            }}
          >
            Pin
          </Text>
        </Pressable>
      )}
    </View>
  );
}
