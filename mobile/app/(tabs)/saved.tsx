// Saved — native mirror of `src/routes/saved.tsx`.
//
// Surfaces pinned places and recent destinations. Non-Pro riders see the
// editorial ProFeaturesUpsell which opens the paywall sheet. Notification
// + offline-schedule controls live on the Settings screen (single source
// of truth — they used to be duplicated across Saved / Wallet / More).
//
// The two lists render from `components/saved/`; this file owns only the
// screen chrome and the pin-permission rules.

import { useCallback } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import {
  upsertSavedPlace,
  useRecents,
  useSavedPlaces,
  type RecentDestination,
} from "@/lib/trip-store";
import { useProSubscription } from "@/lib/usePro";
import { useSession } from "@/lib/auth";
import { ProFeaturesUpsell } from "@/components/ProFeaturesUpsell";
import { ArrivalPromiseWatchList } from "@/components/ArrivalPromiseCard";
import { PinnedPlaces, TONE_CYCLE } from "@/components/saved/PinnedPlaces";
import { RecentDestinations } from "@/components/saved/RecentDestinations";

const sectionHeading = {
  fontFamily: "BricolageGrotesque_700Bold",
  fontSize: 22,
  color: palette.ink,
  marginBottom: 12,
  letterSpacing: -0.4,
} as const;

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

  const pinRecent = useCallback(
    (r: RecentDestination, label: string) => {
      requirePro(() => {
        Haptics.selectionAsync().catch(() => {});
        upsertSavedPlace({
          id: r.id,
          label,
          name: r.name,
          lat: r.lat,
          lng: r.lng,
          tone: TONE_CYCLE[saved.length % TONE_CYCLE.length],
          pinned: true,
          createdAt: Date.now(),
        });
      });
    },
    [requirePro, saved.length],
  );

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
          fontFamily: "Geist_700Bold",
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

      <View style={{ marginTop: 24 }}>
        <ArrivalPromiseWatchList />
      </View>

      <Text style={{ ...sectionHeading, marginTop: 28 }}>Pinned</Text>
      <PinnedPlaces places={saved} />

      <Text style={{ ...sectionHeading, marginTop: 32 }}>Recent</Text>
      <RecentDestinations recents={recents} onPin={pinRecent} />

      {/* Pro upsell — non-Pro riders only. Alerts + offline live on Settings. */}
      {!proLoading && !isPro && (
        <View style={{ marginTop: 32 }}>
          <ProFeaturesUpsell />
        </View>
      )}
    </ScrollView>
  );
}
