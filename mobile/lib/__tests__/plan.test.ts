import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPlan } from "@/lib/plan";
import { API_BASES } from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

const args = {
  from: { lat: 35.17, lng: 33.36 },
  to: { lat: 34.9, lng: 33.6 },
};

describe("fetchPlan", () => {
  it("POSTs the request body with JSON headers to the plan endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ itineraries: [], searchedAt: 1, elapsedMs: 1, mode: "live" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchPlan(args);

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASES[0]}/api/public/plan`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(args),
      }),
    );
  });

  it("returns the parsed plan result on success", async () => {
    const planResult = {
      itineraries: [{ id: "1" }],
      searchedAt: 100,
      elapsedMs: 20,
      mode: "both",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(planResult), { status: 200 })));

    await expect(fetchPlan(args)).resolves.toEqual(planResult);
  });

  it("throws with status and truncated body text when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("no route found between these points", { status: 422 })),
    );

    await expect(fetchPlan(args)).rejects.toThrow(
      "Plan 422: no route found between these points",
    );
  });

  it("truncates a very long error body to 200 characters", async () => {
    // Use a 4xx status: a 5xx would be retried against the second base by
    // fetchPublicApi and, once both bases are exhausted, would surface that
    // failover's own error message instead of this module's "Plan <status>".
    const longText = "x".repeat(500);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(longText, { status: 422 })));

    await expect(fetchPlan(args)).rejects.toThrow(`Plan 422: ${"x".repeat(200)}`);
  });

  it("does not throw when reading the error body fails", async () => {
    const badResponse = new Response("oops", { status: 422 });
    vi.spyOn(badResponse, "text").mockRejectedValue(new Error("stream closed"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(badResponse));

    await expect(fetchPlan(args)).rejects.toThrow("Plan 422: ");
  });
});
