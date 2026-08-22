// One standing promise: what we are holding, when to leave, and the two
// actions a rider can take on it.

import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import {
  bufferNote,
  countdownLabel,
  formatClock,
  promiseHeadline,
  rungLine,
} from "@aloya/core/arrival-promise";
import { palette } from "@/constants/theme";
import { cancelPromise, refreshPromise, type ArrivalPromise } from "@/lib/arrival-promise";
import { useNowUnix } from "./useNowUnix";

export function ArrivalPromiseRow({
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
  const note = bufferNote({
    bufferSec: promise.buffer_sec,
    reasonShort: promise.reason_short,
    scheduledLeaveUnix:
      ladder.find((r) => r.recommended)?.leaveByUnix ?? promise.plan_json?.departureUnix ?? null,
  });
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
          <Text style={{ fontFamily: "BricolageGrotesque_700Bold", fontSize: 24, color: palette.ink }}>
            Leave {formatClock(promise.leave_by_unix)}
          </Text>
          <Text style={{ fontFamily: "Geist_600SemiBold", fontSize: 12.5, color: palette.inkSoft }}>
            {countdownLabel(promise.leave_by_unix, nowUnix)}
          </Text>
        </View>
      )}

      {note ? (
        <Text
          style={{
            marginTop: 6,
            fontFamily: "Geist_500Medium",
            fontSize: 12.5,
            color: palette.inkSoft,
          }}
        >
          {note}
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
          style={{
            height: 36,
            paddingHorizontal: 12,
            justifyContent: "center",
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Text style={{ fontFamily: "Geist_600SemiBold", fontSize: 12.5, color: palette.inkSoft }}>
            Stop watching
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
