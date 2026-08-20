import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Route } from "@/routes/api/public/metrics";
import { getHandler } from "@/routes/api/__tests__/handler";
import { incrementCounter, resetMetrics } from "@/lib/metrics";

const handler = getHandler(Route, "GET");

function scrape(headers: Record<string, string> = {}) {
  return handler({
    request: new Request("https://app.aloya.cy/api/public/metrics", { headers }),
  });
}

beforeEach(() => {
  resetMetrics();
  delete process.env["METRICS_TOKEN"];
});

afterEach(() => {
  delete process.env["METRICS_TOKEN"];
});

describe("GET /api/public/metrics", () => {
  it("serves the Prometheus text exposition format", async () => {
    const res = await scrape();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; version=0.0.4; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");

    const body = await res.text();
    expect(body).toContain("# TYPE aloya_metrics_scrapes_total counter");
    expect(body).toContain('aloya_build_info{runtime="worker"} 1');
  });

  it("never returns an empty body on a cold instance", async () => {
    expect((await scrape()).text()).resolves.not.toBe("");
  });

  it("counts each scrape", async () => {
    await scrape();
    const body = await (await scrape()).text();
    expect(body).toContain("aloya_metrics_scrapes_total 2");
  });

  it("includes counters recorded elsewhere in the process", async () => {
    incrementCounter("aloya_errors_total", { scope: "gtfs" }, 2);
    expect(await (await scrape()).text()).toContain('aloya_errors_total{scope="gtfs"} 2');
  });

  it("requires a bearer token when METRICS_TOKEN is set", async () => {
    process.env["METRICS_TOKEN"] = "scrape-secret";

    const denied = await scrape();
    expect(denied.status).toBe(401);
    expect(await denied.text()).not.toContain("scrape-secret");

    expect((await scrape({ authorization: "Bearer wrong" })).status).toBe(401);
    expect((await scrape({ authorization: "Bearer scrape-secret" })).status).toBe(200);
  });

  it("never leaks the scrape token into the payload", async () => {
    process.env["METRICS_TOKEN"] = "scrape-secret";
    const body = await (await scrape({ authorization: "Bearer scrape-secret" })).text();
    expect(body).not.toContain("scrape-secret");
  });
});
