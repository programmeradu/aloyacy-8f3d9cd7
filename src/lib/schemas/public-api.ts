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

export const StopRunHintsSchema = z.object({
  routeIds: z.array(z.string().min(1).max(128)).min(1).max(30),
  stopId: z.string().min(1).max(128).optional(),
});

/** Marketing / embed board. `IC:45,NPT:31` — agency + published short name. */
export const BoardQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(3)
    .max(400)
    .regex(
      /^[A-Z]{2,6}:[A-Za-z0-9-]{1,16}(,[A-Z]{2,6}:[A-Za-z0-9-]{1,16})*$/,
      "must be AGENCY:short pairs",
    ),
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

/**
 * Pulse tab query params. All optional — the endpoint degrades gracefully
 * without a rider fix, but any value supplied must be a real coordinate.
 */
export const PulseQuerySchema = z.object({
  lat: z.coerce.number().min(CY_LAT.min).max(CY_LAT.max).optional(),
  lng: z.coerce.number().min(CY_LNG.min).max(CY_LNG.max).optional(),
  destLat: z.coerce.number().min(CY_LAT.min).max(CY_LAT.max).optional(),
  destLng: z.coerce.number().min(CY_LNG.min).max(CY_LNG.max).optional(),
});

/** Mirrors `getItineraryTrafficAlerts`'s own point-array validator. */
export const TrafficAlertsSchema = z.object({
  points: z
    .array(z.object({ lat: z.number(), lng: z.number() }))
    .min(1)
    .max(64),
});

/**
 * BYOK test proxy for AWS Bedrock. Credentials are per-request and never
 * stored, so we only validate shape/bounds — not that the keys are real.
 */
export const BedrockTestSchema = z.object({
  authMode: z.enum(["api-key", "sigv4"]).default("api-key"),
  apiKey: z.string().trim().max(4096).optional(),
  accessKeyId: z.string().trim().max(256).optional(),
  secretAccessKey: z.string().trim().max(256).optional(),
  sessionToken: z.string().trim().max(4096).optional(),
  region: z.string().trim().min(1).max(64).default("sa-east-1"),
  modelId: z.string().trim().min(1).max(256),
  prompt: z.string().trim().min(1).max(20000),
  maxTokens: z.coerce.number().int().min(1).max(32000).default(1024),
});

export const ETA_LOG_SURFACES = [
  "stop-card",
  "home",
  "hud",
  "multileg",
  "push",
  "promise",
  "api",
] as const;

export const EtaLogSchema = z.object({
  tripId: z.string().min(1).max(128),
  routeId: z.string().min(1).max(128),
  stopId: z.string().min(1).max(128),
  horizonSec: z.number().int().min(0).max(24 * 3600),
  p50Sec: z.number().int().min(0).max(24 * 3600),
  p25Sec: z.number().int().min(0).max(24 * 3600).optional(),
  p90Sec: z.number().int().min(0).max(24 * 3600).optional(),
  tier: z.enum(["live", "rider-confirmed", "predicted", "ghost", "scheduled"]),
  confidence: z.enum(["high", "medium", "low"]),
  operatorEtaSec: z.number().int().min(0).max(24 * 3600).optional(),
  learnedBiasSec: z.number().int().min(-3600).max(3600).optional(),
  surface: z.enum(ETA_LOG_SURFACES),
});

export const PARTNER_ROLES = [
  "hotel",
  "municipality",
  "operator",
  "kiosk",
  "airport",
  "other",
] as const;

export const PartnerApplySchema = z.object({
  orgName: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(255),
  role: z.enum(PARTNER_ROLES),
  useCase: z.string().trim().min(8).max(1500),
  website: z.string().trim().max(200).optional(),
  // Honeypot — bots fill this; humans leave it empty.
  company: z.string().max(120).optional(),
});


// ---------------------------------------------------------------------------
// Phase 3 batch 1 — mirrors each server function's own `.inputValidator` so a
// bad request is rejected here, before it reaches the server fn, feed cache,
// or a paid upstream call. Kept in lockstep with the `*.functions.ts` schema
// it fronts; if that schema changes, update the pair here too.

export const AirportQuerySchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.enum(["lca", "pfo"])),
});

/** Shared by bike-share / bolt-scooter: an OD pair plus the bus-only baseline. */
export const TravelPairWithBusOnlySchema = z.object({
  from: LatLngSchema,
  to: LatLngSchema,
  busOnlyDurationSec: z.number().int().positive().nullable().optional(),
});

export const BikeShareBodySchema = TravelPairWithBusOnlySchema;
export const BoltScooterBodySchema = TravelPairWithBusOnlySchema;

export const DustAdvisoryQuerySchema = z.object({
  lat: z.coerce.number().min(CY_LAT.min).max(CY_LAT.max),
  lng: z.coerce.number().min(CY_LNG.min).max(CY_LNG.max),
});

export const IntercityIntelQuerySchema = z.object({
  routeId: z.string().min(1),
});

