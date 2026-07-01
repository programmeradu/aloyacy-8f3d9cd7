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
  Line,
  Ellipse,
  Defs,
  LinearGradient as SvgLinearGradient,
  RadialGradient as SvgRadialGradient,
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
const SANS = "Geist_600SemiBold";
const SANS_BOLD = "Geist_700Bold";
const MONO = "JetBrainsMono_500Medium";
const EYEBROW = "JetBrainsMono_500Medium";

const THEME_HERO: Record<TodayTheme, { uri: string }> = {
  derby: assets.today_derby,
  festival: assets.today_festival,
  holiday: assets.today_calm,
  cruise: assets.today_cruise,
  heatwave: assets.today_heatwave,
  storm: assets.today_storm,
  calm: assets.today_calm,
};



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
          <Eyebrow>On the island right now</Eyebrow>
          <View style={{ gap: 12, marginTop: 10 }}>
            {briefing.tiles.map((t, i) => (
              <TileCard key={i} tile={t} />
            ))}
          </View>
        </View>
      )}

      {/* Editor's note — aegean-tinted card with an oversized opening quote */}
      <View
        style={{
          marginTop: 20,
          borderRadius: 22,
          padding: 22,
          paddingTop: 20,
          backgroundColor: "rgba(31,108,130,0.06)",
          borderWidth: 1,
          borderColor: "rgba(31,108,130,0.18)",
          overflow: "hidden",
        }}
      >
        <Text
          aria-hidden
          style={{
            position: "absolute",
            top: -18,
            left: 12,
            fontFamily: DISPLAY,
            fontSize: 88,
            lineHeight: 88,
            color: "rgba(31,108,130,0.18)",
          }}
        >
          {"\u201C"}
        </Text>
        <Eyebrow tone="aegean">Editor's note</Eyebrow>
        <Text
          style={{
            marginTop: 8,
            fontFamily: DISPLAY,
            fontSize: 18,
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

      {/* Did you know / For visitors — glyphed fact card */}
      <View
        style={{
          marginTop: 14,
          borderRadius: 22,
          padding: 20,
          paddingRight: 92,
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: palette.line,
          overflow: "hidden",
        }}
      >
        <View style={{ position: "absolute", right: -8, top: -8, opacity: 0.85 }}>
          <TileGlyph
            kind={briefing.fact.tag === "tourist" ? "festival" : "nameday"}
            color={briefing.fact.tag === "tourist" ? palette.aegeanDeep : palette.ochre}
          />
        </View>
        <Eyebrow tone={briefing.fact.tag === "tourist" ? "aegean" : "ochre"}>
          {briefing.fact.tag === "tourist" ? "For visitors" : "Did you know"}
        </Eyebrow>
        <Text
          style={{
            marginTop: 8,
            fontFamily: DISPLAY,
            fontSize: 16,
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
    <View style={{ height: 200, backgroundColor: heroBg(theme), overflow: "hidden" }}>
      <Image
        source={THEME_HERO[theme] ?? assets.today_calm}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "55%",
          backgroundColor: palette.white,
          opacity: 0.35,
        }}
      />

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

/** Bespoke SVG glyphs for tile kinds — mirrors src/components/TodayTileGlyph.tsx. */
function TileGlyph({ kind, color }: { kind: TodayTile["kind"]; color: string }) {
  const s = 86;
  const card = palette.white;
  return (
    <Svg width={s} height={s} viewBox="0 0 96 96">
      {kind === "match" && (
        <>
          <Defs>
            <SvgRadialGradient id="g-match" cx="50%" cy="40%" r="55%">
              <SvgStop offset="0%" stopColor={color} stopOpacity="0.22" />
              <SvgStop offset="100%" stopColor={color} stopOpacity="0" />
            </SvgRadialGradient>
          </Defs>
          <Rect x={0} y={0} width={96} height={96} fill="url(#g-match)" />
          <Rect x={18} y={22} width={2} height={40} fill={color} opacity={0.45} />
          <Rect x={76} y={22} width={2} height={40} fill={color} opacity={0.45} />
          <Path d="M14 18 H24 V26 H14 Z" fill={color} opacity={0.85} />
          <Path d="M72 18 H82 V26 H72 Z" fill={color} opacity={0.85} />
          <Path d="M10 70 Q48 56 86 70 L86 78 Q48 64 10 78 Z" fill={color} opacity={0.18} />
          <Path d="M14 72 Q48 60 82 72 L82 76 Q48 64 14 76 Z" fill={color} opacity={0.55} />
          <Path d="M30 78 Q48 73 66 78" stroke={color} strokeWidth={1.2} opacity={0.65} fill="none" />
        </>
      )}
      {kind === "festival" && (
        <>
          <Path d="M8 22 Q48 42 88 22" stroke={color} strokeWidth={1.2} opacity={0.55} fill="none" />
          <Path d="M22 26 L30 26 L26 42 Z" fill={color} opacity={0.85} />
          <Path d="M40 32 L50 32 L45 50 Z" fill={color} opacity={0.55} />
          <Path d="M60 33 L70 33 L65 50 Z" fill={color} opacity={0.75} />
          <Circle cx={16} cy={56} r={1.8} fill={color} opacity={0.7} />
          <Circle cx={80} cy={60} r={2.2} fill={color} opacity={0.55} />
          <Circle cx={50} cy={68} r={1.6} fill={color} opacity={0.8} />
          <Circle cx={34} cy={74} r={2} fill={color} opacity={0.4} />
          <Circle cx={72} cy={78} r={1.4} fill={color} opacity={0.65} />
        </>
      )}
      {kind === "cruise" && (
        <>
          <Circle cx={74} cy={22} r={8} fill={color} opacity={0.25} />
          <Path d="M10 50 L74 50 L66 62 L18 62 Z" fill={color} opacity={0.85} />
          <Rect x={22} y={38} width={38} height={12} fill={color} opacity={0.45} />
          <Rect x={26} y={42} width={3} height={3} fill={card} />
          <Rect x={34} y={42} width={3} height={3} fill={card} />
          <Rect x={42} y={42} width={3} height={3} fill={card} />
          <Rect x={50} y={42} width={3} height={3} fill={card} />
          <Rect x={44} y={30} width={4} height={10} fill={color} opacity={0.7} />
          <Rect x={52} y={30} width={4} height={10} fill={color} opacity={0.7} />
          <Path d="M6 72 Q18 68 30 72 T54 72 T78 72 T96 72" stroke={color} strokeWidth={1.4} fill="none" opacity={0.55} />
          <Path d="M6 80 Q18 76 30 80 T54 80 T78 80 T96 80" stroke={color} strokeWidth={1.4} fill="none" opacity={0.35} />
        </>
      )}
      {kind === "holiday" && (
        <>
          <Circle cx={60} cy={32} r={14} fill={color} opacity={0.22} />
          <Circle cx={60} cy={32} r={9} fill={color} opacity={0.85} />
          <Path d="M30 86 Q26 60 22 36" stroke={color} strokeWidth={2.2} fill="none" opacity={0.85} strokeLinecap="round" />
          <Path d="M22 36 Q10 30 4 38" stroke={color} strokeWidth={1.6} fill="none" opacity={0.7} strokeLinecap="round" />
          <Path d="M22 36 Q26 22 38 20" stroke={color} strokeWidth={1.6} fill="none" opacity={0.7} strokeLinecap="round" />
          <Path d="M22 36 Q14 44 8 56" stroke={color} strokeWidth={1.6} fill="none" opacity={0.55} strokeLinecap="round" />
          <Path d="M22 36 Q34 36 44 44" stroke={color} strokeWidth={1.6} fill="none" opacity={0.55} strokeLinecap="round" />
        </>
      )}
      {kind === "nameday" && (
        <>
          {[-1, 1].map((sx) => (
            <G key={sx} transform={`translate(48 50) scale(${sx} 1)`}>
              <Path d="M0 -28 Q20 -18 22 0 Q20 18 0 28" stroke={color} strokeWidth={1.4} fill="none" opacity={0.55} />
              {[-22, -10, 2, 14].map((y, i) => (
                <Ellipse
                  key={i}
                  cx={20}
                  cy={y}
                  rx={6}
                  ry={3}
                  fill={color}
                  opacity={0.55 + (i % 2) * 0.2}
                  transform={`rotate(${-30 + i * 18} 20 ${y})`}
                />
              ))}
            </G>
          ))}
          <Circle cx={48} cy={50} r={3} fill={color} opacity={0.8} />
        </>
      )}
      {kind === "weather-sun" && (
        <>
          <Circle cx={48} cy={50} r={14} fill={color} opacity={0.85} />
          <Circle cx={48} cy={50} r={22} stroke={color} strokeWidth={1} fill="none" opacity={0.25} />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * Math.PI) / 6;
            const r1 = 26;
            const r2 = i % 2 === 0 ? 36 : 32;
            return (
              <Line
                key={i}
                x1={48 + Math.cos(a) * r1}
                y1={50 + Math.sin(a) * r1}
                x2={48 + Math.cos(a) * r2}
                y2={50 + Math.sin(a) * r2}
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.7}
              />
            );
          })}
        </>
      )}
      {kind === "weather-rain" && (
        <>
          <Path
            d="M22 50 Q22 38 34 38 Q38 28 50 30 Q64 30 66 42 Q78 42 78 52 Q78 60 70 60 L30 60 Q22 60 22 50 Z"
            fill={color}
            opacity={0.65}
          />
          {[0, 1, 2].map((i) => (
            <Path
              key={i}
              d={`M${36 + i * 12} 70 L${30 + i * 12} 84`}
              stroke={color}
              strokeWidth={2.4}
              strokeLinecap="round"
              opacity={0.75 - i * 0.12}
              fill="none"
            />
          ))}
        </>
      )}
      {kind === "weather-cloud" && (
        <>
          <Path
            d="M16 58 Q16 44 30 44 Q34 32 48 34 Q64 34 66 48 Q82 48 82 60 Q82 70 72 70 L26 70 Q16 70 16 58 Z"
            fill={color}
            opacity={0.4}
          />
          <Path
            d="M22 60 Q22 50 32 50 Q36 42 46 44 Q58 44 60 54 Q72 54 72 62 Q72 70 64 70 L30 70 Q22 70 22 60 Z"
            fill={color}
            opacity={0.85}
          />
        </>
      )}
      {kind === "rhythm" && (
        <>
          <Circle cx={48} cy={50} r={26} stroke={color} strokeWidth={1.4} fill="none" opacity={0.5} />
          <Circle cx={48} cy={50} r={20} fill={color} opacity={0.1} />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * Math.PI) / 6;
            const r1 = 23;
            const r2 = i % 3 === 0 ? 19 : 21;
            return (
              <Line
                key={i}
                x1={48 + Math.cos(a) * r2}
                y1={50 + Math.sin(a) * r2}
                x2={48 + Math.cos(a) * r1}
                y2={50 + Math.sin(a) * r1}
                stroke={color}
                strokeWidth={i % 3 === 0 ? 1.8 : 1}
                opacity={0.7}
                strokeLinecap="round"
              />
            );
          })}
          <Line x1={48} y1={50} x2={48} y2={34} stroke={color} strokeWidth={2} strokeLinecap="round" opacity={0.85} />
          <Line x1={48} y1={50} x2={60} y2={54} stroke={color} strokeWidth={2.2} strokeLinecap="round" opacity={0.85} />
          <Circle cx={48} cy={50} r={2.2} fill={color} />
        </>
      )}
    </Svg>
  );
}

