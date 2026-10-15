import { createFileRoute } from "@tanstack/react-router";
import { signRequest } from "@/lib/aws-sigv4.server";
import { estimateCost } from "@/lib/bedrock-pricing";
import { badRequest, malformedJsonBody, readJsonBody, zodDetails } from "@/lib/http/validate";
import { BedrockTestSchema } from "@/lib/schemas/public-api";
import { adminGate } from "@/lib/admin-auth.server";

// Internal test proxy for AWS Bedrock. Credentials are provided per-request
// by the caller (BYOK from the test page) and never stored server-side.
// Supports two auth modes:
//   - authMode: "api-key"  → Authorization: Bearer <ABSK...>
//   - authMode: "sigv4"    → AWS Access Key ID + Secret Access Key (+ optional session token)
export const Route = createFileRoute("/api/public/bedrock-test")({
  server: {
    handlers: {
      // Internal tool: no public CORS preflight; admins call it same-origin.
      OPTIONS: async ({ request }) =>
        (await adminGate(request)) ??
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
      POST: async ({ request }) => {
        const denied = await adminGate(request);
        if (denied) return denied;
        const cors = {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        };
        const payload = await readJsonBody(request);
        if (!payload.ok) return malformedJsonBody(cors);
        const parsed = BedrockTestSchema.safeParse(payload.value);
        if (!parsed.success) return badRequest("Invalid request", zodDetails(parsed.error), cors);
        try {
          const body = parsed.data;
          const authMode = body.authMode;
          const region = body.region;
          const modelId = body.modelId;
          const prompt = body.prompt;
          const maxTokens = body.maxTokens;

          const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;
          const payload = JSON.stringify({
            messages: [{ role: "user", content: [{ text: prompt }] }],
            inferenceConfig: { maxTokens },
          });

          let reqHeaders: Record<string, string>;
          if (authMode === "sigv4") {
            const accessKeyId = (body.accessKeyId || "").trim();
            const secretAccessKey = (body.secretAccessKey || "").trim();
            const sessionToken = (body.sessionToken || "").trim() || undefined;
            if (!accessKeyId || !secretAccessKey) {
              return new Response(
                JSON.stringify({ error: "Missing accessKeyId or secretAccessKey" }),
                { status: 400, headers: cors },
              );
            }
            const signed = await signRequest({
              accessKeyId,
              secretAccessKey,
              sessionToken,
              region,
              service: "bedrock",
              method: "POST",
              url,
              body: payload,
              headers: { "Content-Type": "application/json", Accept: "application/json" },
            });
            reqHeaders = { ...signed.headers, Accept: "application/json" };
          } else {
            const apiKey = (body.apiKey || "").trim();
            if (!apiKey)
              return new Response(JSON.stringify({ error: "Missing apiKey" }), {
                status: 400,
                headers: cors,
              });
            reqHeaders = {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            };
          }

          const started = Date.now();
          const upstream = await fetch(url, {
            method: "POST",
            headers: reqHeaders,
            body: payload,
          });
          const elapsed = Date.now() - started;
          const text = await upstream.text();
          let parsedBody: unknown = null;
          try {
            parsedBody = JSON.parse(text);
          } catch {
            /* keep raw */
          }

          // Extract token usage from Converse response and log to Supabase.
          let inputTokens = 0;
          let outputTokens = 0;
          if (parsedBody && typeof parsedBody === "object") {
            const usage = (
              parsedBody as { usage?: { inputTokens?: number; outputTokens?: number } }
            ).usage;
            inputTokens = Math.max(0, Math.floor(usage?.inputTokens ?? 0));
            outputTokens = Math.max(0, Math.floor(usage?.outputTokens ?? 0));
          }
          const estCost = estimateCost(modelId, inputTokens, outputTokens);
          const keyHint =
            authMode === "sigv4"
              ? (body.accessKeyId || "").trim().slice(-4)
              : (body.apiKey || "").trim().slice(-4);
          const errText = !upstream.ok
            ? typeof parsedBody === "object" && parsedBody && "message" in parsedBody
              ? String((parsedBody as { message?: unknown }).message ?? "")
              : text.slice(0, 500)
            : null;

          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin.from("bedrock_usage").insert({
              access_key_hint: keyHint || null,
              auth_mode: authMode,
              region,
              model_id: modelId,
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              est_cost_usd: estCost,
              latency_ms: elapsed,
              http_status: upstream.status,
              ok: upstream.ok,
              error: errText,
            });
          } catch {
            /* logging must not break the response */
          }

          return new Response(
            JSON.stringify({
              ok: upstream.ok,
              status: upstream.status,
              elapsedMs: elapsed,
              endpoint: url,
              authMode,
              usage: { inputTokens, outputTokens, estCostUsd: estCost },
              response: parsedBody ?? text,
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
