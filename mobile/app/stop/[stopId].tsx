// Stop detail — mobile parity rewire on SmartEtaV2 + DepartureRow.
//
// Mirror of `src/routes/stop.$stopId.tsx`:
//   - same upcoming-trip filter (next 30 s back, distinct tripIds, ≤ 8)
//   - same Smart ETA v2 algorithm (shared with web; mobile port lives in
//     `mobile/lib/eta-v2.ts`)
//   - ghost-bus advisory banner when the soonest departure has no GPS
//   - editorial header, mediterranean palette, JetBrains Mono micro-meta
//
// Native enhancements layered on top:
//   - haptic feedback on row press
//   - safe-area aware scroll padding
//   - pull-to-refresh hook into useRealtime
//
// Headsigns / shapes / learned-bias / segment-stats are not yet ported —
// the algorithm degrades gracefully (operator-only fallback). Wave C will
// wire them in once `MapView` + shape prefetch land.

import { useMemo, useCallback, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { palette } from "@/constants/theme";
import { DepartureRow } from "@/components/DepartureRow";
import { SightingButton } from "@/components/SightingButton";
import { StreetViewSheet } from "@/components/StreetViewSheet";
import { StopReliabilityStrip } from "@/components/StopReliabilityStrip";
import { useRealtime, useStopsBundle } from "@/lib/hooks";
import { smartEtaV2, type SmartEtaV2 } from "@/lib/eta-v2";
import { getStop } from "@/lib/gtfs";
import { fetchStopReliability } from "@/lib/reliability";

import { useLocalSearchParams, router } from "expo-router";
import { palette } from "@/constants/theme";
import { DepartureRow } from "@/components/DepartureRow";
import { SightingButton } from "@/components/SightingButton";
import { StreetViewSheet } from "@/components/StreetViewSheet";
import { useRealtime, useStopsBundle } from "@/lib/hooks";
import { smartEtaV2, type SmartEtaV2 } from "@/lib/eta-v2";
import { getStop } from "@/lib/gtfs";


export default function StopDetailScreen() {
  const { stopId } = useLocalSearchParams<{ stopId: string }>();
  const insets = useSafeAreaInsets();
  const [streetOpen, setStreetOpen] = useState(false);
  const rt = useRealtime();

  const bundle = useStopsBundle();

  const stop = useMemo(() => getStop(stopId), [stopId, bundle.dataUpdatedAt]);
  const routeMeta = bundle.data?.routes;

  const departures = useMemo(() => {
    if (!rt.data) return [];
    const now = Math.floor(Date.now() / 1000);
    const seen = new Set<string>();
    const here = rt.data.arrivals
      .filter((a) => a.stopId === stopId && a.arrivalUnix >= now - 30)
      .sort((a, b) => a.arrivalUnix - b.arrivalUnix)
      .filter((a) => (seen.has(a.tripId) ? false : (seen.add(a.tripId), true)));
    return here
      .map((a) => {
        const eta = smartEtaV2({
          stopId,
          arrivals: rt.data!.arrivals,
          vehicles: rt.data!.vehicles,
          nowSec: now,
          agency: stop?.agency,
        });
        return { ...a, eta };
      })
      .filter(
        (d): d is typeof d & { eta: SmartEtaV2 } =>
          d.eta != null && d.eta.etaMin <= 180,
      )
      .slice(0, 8);
  }, [rt.data, stopId, stop?.agency]);

  const routeIds = useMemo(
    () => Array.from(new Set(departures.map((d) => d.routeId))).slice(0, 30),
    [departures],
  );
  const reliability = useQuery({
    queryKey: ["stop-reliability", stopId, routeIds.slice().sort().join(",")],
    queryFn: () => fetchStopReliability(stopId, routeIds),
    enabled: routeIds.length > 0,
    staleTime: 5 * 60_000,
  });


  const stale = rt.data?.stale === true;
  const ghostFirst =
    departures.length > 0 && departures[0].eta.tier === "ghost";

  const onRefresh = useCallback(() => {
    rt.refetch();
    bundle.refetch();
  }, [rt, bundle]);

  const handleRowPress = useCallback((tripId: string) => {
    Haptics.selectionAsync().catch(() => {});
    router.push(`/trip-info/${tripId}`);
  }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.limestone }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 20,
        paddingBottom: 48,
      }}
      refreshControl={
        <RefreshControl
          refreshing={rt.isFetching && !rt.isLoading}
          onRefresh={onRefresh}
          tintColor={palette.aegeanDeep}
        />
      }
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: palette.white,
            borderWidth: 1,
            borderColor: palette.line,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: "Geist_600SemiBold",
              fontSize: 16,
              color: palette.ink,
              marginTop: -2,
            }}
          >
            ←
          </Text>
        </Pressable>
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 10,
            letterSpacing: 2.2,
            color: palette.inkSoft,
            textTransform: "uppercase",
          }}
        >
          Stop {stop?.code ?? stopId}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <Text
        style={{
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 34,
          lineHeight: 38,
          letterSpacing: -0.8,
          color: palette.ink,
        }}
      >
        {stop?.name ?? (bundle.isLoading ? "Loading…" : "Unknown stop")}
      </Text>
      {stop ? (
        <>
          <Text
            style={{
              marginTop: 8,
              fontFamily: "Geist_500Medium",
              fontSize: 13,
              color: palette.inkSoft,
            }}
          >
            {stop.agency === "IC" ? "Intercity service" : "Urban service"} —{" "}
            {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}
          </Text>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setStreetOpen(true);
            }}
            style={({ pressed }) => ({
              alignSelf: "flex-start",
              marginTop: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 999,
              backgroundColor: palette.white,
              borderWidth: 1,
              borderColor: palette.line,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 10,
                letterSpacing: 1.8,
                textTransform: "uppercase",
                color: palette.ink,
              }}
            >
              View street
            </Text>
          </Pressable>
        </>
      ) : null}


      {ghostFirst && stop ? (
        <View style={{ marginTop: 20, gap: 12 }}>
          <View
            style={{
              borderRadius: 20,
              backgroundColor: palette.ochreSoft,
              borderWidth: 1,
              borderColor: "rgba(201,133,58,0.35)",
              paddingHorizontal: 18,
              paddingVertical: 14,
            }}
          >
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 10,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: palette.ink,
              }}
            >
              Bus missing from feed
            </Text>
            <Text
              style={{
                marginTop: 4,
                fontFamily: "Geist_500Medium",
                fontSize: 13,
                lineHeight: 19,
                color: palette.inkSoft,
              }}
            >
              The operator stopped reporting this bus. We're showing the
              scheduled time. Tap below to confirm if you spot it.
            </Text>
          </View>
          <SightingButton
            tripId={departures[0].tripId}
            routeId={departures[0].routeId}
            stopId={stopId}
            lat={stop.lat}
            lng={stop.lng}
          />
        </View>
      ) : null}

      {reliability.data && reliability.data.sampleCount > 0 ? (
        <View style={{ marginTop: 20 }}>
          <StopReliabilityStrip
            tier={reliability.data.tier}
            onTimePct={reliability.data.onTimePct}
            meanDelaySec={reliability.data.meanDelaySec}
          />
        </View>
      ) : null}



      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginTop: 30,
          marginBottom: 14,
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 9.5,
              letterSpacing: 2.4,
              color: palette.inkSoft,
              textTransform: "uppercase",
            }}
          >
            Live · Smart ETA
          </Text>
          <Text
            style={{
              marginTop: 4,
              fontFamily: "BricolageGrotesque_700Bold",
              fontSize: 22,
              lineHeight: 24,
              letterSpacing: -0.4,
              color: palette.ink,
            }}
          >
            Next departures
          </Text>
        </View>
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 10,
            letterSpacing: 1.8,
            color: stale ? palette.ochre : palette.aegeanDeep,
            textTransform: "uppercase",
            paddingBottom: 2,
          }}
        >
          {stale ? "Feed stale" : rt.isLoading ? "Loading" : "Live · 15s"}
        </Text>
      </View>

      {rt.isLoading || bundle.isLoading ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator color={palette.aegeanDeep} />
        </View>
      ) : departures.length === 0 ? (
        <View
          style={{
            borderRadius: 22,
            backgroundColor: palette.white,
            borderWidth: 1,
            borderColor: palette.line,
            padding: 22,
          }}
        >
          <Text
            style={{
              fontFamily: "BricolageGrotesque_700Bold",
              fontSize: 17,
              color: palette.ink,
            }}
          >
            Nothing upcoming
          </Text>
          <Text
            style={{
              marginTop: 6,
              fontFamily: "Geist_500Medium",
              fontSize: 13,
              lineHeight: 19,
              color: palette.inkSoft,
            }}
          >
            The schedule may have ended for today or the feed is between
            updates. Pull to refresh.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {departures.map((d, i) => {
            const meta = routeMeta?.[d.routeId];
            return (
              <DepartureRow
                key={`${d.tripId}-${d.routeId}-${i}`}
                tripId={d.tripId}
                routeId={d.routeId}
                routeShort={meta?.short ?? "—"}
                routeLong={meta?.long ?? "Route"}
                routeColor={meta?.color}
                stopId={stopId}
                arrivalUnix={d.arrivalUnix}
                eta={{
                  etaMin: d.eta.tier === "ghost" ? null : d.eta.etaMin,
                  band: d.eta.band,
                  tier: d.eta.tier,
                  confidence: d.eta.confidence,
                  operatorEtaMin: d.eta.operatorEtaMin,
                }}
                onPress={() => handleRowPress(d.tripId)}
              />
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
