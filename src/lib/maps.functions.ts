import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  drivingRoute,
  placesAutocomplete,
  resolvePlace,
  reverseGeocode,
  walkingDirections,
} from "./maps.server";
import { createLogger } from "./logger";

const log = createLogger("maps");

export const autocompletePlaces = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        query: z.string().min(1).max(200),
        bias: z.object({ lat: z.number(), lng: z.number() }).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      return { suggestions: await placesAutocomplete(data.query, data.bias) };
    } catch (e) {
      log.error("autocomplete failed", e);
      return { suggestions: [] as Awaited<ReturnType<typeof placesAutocomplete>> };
    }
  });

// Place ids are URL-safe strings. Since the Mapbox migration a search result's
// id is `mbx.` + base64url(JSON [lat, lng, name, address, mapbox_id]) so
// resolving it needs no second lookup. Those routinely run past 300 chars
// (Greek names are 2 bytes each in UTF-8, then grow 4/3 in base64), and the old
// 300 cap made getPlace reject them: tapping such a search result did nothing.
// Constrain the charset so the value can never path-traverse a URL slot.
export const PLACE_ID_MAX = 2048;
export const PlaceIdSchema = z
  .string()
  .min(1)
  .max(PLACE_ID_MAX)
  // Mapbox ids are prefixed `mbx.` and may contain dots; never allow `/` or `..`.
  .regex(/^[A-Za-z0-9_.:-]+$/, "Invalid place ID")
  .refine((v) => !v.includes(".."), "Invalid place ID");

export const getPlace = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ placeId: PlaceIdSchema }).parse(input))
  .handler(async ({ data }) => resolvePlace(data.placeId));

export const reverseLookup = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ lat: z.number(), lng: z.number() }).parse(input))
  .handler(async ({ data }) => ({
    address: await reverseGeocode(data.lat, data.lng),
  }));

export const getWalkingDirections = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        from: z.object({ lat: z.number(), lng: z.number() }),
        to: z.object({ lat: z.number(), lng: z.number() }),
        locale: z.enum(["en", "el"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      return {
        directions: await walkingDirections(data.from, data.to, data.locale ?? "en"),
      };
    } catch (e) {
      log.error("walking directions failed", e);
      return { directions: null };
    }
  });

const Pt = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

export const getDriveEta = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ from: Pt, to: Pt }).parse(input))
  .handler(async ({ data }) => {
    const route = await drivingRoute(data.from, data.to);
    return { route };
  });
