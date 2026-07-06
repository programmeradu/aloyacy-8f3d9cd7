// Pulse — "Today" editorial block: hero, tiles, editor's note, Greek word of
// the day and the fact card. Split out of the Pulse screen.

import { useCallback, useState } from "react";
import { View, Text, Image, Pressable, StyleSheet, ActivityIndicator, Platform, type TextStyle } from "react-native";
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
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import * as FileSystem from "expo-file-system/legacy";
import { createAudioPlayer } from "expo-audio";
import { palette } from "@/constants/theme";
import { assets } from "@/lib/assets";
import { API_BASE } from "@/lib/api";
import type { TodayBriefing, TodayTile, TodayTheme } from "@/lib/pulse";
import { DISPLAY, DISPLAY_MED, SANS, SANS_BOLD, MONO, EYEBROW, Eyebrow } from "./kit";

const GREEK_WORD_TYPE: TextStyle =
  Platform.select<TextStyle>({
    web: {
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontWeight: "800",
    },
    ios: { fontWeight: "800" },
    android: { fontFamily: "sans-serif-condensed", fontWeight: "700" },
    default: { fontFamily: SANS_BOLD },
  }) ?? { fontFamily: SANS_BOLD };

const THEME_HERO: Record<TodayTheme, { uri: string }> = {
  derby: assets.today_derby,
  festival: assets.today_festival,
  holiday: assets.today_calm,
  cruise: assets.today_cruise,
  heatwave: assets.today_heatwave,
  storm: assets.today_storm,
  calm: assets.today_calm,
};
/* ─────────────────────────────────────────────────────────────────────── */
/* Today editorial                                                         */
/* ─────────────────────────────────────────────────────────────────────── */

