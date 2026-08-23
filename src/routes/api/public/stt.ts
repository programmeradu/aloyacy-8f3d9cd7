// CORS-open proxy to Lovable AI speech-to-text for the mobile app's
// "Ask Aloya" voice input. The app records a WAV, POSTs it here as
// multipart, and we forward to the Gateway with the workspace key.

import { createFileRoute } from "@tanstack/react-router";
import { SttUploadSchema } from "@/lib/schemas/public-api";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store",
};

export const Route = createFileRoute("/api/public/stt")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "AI not configured" }), {
            status: 500,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return new Response(JSON.stringify({ error: "Expected multipart/form-data" }), {
            status: 400,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }
        const file = form.get("file");
        if (!(file instanceof Blob)) {
          return new Response(JSON.stringify({ error: "Missing 'file'" }), {
            status: 400,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }
        // The upload's own metadata is caller-controlled, so it goes through
        // the same Zod boundary as any JSON body. An oversized recording is a
        // 413 (the caller may retry shorter); anything else is a plain 400.
        const upload = SttUploadSchema.safeParse({
          size: file.size,
          name:
            typeof (file as File).name === "string" && (file as File).name
              ? (file as File).name
              : undefined,
          type: file.type || undefined,
        });
        if (!upload.success) {
          const issue = upload.error.issues[0];
          const tooLarge = issue?.code === "too_big";
          return new Response(JSON.stringify({ error: issue?.message ?? "Invalid upload" }), {
            status: tooLarge ? 413 : 400,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }
        const upstream = new FormData();
        upstream.append("model", "openai/gpt-4o-mini-transcribe");
        upstream.append("file", file, upload.data.name);

        const resp = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: upstream,
        });
        const text = await resp.text();
        return new Response(text, {
          status: resp.status,
          headers: {
            ...CORS,
            "Content-Type": resp.headers.get("content-type") ?? "application/json",
          },
        });
      },
    },
  },
});
