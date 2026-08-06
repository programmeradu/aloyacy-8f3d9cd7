import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Route } from "@/routes/api/public/tts";
import { getHandler } from "./handler";

const POST = getHandler(Route, "POST");
beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = "eleven-key";
  process.env.LOVABLE_API_KEY = "lovable-key";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new ArrayBuffer(4), { status: 200 })),
  );
});
afterEach(() => vi.unstubAllGlobals());

function req(body: unknown) {
  return new Request("http://x/api/public/tts", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/public/tts", () => {
  it("accepts valid input and returns audio", async () => {
    const res = await POST({ request: req({ input: "geia sou" }) });
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty input string", async () => {
    const res = await POST({ request: req({ input: "" }) });
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a malformed voice id", async () => {
    const res = await POST({ request: req({ input: "hi", voice: "!!" }) });
    expect(res.status).toBe(400);
  });
});