/**
 * Bespoke Greek word glyph — mirrors the web GreekWordGlyph. Categorises
 * the word by meaning (greeting, courtesy, transit, food, place, vibe) and
 * renders a matching Cypriot motif with an ochre wash. Sits behind the
 * card content so numerals and letters stay the hero.
 */
type GreekCategory = "greeting" | "courtesy" | "transit" | "food" | "place" | "vibe";
const GREEK_CATEGORY: Record<string, GreekCategory> = {
  "Καλημέρα": "greeting", "Καλησπέρα": "greeting", "Γεια σου": "greeting",
  "Καλώς ήρθες": "greeting", "Καληνύχτα": "greeting",
  "Ευχαριστώ": "courtesy", "Παρακαλώ": "courtesy", "Συγγνώμη": "courtesy",
  "Ναι": "courtesy", "Όχι": "courtesy",
  "Στάση": "transit", "Λεωφορείο": "transit", "Εισιτήριο": "transit", "Ένα λεπτό": "transit",
  "Καφές": "food", "Χαλλούμι": "food", "Σούβλα": "food", "Νόστιμο": "food",
  "Φέρτε μου": "food", "Λογαριασμό": "food", "Στην υγειά σου": "food",
  "Παραλία": "place", "Νερό": "place", "Πού είναι;": "place",
};

