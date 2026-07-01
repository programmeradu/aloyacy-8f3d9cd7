// Trip-info — mobile parity rewire of `src/routes/trip-info.$tripId.tsx`.
//
// Mirrors the web data model 1:1:
//   - sort arrivals for the trip ascending
//   - find the next un-served stop (nextIdx)
//   - mark passed / next / upcoming
//   - derive on-time / late / early / done status from delay
// And renders the same editorial composition in native form:
//   - back chevron + live chip
//   - route chip + bus label + long name + meta line
//   - MapView restricted to this trip's vehicles, with route's stops as
//     tone-tagged markers (highlight stop → ink, next → ochre,
//     passed → olive, upcoming → aegean)
//   - NextStopCard + EtaCard + StatusCard composite
//   - editorial timeline of every stop, tappable into stop detail
//
// Native enhancements layered on top:
//   - haptic feedback on stop press
//   - pull-to-refresh into useRealtime
//   - safe-area aware padding
//
// Highlight stop comes from optional `?from=<stopId>` deep-link param so
// flowing in from stop screen anchors the rider on their boarding stop.

import { useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { palette } from "@/constants/theme";
import { useRealtime, useStopsBundle } from "@/lib/hooks";
import { getStop } from "@/lib/gtfs";
import { MapView, type MapMarker } from "@/components/MapView";
import { ExpandableMap } from "@/components/ExpandableMap";
import { RouteChip } from "@/components/RouteChip";

function fmtClock(unix: number) {
  const d = new Date(unix * 1000);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export default function TripInfoScreen() {
  const { tripId, from } = useLocalSearchParams<{ tripId: string; from?: string }>();
  const highlightStopId = typeof from === "string" ? from : undefined;
  const insets = useSafeAreaInsets();
  const rt = useRealtime();
  const bundle = useStopsBundle();

  const trip = useMemo(() => {
    if (!rt.data) return null;
    const arrivals = rt.data.arrivals
      .filter((a) => a.tripId === tripId)
      .sort((a, b) => a.arrivalUnix - b.arrivalUnix);
    if (arrivals.length === 0) return null;
    const routeId = arrivals[0].routeId;
    const route = bundle.data?.routes?.[routeId];
    const vehicle = rt.data.vehicles.find((v) => v.tripId === tripId);
    const now = Math.floor(Date.now() / 1000);
    const nextIdx = arrivals.findIndex((a) => a.arrivalUnix >= now - 30);
    const stops = arrivals.map((a, i) => {
      const meta = getStop(a.stopId);
      const passed = nextIdx === -1 ? true : i < nextIdx;
      const next = i === nextIdx;
      return { ...a, meta, passed, next, index: i };
    });
    return { routeId, route, vehicle, stops, nextIdx };
  }, [rt.data, tripId, bundle.data?.routes]);

  const markers: MapMarker[] = useMemo(() => {
    if (!trip) return [];
    return trip.stops
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
  }, [trip, highlightStopId]);

  const totalKm = useMemo(() => {
    if (!trip) return null;
    let km = 0;
    for (let i = 1; i < trip.stops.length; i++) {
      const a = trip.stops[i - 1].meta;
      const b = trip.stops[i].meta;
      if (a && b) km += distanceKm(a, b);
    }
    return km;
  }, [trip]);

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
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: 56,
      }}
      refreshControl={
        <RefreshControl
          refreshing={rt.isFetching && !rt.isLoading}
          onRefresh={onRefresh}
          tintColor={palette.aegeanDeep}
        />
      }
    >
      {/* Header chrome */}
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
          onPress={handleBack}
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
            color: rt.data?.stale ? palette.ochre : palette.aegeanDeep,
            textTransform: "uppercase",
          }}
        >
          {rt.data?.stale ? "Feed stale" : "Live"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {!trip ? (
        <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
          <Text
            style={{
              fontFamily: "BricolageGrotesque_800ExtraBold",
              fontSize: 34,
              lineHeight: 38,
              letterSpacing: -0.8,
              color: palette.ink,
            }}
          >
            {rt.isLoading ? "Loading trip…" : "Trip not live"}
          </Text>
          <Text
            style={{
              marginTop: 10,
              fontFamily: "Geist_500Medium",
              fontSize: 13,
              lineHeight: 20,
              color: palette.inkSoft,
            }}
          >
            We can't find this trip in the live feed. It may have finished or be
            between scheduled runs. Pull to refresh or head back to your stop.
          </Text>
          {rt.isLoading && (
            <View style={{ paddingVertical: 32, alignItems: "center" }}>
              <ActivityIndicator color={palette.aegeanDeep} />
            </View>
          )}
        </View>
      ) : (
        <>
          {/* Route hero */}
          <View style={{ paddingHorizontal: 20, marginBottom: 18 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <RouteChip short={trip.route?.short ?? "?"} color={trip.route?.color} />
              <Text
                style={{
                  fontFamily: "Geist_700Bold",
                  fontSize: 10,
                  letterSpacing: 2.2,
                  color: palette.inkSoft,
                  textTransform: "uppercase",
                }}
              >
                {(() => {
                  const raw = trip.vehicle?.label?.trim();
                  // Some Cyprus operators fill the vehicle label with the
                  // long internal entity id — only surface it when it looks
                  // like a real fleet number (short alphanumeric).
                  const isFleet = !!raw && raw.length >= 2 && raw.length <= 6 && /^[A-Z0-9\-]+$/i.test(raw);
                  return isFleet ? `Bus ${raw}` : "Live trip";
                })()}
              </Text>
            </View>
            <Text
              style={{
                marginTop: 12,
                fontFamily: "BricolageGrotesque_800ExtraBold",
                fontSize: 32,
                lineHeight: 36,
                letterSpacing: -0.7,
                color: palette.ink,
              }}
            >
              {trip.route?.long ?? "Route"}
            </Text>
            <Text
              style={{
                marginTop: 8,
                fontFamily: "Geist_500Medium",
                fontSize: 13,
                lineHeight: 19,
                color: palette.inkSoft,
              }}
            >
              {trip.stops.length} stops
              {totalKm ? ` · ${totalKm.toFixed(1)} km of route` : ""}
              {trip.stops[trip.stops.length - 1]?.meta
                ? ` · ends at ${trip.stops[trip.stops.length - 1].meta!.name}`
                : ""}
            </Text>
          </View>

          {/* Map */}
          <View style={{ paddingHorizontal: 20 }}>
            <ExpandableMap
              height={220}
              spanKm={6}
              markers={markers}
              restrictTripIds={[tripId]}
              fitToContent
            />
          </View>

          {/* Next stop + ETA + status composite */}
          <NextStopAndStatus trip={trip} />

          {/* Full stop list */}
          <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-end",
                marginBottom: 14,
              }}
            >
              <Text
                style={{
                  fontFamily: "BricolageGrotesque_700Bold",
                  fontSize: 22,
                  lineHeight: 24,
                  letterSpacing: -0.4,
                  color: palette.ink,
                }}
              >
                All stops
              </Text>
              <Text
                style={{
                  fontFamily: "Geist_700Bold",
                  fontSize: 9.5,
                  letterSpacing: 1.8,
                  color: palette.inkSoft,
                  textTransform: "uppercase",
                  paddingBottom: 2,
                }}
              >
                Live · Scheduled
              </Text>
            </View>

            <View
              style={{
                borderRadius: 24,
                backgroundColor: palette.white,
                borderWidth: 1,
                borderColor: palette.line,
                overflow: "hidden",
              }}
            >
              {trip.stops.map((s, i) => {
                const isHighlight = s.stopId === highlightStopId;
                const dotColor = s.passed
                  ? "rgba(63,74,54,0.4)"
                  : s.next
                    ? palette.ochre
                    : palette.aegeanDeep;
                return (
                  <Pressable
                    key={`${s.stopId}-${i}`}
                    onPress={() => handleStopPress(s.stopId)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 14,
                      paddingHorizontal: 18,
                      paddingVertical: 14,
                      borderBottomWidth: i < trip.stops.length - 1 ? 1 : 0,
                      borderBottomColor: palette.line,
                      backgroundColor: isHighlight
                        ? "rgba(63,155,178,0.10)"
                        : pressed
                          ? "rgba(237,230,214,0.6)"
                          : "transparent",
                    })}
                  >
                    <View style={{ alignItems: "center", width: 14 }}>
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: dotColor,
                        }}
                      />
                      {i < trip.stops.length - 1 && (
                        <View
                          style={{
                            position: "absolute",
                            top: 14,
                            width: 1,
                            height: 36,
                            backgroundColor: palette.line,
                          }}
                        />
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={2}
                        style={{
                          fontFamily: "BricolageGrotesque_700Bold",
                          fontSize: 16,
                          lineHeight: 20,
                          color: s.passed ? palette.inkSoft : palette.ink,
                          textDecorationLine: s.passed ? "line-through" : "none",
                        }}
                      >
                        {s.meta?.name ?? `Stop ${s.stopId}`}
                      </Text>
                      <Text
                        style={{
                          marginTop: 3,
                          fontFamily: "Geist_700Bold",
                          fontSize: 10,
                          letterSpacing: 1.6,
                          color: palette.inkSoft,
                          textTransform: "uppercase",
                        }}
                      >
                        {s.meta?.code ? `#${s.meta.code}` : `Stop ${s.index + 1}`}
                        {s.next ? " · Approaching" : ""}
                        {isHighlight ? " · You" : ""}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text
                        style={{
                          fontFamily: "BricolageGrotesque_700Bold",
                          fontSize: 17,
                          lineHeight: 20,
                          color: s.next
                            ? palette.ochre
                            : s.passed
                              ? palette.inkSoft
                              : palette.ink,
                        }}
                      >
                        {fmtClock(s.arrivalUnix)}
                      </Text>
                      {Math.abs(s.delaySec) > 60 && (
                        <Text
                          style={{
                            marginTop: 3,
                            fontFamily: "Geist_700Bold",
                            fontSize: 9.5,
                            letterSpacing: 1.4,
                            color: palette.inkSoft,
                            textTransform: "uppercase",
                          }}
                        >
                          {s.delaySec > 0
                            ? `+${Math.round(s.delaySec / 60)}m`
                            : `${Math.round(s.delaySec / 60)}m`}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Text
              style={{
                marginTop: 14,
                fontFamily: "Geist_500Medium",
                fontSize: 12,
                lineHeight: 18,
                color: palette.inkSoft,
              }}
            >
              Times update every 15 seconds from the operator's live feed. When
              the bus drops off the feed, we hold the scheduled time.
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Next-stop / ETA / status composite — mirrors the web NextStopCard +
// EtaCard + StatusCard trio in native form.
// ---------------------------------------------------------------------------
function NextStopAndStatus({
  trip,
}: {
  trip: {
    nextIdx: number;
    stops: Array<{
      stopId: string;
      arrivalUnix: number;
      delaySec: number;
      meta?: { name: string; code: string };
      next: boolean;
    }>;
  };
}) {
  const finished = trip.nextIdx === -1;
  const nextStop = finished ? null : trip.stops[trip.nextIdx];
  const nextName = nextStop?.meta?.name ?? "—";
  const nextCode = nextStop?.meta?.code ?? null;
  const eta = nextStop ? fmtClock(nextStop.arrivalUnix) : "—";
  const minsTo = nextStop
    ? Math.max(0, Math.round((nextStop.arrivalUnix - Date.now() / 1000) / 60))
    : null;
  const delay = nextStop?.delaySec ?? 0;
  const status: "ontime" | "late" | "early" | "done" = finished
    ? "done"
    : delay > 60
      ? "late"
      : delay < -60
        ? "early"
        : "ontime";
  const statusText = finished
    ? "Finished"
    : status === "late"
      ? `${Math.round(delay / 60)} min late`
      : status === "early"
        ? `${Math.round(-delay / 60)} min early`
        : "On time";
  const statusColor =
    status === "late"
      ? palette.ochre
      : status === "early"
        ? palette.aegeanDeep
        : status === "done"
          ? palette.inkSoft
          : palette.olive;

  return (
    <View style={{ paddingHorizontal: 20, marginTop: 18, gap: 10 }}>
      <View
        style={{
          backgroundColor: palette.white,
          borderRadius: 26,
          borderWidth: 1,
          borderColor: palette.line,
          padding: 20,
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 10,
              letterSpacing: 2.2,
              color: palette.inkSoft,
              textTransform: "uppercase",
            }}
          >
            Next stop
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontFamily: "BricolageGrotesque_800ExtraBold",
              fontSize: 24,
              lineHeight: 26,
              letterSpacing: -0.5,
              color: palette.ink,
            }}
          >
            {nextName}
          </Text>
          {nextCode && (
            <Text
              style={{
                marginTop: 6,
                fontFamily: "Geist_700Bold",
                fontSize: 10,
                letterSpacing: 1.8,
                color: palette.inkSoft,
                textTransform: "uppercase",
              }}
            >
              #{nextCode}
            </Text>
          )}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          {finished ? (
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 12,
                letterSpacing: 2,
                color: palette.inkSoft,
              }}
            >
              —
            </Text>
          ) : (
            <>
              <Text
                style={{
                  fontFamily: "BricolageGrotesque_800ExtraBold",
                  fontSize: 44,
                  lineHeight: 44,
                  letterSpacing: -1.2,
                  color: palette.ochre,
                }}
              >
                {minsTo ?? 0}
              </Text>
              <Text
                style={{
                  marginTop: 4,
                  fontFamily: "Geist_700Bold",
                  fontSize: 10,
                  letterSpacing: 2.2,
                  color: palette.inkSoft,
                  textTransform: "uppercase",
                }}
              >
                min
              </Text>
            </>
          )}
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: palette.white,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: palette.line,
            padding: 16,
          }}
        >
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 9.5,
              letterSpacing: 2,
              color: palette.inkSoft,
              textTransform: "uppercase",
            }}
          >
            ETA there
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontFamily: "BricolageGrotesque_700Bold",
              fontSize: 24,
              lineHeight: 26,
              letterSpacing: -0.4,
              color: palette.ink,
            }}
          >
            {eta}
          </Text>
          <Text
            style={{
              marginTop: 4,
              fontFamily: "Geist_700Bold",
              fontSize: 9.5,
              letterSpacing: 1.8,
              color: palette.inkSoft,
              textTransform: "uppercase",
            }}
          >
            clock
          </Text>
        </View>
        <View
          style={{
            flex: 1,
            backgroundColor: palette.white,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: palette.line,
            padding: 16,
          }}
        >
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 9.5,
              letterSpacing: 2,
              color: palette.inkSoft,
              textTransform: "uppercase",
            }}
          >
            Running
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontFamily: "BricolageGrotesque_700Bold",
              fontSize: 19,
              lineHeight: 22,
              letterSpacing: -0.3,
              color: statusColor,
            }}
          >
            {statusText}
          </Text>
          <Text
            style={{
              marginTop: 4,
              fontFamily: "Geist_700Bold",
              fontSize: 9.5,
              letterSpacing: 1.8,
              color: palette.inkSoft,
              textTransform: "uppercase",
            }}
          >
            {status === "done"
              ? "end"
              : status === "ontime"
                ? "steady"
                : status === "late"
                  ? "delayed"
                  : "ahead"}
          </Text>
        </View>
      </View>
    </View>
  );
}
