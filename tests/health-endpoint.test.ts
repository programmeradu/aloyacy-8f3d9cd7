// Observability contract test for the container/uptime healthcheck.
//
// The per-branch probe behaviour lives in
// `src/routes/api/__tests__/health.test.ts`. This suite pins the *contract*
// third parties depend on — the Docker HEALTHCHECK, the load balancer and the
// Prometheus scrape — so a refactor cannot quietly change the payload shape.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "../src/routes/api/public/health";
import { getHandler } from "../src/routes/api/__tests__/handler";
import { readMetric, resetMetrics } from "../src/lib/metrics";

const handler = getHandler(Route, "GET");
const OLD_ENV = { ...process.env };

const call = () => handler({ request: new Request("https://app.aloya.cy/api/public/health") });

beforeEach(() => {
  resetMetrics();
  process.env["CUSTOM_SUPABASE_URL"] = "https://db.example.com";
  process.env["CUSTOM_SUPABASE_ANON_KEY"] = "anon-key";
  delete process.env["GTFS_RELAY_URL"];
});

afterEach(() => {
  process.env = { ...OLD_ENV };
  vi.unstubAllGlobals();
});

describe("health endpoint contract", () => {
  it("returns 200 with a per-dependency payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );

    const res = await call();
    const body = (await res.json()) as {
      status: string;
      time: string;
      uptimeCheckMs: number;
      checks: { name: string; ok: boolean; ms: number }[];
    };

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
    expect(typeof body.uptimeCheckMs).toBe("number");
    expect(body.checks.map((c) => c.name).sort()).toEqual(["database", "gtfs-relay"]);
    for (const check of body.checks) {
      expect(typeof check.ok).toBe("boolean");
      expect(typeof check.ms).toBe("number");
    }
  });

  it("reports 503 down when a hard dependency is missing configuration", async () => {
    delete process.env["CUSTOM_SUPABASE_URL"];
    delete process.env["SUPABASE_URL"];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );

    const res = await call();
    expect(res.status).toBe(503);
    expect(((await res.json()) as { status: string }).status).toBe("down");
  });

  it("mirrors dependency state into the metrics registry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );

    await call();

    expect(readMetric("aloya_dependency_up", { dependency: "database" })).toBe(1);
    expect(
      readMetric("aloya_dependency_probe_duration_seconds", { dependency: "database" }),
    ).toBeGreaterThanOrEqual(0);
  });
});
