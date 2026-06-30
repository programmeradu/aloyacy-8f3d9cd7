// "Remind me to leave" — schedules a local Expo notification a few minutes
// before the rider needs to start walking. Pro-gated (mirrors web). Shown
// only when the trip departs at least 20 min from now.
import { useEffect, useState } from "react";
import { View, Text, Pressable, Alert, Linking } from "react-native";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { palette } from "@/constants/theme";
import type { Itinerary } from "@/lib/plan";
import { useProSubscription } from "@/lib/usePro";

type RideLeg = Extract<Itinerary["legs"][number], { kind: "ride" }>;
type WalkLeg = Extract<Itinerary["legs"][number], { kind: "walk" }>;

async function ensurePermission(): Promise<boolean> {
  if (!Device.isDevice) return false;
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (cur.canAskAgain) {
    const req = await Notifications.requestPermissionsAsync();
    return req.granted;
  }
  return false;
}

export function RemindMeButtonMobile({
  itinerary,
  origin,
  destination,
}: {
  itinerary: Itinerary;
  origin: { lat: number; lng: number; label: string };
  destination: { lat: number; lng: number; label: string };
}) {
  const { isPro } = useProSubscription();
  const firstRide = itinerary.legs.find(
    (l): l is RideLeg => l.kind === "ride",
  );
  const sigKey = `aloya:remind:${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}->${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}@${firstRide?.routeId ?? "x"}:${Math.round(itinerary.departureUnix / 60)}`;

  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(sigKey)
      .then((raw) => {
        if (!alive) return;
        const until = Number(raw ?? "0");
        if (Number.isFinite(until) && until * 1000 > Date.now()) {
          setState("saved");
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sigKey]);

  const departInMin = Math.round(
    (itinerary.departureUnix - Date.now() / 1000) / 60,
  );
  if (departInMin < 20) return null;

  const firstWalk = itinerary.legs.find((l): l is WalkLeg => l.kind === "walk");
  const walkSec = firstWalk?.durationSec ?? 5 * 60;
  const remindAtUnix = itinerary.departureUnix - walkSec - 5 * 60;
  const triggerDate = new Date(remindAtUnix * 1000);

  async function schedule() {
    setState("saving");
    setErr(null);
    try {
      if (triggerDate.getTime() <= Date.now() + 30_000) {
        throw new Error("Too soon to schedule");
      }
      const granted = await ensurePermission();
      if (!granted) {
        Alert.alert(
          "Notifications off",
          "Enable notifications to get a heads-up before you need to leave.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ],
        );
        setState("idle");
        return;
      }
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `Time to leave for ${destination.label}`,
          body: `Walk to your bus now to catch the ${firstRide?.routeShort ?? "next"} on time.`,
          data: { kind: "remind-me", sigKey },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
      });
      await AsyncStorage.setItem(sigKey, String(itinerary.departureUnix));
      await AsyncStorage.setItem(`${sigKey}::id`, id);
      setState("saved");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not schedule reminder");
      setState("error");
    }
  }

  function handlePress() {
    if (state === "saving" || state === "saved") return;
    Haptics.selectionAsync().catch(() => {});
    if (!isPro) {
      Alert.alert(
        "Pro feature",
        "Reminders are part of Aloya Pro. Upgrade from the Saved tab to unlock them.",
        [{ text: "OK" }],
      );
      return;
    }
    void schedule();
  }

  const label =
    state === "saved"
      ? "Reminder set"
      : state === "saving"
        ? "Scheduling…"
        : isPro
          ? "Remind me to leave"
          : "Remind me — Pro";

  return (
    <View style={{ gap: 6 }}>
      <Pressable
        onPress={handlePress}
        disabled={state === "saving" || state === "saved"}
        style={({ pressed }) => ({
          alignSelf: "flex-start",
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: state === "saved" ? palette.aegean : palette.line,
          borderRadius: 999,
          paddingHorizontal: 14,
          paddingVertical: 8,
          opacity: pressed ? 0.85 : state === "saved" ? 0.9 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: "Geist_600SemiBold",
            fontSize: 12,
            color: state === "saved" ? palette.aegeanDeep : palette.ink,
            letterSpacing: 0.2,
          }}
        >
          {label}
        </Text>
      </Pressable>
      {state === "saved" && (
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 10,
            color: palette.inkSoft,
            letterSpacing: 0.4,
          }}
        >
          NUDGE AT {triggerDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}
        </Text>
      )}
      {err && (
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 10,
            color: palette.ochre,
            letterSpacing: 0.3,
          }}
        >
          {err.toUpperCase()}
        </Text>
      )}
    </View>
  );
}