export function TodaySection({ briefing }: { briefing: TodayBriefing }) {
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

export function TodayHero({
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

export function heroBg(theme: TodayTheme): string {
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


export function TileCard({ tile }: { tile: TodayTile }) {
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

export function accentColor(a: TodayTile["accent"]): string {
  switch (a) {
    case "ochre": return palette.ochre;
    case "aegean": return palette.aegeanDeep;
    case "olive": return palette.olive;
    default: return palette.ink;
  }
}

/** Bespoke SVG glyphs for tile kinds — mirrors src/components/TodayTileGlyph.tsx. */
export function TileGlyph({ kind, color }: { kind: TodayTile["kind"]; color: string }) {
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

export function GreekWordGlyph({ word }: { word: string }) {
  const cat: GreekCategory = GREEK_CATEGORY[word] ?? "vibe";
  const size = 128;
  const ochre = palette.ochre;
  const olive = palette.olive;
  const aegean = palette.aegeanDeep;
  const ink = palette.ink;
  const card = palette.white;

  const wash = (
    <Defs>
      <SvgRadialGradient id={`gw-${cat}`} cx="70%" cy="30%" r="60%">
        <SvgStop offset="0" stopColor={ochre} stopOpacity="0.4" />
        <SvgStop offset="100%" stopColor={ochre} stopOpacity="0" />
      </SvgRadialGradient>
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
          {[-1, 1].map((s) => (
            <G key={s} transform={`translate(64 70) scale(${s} 1)`}>
              <Path d="M0 -32 Q24 -20 26 0 Q24 22 0 32" stroke={olive} strokeWidth={1.4} fill="none" opacity={0.6} />
              {[-24, -10, 4, 18].map((y, i) => (
                <Ellipse
                  key={i}
                  cx={24}
                  cy={y}
                  rx={7}
                  ry={3.2}
                  fill={olive}
                  opacity={0.55 + (i % 2) * 0.2}
                  transform={`rotate(${-30 + i * 18} 24 ${y})`}
                />
              ))}
            </G>
          ))}
          <Circle cx={64} cy={70} r={3} fill={olive} opacity={0.8} />
        </G>
      )}
      {cat === "transit" && (
        <G>
          <Rect x={20} y={50} width={80} height={38} rx={8} fill={aegean} opacity={0.85} />
          <Rect x={26} y={56} width={20} height={14} rx={2} fill={card} opacity={0.9} />
          <Rect x={50} y={56} width={20} height={14} rx={2} fill={card} opacity={0.9} />
          <Rect x={74} y={56} width={20} height={14} rx={2} fill={card} opacity={0.9} />
          <Rect x={20} y={80} width={80} height={3} fill={ink} opacity={0.25} />
          <Circle cx={36} cy={92} r={7} fill={ink} opacity={0.85} />
          <Circle cx={36} cy={92} r={2.6} fill={card} />
          <Circle cx={86} cy={92} r={7} fill={ink} opacity={0.85} />
          <Circle cx={86} cy={92} r={2.6} fill={card} />
        </G>
      )}
      {cat === "food" && (
        <G>
          <Path d="M40 70 L88 70 L84 100 Q84 106 78 106 L50 106 Q44 106 44 100 Z" fill={olive} opacity={0.85} />
          <Path d="M88 76 Q102 76 102 86 Q102 96 88 96" stroke={olive} strokeWidth={2.5} fill="none" opacity={0.7} />
          <Ellipse cx={64} cy={70} rx={24} ry={4} fill={ink} opacity={0.25} />
          {[52, 64, 76].map((x, i) => (
            <Path
              key={x}
              d={`M${x} 60 Q${x + 4} 50 ${x} 40 Q${x - 4} 30 ${x} 22`}
              stroke={ink}
              strokeWidth={1.5}
              fill="none"
              opacity={0.4 - i * 0.08}
              strokeLinecap="round"
            />
          ))}
        </G>
      )}
      {cat === "place" && (
        <G>
          <Circle cx={90} cy={40} r={14} fill={ochre} opacity={0.85} />
          {[64, 78, 92, 106].map((y, i) => (
            <Path
              key={y}
              d={`M0 ${y} Q16 ${y - 4} 32 ${y} T64 ${y} T96 ${y} T128 ${y}`}
              stroke={aegean}
              strokeWidth={1.6}
              fill="none"
              opacity={0.7 - i * 0.12}
            />
          ))}
        </G>
      )}
      {cat === "vibe" && (
        <G transform="translate(64 64) rotate(-22)">
          <Path d="M-44 36 Q-10 8 38 -32" stroke={olive} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.85} />
          {[
            { t: 0.15, side: 1 },
            { t: 0.32, side: -1 },
            { t: 0.5, side: 1 },
            { t: 0.68, side: -1 },
            { t: 0.85, side: 1 },
          ].map(({ t, side }, i) => {
            const p0 = { x: -44, y: 36 };
            const p1 = { x: -10, y: 8 };
            const p2 = { x: 38, y: -32 };
            const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
            const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
            const tx = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
            const ty = 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
            const ang = (Math.atan2(ty, tx) * 180) / Math.PI + side * 55;
            const lx = x + Math.cos((ang * Math.PI) / 180) * 10;
            const ly = y + Math.sin((ang * Math.PI) / 180) * 10;
            return (
              <Ellipse
                key={i}
                cx={lx}
                cy={ly}
                rx={11}
                ry={3.6}
                fill={olive}
                opacity={0.5 + (i % 2) * 0.25}
                transform={`rotate(${ang} ${lx} ${ly})`}
              />
            );
          })}
          <Circle cx={-18} cy={14} r={3} fill={ink} opacity={0.65} />
          <Circle cx={4} cy={-2} r={3} fill={ink} opacity={0.55} />
          <Circle cx={22} cy={-18} r={3} fill={ink} opacity={0.7} />
        </G>
      )}
    </Svg>
  );
}


export function GreekWordCard({
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

  const speakFallback = useCallback(() => {
    try {
      Speech.stop();
      Speech.speak(el, {
        language: "el-GR",
        rate: 0.85,
        onDone: () => {
          Speech.speak(en, {
            language: "en-US",
            rate: 0.95,
            onDone: () => setPlaying(false),
            onStopped: () => setPlaying(false),
            onError: () => setPlaying(false),
          });
        },
        onStopped: () => setPlaying(false),
        onError: () => setPlaying(false),
      });
    } catch {
      setPlaying(false);
    }
  }, [el, en]);

  const speak = useCallback(async () => {
    if (playing) return;
    Haptics.selectionAsync().catch(() => {});
    setPlaying(true);
    try {
      const res = await fetch(`${API_BASE}/api/public/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: el }),
      });
      if (!res.ok) {
        // 402 (out of credits), 403, 429, 5xx → fall back to device TTS
        speakFallback();
        return;
      }
      const buf = await res.arrayBuffer();
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
      speakFallback();
    }
  }, [el, translit, en, playing, speakFallback]);

  return (
    <View
      style={{
        borderRadius: 22,
        padding: 0,
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: palette.line,
        overflow: "hidden",
      }}
    >
      <View
        pointerEvents="none"
        style={{ position: "absolute", right: -14, top: -14, opacity: 0.9 }}
      >
        <GreekWordGlyph word={el} />
      </View>
      <View style={{ position: "relative", padding: 22, paddingRight: 112 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
          <Text
            style={{
              flex: 1,
              fontFamily: EYEBROW,
              fontSize: 9.5,
              letterSpacing: 1.5,
              color: palette.olive,
              textTransform: "uppercase",
              lineHeight: 13,
            }}
          >
            Greek word of the day
          </Text>
          <Text
            style={{
              maxWidth: 108,
              fontFamily: MONO,
              fontSize: 10.5,
              letterSpacing: 1.1,
              lineHeight: 14,
              color: palette.inkSoft,
              textAlign: "right",
            }}
          >
            /{translit}/
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12, marginTop: 14 }}>
          <Text
            style={[
              GREEK_WORD_TYPE,
              {
                flexShrink: 1,
                fontSize: 36,
                lineHeight: 40,
                color: palette.ink,
              },
            ]}
          >
            {el}
          </Text>
          <Pressable
            onPress={speak}
            disabled={playing}
            hitSlop={10}
            accessibilityLabel="Hear pronunciation"
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              marginBottom: 1,
              flexShrink: 0,
              borderRadius: 999,
              backgroundColor: "rgba(63,74,54,0.12)",
              borderWidth: playing ? 2 : 0,
              borderColor: "rgba(63,74,54,0.4)",
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            {playing ? (
              <ActivityIndicator size="small" color={palette.olive} />
            ) : (
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Path d="M4 10v4h3l5 4V6L7 10H4Z" fill={palette.olive} />
                <Path
                  d="M15 9c1.2 1 1.2 5 0 6 M17.5 7c2.5 2 2.5 8 0 10"
                  stroke={palette.olive}
                  strokeWidth={1.6}
                  strokeLinecap="round"
                />
              </Svg>
            )}
          </Pressable>
        </View>
        <Text style={{ marginTop: 8, fontFamily: DISPLAY_MED, fontSize: 15, color: palette.olive }}>
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
    </View>
  );
}
