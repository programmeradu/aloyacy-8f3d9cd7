import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { callServerFn } from "./server-fn";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

let mod: typeof import("../ai-planner.functions");
const originalKey = process.env.LOVABLE_API_KEY;

beforeEach(async () => {
  vi.resetModules();
  fetchMock.mockReset();
  process.env.LOVABLE_API_KEY = "test-key";
  mod = await import("../ai-planner.functions");
});

afterEach(() => {
  process.env.LOVABLE_API_KEY = originalKey;
});

function gatewayResponse(content: unknown) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }),
  };
}

describe("parseTripIntent", () => {
  it("rejects text that is too short", async () => {
    await expect(callServerFn(mod.parseTripIntent, { text: "x" })).rejects.toThrow();
  });

  it("returns null when the API key is missing", async () => {
    delete process.env.LOVABLE_API_KEY;
    vi.resetModules();
    mod = await import("../ai-planner.functions");
    const out = await callServerFn(mod.parseTripIntent, { text: "to the airport" });
    expect(out).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null on an upstream error status", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const out = await callServerFn(mod.parseTripIntent, { text: "to the airport" });
    expect(out).toBeNull();
  });

  it("returns null when the response has no message content", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) });
    const out = await callServerFn(mod.parseTripIntent, { text: "to the airport" });
    expect(out).toBeNull();
  });

  it("returns null when the model output fails schema validation", async () => {
    fetchMock.mockResolvedValue(gatewayResponse({ from: null, to: null }));
    const out = await callServerFn(mod.parseTripIntent, { text: "to the airport" });
    expect(out).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const out = await callServerFn(mod.parseTripIntent, { text: "to the airport" });
    expect(out).toBeNull();
  });

  it("returns the parsed intent when the model output validates", async () => {
    fetchMock.mockResolvedValue(
      gatewayResponse({
        from: "home",
        to: "Larnaca airport",
        leaveByISO: null,
        arriveByISO: null,
        dayHint: "now",
        confidence: 0.9,
      }),
    );
    const out = await callServerFn(mod.parseTripIntent, { text: "from home to the airport" });
    expect(out?.from).toBe("home");
    expect(out?.to).toBe("Larnaca airport");
  });

  it("overrides leaveByISO with an explicit clock time from the text", async () => {
    fetchMock.mockResolvedValue(
      gatewayResponse({
        from: "home",
        to: "work",
        leaveByISO: null,
        arriveByISO: null,
        dayHint: "now",
        confidence: 0.9,
      }),
    );
    const out = await callServerFn(mod.parseTripIntent, {
      text: "leave at 7:30am to work",
      nowISO: "2024-05-01T08:00:00.000Z",
      tzOffsetMin: 180,
    });
    expect(out?.leaveByISO).toBeTruthy();
    expect(out?.arriveByISO).toBeNull();
  });

  it("overrides arriveByISO when the text says 'by'", async () => {
    fetchMock.mockResolvedValue(
      gatewayResponse({
        from: "home",
        to: "work",
        leaveByISO: null,
        arriveByISO: null,
        dayHint: "tomorrow",
        confidence: 0.9,
      }),
    );
    const out = await callServerFn(mod.parseTripIntent, {
      text: "be there by 9am tomorrow",
      nowISO: "2024-05-01T08:00:00.000Z",
      tzOffsetMin: 180,
    });
    expect(out?.arriveByISO).toBeTruthy();
    expect(out?.leaveByISO).toBeNull();
  });
});
