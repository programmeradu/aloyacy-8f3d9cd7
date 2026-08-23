import { describe, expect, it } from "vitest";

import {
  HALF_HOUR_JOBS,
  HOURLY_JOBS,
  JOB_GROUPS,
  MINUTE_JOBS,
  NIGHTLY_JOBS,
  QUARTER_HOUR_JOBS,
  headersFor,
  originOf,
  planFor,
} from "./jobs";

const at = (iso: string) => new Date(iso).getTime();

describe("originOf", () => {
  it("prefers APP_ORIGIN", () => {
    expect(originOf({ APP_ORIGIN: "https://staging.aloya.cy" })).toBe("https://staging.aloya.cy");
  });

  it("strips trailing slashes so paths do not double up", () => {
    expect(originOf({ APP_ORIGIN: "https://app.aloya.cy//" })).toBe("https://app.aloya.cy");
  });

  it("falls back to the origin of the legacy TARGET_URL", () => {
    expect(originOf({ TARGET_URL: "https://legacy.aloya.cy/api/public/snapshot" })).toBe(
      "https://legacy.aloya.cy",
    );
  });

  it("defaults to production", () => {
    expect(originOf({})).toBe("https://app.aloya.cy");
  });
});

describe("headersFor", () => {
  it("always sends JSON", () => {
    expect(headersFor({}).get("Content-Type")).toBe("application/json");
  });

  it("omits auth headers when nothing is configured", () => {
    const h = headersFor({});
    expect(h.get("Authorization")).toBeNull();
    expect(h.get("apikey")).toBeNull();
  });

  it("sends the cron secret both ways so either hook style accepts it", () => {
    const h = headersFor({ CRON_SECRET: "s3cret" });
    expect(h.get("Authorization")).toBe("Bearer s3cret");
    expect(h.get("x-cron-secret")).toBe("s3cret");
  });

  it("sends the anon key when present", () => {
    expect(headersFor({ CUSTOM_SUPABASE_ANON_KEY: "anon" }).get("apikey")).toBe("anon");
  });
});

describe("planFor", () => {
  it("maps each cron expression to its group", () => {
    expect(planFor("*/15 * * * *", 0).jobs).toEqual(QUARTER_HOUR_JOBS);
    expect(planFor("*/30 * * * *", 0).jobs).toEqual(HALF_HOUR_JOBS);
    expect(planFor("17 * * * *", 0).jobs).toEqual(HOURLY_JOBS);
    expect(planFor("0 3 * * *", 0).jobs).toEqual(NIGHTLY_JOBS);
  });

  it("adds departure-tick and arrival-watch only on even minutes", () => {
    const even = planFor("* * * * *", at("2026-01-01T10:04:00Z"));
    const odd = planFor("* * * * *", at("2026-01-01T10:05:00Z"));
    expect(even.jobs.map((j) => j.label)).toContain("departure-tick");
    expect(even.jobs.map((j) => j.label)).toContain("arrival-watch");
    expect(odd.jobs).toEqual(MINUTE_JOBS);
  });

  it("keeps the minute loop's total stagger well inside 60s", () => {
    const { jobs, staggerMs } = planFor("* * * * *", at("2026-01-01T10:00:00Z"));
    expect((jobs.length - 1) * staggerMs).toBeLessThan(30_000);
  });

  it("staggers heavier groups further apart", () => {
    expect(planFor("0 3 * * *", 0).staggerMs).toBeGreaterThan(planFor("* * * * *", 0).staggerMs);
  });

  it("treats an unknown expression as the minute loop", () => {
    expect(planFor("@weekly", at("2026-01-01T10:05:00Z")).jobs).toEqual(MINUTE_JOBS);
  });
});

describe("job table", () => {
  it("exposes every scheduled group as a manual trigger", () => {
    expect(Object.keys(JOB_GROUPS).sort()).toEqual([
      "half",
      "hourly",
      "minute",
      "nightly",
      "quarter",
    ]);
  });

  it("uses unique labels and absolute paths", () => {
    const jobs = Object.values(JOB_GROUPS).flat();
    for (const job of jobs) expect(job.path.startsWith("/")).toBe(true);
    const minuteLabels = JOB_GROUPS.minute!.map((j) => j.label);
    expect(new Set(minuteLabels).size).toBe(minuteLabels.length);
  });
});
