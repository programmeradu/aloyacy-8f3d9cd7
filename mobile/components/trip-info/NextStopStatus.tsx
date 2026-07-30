// Next-stop / ETA / running-status composite — mirrors the web NextStopCard +
// EtaCard + StatusCard trio in native form. All derivation lives in
// @aloya/core/trip-board; this file is presentation only.

import { View, Text } from "react-native";
import { palette } from "@/constants/theme";
import {
  minutesUntil,
  tripStatusView,
  type TripBoard,
  type TripStopMeta,
} from "@aloya/core/trip-board";

function fmtClock(unix: number) {
  return new Date(unix * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const LABEL = {
  fontFamily: "Geist_700Bold" as const,
  fontSize: 9.5,
  letterSpacing: 2,
  color: palette.inkSoft,
  textTransform: "uppercase" as const,
};

const TILE = {
  flex: 1,
  backgroundColor: palette.white,
  borderRadius: 22,
  borderWidth: 1,
  borderColor: palette.line,
  padding: 16,
};

export function NextStopStatus({
  board,
  nowUnix,
}: {
  board: TripBoard<TripStopMeta>;
  nowUnix: number;
}) {
  const finished = board.nextIdx === -1;
  const nextStop = finished ? null : board.stops[board.nextIdx];
  const status = tripStatusView(nextStop?.delaySec ?? 0, finished);
  const statusColor =
    status.status === "late"
      ? palette.ochre
      : status.status === "early"
        ? palette.aegeanDeep
        : status.status === "done"
          ? palette.inkSoft
          : palette.olive;

  return (
    <View style={{ paddingHorizontal: 20, marginTop: 18, gap: 10 }}>
      <View
        style={{
          backgroundColor: palette.white,
          borderRadius: 26,
          borderWidth: 1,
          borderColor: palette.line,
          padding: 20,
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ ...LABEL, fontSize: 10, letterSpacing: 2.2 }}>Next stop</Text>
          <Text
            style={{
              marginTop: 8,
              fontFamily: "BricolageGrotesque_800ExtraBold",
              fontSize: 24,
              lineHeight: 28,
              letterSpacing: -0.5,
              color: palette.ink,
            }}
          >
            {nextStop?.meta?.name ?? "—"}
          </Text>
          {nextStop?.meta?.code ? (
            <Text style={{ ...LABEL, marginTop: 6, fontSize: 10, letterSpacing: 1.8 }}>
              #{nextStop.meta.code}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          {finished || !nextStop ? (
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 12,
                letterSpacing: 2,
                color: palette.inkSoft,
              }}
            >
              —
            </Text>
          ) : (
            <>
              <Text
                style={{
                  fontFamily: "BricolageGrotesque_800ExtraBold",
                  fontSize: 44,
                  lineHeight: 46,
                  letterSpacing: -1.2,
                  color: palette.ochre,
                }}
              >
                {minutesUntil(nextStop.arrivalUnix, nowUnix)}
              </Text>
              <Text style={{ ...LABEL, marginTop: 4, fontSize: 10, letterSpacing: 2.2 }}>min</Text>
            </>
          )}
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={TILE}>
          <Text style={LABEL}>ETA there</Text>
          <Text
            style={{
              marginTop: 8,
              fontFamily: "BricolageGrotesque_700Bold",
              fontSize: 24,
              lineHeight: 28,
              letterSpacing: -0.4,
              color: palette.ink,
            }}
          >
            {nextStop ? fmtClock(nextStop.arrivalUnix) : "—"}
          </Text>
          <Text style={{ ...LABEL, marginTop: 4, letterSpacing: 1.8 }}>clock</Text>
        </View>
        <View style={TILE}>
          <Text style={LABEL}>Running</Text>
          <Text
            numberOfLines={2}
            style={{
              marginTop: 8,
              fontFamily: "BricolageGrotesque_700Bold",
              fontSize: 19,
              lineHeight: 23,
              letterSpacing: -0.3,
              color: statusColor,
            }}
          >
            {status.label}
          </Text>
          <Text style={{ ...LABEL, marginTop: 4, letterSpacing: 1.8 }}>{status.tag}</Text>
        </View>
      </View>
    </View>
  );
}
