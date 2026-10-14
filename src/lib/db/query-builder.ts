// A small supabase-js-compatible query builder over Cloudflare D1.
//
// It covers exactly the PostgREST surface this codebase uses:
//   from(t).select(cols, { count, head }) / insert / upsert / update / delete
//   filters: eq neq in gt gte lt lte is not or ilike like filter match
//   modifiers: order limit range single maybeSingle returns throwOnError
// and resolves to the same `{ data, error, count, status, statusText }` shape,
// lazily (nothing runs until the builder is awaited), like supabase-js.
//
// Value mapping is driven by the generated SCHEMA (schema-meta.ts):
//   json columns  <-> TEXT JSON          bool columns <-> INTEGER 0/1
//   ts columns    -> ISO-8601 UTC TEXT (normalised with toISOString)
// Row-level security does not exist here: callers enforce ownership in code.

import { getD1, type D1Database, type D1PreparedStatement } from "./d1";
import { SCHEMA, type ColumnKind, type TableMeta } from "./schema-meta";

export type DbError = { message: string; code: string; details: string | null; hint: string | null };
export type DbResult<T> = {
  data: T;
  error: DbError | null;
  count: number | null;
  status: number;
  statusText: string;
};

type Cond = { sql: string; params: unknown[] };
type Op = "select" | "insert" | "upsert" | "update" | "delete";
type CountOpt = { count?: "exact" | "planned" | "estimated"; head?: boolean };

/** D1 caps bound parameters per statement at 100. */
const MAX_PARAMS = 100;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TS_LIKE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?\s*(Z|[+-]\d{2}(:?\d{2})?)?$/;

export function dbError(message: string, code = "PGRST000", details: string | null = null): DbError {
  return { message, code, details, hint: null };
}

function mapSqliteError(e: unknown): DbError {
  const msg = e instanceof Error ? e.message : String(e);
  let code = "D1_ERROR";
  if (/UNIQUE constraint failed|PRIMARY KEY constraint failed/i.test(msg)) code = "23505";
  else if (/NOT NULL constraint failed/i.test(msg)) code = "23502";
  else if (/CHECK constraint failed/i.test(msg)) code = "23514";
  else if (/FOREIGN KEY constraint failed/i.test(msg)) code = "23503";
  else if (/no such column|has no column named/i.test(msg)) code = "42703";
  else if (/no such table/i.test(msg)) code = "42P01";
  return dbError(msg, code);
}

function ident(name: string): string {
  const n = name.trim();
  if (!IDENT.test(n)) throw new Error(`invalid identifier: ${name}`);
  return `"${n}"`;
}

export function metaFor(table: string): TableMeta | undefined {
  return SCHEMA[table];
}

function kindOf(meta: TableMeta | undefined, col: string): ColumnKind | undefined {
  return meta?.cols[col];
}

export function toDbValue(kind: ColumnKind | undefined, v: unknown): unknown {
  if (v === undefined || v === null) return null;
  switch (kind) {
    case "json":
      return JSON.stringify(v);
    case "bool":
      return v === true || v === 1 || v === "true" || v === "t" ? 1 : 0;
    case "ts": {
      if (v instanceof Date) return v.toISOString();
      if (typeof v === "string" && TS_LIKE.test(v.trim())) {
        const d = new Date(v.trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
        return Number.isNaN(d.getTime()) ? v : d.toISOString();
      }
      return v;
    }
    default:
      if (typeof v === "boolean") return v ? 1 : 0;
      if (v instanceof Date) return v.toISOString();
      if (typeof v === "object") return JSON.stringify(v);
      return v;
  }
}

export function fromDbRow(meta: TableMeta | undefined, row: Record<string, unknown>) {
  if (!meta) return row;
  for (const [k, v] of Object.entries(row)) {
    const kind = meta.cols[k];
    if (v === null || v === undefined) continue;
    if (kind === "json" && typeof v === "string") {
      try {
        row[k] = JSON.parse(v);
      } catch {
        /* leave as text */
      }
    } else if (kind === "bool") {
      row[k] = v === 1 || v === true || v === "1";
    }
  }
  return row;
}

function parseCols(cols: string | undefined): string {
  const c = (cols ?? "*").trim();
  if (c === "" || c === "*") return "*";
  return c
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s === "*" ? "*" : ident(s)))
    .join(", ");
}

