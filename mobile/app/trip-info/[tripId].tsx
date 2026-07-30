// Trip-info — mobile parity rewire of `src/routes/trip-info.$tripId.tsx`.
//
// Derivation (ordering, next stop, passed/upcoming tagging, running status,
// route length, fleet label) lives in @aloya/core/trip-board so web and mobile
// never drift. This screen wires live data to native presentation:
//   - header chrome + live/stale chip
//   - route hero (chip, fleet label, long name, meta line)
//   - MapView restricted to this trip's vehicles, stops as tone-tagged markers
//   - next-stop / ETA / status composite
//   - editorial timeline of every stop, tappable into stop detail
//
// Native touches: haptics on stop press, pull-to-refresh, safe-area padding.
// `?from=<stopId>` deep-link param anchors the rider on their boarding stop.

import { useCallback, useMemo } from "react";
import { View, ScrollView, RefreshControl } from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { palette } from "@/constants/theme";
import { useRealtime, useStopsBundle } from "@/lib/hooks";
import { getStop } from "@/lib/gtfs";
import { type MapMarker } from "@/components/MapView";
import { ExpandableMap } from "@/components/ExpandableMap";
import { TripHeader, TripHero, TripNotLive } from "@/components/trip-info/TripChrome";
import { NextStopStatus } from "@/components/trip-info/NextStopStatus";
import { StopTimeline } from "@/components/trip-info/StopTimeline";
import {
  buildTripBoard,
  fleetLabel,
  tripLengthKm,
  tripMetaLine,
} from "@aloya/core/trip-board";

export default function TripInfoScreen() {
  const { tripId, from } = useLocalSearchParams<{ tripId: string; from?: string }>();
  const highlightStopId = typeof from === "string" ? from : undefined;
  const insets = useSafeAreaInsets();
  const rt = useRealtime();
  const bundle = useStopsBundle();

  const nowUnix = Math.floor(Date.now() / 1000);

  const board = useMemo(() => {
    if (!rt.data) return null;
    return buildTripBoard(rt.data.arrivals, tripId, Math.floor(Date.now() / 1000), (id) =>
      getStop(id),
    );
  }, [rt.data, tripId]);

  const route = board ? bundle.data?.routes?.[board.routeId] : undefined;
  const vehicle = useMemo(
    () => rt.data?.vehicles.find((v) => v.tripId === tripId),
    [rt.data, tripId],
  );

  const markers: MapMarker[] = useMemo(() => {
    if (!board) return [];
    return board.stops
      .filter((s) => s.meta)
      .map((s) => {
        const isHighlight = s.stopId === highlightStopId;
        return {
          lat: s.meta!.lat,
          lng: s.meta!.lng,
          label: s.meta!.name,
          kind: isHighlight ? "origin" : s.next ? "destination" : "stop",
          tone: isHighlight ? "ink" : s.next ? "ochre" : s.passed ? "olive" : "aegean",
        } satisfies MapMarker;
      });
  }, [board, highlightStopId]);

  const metaLine = useMemo(() => {
    if (!board) return "";
    const terminus = board.stops[board.stops.length - 1]?.meta?.name ?? null;
    return tripMetaLine(board.stops.length, tripLengthKm(board.stops), terminus);
  }, [board]);

  const onRefresh = useCallback(() => {
    rt.refetch();
    bundle.refetch();
  }, [rt, bundle]);

  const handleStopPress = useCallback((stopId: string) => {
    Haptics.selectionAsync().catch(() => {});
    router.push(`/stop/${stopId}`);
  }, []);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else if (highlightStopId) router.replace(`/stop/${highlightStopId}`);
    else router.replace("/");
  }, [highlightStopId]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.limestone }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 56 }}
      refreshControl={
        <RefreshControl
          refreshing={rt.isFetching && !rt.isLoading}
          onRefresh={onRefresh}
          tintColor={palette.aegeanDeep}
        />
      }
    >
      <TripHeader stale={!!rt.data?.stale} onBack={handleBack} />

      {!board ? (
        <TripNotLive loading={rt.isLoading} />
      ) : (
        <>
          <TripHero
            short={route?.short ?? "?"}
            color={route?.color}
            fleet={fleetLabel(vehicle?.label)}
            title={route?.long ?? "Route"}
            meta={metaLine}
          />

          <View style={{ paddingHorizontal: 20 }}>
            <ExpandableMap
              height={220}
              spanKm={6}
              markers={markers}
              restrictTripIds={[tripId]}
              fitToContent
            />
          </View>

          <NextStopStatus board={board} nowUnix={nowUnix} />

          <StopTimeline
            stops={board.stops}
            highlightStopId={highlightStopId}
            onStopPress={handleStopPress}
          />
        </>
      )}
    </ScrollView>
  );
}
