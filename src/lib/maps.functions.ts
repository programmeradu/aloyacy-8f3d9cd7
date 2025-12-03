import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  drivingRoute,
  placesAutocomplete,
  resolvePlace,
  reverseGeocode,
  walkingDirections,
} from "./maps.server";

export const autocompletePlaces = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        query: z.string().min(1).max(200),
        bias: z
          .object({ lat: z.number(), lng: z.number() })
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      return { suggestions: await placesAutocomplete(data.query, data.bias) };
    } catch (e) {
      console.error("autocomplete failed", e);
      return { suggestions: [] as Awaited<ReturnType<typeof placesAutocomplete>> };
    }
  });

export const getPlace = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ placeId: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => resolvePlace(data.placeId));

export const reverseLookup = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ lat: z.number(), lng: z.number() }).parse(input),
  )
  .handler(async ({ data }) => ({
    address: await reverseGeocode(data.lat, data.lng),
  }));

export const getWalkingDirections = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        from: z.object({ lat: z.number(), lng: z.number() }),
        to: z.object({ lat: z.number(), lng: z.number() }),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      return { directions: await walkingDirections(data.from, data.to) };
    } catch (e) {
      console.error("walking directions failed", e);
      return { directions: null };
    }
  });

const Pt = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

export const getDriveEta = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ from: Pt, to: Pt }).parse(input),
  )
  .handler(async ({ data }) => {
    const route = await drivingRoute(data.from, data.to);
    return { route };
  });
