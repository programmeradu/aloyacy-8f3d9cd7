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
  "arn:aws:bedrock:us-west-2:362234323850:inference-profile/global.anthropic.claude-haiku-4-5-20251001-v1:0",
  "anthropic.claude-3-5-sonnet-20241022-v2:0",
  "anthropic.claude-3-5-haiku-20241022-v1:0",
  "amazon.nova-pro-v1:0",
  "amazon.nova-lite-v1:0",
];

type AuthMode = "api-key" | "sigv4";

function BedrockTestPage() {
  const [authMode, setAuthMode] = useState<AuthMode>("sigv4");
  const [apiKey, setApiKey] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [region, setRegion] = useState("us-west-2");
  const [modelId, setModelId] = useState(MODEL_PRESETS[0]);
  const [prompt, setPrompt] = useState("Say hello from Bedrock in one sentence.");
  const [maxTokens, setMaxTokens] = useState(1024);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | {
    ok: boolean;
    status: number;
    elapsedMs: number;
    endpoint: string;
    authMode?: string;
    response: unknown;
    error?: string;
  }>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const payload =
        authMode === "sigv4"
          ? { authMode, accessKeyId, secretAccessKey, sessionToken: sessionToken || undefined, region, modelId, prompt, maxTokens }
          : { authMode, apiKey, region, modelId, prompt, maxTokens };
      const res = await fetch("/api/public/bedrock-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  const canRun =
    !loading &&
    !!prompt &&
    (authMode === "api-key" ? !!apiKey : !!accessKeyId && !!secretAccessKey);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Internal · not indexed
        </div>
        <h1 className="text-3xl font-bold">AWS Bedrock Test</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Credentials are sent to our server proxy per-request and never stored. SigV4 signing
          runs on the server (Web Crypto). Do not paste production long-lived root keys.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border bg-card p-6">
        <div className="flex gap-2">
          {(["sigv4", "api-key"] as AuthMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setAuthMode(m)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                authMode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              {m === "sigv4" ? "Access key (SigV4)" : "API key (Bearer)"}
            </button>
          ))}
        </div>

        {authMode === "api-key" ? (
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Bedrock API key</span>
            <textarea
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              rows={3}
              spellCheck={false}
              className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs"
              placeholder="ABSK..."
            />
          </label>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">AWS Access Key ID</span>
              <input
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                spellCheck={false}
                className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs"
                placeholder="AKIA... or ASIA..."
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">AWS Secret Access Key</span>
              <input
                type="password"
                value={secretAccessKey}
                onChange={(e) => setSecretAccessKey(e.target.value)}
                spellCheck={false}
                className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">
                Session token <span className="font-normal text-muted-foreground">(only for ASIA temporary creds)</span>
              </span>
              <textarea
                value={sessionToken}
                onChange={(e) => setSessionToken(e.target.value)}
                rows={2}
                spellCheck={false}
                className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs"
              />
            </label>
          </div>
        )}

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
                {m.split(".")[1]?.split("-").slice(0, 3).join("-") ?? m.slice(0, 24)}
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
          disabled={!canRun}
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
            {result.authMode && (
              <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                {result.authMode}
              </span>
            )}
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
