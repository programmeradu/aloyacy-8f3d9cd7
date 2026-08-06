import { describe, it, expect, vi, afterEach } from "vitest";
import { indexNowPayload, pingIndexNow, INDEXNOW_KEY, INDEXNOW_HOST } from "./indexnow";

describe("indexNowPayload", () => {
  it("builds the default payload with the production host and key", () => {
    const payload = indexNowPayload();
    expect(payload.host).toBe(INDEXNOW_HOST);
    expect(payload.key).toBe(INDEXNOW_KEY);
    expect(payload.keyLocation).toBe(`https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`);
    expect(payload.urlList).toContain(`https://${INDEXNOW_HOST}/`);
    expect(payload.urlList).toContain(`https://${INDEXNOW_HOST}/pulse`);
    expect(payload.urlList.length).toBeGreaterThan(5);
  });

  it("uses a custom host for both keyLocation and every URL", () => {
    const payload = indexNowPayload("example.com");
    expect(payload.host).toBe("example.com");
    expect(payload.keyLocation).toBe(`https://example.com/${INDEXNOW_KEY}.txt`);
    for (const url of payload.urlList) {
      expect(url.startsWith("https://example.com/")).toBe(true);
    }
  });
});

describe("pingIndexNow", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("posts the payload and reports success on a 200 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "ok",
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await pingIndexNow();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.indexnow.org/IndexNow",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.host).toBe(INDEXNOW_HOST);
    expect(result).toEqual({ ok: true, status: 200, body: "ok" });
  });

  it("reports failure with the status code on a non-2xx response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "invalid key",
    }) as unknown as typeof fetch;

    const result = await pingIndexNow("custom.host");
    expect(result).toEqual({ ok: false, status: 422, body: "invalid key" });
  });

  it("still returns a result when reading the response body throws", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => {
        throw new Error("stream error");
      },
    }) as unknown as typeof fetch;

    const result = await pingIndexNow();
    expect(result).toEqual({ ok: true, status: 200, body: undefined });
  });
});
