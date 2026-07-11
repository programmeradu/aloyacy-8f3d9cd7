// Zod schemas for the public HTTP boundary (`src/routes/api/public/*`).
//
// These live apart from the handlers so they can be unit-tested without
// booting the router, and so the mobile app's expectations are documented in
// one place. Keep them at least as strict as the underlying server function's
// own validator — the point is to reject junk *before* we spend a database
// round-trip or an upstream API call on it.

import { z } from "zod";

/** Cyprus bounding box — every rider coordinate we accept sits inside it. */
export const CY_LAT = { min: 34, max: 36 } as const;
export const CY_LNG = { min: 32, max: 35 } as const;

export const LatLngSchema = z.object({
  lat: z.number().min(CY_LAT.min).max(CY_LAT.max),
  lng: z.number().min(CY_LNG.min).max(CY_LNG.max),
});

/** Weather takes coordinates from the query string, so values arrive as text. */
export const WeatherQuerySchema = z.object({
  lat: z.coerce.number().min(CY_LAT.min).max(CY_LAT.max),
  lng: z.coerce.number().min(CY_LNG.min).max(CY_LNG.max),
});

/** Free-form point used for map biasing — deliberately worldwide. */
const AnyPoint = z.object({ lat: z.number(), lng: z.number() });

export const PlacesAutocompleteSchema = z.object({
  query: z.string().trim().min(1).max(200),
  bias: AnyPoint.optional(),
});

export const PlaceSchema = z.object({
  placeId: z.string().min(1).max(512),
});

export const RouteReliabilitySchema = z.object({
  routeIds: z.array(z.string().min(1).max(128)).min(1).max(50),
});

export const StopReliabilitySchema = z.object({
  stopId: z.string().min(1).max(128),
  routeIds: z.array(z.string().min(1).max(128)).min(1).max(30),
});

/** Mirrors the `parseTripIntent` server function's own validator. */
export const TripIntentSchema = z.object({
  text: z.string().trim().min(2).max(500),
  nowISO: z.iso.datetime().optional(),
  tzOffsetMin: z.number().int().min(-720).max(720).optional(),
});

/**
 * Text-to-speech. `input` is hard-capped because every character is billed by
 * the upstream voice provider.
 */
export const TtsSchema = z.object({
  // Long text is truncated rather than rejected: the endpoint has always
  // clipped at 400 characters and existing clients rely on that.
  input: z
    .string()
    .transform((s) => s.trim().slice(0, 400))
    .pipe(z.string().min(1)),
  voice: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,64}$/, "must be a voice id")
    .optional(),
  instructions: z.string().max(500).optional(),
});

export const IndexNowQuerySchema = z.object({
  host: z
    .string()
    .regex(/^[a-z0-9.-]{3,253}$/i, "must be a bare hostname")
    .optional(),
});

/**
 * Group trips multiplex several actions over one endpoint. We validate the
 * envelope here and let each server function apply its own payload schema.
 */
export const TRIP_GROUP_ACTIONS = ["create", "join", "ping", "leave", "end"] as const;
export type TripGroupAction = (typeof TRIP_GROUP_ACTIONS)[number];

export const TripGroupsEnvelopeSchema = z.object({
  action: z.enum(TRIP_GROUP_ACTIONS),
  payload: z.record(z.string(), z.unknown()).optional(),
});
