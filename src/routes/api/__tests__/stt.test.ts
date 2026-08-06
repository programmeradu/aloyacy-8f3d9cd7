import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Route } from "@/routes/api/public/stt";
import { getHandler } from "./handler";

const POST = getHandler(Route, "POST");
beforeEach(() => {
  process.env.LOVABLE_API_KEY = "test-key";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ text: "hello" }), { status: 200 })),
  );
});
afterEach(() => vi.unstubAllGlobals());

function reqWithFile(bytes: number) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)]), "a.wav");
  return new Request("http://x/api/public/stt", { method: "POST", body: form });
}

describe("POST /api/public/stt", () => {
  it("accepts a valid recording and proxies upstream", async () => {
    const res = await POST({ request: reqWithFile(1024) });
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a recording that's too short", async () => {
    const res = await POST({ request: reqWithFile(10) });
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a request missing the file field", async () => {
    const res = await POST({
      request: new Request("http://x", { method: "POST", body: new FormData() }),
    });
    expect(res.status).toBe(400);
  });
});
