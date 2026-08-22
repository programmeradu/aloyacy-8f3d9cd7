// AWS Cost Explorer client using our SigV4 signer.
// Cost Explorer is a JSON API — same shape for GetCostAndUsage across the SDK.
// IMPORTANT: the CE endpoint is global but signs under us-east-1.

import { signRequest } from "@/lib/aws-sigv4.server";

export interface CeCreds {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface CeGroup {
  keys: string[];
  amount: number; // USD
  unit: string;
}

export interface CeResultByTime {
  start: string;
  end: string;
  total: number; // USD (unblended)
  groups: CeGroup[];
}

export type CeGranularity = "HOURLY" | "DAILY" | "MONTHLY";

export interface CeQuery {
  start: string; // YYYY-MM-DD (DAILY/MONTHLY) or ISO timestamp (HOURLY)
  end: string;
  granularity: CeGranularity;
  metric?: "UnblendedCost" | "AmortizedCost" | "BlendedCost" | "UsageQuantity";
  // Native CE filter — see AWS docs. We forward as-is so callers can compose complex filters.
  filter?: unknown;
  groupBy?: Array<{ Type: "DIMENSION" | "TAG" | "COST_CATEGORY"; Key: string }>;
}

const CE_HOST = "ce.us-east-1.amazonaws.com";
const CE_URL = `https://${CE_HOST}/`;

/**
 * Calls CostExplorer GetCostAndUsage. Returns totals + groups per time bucket.
 * Note: Cost Explorer is billed at ~$0.01 per request — cache aggressively.
 */
export async function ceGetCostAndUsage(creds: CeCreds, q: CeQuery): Promise<CeResultByTime[]> {
  const metric = q.metric ?? "UnblendedCost";
  const body = JSON.stringify({
    TimePeriod: { Start: q.start, End: q.end },
    Granularity: q.granularity,
    Metrics: [metric],
    Filter: q.filter,
    GroupBy: q.groupBy,
  });

  const signed = await signRequest({
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken,
    region: "us-east-1",
    service: "ce",
    method: "POST",
    url: CE_URL,
    body,
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSInsightsIndexService.GetCostAndUsage",
    },
  });

  const res = await fetch(CE_URL, { method: "POST", headers: signed.headers, body });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 400);
    try {
      const j = JSON.parse(text);
      msg = j.Message || j.message || j.__type || msg;
    } catch {
      /* ignore */
    }
    throw new Error(`Cost Explorer ${res.status}: ${msg}`);
  }

  const json = JSON.parse(text) as {
    ResultsByTime?: Array<{
      TimePeriod: { Start: string; End: string };
      Total?: Record<string, { Amount: string; Unit: string }>;
      Groups?: Array<{ Keys: string[]; Metrics: Record<string, { Amount: string; Unit: string }> }>;
    }>;
  };

  return (json.ResultsByTime ?? []).map((r) => {
    const totalObj = r.Total?.[metric];
    const groups: CeGroup[] = (r.Groups ?? []).map((g) => {
      const m = g.Metrics[metric];
      return { keys: g.Keys, amount: Number(m?.Amount ?? 0), unit: m?.Unit ?? "USD" };
    });
    const total = totalObj ? Number(totalObj.Amount) : groups.reduce((a, b) => a + b.amount, 0);
    return { start: r.TimePeriod.Start, end: r.TimePeriod.End, total, groups };
  });
}
