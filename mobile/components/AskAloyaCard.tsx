// Ask Aloya — the mobile counterpart of `src/components/NLPlannerCard.tsx`.
//
// Editorial, illustrated card with a real composer: a TextInput riders can
// dictate a trip into ("to Larnaca airport tomorrow 7am") plus curated
// suggestion chips that pre-fill the composer. Submitting hands the
// intent off to the plan tab via AsyncStorage — the planner picks it up
// on mount and hydrates the fields.
//
// Kept intentionally simple: no on-device LLM. The heavy AI parsing lives
// server-side; the mobile card just captures intent and routes.

import { useCallback, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  TextInput,
  StyleSheet,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Svg, { Path } from "react-native-svg";

import { palette } from "@/constants/theme";
import { assets } from "@/lib/assets";

const SUGGESTIONS = [
  "To Eleftheria Square in 20 min",
  "Larnaca airport tomorrow 7am",
  "To Nicosia old town after 6pm",
  "From Limassol port to Kourion",
];

export function AskAloyaCard() {
  const [text, setText] = useState("");

  const submit = useCallback(async (value: string) => {
    const q = value.trim();
    if (q.length < 3) return;
    Haptics.selectionAsync().catch(() => {});
    try {
      await AsyncStorage.setItem(
        "aloya:nl-plan-seed",
        JSON.stringify({ text: q, at: Date.now() }),
      );
    } catch {}
    router.push("/plan");
  }, []);

  return (
    <View style={styles.card}>
      <Image
        source={assets.nl_planner_illustration}
        style={styles.illustration}
        resizeMode="cover"
      />
      <View pointerEvents="none" style={styles.wash} />

      <View style={styles.header}>
        <Text style={styles.kicker}>ASK ALOYA</Text>
        <View style={styles.rule} />
      </View>

      <Text style={styles.title}>Tell me where you’re going.</Text>
      <Text style={styles.sub}>
        Routes, stop codes, landmarks, airports — say it your way.
      </Text>

      <View style={styles.composer}>
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{ marginLeft: 12 }}>
          <Path
            d="M12 2 4 6l8 4 8-4-8-4Zm0 10L4 8v8l8 4 8-4V8l-8 4Z"
            fill={palette.aegeanDeep}
          />
        </Svg>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => submit(text)}
          placeholder="e.g. to the airport tomorrow 7am"
          placeholderTextColor={palette.inkSoft}
          returnKeyType="go"
          style={styles.input}
          maxLength={200}
        />
        <Pressable
          onPress={() => submit(text)}
          disabled={text.trim().length < 3}
          style={({ pressed }) => [
            styles.submit,
            text.trim().length < 3 && { opacity: 0.35 },
            pressed && { opacity: 0.85 },
          ]}
          hitSlop={8}
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path
              d="M12 4v16m0-16-6 6m6-6 6 6"
              stroke={palette.limestone}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {SUGGESTIONS.map((s) => (
          <Pressable
            key={s}
            onPress={() => submit(s)}
            style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.chipText} numberOfLines={1}>{s}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 24,
    marginHorizontal: 20,
    borderRadius: 26,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    overflow: "hidden",
    paddingBottom: 16,
  },
  illustration: {
    position: "absolute",
    right: -20,
    top: -10,
    width: 180,
    height: 180,
    opacity: 0.9,
  },
  wash: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingRight: 120,
  },
  kicker: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 10,
    letterSpacing: 2.4,
    color: palette.aegeanDeep,
  },
  rule: { flex: 1, height: 1, backgroundColor: palette.line },
  title: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.6,
    color: palette.ink,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingRight: 100,
  },
  sub: {
    fontFamily: "Geist_500Medium",
    fontSize: 12.5,
    color: palette.inkSoft,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingRight: 100,
  },
  composer: {
    marginTop: 16,
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.limestoneSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.line,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontFamily: "Geist_500Medium",
    fontSize: 14.5,
    color: palette.ink,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  submit: {
    width: 36,
    height: 36,
    marginRight: 6,
    borderRadius: 999,
    backgroundColor: palette.ink,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "45deg" }],
  },
  chipsRow: {
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: palette.limestone,
    borderWidth: 1,
    borderColor: palette.line,
  },
  chipText: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 12,
    color: palette.ink,
    letterSpacing: -0.1,
  },
});
