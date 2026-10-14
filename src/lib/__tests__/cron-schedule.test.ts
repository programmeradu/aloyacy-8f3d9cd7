import { describe, expect, it, afterEach } from "vitest";
import { CRON_TRIGGERS, jobsFor, runScheduled } from "@/lib/cron-schedule";
import { isCronAuthorized } from "@/lib/cron-auth.server";
import { setWorkerEnv } from "@/lib/worker-env";

const at = (iso: string) => new Date(iso).getTime();

describe("jobsFor", () => {
  it("odd minutes fire only snapshot + trip-alerts", () => {
    expect(jobsFor("* * * * *", at("2026-10-15T10:01:00Z")).map((j) => j.label)).toEqual([
      "snapshot",
      "trip-alerts",
    ]);
  });
  it("even minutes add the ticks", () => {
    expect(jobsFor("* * * * *", at("2026-10-15T10:02:00Z")).map((j) => j.label)).toEqual([
      "snapshot",
      "trip-alerts",
      "departure-tick",
      "arrival-watch-tick",
      "resolve-arrivals",
    ]);
  });
  it("covers every trigger and nothing else", () => {
    for (const t of CRON_TRIGGERS) expect(jobsFor(t, 0).length).toBeGreaterThan(0);
    expect(jobsFor("17 9 * * *", 0)).toEqual([]);
    expect(jobsFor("*/15 * * * *", 0).map((j) => j.label)).toEqual(["train-fast", "archive-lake"]);
    expect(jobsFor("17 * * * *", 0).map((j) => j.label)).toEqual(["pulse-news", "email-queue"]);
    expect(jobsFor("*/30 * * * *", 0).every((j) => j.label.startsWith("pulse-"))).toBe(true);
    expect(jobsFor("0 3 * * *", 0).map((j) => j.label)).toContain("ingest-schedule");
  });
});

describe("runScheduled", () => {
  it("POSTs every job in-process with the bearer and settles failures", async () => {
    const seen: Request[] = [];
    const waited: Promise<unknown>[] = [];
    const out = await runScheduled(
      async (req) => {
        seen.push(req);
        return new Response("x", { status: req.url.includes("trip-alerts") ? 500 : 200 });
      },
      { cron: "* * * * *", scheduledTime: at("2026-10-15T10:01:00Z") },
      { CRON_SECRET: "s3cret" },
      { waitUntil: (p) => waited.push(p) },
    );
    expect(waited).toHaveLength(1);
    expect(seen.map((r) => [r.method, r.url, r.headers.get("authorization")])).toEqual([
      ["POST", "https://app.aloya.cy/api/public/snapshot", "Bearer s3cret"],
      ["POST", "https://app.aloya.cy/api/public/trip-alerts", "Bearer s3cret"],
    ]);
    expect(out.map((o) => o.ok)).toEqual([true, false]);
  });
  it("fires nothing without CRON_SECRET", async () => {
    let calls = 0;
    const out = await runScheduled(async () => (calls++, new Response()), { cron: "* * * * *", scheduledTime: 0 }, {}, undefined);
    expect(calls).toBe(0);
    expect(out).toEqual([]);
  });
});

describe("isCronAuthorized", () => {
  const prev = process.env.CRON_SECRET;
  afterEach(() => {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
    setWorkerEnv({ CRON_SECRET: "" });
  });
  const req = (h: Record<string, string>) => new Request("https://app.aloya.cy/api/public/hooks/x", { headers: h });
  it("fails closed when the secret is unset", () => {
    delete process.env.CRON_SECRET;
    setWorkerEnv({ CRON_SECRET: "" });
    expect(isCronAuthorized(req({ authorization: "Bearer " }))).toBe(false);
    expect(isCronAuthorized(req({ authorization: "Bearer undefined" }))).toBe(false);
    expect(isCronAuthorized(req({}))).toBe(false);
  });
  it("accepts only the matching bearer, never the anon apikey", () => {
    setWorkerEnv({ CRON_SECRET: "abc123" });
    expect(isCronAuthorized(req({ authorization: "Bearer abc123" }))).toBe(true);
    expect(isCronAuthorized(req({ authorization: "Bearer abc124" }))).toBe(false);
    expect(isCronAuthorized(req({ apikey: "abc123" }))).toBe(false);
  });
});
