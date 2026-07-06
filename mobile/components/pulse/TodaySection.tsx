// Pulse — "Today" editorial block: hero, tiles, editor's note, Greek word of
// the day and the fact card. Split out of the Pulse screen.

import { useMemo } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { palette } from "@/constants/theme";
import { assets } from "@/lib/assets";
import type { TodayBriefing, TodayTile, TodayTheme } from "@/lib/pulse";
import { DISPLAY, DISPLAY_MED, SANS, MONO, EYEBROW, Eyebrow } from "./kit";
import { TileGlyph } from "./glyphs";
import { GreekWordCard } from "./GreekWordCard";



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