/** Parse a PostgREST literal from or()/filter() strings into a JS value. */
function parseLiteral(raw: string): unknown {
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  const unq = raw.replace(/^"(.*)"$/, "$1");
  return unq;
}

export class QueryBuilder<T = any> implements PromiseLike<DbResult<T>> {
  private op: Op = "select";
  private cols = "*";
  private returning: string | null = null;
  private conds: Cond[] = [];
  private orders: string[] = [];
  private limitN: number | null = null;
  private offsetN: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private countOpt: CountOpt = {};
  private values: Record<string, unknown>[] = [];
  private onConflict: string[] | null = null;
  private ignoreDup = false;
  private throwErr = false;
  private meta: TableMeta | undefined;
  private buildError: DbError | null = null;
  private promise: Promise<DbResult<T>> | null = null;
  private scoped: { col: string; value: unknown } | null = null;

  constructor(
    private readonly table: string,
    private readonly dbFn: () => D1Database = getD1,
  ) {
    this.meta = metaFor(table);
    if (!IDENT.test(table)) this.buildError = dbError(`invalid table ${table}`, "42P01");
  }

  /**
   * Row ownership in place of RLS: every read/update/delete is filtered by
   * `col = value`, and every inserted/upserted row gets `col = value`.
   * Ignored for tables without that column.
   */
  scopeTo(col: string, value: unknown): this {
    if (this.meta?.cols[col]) this.scoped = { col, value };
    return this;
  }

  // ---- verbs ---------------------------------------------------------------
  select(cols?: string, opts?: CountOpt): this {
    try {
      if (this.op === "select") {
        this.cols = parseCols(cols);
        this.countOpt = opts ?? {};
      } else {
        this.returning = parseCols(cols);
      }
    } catch (e) {
      this.buildError = dbError((e as Error).message, "42703");
    }
    return this;
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[], opts?: CountOpt): this {
    this.op = "insert";
    this.values = Array.isArray(values) ? values : [values];
    if (opts) this.countOpt = opts;
    return this;
  }

  upsert(
    values: Record<string, unknown> | Record<string, unknown>[],
    opts?: { onConflict?: string; ignoreDuplicates?: boolean; count?: CountOpt["count"] },
  ): this {
    this.op = "upsert";
    this.values = Array.isArray(values) ? values : [values];
    if (opts?.onConflict) this.onConflict = opts.onConflict.split(",").map((s) => s.trim());
    this.ignoreDup = !!opts?.ignoreDuplicates;
    return this;
  }

  update(patch: Record<string, unknown>, opts?: CountOpt): this {
    this.op = "update";
    this.values = [patch];
    if (opts) this.countOpt = opts;
    return this;
  }

  delete(opts?: CountOpt): this {
    this.op = "delete";
    if (opts) this.countOpt = opts;
    return this;
  }

  // ---- filters ---------------------------------------------------------------
  private cmp(col: string, op: string, value: unknown): Cond {
    const c = ident(col);
    const kind = kindOf(this.meta, col);
    switch (op) {
      case "eq":
        if (value === null) return { sql: `${c} IS NULL`, params: [] };
        return { sql: `${c} = ?`, params: [toDbValue(kind, value)] };
      case "neq":
        if (value === null) return { sql: `${c} IS NOT NULL`, params: [] };
        return { sql: `${c} <> ?`, params: [toDbValue(kind, value)] };
      case "gt":
        return { sql: `${c} > ?`, params: [toDbValue(kind, value)] };
      case "gte":
        return { sql: `${c} >= ?`, params: [toDbValue(kind, value)] };
      case "lt":
        return { sql: `${c} < ?`, params: [toDbValue(kind, value)] };
      case "lte":
        return { sql: `${c} <= ?`, params: [toDbValue(kind, value)] };
      case "like":
        return { sql: `${c} GLOB ?`, params: [String(value).replace(/%/g, "*").replace(/_/g, "?")] };
      case "ilike":
        return { sql: `${c} LIKE ? ESCAPE '\\'`, params: [String(value)] };
      case "is":
        if (value === null || value === "null") return { sql: `${c} IS NULL`, params: [] };
        if (value === true || value === "true") return { sql: `${c} = 1`, params: [] };
        if (value === false || value === "false") return { sql: `${c} = 0`, params: [] };
        throw new Error(`unsupported is() value ${String(value)}`);
      case "in": {
        let list: unknown[];
        if (Array.isArray(value)) list = value;
        else list = String(value).replace(/^\(|\)$/g, "").split(",").map((s) => parseLiteral(s.trim()));
        const mapped = list.map((v) => toDbValue(kind, v));
        // json_each keeps it to one bound parameter however long the list is.
        return { sql: `${c} IN (SELECT value FROM json_each(?))`, params: [JSON.stringify(mapped)] };
      }
      default:
        throw new Error(`unsupported filter operator ${op}`);
    }
  }

