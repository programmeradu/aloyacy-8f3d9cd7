// Per-phase action HUD — the single next thing the rider should do, plus a
// calm tracking pill (and quiet replan escape hatch) when there is nothing.

import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import { clearActiveTrip, type ActiveTrip } from "@/lib/trip-store";
import {
  multiLegConfirmOnBoard,
  multiLegMarkArrived,
  multiLegMarkMissed,
  type MultiLegLive,
} from "@/lib/useMultiLegJourney";
import { startLiveTracking } from "@/lib/useJourney";
import { KICKER, fmtMin } from "./kit";

// ---------------------------------------------------------------------------
// Action HUD
// ---------------------------------------------------------------------------
export function MultiLegActions({
  live,
  active,
  onImOff,
  onGetOffHere,
}: {
  live: MultiLegLive;
  active: ActiveTrip;
  onImOff: () => void;
  onGetOffHere: () => void;
}) {
  if (!live.active) {
    return (
      <ActionCard
        tone="aegean"
        kicker="Live guidance"
        title={`Ready to head to ${active.to.label}?`}
        body="We'll follow every leg, hurry you when needed, and tell you exactly when to press stop."
        cta="Tap when you leave"
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          startLiveTracking();
        }}
      />
    );
  }

  if (live.phase === "waiting-to-board") {
    return (
      <ActionCard
        tone="ink"
        kicker={`On bus ${live.currentRideLeg?.routeShort ?? ""}?`}
        title="Confirm when you've boarded"
        body={`We'll then guide you to ${live.currentRideLeg?.alight.name ?? "your stop"}.`}
        cta="I'm on board"
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          multiLegConfirmOnBoard();
        }}
      />
    );
  }

  if (live.phase === "alight-soon") {
    return (
      <ActionCard
        tone="ochre"
        kicker="Press stop now"
        title={live.currentRideLeg?.alight.name ?? "Your stop is next"}
        body="Reach for the stop button. Tap once you're off."
        cta="I'm off"
        onPress={onImOff}
      />
    );
  }

  if (live.phase === "walking-to-destination") {
    const walkMin = fmtMin(
      live.currentLeg?.kind === "walk" ? live.currentLeg.durationSec : 0,
    );
    return (
      <ActionCard
        tone="olive"
        kicker={`Final walk · ${walkMin} min`}
        title={`To ${active.to.label}`}
        body="We'll flip to arrived automatically. Tap if you're already there."
        cta="I'm here"
        onPress={() => {
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
          multiLegMarkArrived();
        }}
      />
    );
  }

  if (live.phase === "missed-connection") {
    return (
      <ActionCard
        tone="ochre"
        kicker="Missed connection"
        title={`Bus ${live.nextRideLeg?.routeShort ?? ""} left without you`}
        body="Mark it and we'll help you replan from where you are."
        cta="Mark missed"
        onPress={() => {
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Warning,
          );
          multiLegMarkMissed();
        }}
      />
    );
  }

  if (live.phase === "arrived") {
    return (
      <ActionCard
        tone="olive"
        kicker="Arrived"
        title={`Welcome to ${active.to.label}`}
        body="Trip complete. We'll remember this route next time."
        cta="Close"
        onPress={() => {
          clearActiveTrip();
          router.replace("/(tabs)/plan");
        }}
      />
    );
  }

  // Calm tracking pill for phases with no explicit action. During a ride
  // we also expose a quiet "get off here" affordance so the rider can
  // bail out of the plan (missed a stop, changed their mind) and get
  // rerouted from their current position.
  const showGetOffHere =
    live.phase === "riding" || live.phase === "walking-to-transfer";
  return (
    <View style={{ paddingHorizontal: 20, gap: 10 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          borderRadius: 999,
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: palette.line,
          paddingHorizontal: 18,
          paddingVertical: 12,
        }}
      >
        <ActivityIndicator size="small" color={palette.aegeanDeep} />
        <Text
          style={{
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            color: palette.inkSoft,
          }}
        >
          Tracking your journey.
        </Text>
      </View>
      {showGetOffHere ? (
        <Pressable
          onPress={onGetOffHere}
          style={({ pressed }) => ({
            alignSelf: "flex-start",
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: palette.white,
            borderWidth: 1,
            borderColor: palette.line,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 11,
              letterSpacing: 1.4,
              color: palette.aegeanDeep,
              textTransform: "uppercase",
            }}
          >
            Get off here — replan
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ActionCard({
  tone,
  kicker,
  title,
  body,
  cta,
  onPress,
}: {
  tone: "aegean" | "ochre" | "olive" | "ink";
  kicker: string;
  title: string;
  body: string;
  cta: string;
  onPress: () => void;
}) {
  const bg =
    tone === "aegean"
      ? palette.aegeanSoft
      : tone === "ochre"
        ? palette.ochreSoft
        : tone === "olive"
          ? "rgba(63,74,54,0.10)"
          : palette.white;
  const border =
    tone === "aegean"
      ? "rgba(63,155,178,0.30)"
      : tone === "ochre"
        ? "rgba(201,133,58,0.40)"
        : tone === "olive"
          ? "rgba(63,74,54,0.25)"
          : palette.line;
  const kickerColor =
    tone === "aegean"
      ? palette.aegeanDeep
      : tone === "ochre"
        ? palette.ochre
        : tone === "olive"
          ? palette.olive
          : palette.aegeanDeep;
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View
        style={{
          borderRadius: 28,
          padding: 22,
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: border,
        }}
      >
        <Text style={{ ...KICKER, color: kickerColor }}>{kicker}</Text>
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
          {title}
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            lineHeight: 19,
            color: palette.inkSoft,
          }}
        >
          {body}
        </Text>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => ({
            marginTop: 16,
            alignSelf: "flex-start",
            backgroundColor: palette.ink,
            paddingHorizontal: 22,
            paddingVertical: 13,
            borderRadius: 999,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 13,
              color: palette.limestone,
              letterSpacing: -0.2,
            }}
          >
            {cta}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
