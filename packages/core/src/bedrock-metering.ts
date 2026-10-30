/**
 * Pure formatting + math helpers for the internal Bedrock metering dashboard.
 * No React, no network — safe to unit test and share with the mobile app.
 */

export interface AwsCredsInput {
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  sessionToken?: string;
}

/** USD with 4 decimals — proxy-level estimates are fractions of a cent. */
export function money(n: number): string {
  return safeNumber(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

/** USD with 2 decimals — billed amounts from Cost Explorer. */
export function money2(n: number): string {
  return safeNumber(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function compact(n: number): string {
  return Math.round(safeNumber(n)).toLocaleString("en-US");
}

function safeNumber(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/** "45 min" | "6h" | "7d" */
export function formatWindow(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0 min";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${roundTo(hours, 1)}h`;
  return `${roundTo(hours / 24, 1)}d`;
}

/** CloudWatch period in seconds → "60s" | "5m" | "1h" */
export function formatPeriod(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${roundTo(seconds / 60, 1)}m`;
  return `${roundTo(seconds / 3600, 1)}h`;
}

function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/** Time axis label — clock for short windows, calendar date for long ones. */
export function formatAxisTs(iso: string, hours: number, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return hours <= 24
    ? d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

/**
 * Parse the combined credential blob used by the internal test pages:
 * `AKIA…:SECRET[:region][:sessionToken]`. Returns null when unusable.
 */
export function parseCombinedCreds(raw: string): AwsCredsInput | null {
  if (typeof raw !== "string") return null;
  const parts = raw
    .trim()
    .split(":")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const [accessKeyId, secretAccessKey, region, sessionToken] = parts;
  if (!accessKeyId || !secretAccessKey) return null;
  return {
    accessKeyId,
    secretAccessKey,
    ...(region ? { region } : {}),
    ...(sessionToken ? { sessionToken } : {}),
  };
}

/** Masked one-line summary of parsed creds — never exposes the secret. */
export function describeCreds(creds: AwsCredsInput, effectiveRegion: string): string {
  const bits = [
    `key ····${creds.accessKeyId.slice(-4)}`,
    `secret ${creds.secretAccessKey.length} chars`,
    `region ${effectiveRegion}`,
  ];
  if (creds.sessionToken) bits.push("session token attached");
  return bits.join(" · ");
}

/** Percentage of a soft spend cap consumed, clamped to 0..100. */
export function capPercent(spend: number, cap: number): number {
  if (!Number.isFinite(spend) || !Number.isFinite(cap) || cap <= 0) return 0;
  return Math.min(100, Math.max(0, (spend / cap) * 100));
}

export type CapTone = "ok" | "warn" | "over";

export function capTone(pct: number): CapTone {
  if (pct >= 100) return "over";
  if (pct >= 80) return "warn";
  return "ok";
}

/** Bar height as a % of the tallest bar, with a visible floor for zero values. */
export function barHeightPct(value: number, max: number, floor = 2): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return floor;
  return Math.max(floor, Math.min(100, (value / max) * 100));
}

/** Largest value in a series, never zero (safe divisor for bar charts). */
export function seriesMax(values: readonly number[]): number {
  let max = 0;
  for (const v of values) if (Number.isFinite(v) && v > max) max = v;
  return max > 0 ? max : 0.0001;
}

export function successRateLabel(okCalls: number, calls: number): string {
  if (!calls || calls <= 0) return "-";
  return `${Math.round((okCalls / calls) * 100)}%`;
}

/** AWS only allows HOURLY Cost Explorer granularity within the last 14 days. */
export function effectiveGranularity(
  days: number,
  requested: "HOURLY" | "DAILY",
): "HOURLY" | "DAILY" {
  return days > 14 ? "DAILY" : requested;
}

/** Share of window spend attributable to one usage type, as a percentage. */
export function spendShare(amount: number, windowTotal: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(windowTotal) || windowTotal <= 0) return 0;
  return (amount / windowTotal) * 100;
}

/** Three evenly spaced axis ticks (start / middle / end) for a bucket series. */
export function axisTicks<T>(items: readonly T[]): T[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [items[0]!];
  return [items[0]!, items[Math.floor(items.length / 2)]!, items[items.length - 1]!];
}

/** Trailing model segment: "eu.anthropic.claude-sonnet-4-v1:0" → "claude-sonnet-4-v1:0" */
export function shortModelName(modelId: string): string {
  if (!modelId) return "-";
  return modelId.split(/[/.]/).pop() || modelId;
}
