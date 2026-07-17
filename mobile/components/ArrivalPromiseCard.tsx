// Arrival promise surfaces for the native app — the mirror of
// src/components/plan/ArrivalPromiseCard.tsx. Copy and clock formatting come
// from @aloya/core/arrival-promise so both apps say exactly the same thing.

import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import * as Haptics from "expo-haptics";
import {
  countdownLabel,
  formatClock,
  formatDayLabel,
  promiseHeadline,
  rungLine,
  type MarginPref,
} from "@aloya/core/arrival-promise";
import { palette } from "@/constants/theme";
import { useSession } from "@/lib/auth";
import {
  cancelPromise,
  createPromise,
  refreshPromise,
  useArrivalPromises,
  type ArrivalPromise,
} from "@/lib/arrival-promise";

type Point = { lat: number; lng: number; label: string };

const MARGINS: Array<{ key: MarginPref; label: string }> = [
  { key: "relaxed", label: "15 min spare" },
  { key: "normal", label: "8 min spare" },
  { key: "tight", label: "Cut it fine" },
];

function useNowUnix(intervalMs: number): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** CTA shown on the planner once the rider has picked an arrive-by time. */
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

  const alreadyWatching = promises.some(
    (p) =>
      Math.abs(p.target_arrival_unix - targetArrivalUnix) < 15 * 60 &&
      p.destination_label === destination.label,
  );

  const commit = useCallback(async () => {
    if (!signedIn) {
      Alert.alert(
        "Sign in to hold your arrival",
        "Aloya watches the trip on the server, so the reminder reaches you even with the app closed.",
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
        source={require("../assets/images/arrival-promise-hero.jpg")}
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
        <Text
          style={{ fontFamily: "Geist_700Bold", fontSize: 13.5, color: palette.limestone }}
        >
          {busy ? "Setting the watch…" : "Watch this arrival"}
        </Text>
      </Pressable>
      </View>
    </View>
  );
}

/** Standing promises, shown on Saved. Renders nothing when there are none. */
export function ArrivalPromiseWatchList() {
  const { signedIn } = useSession();
  const { promises, loading, reload } = useArrivalPromises(signedIn);

  if (!signedIn || (loading && promises.length === 0) || promises.length === 0) return null;

  return (
    <View style={{ gap: 12 }}>
      <Text
        style={{
          fontFamily: "JetBrainsMono_600SemiBold",
          fontSize: 10,
          letterSpacing: 1.6,
          color: palette.inkSoft,
        }}
      >
        {promises.length === 1 ? "ARRIVAL WE ARE HOLDING" : "ARRIVALS WE ARE HOLDING"}
      </Text>
      {promises.map((p) => (
        <PromiseRow key={p.id} promise={p} onChanged={reload} />
      ))}
    </View>
  );
}

function PromiseRow({
  promise,
  onChanged,
}: {
  promise: ArrivalPromise;
  onChanged: () => Promise<void> | void;
}) {
  const nowUnix = useNowUnix(15_000);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<"refresh" | "cancel" | null>(null);

  const missed = promise.status === "missed";
  const leaveNow = promise.status === "leave-now" || promise.leave_by_unix - nowUnix <= 0;
  const ladder = Array.isArray(promise.ladder_json) ? promise.ladder_json : [];
  const routes = (promise.plan_json?.legs ?? [])
    .map((l) => (l.kind === "ride" ? l.routeShort : null))
    .filter((r): r is string => Boolean(r));

  const act = useCallback(
    async (kind: "refresh" | "cancel") => {
      setBusy(kind);
      try {
        if (kind === "refresh") await refreshPromise(promise.id);
        else await cancelPromise(promise.id);
        await onChanged();
      } catch (e) {
        Alert.alert("Something went wrong", e instanceof Error ? e.message : "Please try again.");
      } finally {
        setBusy(null);
      }
    },
    [promise.id, onChanged],
  );

  const accent = missed ? palette.ochre : leaveNow ? palette.aegean : palette.line;

  return (
    <View
      style={{
        borderRadius: 26,
        padding: 18,
        borderWidth: 1,
        borderColor: missed || leaveNow ? accent : palette.line,
        backgroundColor: missed
          ? palette.ochreSoft
          : leaveNow
            ? palette.aegeanSoft
            : palette.white,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: "BricolageGrotesque_700Bold",
              fontSize: 16.5,
              lineHeight: 21,
              color: palette.ink,
            }}
          >
            {promiseHeadline({
              destinationLabel: promise.destination_label,
              targetArrivalUnix: promise.target_arrival_unix,
              nowUnix,
            })}
          </Text>
          <Text
            style={{
              marginTop: 4,
              fontFamily: "Geist_500Medium",
              fontSize: 12.5,
              color: palette.inkSoft,
            }}
          >
            from {promise.origin_label}
            {routes.length > 0 ? ` · BUS ${routes.join(" → ")}` : ""}
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: missed
              ? palette.ochre
              : leaveNow
                ? palette.aegean
                : palette.limestoneSoft,
          }}
        >
          <Text
            style={{
              fontFamily: "JetBrainsMono_600SemiBold",
              fontSize: 9.5,
              letterSpacing: 1.1,
              color: missed || leaveNow ? palette.limestone : palette.inkSoft,
            }}
          >
            {missed ? "OUT OF REACH" : leaveNow ? "LEAVE NOW" : "WATCHING"}
          </Text>
        </View>
      </View>

      {missed ? (
        <Text
          style={{
            marginTop: 12,
            fontFamily: "Geist_500Medium",
            fontSize: 13.5,
            lineHeight: 20,
            color: palette.ink,
          }}
        >
          No service currently reaches {promise.destination_label} by{" "}
          {formatClock(promise.target_arrival_unix)}. We keep checking in case a later plan opens
          up.
        </Text>
      ) : (
        <View style={{ marginTop: 12, flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text
            style={{
              fontFamily: "BricolageGrotesque_700Bold",
              fontSize: 24,
              color: palette.ink,
            }}
          >
            Leave {formatClock(promise.leave_by_unix)}
          </Text>
          <Text
            style={{ fontFamily: "Geist_600SemiBold", fontSize: 12.5, color: palette.inkSoft }}
          >
            {countdownLabel(promise.leave_by_unix, nowUnix)}
          </Text>
        </View>
      )}

      {promise.reason_short ? (
        <Text
          style={{
            marginTop: 6,
            fontFamily: "Geist_500Medium",
            fontSize: 12.5,
            color: palette.inkSoft,
          }}
        >
          Extra {Math.round(promise.buffer_sec / 60)} min built in — {promise.reason_short}.
        </Text>
      ) : null}

      {ladder.length > 0 ? (
        <>
          <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button">
            <Text
              style={{
                marginTop: 14,
                fontFamily: "JetBrainsMono_600SemiBold",
                fontSize: 10,
                letterSpacing: 1.4,
                color: palette.aegeanDeep,
              }}
            >
              {expanded ? "HIDE DEPARTURE OPTIONS" : `SHOW ${ladder.length} DEPARTURE OPTIONS`}
            </Text>
          </Pressable>
          {expanded ? (
            <View
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTopWidth: 1,
                borderTopColor: palette.line,
                gap: 6,
              }}
            >
              {ladder.map((rung) => (
                <Text
                  key={rung.itineraryId}
                  style={{
                    fontFamily: "Geist_500Medium",
                    fontSize: 12.5,
                    lineHeight: 18,
                    color: rung.verdict === "late" ? palette.inkSoft : palette.ink,
                  }}
                >
                  {rungLine(rung)}
                </Text>
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16 }}>
        <Pressable
          onPress={() => void act("refresh")}
          disabled={busy !== null}
          accessibilityRole="button"
          style={{
            height: 36,
            paddingHorizontal: 14,
            borderRadius: 18,
            justifyContent: "center",
            backgroundColor: palette.limestoneSoft,
            borderWidth: 1,
            borderColor: palette.line,
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy === "refresh" ? (
            <ActivityIndicator size="small" color={palette.inkSoft} />
          ) : (
            <Text style={{ fontFamily: "Geist_600SemiBold", fontSize: 12.5, color: palette.ink }}>
              Re-check now
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={() =>
            Alert.alert("Stop watching?", "Aloya will stop tracking this arrival time.", [
              { text: "Keep watching", style: "cancel" },
              { text: "Stop", style: "destructive", onPress: () => void act("cancel") },
            ])
          }
          disabled={busy !== null}
          accessibilityRole="button"
          style={{ height: 36, paddingHorizontal: 12, justifyContent: "center", opacity: busy ? 0.6 : 1 }}
        >
          <Text style={{ fontFamily: "Geist_600SemiBold", fontSize: 12.5, color: palette.inkSoft }}>
            Stop watching
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function WatchGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={1.6} opacity={0.45} />
      <Circle cx="12" cy="12" r="4.5" stroke={color} strokeWidth={1.8} />
      <Path d="M12 7.5V12l3 1.8" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
