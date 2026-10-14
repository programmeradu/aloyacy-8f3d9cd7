// Minimal D1 surface the adapter needs, plus binding lookup.
//
// The binding is read the same way the rest of the codebase reads DATA_LAKE /
// SEND_EMAIL: src/server.ts stashes the Worker env on every fetch() and
// scheduled() via setWorkerEnv(); getWorkerEnv() returns it. Tests inject a
// database with setD1ForTests().

import { getWorkerEnv } from "@/lib/worker-env";

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: { changes?: number; last_row_id?: number; [k: string]: unknown };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(col?: string): Promise<T | null>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(stmts: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec?(sql: string): Promise<unknown>;
}

/** Binding name in wrangler config (`d1_databases[].binding`). */
export const D1_BINDING = "DB";

let override: D1Database | null = null;

export function setD1ForTests(db: D1Database | null): void {
  override = db;
}

export function getD1(): D1Database {
  if (override) return override;
  const env = getWorkerEnv() as Record<string, unknown> | undefined;
  const db = (env?.[D1_BINDING] ?? (globalThis as Record<string, unknown>).__ALOYA_D1__) as
    | D1Database
    | undefined;
  if (!db || typeof (db as D1Database).prepare !== "function") {
    throw new Error(
      `D1 binding "${D1_BINDING}" is not available. Add it under d1_databases in wrangler.jsonc.`,
    );
  }
  return db;
}

/** ISO-8601 UTC with milliseconds — the single timestamp format in D1. */
export function nowIso(): string {
  return new Date().toISOString();
}
