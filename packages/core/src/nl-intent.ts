// Pure natural-language trip intent extraction.
//
// Two layers feed the NL planner card:
//   1. Deterministic regex pass (extractHeuristicIntent) — instant, catches
//      "to X", "from X to Y", "X in N min", "leave at HH:MM to X".
//   2. An LLM pass elsewhere refines what the regex missed.
// mergeIntents() combines them: LLM wins on place names, the regex wins on
// time arithmetic (it is anchored to the caller's real clock offset).
//
// Everything here is pure: no DOM, no network, no ambient clock unless the
// caller passes one (nowMs defaults to Date.now() so tests can freeze it).

export type LocalIntent = {
  from: string | null;
  to: string | null;
  leaveByISO: string | null;
  arriveByISO: string | null;
  confidence: number;
};

/** Phrases that mean "wherever I am right now" — never geocoded. */
export const SELF_REFS: ReadonlySet<string> = new Set([
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

export function isSelfReference(value: string | null | undefined): boolean {
  if (!value) return true;
  return SELF_REFS.has(value.trim().toLowerCase());
}

/** Find the original-cased slice matching a lowercase fragment. */
export function sliceOriginal(original: string, fragment: string): string {
  const idx = original.toLowerCase().indexOf(fragment);
  if (idx < 0) return fragment.trim();
  return original.slice(idx, idx + fragment.length).trim();
}

const BOUNDARY = "(?:tomorrow|tonight|today|at|by|in|leave|arrive|before|after|on)";

export function extractClockTime(
  lower: string,
  tzMin: number,
  nowMs: number = Date.now(),
): { iso: string; preferArrive: boolean } | null {
  const tomorrow = /\btomorrow\b/.test(lower);
  const tonight = /\btonight\b/.test(lower);
  const re =
    /\b(at|by|before|leave at|leave by|depart at|depart by|arrive by|arrive at)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/g;
  for (const m of lower.matchAll(re)) {
    const verb = m[1];
    let hh = parseInt(m[2], 10);
    const mm = m[3] ? parseInt(m[3], 10) : 0;
    const ampm = m[4];
    const hasColon = !!m[3];
    if (hh > 23 || mm > 59) continue;
    if (!ampm && !hasColon && !verb && hh < 13 && !tonight) continue;
    if (ampm === "pm" && hh < 12) hh += 12;
    if (ampm === "am" && hh === 12) hh = 0;
    if (tonight && hh < 17) hh += 12;
    const local = new Date(nowMs + tzMin * 60_000);
    const y = local.getUTCFullYear();
    const mo = local.getUTCMonth();
    let d = local.getUTCDate();
    if (tomorrow) d += 1;
    const ms = Date.UTC(y, mo, d, hh, mm) - tzMin * 60_000;
    if (!tomorrow && ms < nowMs - 60_000) continue; // skip past times today
    return {
      iso: new Date(ms).toISOString(),
      preferArrive: /\b(by|before|arrive)\b/.test(lower),
    };
  }
  return null;
}

/**
 * Regex intent pass. `tzMin` is minutes east of UTC (i.e.
 * `-new Date().getTimezoneOffset()`).
 */
export function extractHeuristicIntent(
  text: string,
  tzMin: number,
  nowMs: number = Date.now(),
): LocalIntent {
  const t = text.trim();
  const lower = t.toLowerCase();
  let from: string | null = null;
  let to: string | null = null;

  const fromTo = lower.match(
    new RegExp(`\\bfrom\\s+(.+?)\\s+to\\s+(.+?)(?:\\s+${BOUNDARY}\\b|$)`),
  );
  if (fromTo) {
    from = sliceOriginal(t, fromTo[1]);
    to = sliceOriginal(t, fromTo[2]);
  } else {
    const toMatch = lower.match(new RegExp(`\\bto\\s+(.+?)(?:\\s+${BOUNDARY}\\b|$)`));
    if (toMatch) to = sliceOriginal(t, toMatch[1]);
    else {
      const inMin = lower.match(/^(.+?)\s+in\s+\d+\s*(?:min|minutes|mins)\b/);
      if (inMin) to = sliceOriginal(t, inMin[1]);
    }
  }

  const time = extractClockTime(lower, tzMin, nowMs);
  const minMatch = lower.match(/\bin\s+(\d{1,3})\s*(?:min|minutes|mins)\b/);
  let leaveByISO: string | null = null;
  let arriveByISO: string | null = null;
  if (minMatch) {
    leaveByISO = new Date(nowMs + parseInt(minMatch[1], 10) * 60_000).toISOString();
  } else if (time) {
    if (time.preferArrive) arriveByISO = time.iso;
    else leaveByISO = time.iso;
  }

  const confidence = to ? (time || minMatch ? 0.95 : 0.7) : 0;
  return { from, to, leaveByISO, arriveByISO, confidence };
}

/** Merge the AI pass over the heuristic pass. AI wins on places, regex on time. */
export function mergeIntents(
  ai: Partial<LocalIntent> | null | undefined,
  heuristic: LocalIntent,
): LocalIntent {
  return {
    from: ai?.from ?? heuristic.from,
    to: ai?.to ?? heuristic.to,
    leaveByISO: heuristic.leaveByISO ?? ai?.leaveByISO ?? null,
    arriveByISO: heuristic.arriveByISO ?? ai?.arriveByISO ?? null,
    confidence: Math.max(ai?.confidence ?? 0, heuristic.confidence),
  };
}

/** Minimum merged confidence before we bother geocoding. */
export const MIN_INTENT_CONFIDENCE = 0.3;

export function isActionableIntent(intent: LocalIntent): boolean {
  return !!intent.to && intent.confidence >= MIN_INTENT_CONFIDENCE;
}

export type WhenParts =
  | { kind: "today"; time: string }
  | { kind: "tomorrow"; time: string }
  | { kind: "dow"; time: string; dow: string }
  | { kind: "raw"; time: string };

/**
 * Break an ISO timestamp into the pieces the UI needs for a localized
 * "at 4:30 PM" / "tomorrow 7:00 AM" / "Fri 9:15 AM" phrase.
 */
export function describeWhen(iso: string, localeTag?: string, nowMs: number = Date.now()): WhenParts {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { kind: "raw", time: iso };
    const time = d.toLocaleTimeString(localeTag, { hour: "numeric", minute: "2-digit" });
    const today = new Date(nowMs);
    if (d.toDateString() === today.toDateString()) return { kind: "today", time };
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString()) return { kind: "tomorrow", time };
    return { kind: "dow", time, dow: d.toLocaleDateString(localeTag, { weekday: "short" }) };
  } catch {
    return { kind: "raw", time: iso };
  }
}
