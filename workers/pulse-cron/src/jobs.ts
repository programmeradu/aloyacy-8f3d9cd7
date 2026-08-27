/**
 * Job table and scheduling rules for the Aloya cron worker.
 *
 * Kept separate from the worker entry so the routing decisions — which jobs a
 * given cron expression fires, how requests are addressed and authenticated —
 * can be tested without a Cloudflare runtime.
 */

export interface Env {
  /** Origin of the published app, e.g. https://app.aloya.cy */
  APP_ORIGIN?: string;
  /** Legacy single-target var, kept so existing deployments keep working. */
  TARGET_URL?: string;
  CUSTOM_SUPABASE_URL?: string;
  CUSTOM_SUPABASE_ANON_KEY?: string;
  CUSTOM_SUPABASE_SERVICE_ROLE_KEY?: string;
  CRON_SECRET?: string;
  DATA_LAKE?: any; // R2Bucket binding
}

export type Job = { path: string; label: string };

export const MINUTE_JOBS: Job[] = [
  { path: "/api/public/snapshot", label: "snapshot" },
  { path: "/api/public/trip-alerts", label: "trip-alerts" },
];

export const EVEN_MINUTE_JOBS: Job[] = [
  { path: "/api/public/hooks/departure-tick", label: "departure-tick" },
  // Arrival promises re-plan and nudge on a 2-minute cadence; the hook holds
  // its own single-flight lease, so an overlapping tick is a no-op.
  { path: "/api/public/hooks/arrival-watch-tick", label: "arrival-watch" },
];

export const QUARTER_HOUR_JOBS: Job[] = [
  { path: "/api/public/hooks/train?mode=fast", label: "train-fast" },
  // rt_snapshots is purged 30 minutes after capture, so the archiver has to
  // run well inside that window — hourly meant most rows were deleted before
  // they ever reached the data lake.
  { path: "/api/public/hooks/archive-lake", label: "archive-lake" },
];

export const HALF_HOUR_JOBS: Job[] = [
  { path: "/api/public/hooks/pulse-weather", label: "pulse-weather" },
  { path: "/api/public/hooks/pulse-marine", label: "pulse-marine" },
  { path: "/api/public/hooks/pulse-air", label: "pulse-air" },
  { path: "/api/public/hooks/pulse-traffic", label: "pulse-traffic" },
  { path: "/api/public/hooks/pulse-flights", label: "pulse-flights" },
];

export const HOURLY_JOBS: Job[] = [
  { path: "/api/public/hooks/pulse-news", label: "pulse-news" },
  { path: "/lovable/email/queue/process", label: "email-queue" },
  // archive-lake moved to the 15-minute group; see QUARTER_HOUR_JOBS.
];

export const NIGHTLY_JOBS: Job[] = [
  { path: "/api/public/hooks/ingest-schedule", label: "ingest-schedule" },
  { path: "/api/public/hooks/pulse-events", label: "pulse-events" },
  { path: "/api/public/hooks/pulse-cruises", label: "pulse-cruises" },
  { path: "/api/public/hooks/pulse-football", label: "pulse-football" },
  { path: "/api/public/hooks/pulse-met-warnings", label: "pulse-met-warnings" },
  { path: "/api/public/hooks/train?mode=full", label: "train-full" },
  { path: "/api/public/hooks/archive-lake", label: "archive-lake" },
];

/** Manual-trigger groups exposed by `GET /?group=...`. */
export const JOB_GROUPS: Record<string, Job[]> = {
  minute: [...MINUTE_JOBS, ...EVEN_MINUTE_JOBS],
  quarter: QUARTER_HOUR_JOBS,
  half: HALF_HOUR_JOBS,
  hourly: HOURLY_JOBS,
  nightly: NIGHTLY_JOBS,
};

export function originOf(env: Env): string {
  if (env.APP_ORIGIN) return env.APP_ORIGIN.replace(/\/+$/, "");
  if (env.TARGET_URL) return new URL(env.TARGET_URL).origin;
  return "https://app.aloya.cy";
}

export function headersFor(env: Env): Headers {
  const h = new Headers({ "Content-Type": "application/json" });
  if (env.CRON_SECRET) {
    h.set("Authorization", `Bearer ${env.CRON_SECRET}`);
    h.set("x-cron-secret", env.CRON_SECRET);
  }
  if (env.CUSTOM_SUPABASE_ANON_KEY) h.set("apikey", env.CUSTOM_SUPABASE_ANON_KEY);
  return h;
}

/**
 * Which jobs a scheduled event fires, and how far apart. Heavier groups get a
 * longer stagger: firing them together made several hooks share one app worker
 * instance, which ran out of memory and returned 502s.
 */
export function planFor(cron: string, scheduledTime: number): { jobs: Job[]; staggerMs: number } {
  if (cron === "*/15 * * * *") return { jobs: QUARTER_HOUR_JOBS, staggerMs: 10_000 };
  if (cron === "*/30 * * * *") return { jobs: HALF_HOUR_JOBS, staggerMs: 15_000 };
  if (cron === "17 * * * *") return { jobs: HOURLY_JOBS, staggerMs: 15_000 };
  if (cron === "0 3 * * *" || cron === "17 9 * * *") return { jobs: NIGHTLY_JOBS, staggerMs: 60_000 };

  // Default: the every-minute loop — must finish well inside 60s.
  const minute = new Date(scheduledTime).getUTCMinutes();
  const jobs = minute % 2 === 0 ? [...MINUTE_JOBS, ...EVEN_MINUTE_JOBS] : MINUTE_JOBS;
  return { jobs, staggerMs: 3000 };
}
