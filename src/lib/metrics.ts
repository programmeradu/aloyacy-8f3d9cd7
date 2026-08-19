// Minimal in-process metrics registry with Prometheus text exposition.
//
// The app runs on a Worker runtime, so prom-client (Node streams, gc probes,
// process hooks) is not an option. What operations actually needs is the
// exposition *format* — a scrape endpoint any Prometheus/Grafana Agent can
// read — not the library. Counters and gauges live in module state for the
// lifetime of an isolate; a scrape therefore reports "what this instance has
// seen since it warmed up", which is exactly how per-instance counters are
// meant to be aggregated by the scraper.
//
// Usage:
//   incrementCounter("aloya_http_errors_total", { route: "/api/public/plan" });
//   setGauge("aloya_gtfs_feed_age_seconds", 412, { feed: "nicosia" });
//   observe("aloya_probe_duration_seconds", 0.041, { probe: "database" });
//
// Never record a label value derived from user input without bounding it —
// unbounded label cardinality is the classic way to blow up a metrics store.

export type Labels = Record<string, string | number>;

export type MetricKind = "counter" | "gauge" | "summary";

interface Series {
  labels: Labels;
  value: number;
  /** Populated for summaries only. */
  count?: number;
}

interface Metric {
  name: string;
  kind: MetricKind;
  help: string;
  series: Map<string, Series>;
}

const registry = new Map<string, Metric>();

/** Stable key for a label set so `{a:1,b:2}` and `{b:2,a:1}` are one series. */
function labelKey(labels: Labels): string {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}=${String(labels[k])}`).join(",");
}

function metric(name: string, kind: MetricKind, help: string): Metric {
  const existing = registry.get(name);
  if (existing) {
    if (existing.kind !== kind) {
      throw new Error(`metric ${name} already registered as ${existing.kind}`);
    }
    return existing;
  }
  const created: Metric = { name, kind, help, series: new Map() };
  registry.set(name, created);
  return created;
}

function series(m: Metric, labels: Labels): Series {
  const key = labelKey(labels);
  let s = m.series.get(key);
  if (!s) {
    s = { labels, value: 0, ...(m.kind === "summary" ? { count: 0 } : {}) };
    m.series.set(key, s);
  }
  return s;
}

/** Add to a monotonically increasing counter (defaults to +1). */
export function incrementCounter(name: string, labels: Labels = {}, by = 1, help = name): void {
  if (by < 0) throw new Error(`counter ${name} cannot decrease`);
  series(metric(name, "counter", help), labels).value += by;
}

/** Set an instantaneous value that can go up or down. */
export function setGauge(name: string, value: number, labels: Labels = {}, help = name): void {
  series(metric(name, "gauge", help), labels).value = value;
}

/**
 * Record an observation. Exposed as a Prometheus summary (`_sum` + `_count`),
 * which is enough for `rate(sum)/rate(count)` average-latency panels without
 * carrying bucket configuration around.
 */
export function observe(name: string, value: number, labels: Labels = {}, help = name): void {
  const s = series(metric(name, "summary", help), labels);
  s.value += value;
  s.count = (s.count ?? 0) + 1;
}

/** Time an async operation and record its duration in seconds. */
export async function timeIt<T>(
  name: string,
  labels: Labels,
  run: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    return await run();
  } finally {
    observe(name, (Date.now() - started) / 1000, labels);
  }
}

/** Read a single series value — for assertions and health payloads. */
export function readMetric(name: string, labels: Labels = {}): number | undefined {
  return registry.get(name)?.series.get(labelKey(labels))?.value;
}

/** Drop every recorded series. Tests only. */
export function resetMetrics(): void {
  registry.clear();
}

const ESCAPES: Record<string, string> = { "\\": "\\\\", '"': '\\"', "\n": "\\n" };

function escapeLabelValue(value: string): string {
  return value.replace(/[\\"\n]/g, (c) => ESCAPES[c] ?? c);
}

function renderLabels(labels: Labels): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return "";
  const body = keys.map((k) => `${k}="${escapeLabelValue(String(labels[k]))}"`).join(",");
  return `{${body}}`;
}

/** Render everything recorded so far in the Prometheus text exposition format. */
export function renderPrometheus(): string {
  const lines: string[] = [];
  for (const m of [...registry.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`# HELP ${m.name} ${m.help.replace(/\n/g, " ")}`);
    lines.push(`# TYPE ${m.name} ${m.kind}`);
    for (const s of m.series.values()) {
      const labels = renderLabels(s.labels);
      if (m.kind === "summary") {
        lines.push(`${m.name}_sum${labels} ${s.value}`);
        lines.push(`${m.name}_count${labels} ${s.count ?? 0}`);
      } else {
        lines.push(`${m.name}${labels} ${s.value}`);
      }
    }
  }
  return lines.length ? `${lines.join("\n")}\n` : "";
}

/** JSON view of the same data, for the health endpoint and debugging. */
export function snapshotMetrics(): {
  name: string;
  kind: MetricKind;
  labels: Labels;
  value: number;
  count?: number;
}[] {
  const out: ReturnType<typeof snapshotMetrics> = [];
  for (const m of registry.values()) {
    for (const s of m.series.values()) {
      out.push({
        name: m.name,
        kind: m.kind,
        labels: s.labels,
        value: s.value,
        ...(s.count === undefined ? {} : { count: s.count }),
      });
    }
  }
  return out;
}
