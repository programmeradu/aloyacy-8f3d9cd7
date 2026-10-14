// Set-based accumulate-upserts for the training roll-ups.
//
// The roll-ups used to do one SELECT + one UPSERT per sample, which is
// hundreds of D1 queries per run; Workers Free allows 50 per invocation.
// bulkMerge folds samples by key in memory, then writes them with multi-row
// `INSERT ... ON CONFLICT DO UPDATE` statements that blend in SQL (every
// right-hand side in SQLite's DO UPDATE reads the *old* row, so the weighted
// mean uses the old sample_count), all sent in ONE db.batch() call.

import { getD1, type D1Database } from "./d1";

const MAX_PARAMS = 100;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type MergeSpec = {
  /** Conflict target: must match a PRIMARY KEY or UNIQUE constraint. */
  key: string[];
  /** Weighted-mean columns, weighted by `weight` (default sample_count). */
  mean?: string[];
  weight?: string;
  /** Round the blended means to integers (INTEGER columns). */
  roundMean?: boolean;
  /** Counter columns: old + new. `weight` is always summed. */
  sum?: string[];
  /** Columns overwritten by the new value (a null/0 keeps the old one). */
  replace?: string[];
  /** Set updated_at = now on insert and update. */
  touchUpdatedAt?: boolean;
};

export type MergeRow = Record<string, string | number | null>;

function q(c: string): string {
  if (!IDENT.test(c)) throw new Error(`invalid identifier ${c}`);
  return `"${c}"`;
}

/** Fold rows sharing a key: means weighted, sums added, replace = last non-empty. */
export function foldRows(rows: MergeRow[], spec: MergeSpec): MergeRow[] {
  const weight = spec.weight ?? "sample_count";
  const out = new Map<string, MergeRow>();
  for (const r of rows) {
    const k = JSON.stringify(spec.key.map((c) => r[c]));
    const prev = out.get(k);
    if (!prev) {
      out.set(k, { ...r });
      continue;
    }
    const wa = Number(prev[weight] ?? 0);
    const wb = Number(r[weight] ?? 0);
    const w = wa + wb;
    for (const m of spec.mean ?? []) {
      prev[m] = w > 0 ? (Number(prev[m] ?? 0) * wa + Number(r[m] ?? 0) * wb) / w : Number(r[m] ?? 0);
    }
    for (const s of spec.sum ?? []) if (s !== weight) prev[s] = Number(prev[s] ?? 0) + Number(r[s] ?? 0);
    prev[weight] = w;
    for (const c of spec.replace ?? []) if (r[c] != null && r[c] !== 0) prev[c] = r[c];
  }
  return [...out.values()];
}

export function buildMergeStatements(
  db: D1Database,
  table: string,
  rows: MergeRow[],
  spec: MergeSpec,
): ReturnType<D1Database["prepare"]>[] {
  if (rows.length === 0) return [];
  const weight = spec.weight ?? "sample_count";
  const mean = spec.mean ?? [];
  const sum = [...new Set([...(spec.sum ?? []), ...(mean.length ? [weight] : [])])];
  const replace = spec.replace ?? [];
  const cols = [...new Set([...spec.key, ...mean, ...sum, ...replace])];
  const now = new Date().toISOString();
  const allCols = spec.touchUpdatedAt ? [...cols, "updated_at"] : cols;
  const perRow = allCols.length;
  const rowsPerStmt = Math.max(1, Math.floor(MAX_PARAMS / perRow));

  const t = q(table);
  const sets: string[] = [];
  for (const m of mean) {
    const blended = `(${t}.${q(m)} * ${t}.${q(weight)} + excluded.${q(m)} * excluded.${q(weight)}) * 1.0 / NULLIF(${t}.${q(weight)} + excluded.${q(weight)}, 0)`;
    sets.push(`${q(m)} = ${spec.roundMean ? `CAST(ROUND(${blended}) AS INTEGER)` : blended}`);
  }
  for (const s of sum) sets.push(`${q(s)} = ${t}.${q(s)} + excluded.${q(s)}`);
  for (const r of replace) sets.push(`${q(r)} = COALESCE(NULLIF(excluded.${q(r)}, 0), ${t}.${q(r)})`);
  if (spec.touchUpdatedAt) sets.push(`"updated_at" = excluded."updated_at"`);
  const conflict = sets.length
    ? `ON CONFLICT (${spec.key.map(q).join(", ")}) DO UPDATE SET ${sets.join(", ")}`
    : `ON CONFLICT (${spec.key.map(q).join(", ")}) DO NOTHING`;

  const stmts: ReturnType<D1Database["prepare"]>[] = [];
  for (let i = 0; i < rows.length; i += rowsPerStmt) {
    const chunk = rows.slice(i, i + rowsPerStmt);
    const placeholders = chunk.map(() => `(${allCols.map(() => "?").join(", ")})`).join(", ");
    const params = chunk.flatMap((r) => [
      ...cols.map((c) => (r[c] === undefined ? null : r[c])),
      ...(spec.touchUpdatedAt ? [now] : []),
    ]);
    stmts.push(
      db
        .prepare(`INSERT INTO ${t} (${allCols.map(q).join(", ")}) VALUES ${placeholders} ${conflict}`)
        .bind(...params),
    );
  }
  return stmts;
}

/**
 * Fold + write. Returns the number of distinct keys written. Throws on a D1
 * error (callers in cron hooks catch and report).
 */
export async function bulkMerge(
  table: string,
  rows: MergeRow[],
  spec: MergeSpec,
  dbFn: () => D1Database = getD1,
): Promise<number> {
  const folded = foldRows(rows, spec);
  if (folded.length === 0) return 0;
  const db = dbFn();
  const stmts = buildMergeStatements(db, table, folded, spec);
  if (stmts.length === 1) await stmts[0]!.run();
  else await db.batch(stmts);
  return folded.length;
}

/**
 * Free-plan budgets (Workers Free: 50 D1 queries + 50 subrequests and 10 ms
 * CPU per invocation). Tunable per deployment: raise them on Workers Paid.
 */
export function trainBudget(): { scanRows: number; writeKeys: number } {
  const n = (v: string | undefined, d: number) => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? Math.floor(x) : d;
  };
  return {
    scanRows: n(process.env.TRAIN_SCAN_LIMIT, 2000),
    writeKeys: n(process.env.TRAIN_WRITE_LIMIT, 240),
  };
}
