// Native onboarding — 3-step carousel shown once on first launch.
//
// Steps:
//   1. Location — enables live ETAs, nearest-stop discovery, walk guidance.
//   2. Notifications — trip alerts (get-off, transfer, disruption).
//   3. Motion card — optional add so the wallet is ready on day one.
//
// The last screen persists `aloya.onboarded.v1` and routes into the app.
// Each permission ask is non-blocking: a "Skip" affordance is always there
// so denied permissions never trap the user off the app.

import { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Dimensions,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as Haptics from "expo-haptics";
import Svg, { Circle, Path, Defs, LinearGradient, Stop } from "react-native-svg";

import { palette } from "@/constants/theme";
import { mergePass } from "@/lib/motionPass";
import { registerForPushNotifications } from "@/lib/push";

export const ONBOARDED_KEY = "aloya.onboarded.v1";

const { width: SCREEN_W } = Dimensions.get("window");

type StepState = "idle" | "granted" | "denied" | "skipped" | "saved";

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [locState, setLocState] = useState<StepState>("idle");
  const [notifState, setNotifState] = useState<StepState>("idle");
  const [cardState, setCardState] = useState<StepState>("idle");
  const [cardInput, setCardInput] = useState("");

  const goto = useCallback((idx: number) => {
    scrollRef.current?.scrollTo({ x: idx * SCREEN_W, animated: true });
    setPage(idx);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const finish = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDED_KEY, "1");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.replace("/(tabs)");
  }, []);

  const askLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        setLocState("granted");
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      } else {
        setLocState("denied");
      }
    } catch {
      setLocState("denied");
    }
    setTimeout(() => goto(1), 350);
  }, [goto]);

  const askNotifications = useCallback(async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === "granted") {
        setNotifState("granted");
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        // Mirror the token to the backend; failure is silent.
        void registerForPushNotifications().catch(() => {});
      } else {
        setNotifState("denied");
      }
    } catch {
      setNotifState("denied");
    }
    setTimeout(() => goto(2), 350);
  }, [goto]);

  const saveCard = useCallback(async () => {
    const digits = cardInput.replace(/\D/g, "");
    if (digits.length < 6) {
      Alert.alert("Card number", "Enter the number printed on your Motion card.");
      return;
    }
    try {
      await mergePass({ number: digits, balanceUpdatedAt: Date.now() });
      setCardState("saved");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      setCardState("denied");
    }
  }, [cardInput]);

  const dots = useMemo(() => [0, 1, 2], []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.brand}>Aloya</Text>
        <Pressable
          hitSlop={12}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            finish();
          }}
        >
          <Text style={styles.skipTop}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const p = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
          if (p !== page) setPage(p);
        }}
        style={{ flex: 1 }}
      >
        {/* Step 1 — Location */}
        <Slide title="Live buses, right where you stand" kicker="Location">
          <LocationArt />
          <Text style={styles.body}>
            Aloya uses your location to show the nearest stops, live ETAs for
            the buses you can actually catch, and turn-by-turn walking cues
            between transfers. Never in the background.
          </Text>
          <StatusChip state={locState} labels={{
            granted: "Location enabled",
            denied: "You can enable this later in Settings",
            skipped: "Skipped for now",
          }} />
          <PrimaryButton
            label={locState === "granted" ? "Continue" : "Enable location"}
            onPress={locState === "granted" ? () => goto(1) : askLocation}
          />
          <SecondaryButton label="Not now" onPress={() => { setLocState("skipped"); goto(1); }} />
        </Slide>

        {/* Step 2 — Notifications */}
        <Slide title="Never miss your stop" kicker="Alerts">
          <NotificationsArt />
          <Text style={styles.body}>
            Get a nudge two stops before your exit, a heads-up when your
            transfer is boarding, and instant word if your route is disrupted.
            Alerts are per-trip — no marketing, ever.
          </Text>
          <StatusChip state={notifState} labels={{
            granted: "Trip alerts ready",
            denied: "You can enable this later in Settings",
            skipped: "Skipped for now",
          }} />
          <PrimaryButton
            label={notifState === "granted" ? "Continue" : "Turn on alerts"}
            onPress={notifState === "granted" ? () => goto(2) : askNotifications}
          />
          <SecondaryButton label="Not now" onPress={() => { setNotifState("skipped"); goto(2); }} />
        </Slide>

        {/* Step 3 — Motion card */}
        <Slide title="Add your Motion card" kicker="Wallet">
          <MotionArt />
          <Text style={styles.body}>
            Save your card number to see the balance, top-ups and taps
            straight from the wallet. You can add or change it any time.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Motion card number"
            placeholderTextColor={palette.inkSoft}
            keyboardType="number-pad"
            maxLength={19}
            value={cardInput}
            onChangeText={setCardInput}
            editable={cardState !== "saved"}
          />
          <StatusChip state={cardState} labels={{
            saved: "Card saved to wallet",
            denied: "Could not save — try again",
            skipped: "You can add a card later from Wallet",
          }} />
          <PrimaryButton
            label={cardState === "saved" ? "Enter Aloya" : "Save & continue"}
            onPress={cardState === "saved" ? finish : async () => { await saveCard(); }}
          />
          <SecondaryButton
            label={cardState === "saved" ? "Enter Aloya" : "Skip for now"}
            onPress={() => { if (cardState !== "saved") setCardState("skipped"); finish(); }}
          />
        </Slide>
      </ScrollView>

      <View style={[styles.dots, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {dots.map((d) => (
          <View
            key={d}
            style={[styles.dot, page === d && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

// ————— Presentational bits —————

function Slide({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) {
  return (
    <View style={[styles.slide, { width: SCREEN_W }]}>
      <Text style={styles.kicker}>{kicker.toUpperCase()}</Text>
      <Text style={styles.title}>{title}</Text>
      <View style={{ height: 16 }} />
      {children}
    </View>
  );
}

function StatusChip({ state, labels }: {
  state: StepState;
  labels: Partial<Record<StepState, string>>;
}) {
  if (state === "idle") return <View style={{ height: 22 }} />;
  const text = labels[state] ?? "";
  const isPositive = state === "granted" || state === "saved";
  return (
    <View style={[styles.chip, isPositive ? styles.chipPositive : styles.chipNeutral]}>
      <Text style={[styles.chipText, isPositive ? { color: palette.aegeanDeep } : { color: palette.inkSoft }]}>
        {text}
      </Text>
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.85 }]}>
      <Text style={styles.btnPrimaryText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.6 }]}>
      <Text style={styles.btnSecondaryText}>{label}</Text>
    </Pressable>
  );
}

// ————— Editorial SVG art (bespoke, no icon set) —————

function LocationArt() {
  return (
    <Svg width={220} height={180} viewBox="0 0 220 180">
      <Defs>
        <LinearGradient id="lg1" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={palette.aegean} stopOpacity={0.25} />
          <Stop offset="1" stopColor={palette.aegeanSoft} stopOpacity={0.9} />
        </LinearGradient>
      </Defs>
      <Circle cx={110} cy={100} r={78} fill="url(#lg1)" />
      <Circle cx={110} cy={100} r={52} fill="none" stroke={palette.aegeanDeep} strokeOpacity={0.2} strokeWidth={1} />
      <Circle cx={110} cy={100} r={26} fill="none" stroke={palette.aegeanDeep} strokeOpacity={0.3} strokeWidth={1} />
      <Path d="M110 60 C 92 60 78 74 78 92 c 0 22 32 48 32 48 s 32 -26 32 -48 c 0 -18 -14 -32 -32 -32 z" fill={palette.ochre} />
      <Circle cx={110} cy={92} r={10} fill={palette.limestone} />
    </Svg>
  );
}

function NotificationsArt() {
  return (
    <Svg width={220} height={180} viewBox="0 0 220 180">
      <Circle cx={110} cy={94} r={72} fill={palette.ochreSoft} />
      <Path d="M70 110 h80 l-8 -14 v-24 c0 -18 -14 -32 -32 -32 s -32 14 -32 32 v24 z" fill={palette.olive} />
      <Path d="M96 122 c 4 8 24 8 28 0" stroke={palette.olive} strokeWidth={3} fill="none" strokeLinecap="round" />
      <Circle cx={148} cy={54} r={10} fill={palette.aegeanDeep} />
    </Svg>
  );
}

function MotionArt() {
  return (
    <Svg width={240} height={160} viewBox="0 0 240 160">
      <Defs>
        <LinearGradient id="lg2" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={palette.aegeanDeep} />
          <Stop offset="1" stopColor={palette.aegean} />
        </LinearGradient>
      </Defs>
      <Path d="M20 30 h180 a12 12 0 0 1 12 12 v76 a12 12 0 0 1 -12 12 h -180 a 12 12 0 0 1 -12 -12 v -76 a 12 12 0 0 1 12 -12 z" fill="url(#lg2)" />
      <Path d="M28 66 h50 v14 h-50 z" fill={palette.ochre} opacity={0.9} />
      <Path d="M28 96 h120 v6 h-120 z" fill={palette.limestone} opacity={0.5} />
      <Path d="M28 108 h80 v6 h-80 z" fill={palette.limestone} opacity={0.3} />
      <Text
        // @ts-expect-error react-native-svg Text is not typed via RN Text
        x={162} y={54} fontSize={14} fontWeight="700" fill={palette.limestone}
      >
        Motion
      </Text>
    </Svg>
  );
}

// ————— Styles —————

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.limestone },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
  },
  brand: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 22,
    color: palette.ink,
    letterSpacing: -0.3,
  },
  skipTop: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 14,
    color: palette.inkSoft,
  },
  slide: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 20,
    alignItems: "flex-start",
  },
  kicker: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 11,
    color: palette.aegeanDeep,
    letterSpacing: 2,
    marginBottom: 12,
  },
  title: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 34,
    lineHeight: 38,
    color: palette.ink,
    letterSpacing: -0.6,
  },
  body: {
    fontFamily: "Geist_500Medium",
    fontSize: 16,
    lineHeight: 24,
    color: palette.inkSoft,
    marginTop: 12,
    marginBottom: 16,
  },
  input: {
    alignSelf: "stretch",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 18,
    color: palette.ink,
    marginBottom: 12,
  },
  chip: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 12,
  },
  chipPositive: { backgroundColor: palette.aegeanSoft },
  chipNeutral: { backgroundColor: palette.limestoneSoft },
  chipText: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 13,
  },
  btnPrimary: {
    alignSelf: "stretch",
    backgroundColor: palette.ink,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  btnPrimaryText: {
    color: palette.limestone,
    fontFamily: "Geist_700Bold",
    fontSize: 16,
    letterSpacing: 0.2,
  },
  btnSecondary: {
    alignSelf: "stretch",
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
  },
  btnSecondaryText: {
    color: palette.inkSoft,
    fontFamily: "Geist_600SemiBold",
    fontSize: 15,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingTop: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.line,
  },
  dotActive: {
    width: 22,
    backgroundColor: palette.ink,
  },
});
