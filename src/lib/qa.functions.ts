// QA dashboard aggregation. Reads training_events from the last N days and
// rolls up phase transitions, missed-bus false positives, and boarding
// prompt coverage by hour-of-day and route.
//
// This is a server-only admin read — gated client-side by a shared password
// because the page is for internal QA, not end users.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Schema = z.object({
  days: z.number().int().min(1).max(30).default(7),
});

type Row = {
  kind: string;
  payload: Record<string, unknown>;
  recorded_at: string;
};

export type QaStats = {
  windowDays: number;
  totals: {
    phaseTransitions: number;
    phaseErrors: number;
    promptsShown: number;
    promptsConfirmed: number;
    coveragePct: number;
    missedBusEvents: number;
    missedBusFalsePositives: number;
    falsePositivePct: number;
  };
  byHour: {
    hour: number;
    promptsShown: number;
    promptsConfirmed: number;
    coveragePct: number;
    phaseErrors: number;
    falsePositives: number;
  }[];
  byRoute: {
    routeShort: string;
    promptsShown: number;
    promptsConfirmed: number;
    coveragePct: number;
    phaseErrors: number;
    falsePositives: number;
  }[];
  phaseErrorBreakdown: { from: string; to: string; count: number }[];
  recent: { recordedAt: string; kind: string; summary: string }[];
  telemetry: {
    total: number;
    byKind: { kind: string; count: number }[];
  };
};

// A "phase error" is a transition into missed-connection or a backwards jump
// (riding → waiting-to-board, alight-soon → riding, etc.) that indicates the
// machine misread the situation.
const FORWARD_ORDER = [
  "idle",
  "walking-to-board",
  "waiting-to-board",
  "riding",
  "alight-soon",
  "walking-to-transfer",
  "waiting-for-connection",
  "walking-to-destination",
  "arrived",
];

function isPhaseError(from: string, to: string): boolean {
  if (to === "missed-connection") return true;
  const fi = FORWARD_ORDER.indexOf(from);
  const ti = FORWARD_ORDER.indexOf(to);
  // Backwards step within ride phase chain (excluding idle/arrived resets).
  if (fi >= 0 && ti >= 0 && fi > ti && from !== "arrived" && to !== "idle") return true;
  return false;
}

export const getQaStats = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ data }): Promise<QaStats> => {
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from("training_events")
      .select("kind, payload, recorded_at")
      .gte("recorded_at", since)
      .order("recorded_at", { ascending: false })
      .limit(10000);
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as Row[];

    const byHour = new Map<number, { shown: number; confirmed: number; errors: number; fp: number }>();
    const byRoute = new Map<string, { shown: number; confirmed: number; errors: number; fp: number }>();
    const phaseErrorMap = new Map<string, number>();
    let phaseTransitions = 0;
    let phaseErrors = 0;
    let promptsShown = 0;
    let promptsConfirmed = 0;
    let missedBus = 0;
    let missedFp = 0;

    const bumpHour = (h: number, k: "shown" | "confirmed" | "errors" | "fp") => {
      if (!Number.isFinite(h) || h < 0 || h > 23) return;
      const e = byHour.get(h) ?? { shown: 0, confirmed: 0, errors: 0, fp: 0 };
      e[k] += 1;
      byHour.set(h, e);
    };
    const bumpRoute = (r: string | null | undefined, k: "shown" | "confirmed" | "errors" | "fp") => {
      if (!r) return;
      const e = byRoute.get(r) ?? { shown: 0, confirmed: 0, errors: 0, fp: 0 };
      e[k] += 1;
      byRoute.set(r, e);
    };

    for (const row of list) {
      const p = (row.payload ?? {}) as Record<string, unknown>;
      const hour = typeof p.hourOfDay === "number" ? p.hourOfDay : new Date(row.recorded_at).getHours();
      const route = (p.routeShort as string | undefined) ?? null;
      if (row.kind === "phase-transition") {
        phaseTransitions += 1;
        const from = String(p.from ?? "");
        const to = String(p.to ?? "");
        if (isPhaseError(from, to)) {
          phaseErrors += 1;
          const key = `${from}→${to}`;
          phaseErrorMap.set(key, (phaseErrorMap.get(key) ?? 0) + 1);
          bumpHour(hour, "errors");
          bumpRoute(route, "errors");
        }
      } else if (row.kind === "boarding-prompt-shown") {
        promptsShown += 1;
        bumpHour(hour, "shown");
        bumpRoute(route, "shown");
      } else if (row.kind === "boarding-prompt-confirmed") {
        promptsConfirmed += 1;
        bumpHour(hour, "confirmed");
        bumpRoute(route, "confirmed");
      } else if (row.kind === "missed-bus-false-positive") {
        missedFp += 1;
        bumpHour(hour, "fp");
        bumpRoute(route, "fp");
      } else if (row.kind === "transfer-missed") {
        missedBus += 1;
      }
    }
    missedBus += missedFp; // false positives are still missed events that fired

    const hourRows = Array.from({ length: 24 }, (_, h) => {
      const e = byHour.get(h) ?? { shown: 0, confirmed: 0, errors: 0, fp: 0 };
      return {
        hour: h,
        promptsShown: e.shown,
        promptsConfirmed: e.confirmed,
        coveragePct: e.shown ? Math.round((e.confirmed / e.shown) * 100) : 0,
        phaseErrors: e.errors,
        falsePositives: e.fp,
      };
    });

    const routeRows = Array.from(byRoute.entries())
      .map(([routeShort, e]) => ({
        routeShort,
        promptsShown: e.shown,
        promptsConfirmed: e.confirmed,
        coveragePct: e.shown ? Math.round((e.confirmed / e.shown) * 100) : 0,
        phaseErrors: e.errors,
        falsePositives: e.fp,
      }))
      .sort((a, b) => b.promptsShown + b.phaseErrors - (a.promptsShown + a.phaseErrors));

    const phaseErrorBreakdown = Array.from(phaseErrorMap.entries())
      .map(([k, count]) => {
        const [from, to] = k.split("→");
        return { from, to, count };
      })
      .sort((a, b) => b.count - a.count);

    const recent = list.slice(0, 40).map((r) => {
      const p = (r.payload ?? {}) as Record<string, unknown>;
      let summary = "";
      if (r.kind === "phase-transition") summary = `${p.from} → ${p.to} · ${p.routeShort ?? "—"}`;
      else if (r.kind === "boarding-prompt-shown") summary = `prompt shown · ${p.routeShort ?? "—"} @ ${p.stopId ?? "—"}`;
      else if (r.kind === "boarding-prompt-confirmed") summary = `confirmed · ${p.routeShort ?? "—"}`;
      else if (r.kind === "missed-bus-false-positive") summary = `false miss · ${p.routeShort ?? "—"} (gap ${Math.round(((p.gapMs as number) ?? 0) / 1000)}s)`;
      else summary = r.kind;
      return { recordedAt: r.recorded_at, kind: r.kind, summary };
    });

    return {
      windowDays: data.days,
      totals: {
        phaseTransitions,
        phaseErrors,
        promptsShown,
        promptsConfirmed,
        coveragePct: promptsShown ? Math.round((promptsConfirmed / promptsShown) * 100) : 0,
        missedBusEvents: missedBus,
        missedBusFalsePositives: missedFp,
        falsePositivePct: missedBus ? Math.round((missedFp / missedBus) * 100) : 0,
      },
      byHour: hourRows,
      byRoute: routeRows,
      phaseErrorBreakdown,
      recent,
    };
  });
