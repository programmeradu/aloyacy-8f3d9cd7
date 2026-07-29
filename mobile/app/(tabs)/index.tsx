// Today — the mobile home screen.
//
// Composition only: nearest-stop maths, arrival grouping and search ranking
// live in `@aloya/core/home-board` + `@aloya/core/home-search`, card assembly
// lives in `@/lib/home-cards`, and each band of the page is its own component
// under `components/home/`.

import { useMemo, useCallback, useState, useEffect } from "react";
import { ScrollView, View, Text, RefreshControl, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palette } from "@/constants/theme";
import { MapView } from "@/components/MapView";
import { HomeHeader } from "@/components/HomeHeader";
import { HomeSearchBar } from "@/components/home/HomeSearchBar";
import { AreaChips } from "@/components/home/AreaChips";
import { HomeMapBand } from "@/components/home/HomeMapBand";
import { QuickStats } from "@/components/home/QuickStats";
import { NearbyStops } from "@/components/home/NearbyStops";
void MapView;

import { useGeoFix, useStopsBundle, useRealtime } from "@/lib/hooks";
import { timeOfDayGreeting } from "@/lib/format";
import { prefetchHeadsigns, onHeadsignsLoaded } from "@/lib/headsigns";
import { buildStopCards, nearbyStops } from "@/lib/home-cards";
import { AskAloyaCard } from "@/components/AskAloyaCard";
import { CommuteSuggestionCard } from "@/components/CommuteSuggestionCard";
import { ReturnTripSuggestionCard } from "@/components/ReturnTripSuggestionCard";
import { areaFromStop, onTimePercent, CY_AIRPORTS } from "@aloya/core/home-board";
import { searchAll } from "@aloya/core/home-search";

const FALLBACK = { lat: 35.1856, lng: 33.3823 };

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const { fix, status } = useGeoFix();
  const bundle = useStopsBundle();
  const rt = useRealtime();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [, setHeadsignsTick] = useState(0);

  useEffect(() => {
    prefetchHeadsigns();
    const off = onHeadsignsLoaded(() => setHeadsignsTick((n) => n + 1));
    return () => {
      off();
    };
  }, []);

  const here = fix ?? FALLBACK;
  const usingFallback = !fix;

  const nearby = useMemo(
    () => nearbyStops(here, bundle.data?.stops, 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bundle.data, here.lat, here.lng],
  );

  const stopCards = useMemo(
    () =>
      buildStopCards({
        nearby,
        arrivals: rt.data?.arrivals ?? [],
        vehicles: rt.data?.vehicles ?? [],
        routes: bundle.data?.routes ?? {},
        riderConfirmedAge: rt.riderConfirmedAge,
      }),
    [nearby, rt.data, rt.riderConfirmedAge, bundle.data],
  );

  const liveCount = rt.data?.vehicles.length ?? 0;
  const onTimePct = useMemo(() => onTimePercent(rt.data?.arrivals ?? []), [rt.data]);

  const searchResults = useMemo(() => {
    if (!bundle.data || !searchQuery.trim()) return [];
    return searchAll(searchQuery, {
      routes: Object.entries(bundle.data.routes).map(([id, r]) => ({
        id,
        short: r.short,
        long: r.long,
        // Route ids are agency-prefixed ("NPT:157"); the prefix is what the
        // shared ranker uses to float the rider's own city to the top.
        agency: id.includes(":") ? id.split(":")[0]! : "",
      })),
      stops: bundle.data.stops.map((s) => ({ id: s.id, name: s.name, agency: s.agency })),
      airports: CY_AIRPORTS.map((a) => ({ ...a })),
      vehicles: (rt.data?.vehicles ?? []).map((v) => ({
        id: v.id,
        tripId: v.tripId,
        routeId: v.routeId,
        label: v.label ?? "",
        lat: v.lat,
        lng: v.lng,
      })),
      origin: here,
      labels: { kmAway: (km: number) => `${km.toFixed(1)} km away` },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle.data, searchQuery, rt.data, here.lat, here.lng]);

  const mapMarkers = useMemo(
    () =>
      nearby.map((s) => ({
        lat: s.lat,
        lng: s.lng,
        label: s.code || s.name,
        tone: "aegean" as const,
        kind: "stop" as const,
      })),
    [nearby],
  );
  const area = areaFromStop(nearby[0]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([rt.refetch(), bundle.refetch()]);
    setRefreshing(false);
  }, [rt, bundle]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.limestone }}
      contentContainerStyle={{
        paddingTop: insets.top + 10,
        paddingBottom: insets.bottom + 34,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.aegeanDeep} />
      }
    >
      <HomeHeader here={fix ? { lat: fix.lat, lng: fix.lng } : null} />

      <View style={styles.heroWrap}>
        <Text style={styles.heroTitle}>
          {timeOfDayGreeting()}.{"\n"}
          <Text style={styles.heroItalic}>Where to in {area}?</Text>
        </Text>
      </View>

      <HomeSearchBar value={searchQuery} onChange={setSearchQuery} results={searchResults} />

      <AreaChips stops={nearby.slice(0, 4)} />

      <HomeMapBand
        center={here}
        markers={mapMarkers}
        userLocation={fix ? { lat: fix.lat, lng: fix.lng } : null}
        area={area}
        usingFallback={usingFallback}
      />

      <QuickStats liveBuses={liveCount} onTimePct={onTimePct} nextRideMin={stopCards[0]?.etaMin ?? null} />

      <ReturnTripSuggestionCard here={fix ? { lat: fix.lat, lng: fix.lng } : null} />

      <CommuteSuggestionCard />

      <AskAloyaCard />

      <NearbyStops stops={stopCards} loading={bundle.isLoading} locationStatus={status} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heroWrap: { paddingHorizontal: 22, marginTop: 24 },
  heroTitle: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 40,
    lineHeight: 43,
    color: palette.ink,
  },
  heroItalic: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontStyle: "italic",
    color: palette.oliveSoft,
  },
});
