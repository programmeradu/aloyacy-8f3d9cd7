// D1-backed stand-in for the supabase-js service-role client.
//
//   import { db } from "@/lib/db";            // new code
//   import { supabaseAdmin } from "@/integrations/supabase/client.server"; // legacy path, same object
//
// Surface: from(table) (see query-builder.ts), rpc(name, args) (rpc.ts),
// storage (R2, storage.ts). `schema()` exists only so legacy vault lookups
// fail soft instead of throwing.

import { getD1, type D1Database } from "./d1";
import { QueryBuilder, dbError } from "./query-builder";
import { callRpc } from "./rpc";
import { storage } from "./storage";

export type DbClient = {
  from: (table: string) => QueryBuilder<any>;
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any; count: number | null; status: number; statusText: string }>;
  storage: typeof storage;
  schema: (name: string) => { from: (t: string) => QueryBuilder<any> };
};

export function createDbClient(dbFn: () => D1Database = getD1): DbClient {
  return {
    from: (table: string) => new QueryBuilder<any>(table, dbFn),
    rpc: async (name, args) => {
      try {
        return await callRpc(dbFn(), name, args ?? {});
      } catch (e) {
        return { data: null, error: dbError((e as Error).message), count: null, status: 500, statusText: "" };
      }
    },
    storage,
    schema: (name: string) => ({
      from: (t: string) => new QueryBuilder<any>(`${name}__${t}`.replace(/[^A-Za-z0-9_]/g, "_"), dbFn),
    }),
  };
}

export const db: DbClient = createDbClient();

/**
 * The client handed to authenticated server functions (`context.supabase`).
 * Tables with a `user_id` column only ever see the caller's rows, which is
 * what the Supabase "owner" RLS policies enforced before.
 */
export function createUserScopedClient(userId: string, dbFn: () => D1Database = getD1): DbClient {
  const base = createDbClient(dbFn);
  return {
    ...base,
    from: (table: string) => new QueryBuilder<any>(table, dbFn).scopeTo("user_id", userId),
  };
}

export { getD1, setD1ForTests, nowIso } from "./d1";
export type { D1Database } from "./d1";
export { QueryBuilder } from "./query-builder";
