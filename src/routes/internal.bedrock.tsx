import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/internal/bedrock")({
  head: () => ({
    meta: [
      { title: "Bedrock Test — Internal" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: BedrockTestPage,
});

const MODEL_PRESETS = [
  "anthropic.claude-3-5-sonnet-20241022-v2:0",
  "anthropic.claude-3-5-haiku-20241022-v1:0",
  "anthropic.claude-3-haiku-20240307-v1:0",
  "amazon.nova-pro-v1:0",
  "amazon.nova-lite-v1:0",
];

function BedrockTestPage() {
  const [apiKey, setApiKey] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [modelId, setModelId] = useState(MODEL_PRESETS[0]);
  const [prompt, setPrompt] = useState("Say hello from Bedrock in one sentence.");
  const [maxTokens, setMaxTokens] = useState(256);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | {
    ok: boolean;
    status: number;
    elapsedMs: number;
    endpoint: string;
    response: unknown;
    error?: string;
  }>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/public/bedrock-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, region, modelId, prompt, maxTokens }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({
        ok: false,
        status: 0,
        elapsedMs: 0,
        endpoint: "",
        response: null,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }

  const extractedText = (() => {
    const r = result?.response as any;
    if (!r || typeof r !== "object") return null;
    if (Array.isArray(r.content) && r.content[0]?.text) return r.content[0].text as string;
    if (r.output?.message?.content?.[0]?.text) return r.output.message.content[0].text as string;
    return null;
  })();

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Internal · not indexed
        </div>
        <h1 className="text-3xl font-bold">AWS Bedrock Test</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Paste a Bedrock API key (long-term or short-term bearer token). Key is sent to our
          server proxy per-request and never stored. Do not use this page with credentials
          that shouldn't be handled by browser JS.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border bg-card p-6">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Bedrock API key</span>
          <textarea
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            rows={3}
            spellCheck={false}
            className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs"
            placeholder="bedrock-api-key-... or ABSK..."
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Region</span>
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Max tokens</span>
            <input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value) || 256)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Model ID</span>
          <input
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {MODEL_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModelId(m)}
                className="rounded-full border px-3 py-1 text-xs hover:bg-muted"
              >
                {m.split(".")[1]?.split("-").slice(0, 3).join("-") ?? m}
              </button>
            ))}
          </div>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Prompt</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          />
        </label>

        <button
          type="button"
          onClick={run}
          disabled={loading || !apiKey || !prompt}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Invoking…" : "Invoke model"}
        </button>
      </div>

      {result && (
        <div className="mt-6 space-y-3 rounded-2xl border bg-card p-6">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                result.ok ? "bg-emerald-500/15 text-emerald-700" : "bg-red-500/15 text-red-700"
              }`}
            >
              {result.ok ? "OK" : "FAIL"} · {result.status}
            </span>
            <span className="text-muted-foreground">{result.elapsedMs} ms</span>
            {result.endpoint && (
              <span className="truncate font-mono text-xs text-muted-foreground">
                {result.endpoint}
              </span>
            )}
          </div>

          {extractedText && (
            <div className="rounded-lg border bg-background p-4">
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Model output
              </div>
              <p className="whitespace-pre-wrap text-sm">{extractedText}</p>
            </div>
          )}

          <details className="text-xs">
            <summary className="cursor-pointer font-semibold">Raw response</summary>
            <pre className="mt-2 max-h-[400px] overflow-auto rounded-lg bg-muted p-3 font-mono">
{JSON.stringify(result.response ?? result.error, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
