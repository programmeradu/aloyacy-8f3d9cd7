import { createFileRoute } from "@tanstack/react-router";
import { computeAndStoreThresholds } from "@/lib/ping-gap-compute.server";
import { createLogger } from "@/lib/logger";

const log = createLogger("hook-ping-gap");

export const Route = (createFileRoute as any)("/api/public/hooks/ping-gap-compute")({
  server: {
    handlers: {
      GET: async () => {
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
      },
    },
  },
});

