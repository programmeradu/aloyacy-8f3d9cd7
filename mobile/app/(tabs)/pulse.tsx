// Aloya Pulse — mobile parity with the web /pulse page.
//
// Composes the same four payloads the web route reads (today briefing,
// road pulse, hourly strip, live signals) via a single public wrapper
// (`/api/public/pulse`). Every card renders honest empty/degraded states
// instead of stubbing. No emoji, no bullet dots, no thin weights, no
// third-party iconography — bespoke SVG only.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Linking,
  Image,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Svg, {
  Path,
  Circle,
  Rect,
  G,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop as SvgStop,
} from "react-native-svg";
import { palette } from "@/constants/theme";
import { useGeoFix } from "@/lib/hooks";
import { fetchPulseBundle } from "@/lib/pulse";
import { assets } from "@/lib/assets";
import { API_BASE } from "@/lib/api";
import * as FileSystem from "expo-file-system/legacy";
import { createAudioPlayer } from "expo-audio";
import type {
  TodayBriefing,
  TodayTile,
  TodayTheme,
  HourBucket,
  LivePulse,
  PulseLiveBundle,
  MarinePayload,
  AirPayload,
  NewsPayload,
  TrafficLivePayload,
  CruisesPayload,
  FlightsPayload,
  EventsPayload,
  FixturesPayload,
  MetWarningsPayload,
} from "@/lib/pulse";

const DISPLAY = "BricolageGrotesque_700Bold";
const DISPLAY_MED = "BricolageGrotesque_700Bold";
const SANS = "Geist_500Medium";
const SANS_BOLD = "Geist_700Bold";
const MONO = "Geist_700Bold";
const EYEBROW = "Geist_700Bold";

export default function PulseScreen() {
  const insets = useSafeAreaInsets();
  const { fix } = useGeoFix();
  const [refreshing, setRefreshing] = useState(false);

  const coords = useMemo(
    () => (fix ? { lat: fix.lat, lng: fix.lng } : undefined),
    [fix?.lat, fix?.lng],
  );

  const q = useQuery({
    queryKey: ["pulse-bundle", coords?.lat ?? null, coords?.lng ?? null],
    queryFn: () => fetchPulseBundle(coords),
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await q.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [q]);

  const bundle = q.data;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.limestone }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 32,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={palette.ink}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingHorizontal: 20 }}>
        <Text
          style={{
            fontFamily: EYEBROW,
            fontSize: 10.5,
            letterSpacing: 2,
            color: palette.inkSoft,
            textTransform: "uppercase",
          }}
        >
          Aloya Pulse
        </Text>
        <Text
          style={{
            fontFamily: DISPLAY,
            fontSize: 32,
            lineHeight: 34,
            color: palette.ink,
            marginTop: 6,
          }}
        >
          Cyprus, in one glance.
        </Text>
      </View>

      {!bundle && q.isLoading && (
        <View style={{ paddingTop: 60, alignItems: "center" }}>
          <ActivityIndicator color={palette.aegeanDeep} />
        </View>
      )}

      {q.isError && (
        <View style={{ marginTop: 24, marginHorizontal: 20 }}>
          <ErrorCard
            message="Pulse feed unavailable. Pull down to try again."
          />
        </View>
      )}

      {bundle && (
        <>
          <TodaySection briefing={bundle.today} />
          <RoadPulseCard
            live={bundle.live}
            buckets={bundle.hourly.buckets}
            nowHour={bundle.hourly.nowHour}
          />
          <LiveSignals bundle={bundle.signals} />
          <UpdatedFooter generatedAt={bundle.today.generatedAt} />
        </>
      )}
    </ScrollView>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Today editorial                                                         */
/* ─────────────────────────────────────────────────────────────────────── */

