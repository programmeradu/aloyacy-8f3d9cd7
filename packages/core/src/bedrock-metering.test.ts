import { describe, expect, it } from "vitest";
import {
  axisTicks,
  barHeightPct,
  capPercent,
  capTone,
  compact,
  describeCreds,
  effectiveGranularity,
  formatAxisTs,
  formatPeriod,
  formatWindow,
  money,
  money2,
  parseCombinedCreds,
  seriesMax,
  shortModelName,
  spendShare,
  successRateLabel,
} from "./bedrock-metering";

describe("money formatting", () => {
  it("renders 4 decimals for micro-costs", () => {
    expect(money(0.00123)).toBe("$0.0012");
    expect(money(12)).toBe("$12.0000");
  });
  it("renders 2 decimals for billed spend", () => {
    expect(money2(3.456)).toBe("$3.46");
  });
  it("coerces non-finite values to zero", () => {
    expect(money(Number.NaN)).toBe("$0.0000");
    expect(money2(Number.POSITIVE_INFINITY)).toBe("$0.00");
    expect(compact(Number.NaN)).toBe("0");
  });
  it("groups call counts", () => {
    expect(compact(1234567)).toBe("1,234,567");
  });
});

describe("window + period labels", () => {
  it("uses minutes below an hour", () => {
    expect(formatWindow(5 / 60)).toBe("5 min");
    expect(formatWindow(0.5)).toBe("30 min");
  });
  it("uses hours then days", () => {
    expect(formatWindow(6)).toBe("6h");
    expect(formatWindow(72)).toBe("3d");
  });
  it("guards invalid windows", () => {
    expect(formatWindow(0)).toBe("0 min");
    expect(formatWindow(Number.NaN)).toBe("0 min");
  });
  it("formats CloudWatch periods", () => {
    expect(formatPeriod(30)).toBe("30s");
    expect(formatPeriod(300)).toBe("5m");
    expect(formatPeriod(7200)).toBe("2h");
    expect(formatPeriod(-1)).toBe("0s");
  });
});

describe("formatAxisTs", () => {
  it("shows a clock time for short windows", () => {
    const out = formatAxisTs("2026-08-22T09:30:00Z", 6, "en-US");
    expect(out).toMatch(/\d{1,2}:\d{2}/);
  });
  it("shows a date for long windows", () => {
    const out = formatAxisTs("2026-08-22T09:30:00Z", 168, "en-US");
    expect(out).toMatch(/Aug/);
  });
  it("degrades on invalid input", () => {
    expect(formatAxisTs("not-a-date", 6)).toBe("—");
  });
});

describe("parseCombinedCreds", () => {
  it("parses key and secret", () => {
    expect(parseCombinedCreds("AKIAX:secret")).toEqual({
      accessKeyId: "AKIAX",
      secretAccessKey: "secret",
    });
  });
  it("parses optional region and session token", () => {
    expect(parseCombinedCreds(" AKIAX : secret : eu-west-1 : tok ")).toEqual({
      accessKeyId: "AKIAX",
      secretAccessKey: "secret",
      region: "eu-west-1",
      sessionToken: "tok",
    });
  });
  it("rejects incomplete blobs", () => {
    expect(parseCombinedCreds("")).toBeNull();
    expect(parseCombinedCreds("AKIAX")).toBeNull();
    expect(parseCombinedCreds("::::")).toBeNull();
  });
  it("masks the secret when describing creds", () => {
    const creds = parseCombinedCreds("AKIAEXAMPLE1234:supersecret:us-west-2")!;
    const line = describeCreds(creds, "us-west-2");
    expect(line).toContain("····1234");
    expect(line).not.toContain("supersecret");
    expect(line).toContain("11 chars");
  });
  it("notes an attached session token", () => {
    const creds = parseCombinedCreds("AKIA1234:sec:us-west-2:tok")!;
    expect(describeCreds(creds, "us-west-2")).toContain("session token attached");
  });
});

describe("cap meter", () => {
  it("computes a clamped percentage", () => {
    expect(capPercent(50, 100)).toBe(50);
    expect(capPercent(500, 100)).toBe(100);
    expect(capPercent(5, 0)).toBe(0);
    expect(capPercent(-5, 100)).toBe(0);
  });
  it("maps tone thresholds", () => {
    expect(capTone(10)).toBe("ok");
    expect(capTone(80)).toBe("warn");
    expect(capTone(100)).toBe("over");
  });
});

describe("chart math", () => {
  it("keeps a visible floor for empty bars", () => {
    expect(barHeightPct(0, 10)).toBe(2);
    expect(barHeightPct(5, 10)).toBe(50);
    expect(barHeightPct(20, 10)).toBe(100);
    expect(barHeightPct(1, 0)).toBe(2);
  });
  it("never returns a zero divisor", () => {
    expect(seriesMax([])).toBe(0.0001);
    expect(seriesMax([0, 0])).toBe(0.0001);
    expect(seriesMax([1, 9, 3])).toBe(9);
  });
  it("picks start, middle and end ticks", () => {
    expect(axisTicks([])).toEqual([]);
    expect(axisTicks(["a"])).toEqual(["a"]);
    expect(axisTicks(["a", "b", "c", "d", "e"])).toEqual(["a", "c", "e"]);
  });
});

describe("misc labels", () => {
  it("formats success rate and empty windows", () => {
    expect(successRateLabel(9, 10)).toBe("90%");
    expect(successRateLabel(0, 0)).toBe("—");
  });
  it("downgrades granularity beyond the AWS 14-day hourly limit", () => {
    expect(effectiveGranularity(7, "HOURLY")).toBe("HOURLY");
    expect(effectiveGranularity(30, "HOURLY")).toBe("DAILY");
    expect(effectiveGranularity(3, "DAILY")).toBe("DAILY");
  });
  it("computes spend share safely", () => {
    expect(spendShare(2, 8)).toBe(25);
    expect(spendShare(2, 0)).toBe(0);
  });
  it("shortens model ids", () => {
    expect(shortModelName("eu.anthropic.claude-sonnet-4-v1:0")).toBe("claude-sonnet-4-v1:0");
    expect(shortModelName("")).toBe("—");
  });
});
