// Aloya Pulse — mobile parity with the web /pulse page.
//
// Composes the same four payloads the web route reads (today briefing,
// road pulse, hourly strip, live signals) via a single public wrapper
// (`/api/public/pulse`). Every card renders honest empty/degraded states
// instead of stubbing. No emoji, no bullet dots, no thin weights, no
// third-party iconography — bespoke SVG only.


import { useCallback, useMemo, useState } from "react";
import { ScrollView, View, Text, RefreshControl, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { palette } from "@/constants/theme";
import { useGeoFix } from "@/lib/hooks";
import { fetchPulseBundle } from "@/lib/pulse";
import { DISPLAY, EYEBROW, ErrorCard, UpdatedFooter } from "@/components/pulse/kit";
import { TodaySection } from "@/components/pulse/TodaySection";
import { RoadPulseCard } from "@/components/pulse/RoadPulseCard";
import { LiveSignals } from "@/components/pulse/LiveSignals";

export default function PulseScreen() {
  const insets = useSafeAreaInsets();
  const { fix } = useGeoFix();
  const [refreshing, setRefreshing] = useState(false);

  const coords = useMemo(
    () => (fix ? { lat: fix.lat, lng: fix.lng } : undefined),
    [fix?.lat, fix?.lng],
  );

  const q = useQuery({
    queryKey: ["pulse-bundle", coords?.lat ?? null, coords?.lng ?? null],
    queryFn: () => fetchPulseBundle(coords),
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await q.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [q]);

  const bundle = q.data;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.limestone }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 32,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={palette.ink}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingHorizontal: 20 }}>
        <Text
          style={{
            fontFamily: EYEBROW,
            fontSize: 10.5,
            letterSpacing: 2,
            color: palette.inkSoft,
            textTransform: "uppercase",
          }}
        >
          Aloya Pulse
        </Text>
        <Text
          style={{
            fontFamily: DISPLAY,
            fontSize: 32,
            lineHeight: 34,
            color: palette.ink,
            marginTop: 6,
          }}
        >
          Cyprus, in one glance.
        </Text>
      </View>

      {!bundle && q.isLoading && (
        <View style={{ paddingTop: 60, alignItems: "center" }}>
          <ActivityIndicator color={palette.aegeanDeep} />
        </View>
      )}

      {q.isError && (
        <View style={{ marginTop: 24, marginHorizontal: 20 }}>
          <ErrorCard
            message="Pulse feed unavailable. Pull down to try again."
          />
        </View>
      )}

      {bundle && (
        <>
          <TodaySection briefing={bundle.today} />
          <RoadPulseCard
            live={bundle.live}
            buckets={bundle.hourly.buckets}
            nowHour={bundle.hourly.nowHour}
          />
          <LiveSignals bundle={bundle.signals} />
          <UpdatedFooter generatedAt={bundle.today.generatedAt} />
        </>
      )}
    </ScrollView>
  );
}
