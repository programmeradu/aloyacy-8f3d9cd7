// HUD cards for the pre-boarding phases: start, hurry banner, walking step.

import { View, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import { startLiveTracking, type LiveJourney } from "@/lib/useJourney";
import type { ActiveTrip } from "@/lib/trip-store";
import type { WalkStep } from "@aloya/core/geo";
import {
  fmtMin,
  fmtDist,
  hurryCopy,
  hurryHeadline,
  maneuverLabel,
  activeStepIndex,
} from "@aloya/core/hud-copy";
import { KICKER, HudCard, HudTitle, HudBody, HeroButton } from "./HudButtons";

export function StartCard({ trip }: { trip: ActiveTrip }) {
  return (
    <HudCard background={palette.ink}>
      <Text style={{ ...KICKER, color: palette.limestone }}>Live guidance</Text>
      <HudTitle size={30} color={palette.white}>
        Ready to head to {trip.to.label}?
      </HudTitle>
      <HudBody color="rgba(246,241,231,0.75)">
        We'll track your walk, warn you if the bus slips, and press-stop for you
        before you need to. Lock the screen — we'll buzz when it matters.
      </HudBody>
      <HeroButton
        tone="limestone"
        label="Start live guidance"
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          startLiveTracking();
        }}
      />
    </HudCard>
  );
}

export function HurryBanner({ urgent, live }: { urgent: boolean; live: LiveJourney }) {
  const copy = hurryCopy(urgent);
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View
        style={{
          borderRadius: 24,
          padding: 18,
          backgroundColor: urgent ? palette.ochreSoft : "rgba(242,223,196,0.55)",
          borderWidth: 1,
          borderColor: urgent ? "rgba(201,133,58,0.5)" : "rgba(201,133,58,0.25)",
        }}
      >
        <Text style={{ ...KICKER, color: palette.ochre }}>{copy.kicker}</Text>
        <Text
          style={{
            marginTop: 6,
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 26,
            lineHeight: 30,
            letterSpacing: -0.6,
            color: palette.ink,
          }}
        >
          {hurryHeadline(live.secsToBoard, live.walkingEtaSec)}
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
          {copy.body}
        </Text>
      </View>
    </View>
  );
}

export function LiveStepCard({
  live,
  steps,
}: {
  live: LiveJourney;
  steps: WalkStep[];
}) {
  const idx = activeStepIndex(live.currentStepIndex, steps.length);
  const step = steps[idx];
  const next = steps[idx + 1];
  if (!step) return null;

  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View
        style={{
          borderRadius: 28,
          padding: 22,
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: palette.line,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Text style={{ ...KICKER, color: palette.aegeanDeep, flexShrink: 1 }}>
            {live.phase === "walking-to-dest"
              ? "Walking to destination"
              : "Walking to stop"}
          </Text>
          <Text
            style={{ ...KICKER, color: palette.inkSoft, letterSpacing: 1.6 }}
            numberOfLines={1}
          >
            {fmtDist(live.metersToDestination)} · {fmtMin(live.walkingEtaSec)}
          </Text>
        </View>
        <Text
          style={{
            marginTop: 12,
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: step.instruction.length > 60 ? 24 : 30,
            lineHeight: step.instruction.length > 60 ? 28 : 34,
            letterSpacing: -0.7,
            color: palette.ink,
          }}
        >
          {step.instruction}
        </Text>
        <Text
          style={{ marginTop: 8, ...KICKER, color: palette.inkSoft, letterSpacing: 1.6 }}
        >
          {fmtDist(live.metersToStepEnd)} · {maneuverLabel(step.maneuver)}
        </Text>
        {next ? (
          <View
            style={{
              marginTop: 16,
              paddingTop: 14,
              borderTopWidth: 1,
              borderTopColor: palette.line,
            }}
          >
            <Text style={{ ...KICKER, color: palette.inkSoft, letterSpacing: 1.6 }}>
              Then
            </Text>
            <Text
              style={{
                marginTop: 4,
                fontFamily: "Geist_600SemiBold",
                fontSize: 15,
                lineHeight: 20,
                color: palette.inkSoft,
              }}
            >
              {next.instruction}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
