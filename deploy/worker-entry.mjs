// Aloya Worker entry (D1 build). Exports both handlers of the app server:
//   fetch      — the TanStack Start app (dist/server/server.js)
//   scheduled  — cron dispatcher (src/lib/cron-schedule.ts, bundled into
//                server.js). Maps the 5 triggers
//                  "* * * * *"     snapshot, trip-alerts (+ even minutes:
//                                  departure-tick, arrival-watch-tick, resolve-arrivals)
//                  "*/15 * * * *"  train?mode=fast, archive-lake
//                  "*/30 * * * *"  pulse-weather/marine/air/traffic/flights
//                  "17 * * * *"    pulse-news, email queue
//                  "0 3 * * *"     ingest-schedule, pulse-events/cruises/football/
//                                  met-warnings, train?mode=full, archive-lake,
//                                  eta-backtest, device-reputation, ping-gap-compute
//                and POSTs each hook to the fetch handler in-process as
//                https://app.aloya.cy/<path> with Authorization: Bearer ${CRON_SECRET},
//                via ctx.waitUntil + Promise.allSettled.
import server from "../dist/server/server.js";

export default {
  fetch: (req, env, ctx) => server.fetch(req, env, ctx),
  scheduled: (event, env, ctx) => {
    if (typeof server.scheduled !== "function") {
      throw new Error("dist/server/server.js has no scheduled(); rebuild from feat/cloudflare-d1");
    }
    return server.scheduled(event, env, ctx);
  },
};
