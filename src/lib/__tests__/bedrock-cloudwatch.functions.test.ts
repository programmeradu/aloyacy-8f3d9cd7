import { describe, expect, it, vi, beforeEach } from "vitest";
import { callServerFn } from "./server-fn";

const cwGetMetricDataMock = vi.fn();
vi.mock("@/lib/aws-cloudwatch.server", () => ({
  cwGetMetricData: (...args: unknown[]) => cwGetMetricDataMock(...args),
}));

const { getBedrockCloudwatchStats } = await import("../bedrock-cloudwatch.functions");

const baseCreds = { accessKeyId: "AKIA", secretAccessKey: "secret" };

describe("getBedrockCloudwatchStats", () => {
  beforeEach(() => {
    cwGetMetricDataMock.mockReset();
  });

  it("passes credentials/region/period through and aggregates per-model series", async () => {
    cwGetMetricDataMock.mockResolvedValue([
      {
        id: "inv",
        label: "anthropic.claude-3-haiku-20240307-v1:0",
        timestamps: ["2024-01-01T00:00:00Z", "2024-01-01T00:01:00Z"],
        values: [5, 3],
      },
      {
        id: "in",
        label: "anthropic.claude-3-haiku-20240307-v1:0",
        timestamps: ["2024-01-01T00:00:00Z", "2024-01-01T00:01:00Z"],
        values: [1000, 500],
      },
      {
        id: "out",
        label: "anthropic.claude-3-haiku-20240307-v1:0",
        timestamps: ["2024-01-01T00:00:00Z", "2024-01-01T00:01:00Z"],
        values: [200, 100],
      },
    ]);

    const out = await callServerFn(getBedrockCloudwatchStats, {
      ...baseCreds,
      region: "us-west-2",
      hours: 1,
    });

    expect(cwGetMetricDataMock).toHaveBeenCalledTimes(1);
    const [credsArg, rangeArg] = cwGetMetricDataMock.mock.calls[0];
    expect(credsArg).toMatchObject({
      accessKeyId: "AKIA",
      secretAccessKey: "secret",
      region: "us-west-2",
    });
    expect(rangeArg.queries).toHaveLength(3);

    expect(out.region).toBe("us-west-2");
    expect(out.periodSeconds).toBe(60); // hours<=3 -> 60s buckets
    expect(out.totals.invocations).toBe(8);
    expect(out.totals.inputTokens).toBe(1500);
    expect(out.totals.outputTokens).toBe(300);
    expect(out.perModel).toHaveLength(1);
    expect(out.perModel[0]?.modelId).toBe("anthropic.claude-3-haiku-20240307-v1:0");
    expect(out.perModel[0]?.estCostUsd).toBeGreaterThan(0);
    expect(out.perMinute).toHaveLength(2);
    expect(out.latestDatapointAt).toBe("2024-01-01T00:01:00Z");
  });

  it("defaults region and clamps out-of-range hours", async () => {
    cwGetMetricDataMock.mockResolvedValue([]);
    const out = await callServerFn(getBedrockCloudwatchStats, { ...baseCreds, hours: 10000 });
    expect(out.region).toBe("sa-east-1");
    expect(out.windowHours).toBe(336);
    expect(out.periodSeconds).toBe(21600);
    expect(out.totals.invocations).toBe(0);
    expect(out.perModel).toEqual([]);
  });

  it("falls back to regex parsing of ModelId when label lacks a clean id", async () => {
    cwGetMetricDataMock.mockResolvedValue([
      {
        id: "inv",
        label: "some series ModelId=amazon.nova-lite-v1:0 extra",
        timestamps: ["2024-01-01T00:00:00Z"],
        values: [2],
      },
    ]);
    const out = await callServerFn(getBedrockCloudwatchStats, baseCreds);
    expect(out.perModel[0]?.modelId).toBe("amazon.nova-lite-v1:0");
  });

  it("labels unmatched series as unknown", async () => {
    cwGetMetricDataMock.mockResolvedValue([
      { id: "inv", label: "Invocations", timestamps: ["2024-01-01T00:00:00Z"], values: [1] },
    ]);
    const out = await callServerFn(getBedrockCloudwatchStats, baseCreds);
    expect(out.perModel[0]?.modelId).toBe("unknown");
  });

  it("selects longer bucket periods for wider windows", async () => {
    cwGetMetricDataMock.mockResolvedValue([]);
    const short = await callServerFn(getBedrockCloudwatchStats, { ...baseCreds, hours: 0.1 });
    expect(short.periodSeconds).toBe(60);
    const mid = await callServerFn(getBedrockCloudwatchStats, { ...baseCreds, hours: 6 });
    expect(mid.periodSeconds).toBe(300);
    const long = await callServerFn(getBedrockCloudwatchStats, { ...baseCreds, hours: 24 });
    expect(long.periodSeconds).toBe(900);
    const week = await callServerFn(getBedrockCloudwatchStats, { ...baseCreds, hours: 100 });
    expect(week.periodSeconds).toBe(3600);
  });
});
