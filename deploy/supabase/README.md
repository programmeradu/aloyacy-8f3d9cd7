# Self-hosted Supabase for Aloya (Zeabur)

Moves the backend off managed hosting and onto infrastructure you own, with
**no application code changes** — the stack speaks the same API, so only three
environment values move.

Zeabur is the target because, unlike Cloudflare Containers, it gives Postgres a
**persistent volume**. Nothing here is Zeabur-specific though; the same compose
file runs on any Docker host (Hetzner CX32, €8.60/mo, is the cheaper long-term
home if credits run out).

---

## What runs

| Service | Purpose in Aloya |
|---|---|
| `db` | Postgres 15 + pg_cron, pg_net, PostGIS, pgmq. The only stateful service. |
| `auth` | GoTrue — anonymous sign-in on first launch, OTP sign-in, account upgrade. |
| `rest` | PostgREST — every `supabase.from(...)` call in web, mobile and workers. |
| `realtime` | Live group-trip map, scheduled departures, commute patterns, alert counters. |
| `storage` + `imgproxy` | The public `schedule` bucket serving the offline SQLite bundle. |
| `meta` + `studio` | Your own dashboard — tables, SQL editor, logs. |
| `kong` | The single public entrypoint. **Only this service is exposed.** |

---

## 1. Generate secrets

```bash
cd deploy/supabase
cp .env.example .env

openssl rand -base64 48 | tr -d '\n'                    # JWT_SECRET
openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32   # POSTGRES_PASSWORD
openssl rand -hex 16                                     # REALTIME_ENC_KEY (32 chars exactly)
openssl rand -base64 48 | tr -d '\n'                     # REALTIME_SECRET_KEY_BASE
openssl rand -base64 24                                  # DASHBOARD_PASSWORD
```

> **Reuse the current project's JWT secret** if you can retrieve it. Same secret
> means every signed-in rider keeps their session through the cutover instead of
> being silently logged out mid-journey.

Then mint the API keys:

```bash
JWT_SECRET="<the value above>" bun mint-keys.ts
```

Paste `ANON_KEY` and `SERVICE_ROLE_KEY` into `.env`.

---

## 2. Deploy to Zeabur

1. New project → **Deploy from Docker Compose** → paste `docker-compose.yml`.
2. Add every variable from `.env` in the project's Variables tab.
3. On the `db` service, confirm `/var/lib/postgresql/data` is a **Volume**, not
   ephemeral storage. Same for `storage-data` on the `storage` service. This is
   the one setting that loses your data if it's wrong.
4. Expose **only** `kong` on port 8000. Everything else stays internal.
5. Bind a domain to `kong` — `db.aloya.cy` — and let Zeabur issue TLS.
6. Set `SUPABASE_PUBLIC_URL=https://db.aloya.cy` and redeploy so GoTrue mints
   links against the right host.

Sanity check:

```bash
curl -s https://db.aloya.cy/auth/v1/health
curl -s https://db.aloya.cy/rest/v1/ -H "apikey: $ANON_KEY" | head -c 200
```

---

## 3. Move the data

Grab the source connection string from the current project, then:

```bash
SOURCE_DB_URL="postgres://postgres:PASS@db.<ref>.supabase.co:5432/postgres" \
TARGET_DB_URL="postgres://postgres:PASS@<zeabur-db-host>:5432/postgres" \
./migrate.sh
```

This carries schema, data, **RLS policies**, functions (`has_role`,
`pulse_hour_strip`, `get_trip_group_view`, the email-queue helpers), triggers,
and all rider accounts — then re-applies Data API grants, which `pg_dump`
deliberately omits. It finishes by printing a row count and a count of tables
**without** RLS; that number should be 0 before you cut over.

Storage objects move separately:

```bash
SOURCE_URL=https://<ref>.supabase.co SOURCE_SERVICE_KEY=<old service key> \
TARGET_URL=https://db.aloya.cy      TARGET_SERVICE_KEY=<new service key> \
bun copy-storage.ts
```

---

## 4. Point the app at it

Three project secrets, one mobile env value. No code changes.

| Where | Key | Value |
|---|---|---|
| Project secrets | `CUSTOM_SUPABASE_URL` | `https://db.aloya.cy` |
| Project secrets | `CUSTOM_SUPABASE_ANON_KEY` | new `ANON_KEY` |
| Project secrets | `CUSTOM_SUPABASE_SERVICE_ROLE_KEY` | new `SERVICE_ROLE_KEY` |
| `.env` | `VITE_CUSTOM_SUPABASE_URL` | `https://db.aloya.cy` |
| `.env` | `VITE_CUSTOM_SUPABASE_ANON_KEY` | new `ANON_KEY` |
| Mobile build (EAS) | `EXPO_PUBLIC_SUPABASE_URL` | `https://db.aloya.cy` |
| Mobile build (EAS) | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | new `ANON_KEY` |

Also repoint the Cloudflare workers (`workers/pulse-cron`, `workers/gtfs-relay`)
— their `SUPABASE_URL` / service-key secrets via `wrangler secret put`.

---

## 5. Re-arm the background jobs

The scheduled work doesn't come across in a dump. After cutover:

- **pulse-cron worker** — already the universal scheduler; it just needs the new
  URL and service key. It drives snapshot ingestion, `cleanup_pulse_signals`,
  `cleanup_bus_sightings` and `cleanup_rider_fixes`.
- **Auth redirect URLs** — `SITE_URL` and `ADDITIONAL_REDIRECT_URLS` in `.env`
  must list every origin the app is served from, including the `aloya://` deep
  link, or mobile sign-in bounces.
- **Anonymous sign-in** — `GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=true` is set
  in compose. If it's off, the app can't boot for new riders.

---

## 6. Backups (do not skip)

Self-hosting means nobody else is taking snapshots. Nightly dump to R2:

```bash
docker exec aloya-supabase-db-1 pg_dump -U postgres postgres | gzip \
  > /backups/aloya-$(date +%F).sql.gz
rclone copy /backups r2:aloya-backups --max-age 24h
```

Put that in cron, keep 30 days, and **restore-test it once** before you trust
it. An untested backup is not a backup.

---

## Cutover order

1. Deploy the stack, verify health endpoints.
2. Run `migrate.sh` and `copy-storage.ts` — the source stays untouched.
3. Verify in Studio: rider count matches, policies present, `pulse_hour_strip()`
   returns rows.
4. Swap the app secrets, redeploy.
5. Watch sign-in, trip planning and the Pulse card for 10 minutes.
6. Re-run `migrate.sh` for anything written to the old project in between, then
   retire it.
