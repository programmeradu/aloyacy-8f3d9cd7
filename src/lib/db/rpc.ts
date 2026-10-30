// TypeScript ports of the Postgres functions the app calls through
// supabase.rpc(). Each returns the same JSON the SQL function returned.

import type { D1Database } from "./d1";
import { dbError, fromDbRow, metaFor, type DbResult } from "./query-builder";

type RpcFn = (db: D1Database, args: Record<string, any>) => Promise<unknown>;

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

const RPCS: Record<string, RpcFn> = {
  // Public read of a live ETA share; null when missing or expired.
  async get_shared_trip_view(db, { p_token }) {
    const row = await db
      .prepare(
        `SELECT id, token, origin_label, destination_label, destination_lat, destination_lng,
                last_lat, last_lng, last_updated, eta_minutes, status, created_at, expires_at
           FROM shared_trips WHERE token = ? AND expires_at > ? LIMIT 1`,
      )
      .bind(String(p_token ?? ""), iso())
      .first();
    return row ?? null;
  },

  // Group page payload: group + members (+ me_id when the caller's member
  // token matches). Expired groups stay readable for 24 h with expired=true
  // (deploy/supabase/sql/20260817_group_view_grace.sql).
  async get_trip_group_view(db, { p_code, p_member_token }) {
    if (!p_code || String(p_code).length < 4) return null;
    const g = await db
      .prepare(`SELECT * FROM trip_groups WHERE code = ? AND expires_at > ? LIMIT 1`)
      .bind(String(p_code).toUpperCase(), iso(-24 * 3600_000))
      .first<Record<string, unknown>>();
    if (!g) return null;
    let meId: string | null = null;
    if (p_member_token) {
      const me = await db
        .prepare(`SELECT id FROM trip_group_members WHERE group_id = ? AND member_token = ?`)
        .bind(g.id, String(p_member_token))
        .first<{ id: string }>();
      meId = me?.id ?? null;
    }
    const members = await db
      .prepare(
        // SELECT * so the optional `mode` column (migration 0004) is read where it
        // exists without breaking databases that have not applied it yet.
        // Secrets (member_token, owner_id) are stripped below.
        `SELECT * FROM trip_group_members WHERE group_id = ? ORDER BY joined_at ASC`,
      )
      .bind(g.id)
      .all<Record<string, unknown>>();
    const meta = metaFor("trip_group_members");
    return {
      id: g.id,
      code: g.code,
      destination_label: g.destination_label,
      destination_lat: g.destination_lat,
      destination_lng: g.destination_lng,
      created_by_name: g.created_by_name,
      created_at: g.created_at,
      expires_at: g.expires_at,
      expired: String(g.expires_at) <= iso(),
      me_id: meId,
      members: (members.results ?? []).map((m) => {
        const { member_token: _t, owner_id: _o, ...pub } = m;
        return fromDbRow(meta, { ...pub, mode: pub.mode ?? null });
      }),
    };
  },

  // Single-flight lease: true when the caller now holds `p_job`.
  async claim_job_lease(db, { p_job, p_holder, p_ttl_seconds }) {
    const ttl = Number(p_ttl_seconds ?? 110);
    const now = iso();
    const row = await db
      .prepare(
        `INSERT INTO job_leases (job_name, holder, expires_at, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (job_name) DO UPDATE SET holder = excluded.holder,
           expires_at = excluded.expires_at, updated_at = excluded.updated_at
         WHERE job_leases.expires_at < ? AND job_leases.paused = 0
         RETURNING 1 AS took`,
      )
      .bind(String(p_job), String(p_holder), iso(ttl * 1000), now, now)
      .first<{ took: number }>();
    return !!row?.took;
  },

  async release_job_lease(db, { p_job, p_holder }) {
    await db
      .prepare(`UPDATE job_leases SET expires_at = ?, updated_at = ? WHERE job_name = ? AND holder = ?`)
      .bind(iso(-1000), iso(), String(p_job), String(p_holder))
      .run();
    return null;
  },

  async cleanup_bus_sightings(db) {
    await db.prepare(`DELETE FROM bus_sightings WHERE reported_at < ?`).bind(iso(-10 * 60_000)).run();
    return null;
  },

  async cleanup_rider_fixes(db) {
    await db.prepare(`DELETE FROM rider_vehicle_fixes WHERE reported_at < ?`).bind(iso(-5 * 60_000)).run();
    return null;
  },

  async cleanup_pulse_signals(db) {
    await db
      .prepare(`DELETE FROM pulse_signals WHERE fetched_at < ?`)
      .bind(iso(-7 * 24 * 3600_000))
      .run();
    return null;
  },

  // Island-wide delay by hour of day, from the delay_stats roll-up.
  async pulse_hour_strip(db) {
    const out = await db
      .prepare(
        `SELECT hour_of_day, SUM(sample_count) AS sample_count,
                SUM(mean_delay_sec * sample_count) * 1.0 / NULLIF(SUM(sample_count), 0) AS mean_delay_sec
           FROM delay_stats GROUP BY hour_of_day ORDER BY hour_of_day`,
      )
      .all();
    return out.results ?? [];
  },

  async pulse_route_stats(db) {
    const out = await db
      .prepare(
        `SELECT route_id, SUM(mean_delay_sec * sample_count) AS sum_delay_weighted,
                SUM(sample_count) AS sample_count
           FROM delay_stats WHERE sample_count >= 3 GROUP BY route_id`,
      )
      .all();
    return out.results ?? [];
  },

  // GTFS-RT ingest (deploy/supabase/sql/20260821_ingest_v2_and_retention.sql).
  // One statement per table over json_each(?) so a whole chunk costs a single
  // bound parameter and one D1 round trip (batched).
  async ingest_gtfs_snapshots_v2(db, { snapshots, observed, stats }) {
    const stmts = [];
    const now = iso();
    if (Array.isArray(snapshots) && snapshots.length) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO rt_snapshots (route_id, stop_id, trip_id, predicted_arrival, delay_sec, captured_at)
             SELECT json_extract(value,'$.route_id'), json_extract(value,'$.stop_id'), json_extract(value,'$.trip_id'),
                    json_extract(value,'$.predicted_arrival'), COALESCE(json_extract(value,'$.delay_sec'),0),
                    COALESCE(json_extract(value,'$.captured_at'), ?1)
               FROM json_each(?2) WHERE true
             ON CONFLICT (trip_id, stop_id) DO UPDATE SET route_id = excluded.route_id,
               predicted_arrival = excluded.predicted_arrival, delay_sec = excluded.delay_sec,
               captured_at = excluded.captured_at`,
          )
          .bind(now, JSON.stringify(snapshots)),
      );
    }
    if (Array.isArray(observed) && observed.length) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO observed_arrivals (trip_id, stop_id, route_id, last_predicted_arrival, last_delay_sec, last_seen_at)
             SELECT json_extract(value,'$.trip_id'), json_extract(value,'$.stop_id'), json_extract(value,'$.route_id'),
                    json_extract(value,'$.last_predicted_arrival'), COALESCE(json_extract(value,'$.last_delay_sec'),0),
                    COALESCE(json_extract(value,'$.last_seen_at'), ?1)
               FROM json_each(?2) WHERE true
             ON CONFLICT (trip_id, stop_id) DO UPDATE SET
               last_predicted_arrival = excluded.last_predicted_arrival,
               last_delay_sec = excluded.last_delay_sec, last_seen_at = excluded.last_seen_at`,
          )
          .bind(now, JSON.stringify(observed)),
      );
    }
    if (Array.isArray(stats) && stats.length) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO delay_stats (route_id, stop_id, hour_of_day, day_of_week, mean_delay_sec, sample_count, updated_at)
             SELECT json_extract(value,'$.route_id'), json_extract(value,'$.stop_id'),
                    json_extract(value,'$.hour_of_day'), json_extract(value,'$.day_of_week'),
                    CAST(json_extract(value,'$.sum_delay_sec') AS REAL) / MAX(json_extract(value,'$.count'), 1),
                    json_extract(value,'$.count'), ?1
               FROM json_each(?2) WHERE true
             ON CONFLICT (route_id, stop_id, hour_of_day, day_of_week) DO UPDATE SET
               mean_delay_sec = ((delay_stats.mean_delay_sec * delay_stats.sample_count)
                                 + (excluded.mean_delay_sec * excluded.sample_count))
                                / MAX(delay_stats.sample_count + excluded.sample_count, 1),
               sample_count = MIN(delay_stats.sample_count + excluded.sample_count, 100000),
               updated_at = excluded.updated_at`,
          )
          .bind(now, JSON.stringify(stats)),
      );
    }
    if (stmts.length) await db.batch(stmts);
    return null;
  },

  async ingest_gtfs_snapshots(db, args) {
    return RPCS.ingest_gtfs_snapshots_v2!(db, { ...args, stats: [] });
  },

  // ---- pgmq replacement (email queues) ------------------------------------
  async enqueue_email(db, { queue_name, payload }) {
    const row = await db
      .prepare(`INSERT INTO email_queue (queue_name, message, vt) VALUES (?, ?, 0) RETURNING msg_id`)
      .bind(String(queue_name), JSON.stringify(payload ?? {}))
      .first<{ msg_id: number }>();
    return row?.msg_id ?? null;
  },

  // Reads up to batch_size visible messages and hides them for `vt` seconds.
  async read_email_batch(db, { queue_name, batch_size, vt }) {
    const now = Date.now();
    const out = await db
      .prepare(
        `UPDATE email_queue SET read_ct = read_ct + 1, vt = ?
          WHERE msg_id IN (SELECT msg_id FROM email_queue WHERE queue_name = ? AND vt <= ?
                            ORDER BY msg_id LIMIT ?)
          RETURNING msg_id, read_ct, message, enqueued_at`,
      )
      .bind(now + Number(vt ?? 30) * 1000, String(queue_name), now, Number(batch_size ?? 10))
      .all<{ msg_id: number; read_ct: number; message: string; enqueued_at: string }>();
    return (out.results ?? [])
      .sort((a, b) => a.msg_id - b.msg_id)
      .map((r) => ({ ...r, message: safeJson(r.message) }));
  },

  async delete_email(db, { queue_name, message_id }) {
    const out = await db
      .prepare(`DELETE FROM email_queue WHERE queue_name = ? AND msg_id = ?`)
      .bind(String(queue_name), Number(message_id))
      .run();
    return (out.meta?.changes ?? 0) > 0;
  },

  async move_to_dlq(db, { source_queue, dlq_name, message_id, payload }) {
    const [ins] = await db.batch<{ msg_id: number }>([
      db
        .prepare(`INSERT INTO email_queue (queue_name, message, vt) VALUES (?, ?, 0) RETURNING msg_id`)
        .bind(String(dlq_name), JSON.stringify(payload ?? {})),
      db
        .prepare(`DELETE FROM email_queue WHERE queue_name = ? AND msg_id = ?`)
        .bind(String(source_queue), Number(message_id)),
    ]);
    return ins?.results?.[0]?.msg_id ?? null;
  },
};

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export async function callRpc(
  db: D1Database,
  name: string,
  args: Record<string, unknown> = {},
): Promise<DbResult<any>> {
  const fn = RPCS[name];
  if (!fn) {
    return {
      data: null,
      error: dbError(`Could not find the function public.${name}`, "PGRST202"),
      count: null,
      status: 404,
      statusText: "",
    };
  }
  try {
    const data = await fn(db, args ?? {});
    return { data, error: null, count: null, status: 200, statusText: "OK" };
  } catch (e) {
    return {
      data: null,
      error: dbError(e instanceof Error ? e.message : String(e), "D1_ERROR"),
      count: null,
      status: 400,
      statusText: "",
    };
  }
}

export const RPC_NAMES = Object.keys(RPCS);
