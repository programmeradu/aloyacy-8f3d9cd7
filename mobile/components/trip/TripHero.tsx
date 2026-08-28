// Hero card of the single-leg companion: state kicker, big countdown,
// supporting line and the route identity strip.

import { View, Text } from "react-native";
import { palette } from "@/constants/theme";
import { RouteChip } from "@/components/RouteChip";
import {
  delayCopy,
  phaseHeadline,
  phaseLabel,
  phaseSubcopy,
  type SingleLegPhase,
} from "@aloya/core/single-leg-phase";
import { destBailForWait, destBailLine } from "@aloya/core/dest-bail";
import { KICKER } from "./kit";

export function TripHero({
  phase,
  delaySec,
  minToLeave,
  minToBoard,
  minToAlight,
  minToDoor,
  boardName,
  alightName,
  destName,
  walkInSec,
  walkOutSec,
  routeShort,
  routeLong,
  ghost,
  from,
  dest,
}: {
  phase: SingleLegPhase;
  delaySec: number;
  minToLeave: number;
  minToBoard: number;
  minToAlight: number;
  minToDoor: number;
  boardName: string;
  alightName: string;
  destName: string;
  walkInSec: number;
  walkOutSec: number;
  routeShort: string;
  routeLong: string;
  ghost?: boolean;
  from?: { lat: number; lng: number } | null;
  dest?: { lat: number; lng: number };
}) {
  const tone =
    phase === "arrived"
      ? palette.olive
      : phase === "alight-soon"
        ? palette.ochre
        : palette.aegeanDeep;
  const { big, small } = phaseHeadline({
    phase,
    minToLeave,
    minToBoard,
    minToAlight,
    minToDoor,
    boardName,
    alightName,
  });
  const sub = phaseSubcopy({
    phase,
    walkInSec,
    walkOutSec,
    destName,
    boardName,
    alightName,
    minToDoor,
  });
  const bail = destBailForWait({
    dark: !!ghost,
    phase: phase === "waiting" ? "waiting" : phase === "walking" ? "walking" : "other",
    waitMin: minToBoard,
    from: from ?? null,
    to: dest ?? null,
    destLabel: destName,
    routeShort,
  });

  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View
        style={{
          borderRadius: 32,
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: palette.line,
          padding: 24,
        }}
      >
        <Text style={{ ...KICKER, color: tone }}>
          {phaseLabel(phase)} ·{" "}
          <Text style={{ color: palette.inkSoft }}>{delayCopy(delaySec)}</Text>
        </Text>

        <Text
          style={{
            marginTop: 8,
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 36,
            lineHeight: 40,
            letterSpacing: -0.9,
            color: palette.ink,
          }}
        >
          {big}
        </Text>
        <Text
          style={{
            marginTop: 4,
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 18,
            lineHeight: 24,
            letterSpacing: -0.3,
            color: palette.oliveSoft,
          }}
        >
          {small}
        </Text>
        <Text
          style={{
            marginTop: 14,
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            lineHeight: 20,
            color: palette.inkSoft,
          }}
        >
          {sub}
        </Text>
        {bail ? (
          <Text
            style={{
              marginTop: 8,
              fontFamily: "Geist_500Medium",
              fontSize: 13,
              lineHeight: 20,
              color: palette.inkSoft,
            }}
          >
            {destBailLine(bail)}
          </Text>
        ) : null}

        <View
          style={{
            marginTop: 18,
            paddingTop: 16,
            borderTopWidth: 1,
            borderTopColor: palette.line,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <RouteChip short={routeShort} />
          <Text
            style={{
              flex: 1,
              fontFamily: "Geist_600SemiBold",
              fontSize: 13,
              color: palette.ink,
            }}
            numberOfLines={2}
          >
            {routeLong}
          </Text>
        </View>
      </View>
    </View>
  );
}
