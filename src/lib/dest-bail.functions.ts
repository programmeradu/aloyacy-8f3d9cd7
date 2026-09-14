import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { suggestLastMileChain } from "./last-mile-chain.functions";
import type { DestBail } from "@aloya/core/dest-bail";
import { planMultiLegScheduled } from "./journey-scheduled.server";

const Pt = z.object({
  lat: z.number(),
  lng: z.number(),
  name: z.string().optional(),
});

const InputSchema = z.object({
  from: Pt,
  destination: Pt,
  routeShort: z.string(),
  waitMin: z.number(),
});

export const upgradeDestBail = createServerFn({ method: "POST" })
  .inputValidator((data: z.input<typeof InputSchema>) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<DestBail | null> => {
    try {
      const chain = await suggestLastMileChain({
        data: {
          alight: data.from,
          destination: data.destination,
        },
      });
      if (chain) {
        if (chain.boltDeepLink && chain.fareLow > 0) {
          return {
            kind: "boltScooter",
            priceFrom: `€${chain.fareLow.toFixed(2)}`,
            routeShort: data.routeShort,
          };
        }
        if (chain.telDispatcher && chain.fareLow > 0) {
          return {
            kind: "taxi",
            priceFrom: `€${chain.fareLow.toFixed(2)}`,
            routeShort: data.routeShort,
          };
        }
      }
    } catch {}


    try {
      const plans = await planMultiLegScheduled(
        { lat: data.from.lat, lng: data.from.lng, label: "Here" },
        { lat: data.destination.lat, lng: data.destination.lng, label: "Dest" }
      );
      if (plans.itineraries.length > 0) {
        const best = plans.itineraries[0];
        const firstWalk = best.legs[0];
        const firstRide = best.legs[1];

        if (
          firstWalk &&
          firstRide &&
          firstWalk.kind === "walk" &&
          firstRide.kind === "ride" &&
          firstRide.routeShort !== data.routeShort
        ) {
          return {
            kind: "raptorWalk",
            walkMin: Math.max(1, Math.round(firstWalk.durationSec / 60)),
            destLabel: data.destination.name ?? "",
            routeShort: firstRide.routeShort,
          };
        }
      }
    } catch {}

    return null;
  });