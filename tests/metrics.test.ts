import { beforeEach, describe, expect, it } from "vitest";
import {
  incrementCounter,
  observe,
  readMetric,
  renderPrometheus,
  resetMetrics,
  setGauge,
  snapshotMetrics,
  timeIt,
} from "@/lib/metrics";

beforeEach(() => resetMetrics());

describe("metrics registry", () => {
  it("accumulates counters per label set", () => {
    incrementCounter("aloya_errors_total", { scope: "gtfs" });
    incrementCounter("aloya_errors_total", { scope: "gtfs" }, 3);
    incrementCounter("aloya_errors_total", { scope: "plan" });

    expect(readMetric("aloya_errors_total", { scope: "gtfs" })).toBe(4);
    expect(readMetric("aloya_errors_total", { scope: "plan" })).toBe(1);
  });

  it("treats label order as insignificant", () => {
    incrementCounter("c", { a: "1", b: "2" });
    incrementCounter("c", { b: "2", a: "1" });
    expect(readMetric("c", { a: "1", b: "2" })).toBe(2);
    expect(snapshotMetrics()).toHaveLength(1);
  });

  it("refuses to decrement a counter", () => {
    expect(() => incrementCounter("c", {}, -1)).toThrow(/cannot decrease/);
  });

  it("rejects reusing a name with a different metric kind", () => {
    incrementCounter("dual");
    expect(() => setGauge("dual", 1)).toThrow(/already registered as counter/);
  });

  it("overwrites gauges instead of summing them", () => {
    setGauge("aloya_dependency_up", 1, { dependency: "database" });
    setGauge("aloya_dependency_up", 0, { dependency: "database" });
    expect(readMetric("aloya_dependency_up", { dependency: "database" })).toBe(0);
  });

  it("exposes summaries as sum plus count", () => {
    observe("dur", 0.2, { probe: "db" });
    observe("dur", 0.4, { probe: "db" });
    const text = renderPrometheus();
    expect(text).toContain('dur_sum{probe="db"} 0.6000000000000001');
    expect(text).toContain('dur_count{probe="db"} 2');
    expect(snapshotMetrics()[0]?.count).toBe(2);
  });

  it("times an async operation and still records on throw", async () => {
    await timeIt("op", { name: "ok" }, async () => "value");
    await expect(
      timeIt("op", { name: "bad" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const rendered = renderPrometheus();
    expect(rendered).toContain('op_count{name="ok"} 1');
    expect(rendered).toContain('op_count{name="bad"} 1');
  });

  it("renders HELP and TYPE headers, sorted by metric name", () => {
    setGauge("z_metric", 1, {}, "last");
    incrementCounter("a_metric", {}, 1, "first");
    const lines = renderPrometheus().trim().split("\n");
    expect(lines[0]).toBe("# HELP a_metric first");
    expect(lines[1]).toBe("# TYPE a_metric counter");
    expect(lines).toContain("# TYPE z_metric gauge");
    expect(lines.indexOf("# HELP a_metric first")).toBeLessThan(
      lines.indexOf("# HELP z_metric last"),
    );
  });

  it("escapes quotes, backslashes and newlines in label values", () => {
    incrementCounter("m", { route: 'a"b\\c\nd' });
    expect(renderPrometheus()).toContain('m{route="a\\"b\\\\c\\nd"} 1');
  });

  it("renders an empty string when nothing has been recorded", () => {
    expect(renderPrometheus()).toBe("");
  });

  it("omits the label block entirely for unlabelled series", () => {
    incrementCounter("bare");
    expect(renderPrometheus()).toContain("\nbare 1\n");
  });
});