function TodaySection({ briefing }: { briefing: TodayBriefing }) {
  const dateLabel = useMemo(() => {
    const [, m, d] = briefing.date.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${briefing.weekday.en} · ${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]}`;
  }, [briefing.date, briefing.weekday.en]);

  return (
    <View style={{ marginTop: 22, paddingHorizontal: 20 }}>
      <View
        style={{
          borderRadius: 28,
          overflow: "hidden",
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: palette.line,
        }}
      >
        <TodayHero theme={briefing.heroKey} dateLabel={dateLabel} focus={briefing.focus} />
        <View style={{ padding: 22, paddingTop: 16 }}>
          <Text
            style={{
              fontFamily: DISPLAY,
              fontSize: 26,
              lineHeight: 30,
              color: palette.ink,
            }}
          >
            {briefing.headline.en}
          </Text>
          <Text
            style={{
              marginTop: 10,
              fontFamily: SANS,
              fontSize: 14.5,
              lineHeight: 21,
              color: palette.inkSoft,
            }}
          >
            {briefing.lede.en}
          </Text>
        </View>
      </View>

      {briefing.tiles.length > 0 && (
        <View style={{ marginTop: 20 }}>
          <Eyebrow>Today around the island</Eyebrow>
          <View style={{ gap: 12, marginTop: 10 }}>
            {briefing.tiles.map((t, i) => (
              <TileCard key={i} tile={t} />
            ))}
          </View>
        </View>
      )}

      <View
        style={{
          marginTop: 20,
          borderRadius: 22,
          padding: 20,
          backgroundColor: "rgba(31,108,130,0.06)",
          borderWidth: 1,
          borderColor: "rgba(31,108,130,0.18)",
        }}
      >
        <Eyebrow tone="aegean">Verdict</Eyebrow>
        <Text
          style={{
            marginTop: 6,
            fontFamily: DISPLAY_MED,
            fontSize: 17,
            lineHeight: 24,
            color: palette.ink,
          }}
        >
          {briefing.verdict.en}
        </Text>
      </View>

      <View style={{ marginTop: 14 }}>
        <GreekWordCard
          el={briefing.greekWord.el}
          translit={briefing.greekWord.translit}
          en={briefing.greekWord.en}
          meaning={briefing.greekWord.meaning}
        />
      </View>

      <View
        style={{
          marginTop: 14,
          borderRadius: 20,
          padding: 18,
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: palette.line,
        }}
      >
        <Eyebrow tone={briefing.fact.tag === "tourist" ? "aegean" : "ochre"}>
          {briefing.fact.tag === "tourist" ? "For visitors" : "Local lore"}
        </Eyebrow>
        <Text
          style={{
            marginTop: 6,
            fontFamily: DISPLAY_MED,
            fontSize: 15.5,
            lineHeight: 22,
            color: palette.ink,
          }}
        >
          {briefing.fact.en}
        </Text>
      </View>
    </View>
  );
}

function TodayHero({
  theme,
  dateLabel,
  focus,
}: {
  theme: TodayTheme;
  dateLabel: string;
  focus: TodayBriefing["focus"];
}) {
  return (
    <View style={{ height: 172, backgroundColor: heroBg(theme) }}>
      <HeroArt theme={theme} />
      <View
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          right: 16,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <View
          style={{
            backgroundColor: "rgba(255,255,255,0.94)",
            paddingHorizontal: 12,
            paddingVertical: 5,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: palette.line,
          }}
        >
          <Text
            style={{
              fontFamily: EYEBROW,
              fontSize: 9.5,
              letterSpacing: 2,
              color: palette.ink,
              textTransform: "uppercase",
            }}
          >
            {dateLabel}
          </Text>
        </View>
        {focus.scope !== "island" && (
          <View
            style={{
              backgroundColor: "rgba(31,30,24,0.88)",
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 999,
            }}
          >
            <Text
              style={{
                fontFamily: EYEBROW,
                fontSize: 9.5,
                letterSpacing: 2,
                color: palette.white,
                textTransform: "uppercase",
              }}
            >
              {focus.scope === "trip" ? `Heading to ${focus.city}` : `Around ${focus.city}`}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function heroBg(theme: TodayTheme): string {
  switch (theme) {
    case "heatwave": return "#F3D7A6";
    case "storm": return "#B8C6CE";
    case "cruise": return "#CEE3E9";
    case "festival": return "#F1C89D";
    case "derby": return "#DDD3BC";
    case "holiday": return "#E5DAC1";
    default: return "#E7E0CE";
  }
}

/**
 * Painterly hero — bespoke SVG landscape per theme. No stock imagery, no
 * third-party icons. Renders a Cyprus horizon interpretation for the theme.
 */
function HeroArt({ theme }: { theme: TodayTheme }) {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 320 172"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: "absolute", inset: 0 }}
    >
      <Defs>
        <SvgLinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <SvgStop offset="0" stopColor={skyTop(theme)} />
          <SvgStop offset="1" stopColor={skyBot(theme)} />
        </SvgLinearGradient>
        <SvgLinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <SvgStop offset="0" stopColor={palette.white} stopOpacity="0" />
          <SvgStop offset="1" stopColor={palette.white} stopOpacity="1" />
        </SvgLinearGradient>
      </Defs>
      <Rect x="0" y="0" width="320" height="172" fill="url(#sky)" />
      {/* Sun / moon disk */}
      <Circle
        cx={theme === "storm" ? 240 : 250}
        cy={62}
        r={theme === "heatwave" ? 34 : 26}
        fill={sunColor(theme)}
        opacity={theme === "storm" ? 0.45 : 0.85}
      />
      {/* Distant Troodos ridge */}
      <Path
        d="M0 118 L40 96 L80 108 L130 82 L180 106 L230 88 L280 104 L320 92 L320 172 L0 172 Z"
        fill={ridge1(theme)}
      />
      {/* Coastal band */}
      <Path
        d="M0 138 L60 130 L120 140 L200 128 L280 138 L320 132 L320 172 L0 172 Z"
        fill={ridge2(theme)}
      />
      {/* Cypress silhouettes */}
      <G opacity={0.55}>
        {[40, 92, 156, 220, 276].map((x, i) => (
          <Path
            key={i}
            d={`M${x} 140 Q${x - 4} 122 ${x} 108 Q${x + 4} 122 ${x} 140 Z`}
            fill={palette.olive}
          />
        ))}
      </G>
      {/* Bottom fade into card */}
      <Rect x="0" y="120" width="320" height="52" fill="url(#fade)" />
    </Svg>
  );
}

function skyTop(t: TodayTheme): string {
  switch (t) {
    case "heatwave": return "#EBB37A";
    case "storm": return "#7E93A0";
    case "cruise": return "#9EC7D2";
    case "festival": return "#E8AE73";
    case "derby": return "#C6B992";
    case "holiday": return "#D6BE8E";
    default: return "#CFC3A1";
  }
}
function skyBot(t: TodayTheme): string {
  switch (t) {
    case "storm": return "#C8D2D6";
    case "cruise": return "#D8E7EB";
    default: return "#EFE4C8";
  }
}
function sunColor(t: TodayTheme): string {
  return t === "storm" ? "#EDE2C8" : t === "cruise" ? "#F1E1B0" : "#F0B04A";
}
function ridge1(t: TodayTheme): string {
  return t === "storm" ? "#4E5E66" : "#4E5A44";
}
function ridge2(t: TodayTheme): string {
  return t === "storm" ? "#3B4A52" : "#3F4A36";
}

function TileCard({ tile }: { tile: TodayTile }) {
  const accent = accentColor(tile.accent);
  return (
    <View
      style={{
        borderRadius: 20,
        padding: 18,
        paddingRight: 88,
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: palette.line,
        overflow: "hidden",
      }}
    >
      <View style={{ position: "absolute", right: -6, top: -6, opacity: 0.75 }}>
        <TileGlyph kind={tile.kind} color={accent} />
      </View>
      <Text
        style={{
          fontFamily: EYEBROW,
          fontSize: 9.5,
          letterSpacing: 2,
          color: accent,
          textTransform: "uppercase",
        }}
      >
        {tile.kicker}
      </Text>
      <Text
        style={{
          marginTop: 6,
          fontFamily: DISPLAY_MED,
          fontSize: 16.5,
          lineHeight: 21,
          color: palette.ink,
        }}
      >
        {tile.title}
      </Text>
      <Text
        style={{
          marginTop: 6,
          fontFamily: SANS,
          fontSize: 13,
          lineHeight: 19,
          color: palette.inkSoft,
        }}
      >
        {tile.detail}
      </Text>
    </View>
  );
}

function accentColor(a: TodayTile["accent"]): string {
  switch (a) {
    case "ochre": return palette.ochre;
    case "aegean": return palette.aegeanDeep;
    case "olive": return palette.olive;
    default: return palette.ink;
  }
}

/** Bespoke SVG glyphs for tile kinds — no icon set. */
function TileGlyph({ kind, color }: { kind: TodayTile["kind"]; color: string }) {
  const s = 86;
  const common = { stroke: color, strokeWidth: 1.6, fill: "none" as const };
  return (
    <Svg width={s} height={s} viewBox="0 0 100 100">
      {kind === "match" && (
        <G {...common}>
          <Circle cx={50} cy={50} r={26} />
          <Path d="M50 24 L58 42 L78 46 L64 60 L68 80 L50 70 L32 80 L36 60 L22 46 L42 42 Z" fill={color} opacity={0.25} />
        </G>
      )}
      {kind === "festival" && (
        <G {...common}>
          <Path d="M20 78 L50 30 L80 78 Z" />
          <Path d="M35 60 L50 40 L65 60" />
          <Circle cx={50} cy={30} r={3} fill={color} />
        </G>
      )}
      {kind === "cruise" && (
        <G {...common}>
          <Path d="M15 66 L85 66 L74 82 L26 82 Z" />
          <Path d="M50 66 L50 30 M50 40 L70 44 L50 48" />
        </G>
      )}
      {kind === "holiday" && (
        <G {...common}>
          <Path d="M28 30 L72 30 L68 78 L32 78 Z" />
          <Circle cx={50} cy={52} r={9} />
        </G>
      )}
      {kind === "nameday" && (
        <G {...common}>
          <Path d="M32 40 Q50 22 68 40 Q60 62 50 76 Q40 62 32 40 Z" />
          <Circle cx={50} cy={45} r={4} fill={color} />
        </G>
      )}
      {kind === "rhythm" && (
        <G {...common}>
          <Path d="M20 60 L34 60 L40 42 L52 78 L60 52 L68 60 L82 60" strokeLinecap="round" strokeLinejoin="round" />
        </G>
      )}
      {kind === "weather-sun" && (
        <G {...common}>
          <Circle cx={50} cy={50} r={14} fill={color} opacity={0.3} />
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i * Math.PI) / 4;
            return (
              <Path
                key={i}
                d={`M${50 + Math.cos(a) * 22} ${50 + Math.sin(a) * 22} L${50 + Math.cos(a) * 30} ${50 + Math.sin(a) * 30}`}
                strokeLinecap="round"
              />
            );
          })}
        </G>
      )}
      {kind === "weather-rain" && (
        <G {...common}>
          <Path d="M28 46 Q40 32 56 40 Q76 34 78 54 Q76 62 66 62 L34 62 Q22 60 28 46 Z" />
          <Path d="M36 70 L32 82 M50 70 L46 82 M64 70 L60 82" strokeLinecap="round" />
        </G>
      )}
      {kind === "weather-cloud" && (
        <G {...common}>
          <Path d="M24 60 Q36 44 52 52 Q72 44 78 62 Q76 72 66 72 L30 72 Q18 70 24 60 Z" />
        </G>
      )}
    </Svg>
  );
}

function GreekWordCard({
  el,
  translit,
  en,
  meaning,
}: {
  el: string;
  translit: string;
  en: string;
  meaning: string;
}) {
  const [playing, setPlaying] = useState(false);

  const speak = useCallback(async () => {
    if (playing) return;
    Haptics.selectionAsync().catch(() => {});
    setPlaying(true);
    try {
      const res = await fetch(`${API_BASE}/api/public/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: `${el}. ${translit}. In English: ${en}.`,
          instructions:
            "Pronounce the Greek word clearly and slowly first, then the transliteration, then the English translation. Warm and encouraging tone.",
        }),
      });
      if (!res.ok) throw new Error(`TTS ${res.status}`);
      const buf = await res.arrayBuffer();
      // Cache to disk so expo-audio can stream it. Convert to base64.
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const b64 =
        typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
      const path = `${FileSystem.cacheDirectory}wotd-${encodeURIComponent(el)}.mp3`;
      await FileSystem.writeAsStringAsync(path, b64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const player = createAudioPlayer({ uri: path });
      player.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish) {
          setPlaying(false);
          player.remove();
        }
      });
      player.play();
    } catch {
      setPlaying(false);
    }
  }, [el, translit, en, playing]);

  return (
    <View
      style={{
        borderRadius: 22,
        padding: 22,
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: palette.line,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text
          style={{
            fontFamily: EYEBROW,
            fontSize: 9.5,
            letterSpacing: 2,
            color: palette.olive,
            textTransform: "uppercase",
          }}
        >
          Greek word of the day
        </Text>
        <Text
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: 1.4,
            color: palette.inkSoft,
          }}
        >
          /{translit}/
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 }}>
        <Text
          style={{
            flex: 1,
            fontFamily: DISPLAY,
            fontSize: 34,
            color: palette.ink,
          }}
        >
          {el}
        </Text>
        <Pressable
          onPress={speak}
          disabled={playing}
          hitSlop={10}
          accessibilityLabel="Hear pronunciation"
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: 999,
            backgroundColor: playing ? palette.aegean : palette.ink,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {playing ? (
            <ActivityIndicator size="small" color={palette.limestone} />
          ) : (
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path
                d="M11 5 6 9H3v6h3l5 4V5Z"
                fill={palette.limestone}
              />
              <Path
                d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a9 9 0 0 1 0 12"
                stroke={palette.limestone}
                strokeWidth={1.8}
                strokeLinecap="round"
              />
            </Svg>
          )}
        </Pressable>
      </View>
      <Text style={{ marginTop: 6, fontFamily: DISPLAY_MED, fontSize: 15, color: palette.olive }}>
        {en}
      </Text>
      <Text
        style={{
          marginTop: 10,
          fontFamily: SANS,
          fontSize: 13.5,
          lineHeight: 20,
          color: palette.inkSoft,
        }}
      >
        {meaning}
      </Text>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Road Pulse card                                                         */
