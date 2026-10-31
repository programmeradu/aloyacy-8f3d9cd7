// Helpers for the portrait share pictures (?f=p on the /api/public/og/*
// endpoints): the link printed on the card and the live next bus the share
// sheet passes in. Everything read from the query is validated; anything odd
// is dropped so the card says less rather than something wrong.
import { getRoute } from "@/lib/gtfs";
import { SAFE_ID } from "@/lib/og-asset";
import { cyTime } from "@/lib/og-runtime.server";
import type { NextBus } from "@/lib/og-roam-portrait.server";

/** True when the request asks for the 4:5 share picture. */
export const wantsPortrait = (request: Request) =>
  new URL(request.url).searchParams.get("f") === "p";

/** "host/path" of the page being shared, on the origin the card was asked from. */
export function cardLink(request: Request, path: string): string {
  return `${new URL(request.url).host}${path}`;
}

/** Cache key prefix: portrait cards are per host because the link is printed on them. */
export const portraitKey = (request: Request, key: string) =>
  `p/${new URL(request.url).host}/${key}`;

/** Thrown inside a draw callback so ogRender serves its fallback instead. */
export function noCard(): never {
  throw new Error("no card for this id");
}

/**
 * The next departure, as the stop page shows it: n = route id, m = minutes
 * (0 to 180), t = arrival unix seconds, h = headsign. Over an hour away the
 * card shows the clock time instead of a big minute count.
 */
export function readNextBus(request: Request): NextBus | null {
  const q = new URL(request.url).searchParams;
  const n = q.get("n") ?? "";
  const mRaw = q.get("m");
  if (!n || !SAFE_ID.test(n) || !getRoute(n) || mRaw == null || mRaw === "") return null;
  const m = Number(mRaw);
  if (!Number.isInteger(m) || m < 0 || m > 180) return null;
  const t = Number(q.get("t"));
  const now = Date.now() / 1000;
  const clock = Number.isFinite(t) && t > now - 600 && t < now + 4 * 3600 ? cyTime(t) : null;
  if (m > 60 && !clock) return null;
  const h =
    (q.get("h") ?? "")
      .replace(/[\u0000-\u001f<>]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || null;
  return { routeId: n, minutes: m, clock, headsign: h };
}
