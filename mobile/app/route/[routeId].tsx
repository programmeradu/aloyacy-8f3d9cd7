// Route detail screen — native parity with `src/routes/route.$routeId.tsx`.
//
// Composition only: the board model and every string come from
// @aloya/core/route-board, the sections live in components/route/*.

import { useMemo, useCallback } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import {
  buildRouteBoard,
  isIntercityRoute,
  routeSummaryLine,
  type BoardStop,
} from "@aloya/core/route-board";

import { palette } from "@/constants/theme";
import { RouteChip } from "@/components/RouteChip";
import { type MapMarker } from "@/components/MapView";
import { ExpandableMap } from "@/components/ExpandableMap";
import { IntercityPatternsCard } from "@/components/IntercityPatternsCard";
import { ReliabilityBadge } from "@/components/ReliabilityBadge";
import {
  MONO_KICKER,
  QuietVignette,
  RouteTopBar,
  StopsPendingCard,
} from "@/components/route/RouteChrome";
import { NextDepartureCard } from "@/components/route/NextDepartureCard";
import { RouteRunsList } from "@/components/route/RouteRunsList";
import { RouteStopsList } from "@/components/route/RouteStopsList";
import { useRealtime, useStopsBundle } from "@/lib/hooks";
import { getStop } from "@/lib/gtfs";
import { fetchIntercityInsights } from "@/lib/wave3";
import { fetchRouteReliability } from "@/lib/reliability";

export default function RouteDetailScreen() {
  const { routeId } = useLocalSearchParams<{ routeId: string }>();
  const insets = useSafeAreaInsets();
  const rt = useRealtime();
  const bundle = useStopsBundle();
  const meta = bundle.data?.routes[routeId!];
  const agency = (meta as { agency?: string } | undefined)?.agency;
  const stopOf = useCallback(
    (id: string): BoardStop | undefined => getStop(id, agency),
    [agency],
  );

  const isIntercity = useMemo(() => isIntercityRoute(meta), [meta]);

  const intel = useQuery({
    queryKey: ["intercity-intel", routeId],
    queryFn: () => fetchIntercityInsights(routeId!),
    enabled: !!routeId && isIntercity,
    staleTime: 30 * 60_000,
  });

  const rel = useQuery({
    queryKey: ["route-reliability", routeId],
    queryFn: () => fetchRouteReliability([routeId!]),
    enabled: !!routeId,
    staleTime: 5 * 60_000,
  });
  const reliability = rel.data?.[0];

  const board = useMemo(() => {
    if (!rt.data || !routeId) return null;
    return buildRouteBoard({
      routeId,
      arrivals: rt.data.arrivals,
      vehicles: rt.data.vehicles,
      stopOf,
    });
  }, [rt.data, routeId, stopOf]);

  const markers: MapMarker[] = useMemo(() => {
    if (!board) return [];
    return board.stopIds
      .map((id) => stopOf(id))
      .filter((s): s is BoardStop => !!s)
      .map((s, i, arr) => ({
        lat: s.lat,
        lng: s.lng,
        label: s.name,
        kind:
          i === 0
            ? ("origin" as const)
            : i === arr.length - 1
              ? ("destination" as const)
              : ("stop" as const),
        tone: "aegean" as const,
      }));
  }, [board, stopOf]);

  const tripIds = board?.trips.map((t) => t.tripId) ?? [];
  const firstTrip = board?.trips[0];
  const liveBus = firstTrip
    ? board!.busesOnLine.find((b) => b.tripId === firstTrip.tripId)
    : null;
  const loading = rt.isLoading || bundle.isLoading;
  const hasMapContent = !!board && (board.vehicles.length > 0 || board.stopIds.length > 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.limestone }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 40,
      }}
      refreshControl={
        <RefreshControl
          refreshing={rt.isRefetching}
          onRefresh={() => {
            void Haptics.selectionAsync();
            void rt.refetch();
          }}
          tintColor={palette.aegeanDeep}
        />
      }
    >
      <RouteTopBar />

      <View style={{ paddingHorizontal: 20, paddingBottom: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <RouteChip short={meta?.short ?? routeId ?? "—"} color={meta?.color} />
          <Text style={[MONO_KICKER, { color: palette.inkSoft, flexShrink: 1 }]}>
            {isIntercity ? "INTERCITY LINE" : "URBAN LINE"}
          </Text>
        </View>
        <Text
          style={{
            marginTop: 14,
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 34,
            lineHeight: 38,
            color: palette.ink,
            letterSpacing: -0.8,
          }}
        >
          {meta?.long ?? (bundle.isLoading ? "Loading line…" : `Route ${routeId}`)}
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            color: palette.inkSoft,
          }}
        >
          {routeSummaryLine(board)}
        </Text>
        {reliability && (
          <View style={{ marginTop: 18 }}>
            <ReliabilityBadge
              tier={reliability.tier}
              onTimePct={reliability.onTimePct}
              meanDelaySec={reliability.meanDelaySec}
              sampleCount={reliability.sampleCount}
            />
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        {hasMapContent ? (
          <View
            style={{
              borderRadius: 24,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: palette.line,
            }}
          >
            <ExpandableMap
              height={224}
              markers={markers}
              focusRouteId={routeId}
              restrictTripIds={tripIds.length ? tripIds : undefined}
              fitToContent
            />
          </View>
        ) : (
          <QuietVignette loading={loading} />
        )}
      </View>

      {firstTrip && board ? (
        <NextDepartureCard
          trip={firstTrip}
          liveBus={liveBus}
          stopOf={stopOf}
          stopIds={board.stopIds}
        />
      ) : null}

      {isIntercity && intel.data && (
        <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
          <IntercityPatternsCard data={intel.data} />
        </View>
      )}

      {board && <RouteRunsList board={board} stopOf={stopOf} />}

      {board && board.stopIds.length > 0 ? (
        <RouteStopsList board={board} stopOf={stopOf} />
      ) : !loading ? (
        <StopsPendingCard />
      ) : null}
    </ScrollView>
  );
}
