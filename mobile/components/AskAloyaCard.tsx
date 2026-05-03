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

import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import {
  AudioModule,
  RecordingPresets,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as FileSystem from "expo-file-system";
import Svg, { Path, Circle } from "react-native-svg";

import { palette } from "@/constants/theme";
import { assets } from "@/lib/assets";
import { useGeoFix } from "@/lib/hooks";
import { resolveAskAloya } from "@/lib/nl-planner";
import { API_BASE } from "@/lib/api";

const SUGGESTIONS = [
  "To Eleftheria Square in 20 min",
  "Larnaca airport tomorrow 7am",
  "To Nicosia old town after 6pm",
  "From Limassol port to Kourion",
];

export function AskAloyaCard() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const { fix } = useGeoFix();

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const isRecording = recorderState.isRecording;
  const permissionAsked = useRef(false);

  const submit = useCallback(
    async (value: string) => {
      const q = value.trim();
      if (q.length < 3 || busy) return;
      Haptics.selectionAsync().catch(() => {});
      setBusy(true);
      setError(null);
      const bias = fix ? { lat: fix.lat, lng: fix.lng } : undefined;
      const result = await resolveAskAloya(q, bias);
      if (result.ok) {
        try {
          await AsyncStorage.setItem("aloya:nl-plan", JSON.stringify(result.seed));
          // Clear the legacy text-only seed so the planner doesn't reopen
          // the destination picker on top of the resolved trip.
          await AsyncStorage.removeItem("aloya:nl-plan-seed");
        } catch {}
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setBusy(false);
        setText("");
        router.push("/plan");
        return;
      }
      // Parse or geocode failure — hand the raw text to the picker as a
      // fallback so the rider can adjust.
      try {
        await AsyncStorage.setItem(
          "aloya:nl-plan-seed",
          JSON.stringify({ text: q, at: Date.now() }),
        );
      } catch {}
      setBusy(false);
      setError(
        result.reason === "parse"
          ? "Couldn't understand that — try naming a place, e.g. \"to Larnaca airport\"."
          : `Couldn't find "${result.hint ?? "that place"}". Try a different spelling.`,
      );
      router.push("/plan");
    },
    [busy, fix?.lat, fix?.lng],
  );

  const toggleMic = useCallback(async () => {
    if (busy || transcribing) return;
    if (isRecording) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      try {
        await recorder.stop();
      } catch {
        setError("Recording failed. Try again.");
        return;
      }
      const uri = recorder.uri;
      if (!uri) {
        setError("Recording failed. Try again.");
        return;
      }
      setTranscribing(true);
      setError(null);
      try {
        const info = await FileSystem.getInfoAsync(uri, { size: true });
        if (!info.exists || (info.size ?? 0) < 2048) {
          setError("That was too short — hold to record.");
          setTranscribing(false);
          return;
        }
        const form = new FormData();
        // React Native FormData accepts the { uri, name, type } shape.
        form.append(
          "file",
          {
            uri,
            name: uri.split("/").pop() ?? "recording.m4a",
            type: "audio/m4a",
          } as unknown as Blob,
        );
        const res = await fetch(`${API_BASE}/api/public/stt`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) throw new Error(`STT ${res.status}`);
        const data = (await res.json()) as { text?: string };
        const heard = (data.text ?? "").trim();
        if (!heard) {
          setError("Didn't catch that — try again.");
        } else {
          setText(heard);
          Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          ).catch(() => {});
          void submit(heard);
        }
      } catch {
        setError("Couldn't transcribe. Try again.");
      } finally {
        setTranscribing(false);
      }
      return;
    }
    // start recording
    if (!permissionAsked.current) {
      permissionAsked.current = true;
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError("Microphone permission is needed for voice input.");
        return;
      }
    }
    setError(null);
    Haptics.selectionAsync().catch(() => {});
    try {
      await recorder.prepareToRecordAsync();
      await recorder.record();
    } catch {
      setError("Couldn't start recording.");
    }
  }, [busy, transcribing, isRecording, recorder, submit]);

  useEffect(() => {
    return () => {
      if (recorder.isRecording) {
        recorder.stop().catch(() => {});
      }
    };
  }, [recorder]);


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
          onChangeText={(v) => {
            setText(v);
            if (error) setError(null);
          }}
          onSubmitEditing={() => submit(text)}
          placeholder={busy ? "Aloya is planning…" : "e.g. to the airport tomorrow 7am"}
          placeholderTextColor={palette.inkSoft}
          returnKeyType="go"
          style={styles.input}
          maxLength={200}
          editable={!busy}
        />
        <Pressable
          onPress={() => submit(text)}
          disabled={text.trim().length < 3 || busy}
          style={({ pressed }) => [
            styles.submit,
            (text.trim().length < 3 || busy) && { opacity: 0.5 },
            pressed && { opacity: 0.85 },
          ]}
          hitSlop={8}
        >
          {busy ? (
            <ActivityIndicator size="small" color={palette.limestone} />
          ) : (
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path
                d="M12 4v16m0-16-6 6m6-6 6 6"
                stroke={palette.limestone}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          )}
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {SUGGESTIONS.map((s) => (
          <Pressable
            key={s}
            onPress={() => submit(s)}
            disabled={busy}
            style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }, busy && { opacity: 0.5 }]}
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
    fontFamily: "Geist_700Bold",
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
  error: {
    marginTop: 10,
    marginHorizontal: 20,
    fontFamily: "Geist_500Medium",
    fontSize: 12,
    color: palette.ochre,
    lineHeight: 17,
  },
});
