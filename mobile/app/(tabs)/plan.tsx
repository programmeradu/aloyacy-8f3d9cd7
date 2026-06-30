import { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueries, useQuery, keepPreviousData } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

import { palette } from "@/constants/theme";
import { useGeoFix, useRealtime } from "@/lib/hooks";
import { fetchPlan, type PlanResult, type Itinerary, type Leg } from "@/lib/plan";
import {
  fetchBikeShare,
  fetchBoltScooter,
  fetchLastMileChain,
} from "@/lib/wave3";
import { fetchParkAndRide } from "@/lib/pnr";
import { fetchKapnos } from "@/lib/kapnos";
import { fetchDustAdvisory } from "@/lib/dust";

import { ItineraryCard } from "@/components/ItineraryCard";
import {
  BikeShareCardMobile,
  BoltScooterCardMobile,
  LastMileChainCardMobile,
} from "@/components/AltModeCards";
import { ParkAndRideCardMobile } from "@/components/ParkAndRideCardMobile";
import { KapnosShuttleCardMobile } from "@/components/KapnosShuttleCardMobile";
import { DustAdvisoryBannerMobile } from "@/components/DustAdvisoryBannerMobile";
import { RemindMeButtonMobile } from "@/components/RemindMeButtonMobile";
import {
  PlacesAutocomplete,
  type PickedPlace,
} from "@/components/PlacesAutocomplete";
import { TimePicker, type TimeIntent } from "@/components/TimePicker";

const FALLBACK_ORIGIN: PickedPlace = {
  lat: 34.679,
  lng: 33.0413,
  label: "Limassol",
};

function intentToUnix(intent: TimeIntent): {
  departAtUnix?: number;
  arriveByUnix?: number;
} {
  if (intent.kind === "leaveBy") {
    return {
      departAtUnix: Math.floor(new Date(intent.iso).getTime() / 1000),
    };
  }
  if (intent.kind === "arriveBy") {
    return {
      arriveByUnix: Math.floor(new Date(intent.iso).getTime() / 1000),
    };
  }
  return {};
}

