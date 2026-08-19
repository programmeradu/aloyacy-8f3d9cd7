import { describe, expect, it, vi, beforeEach } from "vitest";
import { callServerFn } from "./server-fn";

const ceGetCostAndUsageMock = vi.fn();
vi.mock("@/lib/aws-cost-explorer.server", () => ({
  ceGetCostAndUsage: (...args: unknown[]) => ceGetCostAndUsageMock(...args),
}));

const { getBedrockCostExplorer } = await import("../bedrock-cost-explorer.functions");

const creds = { accessKeyId: "AKIA", secretAccessKey: "secret" };

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

describe("getBedrockCostExplorer", () => {
  beforeEach(() => {
    ceGetCostAndUsageMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
  });

  it("uses HOURLY granularity for short windows and aggregates per-model spend", async () => {
    const yesterday = isoDay(new Date(Date.now() - 24 * 3600_000));
    const today = isoDay(new Date());

    ceGetCostAndUsageMock.mockImplementation(async (_creds, req) => {
      if (req.granularity === "MONTHLY") {
        return [{ start: "2024-06-01", end: "2024-07-01", total: 5, groups: [] }];
      }
      if (req.granularity === "DAILY" && !req.groupBy) {
        return [
          { start: yesterday, end: today, total: 1.5, groups: [] },
          { start: today, end: isoDay(new Date(Date.now() + 24 * 3600_000)), total: 0.5, groups: [] },
        ];
      }
      // main HOURLY bucket query
      return [
        {
          start: "2024-06-15T10:00:00Z",
          end: "2024-06-15T11:00:00Z",
          total: 2,
          groups: [
            { keys: ["USW2-InputTokenCount-Claude35Sonnet"], amount: 1.2 },
            { keys: ["USW2-OutputTokenCount-Claude35Sonnet"], amount: 0.8 },
          ],
        },
      ];
    });

    const out = await callServerFn(getBedrockCostExplorer, { ...creds, days: 2 });

    expect(out.granularity).toBe("HOURLY");
    expect(out.totals.windowSpend).toBe(2);
    expect(out.totals.mtdSpend).toBe(5);
    expect(out.totals.yesterdaySpend).toBe(1.5);
    expect(out.totals.todaySpend).toBe(0.5);
    expect(out.perModel).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "Claude35Sonnet · Input", amount: 1.2 }),
        expect.objectContaining({ key: "Claude35Sonnet · Output", amount: 0.8 }),
      ]),
    );
    // Bedrock service filter should always be applied
    const [, mainReq] = ceGetCostAndUsageMock.mock.calls.find(
      ([, r]) => r.groupBy !== undefined,
    )!;
    expect(mainReq.filter).toEqual({ Dimensions: { Key: "SERVICE", Values: ["Amazon Bedrock"] } });
  });

  it("uses DAILY granularity for longer windows and clamps days to [1,90]", async () => {
    ceGetCostAndUsageMock.mockResolvedValue([]);
    const out = await callServerFn(getBedrockCostExplorer, { ...creds, days: 5000 });
    expect(out.granularity).toBe("DAILY");
    expect(out.totals.windowSpend).toBe(0);
    expect(out.perModel).toEqual([]);
    const dailyCall = ceGetCostAndUsageMock.mock.calls.find(([, r]) => r.groupBy !== undefined)!;
    expect(dailyCall[1].granularity).toBe("DAILY");
  });

  it("respects an explicit granularity override", async () => {
    ceGetCostAndUsageMock.mockResolvedValue([]);
    const out = await callServerFn(getBedrockCostExplorer, {
      ...creds,
      days: 30,
      granularity: "HOURLY",
    });
    expect(out.granularity).toBe("HOURLY");
  });

  it("falls back to 0 spend when yesterday/today buckets are missing", async () => {
    ceGetCostAndUsageMock.mockResolvedValue([]);
    const out = await callServerFn(getBedrockCostExplorer, { ...creds, days: 1 });
    expect(out.totals.yesterdaySpend).toBe(0);
    expect(out.totals.todaySpend).toBe(0);
  });

  it("prettifies usage types without a recognizable kind by returning the raw string", async () => {
    ceGetCostAndUsageMock.mockImplementation(async (_c, req) => {
      if (req.groupBy) {
        return [
          {
            start: "2024-06-15",
            end: "2024-06-16",
            total: 3,
            groups: [{ keys: ["SomeUnrecognizedUsageType"], amount: 3 }],
          },
        ];
      }
      return [];
    });
    const out = await callServerFn(getBedrockCostExplorer, { ...creds, days: 1, granularity: "HOURLY" });
    expect(out.perModel[0]?.key).toBe("SomeUnrecognizedUsageType");
  });
});
