// Route detail screen — native parity with `src/routes/route.$routeId.tsx`.
//
// Hero: RouteChip + line label + headline + buses/stops meta + ReliabilityBadge.
// Map: MapView focused on this route (live vehicles + stop pins).
// Empty state: editorial vignette image when nothing is moving / no stops yet.
// Next-departure dark card: surfaces live bus state (at / approaching /
// departing / scheduled) and links to /trip-info/[tripId].
// Runs list: upcoming trips on this route, live badge when a vehicle reports.
// Stops on the line: ordered list with live bus dot at the bus's current /
// approaching index. Intercity routes append IntercityPatternsCard.

import { useMemo, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Svg, { Path, Defs, LinearGradient, Stop as SvgStop } from "react-native-svg";

import { palette } from "@/constants/theme";
import { Card } from "@/components/Card";
import { RouteChip } from "@/components/RouteChip";
import { MapView, type MapMarker } from "@/components/MapView";
import { ExpandableMap } from "@/components/ExpandableMap";
import { IntercityPatternsCard } from "@/components/IntercityPatternsCard";
import { ReliabilityBadge } from "@/components/ReliabilityBadge";
import { useRealtime, useStopsBundle } from "@/lib/hooks";
import { getStop } from "@/lib/gtfs";
import { fetchIntercityInsights } from "@/lib/wave3";
import { fetchRouteReliability } from "@/lib/reliability";
import { distanceMeters } from "@/lib/format";

function fmtClock(unix: number) {
  return new Date(unix * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function minutesFromNow(unix: number) {
  const m = Math.round((unix - Date.now() / 1000) / 60);
  if (m <= 0) return "Due";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

const MONO_KICKER = {
  fontFamily: "Geist_700Bold" as const,
  fontSize: 10,
  letterSpacing: 2.2,
};

export default function RouteDetailScreen() {
  const { routeId } = useLocalSearchParams<{ routeId: string }>();
  const insets = useSafeAreaInsets();
  const rt = useRealtime();
  const bundle = useStopsBundle();
  const meta = bundle.data?.routes[routeId!];
  const agency = (meta as { agency?: string } | undefined)?.agency;
  const stopOf = useCallback(
    (id: string) => getStop(id, agency),
    [agency],
  );

  const isIntercity = useMemo(() => {
    if (!meta) return false;
    return meta.feedId === 6 || /^IC/i.test(meta.short ?? "");
  }, [meta]);

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

  const data = useMemo(() => {
    if (!rt.data) return null;

    const tripMap = new Map<string, typeof rt.data.arrivals>();
    for (const a of rt.data.arrivals) {
      if (a.routeId !== routeId) continue;
      const arr = tripMap.get(a.tripId) ?? [];
      arr.push(a);
      tripMap.set(a.tripId, arr);
    }

    const now = Math.floor(Date.now() / 1000);
    const trips = Array.from(tripMap.entries())
      .map(([tripId, arrs]) => {
        const sorted = [...arrs].sort((x, y) => x.arrivalUnix - y.arrivalUnix);
        const upcoming =
          sorted.find((s) => s.arrivalUnix >= now - 30) ?? sorted[sorted.length - 1];
        return {
          tripId,
          arrivals: sorted,
          firstStop: sorted[0],
          lastStop: sorted[sorted.length - 1],
          nextArrival: upcoming,
        };
      })
      .sort((a, b) => a.nextArrival.arrivalUnix - b.nextArrival.arrivalUnix);

    const vehicles = rt.data.vehicles.filter((v) => v.routeId === routeId);

    const longest = trips.reduce(
      (best, t) => (t.arrivals.length > (best?.arrivals.length ?? 0) ? t : best),
      trips[0],
    );
    const stopIds = longest
      ? Array.from(new Set(longest.arrivals.map((a) => a.stopId)))
      : [];

    type BusOnLine = {
      vehicleId: string;
      tripId: string;
      stopIndex: number;
      status: "at" | "approaching" | "departing";
      speed: number;
    };
    const busesOnLine: BusOnLine[] = [];
    for (const v of vehicles) {
      let nearestIdx = -1;
      let nearestDist = Infinity;
      for (let i = 0; i < stopIds.length; i++) {
        const stop = stopOf(stopIds[i]);
        if (!stop) continue;
        const d = distanceMeters({ lat: v.lat, lng: v.lng }, stop);
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = i;
        }
      }
      if (nearestIdx === -1) continue;

      if (nearestDist < 120) {
        const isOrigin = nearestIdx === 0;
        busesOnLine.push({
          vehicleId: v.id,
          tripId: v.tripId,
          stopIndex: nearestIdx,
          status: isOrigin && (v.speed ?? 0) < 1 ? "departing" : "at",
          speed: v.speed ?? 0,
        });
      } else {
        const tripArrivals = tripMap.get(v.tripId) ?? [];
        const nextScheduled = [...tripArrivals]
          .sort((a, b) => a.arrivalUnix - b.arrivalUnix)
          .find((a) => a.arrivalUnix >= now - 30);
        const targetStopId = nextScheduled?.stopId;
        const targetIdx = targetStopId ? stopIds.indexOf(targetStopId) : nearestIdx;
        busesOnLine.push({
          vehicleId: v.id,
          tripId: v.tripId,
          stopIndex: targetIdx >= 0 ? targetIdx : nearestIdx,
          status: "approaching",
          speed: v.speed ?? 0,
        });
      }
    }

    return { trips, vehicles, stopIds, longest, busesOnLine };
  }, [rt.data, routeId, stopOf]);

  const markers: MapMarker[] = useMemo(() => {
    if (!data) return [];
    return data.stopIds
      .map((id) => stopOf(id))
      .filter((s): s is NonNullable<ReturnType<typeof getStop>> => !!s)
      .map((s, i, arr) => ({
        lat: s.lat,
        lng: s.lng,
        label: s.name,
        kind:
          i === 0 ? ("origin" as const) : i === arr.length - 1 ? ("destination" as const) : ("stop" as const),
        tone: "aegean" as const,
      }));
  }, [data, stopOf]);

  const tripIds = data?.trips.map((t) => t.tripId) ?? [];
  const firstTrip = data?.trips[0];
  const liveBus = firstTrip ? data!.busesOnLine.find((b) => b.tripId === firstTrip.tripId) : null;

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
      {/* Top bar */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 999,
            backgroundColor: palette.white,
            borderWidth: 1,
            borderColor: palette.line,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 18,
              color: palette.ink,
              marginTop: -2,
            }}
          >
            ←
          </Text>
        </Pressable>
        <Text style={[MONO_KICKER, { color: palette.inkSoft }]}>OVERVIEW</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <RouteChip short={meta?.short ?? routeId ?? "—"} color={meta?.color} />
          <Text style={[MONO_KICKER, { color: palette.inkSoft }]}>
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
          {data?.vehicles.length
            ? data.vehicles.length === 1
              ? "1 bus running now"
              : `${data.vehicles.length} buses running now`
            : "No buses reporting right now"}
          {data?.stopIds.length ? `  ·  ${data.stopIds.length} stops on line` : ""}
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

      {/* Map or vignette empty state */}
      <View style={{ paddingHorizontal: 20 }}>
        {data && (data.vehicles.length > 0 || data.stopIds.length > 0) ? (
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
          <QuietVignette loading={rt.isLoading || bundle.isLoading} />
        )}
      </View>

      {/* Next departure / live status hero */}
      {firstTrip ? (
        <NextDepartureCard
          trip={firstTrip}
          liveBus={liveBus}
          stopOf={stopOf}
          stopIds={data!.stopIds}
        />
      ) : null}

      {/* Intercity intelligence */}
      {isIntercity && intel.data && (
        <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
          <IntercityPatternsCard data={intel.data} />
        </View>
      )}

      {/* Upcoming runs */}
      {data && data.trips.length > 1 && (
        <View style={{ marginTop: 28, paddingHorizontal: 20 }}>
          <SectionHeader title="Today's runs" kicker="FROM LIVE FEED" />
          <Card style={{ overflow: "hidden", padding: 0 }}>
            {data.trips.slice(1, 6).map((trip, i, arr) => {
              const live = data.vehicles.some((v) => v.tripId === trip.tripId);
              const dest = stopOf(trip.lastStop.stopId)?.name.split(/[·\-,]/)[0]?.trim() ?? "Terminus";
              return (
                <Pressable
                  key={trip.tripId}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    router.push(`/trip-info/${trip.tripId}`);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                    paddingHorizontal: 18,
                    paddingVertical: 14,
                    borderBottomWidth: i === arr.length - 1 ? 0 : 1,
                    borderBottomColor: palette.line,
                    backgroundColor: pressed ? palette.limestoneSoft : "transparent",
                  })}
                >
                  <Text
                    style={{
                      fontFamily: "BricolageGrotesque_800ExtraBold",
                      fontSize: 22,
                      color: palette.ink,
                      width: 72,
                      letterSpacing: -0.4,
                    }}
                  >
                    {fmtClock(trip.nextArrival.arrivalUnix)}
                  </Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: "BricolageGrotesque_700Bold",
                        fontSize: 15,
                        color: palette.ink,
                      }}
                    >
                      {stopOf(trip.nextArrival.stopId)?.name ?? "Next stop"}
                    </Text>
                    <View
                      style={{
                        marginTop: 3,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {live && (
                        <View
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: 999,
                            backgroundColor: palette.ochre,
                          }}
                        />
                      )}
                      <Text
                        style={[
                          MONO_KICKER,
                          {
                            fontSize: 9,
                            letterSpacing: 1.6,
                            color: live ? palette.ochre : palette.inkSoft,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {live ? "LIVE NOW" : "SCHEDULED"}  ·  TO {dest.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[
                      MONO_KICKER,
                      { fontSize: 10, color: palette.inkSoft, letterSpacing: 1.8 },
                    ]}
                  >
                    {minutesFromNow(trip.nextArrival.arrivalUnix).toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </Card>
        </View>
      )}

      {/* Stops on the line */}
      {data && data.stopIds.length > 0 ? (
        <View style={{ marginTop: 28, paddingHorizontal: 20 }}>
          <SectionHeader
            title="Stops on this line"
            kicker={`${data.stopIds.length} STOPS`}
          />
          <Card style={{ overflow: "hidden", padding: 0 }}>
            {data.stopIds.map((id, i) => {
              const s = stopOf(id);
              if (!s) return null;
              const isEdge = i === 0 || i === data.stopIds.length - 1;
              const busHere = data.busesOnLine.find(
                (b) => b.stopIndex === i && (b.status === "at" || b.status === "departing"),
              );
              const busApproaching = data.busesOnLine.find(
                (b) => b.stopIndex === i && b.status === "approaching",
              );
              const live = !!busHere || !!busApproaching;
              const liveLabel = busHere
                ? busHere.status === "departing"
                  ? "BUS DEPARTING NOW"
                  : "BUS AT THIS STOP"
                : busApproaching
                  ? "BUS APPROACHING"
                  : null;
              return (
                <Pressable
                  key={id}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    router.push(`/stop/${id}`);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                    paddingHorizontal: 18,
                    paddingVertical: 14,
                    borderBottomWidth: i === data.stopIds.length - 1 ? 0 : 1,
                    borderBottomColor: palette.line,
                    backgroundColor: pressed
                      ? palette.limestoneSoft
                      : live
                        ? "rgba(201,133,58,0.06)"
                        : "transparent",
                  })}
                >
                  {/* dot + connector */}
                  <View style={{ width: 16, alignItems: "center" }}>
                    <View
                      style={{
                        width: live ? 12 : 9,
                        height: live ? 12 : 9,
                        borderRadius: 999,
                        backgroundColor: live
                          ? palette.ochre
                          : isEdge
                            ? palette.ochre
                            : palette.aegeanDeep,
                        borderWidth: live ? 2 : 0,
                        borderColor: palette.limestone,
                      }}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: "BricolageGrotesque_700Bold",
                        fontSize: 15,
                        color: palette.ink,
                      }}
                    >
                      {s.name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        MONO_KICKER,
                        {
                          marginTop: 3,
                          fontSize: 9,
                          letterSpacing: 1.6,
                          color: live ? palette.ochre : palette.inkSoft,
                        },
                      ]}
                    >
                      {liveLabel ??
                        (i === 0
                          ? "ORIGIN"
                          : i === data.stopIds.length - 1
                            ? "TERMINUS"
                            : `STOP ${i + 1}`) + (s.code ? `  ·  #${s.code}` : "")}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </Card>
        </View>
      ) : !rt.isLoading && !bundle.isLoading ? (
        <View style={{ marginTop: 28, paddingHorizontal: 20 }}>
          <Card style={{ padding: 22 }}>
            <Text
              style={{
                fontFamily: "BricolageGrotesque_700Bold",
                fontSize: 18,
                color: palette.ink,
              }}
            >
              Stops will appear here
            </Text>
            <Text
              style={{
                marginTop: 6,
                fontFamily: "Geist_500Medium",
                fontSize: 13,
                color: palette.inkSoft,
              }}
            >
              When this line has a live trip in the feed, the full stop sequence
              loads here with the bus dot moving along it.
            </Text>
          </Card>
        </View>
      ) : null}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------

function SectionHeader({ title, kicker }: { title: string; kicker: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-end",
        marginBottom: 10,
      }}
    >
      <Text
        style={{
          fontFamily: "BricolageGrotesque_700Bold",
          fontSize: 22,
          color: palette.ink,
          letterSpacing: -0.4,
        }}
      >
        {title}
      </Text>
      <Text style={[MONO_KICKER, { color: palette.inkSoft }]}>{kicker}</Text>
    </View>
  );
}

function QuietVignette({ loading }: { loading: boolean }) {
  return (
    <View
      style={{
        height: 224,
        borderRadius: 24,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: palette.line,
        backgroundColor: palette.limestoneSoft,
      }}
    >
      {/* Bespoke SVG vignette — horizon road into limestone hills, no stock art */}
      <Svg width="100%" height="100%" viewBox="0 0 400 224" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <SvgStop offset="0%" stopColor={palette.aegeanSoft} stopOpacity="0.9" />
            <SvgStop offset="100%" stopColor={palette.limestoneSoft} stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="ochreFade" x1="0" y1="0" x2="1" y2="0">
            <SvgStop offset="0%" stopColor={palette.ochre} stopOpacity="0.35" />
            <SvgStop offset="100%" stopColor={palette.ochre} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path d="M0 0 H400 V140 Q200 110 0 150 Z" fill="url(#sky)" />
        <Path d="M0 150 Q200 110 400 140 V224 H0 Z" fill={palette.limestoneSoft} />
        <Path
          d="M-20 200 Q140 140 220 160 T440 130"
          stroke="url(#ochreFade)"
          strokeWidth={38}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d="M-20 200 Q140 140 220 160 T440 130"
          stroke={palette.ochre}
          strokeOpacity={0.45}
          strokeWidth={1.2}
          strokeDasharray="6 9"
          fill="none"
        />
        <Path d="M30 130 Q80 70 130 130 Q180 75 230 130 Q280 70 330 130" stroke={palette.oliveSoft} strokeOpacity={0.4} strokeWidth={1} fill="none" />
      </Svg>
      <View style={{ position: "absolute", left: 18, right: 18, bottom: 16 }}>
        <Text style={[MONO_KICKER, { color: palette.inkSoft }]}>SERVICE WINDOW</Text>
        <Text
          style={{
            marginTop: 4,
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 20,
            color: palette.ink,
            letterSpacing: -0.4,
          }}
        >
          {loading ? "Checking the line…" : "Quiet on this line right now"}
        </Text>
      </View>
    </View>
  );
}

function NextDepartureCard({
  trip,
  liveBus,
  stopOf,
  stopIds,
}: {
  trip: {
    tripId: string;
    nextArrival: { stopId: string; arrivalUnix: number };
    lastStop: { stopId: string };
  };
  liveBus:
    | {
        stopIndex: number;
        status: "at" | "approaching" | "departing";
        speed: number;
      }
    | null
    | undefined;
  stopOf: (id: string) => { name: string; code?: string; lat: number; lng: number } | undefined;
  stopIds: string[];
}) {
  const nextStopName = stopOf(trip.nextArrival.stopId)?.name ?? "Upcoming stop";
  const terminusName = stopOf(trip.lastStop.stopId)?.name ?? "Terminus";

  let kicker = "NEXT DEPARTURE";
  let bigText = nextStopName;
  let footer = `Ends ${terminusName}  ·  ${fmtClock(trip.nextArrival.arrivalUnix)}`;
  let pillText = minutesFromNow(trip.nextArrival.arrivalUnix).toUpperCase();
  let isLive = false;

  if (liveBus) {
    isLive = true;
    const atStop = stopOf(stopIds[liveBus.stopIndex]);
    if (liveBus.status === "departing") {
      kicker = "ABOUT TO DEPART";
      bigText = atStop?.name ?? nextStopName;
      footer = `Boarding now  ·  Ends ${terminusName}`;
      pillText = "BOARDING";
    } else if (liveBus.status === "at") {
      kicker = "BUS AT STOP";
      bigText = atStop?.name ?? nextStopName;
      footer = `Doors open  ·  Then ${nextStopName}`;
      pillText = "AT STOP";
    } else {
      const kmh = Math.round(liveBus.speed * 3.6);
      kicker = kmh > 3 ? "BUS IN MOTION" : "BUS EN ROUTE";
      bigText = `Heading to ${nextStopName}`;
      footer =
        (kmh > 3 ? `${kmh} km/h  ·  ` : "") +
        `Arrives ${fmtClock(trip.nextArrival.arrivalUnix)}  ·  Ends ${terminusName}`;
    }
  }

  return (
    <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          router.push(`/trip-info/${trip.tripId}`);
        }}
        style={({ pressed }) => ({
          borderRadius: 24,
          backgroundColor: palette.ink,
          padding: 20,
          transform: [{ scale: pressed ? 0.995 : 1 }],
        })}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {isLive && (
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  backgroundColor: palette.ochre,
                }}
              />
            )}
            <Text style={[MONO_KICKER, { color: isLive ? palette.ochre : "rgba(246,241,231,0.6)" }]}>
              {kicker}
            </Text>
          </View>
          <Text style={[MONO_KICKER, { color: palette.ochre }]}>{pillText}</Text>
        </View>
        <Text
          style={{
            marginTop: 12,
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 26,
            lineHeight: 30,
            color: palette.limestone,
            letterSpacing: -0.6,
          }}
        >
          {bigText}
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: "Geist_700Bold",
            fontSize: 11,
            letterSpacing: 1.6,
            color: "rgba(246,241,231,0.7)",
          }}
        >
          {footer.toUpperCase()}
        </Text>
      </Pressable>
    </View>
  );
}
