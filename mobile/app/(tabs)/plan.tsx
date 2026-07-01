import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Image,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueries, useQuery, keepPreviousData } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Circle, Path } from "react-native-svg";

import { palette } from "@/constants/theme";
import { assets } from "@/lib/assets";
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
import { startItinerary } from "@/lib/itineraryToTrip";
import {
  BikeShareCardMobile,
  BoltScooterCardMobile,
  LastMileChainCardMobile,
} from "@/components/AltModeCards";
import { ParkAndRideCardMobile } from "@/components/ParkAndRideCardMobile";
import { KapnosShuttleCardMobile } from "@/components/KapnosShuttleCardMobile";
import { DustAdvisoryBannerMobile } from "@/components/DustAdvisoryBannerMobile";
import { RemindMeButtonMobile } from "@/components/RemindMeButtonMobile";
import { SharePlanButtonMobile } from "@/components/SharePlanButtonMobile";
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
  const [pickerSeed, setPickerSeed] = useState("");
  const [timeIntent, setTimeIntent] = useState<TimeIntent>({ kind: "now" });
  const [locating, setLocating] = useState(false);
  const [manualFix, setManualFix] = useState<{ lat: number; lng: number } | null>(null);
  const [locError, setLocError] = useState<string | null>(null);

  const activeFix = manualFix ?? (fix ? { lat: fix.lat, lng: fix.lng } : null);

  const effectiveOrigin: PickedPlace = useCurrent
    ? activeFix
      ? { lat: activeFix.lat, lng: activeFix.lng, label: "Current location" }
      : FALLBACK_ORIGIN
    : (origin ?? FALLBACK_ORIGIN);

  // Hydrate from the "Ask Aloya" home-screen composer. Two seed shapes:
  //   • `aloya:nl-plan` — fully resolved trip (from/to/times); apply and
  //     let the planner run immediately.
  //   • `aloya:nl-plan-seed` — raw text fallback when parsing failed;
  //     open the destination picker pre-filled so the rider can adjust.
  useEffect(() => {
    (async () => {
      try {
        const rich = await AsyncStorage.getItem("aloya:nl-plan");
        if (rich) {
          const parsed = JSON.parse(rich) as {
            from?: { lat: number; lng: number; label: string } | null;
            to?: { lat: number; lng: number; label: string };
            leaveByISO?: string | null;
            arriveByISO?: string | null;
            at?: number;
          };
          await AsyncStorage.removeItem("aloya:nl-plan");
          if (parsed?.to && parsed?.at && Date.now() - parsed.at < 60_000) {
            setDestination(parsed.to);
            if (parsed.from) {
              setOrigin(parsed.from);
              setUseCurrent(false);
            } else {
              setUseCurrent(true);
              setOrigin(null);
            }
            if (parsed.leaveByISO) setTimeIntent({ kind: "leaveBy", iso: parsed.leaveByISO });
            else if (parsed.arriveByISO) setTimeIntent({ kind: "arriveBy", iso: parsed.arriveByISO });
            else setTimeIntent({ kind: "now" });
            setPicking(null);
            return;
          }
        }
        const raw = await AsyncStorage.getItem("aloya:nl-plan-seed");
        if (!raw) return;
        const parsed = JSON.parse(raw) as { text?: string; at?: number };
        if (!parsed?.text || !parsed?.at || Date.now() - parsed.at > 60_000) return;
        await AsyncStorage.removeItem("aloya:nl-plan-seed");
        setPickerSeed(parsed.text);
        setPicking("dest");
      } catch {}
    })();
  }, []);


  async function locateMe() {
    if (locating) return;
    setLocating(true);
    setLocError(null);
    Haptics.selectionAsync().catch(() => {});
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocError("Location permission denied. Enable it in Settings to auto-locate.");
        setLocating(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setManualFix({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setUseCurrent(true);
      setOrigin(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      setLocError("Couldn't get a location fix. Try again in a moment.");
    } finally {
      setLocating(false);
    }
  }

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
        {/* ── Editorial hero ─────────────────────────────────────────── */}
        <View style={planStyles.hero}>
          <Image source={assets.plan_hero} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <View style={planStyles.heroWash} />
          <View style={planStyles.heroContent}>
            <Text style={planStyles.heroKicker}>PLAN A TRIP</Text>
            <Text style={planStyles.heroTitle}>Honest routes,{"\n"}live buses.</Text>
            <Text style={planStyles.heroSub}>
              Real walking times, real transfers, no filler.
            </Text>
            <View style={planStyles.heroBadge}>
              <View style={[planStyles.dot, { backgroundColor: feedFresh ? palette.aegeanDeep : palette.ochre }]} />
              <Text style={planStyles.heroBadgeText}>
                {feedFresh ? "LIVE · REPLANS EVERY 30S" : "FEED STALE"}
              </Text>
            </View>
          </View>
        </View>

        {/* ── From / To form ─────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
          <View style={planStyles.formCard}>
            <FieldRow
              icon={
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Circle cx={12} cy={12} r={5} fill={palette.aegeanDeep} />
                  <Circle cx={12} cy={12} r={10.5} stroke={palette.aegeanDeep} strokeOpacity={0.35} strokeWidth={1.5} />
                </Svg>
              }
              label="FROM"
              value={
                useCurrent
                  ? activeFix
                    ? "Current location"
                    : locError
                      ? "Location unavailable"
                      : "Tap Locate me to use your position"
                  : (origin?.label ?? "Pick a starting point")
              }
              placeholder={!useCurrent && !origin}
              onPress={() => {
                setPickerSeed("");
                setPicking("origin");
              }}
              accessory={
                <Pressable
                  onPress={locateMe}
                  hitSlop={8}
                  style={({ pressed }) => [planStyles.locateBtn, pressed && { opacity: 0.7 }]}
                >
                  {locating ? (
                    <ActivityIndicator size="small" color={palette.limestone} />
                  ) : (
                    <>
                      <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                        <Path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke={palette.limestone} strokeWidth={2} strokeLinecap="round" />
                        <Circle cx={12} cy={12} r={5} stroke={palette.limestone} strokeWidth={2} />
                        <Circle cx={12} cy={12} r={1.5} fill={palette.limestone} />
                      </Svg>
                      <Text style={planStyles.locateBtnText}>Locate me</Text>
                    </>
                  )}
                </Pressable>
              }
            />

            <View style={planStyles.divider}>
              <View style={planStyles.dividerLine} />
              <Pressable
                onPress={() => {
                  if (!destination) return;
                  Haptics.selectionAsync().catch(() => {});
                  const swappedOrigin: PickedPlace = {
                    lat: destination.lat,
                    lng: destination.lng,
                    label: destination.label,
                  };
                  const swappedDest: PickedPlace = {
                    lat: effectiveOrigin.lat,
                    lng: effectiveOrigin.lng,
                    label: effectiveOrigin.label,
                  };
                  setOrigin(swappedOrigin);
                  setUseCurrent(false);
                  setDestination(swappedDest);
                }}
                hitSlop={8}
                style={({ pressed }) => [planStyles.swapBtn, pressed && { opacity: 0.7 }]}
                accessibilityLabel="Swap origin and destination"
              >
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                  <Path d="M7 4v14m0 0-3-3m3 3 3-3M17 20V6m0 0-3 3m3-3 3 3" stroke={palette.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </Pressable>
              <View style={planStyles.dividerLine} />
            </View>

            <FieldRow
              icon={
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" fill={palette.ochre} />
                  <Circle cx={12} cy={10} r={2.4} fill={palette.limestone} />
                </Svg>
              }
              label="TO"
              value={destination?.label ?? "Where are you heading?"}
              placeholder={!destination}
              onPress={() => {
                setPickerSeed("");
                setPicking("dest");
              }}
            />
          </View>
          {locError && (
            <Text style={planStyles.locErr}>{locError}</Text>
          )}
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
              initialQuery={pickerSeed}
              bias={activeFix ? { lat: activeFix.lat, lng: activeFix.lng } : undefined}
              onPick={(p) => handlePicked(picking, p)}
              onClose={() => setPicking(null)}
            />
          </View>
        )}


        {/* ── Time picker ────────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <Text
            style={{
              fontFamily: "Geist_700Bold",
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
                fontFamily: "Geist_700Bold",
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
                fontFamily: "Geist_700Bold",
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
                  <ItineraryCard
                    itinerary={it}
                    onStart={(chosen) =>
                      destination &&
                      startItinerary(
                        chosen,
                        {
                          lat: effectiveOrigin.lat,
                          lng: effectiveOrigin.lng,
                          label: effectiveOrigin.label,
                        },
                        {
                          lat: destination.lat,
                          lng: destination.lng,
                          label: destination.label,
                        },
                      )
                    }
                  />
                  {idx === 0 && destination && (
                    <RemindMeButtonMobile
                      itinerary={it}
                      origin={effectiveOrigin}
                      destination={destination}
                    />
                  )}
                  {destination && (
                    <SharePlanButtonMobile
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
                fontFamily: "Geist_700Bold",
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

function FieldRow({
  icon,
  label,
  value,
  placeholder,
  onPress,
  accessory,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  placeholder?: boolean;
  onPress: () => void;
  accessory?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [planStyles.field, pressed && { backgroundColor: palette.limestoneSoft }]}
    >
      <View style={planStyles.fieldIcon}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={planStyles.fieldLabel}>{label}</Text>
        <Text
          style={[planStyles.fieldValue, placeholder && { color: palette.inkSoft }]}
          numberOfLines={2}
        >
          {value}
        </Text>
      </View>
      {accessory ?? (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <Path d="m9 6 6 6-6 6" stroke={palette.inkSoft} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      )}
    </Pressable>
  );
}

const planStyles = StyleSheet.create({
  hero: {
    marginHorizontal: 20,
    marginTop: 4,
    height: 200,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: palette.line,
    justifyContent: "flex-end",
  },
  heroWash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(31,30,24,0.35)",
  },
  heroContent: {
    padding: 20,
    gap: 6,
  },
  heroKicker: {
    fontFamily: "Geist_700Bold",
    fontSize: 10,
    letterSpacing: 2.6,
    color: palette.limestone,
    opacity: 0.9,
  },
  heroTitle: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 30,
    lineHeight: 32,
    letterSpacing: -0.8,
    color: palette.limestone,
  },
  heroSub: {
    fontFamily: "Geist_500Medium",
    fontSize: 13,
    color: palette.limestone,
    opacity: 0.85,
  },
  heroBadge: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(246,241,231,0.18)",
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  heroBadgeText: {
    fontFamily: "Geist_700Bold",
    fontSize: 9.5,
    letterSpacing: 1.4,
    color: palette.limestone,
  },
  formCard: {
    backgroundColor: palette.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 6,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  fieldIcon: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.limestoneSoft,
  },
  fieldLabel: {
    fontFamily: "Geist_700Bold",
    fontSize: 9.5,
    letterSpacing: 1.8,
    color: palette.inkSoft,
  },
  fieldValue: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 15.5,
    color: palette.ink,
    marginTop: 3,
    letterSpacing: -0.2,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 14,
    gap: 8,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: palette.line },
  swapBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    alignItems: "center",
    justifyContent: "center",
  },
  locateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: palette.ink,
    minWidth: 92,
    justifyContent: "center",
  },
  locateBtnText: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 11,
    color: palette.limestone,
    letterSpacing: 0.2,
  },
  locErr: {
    marginTop: 10,
    fontFamily: "Geist_500Medium",
    fontSize: 12,
    color: palette.ochre,
  },
});
