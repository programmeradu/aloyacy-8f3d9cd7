// CloudWatch GetMetricData client using our SigV4 signer.
// Uses the classic Query API (application/x-www-form-urlencoded) which returns XML.
// We hand-parse the small, predictable response.

import { signRequest } from "@/lib/aws-sigv4.server";

export interface CwCreds {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

export interface CwSeries {
  id: string;
  label: string;
  timestamps: string[];
  values: number[];
}

/**
 * Runs a CloudWatch GetMetricData Query API call. `queries` is a list of
 * metric-math or SEARCH expressions plus per-query settings.
 */
export async function cwGetMetricData(
  creds: CwCreds,
  opts: {
    startTime: Date;
    endTime: Date;
    queries: Array<{
      id: string;
      expression: string;
      period?: number; // seconds; default 300
      returnData?: boolean;
      label?: string; // CloudWatch Label template, e.g. "${PROP('Dim.ModelId')}"
    }>;
  },
): Promise<CwSeries[]> {
  const url = `https://monitoring.${creds.region}.amazonaws.com/`;
  const params = new URLSearchParams();
  params.set("Action", "GetMetricData");
  params.set("Version", "2010-08-01");
  params.set("StartTime", opts.startTime.toISOString());
  params.set("EndTime", opts.endTime.toISOString());
  params.set("ScanBy", "TimestampAscending");
  params.set("MaxDatapoints", "5000");

  opts.queries.forEach((q, i) => {
    const n = i + 1;
    params.set(`MetricDataQueries.member.${n}.Id`, q.id);
    params.set(`MetricDataQueries.member.${n}.Expression`, q.expression);
    params.set(`MetricDataQueries.member.${n}.Period`, String(q.period ?? 300));
    params.set(
      `MetricDataQueries.member.${n}.ReturnData`,
      String(q.returnData ?? true),
    );
    if (q.label) params.set(`MetricDataQueries.member.${n}.Label`, q.label);
  });

  const body = params.toString();

  const signed = await signRequest({
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken,
    region: creds.region,
    service: "monitoring",
    method: "POST",
    url,
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const res = await fetch(url, {
    method: "POST",
    headers: signed.headers,
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    // Surface CloudWatch's ErrorResponse message to the caller
    const msg = /<Message>([^<]+)<\/Message>/.exec(text)?.[1] ?? text.slice(0, 400);
    throw new Error(`CloudWatch ${res.status}: ${msg}`);
  }

  // Parse <member> blocks inside <MetricDataResults>
  const results: CwSeries[] = [];
  const membersRegion = /<MetricDataResults>([\s\S]*?)<\/MetricDataResults>/.exec(text)?.[1] ?? "";
  const memberRe = /<member>([\s\S]*?)<\/member>/g;
  // The outer members are top-level series; each contains its own <Timestamps><member>...
  // We split on the top-level members by tracking depth via specific tags.
  const topMembers = extractTopLevelMembers(membersRegion);
  for (const m of topMembers) {
    const id = /<Id>([^<]*)<\/Id>/.exec(m)?.[1] ?? "";
    const label = /<Label>([^<]*)<\/Label>/.exec(m)?.[1] ?? "";
    const tsBlock = /<Timestamps>([\s\S]*?)<\/Timestamps>/.exec(m)?.[1] ?? "";
    const valBlock = /<Values>([\s\S]*?)<\/Values>/.exec(m)?.[1] ?? "";
    const timestamps: string[] = [];
    const values: number[] = [];
    for (const t of tsBlock.matchAll(/<member>([^<]+)<\/member>/g)) timestamps.push(t[1]);
    for (const v of valBlock.matchAll(/<member>([^<]+)<\/member>/g)) values.push(Number(v[1]));
    results.push({ id, label, timestamps, values });
  }
  // Silence unused-lint on regex helper
  void memberRe;
  return results;
}

function extractTopLevelMembers(xml: string): string[] {
  const out: string[] = [];
  const openTag = "<member>";
  const closeTag = "</member>";
  let depth = 0;
  let start = -1;
  let i = 0;
  while (i < xml.length) {
    if (xml.startsWith(openTag, i)) {
      if (depth === 0) start = i + openTag.length;
      depth++;
      i += openTag.length;
      continue;
    }
    if (xml.startsWith(closeTag, i)) {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(xml.slice(start, i));
        start = -1;
      }
      i += closeTag.length;
      continue;
    }
    i++;
  }
  return out;
}
