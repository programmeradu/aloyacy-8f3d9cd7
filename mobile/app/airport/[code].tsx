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
//   - `useRealtime()` + `smartEtaV2` for the urban departures list, using
//     the exact same trip-dedupe / ≤180-min filter as the stop screen.

import { useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Share,
  Linking,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { palette } from "@/constants/theme";
import { DepartureRow } from "@/components/DepartureRow";
import { MapView, type MapMarker } from "@/components/MapView";
import { useRealtime, useStopsBundle } from "@/lib/hooks";
import { smartEtaV2, type SmartEtaV2 } from "@/lib/eta-v2";
import { getStop } from "@/lib/gtfs";
import {
  fetchAirportPage,
  AIRPORT_STOP,
  type AirportCode,
  type AirportCoachLine,
  type AirportPageData,
} from "@/lib/airport";

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
          riderConfirmedAgeSec: rt.riderConfirmedAge.get(a.tripId),
        });
        return { ...a, eta };
      })
      .filter(
        (d): d is typeof d & { eta: SmartEtaV2 } =>
          d.eta != null && d.eta.etaMin <= 180,
      )
      .slice(0, 8);
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

  if (!valid) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: palette.limestone }}
        contentContainerStyle={{
          paddingTop: insets.top + 40,
          paddingHorizontal: 24,
        }}
      >
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 10,
            letterSpacing: 2.4,
            color: palette.aegeanDeep,
            textTransform: "uppercase",
          }}
        >
          Not in Cyprus
        </Text>
        <Text
          style={{
            marginTop: 12,
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 30,
            lineHeight: 34,
            letterSpacing: -0.8,
            color: palette.ink,
          }}
        >
          No airport page for “{code}”.
        </Text>
        <Pressable
          onPress={() => router.replace("/airport/lca")}
          style={{
            marginTop: 20,
            alignSelf: "flex-start",
            backgroundColor: palette.ink,
            borderRadius: 999,
            paddingVertical: 10,
            paddingHorizontal: 18,
          }}
        >
          <Text
            style={{
              fontFamily: "Geist_600SemiBold",
              fontSize: 13,
              color: palette.limestone,
            }}
          >
            Larnaca (LCA)
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  const data = page.data;
  const airportName =
    data?.airport.name ?? (normalized === "lca" ? "Larnaca Airport" : "Paphos Airport");
  const airportIata = normalized.toUpperCase();
  const airportLat = data?.airport.lat ?? (stop?.lat ?? 34.8751);
  const airportLng = data?.airport.lng ?? (stop?.lng ?? 33.6249);
  const coachLines = data?.coachLines ?? [];
  const stale = rt.data?.stale === true;
  const ghostFirst =
    departures.length > 0 && departures[0].eta.tier === "ghost";
  const totalCount = coachLines.length + departures.length;

  const onShare = () => {
    Haptics.selectionAsync().catch(() => {});
    Share.share({
      title: `${airportName} — Aloya`,
      message: `${airportName} (${airportIata}) live coaches and buses — https://app.aloya.cy/airport/${normalized}`,
    }).catch(() => {});
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.limestone }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: 48,
      }}
      refreshControl={
        <RefreshControl
          refreshing={
            (rt.isFetching && !rt.isLoading) ||
            (page.isFetching && !page.isLoading)
          }
          onRefresh={onRefresh}
          tintColor={palette.aegeanDeep}
        />
      }
    >
      <View
        style={{
          paddingHorizontal: 20,
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
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 10,
            letterSpacing: 2.2,
            color: palette.inkSoft,
            textTransform: "uppercase",
          }}
        >
          Airport {airportIata}
        </Text>
        <Pressable
          onPress={onShare}
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
              fontSize: 14,
              color: palette.ink,
            }}
          >
            ↗
          </Text>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 24, marginBottom: 16 }}>
        <Text
          style={{
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 38,
            lineHeight: 42,
            letterSpacing: -1,
            color: palette.ink,
          }}
        >
          {airportName}
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            color: palette.inkSoft,
          }}
        >
          Airport service — {airportLat.toFixed(4)}, {airportLng.toFixed(4)}
        </Text>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <MapView
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
          restrictTripIds={departures.map((d) => d.tripId)}
          fitToContent={false}
        />
      </View>

      {ghostFirst && (
        <View
          style={{
            marginTop: 16,
            marginHorizontal: 20,
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
              fontFamily: "JetBrainsMono_500Medium",
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
            The operator stopped reporting this bus. Showing the scheduled time.
          </Text>
        </View>
      )}

      <View
        style={{
          paddingHorizontal: 24,
          marginTop: 30,
          marginBottom: 14,
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: "JetBrainsMono_500Medium",
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
            fontFamily: "JetBrainsMono_500Medium",
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

      {(rt.isLoading || page.isLoading) && totalCount === 0 ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator color={palette.aegeanDeep} />
        </View>
      ) : totalCount === 0 ? (
        <EmptyState />
      ) : (
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {coachLines.map((line) => (
            <CoachLineCard
              key={`${line.routeId}-${line.destinationCity}`}
              line={line}
            />
          ))}
          {departures.map((d, i) => {
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

      {page.isError && (
        <View
          style={{
            marginTop: 16,
            marginHorizontal: 20,
            padding: 14,
            borderRadius: 16,
            backgroundColor: palette.white,
            borderWidth: 1,
            borderColor: palette.line,
          }}
        >
          <Text
            style={{
              fontFamily: "Geist_500Medium",
              fontSize: 13,
              color: palette.inkSoft,
            }}
          >
            Coach lines temporarily unavailable. Urban departures still live.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function EmptyState() {
  return (
    <View
      style={{
        marginHorizontal: 20,
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
        Coaches and local buses will appear here as they're scheduled.
      </Text>
    </View>
  );
}

// Kapnos intercity coach card — mirrors the web `CoachLineCard` chrome so
// the airport list reads as one continuous departures feed. Boarding stop,
// upcoming departures (with day chip + seats), timetable + book CTAs.
function CoachLineCard({ line }: { line: AirportCoachLine }) {
  const next = line.nextDepartures[0];
  const sold = next ? next.seatsAvailable <= 0 : false;
  return (
    <View
      style={{
        borderRadius: 24,
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: palette.line,
        padding: 18,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontFamily: "JetBrainsMono_500Medium",
              fontSize: 9.5,
              letterSpacing: 2.2,
              textTransform: "uppercase",
              color: palette.aegeanDeep,
            }}
          >
            Direct coach · Kapnos
          </Text>
          <Text
            style={{
              marginTop: 4,
              fontFamily: "BricolageGrotesque_800ExtraBold",
              fontSize: 22,
              lineHeight: 25,
              letterSpacing: -0.5,
              color: palette.ink,
            }}
            numberOfLines={2}
          >
            → {line.destinationCity}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text
            style={{
              fontFamily: "JetBrainsMono_500Medium",
              fontSize: 11,
              letterSpacing: 1.4,
              color: palette.ink,
              fontVariant: ["tabular-nums"],
            }}
          >
            {line.rideMin} min
          </Text>
          {line.priceFrom && (
            <Text
              style={{
                marginTop: 2,
                fontFamily: "JetBrainsMono_500Medium",
                fontSize: 10,
                letterSpacing: 1.2,
                color: palette.inkSoft,
                fontVariant: ["tabular-nums"],
              }}
            >
              from {line.priceFrom}
            </Text>
          )}
        </View>
      </View>

      {line.nextDepartures.length > 0 && (
        <View
          style={{
            marginTop: 14,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: palette.line,
            overflow: "hidden",
          }}
        >
          {line.nextDepartures.slice(0, 3).map((d, i) => {
            const rowSold = d.seatsAvailable <= 0;
            const rowLow = d.seatsAvailable > 0 && d.seatsAvailable <= 8;
            return (
              <View
                key={`${d.tripId}-${d.depart}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: palette.line,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "baseline",
                    gap: 8,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "BricolageGrotesque_700Bold",
                      fontSize: 16,
                      color: palette.ink,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {d.depart}
                  </Text>
                  <Text
                    style={{
                      fontFamily: "JetBrainsMono_500Medium",
                      fontSize: 12,
                      color: palette.inkSoft,
                    }}
                  >
                    →
                  </Text>
                  <Text
                    style={{
                      fontFamily: "JetBrainsMono_500Medium",
                      fontSize: 12,
                      color: palette.ink,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {d.arrive}
                  </Text>
                  {d.dayChip ? (
                    <Text
                      style={{
                        fontFamily: "JetBrainsMono_500Medium",
                        fontSize: 9,
                        letterSpacing: 1.6,
                        textTransform: "uppercase",
                        color: palette.ochre,
                      }}
                    >
                      {d.dayChip}
                    </Text>
                  ) : null}
                </View>
                <Text
                  style={{
                    fontFamily: "JetBrainsMono_500Medium",
                    fontSize: 9.5,
                    letterSpacing: 1.6,
                    textTransform: "uppercase",
                    color: rowSold
                      ? "#a53d2b"
                      : rowLow
                        ? palette.ochre
                        : palette.inkSoft,
                  }}
                >
                  {rowSold ? "Sold out" : `${d.seatsAvailable} seats`}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <Text
        style={{
          marginTop: 14,
          fontFamily: "Geist_500Medium",
          fontSize: 12,
          color: palette.inkSoft,
        }}
        numberOfLines={2}
      >
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 9.5,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            color: "rgba(31,30,24,0.45)",
          }}
        >
          Boards at:{" "}
        </Text>
        {line.pickupName}
      </Text>

      <View
        style={{
          marginTop: 14,
          flexDirection: "row",
          gap: 8,
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={() =>
            Linking.openURL("https://kapnosairportshuttle.com/timetables")
          }
          style={({ pressed }) => ({
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 8,
            backgroundColor: palette.white,
            borderWidth: 1,
            borderColor: palette.line,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: "Geist_600SemiBold",
              fontSize: 12,
              color: palette.ink,
            }}
          >
            Times
          </Text>
        </Pressable>
        <Pressable
          disabled={sold}
          onPress={() =>
            Linking.openURL("https://kapnosairportshuttle.com/")
          }
          style={({ pressed }) => ({
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 8,
            backgroundColor: sold ? palette.white : palette.ink,
            borderWidth: 1,
            borderColor: sold ? palette.line : palette.ink,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: "Geist_600SemiBold",
              fontSize: 12,
              color: sold ? "rgba(31,30,24,0.4)" : palette.limestone,
            }}
          >
            Book
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