  private add(fn: () => Cond): this {
    if (this.buildError) return this;
    try {
      this.conds.push(fn());
    } catch (e) {
      this.buildError = dbError((e as Error).message, "PGRST100");
    }
    return this;
  }

  eq(col: string, v: unknown) { return this.add(() => this.cmp(col, "eq", v)); }
  neq(col: string, v: unknown) { return this.add(() => this.cmp(col, "neq", v)); }
  gt(col: string, v: unknown) { return this.add(() => this.cmp(col, "gt", v)); }
  gte(col: string, v: unknown) { return this.add(() => this.cmp(col, "gte", v)); }
  lt(col: string, v: unknown) { return this.add(() => this.cmp(col, "lt", v)); }
  lte(col: string, v: unknown) { return this.add(() => this.cmp(col, "lte", v)); }
  like(col: string, v: string) { return this.add(() => this.cmp(col, "like", v)); }
  ilike(col: string, v: string) { return this.add(() => this.cmp(col, "ilike", v)); }
  is(col: string, v: null | boolean) { return this.add(() => this.cmp(col, "is", v)); }
  in(col: string, v: readonly unknown[]) { return this.add(() => this.cmp(col, "in", [...v])); }
  filter(col: string, op: string, v: unknown) { return this.add(() => this.cmp(col, op, v)); }
  match(obj: Record<string, unknown>) {
    for (const [k, v] of Object.entries(obj)) this.eq(k, v);
    return this;
  }
  not(col: string, op: string, v: unknown) {
    return this.add(() => {
      const inner = this.cmp(col, op, v);
      return { sql: `NOT (${inner.sql})`, params: inner.params };
    });
  }
  /** PostgREST `or` string: "a.eq.1,b.is.null,c.gte.5" (no nested and()). */
  or(expr: string) {
    return this.add(() => {
      const parts: Cond[] = [];
      for (const raw of expr.split(",")) {
        const p = raw.trim();
        if (!p) continue;
        const m = /^([A-Za-z_][A-Za-z0-9_]*)\.(not\.)?([a-z]+)\.(.*)$/.exec(p);
        if (!m) throw new Error(`unsupported or() clause ${p}`);
        const [, col, neg, op, val] = m;
        const c = this.cmp(col!, op!, op === "in" ? val : parseLiteral(val!));
        parts.push(neg ? { sql: `NOT (${c.sql})`, params: c.params } : c);
      }
      return { sql: `(${parts.map((x) => x.sql).join(" OR ")})`, params: parts.flatMap((x) => x.params) };
    });
  }

