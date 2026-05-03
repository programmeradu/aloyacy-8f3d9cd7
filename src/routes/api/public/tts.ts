// CORS-open proxy to Lovable AI text-to-speech for the mobile app —
// used by the Pulse "Greek word of the day" speaker. Returns raw MP3.

import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "public, max-age=86400",
};

export const Route = createFileRoute("/api/public/tts")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return new Response(
            JSON.stringify({ error: "AI not configured" }),
            {
              status: 500,
              headers: { ...CORS, "Content-Type": "application/json" },
            },
          );
        }
        let body: {
          input?: string;
          voice?: string;
          instructions?: string;
        };
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
        const resp = await fetch(
          "https://ai.gateway.lovable.dev/v1/audio/speech",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "openai/gpt-4o-mini-tts",
              input,
              voice: body.voice ?? "alloy",
              response_format: "mp3",
              instructions:
                body.instructions ??
                "Clear, gentle, natural pronunciation. Slightly slower pace for language learners.",
            }),
          },
        );
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
          headers: {
            ...CORS,
            "Content-Type": "audio/mpeg",
          },
        });
      },
    },
  },
});
