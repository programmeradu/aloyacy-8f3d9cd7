// Guards the reporting path used by src/server.ts: an unhandled SSR failure
// must reach the tracker, and a missing or broken DSN must stay silent rather
// than turning a 500 into a crash loop.

import { describe, expect, it, vi } from "vitest";
import { buildEnvelope, captureException, parseDsn } from "../src/lib/error-tracking";

const DSN = "https://abc123@o1.ingest.sentry.io/42";

describe("parseDsn", () => {
  it("derives the envelope endpoint and public key", () => {
    expect(parseDsn(DSN)).toEqual({
      url: "https://o1.ingest.sentry.io/api/42/envelope/",
      key: "abc123",
    });
  });

  it.each([undefined, "", "not-a-url", "https://o1.ingest.sentry.io/42", "https://k@host/"])(
    "returns undefined for %s",
    (value) => {
      expect(parseDsn(value)).toBeUndefined();
    },
  );
});

describe("buildEnvelope", () => {
  it("emits header, item header and event as newline-delimited JSON", () => {
    const lines = buildEnvelope(new Error("boom"), { path: "/plan" }, 1_700_000_000_000)
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(lines).toHaveLength(3);
    expect(lines[0].sent_at).toBe("2023-11-14T22:13:20.000Z");
    expect(lines[1]).toEqual({ type: "event" });
    expect(lines[2].exception.values[0]).toMatchObject({ type: "Error", value: "boom" });
    expect(lines[2].extra.path).toBe("/plan");
    expect(lines[2].event_id).toBe(lines[0].event_id);
  });

  it("describes non-Error throws without losing the value", () => {
    const event = JSON.parse(buildEnvelope("plain string", {}).split("\n")[2]);
    expect(event.exception.values[0]).toMatchObject({
      type: "UnknownError",
      value: "plain string",
    });
  });
});

describe("captureException", () => {
  it("posts an envelope with the Sentry auth header", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("ok"));
    const sent = await captureException(
      new Error("ssr failed"),
      { status: 500 },
      {
        dsn: DSN,
        fetcher: fetcher as unknown as typeof fetch,
      },
    );

    expect(sent).toBe(true);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://o1.ingest.sentry.io/api/42/envelope/");
    expect(init.headers["x-sentry-auth"]).toContain("sentry_key=abc123");
    expect(String(init.body)).toContain("ssr failed");
  });

  it("is a no-op when no DSN is configured", async () => {
    const fetcher = vi.fn();
    await expect(
      captureException(new Error("x"), {}, { fetcher: fetcher as unknown as typeof fetch }),
    ).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("swallows transport failures so the error page still renders", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(
      captureException(
        new Error("x"),
        {},
        { dsn: DSN, fetcher: fetcher as unknown as typeof fetch },
      ),
    ).resolves.toBe(false);
  });
});
