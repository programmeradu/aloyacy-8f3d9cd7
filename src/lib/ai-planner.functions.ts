// Natural-language trip planner. Parses a free-text request like
// "tomorrow morning to Larnaca airport from my place" into a structured
// intent the existing planner can consume.
//
// Uses Lovable AI Gateway (OpenAI-compatible) with Gemini 2.5 Flash for
// cost + speed. Returns a strict JSON shape; callers feed the result into
// the multileg planner.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const intentSchema = z.object({
  from: z.string().min(1).max(160).nullable(),
  to: z.string().min(1).max(160).nullable(),
  leaveByISO: z.string().datetime().nullable(),
  arriveByISO: z.string().datetime().nullable(),
  dayHint: z
    .enum(["now", "today", "tonight", "tomorrow", "weekend", "specific"])
    .default("now"),
  confidence: z.number().min(0).max(1),
  notes: z.string().max(280).optional(),
});

export type TripIntent = z.infer<typeof intentSchema>;

const inputSchema = z.object({
  text: z.string().min(2).max(500),
  nowISO: z.string().datetime().optional(),
  tzOffsetMin: z.number().int().min(-720).max(720).optional(),
});

const SYSTEM = `You parse Cyprus public-transport requests into structured JSON.
Rules:
- Output ONLY one JSON object matching the schema. No prose.
- "from" / "to" are short place names in Cyprus (e.g. "Larnaca airport", "Eleftheria Square", "my place", "home", "work"). Preserve the user's wording.
- If a time word is given (now, soon, tonight, tomorrow morning, Saturday 9pm, in 20 minutes), compute an ISO timestamp using the provided "now" anchor and timezone.
- Prefer arriveByISO when the user says "by", "before", "by 9am". Prefer leaveByISO when they say "leave at", "depart at", "in N min".
- Use null for any field you cannot infer. Never invent a destination.
- confidence: 0.0 if the message is not a trip request at all; ~0.5 if vague; >0.8 if both endpoints + time intent are explicit.`;

function buildUserPrompt(text: string, nowISO?: string, tzOffsetMin?: number) {
  return [
    `User message: """${text}"""`,
    `Now: ${nowISO ?? new Date().toISOString()}`,
    `Timezone offset (min from UTC): ${tzOffsetMin ?? 180}`, // Cyprus EEST default
    `Country context: Cyprus. Popular stops: Eleftheria Square (Nicosia), Larnaca Airport, Paphos Harbour, Limassol Old Port, University of Cyprus.`,
  ].join("\n");
}

const responseSchemaJSON = {
  type: "object",
  additionalProperties: false,
  properties: {
    from: { type: ["string", "null"] },
    to: { type: ["string", "null"] },
    leaveByISO: { type: ["string", "null"] },
    arriveByISO: { type: ["string", "null"] },
    dayHint: {
      type: "string",
      enum: ["now", "today", "tonight", "tomorrow", "weekend", "specific"],
    },
    confidence: { type: "number" },
    notes: { type: "string" },
  },
  required: ["from", "to", "leaveByISO", "arriveByISO", "dayHint", "confidence"],
} as const;

export const parseTripIntent = createServerFn({ method: "POST" })
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<TripIntent | null> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      console.warn("[ai-planner] LOVABLE_API_KEY missing");
      return null;
    }

    try {
      const res = await fetch(GATEWAY, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          temperature: 0.2,
          messages: [
            { role: "system", content: SYSTEM },
            {
              role: "user",
              content: buildUserPrompt(data.text, data.nowISO, data.tzOffsetMin),
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        console.warn(`[ai-planner] upstream ${res.status}`);
        return null;
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = json.choices?.[0]?.message?.content;
      if (!raw) return null;
      const parsed = intentSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        console.warn("[ai-planner] schema mismatch", parsed.error.flatten());
        return null;
      }
      // Deterministic time override: the LLM is unreliable at turning "7am"
      // into a correctly-offset ISO. If the user's text contains an explicit
      // clock time, compute it ourselves from the caller's tz anchor.
      const fix = extractExplicitTime(
        data.text,
        data.nowISO ?? new Date().toISOString(),
        data.tzOffsetMin ?? 180,
      );
      if (fix) {
        if (fix.preferArrive) {
          parsed.data.arriveByISO = fix.iso;
          parsed.data.leaveByISO = null;
        } else {
          parsed.data.leaveByISO = fix.iso;
          parsed.data.arriveByISO = null;
        }
      }
      return parsed.data;
    } catch (err) {
      console.warn("[ai-planner] failed", err);
      return null;
    }
  });

// Deterministic extractor for explicit clock times like "7am", "7:30 pm",
// "19:30", "at 8", "by 9am". Returns an ISO anchored to the caller's local
// timezone (tzMin = minutes east of UTC, e.g. Cyprus EEST = 180).
function extractExplicitTime(
  text: string,
  nowISO: string,
  tzMin: number,
): { iso: string; preferArrive: boolean } | null {
  const t = text.toLowerCase();
  // Match: optional leading verb, hour, optional :mm, optional am/pm.
  const hasNightWord = /\b(tonight|evening|morning|noon|midnight)\b/.test(t);
  // Require either am/pm OR a colon OR a 24h hour >= 13 to avoid grabbing
  // stray digits like "in 5 min" or "bus 30".
  const re =
    /\b(at|by|before|leave at|leave by|depart at|depart by|arrive by|arrive at)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b(?!\s*(?:min|mins|minute|minutes|hr|hrs|hour|hours|km|kms|m\b))/g;
  let best: { hh: number; mm: number; verb: string | undefined } | null = null;
  for (const m of t.matchAll(re)) {
    const verb = m[1];
    const hh = parseInt(m[2], 10);
    const mm = m[3] ? parseInt(m[3], 10) : 0;
    const ampm = m[4];
    const hasColon = !!m[3];
    if (hh > 23 || mm > 59) continue;
    // Filter ambiguous bare numbers unless a night/day word gives context.
    if (!ampm && !hasColon && !verb && !hasNightWord && hh < 13) continue;
    let h = hh;
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    best = { hh: h, mm, verb };
    break; // first plausible match wins
  }
  if (!best) return null;


  const now = new Date(nowISO);
  // Walk to the caller's local Y/M/D.
  const local = new Date(now.getTime() + tzMin * 60_000);
  let y = local.getUTCFullYear();
  let mo = local.getUTCMonth();
  let d = local.getUTCDate();

  if (/\btomorrow\b/.test(t)) d += 1;
  else if (/\btonight\b/.test(t)) {
    if (best.hh < 17) best.hh += 12;
  }

  const localTargetMs = Date.UTC(y, mo, d, best.hh, best.mm, 0);
  const iso = new Date(localTargetMs - tzMin * 60_000).toISOString();
  const preferArrive = /\b(by|before|arrive)\b/.test(t);
  return { iso, preferArrive };
}
