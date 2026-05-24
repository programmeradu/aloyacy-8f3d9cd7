// CORS-open proxy to ElevenLabs text-to-speech for the mobile app —
// used by the Pulse "Greek word of the day" speaker. Returns raw MP3.
// ElevenLabs Multilingual v2 gives natural Greek pronunciation.
// Falls back to Lovable AI Gateway (gpt-4o-mini-tts) if ElevenLabs
// is not configured or returns an error.

import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "public, max-age=86400",
};

// Martha — natural, expressive voice tuned for multilingual content.
const DEFAULT_VOICE_ID = "JrrE7QTGDmQKQuUnqk7H";

async function synthLovable(input: string, instructions: string, apiKey: string) {
  return fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini-tts",
      input,
      voice: "alloy",
      response_format: "mp3",
      instructions,
    }),
  });
}

async function synthElevenLabs(input: string, apiKey: string, voiceId: string) {
  return fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: input,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true,
          speed: 0.92,
        },
      }),
    },
  );
}

export const Route = createFileRoute("/api/public/tts")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const elevenKey = process.env.ELEVENLABS_API_KEY;
        const lovableKey = process.env.LOVABLE_API_KEY;
        if (!elevenKey && !lovableKey) {
          return new Response(
            JSON.stringify({ error: "TTS not configured" }),
            {
              status: 500,
              headers: { ...CORS, "Content-Type": "application/json" },
            },
          );
        }
        let body: { input?: string; voice?: string; instructions?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON" }),
            {
              status: 400,
              headers: { ...CORS, "Content-Type": "application/json" },
            },
          );
        }
        const input = (body.input ?? "").toString().slice(0, 400).trim();
        if (!input) {
          return new Response(
            JSON.stringify({ error: "Missing 'input'" }),
            {
              status: 400,
              headers: { ...CORS, "Content-Type": "application/json" },
            },
          );
        }
        const instructions =
          body.instructions ??
          "Clear, gentle, natural pronunciation. Slightly slower pace for language learners.";
        const voiceId = body.voice || DEFAULT_VOICE_ID;

        // Primary: ElevenLabs (best Greek pronunciation).
        if (elevenKey) {
          const resp = await synthElevenLabs(input, elevenKey, voiceId);
          if (resp.ok) {
            const audio = await resp.arrayBuffer();
            return new Response(audio, {
              status: 200,
              headers: { ...CORS, "Content-Type": "audio/mpeg" },
            });
          }
          // 401/402/429 → try Lovable AI as fallback if available.
          if (!lovableKey) {
            const text = await resp.text();
            return new Response(text, {
              status: resp.status,
              headers: {
                ...CORS,
                "Content-Type":
                  resp.headers.get("content-type") ?? "application/json",
              },
            });
          }
        }

        // Fallback: Lovable AI Gateway.
        const resp = await synthLovable(input, instructions, lovableKey!);
        if (!resp.ok) {
          const text = await resp.text();
          return new Response(text, {
            status: resp.status,
            headers: {
              ...CORS,
              "Content-Type":
                resp.headers.get("content-type") ?? "application/json",
            },
          });
        }
        const audio = await resp.arrayBuffer();
        return new Response(audio, {
          status: 200,
          headers: { ...CORS, "Content-Type": "audio/mpeg" },
        });
      },
    },
  },
});