export const KapnosBodySchema = z.object({
  from: AnyPoint,
  to: AnyPoint,
  afterUnix: z.number().optional(),
  beforeUnix: z.number().optional(),
});

const LastMileChainPoint = z.object({
  lat: z.number().min(CY_LAT.min).max(CY_LAT.max),
  lng: z.number().min(CY_LNG.min).max(CY_LNG.max),
  name: z.string().max(200).optional(),
});

export const LastMileChainBodySchema = z.object({
  alight: LastMileChainPoint,
  destination: LastMileChainPoint,
  arrivalUnix: z.number().int().positive().nullable().optional(),
  finalWalkMeters: z.number().min(0).max(100_000).nullable().optional(),
});

const ParkAndRidePoint = z.object({
  lat: z.number().min(CY_LAT.min).max(CY_LAT.max),
  lng: z.number().min(CY_LNG.min).max(CY_LNG.max),
  label: z.string().max(200).optional(),
});

export const ParkAndRideBodySchema = z.object({
  from: ParkAndRidePoint,
  to: ParkAndRidePoint,
  busOnlyDurationSec: z.number().int().positive().nullable().optional(),
  busOnlyAccessWalkM: z.number().int().min(0).nullable().optional(),
});

const PlanPoint = z.object({
  lat: z.number().min(CY_LAT.min).max(CY_LAT.max),
  lng: z.number().min(CY_LNG.min).max(CY_LNG.max),
  label: z.string().max(200).optional(),
});

const PlanA11ySchema = z
  .object({
    stepFree: z.boolean().optional(),
    preferShade: z.boolean().optional(),
    lowFloor: z.boolean().optional(),
    maxWalkMeters: z.number().int().min(100).max(3000).nullable().optional(),
  })
  .optional();

export const PlanBodySchema = z.object({
  from: PlanPoint,
  to: PlanPoint,
  debug: z.boolean().optional(),
  mode: z.enum(["live", "scheduled", "both"]).optional(),
  departAtUnix: z.number().int().positive().optional(),
  arriveByUnix: z.number().int().positive().optional(),
  a11y: PlanA11ySchema,
});

/**
 * Cron/ops hook that rebuilds the schedule shards. The body is optional — an
 * empty POST means "default window" — but a supplied `days` is clamped by the
 * schema rather than by hand, so an absurd value is rejected at the edge
 * instead of quietly turning into a 200-day download.
 */
export const IngestScheduleBodySchema = z
  .object({
    days: z.number().int().min(1).max(14).optional(),
    force: z.boolean().optional(),
  })
  .default({});

/**
 * Stripe posts webhooks to `?env=live` or `?env=sandbox`. Anything else is a
 * misconfigured endpoint, and silently defaulting it would verify the payload
 * against the wrong signing secret.
 */
export const StripeEnvQuerySchema = z.object({
  env: z.enum(["live", "sandbox"]).default("sandbox"),
});

/**
 * Body of a `/api/public/trip-alerts` cron tick.
 *
 * The scheduler normally posts no body at all; an operator running the tick by
 * hand may cap the batch (`limit`) while debugging. Both forms parse, anything
 * else is rejected with 400 before a single row is read.
 */
export const TripAlertsTickSchema = z
  .object({
    limit: z.number().int().positive().max(5_000).optional(),
  })
  .strict();

export type TripAlertsTick = z.infer<typeof TripAlertsTickSchema>;

/**
 * Parses a request body that is allowed to be absent or empty.
 *
 * Returns the schema's parse of `{}` for "no body", so a scheduled caller that
 * posts nothing behaves identically to one posting an empty object, while a
 * malformed or unexpected payload still fails at the boundary.
 */
export async function parseOptionalJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  let raw: unknown = {};
  const text = await request.text().catch(() => "");
  if (text.trim().length > 0) {
    try {
      raw = JSON.parse(text);
    } catch {
      return { ok: false, error: "body is not valid JSON" };
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  return { ok: true, data: parsed.data };
}

// ---------------------------------------------------------------------------
// Non-JSON caller input.
//
// Two public endpoints take input that isn't a JSON body: `stt` receives a
// multipart upload, and the cron hooks read a shared secret off the query
// string. They get schemas too, so the trust boundary for every public route
// is expressed the same way and is statically discoverable.

/** Metadata of the multipart audio upload accepted by `/api/public/stt`. */
export const SttUploadSchema = z.object({
  size: z
    .number()
    .int()
    .min(512, "Recording too short")
    .max(20 * 1024 * 1024, "Recording too large"),
  name: z.string().trim().min(1).max(200).default("recording.m4a"),
  type: z.string().trim().max(100).optional(),
});

/** `?cron_secret=` on the scheduled ingest hooks. Compared, never echoed. */
export const CronSecretQuerySchema = z.object({
  cron_secret: z.string().trim().min(1).max(200).optional(),
});

export { StopConditionSchema } from "./stop-condition";