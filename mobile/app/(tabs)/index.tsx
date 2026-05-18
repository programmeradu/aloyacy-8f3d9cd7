import { useMemo, useCallback, useState, useEffect } from "react";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Image,
  StyleSheet,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Svg, { Circle, Path } from "react-native-svg";
import { palette } from "@/constants/theme";
import { StopCard, type StopCardData, type StopCardRoute } from "@/components/StopCard";
import { MapView } from "@/components/MapView";
import { useGeoFix, useStopsBundle, useRealtime } from "@/lib/hooks";
import { distanceMeters, formatDistance, timeOfDayGreeting } from "@/lib/format";
import { smartEtaV2 } from "@/lib/eta-v2";
import { assets } from "@/lib/assets";
import { prefetchHeadsigns, getHeadsignSync, onHeadsignsLoaded } from "@/lib/headsigns";
import { AskAloyaCard } from "@/components/AskAloyaCard";
import { CommuteSuggestionCard } from "@/components/CommuteSuggestionCard";
import { ReturnTripSuggestionCard } from "@/components/ReturnTripSuggestionCard";
import type { Stop } from "@/lib/api";

const FALLBACK = { lat: 35.1856, lng: 33.3823 };

type SearchHit = {
  kind: "stop" | "route" | "vehicle" | "airport";
  id: string;
  primary: string;
  meta: string;
};

// Airports mirrored from src/lib/airport.functions.ts. Kept local so the
// mobile home search can surface them without pulling the whole server
// module across the wire.
const AIRPORTS: Array<{
  code: "lca" | "pfo";
  iata: string;
  name: string;
  nameEl: string;
  city: string;
  cityEl: string;
}> = [
  { code: "lca", iata: "LCA", name: "Larnaca International Airport", nameEl: "Διεθνές Αεροδρόμιο Λάρνακας", city: "Larnaca", cityEl: "Λάρνακα" },
  { code: "pfo", iata: "PFO", name: "Paphos International Airport", nameEl: "Διεθνές Αεροδρόμιο Πάφου", city: "Paphos", cityEl: "Πάφος" },
];

function hitHref(h: SearchHit): string {
  if (h.kind === "stop") return `/stop/${h.id}`;
  if (h.kind === "route") return `/route/${h.id}`;
  if (h.kind === "vehicle") return `/trip/${h.id}`;
  return `/airport/${h.id}`;
}

function hitBadge(h: SearchHit): string {
  if (h.kind === "stop") return "STOP";
  if (h.kind === "route") return "ROUTE";
  if (h.kind === "vehicle") return "LIVE BUS";
  return "AIRPORT";
}

function toneForRoute(id: string): "aegean" | "ochre" | "olive" {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const v = Math.abs(h) % 3;
  return v === 0 ? "aegean" : v === 1 ? "ochre" : "olive";
}

