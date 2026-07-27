// HUD cards for the stop-side phases: waiting at the stop, boarding prompt
// with auto-confirm, and the missed-bus rescue card.

import { useEffect, useState, useCallback } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import {
  confirmOnBoard,
  markMissed,
  type LiveJourney,
} from "@/lib/useJourney";
import { clearActiveTrip, type ActiveTrip } from "@/lib/trip-store";
import { replanRescue } from "@/lib/rescue";
import { fmtMin, boardingBody, countdownTick } from "@aloya/core/hud-copy";
import {
  KICKER,
  HudCard,
  HudTitle,
  HudBody,
  PrimaryButton,
  SecondaryButton,
} from "./HudButtons";

const AUTO_CONFIRM_SEC = 30;

function busLeg(trip: ActiveTrip) {
  const leg = trip.option.legs.find((l) => l.kind === "bus");
  return leg && leg.kind === "bus" ? leg : null;
}

export function AtStopCard({ trip, live }: { trip: ActiveTrip; live: LiveJourney }) {
  const bus = busLeg(trip);
  if (!bus) return null;
  return (
    <HudCard background="rgba(63,74,54,0.10)" borderColor="rgba(63,74,54,0.25)">
      <Text style={{ ...KICKER, color: palette.olive }}>You're at the stop</Text>
      <HudTitle size={26}>
        Bus {bus.routeShort} · {fmtMin(live.secsToBoard)}
      </HudTitle>
      <HudBody>Wait at {bus.board.name}. We'll buzz the moment it pulls in.</HudBody>
    </HudCard>
  );
}

export function BoardingPrompt({ trip, live }: { trip: ActiveTrip; live: LiveJourney }) {
  const bus = busLeg(trip);
  const [secondsLeft, setSecondsLeft] = useState(AUTO_CONFIRM_SEC);

  useEffect(() => {
    if (!live.onBoardSuggested) {
      setSecondsLeft(AUTO_CONFIRM_SEC);
      return;
    }
    const tm = setInterval(() => {
      setSecondsLeft((n) => {
        const { next, confirm } = countdownTick(n);
        if (confirm) {
          clearInterval(tm);
          confirmOnBoard();
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(tm);
  }, [live.onBoardSuggested]);

  if (!bus) return null;
  return (
    <HudCard background={palette.aegeanSoft} borderColor="rgba(63,155,178,0.35)">
      <Text style={{ ...KICKER, color: palette.aegeanDeep }}>Board the bus</Text>
      <HudTitle size={26}>
        {bus.routeShort} · {bus.routeLong}
      </HudTitle>
      <HudBody>
        {boardingBody({
          onBoardSuggested: live.onBoardSuggested,
          secondsLeft,
          alightName: bus.alight.name,
        })}
      </HudBody>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
        <PrimaryButton
          label="I'm on the bus"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            confirmOnBoard();
          }}
        />
        <SecondaryButton
          label="I missed it"
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            markMissed();
          }}
        />
      </View>
    </HudCard>
  );
}

export function MissedBusCard({ trip }: { trip: ActiveTrip }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const rescue = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const result = await replanRescue(trip);
    setLoading(false);
    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      router.replace(`/trip/${result.tripId}`);
      return;
    }
    setErr(result.error);
  }, [trip]);

  return (
    <HudCard background={palette.ochreSoft} borderColor="rgba(201,133,58,0.4)">
      <Text style={{ ...KICKER, color: palette.ochre }}>Missed the bus</Text>
      <HudTitle size={26}>No stress — we'll find the next one.</HudTitle>
      <HudBody>We'll re-plan a fresh route to {trip.to.label}.</HudBody>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
        <PrimaryButton
          label={loading ? "Finding…" : "Find another bus"}
          onPress={rescue}
          disabled={loading}
        />
        <SecondaryButton
          label="End trip"
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            clearActiveTrip();
            router.replace("/(tabs)/plan");
          }}
        />
      </View>
      {loading && <ActivityIndicator style={{ marginTop: 14 }} color={palette.ochre} />}
      {err ? (
        <Text
          style={{
            marginTop: 12,
            fontFamily: "Geist_600SemiBold",
            fontSize: 12,
            lineHeight: 18,
            color: palette.ochre,
          }}
        >
          {err}
        </Text>
      ) : null}
    </HudCard>
  );
}
