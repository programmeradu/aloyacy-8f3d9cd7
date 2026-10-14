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

  // Group page payload: group + members (+ me_id when the caller's member token matches).
  async get_trip_group_view(db, { p_code, p_member_token }) {
    if (!p_code || String(p_code).length < 4) return null;
    const g = await db
      .prepare(`SELECT * FROM trip_groups WHERE code = ? AND expires_at > ? LIMIT 1`)
      .bind(String(p_code).toUpperCase(), iso())
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
        `SELECT id, group_id, display_name, origin_label, last_lat, last_lng, last_updated,
                eta_minutes, status, is_creator, joined_at
           FROM trip_group_members WHERE group_id = ? ORDER BY joined_at ASC`,
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
      me_id: meId,
      members: (members.results ?? []).map((m) => fromDbRow(meta, m)),
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