export default function PlanScreen() {
  const insets = useSafeAreaInsets();
  const { fix } = useGeoFix();
  const { data: rt } = useRealtime();
  const rtTick = rt?.fetchedAt ?? 0;

  const [useCurrent, setUseCurrent] = useState(true);
  const [origin, setOrigin] = useState<PickedPlace | null>(null);
  const [destination, setDestination] = useState<PickedPlace | null>(null);
  const [picking, setPicking] = useState<"origin" | "dest" | null>(null);
  const [timeIntent, setTimeIntent] = useState<TimeIntent>({ kind: "now" });

  const effectiveOrigin: PickedPlace = useCurrent
    ? fix
      ? { lat: fix.lat, lng: fix.lng, label: "Current location" }
      : FALLBACK_ORIGIN
    : (origin ?? FALLBACK_ORIGIN);

  const timeArgs = useMemo(() => intentToUnix(timeIntent), [timeIntent]);
  const canPlan = !!destination;

  // ── Plan query — auto-refreshes every 30s + on realtime tick. ──────────
  const planQuery = useQuery<PlanResult>({
    queryKey: [
      "plan",
      effectiveOrigin.lat,
      effectiveOrigin.lng,
      destination?.lat,
      destination?.lng,
      timeArgs.departAtUnix ?? null,
      timeArgs.arriveByUnix ?? null,
      rtTick,
    ],
    queryFn: () =>
      fetchPlan({
        from: { lat: effectiveOrigin.lat, lng: effectiveOrigin.lng, label: effectiveOrigin.label },
        to: { lat: destination!.lat, lng: destination!.lng, label: destination!.label },
        ...timeArgs,
      }),
    enabled: canPlan,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  const result = planQuery.data ?? null;
  const planning = planQuery.isFetching && !planQuery.data;
  const topItin: Itinerary | null = result?.itineraries[0] ?? null;
  const busOnlySec = topItin?.totalDurationSec ?? null;

  const firstWalkM = useMemo(() => {
    if (!topItin) return null;
    const w = topItin.legs.find((l) => l.kind === "walk");
    return w && w.kind === "walk" ? Math.round(w.distanceMeters) : 0;
  }, [topItin]);

  const finalWalk = useMemo(() => {
    if (!topItin) return null;
    for (let i = topItin.legs.length - 1; i >= 0; i--) {
      const l: Leg = topItin.legs[i];
      if (l.kind === "walk") {
        const hasPriorRide = topItin.legs.slice(0, i).some((p) => p.kind === "ride");
        if (!hasPriorRide) return null;
        return {
          meters: Math.round(l.distanceMeters),
          alight: { lat: l.from.lat, lng: l.from.lng, name: l.from.name },
        };
      }
    }
    return null;
  }, [topItin]);

  // ── Parallel alternates / advisories. ──────────────────────────────────
  const alts = useQueries({
    queries: [
      {
        queryKey: ["pnr", effectiveOrigin, destination, busOnlySec, firstWalkM],
        queryFn: () =>
          fetchParkAndRide({
            from: { lat: effectiveOrigin.lat, lng: effectiveOrigin.lng, label: effectiveOrigin.label },
            to: { lat: destination!.lat, lng: destination!.lng, label: destination!.label },
            busOnlyDurationSec: busOnlySec,
            busOnlyAccessWalkM: firstWalkM,
          }),
        enabled: canPlan && !!result,
        staleTime: 5 * 60_000,
      },
      {
        queryKey: ["kapnos", effectiveOrigin, destination, timeArgs.departAtUnix, timeArgs.arriveByUnix],
        queryFn: () =>
          fetchKapnos({
            from: { lat: effectiveOrigin.lat, lng: effectiveOrigin.lng },
            to: { lat: destination!.lat, lng: destination!.lng },
            afterUnix: timeArgs.departAtUnix,
            beforeUnix: timeArgs.arriveByUnix,
          }),
        enabled: canPlan,
        staleTime: 5 * 60_000,
      },
      {
        queryKey: ["dust", effectiveOrigin.lat, effectiveOrigin.lng],
        queryFn: () =>
          fetchDustAdvisory({ lat: effectiveOrigin.lat, lng: effectiveOrigin.lng }),
        enabled: canPlan,
        staleTime: 10 * 60_000,
      },
      {
        queryKey: ["bike", effectiveOrigin, destination, busOnlySec],
        queryFn: () =>
          fetchBikeShare({
            from: { lat: effectiveOrigin.lat, lng: effectiveOrigin.lng },
            to: { lat: destination!.lat, lng: destination!.lng },
            busOnlyDurationSec: busOnlySec,
          }),
        enabled: canPlan && !!result,
        staleTime: 60_000,
      },
      {
        queryKey: ["bolt", effectiveOrigin, destination, busOnlySec],
        queryFn: () =>
          fetchBoltScooter({
            from: { lat: effectiveOrigin.lat, lng: effectiveOrigin.lng },
            to: { lat: destination!.lat, lng: destination!.lng },
            busOnlyDurationSec: busOnlySec,
          }),
        enabled: canPlan && !!result,
        staleTime: 5 * 60_000,
      },
      {
        queryKey: [
          "chain",
          finalWalk?.alight.lat ?? null,
          finalWalk?.alight.lng ?? null,
          destination,
          topItin?.arrivalUnix ?? null,
        ],
        queryFn: () =>
          fetchLastMileChain({
            alight: finalWalk
              ? { lat: finalWalk.alight.lat, lng: finalWalk.alight.lng, name: finalWalk.alight.name }
              : { lat: destination!.lat, lng: destination!.lng, name: destination!.label },
            destination: { lat: destination!.lat, lng: destination!.lng, name: destination!.label },
            arrivalUnix: topItin?.arrivalUnix ?? null,
            finalWalkMeters: finalWalk?.meters ?? null,
          }),
        enabled: canPlan && !!result && !!finalWalk,
        staleTime: 5 * 60_000,
      },
    ],
  });
  const pnr = alts[0].data ?? null;
  const kapnos = alts[1].data ?? null;
  const dust = alts[2].data ?? null;
  const bike = alts[3].data ?? null;
  const bolt = alts[4].data ?? null;
  const chain = alts[5].data ?? null;

  function handlePicked(slot: "origin" | "dest", place: PickedPlace) {
    if (slot === "origin") {
      setOrigin(place);
      setUseCurrent(false);
    } else {
      setDestination(place);
    }
    setPicking(null);
    Haptics.selectionAsync().catch(() => {});
  }

  function resetOriginToCurrent() {
    Haptics.selectionAsync().catch(() => {});
    setUseCurrent(true);
    setOrigin(null);
    setPicking(null);
  }

  const feedFresh = !rt?.stale;

  return (
    <View style={{ flex: 1, backgroundColor: palette.limestone }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: 40,
        }}
        refreshControl={
          <RefreshControl
            refreshing={planQuery.isRefetching}
            onRefresh={() => {
              Haptics.selectionAsync().catch(() => {});
              planQuery.refetch();
            }}
            tintColor={palette.aegean}
          />
        }
      >
        {/* ── Title ──────────────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 20, gap: 4 }}>
          <Text
            style={{
              fontFamily: "BricolageGrotesque_800ExtraBold",
              fontSize: 32,
              color: palette.ink,
              letterSpacing: -0.8,
            }}
          >
            Plan a trip
          </Text>
          <Text
            style={{
              fontFamily: "Geist_500Medium",
              color: palette.inkSoft,
              fontSize: 13,
            }}
          >
            Live buses, real walking times, honest changes.
          </Text>
          <Text
            style={{
              fontFamily: "JetBrainsMono_500Medium",
              fontSize: 10,
              color: feedFresh ? palette.aegeanDeep : palette.ochre,
              letterSpacing: 0.5,
              marginTop: 6,
            }}
          >
            {feedFresh ? "LIVE · REPLANS EVERY 30S" : "FEED STALE"}
          </Text>
        </View>

        {/* ── From / To card ─────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
          <View
            style={{
              backgroundColor: palette.white,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: palette.line,
              padding: 4,
            }}
          >
            <Pressable
              onPress={() => {
                if (useCurrent) {
                  setPicking("origin");
                } else {
                  resetOriginToCurrent();
                }
              }}
              onLongPress={() => setPicking("origin")}
              style={({ pressed }) => ({
                paddingVertical: 14,
                paddingHorizontal: 14,
                borderRadius: 14,
                backgroundColor: useCurrent ? palette.aegeanSoft : "transparent",
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: "JetBrainsMono_500Medium",
                  fontSize: 10,
                  color: palette.inkSoft,
                  letterSpacing: 0.5,
                }}
              >
                FROM
              </Text>
              <Text
                style={{
                  fontFamily: "Geist_600SemiBold",
                  color: palette.ink,
                  fontSize: 15,
                  marginTop: 2,
                }}
                numberOfLines={1}
              >
                {useCurrent
                  ? fix
                    ? "Current location"
                    : "Limassol (set location in More)"
                  : (origin?.label ?? "Pick a starting point")}
              </Text>
              <Text
                style={{
                  fontFamily: "JetBrainsMono_500Medium",
                  fontSize: 10,
                  color: palette.inkSoft,
                  letterSpacing: 0.4,
                  marginTop: 4,
                }}
              >
                {useCurrent ? "TAP TO CHANGE" : "TAP TO RESET TO CURRENT"}
              </Text>
            </Pressable>

            <View style={{ height: 1, backgroundColor: palette.line, marginHorizontal: 14 }} />

            <Pressable
              onPress={() => setPicking("dest")}
              style={({ pressed }) => ({
                paddingVertical: 14,
                paddingHorizontal: 14,
                borderRadius: 14,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: "JetBrainsMono_500Medium",
                  fontSize: 10,
                  color: palette.inkSoft,
                  letterSpacing: 0.5,
                }}
              >
                TO
              </Text>
              <Text
                style={{
                  fontFamily: "Geist_600SemiBold",
                  color: destination ? palette.ink : palette.inkSoft,
                  fontSize: 15,
                  marginTop: 2,
                }}
                numberOfLines={1}
              >
                {destination?.label ?? "Pick a destination"}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ── Autocomplete sheet (inline) ────────────────────────────── */}
        {picking && (
          <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
            <PlacesAutocomplete
              label={picking === "origin" ? "FROM" : "TO"}
              placeholder={
                picking === "origin"
                  ? "Search a place, address or landmark"
                  : "Where are you heading?"
              }
              bias={fix ? { lat: fix.lat, lng: fix.lng } : undefined}
              onPick={(p) => handlePicked(picking, p)}
              onClose={() => setPicking(null)}
            />
          </View>
        )}

        {/* ── Time picker ────────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <Text
            style={{
              fontFamily: "JetBrainsMono_500Medium",
              fontSize: 10,
              color: palette.inkSoft,
              letterSpacing: 0.5,
              marginBottom: 8,
            }}
          >
            WHEN
          </Text>
          <TimePicker value={timeIntent} onChange={setTimeIntent} />
        </View>

        {/* ── Dust advisory (origin air quality) ─────────────────────── */}
        {dust && (
          <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
            <DustAdvisoryBannerMobile advisory={dust} />
          </View>
        )}

        {/* ── Empty state ────────────────────────────────────────────── */}
        {!canPlan && (
          <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
            <Text
              style={{
                fontFamily: "Geist_500Medium",
                color: palette.inkSoft,
                fontSize: 14,
                lineHeight: 21,
              }}
            >
              Pick a destination to see honest options. We'll fold in live buses,
              real walking times, the Park & Ride hub when traffic justifies it,
              and Kapnos coaches if the airport is involved.
            </Text>
          </View>
        )}

        {/* ── Planning indicator ─────────────────────────────────────── */}
        {planning && (
          <View
            style={{
              paddingHorizontal: 20,
              marginTop: 22,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <ActivityIndicator color={palette.aegean} />
            <Text
              style={{
                fontFamily: "JetBrainsMono_500Medium",
                color: palette.inkSoft,
                fontSize: 11,
                letterSpacing: 0.5,
              }}
            >
              PLANNING…
            </Text>
          </View>
        )}

        {/* ── Plan error ─────────────────────────────────────────────── */}
        {planQuery.isError && (
          <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
            <Text
              style={{
                fontFamily: "Geist_500Medium",
                color: palette.ochre,
                fontSize: 13,
              }}
            >
              Couldn't reach the planner. Pull down to try again.
            </Text>
          </View>
        )}

        {/* ── Itineraries ────────────────────────────────────────────── */}
        {result && (
          <View style={{ paddingHorizontal: 20, marginTop: 22, gap: 12 }}>
            <Text
              style={{
                fontFamily: "JetBrainsMono_500Medium",
                color: palette.inkSoft,
                fontSize: 11,
                letterSpacing: 0.4,
              }}
            >
              {result.itineraries.length
                ? `${result.itineraries.length} OPTION${result.itineraries.length === 1 ? "" : "S"} · ${result.mode.toUpperCase()}`
                : "NO OPTIONS"}
            </Text>
            {result.itineraries.length === 0 ? (
              <Text
                style={{
                  fontFamily: "Geist_500Medium",
                  color: palette.inkSoft,
                  fontSize: 14,
                  lineHeight: 21,
                }}
              >
                No honest options between these two points right now. Try a
                nearer place, a different time, or change the destination.
              </Text>
            ) : (
              result.itineraries.map((it, idx) => (
                <View key={it.id} style={{ gap: 10 }}>
                  <ItineraryCard itinerary={it} />
                  {idx === 0 && destination && (
                    <RemindMeButtonMobile
                      itinerary={it}
                      origin={effectiveOrigin}
                      destination={destination}
                    />
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* ── Park & Ride ────────────────────────────────────────────── */}
        {pnr && result && (
          <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
            <ParkAndRideCardMobile
              suggestion={pnr}
              origin={{ lat: effectiveOrigin.lat, lng: effectiveOrigin.lng }}
            />
          </View>
        )}

        {/* ── Kapnos coach ───────────────────────────────────────────── */}
        {kapnos && (
          <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
            <KapnosShuttleCardMobile suggestion={kapnos} />
          </View>
        )}

        {/* ── Other ways (bike / scooter / chain) ────────────────────── */}
        {result && (bike || bolt || chain) && (
          <View style={{ paddingHorizontal: 20, marginTop: 24, gap: 12 }}>
            <Text
              style={{
                fontFamily: "JetBrainsMono_500Medium",
                color: palette.inkSoft,
                fontSize: 11,
                letterSpacing: 0.4,
              }}
            >
              OTHER WAYS
            </Text>
            {bike && <BikeShareCardMobile s={bike} />}
            {bolt && <BoltScooterCardMobile s={bolt} />}
            {chain && <LastMileChainCardMobile s={chain} />}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
