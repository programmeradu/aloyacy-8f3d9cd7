// Mobile counterpart of `src/components/NLPlannerCard.tsx`'s parse+geocode
// pipeline. Sends the free-text query to the same server parser the web
// uses, then geocodes the resolved place names through the shared Places
// proxy. Returns a fully-hydrated seed the plan tab can consume without
// any further input.
import { API_BASE } from "./api";
import { autocompletePlaces, resolvePlace } from "./places";

export type NlTripSeed = {
  from: { lat: number; lng: number; label: string } | null;
  to: { lat: number; lng: number; label: string };
  leaveByISO: string | null;
  arriveByISO: string | null;
  rawText: string;
  at: number;
};

const SELF_REFS = new Set([
  "my place",
  "home",
  "my home",
  "work",
  "my work",
  "office",
  "my office",
  "current location",
  "my location",
  "here",
]);

type ParsedIntent = {
  from: string | null;
  to: string | null;
  leaveByISO: string | null;
  arriveByISO: string | null;
  confidence: number;
} | null;

async function parseIntent(text: string): Promise<ParsedIntent> {
  try {
    const res = await fetch(`${API_BASE}/api/public/parse-trip-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        text,
        nowISO: new Date().toISOString(),
        tzOffsetMin: -new Date().getTimezoneOffset(),
      }),
    });
    if (!res.ok) return heuristic(text);
    const json = (await res.json()) as ParsedIntent;
    if (!json || !json.to) return heuristic(text);
    return json;
  } catch {
    return heuristic(text);
  }
}

// Local regex fallback so the flow degrades gracefully when the AI gateway
// is unavailable. Mirrors the web card's `extractHeuristicIntent`.
function heuristic(text: string): ParsedIntent {
  const t = text.trim();
  const lower = t.toLowerCase();
  let from: string | null = null;
  let to: string | null = null;
  const fromTo = lower.match(
    /\bfrom\s+(.+?)\s+to\s+(.+?)(?:\s+(?:tomorrow|tonight|today|at|by|in|leave|arrive|before|after|on)\b|$)/,
  );
  if (fromTo) {
    from = slice(t, fromTo[1]);
    to = slice(t, fromTo[2]);
  } else {
    const toMatch = lower.match(
      /\bto\s+(.+?)(?:\s+(?:tomorrow|tonight|today|at|by|in|leave|arrive|before|after|on)\b|$)/,
    );
    if (toMatch) to = slice(t, toMatch[1]);
  }
  if (!to) return null;
  const minMatch = lower.match(/\bin\s+(\d{1,3})\s*(?:min|minutes|mins)\b/);
  const leaveByISO = minMatch
    ? new Date(Date.now() + parseInt(minMatch[1], 10) * 60_000).toISOString()
    : null;
  return { from, to, leaveByISO, arriveByISO: null, confidence: 0.6 };
}

function slice(original: string, fragment: string) {
  const idx = original.toLowerCase().indexOf(fragment);
  return idx < 0 ? fragment.trim() : original.slice(idx, idx + fragment.length).trim();
}

async function geocode(
  q: string,
  bias?: { lat: number; lng: number },
): Promise<{ lat: number; lng: number; label: string } | null> {
  const suggestions = await autocompletePlaces({ query: q, bias }).catch(() => []);
  const first = suggestions[0];
  if (!first) return null;
  const place = await resolvePlace(first.placeId).catch(() => null);
  if (!place) return null;
  return { lat: place.lat, lng: place.lng, label: place.name || first.primary };
}

/**
 * Full "Ask Aloya" pipeline: parse the free-text query, geocode both
 * endpoints, and return a seed ready for the plan tab. Origin is `null`
 * when the user meant "from my current location" (or didn't specify one).
 */
export async function resolveAskAloya(
  text: string,
  bias?: { lat: number; lng: number },
): Promise<
  | { ok: true; seed: NlTripSeed }
  | { ok: false; reason: "parse" | "geocode"; rawText: string; hint?: string }
> {
  const rawText = text.trim();
  const intent = await parseIntent(rawText);
  if (!intent || !intent.to) {
    return { ok: false, reason: "parse", rawText };
  }
  const fromLower = intent.from?.trim().toLowerCase();
  const fromIsSelf = !intent.from || (fromLower && SELF_REFS.has(fromLower));
  const [destination, originMaybe] = await Promise.all([
    geocode(intent.to, bias),
    fromIsSelf || !intent.from ? Promise.resolve(null) : geocode(intent.from, bias),
  ]);
  if (!destination) {
    return { ok: false, reason: "geocode", rawText, hint: intent.to };
  }
  return {
    ok: true,
    seed: {
      from: originMaybe,
      to: destination,
      leaveByISO: intent.leaveByISO,
      arriveByISO: intent.arriveByISO,
      rawText,
      at: Date.now(),
    },
  };
}
