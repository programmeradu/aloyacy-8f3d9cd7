import { createFileRoute } from "@tanstack/react-router";
import { observe, setGauge } from "@/lib/metrics";

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

// The GTFS-RT relay is a *soft* dependency: when it is down we still serve
// scheduled times, so it is reported separately and never flips the instance
// out of rotation. An unconfigured relay is "skipped", not a failure.
async function probeRelay(): Promise<Probe> {
  const url = process.env["GTFS_RELAY_URL"];
  if (!url) return { name: "gtfs-relay", ok: true, ms: 0, detail: "not configured" };
  const token = process.env["GTFS_RELAY_TOKEN"];
  return timed("gtfs-relay", async (signal) => {
    const res = await fetch(url, {
      method: "HEAD",
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
      signal,
    });
    // Any answer below 500 proves the relay process is alive; 405 simply
    // means it does not implement HEAD.
    if (res.status >= 500) throw new Error(`status ${res.status}`);
  });
}

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        // Probes run concurrently so the worst case stays one TIMEOUT_MS.
        const [database, relay] = await Promise.all([probeDatabase(), probeRelay()]);
        const checks = [database, relay];
        // Only hard dependencies decide the HTTP status.
        const ok = database.ok;

        // Feed the same probe results to /api/public/metrics so an uptime
        // monitor and a Prometheus scrape never disagree about dependencies.
        for (const check of checks) {
          setGauge(
            "aloya_dependency_up",
            check.ok ? 1 : 0,
            { dependency: check.name },
            "1 when a dependency answered its probe, 0 otherwise.",
          );
          observe(
            "aloya_dependency_probe_duration_seconds",
            check.ms / 1000,
            { dependency: check.name },
            "Time spent probing each dependency.",
          );
        }


        return Response.json(
          {
            // "ok" = everything green, "degraded" = live data missing but the
            // app still works, "down" = a hard dependency failed.
            status: !ok ? "down" : relay.ok ? "ok" : "degraded",
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
