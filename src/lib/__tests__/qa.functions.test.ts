import { describe, expect, it, beforeEach, vi } from "vitest";
import { callServerFn } from "./server-fn";
import { makeSupabaseMock, type TableResult } from "./supabase-mock";

// The admin gate has its own suite (src/lib/__tests__/admin-auth.test.ts);
// here it is a pass-through so these tests exercise the handler itself.
vi.mock("@/lib/admin.functions", async () => {
  const { createMiddleware } = await import("@tanstack/react-start");
  return {
    requireAdmin: createMiddleware({ type: "function" }).server(({ next }) => next()),
  };
});

const state: { result: TableResult } = { result: { data: [], error: null } };

vi.mock("@/integrations/supabase/client.server", () => {
  const { client } = makeSupabaseMock({ training_events: () => state.result });
  return { supabaseAdmin: client };
});

const { getQaStats } = await import("../qa.functions");

function row(kind: string, payload: Record<string, unknown>, recordedAt: string) {
  return { kind, payload, recorded_at: recordedAt };
}

describe("getQaStats", () => {
  beforeEach(() => {
    state.result = { data: [], error: null };
    vi.setSystemTime(new Date("2024-01-10T00:00:00Z"));
  });

  it("rejects an out-of-range window at the validator boundary", async () => {
    await expect(callServerFn(getQaStats, { days: 999 })).rejects.toThrow();
  });

  it("throws when the query errors", async () => {
    state.result = { data: null, error: { message: "boom" } };
    await expect(callServerFn(getQaStats, { days: 7 })).rejects.toThrow("boom");
  });

  it("returns zeroed stats when there is no data", async () => {
    const out = await callServerFn(getQaStats, { days: 7 });
    expect(out.totals).toEqual({
      phaseTransitions: 0,
      phaseErrors: 0,
      promptsShown: 0,
      promptsConfirmed: 0,
      coveragePct: 0,
      missedBusEvents: 0,
      missedBusFalsePositives: 0,
      falsePositivePct: 0,
    });
    expect(out.byHour).toHaveLength(24);
    expect(out.byRoute).toEqual([]);
  });

  it("counts phase transitions, detects backward and missed-connection errors", async () => {
    state.result = {
      data: [
        row(
          "phase-transition",
          { from: "idle", to: "riding", hourOfDay: 8, routeShort: "30" },
          "2024-01-09T08:00:00Z",
        ),
        row(
          "phase-transition",
          { from: "riding", to: "idle", hourOfDay: 8, routeShort: "30" },
          "2024-01-09T08:05:00Z",
        ),
        row(
          "phase-transition",
          { from: "riding", to: "missed-connection", hourOfDay: 9 },
          "2024-01-09T09:00:00Z",
        ),
      ],
      error: null,
    };
    const out = await callServerFn(getQaStats, { days: 7 });
    expect(out.totals.phaseTransitions).toBe(3);
    // idle -> riding is forward (not error); riding -> idle is a "to === idle" reset
    // so excluded; riding -> missed-connection is always an error.
    expect(out.totals.phaseErrors).toBe(1);
    expect(out.phaseErrorBreakdown).toEqual([
      { from: "riding", to: "missed-connection", count: 1 },
    ]);
    const hour8 = out.byHour.find((h) => h.hour === 8)!;
    expect(hour8.phaseErrors).toBe(0);
    const hour9 = out.byHour.find((h) => h.hour === 9)!;
    expect(hour9.phaseErrors).toBe(1);
    const route30 = out.byRoute.find((r) => r.routeShort === "30");
    expect(route30).toBeUndefined();
  });

  it("flags a genuine backward step within the ride chain as a phase error", async () => {
    state.result = {
      data: [
        row(
          "phase-transition",
          { from: "alight-soon", to: "riding", hourOfDay: 10, routeShort: "5" },
          "2024-01-09T10:00:00Z",
        ),
      ],
      error: null,
    };
    const out = await callServerFn(getQaStats, { days: 7 });
    expect(out.totals.phaseErrors).toBe(1);
    const route5 = out.byRoute.find((r) => r.routeShort === "5");
    expect(route5?.phaseErrors).toBe(1);
  });

  it("computes prompt coverage and false-positive rate", async () => {
    state.result = {
      data: [
        row("boarding-prompt-shown", { hourOfDay: 8, routeShort: "30" }, "2024-01-09T08:00:00Z"),
        row("boarding-prompt-shown", { hourOfDay: 8, routeShort: "30" }, "2024-01-09T08:01:00Z"),
        row(
          "boarding-prompt-confirmed",
          { hourOfDay: 8, routeShort: "30" },
          "2024-01-09T08:02:00Z",
        ),
        row(
          "missed-bus-false-positive",
          { hourOfDay: 8, routeShort: "30", gapMs: 5000 },
          "2024-01-09T08:03:00Z",
        ),
        row("transfer-missed", {}, "2024-01-09T08:04:00Z"),
      ],
      error: null,
    };
    const out = await callServerFn(getQaStats, { days: 7 });
    expect(out.totals.promptsShown).toBe(2);
    expect(out.totals.promptsConfirmed).toBe(1);
    expect(out.totals.coveragePct).toBe(50);
    expect(out.totals.missedBusEvents).toBe(2); // 1 transfer-missed + 1 false positive
    expect(out.totals.missedBusFalsePositives).toBe(1);
    expect(out.totals.falsePositivePct).toBe(50);
    const route30 = out.byRoute.find((r) => r.routeShort === "30")!;
    expect(route30.coveragePct).toBe(50);
    expect(route30.falsePositives).toBe(1);
    expect(out.recent[3].summary).toContain("false miss");
  });

  it("falls back to recorded_at's hour when hourOfDay is missing", async () => {
    state.result = {
      data: [row("boarding-prompt-shown", { routeShort: "1" }, "2024-01-09T14:30:00Z")],
      error: null,
    };
    const out = await callServerFn(getQaStats, { days: 7 });
    const hour = new Date("2024-01-09T14:30:00Z").getHours();
    expect(out.byHour.find((h) => h.hour === hour)?.promptsShown).toBe(1);
  });

  it("builds recent summaries for confirmed prompts and generic telemetry", async () => {
    state.result = {
      data: [
        row("boarding-prompt-confirmed", { routeShort: "10" }, "2024-01-09T08:00:00Z"),
        row("some-other-event", { query: "hello", ms: 42 }, "2024-01-09T08:01:00Z"),
      ],
      error: null,
    };
    const out = await callServerFn(getQaStats, { days: 7 });
    expect(out.recent[0].summary).toBe("confirmed · 10");
    expect(out.recent[1].summary).toContain("query=hello");
    expect(out.telemetry.total).toBe(2);
    expect(out.telemetry.byKind).toEqual(
      expect.arrayContaining([
        { kind: "boarding-prompt-confirmed", count: 1 },
        { kind: "some-other-event", count: 1 },
      ]),
    );
  });

  it("summarizes an unrecognized kind with no matching fields as its own name", async () => {
    state.result = { data: [row("weird-event", {}, "2024-01-09T08:00:00Z")], error: null };
    const out = await callServerFn(getQaStats, { days: 7 });
    expect(out.recent[0].summary).toBe("weird-event");
  });
});
