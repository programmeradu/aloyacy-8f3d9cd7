// Native live journey HUD — parity with `src/components/JourneyHUD.tsx`.
// Renders only the card relevant to the current live phase:
//
//   idle              → Start card (large "Start live guidance" CTA)
//   walking-to-stop   → Live step card (current instruction + countdowns)
//   hurry-soft/urgent → Hurry banner above the step card
//   at-stop           → Bus-in-N-min waiting card
//   boarding          → Confirm-boarding card with 30 s auto-confirm
//   missed-bus        → Rescue card (Find another bus / End trip)
//   on-bus            → Riding card (fused ETA, calm/lost note)
//   alight-soon       → Riding card + prominent "I'm off" button
//   arrived           → Arrived card
//
// Phase → card mapping lives in `@aloya/core/hud-copy` (`hudVisibility`) so
// web and native agree; the cards themselves live in ./journey/*.

import { View } from "react-native";
import type { LiveJourney } from "@/lib/useJourney";
import type { ActiveTrip } from "@/lib/trip-store";
import type { WalkStep } from "@aloya/core/geo";
import { hudVisibility } from "@aloya/core/hud-copy";
import { StartCard, HurryBanner, LiveStepCard } from "./journey/WalkCards";
import { AtStopCard, BoardingPrompt, MissedBusCard } from "./journey/BoardCards";
import { RidingCard, ArrivedCard } from "./journey/RideCards";
import { AlightCountdownCard } from "./journey/AlightCountdownCard";

export function JourneyHUD({
  trip,
  live,
  steps,
}: {
  trip: ActiveTrip;
  live: LiveJourney;
  steps: WalkStep[] | null;
}) {
  const show = hudVisibility({
    active: live.active,
    phase: live.phase,
    hasSteps: !!steps && steps.length > 0,
  });

  if (show.start) return <StartCard trip={trip} />;

  return (
    <View style={{ gap: 14 }}>
      {show.hurry && (
        <HurryBanner urgent={live.phase === "hurry-urgent"} live={live} />
      )}
      {show.step && steps && <LiveStepCard live={live} steps={steps} />}
      {show.atStop && <AtStopCard trip={trip} live={live} />}
      {show.boarding && <BoardingPrompt trip={trip} live={live} />}
      {show.missed && <MissedBusCard trip={trip} />}
      {/* On bus. With a known stop sequence the rider gets the live stop
          countdown; otherwise we fall back to the plain ETA card. */}
      {show.riding &&
        (live.alight.hasSequence || live.alight.stage !== "cruising" ? (
          <AlightCountdownCard trip={trip} live={live} />
        ) : (
          <RidingCard trip={trip} live={live} />
        ))}
      {show.arrived && <ArrivedCard trip={trip} />}
    </View>
  );
}