  // ---- modifiers -------------------------------------------------------------
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string; referencedTable?: string }) {
    try {
      const asc = opts?.ascending !== false;
      // Postgres defaults: ASC NULLS LAST, DESC NULLS FIRST.
      const nullsFirst = opts?.nullsFirst ?? !asc;
      this.orders.push(`${ident(col)} ${asc ? "ASC" : "DESC"} NULLS ${nullsFirst ? "FIRST" : "LAST"}`);
    } catch (e) {
      this.buildError = dbError((e as Error).message, "42703");
    }
    return this;
  }
  limit(n: number) { this.limitN = Math.max(0, Math.floor(n)); return this; }
  range(from: number, to: number) {
    this.offsetN = Math.max(0, Math.floor(from));
    this.limitN = Math.max(0, Math.floor(to) - Math.floor(from) + 1);
    return this;
  }
  single() { this.mode = "single"; return this as unknown as QueryBuilder<any>; }
  maybeSingle() { this.mode = "maybe"; return this as unknown as QueryBuilder<any>; }
  returns<R>() { return this as unknown as QueryBuilder<R>; }
  throwOnError() { this.throwErr = true; return this; }
  abortSignal(_s?: AbortSignal) { return this; }

  // ---- execution -------------------------------------------------------------
  then<R1 = DbResult<T>, R2 = never>(
    onfulfilled?: ((v: DbResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    if (!this.promise) this.promise = this.execute();
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<R = never>(onrejected?: (reason: unknown) => R | PromiseLike<R>) {
    return this.then(undefined, onrejected);
  }

  private where(): { sql: string; params: unknown[] } {
    if (!this.conds.length) return { sql: "", params: [] };
    return {
      sql: ` WHERE ${this.conds.map((c) => c.sql).join(" AND ")}`,
      params: this.conds.flatMap((c) => c.params),
    };
  }

  private tail(): string {
    let s = "";
    if (this.orders.length) s += ` ORDER BY ${this.orders.join(", ")}`;
    if (this.limitN !== null) s += ` LIMIT ${this.limitN}`;
    else if (this.offsetN !== null) s += " LIMIT -1";
    if (this.offsetN !== null) s += ` OFFSET ${this.offsetN}`;
    return s;
  }

  private shape(rows: Record<string, unknown>[], count: number | null): DbResult<any> {
    const mapped = rows.map((r) => fromDbRow(this.meta, r));
    if (this.mode === "single" || this.mode === "maybe") {
      if (mapped.length === 1) return ok(mapped[0], count);
      if (mapped.length === 0 && this.mode === "maybe") return ok(null, count);
      return fail(
        dbError(
          "JSON object requested, multiple (or no) rows returned",
          "PGRST116",
          `The result contains ${mapped.length} rows`,
        ),
        406,
      );
    }
    return ok(mapped, count);
  }

  private async execute(): Promise<DbResult<T>> {
    const res = await this.run().catch((e) => fail(mapSqliteError(e), 400));
    if (res.error && this.throwErr) throw res.error;
    return res as DbResult<T>;
  }

  private async run(): Promise<DbResult<any>> {
    if (this.buildError) return fail(this.buildError, 400);
    if (this.scoped) {
      const { col, value } = this.scoped;
      if (this.op === "insert" || this.op === "upsert") {
        this.values = this.values.map((r) => ({ ...r, [col]: value }));
      } else {
        if (this.op === "update") {
          const patch = { ...this.values[0] };
          delete patch[col];
          this.values = [patch];
        }
        this.conds.push(this.cmp(col, "eq", value));
      }
      this.scoped = null;
    }
    const db = this.dbFn();
    const t = ident(this.table);
    const w = this.where();

    if (this.op === "select") {
      let count: number | null = null;
      if (this.countOpt.count) {
        const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${t}${w.sql}`).bind(...w.params).first<{ n: number }>();
        count = Number(row?.n ?? 0);
        if (this.countOpt.head) return ok(null, count);
      }
      const out = await db
        .prepare(`SELECT ${this.cols} FROM ${t}${w.sql}${this.tail()}`)
        .bind(...w.params)
        .all();
      return this.shape(out.results ?? [], count);
    }

    if (this.op === "delete" || this.op === "update") {
      if (!this.conds.length) {
        return fail(dbError(`${this.op.toUpperCase()} requires a WHERE clause`, "21000"), 400);
      }
      const ret = this.returning ? ` RETURNING ${this.returning}` : "";
      let sql: string;
      let params: unknown[];
      if (this.op === "delete") {
        sql = `DELETE FROM ${t}${w.sql}${ret}`;
        params = w.params;
      } else {
        const patch = { ...this.values[0] };
        if (this.meta?.cols.updated_at && patch.updated_at === undefined) patch.updated_at = new Date().toISOString();
        const keys = Object.keys(patch).filter((k) => patch[k] !== undefined);
        if (!keys.length) return ok(this.returning ? [] : null, null);
        sql = `UPDATE ${t} SET ${keys.map((k) => `${ident(k)} = ?`).join(", ")}${w.sql}${ret}`;
        params = [...keys.map((k) => toDbValue(kindOf(this.meta, k), patch[k])), ...w.params];
      }
      const out = await db.prepare(sql).bind(...params).all();
      const n = out.meta?.changes ?? null;
      if (!this.returning) return ok(null, this.countOpt.count ? n : null, 204);
      return this.shape(out.results ?? [], this.countOpt.count ? n : null);
    }

    // insert / upsert
    const stmts = this.buildInsert(db, t);
    if (!stmts.length) return ok(this.returning ? [] : null, null);
    const results = stmts.length === 1 ? [await stmts[0]!.all()] : await db.batch(stmts);
    if (!this.returning) {
      const n = results.reduce((a, r) => a + (r.meta?.changes ?? 0), 0);
      return ok(null, this.countOpt.count ? n : null, 201);
    }
    return this.shape(results.flatMap((r) => r.results ?? []), null);
  }

  private buildInsert(db: D1Database, t: string): D1PreparedStatement[] {
    const meta = this.meta;
    // Group rows by their key set so omitted columns fall back to SQL DEFAULTs
    // (PostgREST "missing=default"), then chunk under D1's parameter cap.
    const groups = new Map<string, { keys: string[]; injected: Set<string>; rows: Record<string, unknown>[] }>();
    for (const raw of this.values) {
      const row: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) if (v !== undefined) row[k] = v;
      const injected = new Set<string>();
      for (const u of meta?.uuid ?? []) {
        if (row[u] === undefined || row[u] === null) {
          row[u] = crypto.randomUUID();
          injected.add(u);
        }
      }
      const keys = Object.keys(row).sort();
      const sig = keys.join(",") + "|" + [...injected].sort().join(",");
      const g = groups.get(sig) ?? { keys, injected, rows: [] };
      g.rows.push(row);
      groups.set(sig, g);
    }

    const stmts: D1PreparedStatement[] = [];
    const ret = this.returning ? ` RETURNING ${this.returning}` : "";
    for (const { keys, injected, rows } of groups.values()) {
      if (!keys.length) {
        stmts.push(db.prepare(`INSERT INTO ${t} DEFAULT VALUES${ret}`));
        continue;
      }
      let conflict = "";
      if (this.op === "upsert") {
        const target = this.onConflict ?? meta?.pk ?? [];
        if (!target.length) throw new Error(`upsert on ${this.table} needs onConflict`);
        const partial = (meta?.partialUnique ?? []).find((p) => p.join(",") === target.join(","));
        const targetSql = `(${target.map(ident).join(", ")})${partial ? ` WHERE ${PARTIAL_WHERE[this.table] ?? "1"}` : ""}`;
        const setCols = keys.filter((k) => !target.includes(k) && !injected.has(k));
        if (meta?.cols.updated_at && !keys.includes("updated_at")) setCols.push("updated_at");
        if (this.ignoreDup || !setCols.length) conflict = ` ON CONFLICT ${targetSql} DO NOTHING`;
        else
          conflict = ` ON CONFLICT ${targetSql} DO UPDATE SET ${setCols
            .map((k) =>
              k === "updated_at" && !keys.includes(k)
                ? `"updated_at" = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
                : `${ident(k)} = excluded.${ident(k)}`,
            )
            .join(", ")}`;
      }
      const perRow = Math.max(1, Math.floor(MAX_PARAMS / keys.length));
      for (let i = 0; i < rows.length; i += perRow) {
        const chunk = rows.slice(i, i + perRow);
        const placeholders = chunk.map(() => `(${keys.map(() => "?").join(", ")})`).join(", ");
        const sql = `INSERT INTO ${t} (${keys.map(ident).join(", ")}) VALUES ${placeholders}${conflict}${ret}`;
        const params = chunk.flatMap((r) => keys.map((k) => toDbValue(kindOf(meta, k), r[k])));
        stmts.push(db.prepare(sql).bind(...params));
      }
    }
    return stmts;
  }
}

/** WHERE clauses of partial unique indexes, needed in upsert conflict targets. */
const PARTIAL_WHERE: Record<string, string> = {
  saved_places: "kind IN ('home','work')",
  email_send_log: "status = 'sent'",
};

function ok(data: unknown, count: number | null, status = 200): DbResult<any> {
  return { data, error: null, count, status, statusText: status === 200 ? "OK" : "" };
}

function fail(error: DbError, status: number): DbResult<any> {
  return { data: null, error, count: null, status, statusText: "" };
}
