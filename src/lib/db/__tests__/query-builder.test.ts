import { beforeEach, describe, expect, it } from "vitest";
import { createDbClient, type DbClient } from "../index";
import { createTestD1 } from "./sqlite-d1";

let db: DbClient;
beforeEach(() => {
  const d1 = createTestD1();
  db = createDbClient(() => d1);
});

describe("D1 query builder", () => {
  it("inserts with defaults, maps json/bool, returns rows", async () => {
    const { data, error } = await db
      .from("trip_groups")
      .insert({ code: "ABCD", destination_label: "Mall", destination_lat: 35.1, destination_lng: 33.3 })
      .select("id, code, expires_at")
      .single();
    expect(error).toBeNull();
    expect(data.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(data.expires_at > new Date().toISOString()).toBe(true);

    const m = await db
      .from("trip_group_members")
      .insert({ group_id: data.id, member_token: "t1", display_name: "Sam", is_creator: true })
      .select()
      .single();
    expect(m.error).toBeNull();
    expect(m.data.is_creator).toBe(true);

    const view = await db.rpc("get_trip_group_view", { p_code: "abcd", p_member_token: "t1" });
    expect(view.error).toBeNull();
    expect(view.data.me_id).toBe(m.data.id);
    expect(view.data.members[0].is_creator).toBe(true);
  });

  it("filters, orders, ranges, counts, single semantics", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      device_id: `d${i % 3}`,
      kind: i % 2 ? "a" : "b",
      payload: { i },
      recorded_at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
    }));
    expect((await db.from("training_events").insert(rows)).error).toBeNull();
    const r = await db
      .from("training_events")
      .select("id, payload, device_id")
      .in("device_id", ["d0", "d1"])
      .eq("kind", "a")
      .gte("recorded_at", "2026-10-01T00:05:00+00:00")
      .order("recorded_at", { ascending: false })
      .range(0, 3);
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(4);
    expect(typeof r.data[0].payload.i).toBe("number");
    const c = await db.from("training_events").select("id", { count: "exact", head: true }).is("processed_at", null);
    expect(c.count).toBe(30);
    const none = await db.from("training_events").select("*").eq("kind", "zzz").maybeSingle();
    expect(none).toMatchObject({ data: null, error: null });
    const many = await db.from("training_events").select("*").eq("kind", "a").single();
    expect(many.error?.code).toBe("PGRST116");
    const or = await db.from("training_events").select("id").or("kind.eq.a,device_id.eq.d0");
    expect(or.data.length).toBe(20);
    const nt = await db.from("training_events").select("id").not("processed_at", "is", null);
    expect(nt.data).toHaveLength(0);
  });

  it("upserts on pk and on explicit conflict columns, updates and deletes", async () => {
    const base = { route_id: "r", stop_id: "s", hour_of_day: 8, day_of_week: 1 };
    await db.from("delay_stats").upsert({ ...base, mean_delay_sec: 10, sample_count: 1 });
    await db.from("delay_stats").upsert({ ...base, mean_delay_sec: 20, sample_count: 2 });
    const s = await db.from("delay_stats").select("*").match(base).single();
    expect(s.data).toMatchObject({ mean_delay_sec: 20, sample_count: 2 });

    await db.from("pulse_signals").upsert({ key: "k", scope: "island", source: "x", payload: { a: 1 } }, { onConflict: "key,scope" });
    await db.from("pulse_signals").upsert({ key: "k", scope: "island", source: "y", payload: { a: 2 } }, { onConflict: "key,scope" });
    const p = await db.from("pulse_signals").select("source, payload");
    expect(p.data).toEqual([{ source: "y", payload: { a: 2 } }]);

    const u = await db.from("pulse_signals").update({ source: "z" }).eq("key", "k").select("source");
    expect(u.data).toEqual([{ source: "z" }]);
    const bad = await db.from("pulse_signals").delete();
    expect(bad.error).not.toBeNull();
    await db.from("pulse_signals").delete().eq("key", "k");
    expect((await db.from("pulse_signals").select("*")).data).toEqual([]);

    // partial unique index (home/work) upsert
    const place = { user_id: "u1", kind: "home", label: "Home", lat: 35, lng: 33 };
    expect((await db.from("saved_places").upsert(place, { onConflict: "user_id,kind" })).error).toBeNull();
    expect((await db.from("saved_places").upsert({ ...place, label: "New" }, { onConflict: "user_id,kind" })).error).toBeNull();
    expect((await db.from("saved_places").select("label")).data).toEqual([{ label: "New" }]);
  });

  it("chunks big inserts under the 100-parameter cap and maps unique violations", async () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({
      trip_id: `t${i}`, stop_id: "s", route_id: "r", predicted_arrival: new Date().toISOString(),
    }));
    expect((await db.from("rt_snapshots").insert(rows)).error).toBeNull();
    const dup = await db.from("rt_snapshots").insert(rows[0]!);
    expect(dup.error?.code).toBe("23505");
    const c = await db.from("rt_snapshots").select("id", { count: "exact", head: true });
    expect(c.count).toBe(250);
  });

  it("ports job lease and email queue rpcs", async () => {
    expect((await db.rpc("claim_job_lease", { p_job: "j", p_holder: "a" })).data).toBe(true);
    expect((await db.rpc("claim_job_lease", { p_job: "j", p_holder: "b" })).data).toBe(false);
    await db.rpc("release_job_lease", { p_job: "j", p_holder: "a" });
    expect((await db.rpc("claim_job_lease", { p_job: "j", p_holder: "b" })).data).toBe(true);

    await db.rpc("enqueue_email", { queue_name: "auth_emails", payload: { to: "x@y.z" } });
    const b1 = await db.rpc("read_email_batch", { queue_name: "auth_emails", batch_size: 5, vt: 30 });
    expect(b1.data).toHaveLength(1);
    expect(b1.data[0].message.to).toBe("x@y.z");
    const b2 = await db.rpc("read_email_batch", { queue_name: "auth_emails", batch_size: 5, vt: 30 });
    expect(b2.data).toHaveLength(0);
    await db.rpc("move_to_dlq", { source_queue: "auth_emails", dlq_name: "auth_emails_dlq", message_id: b1.data[0].msg_id, payload: {} });
    expect((await db.rpc("delete_email", { queue_name: "auth_emails", message_id: b1.data[0].msg_id })).data).toBe(false);
  });
});
