// Cron dispatcher for the single Aloya Worker (replaces pg_cron and the
// separate workers/pulse-cron scheduler).
//
// wrangler `triggers.crons` must list exactly CRON_TRIGGERS. On each
// scheduled event the matching job group is fired by calling the app's own
// fetch handler in-process (no network hop, no extra Worker), with
// `Authorization: Bearer ${CRON_SECRET}`; the hooks verify that secret via
// src/lib/cron-auth.server.ts and refuse everything when it is unset.
//
// Kept free of runtime imports so it can be unit-tested.

export type CronJob = { path: string; label: string };

export const CRON_TRIGGERS = [
  "* * * * *",
  "*/15 * * * *",
  "*/30 * * * *",
  "17 * * * *",
  "0 3 * * *",
] as const;

/** Every minute. */
export const MINUTE_JOBS: CronJob[] = [
  { path: "/api/public/snapshot", label: "snapshot" },
  { path: "/api/public/trip-alerts", label: "trip-alerts" },
];

/** Even minutes only (added to MINUTE_JOBS). */
export const EVEN_MINUTE_JOBS: CronJob[] = [
  { path: "/api/public/hooks/departure-tick", label: "departure-tick" },
  { path: "/api/public/hooks/arrival-watch-tick", label: "arrival-watch-tick" },
  { path: "/api/public/hooks/resolve-arrivals", label: "resolve-arrivals" },
];

/** Every 15 minutes. */
export const QUARTER_HOUR_JOBS: CronJob[] = [
  { path: "/api/public/hooks/train?mode=fast", label: "train-fast" },
  { path: "/api/public/hooks/archive-lake", label: "archive-lake" },
];

/** Every 30 minutes. */
export const HALF_HOUR_JOBS: CronJob[] = [
  { path: "/api/public/hooks/pulse-weather", label: "pulse-weather" },
  { path: "/api/public/hooks/pulse-marine", label: "pulse-marine" },
  { path: "/api/public/hooks/pulse-air", label: "pulse-air" },
  { path: "/api/public/hooks/pulse-traffic", label: "pulse-traffic" },
  { path: "/api/public/hooks/pulse-flights", label: "pulse-flights" },
];

/** Hourly at :17. */
export const HOURLY_JOBS: CronJob[] = [
  { path: "/api/public/hooks/pulse-news", label: "pulse-news" },
  { path: "/lovable/email/queue/process", label: "email-queue" },
];

/** Nightly at 03:00 UTC. */
export const NIGHTLY_JOBS: CronJob[] = [
  { path: "/api/public/hooks/ingest-schedule", label: "ingest-schedule" },
  { path: "/api/public/hooks/pulse-events", label: "pulse-events" },
  { path: "/api/public/hooks/pulse-cruises", label: "pulse-cruises" },
  { path: "/api/public/hooks/pulse-football", label: "pulse-football" },
  { path: "/api/public/hooks/pulse-met-warnings", label: "pulse-met-warnings" },
  { path: "/api/public/hooks/train?mode=full", label: "train-full" },
  { path: "/api/public/hooks/archive-lake", label: "archive-lake" },
  { path: "/api/public/hooks/eta-backtest", label: "eta-backtest" },
  { path: "/api/public/hooks/device-reputation", label: "device-reputation" },
  { path: "/api/public/hooks/ping-gap-compute", label: "ping-gap-compute" },
];

export const CRON_ORIGIN = "https://app.aloya.cy";

/** Which jobs a scheduled event fires. Unknown expressions fire nothing. */
export function jobsFor(cron: string, scheduledTime: number): CronJob[] {
  switch (cron) {
    case "* * * * *": {
      const minute = new Date(scheduledTime).getUTCMinutes();
      return minute % 2 === 0 ? [...MINUTE_JOBS, ...EVEN_MINUTE_JOBS] : [...MINUTE_JOBS];
    }
    case "*/15 * * * *":
      return [...QUARTER_HOUR_JOBS];
    case "*/30 * * * *":
      return [...HALF_HOUR_JOBS];
    case "17 * * * *":
      return [...HOURLY_JOBS];
    case "0 3 * * *":
      return [...NIGHTLY_JOBS];
    default:
      return [];
  }
}

export function cronRequest(job: CronJob, secret: string, origin = CRON_ORIGIN): Request {
  return new Request(`${origin}${job.path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
      "User-Agent": "aloya-cron",
    },
    body: "{}",
  });
}

type FetchFn = (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
type Ctx = { waitUntil(p: Promise<unknown>): void };
export type CronOutcome = { label: string; status: number | null; ok: boolean; error?: string };

/**
 * Fire the jobs for one scheduled event through `fetchFn` (the app's own
 * fetch handler). Returns the settled outcomes; the same promise is also
 * handed to ctx.waitUntil so the runtime keeps the invocation alive.
 */
export function runScheduled(
  fetchFn: FetchFn,
  event: { cron: string; scheduledTime: number },
  env: Record<string, unknown> | undefined,
  ctx: Ctx | undefined,
): Promise<CronOutcome[]> {
  const secret = typeof env?.CRON_SECRET === "string" ? env.CRON_SECRET : "";
  const jobs = jobsFor(event.cron, event.scheduledTime);
  if (!secret) {
    console.error(JSON.stringify({ scope: "cron", level: "error", msg: "CRON_SECRET unset; skipping", cron: event.cron }));
    return Promise.resolve([]);
  }
  const work = Promise.allSettled(
    jobs.map(async (job) => {
      const res = await fetchFn(cronRequest(job, secret), env, ctx);
      const body = await res.text().catch(() => "");
      if (!res.ok) throw Object.assign(new Error(`${res.status}: ${body.slice(0, 200)}`), { status: res.status });
      return res.status;
    }),
  ).then((settled) =>
    settled.map((s, i): CronOutcome => {
      const label = jobs[i]!.label;
      if (s.status === "fulfilled") return { label, status: s.value, ok: true };
      const err = s.reason as Error & { status?: number };
      return { label, status: err?.status ?? null, ok: false, error: err?.message ?? String(err) };
    }),
  ).then((outcomes) => {
    console.log(JSON.stringify({ scope: "cron", level: "info", cron: event.cron, outcomes }));
    return outcomes;
  });
  ctx?.waitUntil(work);
  return work;
}
