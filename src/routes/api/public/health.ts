import { createFileRoute } from "@tanstack/react-router";

// GET /api/public/health
//
// Liveness + dependency readiness for uptime monitors and container
// orchestrators (the Docker healthcheck hits this path). Returns 200 when
// every hard dependency answers, 503 when one is down, so a load balancer
// can pull the instance out of rotation instead of serving broken pages.
//
// Intentionally cheap: one HEAD-equivalent probe per dependency, a hard
// timeout, and no database writes. Never returns secrets — only the
// dependency name, its status and how long it took.

type Probe = { name: string; ok: boolean; ms: number; detail?: string };

const TIMEOUT_MS = 3_000;

async function timed(name: string, run: (signal: AbortSignal) => Promise<void>): Promise<Probe> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    await run(controller.signal);
    return { name, ok: true, ms: Date.now() - started };
  } catch (error) {
    return {
      name,
      ok: false,
      ms: Date.now() - started,
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probeDatabase(): Promise<Probe> {
  const url = process.env["CUSTOM_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
  const key = process.env["CUSTOM_SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) {
    return { name: "database", ok: false, ms: 0, detail: "not configured" };
  }
  return timed("database", async (signal) => {
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/`, {
      headers: { apikey: key },
      signal,
    });
    // PostgREST answers the schema root with 200; anything 5xx means the
    // Data API itself is unhealthy. 401/404 still proves the service is up.
    if (res.status >= 500) throw new Error(`status ${res.status}`);
  });
}

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        const checks = [await probeDatabase()];
        const ok = checks.every((c) => c.ok);
        return Response.json(
          {
            status: ok ? "ok" : "degraded",
            uptimeCheckMs: Date.now() - started,
            time: new Date().toISOString(),
            checks,
          },
          {
            status: ok ? 200 : 503,
            headers: { "cache-control": "no-store" },
          },
        );
      },
    },
  },
});
