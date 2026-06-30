// Motion-card OCR for the mobile app.
//
// The web build runs Tesseract.js on the device, but RN has no DOM canvas
// and shipping a WASM OCR worker through Metro is a non-starter. Instead
// the mobile CardScanSheet captures a still, posts it here, and we run a
// vision-capable LLM (Lovable AI Gateway → Gemini 2.5 Flash) with a strict
// JSON schema to extract just the fields printed on the requested side.
//
// Why server-side, not on-device:
//   - One model, no per-platform native modules
//   - Far higher accuracy than tesseract on glossy plastic
//   - No image leaves Lovable infra (proxied through our gateway)
//
// Inputs are capped at ~1.2 MB base64 to keep latency under a second.
// We never store the image — it lives only for the duration of the call.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

// 1.6 MB of base64 ≈ 1.2 MB raw image. Plenty for a 1280-wide JPEG @ 0.7.
const MAX_B64 = 1_600_000;

const schema = z.object({
  side: z.enum(["front", "back"]),
  // Either a data: URL or raw base64. We normalise below.
  imageBase64: z.string().min(64).max(MAX_B64),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
});

type Extracted = {
  number: string | null;
  holder: string | null;
  validUntil: string | null;
  confidence: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

const FRONT_PROMPT = `You are reading the FRONT of a Cyprus "Motion" public-transport card.
The front shows the cardholder's name (uppercase Latin, sometimes Greek) and a "valid until" date in DD/MM/YY or DD/MM/YYYY form.
There is NO long number on the front — never invent one.
Return strict JSON: { "number": null, "holder": "FIRST LAST" | null, "validUntil": "DD/MM/YYYY" | null, "confidence": 0..1 }.
Confidence is 0.9+ only if you can clearly read at least one field.
Normalise the date to DD/MM/YYYY (expand "27" to "2027" for years 00-49, "1999" otherwise).`;

const BACK_PROMPT = `You are reading the BACK of a Cyprus "Motion" public-transport card.
The back shows a long card number, 14 to 16 digits, often printed as "12 3456 7890" or in one block.
There is NO name or date on the back — never invent them.
Return strict JSON: { "number": "<14-16 digit string, no spaces>" | null, "holder": null, "validUntil": null, "confidence": 0..1 }.
Confidence is 0.9+ only if you can clearly read the full number. Reject anything shorter than 14 digits.`;

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    number: { type: ["string", "null"] },
    holder: { type: ["string", "null"] },
    validUntil: { type: ["string", "null"] },
    confidence: { type: "number" },
  },
  required: ["number", "holder", "validUntil", "confidence"],
} as const;

function normaliseDataUrl(s: string, mime: string): string {
  if (s.startsWith("data:")) return s;
  return `data:${mime};base64,${s}`;
}

function sanitise(side: "front" | "back", raw: Extracted): Extracted {
  if (side === "front") {
    // Strip anything pretending to be a number on the front.
    const date = raw.validUntil?.trim() ?? null;
    const holder = raw.holder?.trim().replace(/\s+/g, " ") ?? null;
    const validDate =
      date && /^\d{2}\/\d{2}\/\d{4}$/.test(date) ? date : null;
    const validHolder =
      holder && /^[A-Z][A-Z\s'-]{2,40}$/.test(holder) ? holder : null;
    return {
      number: null,
      holder: validHolder,
      validUntil: validDate,
      confidence: raw.confidence ?? 0,
    };
  }
  // back
  const digits = (raw.number ?? "").replace(/\D/g, "");
  const validNumber = digits.length >= 14 && digits.length <= 16 ? digits : null;
  return {
    number: validNumber,
    holder: null,
    validUntil: null,
    confidence: raw.confidence ?? 0,
  };
}

export const Route = createFileRoute("/api/public/wallet/ocr")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const parsed = schema.safeParse(raw);
        if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return json({ error: "OCR not configured" }, 503);

        const dataUrl = normaliseDataUrl(parsed.data.imageBase64, parsed.data.mimeType);
        const system =
          parsed.data.side === "front" ? FRONT_PROMPT : BACK_PROMPT;

        try {
          const res = await fetch(GATEWAY, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(12_000),
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              temperature: 0,
              messages: [
                { role: "system", content: system },
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: "Extract the requested fields. Return JSON only.",
                    },
                    { type: "image_url", image_url: { url: dataUrl } },
                  ],
                },
              ],
              response_format: {
                type: "json_schema",
                json_schema: { name: "motion_card", schema: responseSchema, strict: true },
              },
            }),
          });
          if (res.status === 429)
            return json({ error: "Scanner busy. Try again in a moment." }, 429);
          if (res.status === 402)
            return json({ error: "Scanner quota exceeded." }, 402);
          if (!res.ok)
            return json({ error: `OCR upstream ${res.status}` }, 502);

          const body = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const content = body.choices?.[0]?.message?.content;
          if (!content) return json({ error: "Empty OCR response" }, 502);

          let extracted: Extracted;
          try {
            extracted = JSON.parse(content) as Extracted;
          } catch {
            return json({ error: "OCR returned malformed JSON" }, 502);
          }

          return json(sanitise(parsed.data.side, extracted));
        } catch (e) {
          const msg = e instanceof Error ? e.message : "OCR failed";
          return json({ error: msg }, 500);
        }
      },
    },
  },
});
