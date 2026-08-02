// Walk turn-by-turn block: long-final-walk hint, live banner, full step list.

import { View } from "react-native";
import { LongFinalWalkHint } from "@/components/LongFinalWalkHint";
import { LiveWalkBanner } from "@/components/LiveWalkBanner";
import { WalkGuidance } from "@/components/WalkGuidance";
import type { WalkLeg } from "@/lib/journey-types";
import type { MultiLegLive } from "@/lib/useMultiLegJourney";

type Directions = {
  steps: unknown[];
  durationSec: number;
  distanceMeters: number;
};

/** "Walk to X" vs "Walk to bus 30" — the transfer case names the connection. */
function walkTarget(live: MultiLegLive, walk: WalkLeg): string {
  if (live.phase === "walking-to-transfer") {
    const short = live.nextRideLeg?.routeShort?.trim();
    return short ? `bus ${short}` : "your connection";
  }
  return walk.to.name;
}

export function CompanionWalkBlock({
  live,
  walk,
  directions,
  destinationLabel,
}: {
  live: MultiLegLive;
  walk: WalkLeg;
  directions: Directions;
  destinationLabel: string;
}) {
  const target = walkTarget(live, walk);
  return (
    <>
      {live.phase === "walking-to-destination" && (
        <LongFinalWalkHint
          from={{ lat: walk.from.lat, lng: walk.from.lng }}
          to={{ lat: walk.to.lat, lng: walk.to.lng }}
          distanceMeters={walk.distanceMeters}
          durationSec={walk.durationSec}
          destinationLabel={destinationLabel}
        />
      )}
      <LiveWalkBanner
        title={`To ${target}`}
        steps={directions.steps as never}
        fix={live.fix ? { lat: live.fix.lat, lng: live.fix.lng } : null}
        to={{ lat: walk.to.lat, lng: walk.to.lng }}
      />
      <View style={{ marginTop: 20 }}>
        <WalkGuidance
          title={`Walk to ${target}`}
          steps={directions.steps as never}
          totalDurationSec={directions.durationSec}
          totalDistanceMeters={directions.distanceMeters}
        />
      </View>
    </>
  );
}
