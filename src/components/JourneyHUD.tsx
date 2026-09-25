// Live journey HUD: Start button → live walking card with countdown to next
// turn → at-stop confirmation → on-board prompt → press-stop alert →
// arrival. Renders only the bits relevant to the current live phase.

import type { LiveJourney } from "@/lib/useJourney";
import type { ActiveTrip } from "@/lib/trip-store";
import type { WalkStep } from "@/lib/geo";
import { AlightCountdownCard } from "@/components/journey/AlightCountdownCard";
import { StartCard } from "@/components/journey/StartCard";
import { HurryBanner } from "@/components/journey/HurryBanner";
import { LiveStepCard } from "@/components/journey/LiveStepCard";
import { AtStopCard } from "@/components/journey/AtStopCard";
import { BoardingPrompt } from "@/components/journey/BoardingPrompt";
import { MissedBusCard } from "@/components/journey/MissedBusCard";
import { RidingCard } from "@/components/journey/RidingCard";
import { OnBoardAsk } from "@/components/journey/OnBoardAsk";
import { ArrivedCard } from "@/components/journey/ArrivedCard";

export {
  StartCard,
  HurryBanner,
  LiveStepCard,
  AtStopCard,
  BoardingPrompt,
  MissedBusCard,
  RidingCard,
  OnBoardAsk,
  ArrivedCard,
};

export function JourneyHUD({
  trip,
  live,
  steps,
}: {
  trip: ActiveTrip;
  live: LiveJourney;
  steps: WalkStep[] | null;
}) {
  if (!live.active) {
    return <StartCard trip={trip} />;
  }

  return (
    <div className="space-y-5">
      {/* Hurry banner — soft or urgent */}
      {(live.phase === "hurry-soft" || live.phase === "hurry-urgent") && (
        <HurryBanner urgent={live.phase === "hurry-urgent"} live={live} />
      )}

      {/* Walking turn-by-turn live card */}
      {(live.phase === "walking-to-stop" ||
        live.phase === "hurry-soft" ||
        live.phase === "hurry-urgent" ||
        live.phase === "walking-to-dest") &&
        steps &&
        steps.length > 0 && <LiveStepCard live={live} steps={steps} />}

      {/* Arrived at stop */}
      {live.phase === "at-stop" && <AtStopCard trip={trip} live={live} />}

      {/* Bus is at the stop — confirm boarding */}
      {live.phase === "boarding" && <BoardingPrompt trip={trip} live={live} />}

      {/* Bus left without us */}
      {live.phase === "missed-bus" && <MissedBusCard trip={trip} />}

      {/* On bus. With a known stop sequence the rider gets the live stop
          countdown; otherwise we fall back to the plain ETA card. */}
      {(live.phase === "on-bus" || live.phase === "alight-soon") &&
        (live.alight.hasSequence || live.alight.stage !== "cruising" ? (
          <AlightCountdownCard trip={trip} live={live} />
        ) : (
          <RidingCard trip={trip} live={live} />
        ))}

      {(live.phase === "on-bus" || live.phase === "alight-soon") && (
        <OnBoardAsk trip={trip} live={live} />
      )}

      {/* Final arrival */}
      {live.phase === "arrived" && <ArrivedCard trip={trip} />}
    </div>
  );
}
