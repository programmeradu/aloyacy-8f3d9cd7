// Native on-board alighting card — mirror of the web
// `src/components/journey/AlightCountdownCard.tsx`.
//
// Replaces the old ETA-triggered "press the button" buzz (which fired several
// stops early) with a live board the rider can read against the window: where
// the bus is standing now, every stop still to come, and a staged instruction
// that only says "press" once the bus has pulled away from the stop before
// theirs.
//
// Presentation notes: stop names wrap instead of truncating (Cypriot stop
// names run long and the name is the whole point), the remaining list scrolls
// internally past six entries so the card never pushes the map off screen, and
// the current position is marked with a rule and a numeral, never a dot.

import { View, Text, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import type { AlightCountdown, AlightStage } from "@aloya/core/alight-countdown";
import { fmtMin, alightEtaSec } from "@aloya/core/hud-copy";
import { palette } from "@/constants/theme";
import { markAlighted, type LiveJourney } from "@/lib/useJourney";
import type { ActiveTrip } from "@/lib/trip-store";
import { KICKER, HudCard, HudTitle, HudBody, HeroButton } from "./HudButtons";

const URGENT: AlightStage[] = ["press-now", "alighting"];

function headline(cd: AlightCountdown): string {
  const n = cd.stopsRemaining;
  switch (cd.stage) {
    case "stand-by":
      return "Stand by the door";
    case "press-now":
      return "Press stop now";
    case "alighting":
      return "Stepping off";
    case "passed":
      return "You've passed your stop";
    default:
      if (n == null) return "Your stop is coming up";
      return n === 1 ? "One stop to go" : `${n} stops to go`;
  }
}

function body(cd: AlightCountdown, alightName: string): string {
  switch (cd.stage) {
    case "stand-by":
      return "Next stop after this one is yours. Move toward the door.";
    case "press-now":
      return `Ring the bell — ${alightName} is next.`;
    case "alighting":
      return `Mind the step at ${alightName}.`;
    case "passed":
      return "We'll re-route you from wherever you get off.";
    default:
      return "Stay comfortable — we'll tell you the exact moment to press.";
  }
}

export function AlightCountdownCard({
  trip,
  live,
}: {
  trip: ActiveTrip;
  live: LiveJourney;
}) {
  const bus = trip.option.legs.find((l) => l.kind === "bus");
  if (!bus || bus.kind !== "bus") return null;

  const cd = live.alight;
  const urgent = URGENT.includes(cd.stage);
  const eta = alightEtaSec(live.fusedSecsToAlight, live.secsToAlight);
  const alightName = cd.alightStop?.name ?? bus.alight.name;
  const accent = urgent ? palette.ochre : palette.aegeanDeep;

  const positionLine = cd.currentStop
    ? cd.atStop
      ? `At ${cd.currentStop.name} right now`
      : `Approaching ${cd.currentStop.name}`
    : cd.nextStop
      ? `Approaching ${cd.nextStop.name}`
      : null;

  const scrolls = cd.upcoming.length > 6;

  return (
    <HudCard
      background={urgent ? "rgba(201,133,58,0.12)" : palette.white}
      borderColor={urgent ? "rgba(201,133,58,0.4)" : palette.line}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Text style={{ ...KICKER, color: accent, flexShrink: 1 }}>
          On board · {bus.routeShort}
        </Text>
        {eta > 0 && (
          <Text
            style={{
              fontFamily: "JetBrainsMono_500Medium",
              fontSize: 10,
              letterSpacing: 1.6,
              color: palette.inkSoft,
            }}
          >
            {fmtMin(eta).toUpperCase()}
          </Text>
        )}
      </View>

      <HudTitle size={26}>{headline(cd)}</HudTitle>
      <Text
        style={{
          marginTop: 4,
          fontFamily: "BricolageGrotesque_600SemiBold",
          fontSize: 17,
          lineHeight: 23,
          color: palette.inkSoft,
        }}
      >
        {alightName}
      </Text>

      <HudBody>{body(cd, alightName)}</HudBody>

      {positionLine && (
        <View
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: palette.line,
          }}
        >
          <Text
            style={{
              fontFamily: "Geist_600SemiBold",
              fontSize: 13,
              lineHeight: 19,
              color: palette.ink,
            }}
          >
            {positionLine}
          </Text>
        </View>
      )}

      {live.vehicleLost && (
        <HudBody>
          The feed lost this bus for a moment — we're counting with your phone.
        </HudBody>
      )}

      {cd.upcoming.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ ...KICKER, color: palette.inkSoft }}>Stops remaining</Text>
          <ScrollView
            style={scrolls ? { maxHeight: 216, marginTop: 8 } : { marginTop: 8 }}
            scrollEnabled={scrolls}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {cd.upcoming.map((s, i) => {
              const isTarget = i === cd.upcoming.length - 1;
              return (
                <View
                  key={`${s.stopId}-${i}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 12,
                    paddingVertical: 8,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: palette.line,
                  }}
                >
                  <Text
                    style={{
                      width: 22,
                      textAlign: "right",
                      fontFamily: "JetBrainsMono_500Medium",
                      fontSize: 11,
                      lineHeight: 19,
                      color: isTarget ? palette.ochre : palette.inkSoft,
                    }}
                  >
                    {s.stopsAway}
                  </Text>
                  <Text
                    style={{
                      flex: 1,
                      fontFamily: isTarget ? "Geist_700Bold" : "Geist_500Medium",
                      fontSize: 14,
                      lineHeight: 19,
                      color: isTarget ? palette.ink : palette.inkSoft,
                    }}
                  >
                    {s.name}
                    {isTarget ? "  ·  YOUR STOP" : ""}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {!cd.hasSequence && (
        <HudBody>
          We don't have this route's stop list, so we're counting by distance.
        </HudBody>
      )}

      {(cd.stage === "press-now" ||
        cd.stage === "alighting" ||
        cd.stage === "passed") && (
        <HeroButton
          label="I'm off the bus"
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
              () => {},
            );
            markAlighted();
          }}
        />
      )}
    </HudCard>
  );
}
