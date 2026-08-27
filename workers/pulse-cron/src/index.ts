// Aloya scheduler — owns every background job that used to run from pg_cron
// inside the Lovable-managed Supabase project. Runs on the user's own
// Cloudflare account, hits the published app's public hook endpoints, which
// in turn write to the self-hosted Supabase project.
//
// Auth: every hook accepts the project anon key in the `apikey` header;
// snapshot / trip-alerts additionally accept `Authorization: Bearer <CRON_SECRET>`.
//
// Cron triggers (see wrangler.jsonc) — 5 total, the per-worker maximum:
//   * * * * *      minute loop  (snapshot, trip-alerts, departure-tick on even minutes)
//   */15 * * * *   training fast roll-up
//   */30 * * * *   live environment feeds (weather, marine, air, traffic, flights)
//   17 * * * *     hourly news rotator
//   0 3 * * *      nightly: schedule ingest, scrapes, full training roll-up, R2 data lake archive
//
// The job table and scheduling rules live in ./jobs so they stay testable.
import { type Env, type Job, JOB_GROUPS, headersFor, originOf, planFor } from "./jobs";

export type { Env };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function archiveLakeDirect(env: Env): Promise<{ ok: boolean; archived: Record<string, number>; error?: string }> {
  if (!env.DATA_LAKE) {
    return { ok: false, archived: {}, error: "Missing DATA_LAKE R2 binding" };
  }
  const baseUrl = env.CUSTOM_SUPABASE_URL;
  const serviceKey = env.CUSTOM_SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceKey) {
    return { ok: false, archived: {}, error: "Missing Supabase URL or Service Role Key" };
  }

  // Windows are in MINUTES and must stay shorter than each table's Postgres
  // TTL (rt_snapshots: 30 min, observed_arrivals: 2 days), otherwise rows are
  // purged before they are ever archived and the lake stays empty.
  const tables = [
    { name: "rt_snapshots", timeColumn: "captured_at", minutes: 10 },
    { name: "observed_arrivals", timeColumn: "last_seen_at", minutes: 24 * 60 },
  ];

  const headers: Record<string, string> = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const archived: Record<string, number> = {};

  for (const { name, timeColumn, minutes } of tables) {
    const dateThreshold = new Date(Date.now() - minutes * 60_000);
    const cutoff = dateThreshold.toISOString();

    let total = 0;
    while (true) {
      const fetchUrl = `${baseUrl}/rest/v1/${name}?${timeColumn}=lt.${cutoff}&limit=5000`;
      const res = await fetch(fetchUrl, { headers });
      if (!res.ok) {
        console.error(`[cron] archive-lake fetch ${name} failed: ${res.status}`);
        break;
      }
      const data = (await res.json()) as Array<Record<string, unknown>>;
      if (!data || data.length === 0) break;

      const jsonl = data.map((row) => JSON.stringify(row)).join("\n");
      const timestamp = Date.now();
      const objectKey = `${name}/${dateThreshold.toISOString().split("T")[0]}/${timestamp}.jsonl`;

      await env.DATA_LAKE.put(objectKey, jsonl);

      const ids = data.map((row) => row.id).filter(Boolean);
      if (ids.length > 0) {
        const delUrl = `${baseUrl}/rest/v1/${name}?id=in.(${ids.join(",")})`;
        await fetch(delUrl, { method: "DELETE", headers });
      } else {
        const delUrl = `${baseUrl}/rest/v1/${name}?${timeColumn}=lt.${cutoff}`;
        await fetch(delUrl, { method: "DELETE", headers });
        total += data.length;
        break;
      }

      total += data.length;
      if (data.length < 5000) break;
    }
    archived[name] = total;
  }

  console.log(`[cron] archive-lake ok: ${JSON.stringify(archived)}`);
  return { ok: true, archived };
}

/** Jobs run one at a time with a short stagger — see planFor() for why. */
async function run(env: Env, jobs: Job[], staggerMs = 5000): Promise<void> {
  const origin = originOf(env);
  const headers = headersFor(env);

  for (let i = 0; i < jobs.length; i++) {
    const { path, label } = jobs[i]!;
    if (i > 0) await sleep(staggerMs);

    // Direct R2 archival execution
    if (label === "archive-lake" && env.DATA_LAKE) {
      try {
        await archiveLakeDirect(env);
        continue;
      } catch (e) {
        console.error(`[cron] archive-lake direct threw:`, e instanceof Error ? e.message : e);
      }
    }

    const url = `${origin}${path}`;
    try {
      const res = await fetch(url, { method: "POST", headers, body: "{}" });
      const text = await res.text();
      if (!res.ok) {
        console.error(`[cron] ${label} failed ${res.status}: ${text.slice(0, 300)}`);
      } else {
        console.log(`[cron] ${label} ok: ${text.slice(0, 200)}`);
      }
    } catch (e) {
      console.error(`[cron] ${label} threw:`, e instanceof Error ? e.message : e);
    }
  }
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    const cron = (event as ScheduledEvent & { cron?: string }).cron ?? "* * * * *";
    const { jobs, staggerMs } = planFor(cron, event.scheduledTime);
    return run(env, jobs, staggerMs);
  },

  // Manual trigger for debugging: GET /?group=nightly or GET /?group=archive
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const group = url.searchParams.get("group") ?? "minute";
    if (group === "archive") {
      const res = await archiveLakeDirect(env);
      return new Response(JSON.stringify(res, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }
    const secret = url.searchParams.get("secret");
    if (env.CRON_SECRET && secret !== env.CRON_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
    const jobs = JOB_GROUPS[group];
    if (!jobs) return new Response("Unknown group", { status: 400 });
    await run(env, jobs);
    return new Response(`ran ${group}: ${jobs.map((j) => j.label).join(", ")}\n`);
  },
};