/* ─────────────────────────────────────────────────────────────────────── */

function RoadPulseCard({
  live,
  buckets,
  nowHour,
}: {
  live: LivePulse;
  buckets: HourBucket[];
  nowHour: number;
}) {
  const hasData = live.observations > 0;
  const medianMin = Math.round(live.medianDelaySec / 60);
  const maxCount = Math.max(1, ...buckets.map((b) => b.sampleCount));

  return (
    <View style={{ marginTop: 22, paddingHorizontal: 20 }}>
      <View
        style={{
          borderRadius: 26,
          overflow: "hidden",
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: palette.line,
          padding: 22,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Eyebrow>Road pulse</Eyebrow>
            <Text
              style={{
                marginTop: 4,
                fontFamily: DISPLAY,
                fontSize: 22,
                lineHeight: 25,
                color: palette.ink,
              }}
            >
              How the island is flowing.
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
              <Text
                style={{
                  fontFamily: DISPLAY,
                  fontSize: 34,
                  color: palette.aegeanDeep,
                  letterSpacing: -0.4,
                }}
              >
                {hasData ? live.onTimePct : "—"}
              </Text>
              <Text
                style={{
                  fontFamily: EYEBROW,
                  fontSize: 10,
                  color: palette.inkSoft,
                  letterSpacing: 1.8,
                  textTransform: "uppercase",
                }}
              >
                %
              </Text>
            </View>
            <Text
              style={{
                fontFamily: EYEBROW,
                fontSize: 9,
                color: palette.inkSoft,
                letterSpacing: 1.6,
                textTransform: "uppercase",
                marginTop: 2,
              }}
            >
              On time
            </Text>
          </View>
        </View>

        {hasData ? (
          <>
            <View
              style={{
                flexDirection: "row",
                height: 8,
                borderRadius: 999,
                overflow: "hidden",
                marginTop: 18,
              }}
            >
              <View style={{ flex: live.latePct, backgroundColor: palette.ochre }} />
              <View style={{ flex: live.onTimePct, backgroundColor: palette.aegeanDeep }} />
              <View style={{ flex: live.earlyPct, backgroundColor: palette.olive }} />
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <PulseLeg color={palette.ochre} label="Late" pct={live.latePct} />
              <PulseLeg color={palette.aegeanDeep} label="On time" pct={live.onTimePct} />
              <PulseLeg color={palette.olive} label="Early" pct={live.earlyPct} />
            </View>
          </>
        ) : (
          <View
            style={{
              marginTop: 16,
              borderRadius: 16,
              padding: 14,
              backgroundColor: palette.limestoneSoft,
              borderWidth: 1,
              borderColor: palette.line,
            }}
          >
            <Text
              style={{
                fontFamily: EYEBROW,
                fontSize: 9.5,
                letterSpacing: 2,
                color: palette.inkSoft,
                textTransform: "uppercase",
              }}
            >
              Between runs
            </Text>
            <Text
              style={{
                marginTop: 6,
                fontFamily: SANS,
                fontSize: 13.5,
                lineHeight: 19,
                color: palette.ink,
              }}
            >
              Buses are quiet right now. The network wakes back up at first departure.
            </Text>
          </View>
        )}

        {buckets.length > 0 && (
          <View style={{ marginTop: 22 }}>
            <ActivityComb buckets={buckets} nowHour={nowHour} maxCount={maxCount} />
            <View
              style={{
                marginTop: 6,
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  fontFamily: MONO,
                  fontSize: 9.5,
                  letterSpacing: 1.4,
                  color: palette.inkSoft,
                }}
              >
                {hasData
                  ? `${live.observations.toLocaleString()} live · ${medianMin > 0 ? "+" : ""}${medianMin}m median`
                  : `${buckets.reduce((s, b) => s + b.sampleCount, 0).toLocaleString()} samples today`}
              </Text>
              <Text
                style={{
                  fontFamily: MONO,
                  fontSize: 9.5,
                  letterSpacing: 1.4,
                  color: palette.inkSoft,
                }}
              >
                00 · 06 · 12 · 18 h
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function PulseLeg({ color, label, pct }: { color: string; label: string; pct: number }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Text
          style={{
            fontFamily: EYEBROW,
            fontSize: 9,
            letterSpacing: 1.6,
            color: palette.inkSoft,
            textTransform: "uppercase",
          }}
        >
          {label}
        </Text>
      </View>
      <Text
        style={{
          marginTop: 4,
          fontFamily: DISPLAY_MED,
          fontSize: 16,
          color: palette.ink,
        }}
      >
        {pct}
        <Text style={{ fontFamily: MONO, fontSize: 10, color: palette.inkSoft }}>%</Text>
      </Text>
    </View>
  );
}

function ActivityComb({
  buckets,
  nowHour,
  maxCount,
}: {
  buckets: HourBucket[];
  nowHour: number;
  maxCount: number;
}) {
  const w = 300;
  const h = 46;
  const cw = w / 24;
  return (
    <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {buckets.map((b) => {
        const bh = Math.max(2, (b.sampleCount / maxCount) * (h - 6));
        const x = b.hour * cw + cw * 0.2;
        const bw = cw * 0.6;
        const isNow = b.hour === nowHour;
        const late = b.meanDelaySec > 90;
        const early = b.meanDelaySec < -90;
        const color = late ? palette.ochre : early ? palette.olive : palette.aegeanDeep;
        return (
          <Rect
            key={b.hour}
            x={x}
            y={h - bh - 2}
            width={bw}
            height={bh}
            rx={1.2}
            fill={color}
            opacity={isNow ? 1 : 0.45}
          />
        );
      })}
      <Path
        d={`M${nowHour * cw + cw / 2} 0 L${nowHour * cw + cw / 2} ${h}`}
        stroke={palette.ink}
        strokeWidth={0.8}
        opacity={0.35}
      />
    </Svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Live signals                                                            */
/* ─────────────────────────────────────────────────────────────────────── */

function LiveSignals({ bundle }: { bundle: PulseLiveBundle }) {
  const hasAny =
    bundle.news ||
    bundle.marine ||
    bundle.air ||
    (bundle.metWarnings && bundle.metWarnings.count > 0) ||
    (bundle.cruises && bundle.cruises.count > 0) ||
    bundle.flights.length > 0 ||
    (bundle.events && bundle.events.count > 0) ||
    (bundle.fixtures && bundle.fixtures.count > 0) ||
    (bundle.traffic && bundle.traffic.count > 0);

  if (!hasAny) return null;

  return (
    <View style={{ marginTop: 28, paddingHorizontal: 20 }}>
      <Eyebrow>Live signals · {bundle.focus.label}</Eyebrow>

      <View style={{ gap: 12, marginTop: 12 }}>
        {bundle.metWarnings && bundle.metWarnings.count > 0 && (
          <MetWarningCard payload={bundle.metWarnings} />
        )}
        {bundle.news && bundle.news.count > 0 && <NewsCard payload={bundle.news} />}
        {bundle.marine && bundle.focus.coastal && (
          <MarineCard payload={bundle.marine} city={bundle.focus.label} />
        )}
        {bundle.air && <AirCard payload={bundle.air} city={bundle.focus.label} />}
        {bundle.traffic && bundle.traffic.count > 0 && (
          <TrafficCard payload={bundle.traffic} city={bundle.focus.label} />
        )}
        {bundle.cruises && bundle.cruises.count > 0 && (
          <CruiseCard payload={bundle.cruises} />
        )}
        {bundle.flights.length > 0 && <FlightsCard payloads={bundle.flights} />}
        {bundle.events && bundle.events.count > 0 && <EventsCard payload={bundle.events} />}
        {bundle.fixtures && bundle.fixtures.count > 0 && (
          <FixturesCard payload={bundle.fixtures} />
        )}
      </View>
    </View>
  );
}

function MetWarningCard({ payload }: { payload: MetWarningsPayload }) {
  const worst = payload.warnings[0];
  if (!worst) return null;
  const tone =
    worst.level === "red" ? "#B23A2E" : worst.level === "orange" ? palette.ochre : "#B69233";
  return (
    <SignalCard tone={tone} kicker={`Weather warning · ${worst.level.toUpperCase()}`}>
      <Text
        style={{
          fontFamily: DISPLAY_MED,
          fontSize: 17,
          lineHeight: 22,
          color: palette.ink,
        }}
      >
        {worst.kind} — {worst.area}
      </Text>
      <Text
        style={{ marginTop: 6, fontFamily: SANS, fontSize: 13, lineHeight: 19, color: palette.inkSoft }}
      >
        {worst.summary}
      </Text>
      {payload.count > 1 && (
        <Text
          style={{
            marginTop: 8,
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: 1.2,
            color: palette.inkSoft,
          }}
        >
          + {payload.count - 1} more warning{payload.count > 2 ? "s" : ""}
        </Text>
      )}
    </SignalCard>
  );
}

function NewsCard({ payload }: { payload: NewsPayload }) {
  const [i, setI] = useState(0);
  const items = payload.items.slice(0, 6);
  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % items.length), 7000);
    return () => clearInterval(t);
  }, [items.length]);
  const item = items[i];
  if (!item) return null;
  return (
    <SignalCard tone={palette.aegeanDeep} kicker={`News · ${item.source}`} image={assets.pulse_news_kafenion}>
      <Pressable
        onPress={async () => {
          await Haptics.selectionAsync();
          Linking.openURL(item.url).catch(() => {});
        }}
      >
        <Text
          style={{
            fontFamily: DISPLAY_MED,
            fontSize: 17,
            lineHeight: 22,
            color: palette.ink,
          }}
        >
          {item.title}
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: 1.2,
            color: palette.inkSoft,
          }}
        >
          {relativeAgo(item.publishedAt)} · Tap to read
        </Text>
      </Pressable>
      {items.length > 1 && (
        <View style={{ flexDirection: "row", gap: 4, marginTop: 12 }}>
          {items.map((_, k) => (
            <View
              key={k}
              style={{
                width: 16,
                height: 3,
                borderRadius: 2,
                backgroundColor: k === i ? palette.aegeanDeep : palette.line,
              }}
            />
          ))}
        </View>
      )}
    </SignalCard>
  );
}

function MarineCard({ payload, city }: { payload: MarinePayload; city: string }) {
  const verdictTone =
    payload.beachVerdict === "great"
      ? palette.olive
      : payload.beachVerdict === "good"
      ? palette.aegeanDeep
      : palette.ochre;
  return (
    <SignalCard tone={palette.aegeanDeep} kicker={`Sea · ${city}`} image={assets.pulse_sea_card}>
      <View style={{ flexDirection: "row", gap: 20, alignItems: "flex-end" }}>
        <StatFigure
          value={payload.seaTempC != null ? Math.round(payload.seaTempC).toString() : "—"}
          unit="°C"
          label="Water"
        />
        <StatFigure
          value={payload.waveHeightM != null ? payload.waveHeightM.toFixed(1) : "—"}
          unit="m"
          label="Waves"
        />
      </View>
      {payload.beachVerdict && (
        <Text
          style={{
            marginTop: 12,
            fontFamily: EYEBROW,
            fontSize: 10,
            letterSpacing: 1.8,
            color: verdictTone,
            textTransform: "uppercase",
          }}
        >
          Beach verdict · {payload.beachVerdict}
        </Text>
      )}
      <Text
        style={{ marginTop: 4, fontFamily: SANS, fontSize: 13, lineHeight: 19, color: palette.inkSoft }}
      >
        {payload.summary}
      </Text>
    </SignalCard>
  );
}

function AirCard({ payload, city }: { payload: AirPayload; city: string }) {
  const bandColor =
    payload.band === "good"
      ? palette.olive
      : payload.band === "fair"
      ? palette.aegeanDeep
      : payload.band === "moderate"
      ? "#B69233"
      : payload.band === "poor"
      ? palette.ochre
      : "#B23A2E";
  return (
    <SignalCard tone={bandColor} kicker={`Air · ${city}`} image={assets.pulse_sky_card}>
      <View style={{ flexDirection: "row", gap: 20, alignItems: "flex-end" }}>
        <StatFigure
          value={payload.europeanAqi != null ? Math.round(payload.europeanAqi).toString() : "—"}
          unit="AQI"
          label="European"
        />
        <StatFigure
          value={payload.pm10 != null ? Math.round(payload.pm10).toString() : "—"}
          unit="µg"
          label="PM10"
        />
      </View>
      {payload.band && (
        <Text
          style={{
            marginTop: 12,
            fontFamily: EYEBROW,
            fontSize: 10,
            letterSpacing: 1.8,
            color: bandColor,
            textTransform: "uppercase",
          }}
        >
          {payload.dustAlert ? "Dust advisory · " : ""}
          {payload.band}
        </Text>
      )}
      <Text
        style={{ marginTop: 4, fontFamily: SANS, fontSize: 13, lineHeight: 19, color: palette.inkSoft }}
      >
        {payload.summary}
      </Text>
    </SignalCard>
  );
}

function TrafficCard({ payload, city }: { payload: TrafficLivePayload; city: string }) {
  const tone =
    payload.highest === "high" ? "#B23A2E" : payload.highest === "medium" ? palette.ochre : palette.olive;
  const list = payload.incidents.slice(0, 3);
  // Mirror web PulseLiveSection: pick a variant photo per dominant incident kind.
  const dominantKind = list[0]?.kind?.toLowerCase() ?? "";
  const trafficImg = dominantKind.includes("roadwork")
    ? assets.pulse_traffic_roadworks
    : dominantKind.includes("closure") || dominantKind.includes("closed")
    ? assets.pulse_traffic_closure
    : dominantKind.includes("congest") || dominantKind.includes("jam")
    ? assets.pulse_traffic_congestion
    : assets.pulse_traffic_card;
  return (
    <SignalCard tone={tone} kicker={`Roads · ${city}`} image={trafficImg}>
      <Text style={{ fontFamily: DISPLAY_MED, fontSize: 17, lineHeight: 22, color: palette.ink }}>
        {payload.count} live incident{payload.count === 1 ? "" : "s"}
      </Text>
      <View style={{ marginTop: 10, gap: 8 }}>
        {list.map((i) => (
          <View key={i.id}>
            <Text
              style={{
                fontFamily: EYEBROW,
                fontSize: 9.5,
                letterSpacing: 1.8,
                color: tone,
                textTransform: "uppercase",
              }}
            >
              {i.kind} · {i.severity}
            </Text>
            <Text style={{ marginTop: 2, fontFamily: SANS_BOLD, fontSize: 13.5, color: palette.ink }}>
              {i.road ?? "Unnamed road"}
            </Text>
            <Text style={{ marginTop: 1, fontFamily: SANS, fontSize: 12.5, color: palette.inkSoft }}>
              {i.headline}
            </Text>
          </View>
        ))}
      </View>
    </SignalCard>
  );
}

function CruiseCard({ payload }: { payload: CruisesPayload }) {
  return (
    <SignalCard tone={palette.aegeanDeep} kicker="Port · Limassol" image={assets.pulse_cruise_card}>
      <View style={{ flexDirection: "row", gap: 20, alignItems: "flex-end" }}>
        <StatFigure value={String(payload.count)} unit="ships" label="Today" />
        <StatFigure
          value={payload.totalPassengers.toLocaleString()}
          unit=""
          label="Passengers"
        />
      </View>
      <Text
        style={{ marginTop: 12, fontFamily: SANS, fontSize: 13, lineHeight: 19, color: palette.inkSoft }}
      >
        {payload.summary}
      </Text>
    </SignalCard>
  );
}

function FlightsCard({ payloads }: { payloads: FlightsPayload[] }) {
  return (
    <SignalCard tone={palette.aegeanDeep} kicker="Airports · Next hour">
      <View style={{ gap: 14 }}>
        {payloads.map((p) => (
          <View key={p.airport}>
            <Text style={{ fontFamily: SANS_BOLD, fontSize: 13.5, color: palette.ink }}>
              {p.city}
            </Text>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 6 }}>
              <StatFigure value={String(p.arrivalsNext60)} unit="" label="Arrivals" small />
              <StatFigure value={String(p.departuresNext60)} unit="" label="Departures" small />
            </View>
            <Text style={{ marginTop: 6, fontFamily: SANS, fontSize: 12.5, color: palette.inkSoft }}>
              {p.summary}
            </Text>
          </View>
        ))}
      </View>
    </SignalCard>
  );
}

