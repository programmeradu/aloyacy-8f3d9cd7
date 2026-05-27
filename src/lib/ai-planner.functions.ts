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
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "trip_intent",
              strict: true,
              schema: responseSchemaJSON,
            },
          },
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
      return parsed.data;
    } catch (err) {
      console.warn("[ai-planner] failed", err);
      return null;
    }
  });
