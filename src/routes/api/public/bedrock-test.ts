import { createFileRoute } from "@tanstack/react-router";

// Internal test proxy for AWS Bedrock. Key is provided per-request by the
// caller (BYOK from the test page) and never stored server-side.
export const Route = createFileRoute("/api/public/bedrock-test")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
      POST: async ({ request }) => {
        const cors = {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        };
        try {
          const body = (await request.json()) as {
            apiKey?: string;
            region?: string;
            modelId?: string;
            prompt?: string;
            maxTokens?: number;
          };
          const apiKey = (body.apiKey || "").trim();
          const region = (body.region || "us-west-2").trim();
          const modelId = (body.modelId || "").trim();
          const prompt = (body.prompt || "").trim();
          const maxTokens = Math.min(Math.max(body.maxTokens ?? 1024, 1), 32000);

          if (!apiKey) return new Response(JSON.stringify({ error: "Missing apiKey" }), { status: 400, headers: cors });
          if (!modelId) return new Response(JSON.stringify({ error: "Missing modelId" }), { status: 400, headers: cors });
          if (!prompt) return new Response(JSON.stringify({ error: "Missing prompt" }), { status: 400, headers: cors });

          // Bedrock Converse API — works with foundation model IDs and inference profile ARNs
          const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;

          const payload = {
            messages: [{ role: "user", content: [{ text: prompt }] }],
            inferenceConfig: { maxTokens },
          };

          const started = Date.now();
          const upstream = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify(payload),
          });
          const elapsed = Date.now() - started;
          const text = await upstream.text();
          let parsed: unknown = null;
          try { parsed = JSON.parse(text); } catch { /* keep raw */ }

          return new Response(
            JSON.stringify({
              ok: upstream.ok,
              status: upstream.status,
              elapsedMs: elapsed,
              endpoint: url,
              response: parsed ?? text,
            }),
            { status: 200, headers: cors },
          );
        } catch (err) {
          return new Response(
            JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
            { status: 500, headers: cors },
          );
        }
      },
    },
  },
});
