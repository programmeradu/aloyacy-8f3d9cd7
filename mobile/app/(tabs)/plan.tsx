import { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueries } from "@tanstack/react-query";
import { palette } from "@/constants/theme";
import {
  BikeShareCardMobile,
  BoltScooterCardMobile,
  LastMileChainCardMobile,
} from "@/components/AltModeCards";
import { fetchBikeShare, fetchBoltScooter, fetchLastMileChain } from "@/lib/wave3";
import { useStopsBundle, useGeoFix } from "@/lib/hooks";
import { distanceMeters, formatDistance } from "@/lib/format";
import { fetchPlan, type PlanResult } from "@/lib/plan";
import { ItineraryCard } from "@/components/ItineraryCard";

type Picked = { lat: number; lng: number; label: string };

// Limassol centre — same fallback the rest of the app uses when geo is denied.
const FALLBACK: Picked = { lat: 34.679, lng: 33.0413, label: "Limassol" };

export default function PlanScreen() {
  const insets = useSafeAreaInsets();
  const { fix } = useGeoFix();
  const bundle = useStopsBundle();
  const [destQuery, setDestQuery] = useState("");
  const [dest, setDest] = useState<Picked | null>(null);
  const [useCurrent, setUseCurrent] = useState(true);
  const [origin, setOrigin] = useState<Picked | null>(null);
  const [picking, setPicking] = useState<"origin" | "dest" | null>(null);

  const candidates = useMemo(() => {
    if (!bundle.data) return [];
    const q = destQuery.trim().toLowerCase();
    if (!q) return [];
    return bundle.data.stops
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [bundle.data, destQuery]);

  const effectiveOrigin: Picked = useCurrent
    ? fix
      ? { lat: fix.lat, lng: fix.lng, label: "Current location" }
      : FALLBACK
    : origin ?? FALLBACK;

  const plan = useMutation({
    mutationFn: (args: { from: Picked; to: Picked }) =>
      fetchPlan({
        from: { lat: args.from.lat, lng: args.from.lng, label: args.from.label },
        to: { lat: args.to.lat, lng: args.to.lng, label: args.to.label },
      }),
  });

  const result: PlanResult | undefined = plan.data;

  // ── Wave 3 alternates ──────────────────────────────────────────────────
  // Fire bike / scooter / chain in parallel once we have a plan to
  // contrast against. Each fetcher returns `null` (not an error) when no
  // honest suggestion exists, so the cards simply don't render.
  const topItin = result?.itineraries?.[0];
  const busOnlySec = topItin?.totalDurationSec ?? null;
  const lastRide = useMemo(() => {
    if (!topItin) return null;
    for (let i = topItin.legs.length - 1; i >= 0; i -= 1) {
      const leg = topItin.legs[i];
      if (leg.kind === "ride") return leg;
    }
    return null;
  }, [topItin]);
  const finalWalkMeters = useMemo(() => {
    if (!topItin) return null;
    const last = topItin.legs[topItin.legs.length - 1];
    return last && last.kind === "walk" ? last.distanceMeters : null;
  }, [topItin]);

  const altsEnabled = !!result && !!dest;
  const alts = useQueries({
    queries: [
      {
        queryKey: ["bike-share", effectiveOrigin, dest, busOnlySec],
        queryFn: () =>
          fetchBikeShare({
            from: { lat: effectiveOrigin.lat, lng: effectiveOrigin.lng },
            to: { lat: dest!.lat, lng: dest!.lng },
            busOnlyDurationSec: busOnlySec,
          }),
        enabled: altsEnabled,
        staleTime: 5 * 60_000,
      },
      {
        queryKey: ["bolt-scooter", effectiveOrigin, dest, busOnlySec],
        queryFn: () =>
          fetchBoltScooter({
            from: { lat: effectiveOrigin.lat, lng: effectiveOrigin.lng },
            to: { lat: dest!.lat, lng: dest!.lng },
            busOnlyDurationSec: busOnlySec,
          }),
        enabled: altsEnabled,
        staleTime: 5 * 60_000,
      },
      {
        queryKey: [
          "last-mile-chain",
          lastRide?.alight.stopId ?? "none",
          dest,
          topItin?.arrivalUnix ?? null,
        ],
        queryFn: () =>
          fetchLastMileChain({
            alight: lastRide
              ? {
                  lat: lastRide.alight.lat,
                  lng: lastRide.alight.lng,
                  name: lastRide.alight.name,
                }
              : { lat: dest!.lat, lng: dest!.lng, name: dest!.label },
            destination: { lat: dest!.lat, lng: dest!.lng, name: dest!.label },
            arrivalUnix: topItin?.arrivalUnix ?? null,
            finalWalkMeters,
          }),
        enabled: altsEnabled && !!lastRide,
        staleTime: 5 * 60_000,
      },
    ],
  });
  const bikeSuggestion = alts[0].data ?? null;
  const scooterSuggestion = alts[1].data ?? null;
  const chainSuggestion = alts[2].data ?? null;



  return (
    <View style={{ flex: 1, backgroundColor: palette.limestone }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: 40,
        }}
      >
        <View style={{ paddingHorizontal: 20 }}>
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
              marginTop: 4,
            }}
          >
            Live buses, real walking times, honest changes.
          </Text>

          <View
            style={{
              marginTop: 20,
              backgroundColor: palette.white,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: palette.line,
              padding: 4,
            }}
          >
            <Pressable
              onPress={() => {
                setUseCurrent(true);
                setOrigin(null);
                setPicking(null);
              }}
              style={({ pressed }) => ({
                paddingVertical: 14,
                paddingHorizontal: 14,
                borderRadius: 14,
                backgroundColor: useCurrent ? palette.aegeanSoft : "transparent",
                opacity: pressed ? 0.7 : 1,
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
              >
                {useCurrent
                  ? fix
                    ? "Current location"
                    : "Limassol (set location in More)"
                  : origin?.label ?? "Pick a starting stop"}
              </Text>
            </Pressable>

            <View style={{ height: 1, backgroundColor: palette.line, marginHorizontal: 14 }} />

            <Pressable
              onPress={() => setPicking("dest")}
              style={({ pressed }) => ({
                paddingVertical: 14,
                paddingHorizontal: 14,
                borderRadius: 14,
                opacity: pressed ? 0.7 : 1,
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
                  color: dest ? palette.ink : palette.inkSoft,
                  fontSize: 15,
                  marginTop: 2,
                }}
                numberOfLines={1}
              >
                {dest?.label ?? "Pick a destination stop"}
              </Text>
            </Pressable>
          </View>

          {picking && (
            <View style={{ marginTop: 14 }}>
              <TextInput
                value={destQuery}
                onChangeText={setDestQuery}
                placeholder="Search stops"
                placeholderTextColor={palette.inkSoft}
                autoFocus
                autoCorrect={false}
                style={{
                  backgroundColor: palette.white,
                  borderWidth: 1,
                  borderColor: palette.line,
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  fontFamily: "Geist_500Medium",
                  color: palette.ink,
                }}
              />
              {candidates.length > 0 && (
                <View
                  style={{
                    marginTop: 8,
                    backgroundColor: palette.white,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: palette.line,
                    overflow: "hidden",
                  }}
                >
                  {candidates.map((s) => (
                    <Pressable
                      key={s.id}
                      onPress={() => {
                        const picked: Picked = { lat: s.lat, lng: s.lng, label: s.name };
                        if (picking === "origin") {
                          setOrigin(picked);
                          setUseCurrent(false);
                        } else {
                          setDest(picked);
                        }
                        setPicking(null);
                        setDestQuery("");
                        Keyboard.dismiss();
                      }}
                      style={({ pressed }) => ({
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        borderBottomWidth: 1,
                        borderBottomColor: palette.line,
                        opacity: pressed ? 0.6 : 1,
                      })}
                    >
                      <Text
                        style={{ fontFamily: "Geist_600SemiBold", color: palette.ink, fontSize: 14 }}
                        numberOfLines={1}
                      >
                        {s.name}
                      </Text>
                      <Text
                        style={{
                          fontFamily: "JetBrainsMono_500Medium",
                          color: palette.inkSoft,
                          fontSize: 11,
                          marginTop: 2,
                        }}
                      >
                        {s.agency} · stop {s.code}
                        {fix
                          ? ` · ${formatDistance(distanceMeters(fix, s))}`
                          : ""}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}

          <Pressable
            disabled={!dest || plan.isPending}
            onPress={() => {
              if (!dest) return;
              Keyboard.dismiss();
              plan.mutate({ from: effectiveOrigin, to: dest });
            }}
            style={({ pressed }) => ({
              marginTop: 18,
              backgroundColor: dest ? palette.ink : palette.line,
              borderRadius: 16,
              paddingVertical: 16,
              alignItems: "center",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            {plan.isPending ? (
              <ActivityIndicator color={palette.white} />
            ) : (
              <Text
                style={{
                  fontFamily: "Geist_700Bold",
                  color: palette.white,
                  fontSize: 15,
                  letterSpacing: 0.3,
                }}
              >
                Find routes
              </Text>
            )}
          </Pressable>
        </View>

        {plan.isError && (
          <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            <Text style={{ fontFamily: "Geist_500Medium", color: palette.ochre }}>
              Couldn’t reach the planner. Pull down to try again.
            </Text>
          </View>
        )}

        {result && (
          <View style={{ paddingHorizontal: 20, paddingTop: 22, gap: 12 }}>
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
                  lineHeight: 22,
                }}
              >
                No honest options between these two points right now. Try a
                nearer stop, a different time, or a stop on a known route.
              </Text>
            ) : (
              result.itineraries.map((it) => (
                <ItineraryCard key={it.id} itinerary={it} />
              ))
            )}
          </View>
        )}

        {result && (bikeSuggestion || scooterSuggestion || chainSuggestion) && (
          <View style={{ paddingHorizontal: 20, paddingTop: 24, gap: 12 }}>
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
            {bikeSuggestion && <BikeShareCardMobile s={bikeSuggestion} />}
            {scooterSuggestion && <BoltScooterCardMobile s={scooterSuggestion} />}
            {chainSuggestion && <LastMileChainCardMobile s={chainSuggestion} />}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
