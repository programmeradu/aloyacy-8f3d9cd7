// Test helper: a D1Database over node:sqlite, loaded with migrations-d1.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { D1Database, D1PreparedStatement, D1Result } from "../d1";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = (await import("node:sqlite")) as typeof import("node:sqlite");

export function createTestD1(): D1Database & { raw: InstanceType<typeof DatabaseSync> } {
  const raw = new DatabaseSync(":memory:");
  const dir = join(process.cwd(), "migrations-d1");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    raw.exec(readFileSync(join(dir, f), "utf8"));
  }
  const prep = (sql: string, params: unknown[] = []): D1PreparedStatement => {
    const conv = params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));
    const exec = (): D1Result => {
      const st = raw.prepare(sql);
      if (/\bRETURNING\b/i.test(sql) || /^\s*SELECT/i.test(sql)) {
        const rows = st.all(...(conv as never[])) as Record<string, unknown>[];
        return { results: rows, success: true, meta: { changes: rows.length } };
      }
      const r = st.run(...(conv as never[]));
      return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    };
    return {
      bind: (...v: unknown[]) => prep(sql, v),
      all: async <T,>() => exec() as D1Result<T>,
      run: async <T,>() => exec() as D1Result<T>,
      first: async <T,>(col?: string) => {
        const r = exec().results[0] as Record<string, unknown> | undefined;
        if (!r) return null;
        return (col ? r[col] : r) as T;
      },
    };
  };
  return {
    raw,
    prepare: (sql: string) => prep(sql),
    batch: async (stmts) => {
      raw.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) out.push(await s.all());
        raw.exec("COMMIT");
        return out as never;
      } catch (e) {
        raw.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
