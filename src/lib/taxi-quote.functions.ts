// Measured taxi quote. Google Routes TRAFFIC_AWARE, then the Cyprus tariff.
// Fail open — no drive, no euro.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { drivingRoute } from "./maps.server";
import {
  taxiNightAt,
  taxiQuoteFromDrive,
  type TaxiQuote,
} from "@aloya/core/taxi-quote";

const Pt = z.object({
  lat: z.number().min(34).max(36),
  lng: z.number().min(32).max(35),
});

const InputSchema = z.object({
  from: Pt,
  to: Pt,
  atUnix: z.number().int().positive().optional(),
});

export type { TaxiQuote };

export const suggestTaxiQuote = createServerFn({ method: "POST" })
  .inputValidator((data: z.input<typeof InputSchema>) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<TaxiQuote | null> => {
    const drive = await drivingRoute(data.from, data.to).catch(() => null);
    const at = data.atUnix ?? Math.floor(Date.now() / 1000);
    return taxiQuoteFromDrive(drive, taxiNightAt(at));
  });
