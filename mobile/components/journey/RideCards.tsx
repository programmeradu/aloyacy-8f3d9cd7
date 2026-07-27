// HUD cards for the on-board phases: riding (with alight-soon CTA) and arrived.

import { Text } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import { markAlighted, type LiveJourney } from "@/lib/useJourney";
import { clearActiveTrip, type ActiveTrip } from "@/lib/trip-store";
import { fmtMin, alightEtaSec, ridingBody } from "@aloya/core/hud-copy";
import { KICKER, HudCard, HudTitle, HudBody, HeroButton } from "./HudButtons";

export function RidingCard({ trip, live }: { trip: ActiveTrip; live: LiveJourney }) {
  const leg = trip.option.legs.find((l) => l.kind === "bus");
  if (!leg || leg.kind !== "bus") return null;
  const eta = alightEtaSec(live.fusedSecsToAlight, live.secsToAlight);
  const alightSoon = live.phase === "alight-soon";

  return (
    <HudCard background={palette.white} borderColor={palette.line}>
      <Text style={{ ...KICKER, color: palette.aegeanDeep }}>
        On board · {leg.routeShort}
      </Text>
      <HudTitle size={28}>
        Off in {fmtMin(eta)} at {leg.alight.name}
      </HudTitle>
      <HudBody>{ridingBody(live.vehicleLost)}</HudBody>
      {alightSoon && (
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

export function ArrivedCard({ trip }: { trip: ActiveTrip }) {
  return (
    <HudCard background="rgba(63,74,54,0.14)" borderColor="rgba(63,74,54,0.3)">
      <Text style={{ ...KICKER, color: palette.olive }}>You've arrived</Text>
      <HudTitle size={28}>Welcome to {trip.to.label}.</HudTitle>
      <HeroButton
        label="Finish trip"
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          clearActiveTrip();
          router.replace("/(tabs)");
        }}
      />
    </HudCard>
  );
}
