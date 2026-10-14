// CTA shown on the planner once the rider has picked an arrive-by time.
// Copy comes from @aloya/core/arrival-promise so web and native say exactly
// the same thing.

import { useCallback, useState } from "react";
import { Alert, Image, Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { formatClock, formatDayLabel, type MarginPref } from "@aloya/core/arrival-promise";
import { palette } from "@/constants/theme";
import { useSession } from "@/lib/auth";
import { createPromise, useArrivalPromises } from "@/lib/arrival-promise";
import { MARGINS, isAlreadyWatching } from "./margins";
import { useNowUnix } from "./useNowUnix";
import { WatchGlyph } from "./WatchGlyph";

type Point = { lat: number; lng: number; label: string };

export function ArrivalPromiseCommit({
  origin,
  destination,
  targetArrivalUnix,
}: {
  origin: Point;
  destination: Point;
  targetArrivalUnix: number;
}) {
  const { signedIn } = useSession();
  const nowUnix = useNowUnix(30_000);
  const { promises, reload } = useArrivalPromises(signedIn);
  const [margin, setMargin] = useState<MarginPref>("normal");
  const [busy, setBusy] = useState(false);

  const alreadyWatching = isAlreadyWatching(promises, targetArrivalUnix, destination.label);

  const commit = useCallback(async () => {
    if (!signedIn) {
      Alert.alert(
        "Can't reach Aloya",
        "Holding an arrival needs a connection once so Aloya can watch the trip on the server. No account needed.",
      );
      return;
    }
    setBusy(true);
    try {
      await createPromise({ origin, destination, targetArrivalUnix, margin });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await reload();
    } catch (e) {
      Alert.alert("Could not start watching", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }, [signedIn, origin, destination, targetArrivalUnix, margin, reload]);

  // Nothing to promise if the arrival is already upon us, or we hold it.
  if (targetArrivalUnix <= nowUnix + 300 || alreadyWatching) return null;

  return (
    <View
      style={{
        borderRadius: 26,
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: palette.line,
        overflow: "hidden",
      }}
    >
      <Image
        source={require("../../assets/images/arrival-promise-hero.jpg")}
        accessibilityLabel="Coastal road curving toward a steady clock face"
        resizeMode="cover"
        style={{ width: "100%", height: 116 }}
      />
      <View style={{ padding: 20 }}>
        <Text
          style={{
            fontFamily: "JetBrainsMono_600SemiBold",
            fontSize: 10,
            letterSpacing: 1.6,
            color: palette.inkSoft,
          }}
        >
          ARRIVAL PROMISE
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 19,
            lineHeight: 24,
            color: palette.ink,
          }}
        >
          Make sure I reach {destination.label} by {formatClock(targetArrivalUnix)}{" "}
          {formatDayLabel(targetArrivalUnix, nowUnix)}
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: "Geist_500Medium",
            fontSize: 13.5,
            lineHeight: 20,
            color: palette.inkSoft,
          }}
        >
          Aloya keeps re-planning as the timetable, the weather and the roads change, then tells you
          when to leave — an hour before, thirty minutes before, and the moment you need to go.
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
          {MARGINS.map((m) => {
            const on = margin === m.key;
            return (
              <Pressable
                key={m.key}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setMargin(m.key);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={{
                  height: 38,
                  paddingHorizontal: 16,
                  borderRadius: 19,
                  justifyContent: "center",
                  backgroundColor: on ? palette.ink : palette.limestoneSoft,
                  borderWidth: on ? 0 : 1,
                  borderColor: palette.line,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Geist_600SemiBold",
                    fontSize: 12.5,
                    color: on ? palette.limestone : palette.inkSoft,
                  }}
                >
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => void commit()}
          disabled={busy}
          accessibilityRole="button"
          style={{
            marginTop: 18,
            height: 46,
            borderRadius: 23,
            paddingHorizontal: 22,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            alignSelf: "flex-start",
            backgroundColor: palette.aegean,
            opacity: busy ? 0.6 : 1,
          }}
        >
          <WatchGlyph size={17} color={palette.limestone} />
          <Text style={{ fontFamily: "Geist_700Bold", fontSize: 13.5, color: palette.limestone }}>
            {busy ? "Setting the watch…" : "Watch this arrival"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
