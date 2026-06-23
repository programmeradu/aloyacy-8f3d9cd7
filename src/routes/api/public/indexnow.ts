import { createFileRoute } from "@tanstack/react-router";
import { indexNowPayload, pingIndexNow, INDEXNOW_HOST } from "@/lib/indexnow";

// GET  /api/public/indexnow  → preview payload (debug)
// POST /api/public/indexnow  → submit URLs to IndexNow
//
// Auto-pinged once per Worker cold start from src/start.ts so every fresh
// deploy notifies Bing/Yandex without manual action. Also safe to call
// manually or from cron with `curl -X POST https://app.aloya.cy/api/public/indexnow`.
export const Route = createFileRoute("/api/public/indexnow")({
  server: {
    handlers: {
      GET: async () => Response.json(indexNowPayload(INDEXNOW_HOST)),
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const host = url.searchParams.get("host") || INDEXNOW_HOST;
        const result = await pingIndexNow(host);
        return Response.json(result, { status: result.ok ? 200 : 502 });
      },
    },
  },
});
