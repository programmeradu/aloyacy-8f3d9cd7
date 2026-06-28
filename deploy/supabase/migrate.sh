#!/usr/bin/env bash
# Move Aloya's database from the current hosted Supabase project to the
# self-hosted stack, including auth users and storage objects.
#
#   SOURCE_DB_URL="postgres://postgres:PASS@db.<ref>.supabase.co:5432/postgres" \
#   TARGET_DB_URL="postgres://postgres:PASS@<zeabur-host>:5432/postgres" \
#   ./deploy/supabase/migrate.sh
#
# Safe to re-run: each stage writes to ./dump/ and skips work already done.
# Nothing is dropped on the source.

set -euo pipefail

: "${SOURCE_DB_URL:?set SOURCE_DB_URL}"
: "${TARGET_DB_URL:?set TARGET_DB_URL}"

DUMP_DIR="${DUMP_DIR:-./dump}"
mkdir -p "$DUMP_DIR"

say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

# --- 1. Roles ------------------------------------------------------------
# Dumped separately because pg_dump omits them, and the restore fails on
# missing owners without them.
if [[ ! -s "$DUMP_DIR/roles.sql" ]]; then
  say "Dumping roles"
  pg_dumpall --dbname="$SOURCE_DB_URL" --roles-only --no-role-passwords \
    | grep -v -E '^(CREATE|ALTER) ROLE (postgres|supabase_admin|supabase_auth_admin|supabase_storage_admin|authenticator|anon|authenticated|service_role|pgbouncer|dashboard_user|pgsodium_keyholder)\b' \
    > "$DUMP_DIR/roles.sql" || true
else
  say "Roles already dumped, skipping"
fi

# --- 2. Auth users -------------------------------------------------------
# Every rider account, including the anonymous ones the app mints on first
# launch. Identical JWT_SECRET on the target means their sessions survive.
if [[ ! -s "$DUMP_DIR/auth.sql" ]]; then
  say "Dumping auth schema (rider accounts)"
  pg_dump "$SOURCE_DB_URL" \
    --schema=auth --data-only --no-owner --no-privileges \
    --exclude-table='auth.schema_migrations' \
    --column-inserts \
    > "$DUMP_DIR/auth.sql"
else
  say "Auth already dumped, skipping"
fi

# --- 3. Application data -------------------------------------------------
# Schema + data + RLS policies + functions + triggers in one file.
if [[ ! -s "$DUMP_DIR/public.sql" ]]; then
  say "Dumping public schema (tables, data, RLS policies, functions)"
  pg_dump "$SOURCE_DB_URL" \
    --schema=public --schema=storage \
    --no-owner --no-privileges --quote-all-identifiers \
    --exclude-table='storage.migrations' \
    > "$DUMP_DIR/public.sql"
else
  say "Public schema already dumped, skipping"
fi

# --- 4. Restore ----------------------------------------------------------
say "Restoring roles"
psql "$TARGET_DB_URL" -v ON_ERROR_STOP=0 -f "$DUMP_DIR/roles.sql" >/dev/null 2>&1 || true

say "Restoring rider accounts"
psql "$TARGET_DB_URL" -v ON_ERROR_STOP=0 -f "$DUMP_DIR/auth.sql"

say "Restoring application data"
psql "$TARGET_DB_URL" -v ON_ERROR_STOP=0 -f "$DUMP_DIR/public.sql"

# --- 5. Re-grant ---------------------------------------------------------
# The dump ran with --no-privileges, so re-apply Data API access in bulk.
# Without this every table returns a permission error even with RLS correct.
say "Re-granting Data API access"
psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
SQL

# Public read tables (route metadata, alert counters, shared views) need
# anon SELECT. Re-apply only where an anon policy exists, so user-owned
# tables stay closed.
psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT DISTINCT c.relname
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND 'anon' = ANY (SELECT rolname FROM pg_roles WHERE oid = ANY (p.polroles))
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO anon', t.relname);
  END LOOP;
END $$;
SQL

# --- 6. Verify -----------------------------------------------------------
say "Verifying"
psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'rider accounts' AS what, count(*) FROM auth.users
UNION ALL SELECT 'public tables', count(*) FROM pg_tables WHERE schemaname = 'public'
UNION ALL SELECT 'RLS policies', count(*) FROM pg_policies WHERE schemaname = 'public'
UNION ALL SELECT 'tables WITHOUT RLS', count(*) FROM pg_tables t
  WHERE t.schemaname = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t.tablename AND c.relrowsecurity
    );
SQL

say "Done. If 'tables WITHOUT RLS' is above 0, inspect those before cutting over."
