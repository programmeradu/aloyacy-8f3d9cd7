// Path-parameter validation for the dynamic OG image routes.
//
// These endpoints are hit by crawlers (Slack, WhatsApp, X, Google) with
// whatever string happens to sit in a pasted URL, so the parameter is
// untrusted input like any query string. Rather than 400 — a crawler that
// gets an error renders no preview at all, which looks broken to the person
// who shared the link — an unusable parameter simply resolves to `null` and
// the route falls through to its generic branded card.
//
// Validating here also keeps a malformed value out of the database call:
// `safeGroupCode` / `safePlanToken` returning null means the handler skips
// the lookup entirely instead of round-tripping garbage to Postgres.

import { z } from "zod";

/** Group invite codes are short, upper-case alphanumerics. */
export const GroupCodeParam = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{4,12}$/));

/** Share tokens are URL-safe opaque strings. */
export const PlanTokenParam = z
  .string()
  .trim()
  .pipe(z.string().regex(/^[A-Za-z0-9_-]{6,64}$/));

function safe<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.infer<S> | null {
  const result = schema.safeParse(typeof raw === "string" ? raw : "");
  return result.success ? result.data : null;
}

/** Normalised group code, or null when the parameter can't be a real code. */
export function safeGroupCode(raw: unknown): string | null {
  return safe(GroupCodeParam, raw);
}

/** Share token, or null when the parameter can't be a real token. */
export function safePlanToken(raw: unknown): string | null {
  return safe(PlanTokenParam, raw);
}
