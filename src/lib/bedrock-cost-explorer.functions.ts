import { createServerFn } from "@tanstack/react-start";

export type BedrockCePoint = {
  start: string;
  end: string;
  total: number;
  byModel: Array<{ key: string; amount: number }>;
};

export type BedrockCeStats = {
  granularity: "HOURLY" | "DAILY" | "MONTHLY";
  currency: string;
  fetchedAt: string;
  totals: {
    windowSpend: number;
    mtdSpend: number;
    yesterdaySpend: number;
    todaySpend: number;
  };
  perBucket: BedrockCePoint[];
  perModel: Array<{ key: string; amount: number }>;
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Real, billed Bedrock spend from AWS Cost Explorer.
 * Delayed ~8-24h from AWS, but authoritative (matches your invoice).
 *
 * IAM permission required on the passed key: ce:GetCostAndUsage.
 * Cost Explorer must be enabled once for the account (free, one-click in Billing).
 * Each call to CE costs ~$0.01 — this fn is designed to be called at most hourly.
 */
export const getBedrockCostExplorer = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken?: string;
      // Days back from today (inclusive). Cost Explorer HOURLY only allows last 14 days.
      days?: number;
      granularity?: "HOURLY" | "DAILY";
    }) => input,
  )
  .handler(async ({ data }) => {
    const { ceGetCostAndUsage } = await import("@/lib/aws-cost-explorer.server");
    const now = new Date();
    const days = Math.max(1, Math.min(data.days ?? 14, 90));
    const granularity: "HOURLY" | "DAILY" =
      data.granularity ?? (days <= 3 ? "HOURLY" : "DAILY");

    // HOURLY needs ISO timestamps; DAILY needs YYYY-MM-DD.
    // CE end is EXCLUSIVE.
    const endDate = new Date(now.getTime() + 24 * 3600_000); // tomorrow (exclusive)
    const startDate = new Date(now.getTime() - (days - 1) * 24 * 3600_000);
    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(0, 0, 0, 0);

    const timePeriod = granularity === "HOURLY"
      ? {
          start: new Date(now.getTime() - days * 24 * 3600_000).toISOString().replace(/\.\d+Z$/, "Z"),
          end: now.toISOString().replace(/\.\d+Z$/, "Z"),
        }
      : { start: isoDay(startDate), end: isoDay(endDate) };

    // Bedrock's service key in CE is "Amazon Bedrock".
    const filter = {
      Dimensions: { Key: "SERVICE", Values: ["Amazon Bedrock"] },
    };

    const creds = {
      accessKeyId: data.accessKeyId,
      secretAccessKey: data.secretAccessKey,
      sessionToken: data.sessionToken,
    };

    // Main time-bucket query, grouped by usage type so we can split rough per-model.
    // CE doesn't expose Bedrock model as a first-class dimension; USAGE_TYPE contains
    // model identifiers (e.g. USW2-InputTokenCount-Claude35Sonnet).
    const perBucketRaw = await ceGetCostAndUsage(creds, {
      start: timePeriod.start,
      end: timePeriod.end,
      granularity,
      metric: "UnblendedCost",
      filter,
      groupBy: [{ Type: "DIMENSION", Key: "USAGE_TYPE" }],
    });

    // Two lightweight lookups: MTD and yesterday. Keeps hero KPIs meaningful even
    // when the user picks a short/hourly window.
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const yesterday = new Date(now.getTime() - 24 * 3600_000);
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const mtdReq = ceGetCostAndUsage(creds, {
      start: isoDay(startOfMonth),
      end: isoDay(endDate),
      granularity: "MONTHLY",
      metric: "UnblendedCost",
      filter,
    });
    const dayReq = ceGetCostAndUsage(creds, {
      start: isoDay(yesterday),
      end: isoDay(new Date(startOfToday.getTime() + 24 * 3600_000)),
      granularity: "DAILY",
      metric: "UnblendedCost",
      filter,
    });

    const [mtdResults, dayResults] = await Promise.all([mtdReq, dayReq]);

    const mtdSpend = mtdResults.reduce((a, r) => a + r.total, 0);
    const yesterdaySpend =
      dayResults.find((r) => r.start === isoDay(yesterday))?.total ?? 0;
    const todaySpend =
      dayResults.find((r) => r.start === isoDay(startOfToday))?.total ?? 0;

    // Aggregate USAGE_TYPE across buckets → per-model summary
    const modelMap = new Map<string, number>();
    const perBucket: BedrockCePoint[] = perBucketRaw.map((r) => {
      const byModel = r.groups.map((g) => ({ key: prettyUsageType(g.keys[0] ?? ""), amount: g.amount }));
      for (const g of byModel) modelMap.set(g.key, (modelMap.get(g.key) ?? 0) + g.amount);
      return { start: r.start, end: r.end, total: r.total, byModel };
    });

    const perModel = Array.from(modelMap.entries())
      .map(([key, amount]) => ({ key, amount }))
      .sort((a, b) => b.amount - a.amount);
    const windowSpend = perBucket.reduce((a, r) => a + r.total, 0);

    return {
      granularity,
      currency: "USD",
      fetchedAt: new Date().toISOString(),
      totals: { windowSpend, mtdSpend, yesterdaySpend, todaySpend },
      perBucket,
      perModel,
    } satisfies BedrockCeStats;
  });

// USW2-InputTokenCount-Claude35Sonnet → "Claude35Sonnet · Input"
function prettyUsageType(raw: string): string {
  if (!raw) return "unknown";
  const parts = raw.split("-");
  // Drop region prefix like USW2 / USE1
  if (parts.length > 1 && /^[A-Z]{2,4}\d?$/.test(parts[0])) parts.shift();
  const kind = parts.find((p) => /Token|Invocation|Request|Storage/i.test(p));
  const model = parts.filter((p) => p !== kind).join("-");
  if (!kind) return raw;
  const kindLabel = /Input/i.test(kind) ? "Input" : /Output/i.test(kind) ? "Output" : kind;
  return model ? `${model} · ${kindLabel}` : kind;
}