function GreekWordGlyph({ word }: { word: string }) {
  const cat: GreekCategory = GREEK_CATEGORY[word] ?? "vibe";
  const size = 128;
  const ochre = palette.ochre;
  const olive = palette.olive;
  const aegean = palette.aegeanDeep;
  const ink = palette.ink;
  const card = palette.white;

  const wash = (
    <Defs>
      <SvgLinearGradient id={`gw-${cat}`} x1="1" y1="0" x2="0" y2="1">
        <SvgStop offset="0" stopColor={ochre} stopOpacity="0.4" />
        <SvgStop offset="1" stopColor={ochre} stopOpacity="0" />
      </SvgLinearGradient>
    </Defs>
  );

  return (
    <Svg width={size} height={size} viewBox="0 0 128 128">
      {wash}
      <Rect x="0" y="0" width="128" height="128" fill={`url(#gw-${cat})`} />
      {cat === "greeting" && (
        <G>
          <Circle cx={86} cy={46} r={18} fill={ochre} opacity={0.85} />
          <Circle cx={86} cy={46} r={26} stroke={ochre} strokeWidth={1} fill="none" opacity={0.35} />
          <Path d="M0 92 Q32 70 60 86 Q92 104 128 80 L128 128 L0 128 Z" fill={olive} opacity={0.2} />
          <Path d="M0 104 Q40 88 76 100 Q104 110 128 96 L128 128 L0 128 Z" fill={olive} opacity={0.55} />
        </G>
      )}
      {cat === "courtesy" && (
        <G>
          <Path d="M64 38 Q88 50 90 70 Q88 92 64 102" stroke={olive} strokeWidth={1.4} fill="none" opacity={0.6} />
          <Path d="M64 38 Q40 50 38 70 Q40 92 64 102" stroke={olive} strokeWidth={1.4} fill="none" opacity={0.6} />
          <Circle cx={64} cy={70} r={3} fill={olive} opacity={0.8} />
        </G>
      )}
      {cat === "transit" && (
        <G>
          <Rect x={20} y={50} width={80} height={38} rx={8} fill={aegean} opacity={0.85} />
          <Rect x={26} y={56} width={20} height={14} rx={2} fill={card} opacity={0.9} />
          <Rect x={50} y={56} width={20} height={14} rx={2} fill={card} opacity={0.9} />
          <Rect x={74} y={56} width={20} height={14} rx={2} fill={card} opacity={0.9} />
          <Circle cx={36} cy={92} r={7} fill={ink} opacity={0.85} />
          <Circle cx={86} cy={92} r={7} fill={ink} opacity={0.85} />
        </G>
      )}
      {cat === "food" && (
        <G>
          <Path d="M40 70 L88 70 L84 100 Q84 106 78 106 L50 106 Q44 106 44 100 Z" fill={olive} opacity={0.85} />
          <Path d="M88 76 Q102 76 102 86 Q102 96 88 96" stroke={olive} strokeWidth={2.5} fill="none" opacity={0.7} />
          <Path d="M52 60 Q56 50 52 40 Q48 30 52 22" stroke={ink} strokeWidth={1.5} fill="none" opacity={0.4} strokeLinecap="round" />
          <Path d="M64 60 Q68 50 64 40 Q60 30 64 22" stroke={ink} strokeWidth={1.5} fill="none" opacity={0.32} strokeLinecap="round" />
          <Path d="M76 60 Q80 50 76 40 Q72 30 76 22" stroke={ink} strokeWidth={1.5} fill="none" opacity={0.24} strokeLinecap="round" />
        </G>
      )}
      {cat === "place" && (
        <G>
          <Circle cx={90} cy={40} r={14} fill={ochre} opacity={0.85} />
          <Path d="M0 64 Q16 60 32 64 Q48 68 64 64 Q80 60 96 64 Q112 68 128 64" stroke={aegean} strokeWidth={1.6} fill="none" opacity={0.7} />
          <Path d="M0 78 Q16 74 32 78 Q48 82 64 78 Q80 74 96 78 Q112 82 128 78" stroke={aegean} strokeWidth={1.6} fill="none" opacity={0.55} />
          <Path d="M0 92 Q16 88 32 92 Q48 96 64 92 Q80 88 96 92 Q112 96 128 92" stroke={aegean} strokeWidth={1.6} fill="none" opacity={0.4} />
        </G>
      )}
      {cat === "vibe" && (
        <G>
          <Path d="M20 100 Q54 72 102 32" stroke={olive} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.85} />
          <Circle cx={46} cy={78} r={3} fill={ink} opacity={0.65} />
          <Circle cx={68} cy={62} r={3} fill={ink} opacity={0.55} />
          <Circle cx={86} cy={46} r={3} fill={ink} opacity={0.7} />
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
      const b64 = (globalThis as { btoa?: (s: string) => string }).btoa?.(bin) ?? "";
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
        paddingRight: 24,
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: palette.line,
        overflow: "hidden",
      }}
    >
      <View
        pointerEvents="none"
        style={{ position: "absolute", right: -12, top: -12, opacity: 0.9 }}
      >
        <GreekWordGlyph word={el} />
      </View>
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
  const totalToday = buckets.reduce((s, b) => s + b.sampleCount, 0);

  const summary =
    medianMin >= 1
      ? `Right now, buses are running about ${medianMin} min late on average.`
      : medianMin <= -1
        ? `Right now, buses are running about ${Math.abs(medianMin)} min early on average.`
        : "Right now, most buses are running on time.";

  return (
    <View style={{ marginTop: 22, paddingHorizontal: 20 }}>
      <View
        style={{
          borderRadius: 26,
          overflow: "hidden",
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: palette.line,
        }}
      >
        {/* Editorial illustration band */}
        <View style={{ position: "relative", width: "100%", aspectRatio: 16 / 7 }}>
          <Image
            source={assets.pulse_network_band}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          {/* Bottom fade into card */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "60%",
              backgroundColor: "transparent",
            }}
          >
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "100%",
                backgroundColor: palette.white,
                opacity: 0.55,
              }}
            />
          </View>

          {/* Kicker + title top-left */}
          <View
            style={{
              position: "absolute",
              top: 18,
              left: 18,
              right: 18,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: EYEBROW,
                  fontSize: 10,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: palette.inkSoft,
                }}
              >
                Last 60 minutes
              </Text>
              <Text
                style={{
                  marginTop: 6,
                  fontFamily: DISPLAY,
                  fontSize: 22,
                  lineHeight: 25,
                  color: palette.ink,
                  maxWidth: 180,
                }}
              >
                How the network is moving
              </Text>
            </View>

            {/* Floating on-time chip */}
            <View
              style={{
                backgroundColor: "rgba(255,255,255,0.94)",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: palette.line,
                paddingHorizontal: 12,
                paddingVertical: 8,
                alignItems: "flex-end",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
                <Text
                  style={{
                    fontFamily: DISPLAY,
                    fontSize: 32,
                    lineHeight: 32,
                    color: palette.aegeanDeep,
                    letterSpacing: -0.6,
                  }}
                >
                  {hasData ? live.onTimePct : "—"}
                </Text>
                <Text
                  style={{
                    fontFamily: EYEBROW,
                    fontSize: 10,
                    letterSpacing: 1.8,
                    textTransform: "uppercase",
                    color: palette.inkSoft,
                  }}
                >
                  %
                </Text>
              </View>
              <Text
                style={{
                  marginTop: 3,
                  fontFamily: EYEBROW,
                  fontSize: 9,
                  letterSpacing: 1.6,
                  textTransform: "uppercase",
                  color: palette.inkSoft,
                }}
              >
                On time
              </Text>
            </View>
          </View>
        </View>

        {/* Body */}
        <View style={{ paddingHorizontal: 22, paddingTop: 6, paddingBottom: 22 }}>
          {hasData ? (
            <>
              <View
                style={{
                  flexDirection: "row",
                  height: 8,
                  borderRadius: 999,
                  overflow: "hidden",
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
              <Text
                style={{
                  marginTop: 16,
                  fontFamily: SANS,
                  fontSize: 14,
                  lineHeight: 20,
                  color: palette.ink,
                }}
              >
                {summary}
              </Text>
            </>
          ) : (
            <View
              style={{
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
                No live signal in the past hour
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
                Buses are between runs. The network wakes back up at first morning departure.
              </Text>
            </View>
          )}

          {buckets.length > 0 && totalToday > 0 && (
            <View style={{ marginTop: 20 }}>
              <Text
                style={{
                  fontFamily: EYEBROW,
                  fontSize: 9,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: palette.inkSoft,
                }}
              >
                Bus activity today
              </Text>
              <View style={{ marginTop: 8 }}>
                <ActivityComb buckets={buckets} nowHour={nowHour} maxCount={maxCount} />
              </View>
              <View
                style={{
                  marginTop: 6,
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                {["Morning", "Midday", "Evening", "Late"].map((l) => (
                  <Text
                    key={l}
                    style={{
                      fontFamily: EYEBROW,
                      fontSize: 9,
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                      color: palette.inkSoft,
                    }}
                  >
                    {l}
                  </Text>
                ))}
              </View>
            </View>
          )}

          {hasData && (
            <Text
              style={{
                marginTop: 16,
                fontFamily: SANS,
                fontSize: 12,
                lineHeight: 17,
                color: palette.inkSoft,
              }}
            >
              {live.observations === 1
                ? "Based on 1 bus we checked in the last hour."
                : `Based on ${live.observations.toLocaleString()} buses we checked in the last hour.`}
            </Text>
          )}
        </View>
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
  imageTone: _imageTone = "light",
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
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: palette.line,
        overflow: "hidden",
      }}
    >
      {image && (
        <View
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: 16 / 8,
            backgroundColor: palette.limestoneSoft,
          }}
        >
          <Image source={image} resizeMode="cover" style={StyleSheet.absoluteFill} />
          {/* Kicker chip floats on the image — image itself remains fully visible. */}
          <View
            style={{
              position: "absolute",
              left: 14,
              top: 14,
              backgroundColor: "rgba(255,255,255,0.94)",
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: palette.line,
            }}
          >
            <Text
              style={{
                fontFamily: EYEBROW,
                fontSize: 9,
                letterSpacing: 1.8,
                color: tone,
                textTransform: "uppercase",
              }}
            >
              {kicker}
            </Text>
          </View>
        </View>
      )}
      <View style={{ position: "relative", padding: 20, paddingLeft: 22 }}>
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
        {!image && (
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
        )}
        <View style={{ marginTop: image ? 0 : 8 }}>{children}</View>
      </View>
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
