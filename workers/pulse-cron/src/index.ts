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

export interface Env {
  /** Origin of the published app, e.g. https://app.aloya.cy */
  APP_ORIGIN?: string;
  /** Legacy single-target var, kept so existing deployments keep working. */
  TARGET_URL?: string;
  CUSTOM_SUPABASE_ANON_KEY?: string;
  CRON_SECRET?: string;
}

type Job = { path: string; label: string };

const MINUTE_JOBS: Job[] = [
  { path: "/api/public/snapshot", label: "snapshot" },
  { path: "/api/public/trip-alerts", label: "trip-alerts" },
];

const EVEN_MINUTE_JOBS: Job[] = [
  { path: "/api/public/hooks/departure-tick", label: "departure-tick" },
];

const QUARTER_HOUR_JOBS: Job[] = [
  { path: "/api/public/hooks/train?mode=fast", label: "train-fast" },
];

const HALF_HOUR_JOBS: Job[] = [
  { path: "/api/public/hooks/pulse-weather", label: "pulse-weather" },
  { path: "/api/public/hooks/pulse-marine", label: "pulse-marine" },
  { path: "/api/public/hooks/pulse-air", label: "pulse-air" },
  { path: "/api/public/hooks/pulse-traffic", label: "pulse-traffic" },
  { path: "/api/public/hooks/pulse-flights", label: "pulse-flights" },
];

const HOURLY_JOBS: Job[] = [
  { path: "/api/public/hooks/pulse-news", label: "pulse-news" },
  { path: "/lovable/email/queue/process", label: "email-queue" },
];

const NIGHTLY_JOBS: Job[] = [
  { path: "/api/public/hooks/ingest-schedule", label: "ingest-schedule" },
  { path: "/api/public/hooks/pulse-events", label: "pulse-events" },
  { path: "/api/public/hooks/pulse-cruises", label: "pulse-cruises" },
  { path: "/api/public/hooks/pulse-football", label: "pulse-football" },
  { path: "/api/public/hooks/pulse-met-warnings", label: "pulse-met-warnings" },
  { path: "/api/public/hooks/train?mode=full", label: "train-full" },
];

function originOf(env: Env): string {
  if (env.APP_ORIGIN) return env.APP_ORIGIN.replace(/\/+$/, "");
  if (env.TARGET_URL) return new URL(env.TARGET_URL).origin;
  return "https://app.aloya.cy";
}

function headersFor(env: Env): Headers {
  const h = new Headers({ "Content-Type": "application/json" });
  if (env.CRON_SECRET) {
    h.set("Authorization", `Bearer ${env.CRON_SECRET}`);
    h.set("x-cron-secret", env.CRON_SECRET);
  }
  if (env.CUSTOM_SUPABASE_ANON_KEY) h.set("apikey", env.CUSTOM_SUPABASE_ANON_KEY);
  return h;
}

async function run(env: Env, jobs: Job[]): Promise<void> {
  const origin = originOf(env);
  const headers = headersFor(env);
  await Promise.all(
    jobs.map(async ({ path, label }) => {
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
    }),
  );
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    const cron = (event as ScheduledEvent & { cron?: string }).cron ?? "* * * * *";
    const minute = new Date(event.scheduledTime).getUTCMinutes();

    if (cron === "*/15 * * * *") return run(env, QUARTER_HOUR_JOBS);
    if (cron === "*/30 * * * *") return run(env, HALF_HOUR_JOBS);
    if (cron === "17 * * * *") return run(env, HOURLY_JOBS);
    if (cron === "0 3 * * *") return run(env, NIGHTLY_JOBS);

    // Default: the every-minute loop.
    const jobs = minute % 2 === 0 ? [...MINUTE_JOBS, ...EVEN_MINUTE_JOBS] : MINUTE_JOBS;
    return run(env, jobs);
  },

  // Manual trigger for debugging: GET /?group=nightly (requires CRON_SECRET).
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const secret = url.searchParams.get("secret");
    if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
    const group = url.searchParams.get("group") ?? "minute";
    const map: Record<string, Job[]> = {
      minute: [...MINUTE_JOBS, ...EVEN_MINUTE_JOBS],
      quarter: QUARTER_HOUR_JOBS,
      half: HALF_HOUR_JOBS,
      hourly: HOURLY_JOBS,
      nightly: NIGHTLY_JOBS,
    };
    const jobs = map[group];
    if (!jobs) return new Response("Unknown group", { status: 400 });
    await run(env, jobs);
    return new Response(`ran ${group}: ${jobs.map((j) => j.label).join(", ")}\n`);
  },
};
