// Integration guard: asserts that server errors in API routes or unhandled
// requests route cleanly to error tracking and structured logging without silent drops.

import { describe, expect, it, vi } from "vitest";
import { captureException } from "../src/lib/error-tracking";
import { createLogger } from "../src/lib/logger";

describe("route error capture integration", () => {
  it("captures thrown exceptions with request metadata", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("ok"));
    const DSN = "https://key@o1.ingest.sentry.io/42";

    const err = new Error("Database timeout in route handler");
    const meta = {
      path: "/api/public/plan",
      method: "POST",
      status: 500,
      requestId: "req-12345",
    };

    const sent = await captureException(err, meta, {
      dsn: DSN,
      fetcher: fetcher as unknown as typeof fetch,
    });

    expect(sent).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://o1.ingest.sentry.io/api/42/envelope/");
    expect(init.method).toBe("POST");

    const body = String(init.body);
    expect(body).toContain("Database timeout in route handler");
    expect(body).toContain("/api/public/plan");
    expect(body).toContain("req-12345");
  });

  it("structured logger formats error objects with stack and context", () => {
    const lines: string[] = [];
    const logSpy = vi.spyOn(console, "error").mockImplementation((msg) => {
      lines.push(msg);
    });

    const logger = createLogger("api:test-route");
    logger.error("Operation failed", new Error("Network timeout"), {
      route: "/api/public/snapshot",
    });

    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);

    expect(parsed.level).toBe("error");
    expect(parsed.scope).toBe("api:test-route");
    expect(parsed.msg).toBe("Operation failed");
    expect(parsed.route).toBe("/api/public/snapshot");
    expect(parsed.err.message).toBe("Network timeout");

    logSpy.mockRestore();
  });
});
