import { createFileRoute } from "@tanstack/react-router";
import { computeAndStoreThresholds } from "@/lib/ping-gap-compute.server";
import { createLogger } from "@/lib/logger";
import { cronGuard } from "@/lib/cron-auth.server";

const log = createLogger("hook-ping-gap");

async function run(): Promise<Response> {
  log.info("A4: Triggered ping gap computation hook");
  try {
    await computeAndStoreThresholds();
    return Response.json({ ok: true });
  } catch (err) {
    log.error("Failed to compute ping gap thresholds", {
      err: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export const Route = (createFileRoute as any)("/api/public/hooks/ping-gap-compute")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => cronGuard(request) ?? run(),
      POST: async ({ request }: { request: Request }) => cronGuard(request) ?? run(),
    },
  },
});

