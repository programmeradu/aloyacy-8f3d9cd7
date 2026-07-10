import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  intentToUnix,
  originFieldValue,
  parseResolvedHandoff,
  parseSeedHandoff,
  resolveOrigin,
  type PlanPlace,
  type PlanTimeIntent,
} from "@aloya/core/plan-intent";

import { palette } from "@/constants/theme";
import { useGeoFix, useRealtime } from "@/lib/hooks";
import { fetchPlan, type PlanResult, type Itinerary } from "@/lib/plan";
import { startItinerary } from "@/lib/itineraryToTrip";
import { usePlanQueries } from "@/lib/usePlanQueries";

import { DustAdvisoryBannerMobile } from "@/components/DustAdvisoryBannerMobile";
import { PlacesAutocomplete, type PickedPlace } from "@/components/PlacesAutocomplete";
import { TimePicker } from "@/components/TimePicker";
import { PlanHero } from "@/components/plan/PlanHero";
import { RouteForm } from "@/components/plan/RouteForm";
import {
  PlanEmptyState,
  PlanErrorNotice,
  PlanResults,
  PlanningIndicator,
} from "@/components/plan/PlanResults";
import { PlanExtras } from "@/components/plan/PlanExtras";
import { planStyles } from "@/components/plan/styles";

const FALLBACK_ORIGIN: PickedPlace = { lat: 34.679, lng: 33.0413, label: "Limassol" };

const NL_PLAN_KEY = "aloya:nl-plan";
const NL_SEED_KEY = "aloya:nl-plan-seed";

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
  const [timeIntent, setTimeIntent] = useState<PlanTimeIntent>({ kind: "now" });
  const [locating, setLocating] = useState(false);
  const [manualFix, setManualFix] = useState<{ lat: number; lng: number } | null>(null);
  const [locError, setLocError] = useState<string | null>(null);

  const activeFix = manualFix ?? (fix ? { lat: fix.lat, lng: fix.lng } : null);
  const effectiveOrigin = resolveOrigin({
    useCurrent,
    fix: activeFix,
    picked: origin,
    fallback: FALLBACK_ORIGIN,
  }) as PickedPlace;

  // Hydrate from the "Ask Aloya" home-screen composer: either a fully resolved
  // trip (plan immediately) or raw text (open the picker pre-filled).
  useEffect(() => {
    (async () => {
      try {
        const rich = parseResolvedHandoff(await AsyncStorage.getItem(NL_PLAN_KEY), Date.now());
        if (rich) {
          await AsyncStorage.removeItem(NL_PLAN_KEY);
          setDestination(rich.to as PickedPlace);
          setOrigin((rich.from as PickedPlace | null) ?? null);
          setUseCurrent(!rich.from);
          setTimeIntent(rich.intent);
          setPicking(null);
          return;
        }
        const seed = parseSeedHandoff(await AsyncStorage.getItem(NL_SEED_KEY), Date.now());
        if (!seed) return;
        await AsyncStorage.removeItem(NL_SEED_KEY);
        setPickerSeed(seed.text);
        setPicking("dest");
      } catch {
        // A malformed handoff should never block the planner.
      }
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
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setManualFix({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setUseCurrent(true);
      setOrigin(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      setLocError("Couldn't get a location fix. Try again in a moment.");
    } finally {
      setLocating(false);
    }
  }

  const clock = useMemo(() => intentToUnix(timeIntent), [timeIntent]);
  const canPlan = !!destination;

  // Primary plan query — re-runs every 30s and on each realtime tick.
  const planQuery = useQuery<PlanResult>({
    queryKey: [
      "plan",
      effectiveOrigin.lat,
      effectiveOrigin.lng,
      destination?.lat,
      destination?.lng,
      clock.departAtUnix ?? null,
      clock.arriveByUnix ?? null,
      rtTick,
    ],
    queryFn: () =>
      fetchPlan({
        from: effectiveOrigin,
        to: destination!,
        ...clock,
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

  const alternates = usePlanQueries({
    origin: effectiveOrigin,
    destination,
    topItinerary: topItin,
    hasPlan: !!result,
    clock,
  });

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

  function swapEnds() {
    if (!destination) return;
    Haptics.selectionAsync().catch(() => {});
    const nextOrigin: PickedPlace = { ...destination };
    setOrigin(nextOrigin);
    setUseCurrent(false);
    setDestination({ ...effectiveOrigin });
  }

  function startTrip(chosen: Itinerary, from: PlanPlace, to: PlanPlace) {
    startItinerary(chosen, from, to);
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.limestone }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
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
        <PlanHero feedFresh={!rt?.stale} />

        <RouteForm
          originValue={originFieldValue({
            useCurrent,
            hasFix: !!activeFix,
            hasError: !!locError,
            pickedLabel: origin?.label,
          })}
          originIsPlaceholder={!useCurrent && !origin}
          destinationLabel={destination?.label ?? null}
          locating={locating}
          locError={locError}
          canSwap={!!destination}
          onPickOrigin={() => {
            setPickerSeed("");
            setPicking("origin");
          }}
          onPickDestination={() => {
            setPickerSeed("");
            setPicking("dest");
          }}
          onLocate={locateMe}
          onSwap={swapEnds}
        />

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
              bias={activeFix ?? undefined}
              onPick={(p) => handlePicked(picking, p)}
              onClose={() => setPicking(null)}
            />
          </View>
        )}

        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <Text style={[planStyles.fieldLabel, { letterSpacing: 0.5, marginBottom: 8 }]}>WHEN</Text>
          <TimePicker value={timeIntent} onChange={setTimeIntent} />
        </View>

        {alternates.dust && (
          <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
            <DustAdvisoryBannerMobile advisory={alternates.dust} />
          </View>
        )}

        {!canPlan && <PlanEmptyState />}
        {planning && <PlanningIndicator />}
        {planQuery.isError && <PlanErrorNotice />}

        {result && (
          <PlanResults
            result={result}
            origin={effectiveOrigin}
            destination={destination}
            onStart={(chosen) =>
              destination && startTrip(chosen, effectiveOrigin, destination)
            }
          />
        )}

        <PlanExtras
          alternates={alternates}
          hasPlan={!!result}
          origin={effectiveOrigin}
          destination={destination}
          onStartItinerary={startTrip}
        />
      </ScrollView>
    </View>
  );
}
