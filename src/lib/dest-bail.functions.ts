import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { destBailFromQuote, type DestBail } from "@aloya/core/dest-bail";
import { planMultiLegScheduled } from "./journey-scheduled.server";
import { suggestTaxiQuote } from "./taxi-quote.functions";

const Pt = z.object({
  lat: z.number().min(34).max(36),
  lng: z.number().min(32).max(35),
  name: z.string().max(200).optional(),
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
    // Other bus first — cheaper than a taxi, and we already measured the walk.
    try {
      const plans = await planMultiLegScheduled(
        { lat: data.from.lat, lng: data.from.lng, label: "Here" },
        {
          lat: data.destination.lat,
          lng: data.destination.lng,
          label: data.destination.name ?? "Dest",
        },
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

    try {
      const quote = await suggestTaxiQuote({
        data: {
          from: { lat: data.from.lat, lng: data.from.lng },
          to: { lat: data.destination.lat, lng: data.destination.lng },
        },
      });
      return destBailFromQuote({
        dark: true,
        phase: "waiting",
        waitMin: data.waitMin,
        walkPossible: false,
        destLabel: data.destination.name?.trim() || "your door",
        routeShort: data.routeShort,
        quote,
      });
    } catch {
      return null;
    }
  });