function EventsCard({ payload }: { payload: EventsPayload }) {
  const list = payload.events.slice(0, 3);
  return (
    <SignalCard tone={palette.ochre} kicker={`Events · ${payload.count} on`}>
      <View style={{ gap: 10 }}>
        {list.map((e, i) => (
          <View key={i}>
            <Text style={{ fontFamily: DISPLAY_MED, fontSize: 15, color: palette.ink }}>
              {e.title}
            </Text>
            <Text style={{ marginTop: 2, fontFamily: SANS, fontSize: 12.5, color: palette.inkSoft }}>
              {[e.city, e.venue].filter(Boolean).join(" · ")}
              {e.startDate ? ` · ${formatShortDate(e.startDate)}` : ""}
            </Text>
          </View>
        ))}
      </View>
    </SignalCard>
  );
}

function FixturesCard({ payload }: { payload: FixturesPayload }) {
  const list = payload.fixtures.slice(0, 3);
  return (
    <SignalCard tone={palette.olive} kicker="Football · Today">
      <View style={{ gap: 10 }}>
        {list.map((f, i) => (
          <View key={i}>
            <Text style={{ fontFamily: DISPLAY_MED, fontSize: 15, color: palette.ink }}>
              {f.home} v {f.away}
            </Text>
            <Text style={{ marginTop: 2, fontFamily: SANS, fontSize: 12.5, color: palette.inkSoft }}>
              {[f.competition, f.venue, f.city].filter(Boolean).join(" · ")}
              {f.kickoff ? ` · ${formatKickoff(f.kickoff)}` : ""}
            </Text>
          </View>
        ))}
      </View>
    </SignalCard>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Primitives                                                              */
/* ─────────────────────────────────────────────────────────────────────── */

function SignalCard({
  tone,
  kicker,
  children,
  image,
  imageTone = "light",
}: {
  tone: string;
  kicker: string;
  children: React.ReactNode;
  image?: { uri: string };
  imageTone?: "light" | "dark";
}) {
  return (
    <View
      style={{
        borderRadius: 22,
        padding: 20,
        paddingLeft: 22,
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: palette.line,
        overflow: "hidden",
      }}
    >
      {image && (
        <>
          <Image
            source={image}
            resizeMode="cover"
            style={StyleSheet.absoluteFill}
          />
          {/* Legibility wash — soft parchment gradient over the photo so the
              typography reads at Apple-grade contrast on any imagery. */}
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor:
                  imageTone === "dark"
                    ? "rgba(15,26,32,0.62)"
                    : "rgba(246,241,231,0.86)",
              },
            ]}
          />
        </>
      )}
      <View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          backgroundColor: tone,
          opacity: 0.85,
        }}
      />
      <Text
        style={{
          fontFamily: EYEBROW,
          fontSize: 9.5,
          letterSpacing: 2,
          color: tone,
          textTransform: "uppercase",
        }}
      >
        {kicker}
      </Text>
      <View style={{ marginTop: 8 }}>{children}</View>
    </View>
  );
}

