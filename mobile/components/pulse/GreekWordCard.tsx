// Pulse — Greek word of the day card, with spoken pronunciation (server TTS
// with an on-device Speech fallback).

import { useCallback, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Platform, type TextStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import * as FileSystem from "expo-file-system/legacy";
import { createAudioPlayer } from "expo-audio";
import { palette } from "@/constants/theme";
import { API_BASE } from "@/lib/api";
import { DISPLAY, DISPLAY_MED, SANS, SANS_BOLD, MONO, EYEBROW } from "./kit";
import { GreekWordGlyph } from "./glyphs";

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
