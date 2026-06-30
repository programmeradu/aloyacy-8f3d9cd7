import { useMemo, useCallback, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { palette } from "@/constants/theme";
import { StopCard, type StopCardData, type StopCardRoute } from "@/components/StopCard";
import { useGeoFix, useStopsBundle, useRealtime } from "@/lib/hooks";
import { distanceMeters, formatDistance, timeOfDayGreeting } from "@/lib/format";
import { smartEtaV2 } from "@/lib/eta-v2";
import type { Stop } from "@/lib/api";

// Limassol harbour — sane default when the rider hasn't granted GPS yet.
const FALLBACK = { lat: 34.6786, lng: 33.0454 };

// Stop tone derivation — mirrors web `routeTone()` (deterministic per id).
function toneForRoute(id: string): "aegean" | "ochre" | "olive" {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const v = Math.abs(h) % 3;
  return v === 0 ? "aegean" : v === 1 ? "ochre" : "olive";
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const { fix, status } = useGeoFix();
  const bundle = useStopsBundle();
  const rt = useRealtime();
  const [refreshing, setRefreshing] = useState(false);

  const here = fix ?? FALLBACK;
  const usingFallback = !fix;

  const nearby: (Stop & { d: number })[] = useMemo(() => {
    if (!bundle.data) return [];
    return bundle.data.stops
      .map((s) => ({ ...s, d: distanceMeters(here, s) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 6);
  }, [bundle.data, here.lat, here.lng]);

  const stopCards: StopCardData[] = useMemo(() => {
    const arrivals = rt.data?.arrivals ?? [];
    const vehicles = rt.data?.vehicles ?? [];
    const routesMeta = bundle.data?.routes ?? {};
    const nowSec = Math.floor(Date.now() / 1000);

    // Index arrivals by stopId for the route-chip list.
    const arrByStop = new Map<
      string,
      { routeId: string; tripId: string; etaMin: number }[]
    >();
    for (const a of arrivals) {
      const eta = Math.max(0, Math.round((a.arrivalUnix - nowSec) / 60));
      if (eta > 120) continue;
      const arr = arrByStop.get(a.stopId) ?? [];
      arr.push({ routeId: a.routeId, tripId: a.tripId, etaMin: eta });
      arrByStop.set(a.stopId, arr);
    }

    return nearby.map((s, idx) => {
      const arr = (arrByStop.get(s.id) ?? []).sort((a, b) => a.etaMin - b.etaMin);

      const smart = smartEtaV2({
        stopId: s.id,
        arrivals,
        vehicles,
        nowSec,
        agency: s.agency,
        riderConfirmedAgeSec: arr[0]
          ? rt.riderConfirmedAge.get(arr[0].tripId)
          : undefined,
      });

      const seen = new Set<string>();
      const routes: StopCardRoute[] = arr
        .filter((a) => {
          if (seen.has(a.routeId)) return false;
          seen.add(a.routeId);
          return true;
        })
        .slice(0, 3)
        .map((a) => {
          const meta = routesMeta[a.routeId];
          return {
            code: meta?.short ?? a.routeId,
            tone: toneForRoute(a.routeId),
            color: meta?.color,
            headsign: null,
          };
        });

      return {
        id: s.id,
        code: s.code || s.id,
        name: s.name,
        towards:
          s.agency === "IC"
            ? "Intercity"
            : formatDistance(s.d),
        etaMin: smart?.etaMin ?? arr[0]?.etaMin ?? null,
        etaTier: smart?.tier,
        etaConfidenceLevel: smart?.confidence,
        etaBlurb: smart?.blurb,
        routes,
        highlight: idx === 0,
      } satisfies StopCardData;
    });
  }, [nearby, rt.data, rt.riderConfirmedAge, bundle.data]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([rt.refetch(), bundle.refetch()]);
    setRefreshing(false);
  }, [rt, bundle]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.limestone }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 20,
        paddingBottom: 24,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={palette.aegeanDeep}
        />
      }
    >
      <Text
        style={{
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 12,
          color: palette.oliveSoft,
          letterSpacing: 1.2,
        }}
      >
        ALOYA · CYPRUS
      </Text>
      <Text
        style={{
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 38,
          lineHeight: 42,
          color: palette.ink,
          marginTop: 8,
          letterSpacing: -1,
        }}
      >
        {timeOfDayGreeting()}.
      </Text>
      <Text
        style={{
          fontFamily: "Geist_500Medium",
          fontSize: 16,
          color: palette.inkSoft,
          marginTop: 6,
        }}
      >
        {usingFallback
          ? "Showing Limassol — enable location for stops near you."
          : "Stops nearest to you, live."}
      </Text>

      <Pressable
        onPress={() => router.push("/search")}
        style={({ pressed }) => ({
          marginTop: 22,
          backgroundColor: palette.white,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: palette.line,
          paddingHorizontal: 18,
          paddingVertical: 16,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: "Geist_500Medium",
            color: palette.inkSoft,
            fontSize: 15,
          }}
        >
          Search stops, routes, places…
        </Text>
      </Pressable>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 30,
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 20,
            color: palette.ink,
            letterSpacing: -0.4,
          }}
        >
          Nearby stops
        </Text>
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 11,
            color:
              status === "denied"
                ? palette.ochre
                : rt.data?.stale
                  ? palette.ochre
                  : palette.oliveSoft,
            letterSpacing: 1.4,
            textTransform: "uppercase",
          }}
        >
          {status === "denied"
            ? "Location off"
            : rt.isLoading
              ? "Loading"
              : rt.data?.stale
                ? "Feed stale"
                : "Live · 15s"}
        </Text>
      </View>

      {bundle.isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: "center" }}>
          <ActivityIndicator color={palette.aegeanDeep} />
        </View>
      ) : stopCards.length === 0 ? (
        <View
          style={{
            paddingVertical: 32,
            alignItems: "center",
            backgroundColor: palette.white,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: palette.line,
          }}
        >
          <Text
            style={{
              fontFamily: "BricolageGrotesque_700Bold",
              fontSize: 18,
              color: palette.ink,
            }}
          >
            No stops nearby
          </Text>
          <Text
            style={{
              fontFamily: "Geist_500Medium",
              fontSize: 13,
              color: palette.inkSoft,
              marginTop: 4,
            }}
          >
            Move closer to a bus route to see live arrivals.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {stopCards.map((s) => (
            <StopCard key={s.id} stop={s} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}