function StatFigure({
  value,
  unit,
  label,
  small,
}: {
  value: string;
  unit: string;
  label: string;
  small?: boolean;
}) {
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
        <Text
          style={{
            fontFamily: DISPLAY,
            fontSize: small ? 22 : 30,
            color: palette.ink,
            letterSpacing: -0.4,
          }}
        >
          {value}
        </Text>
        {unit ? (
          <Text
            style={{
              fontFamily: EYEBROW,
              fontSize: 10,
              letterSpacing: 1.6,
              color: palette.inkSoft,
              textTransform: "uppercase",
            }}
          >
            {unit}
          </Text>
        ) : null}
      </View>
      <Text
        style={{
          marginTop: 2,
          fontFamily: EYEBROW,
          fontSize: 9,
          letterSpacing: 1.6,
          color: palette.inkSoft,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function Eyebrow({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "aegean" | "ochre" | "olive";
}) {
  const color =
    tone === "aegean"
      ? palette.aegeanDeep
      : tone === "ochre"
      ? palette.ochre
      : tone === "olive"
      ? palette.olive
      : palette.inkSoft;
  return (
    <Text
      style={{
        fontFamily: EYEBROW,
        fontSize: 10,
        letterSpacing: 2.2,
        color,
        textTransform: "uppercase",
      }}
    >
      {children}
    </Text>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <View
      style={{
        borderRadius: 20,
        padding: 18,
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: palette.line,
      }}
    >
      <Text
        style={{
          fontFamily: EYEBROW,
          fontSize: 10,
          letterSpacing: 2,
          color: palette.ochre,
          textTransform: "uppercase",
        }}
      >
        Feed offline
      </Text>
      <Text style={{ marginTop: 6, fontFamily: SANS, fontSize: 13.5, color: palette.ink }}>
        {message}
      </Text>
    </View>
  );
}

function UpdatedFooter({ generatedAt }: { generatedAt: number }) {
  const label = useMemo(() => {
    const d = new Date(generatedAt * 1000);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `Updated ${hh}:${mm}`;
  }, [generatedAt]);
  return (
    <View style={{ marginTop: 28, alignItems: "center" }}>
      <Text
        style={{
          fontFamily: EYEBROW,
          fontSize: 9.5,
          letterSpacing: 2,
          color: palette.inkSoft,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Utils                                                                    */
/* ─────────────────────────────────────────────────────────────────────── */

function relativeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function formatKickoff(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
