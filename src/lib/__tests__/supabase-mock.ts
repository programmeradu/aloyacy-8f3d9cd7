// Test helper: a chainable, in-memory stand-in for the Supabase query builder.
//
// PostgREST builders are thenable and every filter returns `this`, so tests
// only need to declare the rows a table should yield. Filters are recorded so
// assertions can check what the code asked for without a network round trip.
import { vi } from "vitest";

export type TableResult = { data?: unknown; error?: unknown; count?: number };

export type QueryCall = { table: string; method: string; args: unknown[] };

const CHAIN_METHODS = [
  "select",
  "insert",
  "update",
  "upsert",
  "delete",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "is",
  "not",
  "or",
  "filter",
  "contains",
  "overlaps",
  "like",
  "ilike",
  "match",
  "order",
  "limit",
  "range",
  "returns",
  "abortSignal",
] as const;

/**
 * Build a Supabase client double.
 *
 * @param tables Result to resolve for each table name. A function receives the
 *   recorded calls so a table can answer differently per query.
 */
export function makeSupabaseMock(
  tables: Record<string, TableResult | ((calls: QueryCall[]) => TableResult)>,
) {
  const calls: QueryCall[] = [];

  function resultFor(table: string): TableResult {
    const entry = tables[table];
    if (!entry) return { data: [], error: null };
    return typeof entry === "function" ? entry(calls) : entry;
  }

  function builder(table: string) {
    const settle = () => {
      const r = resultFor(table);
      return Promise.resolve({
        data: r.data ?? null,
        error: r.error ?? null,
        count: r.count ?? null,
      });
    };
    const chain: Record<string, unknown> = {
      then: (
        onFulfilled?: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) => settle().then(onFulfilled, onRejected),
      // `.single()` / `.maybeSingle()` collapse arrays the way PostgREST does.
      single: () =>
        settle().then((r) => ({
          ...r,
          data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data,
        })),
      maybeSingle: () =>
        settle().then((r) => ({
          ...r,
          data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data,
        })),
    };
    for (const m of CHAIN_METHODS) {
      chain[m] = (...args: unknown[]) => {
        calls.push({ table, method: m, args });
        return chain;
      };
    }
    return chain;
  }

  return {
    calls,
    client: {
      from: vi.fn((table: string) => builder(table)),
      rpc: vi.fn((name: string, args?: unknown) => {
        calls.push({ table: `rpc:${name}`, method: "rpc", args: [args] });
        const r = resultFor(`rpc:${name}`);
        return Promise.resolve({
          data: r.data ?? null,
          error: r.error ?? null,
          count: r.count ?? null,
        });
      }),
    },
  };
}
