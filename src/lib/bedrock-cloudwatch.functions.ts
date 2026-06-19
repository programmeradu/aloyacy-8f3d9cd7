import { createServerFn } from "@tanstack/react-start";
import { estimateCost } from "@/lib/bedrock-pricing";

export type BedrockCwPerModel = {
  modelId: string;
  invocations: number;
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
};

export type BedrockCwStats = {
  windowHours: number;
  periodSeconds: number;
  region: string;
  fetchedAt: string;
  latestDatapointAt: string | null;
  totals: {
    invocations: number;
    inputTokens: number;
    outputTokens: number;
    estCostUsd: number;
  };
  perModel: BedrockCwPerModel[];
  perMinute: Array<{ t: string; invocations: number; inputTokens: number; outputTokens: number; estCostUsd: number }>;
};

/**
 * Pulls near-real-time (1-2 min lag) usage for the WHOLE AWS account
 * from CloudWatch AWS/Bedrock metrics. Captures every call — no matter
 * which app, IAM user, or region initiated it — provided the calling
 * IAM principal is in the same account as the metrics-reader key here.
 *
 * The provided credentials only need `cloudwatch:GetMetricData`.
 */
export const getBedrockCloudwatchStats = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken?: string;
      region?: string;
      hours?: number;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { cwGetMetricData } = await import("@/lib/aws-cloudwatch.server");
    const region = (data.region || "us-west-2").trim();
    // Accept fractional hours (0.083 = 5min). CloudWatch's smallest period is 60s.
    const hours = Math.min(Math.max(data.hours ?? 24, 0.05), 336); // 3min → 14d
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 3600_000);
    // Period tuned so we get ~15-60 buckets per window (good bar chart density).
    const period =
      hours <= 0.5 ? 60 :
      hours <= 3 ? 60 :
      hours <= 12 ? 300 :
      hours <= 48 ? 900 :
      hours <= 168 ? 3600 :
      21600; // 6h buckets for very long windows

    // SEARCH returns one time series per model, per metric. We force the
    // Label to just the ModelId so we can attribute each series unambiguously
    // (default labels vary and can drop the "ModelId=" prefix entirely).
    const label = "${PROP('Dim.ModelId')}";
    const queries = [
      { id: "inv", expression: `SEARCH('{AWS/Bedrock,ModelId} MetricName="Invocations"', 'Sum', ${period})`, label },
      { id: "in", expression: `SEARCH('{AWS/Bedrock,ModelId} MetricName="InputTokenCount"', 'Sum', ${period})`, label },
      { id: "out", expression: `SEARCH('{AWS/Bedrock,ModelId} MetricName="OutputTokenCount"', 'Sum', ${period})`, label },
    ];

    const series = await cwGetMetricData(
      { accessKeyId: data.accessKeyId, secretAccessKey: data.secretAccessKey, sessionToken: data.sessionToken, region },
      { startTime, endTime, queries },
    );

    // With the Label override above, s.label IS the modelId. Fall back to
    // regex parsing for any series where CloudWatch couldn't resolve the
    // template (e.g. metric-math results with no dimensions).
    const modelIndex = new Map<string, BedrockCwPerModel>();
    const minuteMap = new Map<string, { invocations: number; inputTokens: number; outputTokens: number; estCostUsd: number }>();
    let latestTs: string | null = null;

    for (const s of series) {
      const raw = s.label?.trim() ?? "";
      const modelId =
        raw && !raw.includes(" ") && raw !== "Invocations" && raw !== "InputTokenCount" && raw !== "OutputTokenCount"
          ? raw
          : (/ModelId=([^\s]+)/.exec(raw)?.[1] ?? "unknown");
      const bucket = modelIndex.get(modelId) ?? {
        modelId,
        invocations: 0,
        inputTokens: 0,
        outputTokens: 0,
        estCostUsd: 0,
      };
      const kind: "inv" | "in" | "out" =
        s.id.startsWith("inv") ? "inv" : s.id.startsWith("in") ? "in" : "out";

      for (let i = 0; i < s.timestamps.length; i++) {
        const ts = s.timestamps[i];
        const v = s.values[i] || 0;
        if (!latestTs || ts > latestTs) latestTs = ts;

        if (kind === "inv") bucket.invocations += v;
        else if (kind === "in") bucket.inputTokens += v;
        else bucket.outputTokens += v;

        // Per-minute (or per-period) rollup for the sparkline
        const m = minuteMap.get(ts) ?? { invocations: 0, inputTokens: 0, outputTokens: 0, estCostUsd: 0 };
        if (kind === "inv") m.invocations += v;
        else if (kind === "in") m.inputTokens += v;
        else m.outputTokens += v;
        minuteMap.set(ts, m);
      }
      modelIndex.set(modelId, bucket);
    }

    // Cost per model
    let totalCost = 0;
    for (const b of modelIndex.values()) {
      b.estCostUsd = estimateCost(b.modelId, b.inputTokens, b.outputTokens);
      totalCost += b.estCostUsd;
    }

    // Cost per minute (approximate — uses the total tokens for that period,
    // priced against the dominant model. Good enough for a trend line.)
    const perMinute = Array.from(minuteMap.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([t, v]) => {
        // Cost approximation: allocate this bucket's tokens across models
        // proportionally to lifetime shares. Simple + stable.
        const totalIn = Array.from(modelIndex.values()).reduce((a, b) => a + b.inputTokens, 0) || 1;
        const totalOut = Array.from(modelIndex.values()).reduce((a, b) => a + b.outputTokens, 0) || 1;
        let cost = 0;
        for (const b of modelIndex.values()) {
          const shareIn = b.inputTokens / totalIn;
          const shareOut = b.outputTokens / totalOut;
          cost += estimateCost(b.modelId, v.inputTokens * shareIn, v.outputTokens * shareOut);
        }
        return { t, ...v, estCostUsd: cost };
      });

    const perModel = Array.from(modelIndex.values()).sort((a, b) => b.estCostUsd - a.estCostUsd);
    const totalInvocations = perModel.reduce((a, b) => a + b.invocations, 0);
    const totalIn = perModel.reduce((a, b) => a + b.inputTokens, 0);
    const totalOut = perModel.reduce((a, b) => a + b.outputTokens, 0);

    return {
      windowHours: hours,
      periodSeconds: period,
      region,
      fetchedAt: new Date().toISOString(),
      latestDatapointAt: latestTs,
      totals: {
        invocations: totalInvocations,
        inputTokens: totalIn,
        outputTokens: totalOut,
        estCostUsd: totalCost,
      },
      perModel,
      perMinute,
    } satisfies BedrockCwStats;
  });
