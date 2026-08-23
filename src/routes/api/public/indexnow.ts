import { createFileRoute } from "@tanstack/react-router";
import { indexNowPayload, pingIndexNow, INDEXNOW_HOST } from "@/lib/indexnow";
import { parseQuery, readJsonBody, readQuery, readJsonInput, zodDetails, invalidRequest, badRequest } from "@/lib/http/validate";
import { IndexNowQuerySchema } from "@/lib/schemas/public-api";

// GET  /api/public/indexnow  → preview payload (debug)
// POST /api/public/indexnow  → submit URLs to IndexNow
//
// Auto-pinged once per Worker cold start from src/start.ts so every fresh
// deploy notifies Bing/Yandex without manual action. Also safe to call
// manually or from cron with `curl -X POST https://app.aloya.cy/api/public/indexnow`.
//
// `host` is validated as a bare hostname: it is echoed into the submitted
// payload, so a full URL or path fragment must never slip through.
export const Route = createFileRoute("/api/public/indexnow")({
  server: {
    handlers: {
      GET: async () => Response.json(indexNowPayload(INDEXNOW_HOST)),
      POST: async ({ request }) => {
        const __query = readQuery(new URL(request.url));
          const parsed = IndexNowQuerySchema.safeParse(__query);
          if (!parsed.success) return badRequest("Invalid request", zodDetails(parsed.error));

        const result = await pingIndexNow(parsed.data.host || INDEXNOW_HOST);
        return Response.json(result, { status: result.ok ? 200 : 502 });
      },
    },
  },
});
