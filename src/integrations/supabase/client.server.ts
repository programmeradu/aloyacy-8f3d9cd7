// Server-side data client. Formerly the Supabase service-role client; now the
// D1-backed adapter in src/lib/db, which keeps the supabase-js call shape
// (from/select/insert/upsert/update/delete/filters, rpc, storage) so existing
// call sites work unchanged.
//
// There is no row-level security in D1: every caller must scope its queries
// to the authenticated user / device itself.
import { db } from "@/lib/db";

// Typed loosely: the generated Supabase `Database` types no longer describe
// the store, and the builder returns plain rows.
export const supabaseAdmin = db as any;