function areaFromStop(stop?: Stop | null) {
  if (!stop) return "Cyprus";
  return stop.name.split(/[·\-,]/)[0].trim() || "Cyprus";
}

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
    return () => { off(); };
  }, []);

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
    const arrByStop = new Map<string, { routeId: string; tripId: string; etaMin: number }[]>();

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
        riderConfirmedAgeSec: arr[0] ? rt.riderConfirmedAge.get(arr[0].tripId) : undefined,
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
          const headsign = getHeadsignSync(a.tripId, a.routeId);
          return {
            code: meta?.short ?? a.routeId,
            tone: toneForRoute(a.routeId),
            color: meta?.color,
            headsign,
          };
        });

      if (routes.length === 0) routes.push({ code: "—", tone: "olive", headsign: null });

      return {
        id: s.id,
        code: s.code || s.id,
        name: s.name,
        towards: s.agency === "IC" ? "Intercity" : formatDistance(s.d),
        etaMin: smart?.etaMin ?? arr[0]?.etaMin ?? null,
        etaTier: smart?.tier,
        etaConfidenceLevel: smart?.confidence,
        etaBlurb: smart?.blurb,
        routes,
        highlight: idx === 0,
      } satisfies StopCardData;
    });
  }, [nearby, rt.data, rt.riderConfirmedAge, bundle.data]);

  const liveCount = rt.data?.vehicles.length ?? 0;
  const onTimePct = useMemo(() => {
    const sampled = rt.data?.arrivals.slice(0, 400) ?? [];
    if (!sampled.length) return null;
    const ok = sampled.filter((a) => Math.abs(a.delaySec) <= 120).length;
    return Math.round((ok / sampled.length) * 100);
  }, [rt.data]);

  const landmarkChips = nearby.slice(0, 4);
  const searchResults = useMemo<SearchHit[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !bundle.data) return [];
    const hits: SearchHit[] = [];

    // Airports — match IATA, city, or "airport".
    for (const a of AIRPORTS) {
      const hay = `${a.iata} ${a.name} ${a.nameEl} ${a.city} ${a.cityEl} airport αεροδρόμιο`.toLowerCase();
      if (a.iata.toLowerCase() === q || a.city.toLowerCase().startsWith(q) || hay.includes(q)) {
        hits.push({ kind: "airport", id: a.code, primary: a.name, meta: `${a.iata}  ${a.city}` });
      }
    }

    // Routes — exact short first, then startsWith, then long-name substring.
    const routeEntries = Object.entries(bundle.data.routes);
    const routeMatches = routeEntries
      .map(([id, r]) => {
        const short = r.short.toLowerCase();
        const long = r.long.toLowerCase();
        let rank = -1;
        if (short === q) rank = 0;
        else if (short.startsWith(q)) rank = 1;
        else if (long.includes(q)) rank = 2;
        return { id, r, rank };
      })
      .filter((x) => x.rank >= 0)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 6);
    for (const { id, r } of routeMatches) {
      hits.push({
        kind: "route",
        id,
        primary: `Route ${r.short}`,
        meta: r.long,
      });
    }

    // Vehicles — by label / route code / vehicle id.
    const vehicles = rt.data?.vehicles ?? [];
    const vMatches = vehicles
      .filter((v) => {
        const meta = bundle.data!.routes[v.routeId];
        return (
          v.label?.toLowerCase().includes(q) ||
          meta?.short.toLowerCase().startsWith(q) ||
          v.id.toLowerCase().includes(q)
        );
      })
      .slice(0, 3);
    for (const v of vMatches) {
      const meta = bundle.data.routes[v.routeId];
      const d = distanceMeters(here, { lat: v.lat, lng: v.lng });
      hits.push({
        kind: "vehicle",
        id: v.tripId,
        primary: v.label || `Bus ${v.id}`,
        meta: `Route ${meta?.short ?? "—"}  ${formatDistance(d)} away`,
      });
    }

    // Stops
    const stopMatches = bundle.data.stops
      .filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))
      .slice(0, 8);
    for (const s of stopMatches) {
      hits.push({
        kind: "stop",
        id: s.id,
        primary: s.name,
        meta: `Stop ${s.code}  ${s.agency}`,
      });
    }

    return hits.slice(0, 18);
  }, [bundle.data, searchQuery, rt.data, here.lat, here.lng]);
  const mapMarkers = nearby.map((s) => ({
    lat: s.lat,
    lng: s.lng,
    label: s.code || s.name,
    tone: "aegean" as const,
    kind: "stop" as const,
  }));
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
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>ALOYA CY</Text>
          <Text style={styles.locale}>EN  ΕΛ  RU</Text>
        </View>
        <View style={styles.weatherStamp}>
          <Text style={styles.weatherDay}>WED</Text>
          <WeatherGlyph />
        </View>
      </View>

      <View style={styles.heroWrap}>
        <Text style={styles.heroTitle}>
          {timeOfDayGreeting()}.{"\n"}
          <Text style={styles.heroItalic}>Where to in {area}?</Text>
        </Text>
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.smartSearch}>
          <SearchGlyph />
          <View style={{ flex: 1, minWidth: 0 }}>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search stops or stop codes"
              placeholderTextColor={palette.inkSoft}
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => {
                const first = searchResults[0];
                if (first) router.push(`/stop/${first.id}`);
              }}
              style={styles.searchInput}
            />
            <Text style={styles.searchHint}>Tap to search the full live network</Text>
          </View>
        </View>
        {searchQuery.trim().length > 0 && (
          <View style={styles.searchResults}>
            {searchResults.length === 0 ? (
              <Text style={styles.searchEmpty}>No stops match “{searchQuery.trim()}”.</Text>
            ) : (
              searchResults.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => router.push(`/stop/${s.id}`)}
                  style={({ pressed }) => [styles.searchResultRow, pressed && { opacity: 0.65 }]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.searchResultName} numberOfLines={2}>{s.name}</Text>
                    <Text style={styles.searchResultMeta}>Stop {s.code}  {s.agency}</Text>
                  </View>
                  <Text style={styles.searchResultGo}>OPEN</Text>
                </Pressable>
              ))
            )}
            <Pressable onPress={() => router.push("/search")} style={styles.fullSearchLink}>
              <Text style={styles.fullSearchText}>Full search</Text>
            </Pressable>
          </View>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {landmarkChips.length === 0 ? (
          <Text style={styles.locating}>Locating nearby stops</Text>
        ) : (
          landmarkChips.map((s, i) => (
            <Pressable key={s.id} onPress={() => router.push(`/stop/${s.id}`)} style={[styles.chip, i % 3 === 1 && styles.chipOlive, i % 3 === 2 && styles.chipOchre]}>
              <Text style={[styles.chipText, i % 3 === 1 && styles.chipTextOlive, i % 3 === 2 && styles.chipTextOchre]} numberOfLines={1}>
                {areaFromStop(s)}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>

      <View style={styles.mapBand}>
        <MapView
          height={238}
          center={here}
          markers={mapMarkers}
          userLocation={fix ? { lat: fix.lat, lng: fix.lng } : null}
          liveVehicles
          spanKm={9}
        />
        <View pointerEvents="none" style={styles.mapOverlay}>
          <Text style={styles.mapKicker}>{usingFallback ? "Nicosia preview" : "Around you"}</Text>
          <Text style={styles.mapTitle}>{area}</Text>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <QuickStat label="Live buses" value={liveCount ? String(liveCount) : "—"} tone="aegean" image={assets.stat_bus} />
        <QuickStat label="On time" value={onTimePct !== null ? `${onTimePct}%` : "—"} tone="olive" image={assets.stat_dial} />
        <QuickStat label="Next ride" value={stopCards[0]?.etaMin != null ? `${stopCards[0].etaMin}′` : "—"} tone="ochre" image={assets.stat_road} />
      </View>

      <ReturnTripSuggestionCard here={fix ? { lat: fix.lat, lng: fix.lng } : null} />

      <CommuteSuggestionCard />

      <AskAloyaCard />

      <View style={styles.sectionHead}>
        <View>
          <Text style={styles.sectionKicker}>
            {status === "ready" ? "Around you" : status === "denied" ? "Location off" : "Live network"}
          </Text>
          <Text style={styles.sectionTitle}>Nearby stops</Text>
        </View>
        <Pressable onPress={() => router.push("/plan")}>
          <Text style={styles.planLink}>Plan trip</Text>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        {bundle.isLoading ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={palette.aegeanDeep} />
          </View>
        ) : stopCards.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No stops nearby</Text>
            <Text style={styles.emptyBody}>Move closer to a bus route to see live arrivals.</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {stopCards.map((s) => (
              <StopCard key={s.id} stop={s} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function QuickStat({ label, value, tone, image }: { label: string; value: string; tone: "aegean" | "ochre" | "olive"; image: { uri: string } }) {
  const color = tone === "aegean" ? palette.aegeanDeep : tone === "ochre" ? palette.ochre : palette.olive;
  return (
    <View style={styles.statCard}>
      <Image source={image} style={styles.statImage} resizeMode="contain" />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

function SearchGlyph() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={6.2} stroke={palette.ink} strokeWidth={2} />
      <Path d="m15.7 15.7 4 4" stroke={palette.ink} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function WeatherGlyph() {
  return (
    <Svg width={28} height={28} viewBox="0 0 28 28" fill="none">
      <Circle cx={14} cy={14} r={5.5} fill={palette.ochre} />
      <Path d="M14 2.5v4M14 21.5v4M2.5 14h4M21.5 14h4M5.9 5.9l2.8 2.8M19.3 19.3l2.8 2.8M22.1 5.9l-2.8 2.8M8.7 19.3l-2.8 2.8" stroke={palette.ochre} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  logo: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 24,
    letterSpacing: 0.4,
    color: palette.ink,
  },
  locale: {
    marginTop: 4,
    fontFamily: "Geist_700Bold",
    fontSize: 10,
    letterSpacing: 2,
    color: palette.inkSoft,
  },
  weatherStamp: {
    minWidth: 82,
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  weatherDay: {
    fontFamily: "Geist_700Bold",
    fontSize: 10,
    letterSpacing: 1.7,
    color: palette.inkSoft,
  },
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
  searchWrap: { paddingHorizontal: 20, marginTop: 22 },
  smartSearch: {
    minHeight: 64,
    borderRadius: 24,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    shadowColor: "#1F1E18",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  searchInput: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 15.5,
    color: palette.ink,
    padding: 0,
    minHeight: 24,
  },
  searchHint: {
    marginTop: 2,
    fontFamily: "Geist_700Bold",
    fontSize: 9.5,
    letterSpacing: 1.4,
    color: palette.inkSoft,
    textTransform: "uppercase",
  },
  searchResults: {
    marginTop: 8,
    borderRadius: 22,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    overflow: "hidden",
  },
  searchResultRow: {
    minHeight: 62,
    paddingHorizontal: 16,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  searchResultName: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 15,
    lineHeight: 19,
    color: palette.ink,
  },
  searchResultMeta: {
    marginTop: 3,
    fontFamily: "Geist_700Bold",
    fontSize: 10,
    letterSpacing: 1.5,
    color: palette.inkSoft,
    textTransform: "uppercase",
  },
  searchResultGo: {
    fontFamily: "Geist_700Bold",
    fontSize: 9.5,
    letterSpacing: 1.8,
    color: palette.aegeanDeep,
  },
  searchEmpty: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontFamily: "Geist_500Medium",
    fontSize: 13,
    lineHeight: 18,
    color: palette.inkSoft,
  },
  fullSearchLink: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: palette.limestoneSoft,
  },
  fullSearchText: {
    fontFamily: "Geist_700Bold",
    fontSize: 10,
    letterSpacing: 2,
    color: palette.ink,
    textTransform: "uppercase",
  },
  chipsRow: { paddingHorizontal: 20, paddingTop: 14, gap: 8 },
  locating: {
    fontFamily: "Geist_700Bold",
    fontSize: 10,
    letterSpacing: 1.8,
    color: palette.inkSoft,
    textTransform: "uppercase",
    paddingVertical: 8,
  },
  chip: {
    maxWidth: 176,
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 9,
    backgroundColor: "rgba(63,155,178,0.14)",
  },
  chipOlive: { backgroundColor: "rgba(63,74,54,0.11)" },
  chipOchre: { backgroundColor: "rgba(201,133,58,0.16)" },
  chipText: { fontFamily: "Geist_600SemiBold", fontSize: 13, color: palette.aegeanDeep },
  chipTextOlive: { color: palette.olive },
  chipTextOchre: { color: palette.ochre },
  mapBand: { marginTop: 20, paddingHorizontal: 20, position: "relative" },
  mapOverlay: {
    position: "absolute",
    left: 34,
    top: 14,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(246,241,231,0.94)",
    borderWidth: 1,
    borderColor: "rgba(31,30,24,0.08)",
  },
  mapKicker: {
    fontFamily: "Geist_700Bold",
    fontSize: 9,
    letterSpacing: 1.8,
    color: palette.inkSoft,
    textTransform: "uppercase",
  },
  mapTitle: {
    marginTop: 2,
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 19,
    color: palette.ink,
  },
  statsGrid: { marginTop: 12, paddingHorizontal: 20, flexDirection: "row", gap: 8 },
  statCard: {
    flex: 1,
    minHeight: 92,
    borderRadius: 18,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    overflow: "hidden",
    padding: 12,
  },
  statImage: { position: "absolute", right: -3, bottom: -4, width: "58%", height: "58%", opacity: 0.62 },
  statLabel: {
    fontFamily: "Geist_700Bold",
    fontSize: 9,
    letterSpacing: 1.5,
    color: palette.inkSoft,
    textTransform: "uppercase",
  },
  statValue: {
    marginTop: 9,
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 27,
    lineHeight: 30,
  },
  editorialCard: {
    marginHorizontal: 20,
    marginTop: 24,
    height: 188,
    borderRadius: 26,
    overflow: "hidden",
    backgroundColor: palette.ink,
  },
  editorialWash: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,26,32,0.46)" },
  editorialContent: { flex: 1, padding: 20, justifyContent: "flex-end" },
  editorialKicker: {
    fontFamily: "Geist_700Bold",
    fontSize: 10,
    letterSpacing: 2,
    color: "rgba(246,241,231,0.78)",
    textTransform: "uppercase",
  },
  editorialTitle: {
    marginTop: 7,
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 28,
    lineHeight: 30,
    color: palette.limestone,
  },
  editorialBody: {
    marginTop: 7,
    maxWidth: 300,
    fontFamily: "Geist_500Medium",
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(246,241,231,0.84)",
  },
  sectionHead: {
    marginTop: 28,
    marginBottom: 12,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 14,
  },
  sectionKicker: {
    fontFamily: "Geist_700Bold",
    fontSize: 10,
    letterSpacing: 1.9,
    color: palette.inkSoft,
    textTransform: "uppercase",
  },
  sectionTitle: {
    marginTop: 3,
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 28,
    color: palette.ink,
  },
  planLink: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 13,
    color: palette.aegeanDeep,
  },
  emptyCard: {
    paddingVertical: 32,
    alignItems: "center",
    backgroundColor: palette.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
  },
  emptyTitle: { fontFamily: "BricolageGrotesque_700Bold", fontSize: 18, color: palette.ink },
  emptyBody: { fontFamily: "Geist_500Medium", fontSize: 13, color: palette.inkSoft, marginTop: 4 },
});