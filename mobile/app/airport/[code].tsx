// Airport — mobile parity for `src/routes/airport.$code.tsx`.
//
// One editorial screen that reads as a single "next things leaving the
// airport" list. Kapnos intercity coach cards render at the top of the
// live urban DepartureRow list, using the same GTFS stop the web page
// pins to (LCA=6117, PFO=1813). Native enhancements: haptic row press,
// pull-to-refresh, Share sheet via expo-sharing, safe-area padding.
//
// Data path — never any hardcoded fallback:
//   - `fetchAirportPage(code)` (public wrapper around `getAirportPage`)
//     for the airport meta + Kapnos coach lines.
//   - `useRealtime()` + `smartEtaV2` for the urban departures list, with
//     the shared `selectAirportDepartures` selector from @aloya/core.

import { useCallback, useMemo } from "react";
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, Share } from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { palette } from "@/constants/theme";
import { DepartureRow } from "@/components/DepartureRow";
import { type MapMarker } from "@/components/MapView";
import { ExpandableMap } from "@/components/ExpandableMap";
import { useRealtime, useStopsBundle } from "@/lib/hooks";
import { smartEtaV2, type SmartEtaV2 } from "@/lib/eta-v2";
import { getStop } from "@/lib/gtfs";
import { fetchAirportPage, AIRPORT_STOP, type AirportCode } from "@/lib/airport";
import { CoachLineCard } from "@/components/airport/CoachLineCard";
import {
  AirportTopBar,
  AirportTitle,
  GhostFeedNotice,
  BoardHeading,
  AirportEmptyState,
  AirportNotice,
  UnknownAirport,
} from "@/components/airport/AirportChrome";
import {
  selectAirportDepartures,
  hasGhostLead,
  feedStatusLabel,
  airportDisplayName,
  airportShareMessage,
  coordinateLine,
} from "@aloya/core/airport-board";

const ALLOWED: AirportCode[] = ["lca", "pfo"];

export default function AirportScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const insets = useSafeAreaInsets();
  const normalized = (code ?? "").toLowerCase() as AirportCode;
  const valid = ALLOWED.includes(normalized);

  const rt = useRealtime();
  const bundle = useStopsBundle();

  const page = useQuery({
    queryKey: ["airport-page", normalized],
    queryFn: () => fetchAirportPage(normalized),
    enabled: valid,
    staleTime: 60_000,
  });

  const stopId = valid ? AIRPORT_STOP[normalized] : "";
  const stop = useMemo(
    () => (stopId ? getStop(stopId) : null),
    [stopId, bundle.dataUpdatedAt],
  );

  const departures = useMemo(() => {
    if (!rt.data || !stopId) return [];
    const nowSec = Math.floor(Date.now() / 1000);
    return selectAirportDepartures<(typeof rt.data.arrivals)[number], SmartEtaV2>({
      arrivals: rt.data.arrivals,
      stopId,
      nowSec,
      etaFor: (a) =>
        smartEtaV2({
          stopId,
          arrivals: rt.data!.arrivals,
          vehicles: rt.data!.vehicles,
          nowSec,
          agency: stop?.agency,
          riderConfirmedAgeSec: rt.riderConfirmedAge.get(a.tripId),
        }),
    });
  }, [rt.data, rt.riderConfirmedAge, stopId, stop?.agency]);

  const onRefresh = useCallback(() => {
    rt.refetch();
    bundle.refetch();
    page.refetch();
  }, [rt, bundle, page]);

  const handleRowPress = useCallback((tripId: string) => {
    Haptics.selectionAsync().catch(() => {});
    router.push(`/trip-info/${tripId}`);
  }, []);

  if (!valid) return <UnknownAirport code={code ?? ""} topInset={insets.top} />;

  const data = page.data;
  const airportName = airportDisplayName(normalized, data?.airport.name);
  const airportIata = normalized.toUpperCase();
  const airportLat = data?.airport.lat ?? stop?.lat ?? 34.8751;
  const airportLng = data?.airport.lng ?? stop?.lng ?? 33.6249;
  const coachLines = data?.coachLines ?? [];
  const stale = rt.data?.stale === true;
  const totalCount = coachLines.length + departures.length;

  const onShare = () => {
    Haptics.selectionAsync().catch(() => {});
    const share = airportShareMessage({ code: normalized, name: airportName });
    Share.share({ title: share.title, message: share.message }).catch(() => {});
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.limestone }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 48 }}
      refreshControl={
        <RefreshControl
          refreshing={
            (rt.isFetching && !rt.isLoading) || (page.isFetching && !page.isLoading)
          }
          onRefresh={onRefresh}
          tintColor={palette.aegeanDeep}
        />
      }
    >
      <AirportTopBar iata={airportIata} onBack={() => router.back()} onShare={onShare} />

      <AirportTitle name={airportName} subtitle={coordinateLine(airportLat, airportLng)} />

      <View style={{ paddingHorizontal: 20 }}>
        <ExpandableMap
          height={220}
          center={{ lat: airportLat, lng: airportLng }}
          spanKm={2}
          markers={
            [
              {
                lat: airportLat,
                lng: airportLng,
                kind: "origin",
                tone: "ink",
                label: airportName,
              },
            ] as MapMarker[]
          }
          restrictTripIds={departures.map((d) => d.arrival.tripId)}
          fitToContent={false}
        />
      </View>

      {hasGhostLead(departures) && <GhostFeedNotice />}

      <BoardHeading
        stale={stale}
        status={feedStatusLabel({ stale, loading: rt.isLoading })}
      />

      {(rt.isLoading || page.isLoading) && totalCount === 0 ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator color={palette.aegeanDeep} />
          <Text
            style={{
              marginTop: 12,
              fontFamily: "Geist_500Medium",
              fontSize: 12,
              color: palette.inkSoft,
            }}
          >
            Reading the live feed…
          </Text>
        </View>
      ) : totalCount === 0 ? (
        <AirportEmptyState />
      ) : (
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {coachLines.map((line) => (
            <CoachLineCard key={`${line.routeId}-${line.destinationCity}`} line={line} />
          ))}
          {departures.map(({ arrival: d, eta }, i) => {
            const meta = bundle.data?.routes?.[d.routeId];
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
                  etaMin: eta.tier === "ghost" ? null : eta.etaMin,
                  band: eta.band,
                  tier: eta.tier,
                  confidence: eta.confidence,
                  operatorEtaMin: eta.operatorEtaMin,
                  pingAgeSec: eta.pingAgeSec,
                }}
                onPress={() => handleRowPress(d.tripId)}
              />
            );
          })}
        </View>
      )}

      {page.isError && (
        <AirportNotice>
          Coach lines temporarily unavailable. Urban departures still live.
        </AirportNotice>
      )}
    </ScrollView>
  );
}
