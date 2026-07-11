// Three-step journey timeline (walk · ride · walk) with the current step
// highlighted, plus the "press stop" alert that fires near the alighting stop.

import { View, Text } from "react-native";
import { palette } from "@/constants/theme";
import type { SingleLegPhase } from "@aloya/core/single-leg-phase";
import { KICKER } from "./kit";

function TimelineRow({
  active,
  done,
  title,
  sub,
}: {
  active: boolean;
  done: boolean;
  title: string;
  sub: string;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 14, alignItems: "flex-start" }}>
      <View
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          marginTop: 6,
          backgroundColor: done
            ? palette.olive
            : active
              ? palette.aegeanDeep
              : palette.line,
        }}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 16,
            lineHeight: 20,
            color: active ? palette.ink : palette.inkSoft,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            marginTop: 3,
            fontFamily: "Geist_500Medium",
            fontSize: 12,
            lineHeight: 17,
            color: palette.inkSoft,
          }}
        >
          {sub}
        </Text>
      </View>
    </View>
  );
}

export function JourneyTimeline({
  phase,
  totalDurationSec,
  boardName,
  alightName,
  destName,
  routeShort,
  routeLong,
  walkInSec,
  walkInMeters,
  walkOutSec,
  walkOutMeters,
}: {
  phase: SingleLegPhase;
  totalDurationSec: number;
  boardName: string;
  alightName: string;
  destName: string;
  routeShort: string;
  routeLong: string;
  walkInSec: number;
  walkInMeters: number;
  walkOutSec: number;
  walkOutMeters: number;
}) {
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <Text
          style={{
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 22,
            lineHeight: 24,
            letterSpacing: -0.4,
            color: palette.ink,
          }}
        >
          Your journey
        </Text>
        <Text style={{ ...KICKER, color: palette.inkSoft, paddingBottom: 3 }}>
          {Math.round(totalDurationSec / 60)} min total
        </Text>
      </View>
      <View
        style={{
          borderRadius: 28,
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: palette.line,
          padding: 20,
          gap: 18,
        }}
      >
        <TimelineRow
          active={phase === "leave-soon" || phase === "walking"}
          done={phase !== "leave-soon" && phase !== "walking"}
          title={`Walk to ${boardName}`}
          sub={`${Math.round(walkInSec / 60)} min · ${Math.round(walkInMeters)} m`}
        />
        <TimelineRow
          active={phase === "waiting" || phase === "on-bus" || phase === "alight-soon"}
          done={phase === "arrived"}
          title={`Board ${routeShort} · ${routeLong}`}
          sub={`Off at ${alightName}`}
        />
        <TimelineRow
          active={phase === "alight-soon" || phase === "arrived"}
          done={false}
          title={`Walk to ${destName}`}
          sub={`${Math.round(walkOutSec / 60)} min · ${Math.round(walkOutMeters)} m`}
        />
      </View>
    </View>
  );
}

export function AlightAlert({
  phase,
  minToAlight,
  alightName,
  destName,
  walkOutSec,
}: {
  phase: SingleLegPhase;
  minToAlight: number;
  alightName: string;
  destName: string;
  walkOutSec: number;
}) {
  const imminent = phase === "alight-soon";
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
      <View
        style={{
          borderRadius: 28,
          padding: 20,
          backgroundColor: imminent ? palette.ochreSoft : "rgba(242,223,196,0.55)",
          borderWidth: 1,
          borderColor: imminent ? "rgba(201,133,58,0.4)" : "rgba(201,133,58,0.25)",
        }}
      >
        <Text style={{ ...KICKER, color: palette.ochre }}>
          {imminent ? "Press stop now" : `Get ready — ${Math.max(0, minToAlight)} min`}
        </Text>
        <Text
          style={{
            marginTop: 6,
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 24,
            lineHeight: 28,
            letterSpacing: -0.5,
            color: palette.ink,
          }}
        >
          {alightName}
        </Text>
        <Text
          style={{
            marginTop: 6,
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            lineHeight: 19,
            color: palette.inkSoft,
          }}
        >
          {imminent
            ? `Ring the bell — final walk to ${destName} is short.`
            : `${Math.round(walkOutSec / 60)} min walk to go after this stop.`}
        </Text>
      </View>
    </View>
  );
}
