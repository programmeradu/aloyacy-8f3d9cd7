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
//   0 3 * * *      nightly: schedule ingest, scrapes, full training roll-up
//
// The job table and scheduling rules live in ./jobs so they stay testable.
import { type Env, type Job, JOB_GROUPS, headersFor, originOf, planFor } from "./jobs";

export type { Env };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Jobs run one at a time with a short stagger — see planFor() for why. */
async function run(env: Env, jobs: Job[], staggerMs = 5000): Promise<void> {
  const origin = originOf(env);
  const headers = headersFor(env);

  for (let i = 0; i < jobs.length; i++) {
    const { path, label } = jobs[i]!;
    if (i > 0) await sleep(staggerMs);
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

  // Manual trigger for debugging: GET /?group=nightly (requires CRON_SECRET).
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const secret = url.searchParams.get("secret");
    if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
    const group = url.searchParams.get("group") ?? "minute";
    const jobs = JOB_GROUPS[group];
    if (!jobs) return new Response("Unknown group", { status: 400 });
    await run(env, jobs);
    return new Response(`ran ${group}: ${jobs.map((j) => j.label).join(", ")}\n`);
  },
};
