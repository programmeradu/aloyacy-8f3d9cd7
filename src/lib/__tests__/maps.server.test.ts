import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { authHeaders } from "../maps.server";

describe("maps.server authHeaders", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.LOVABLE_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("throws when all keys are missing", () => {
    expect(() => authHeaders()).toThrow(/missing/i);
  });

  it("passes X-Connection-Api-Key and X-Connection-Id when LOVABLE_API_KEY is present", () => {
    process.env.LOVABLE_API_KEY = "lovable_test_token";
    process.env.GOOGLE_MAPS_API_KEY = "client_key";

    const headers = authHeaders();
    expect(headers.Authorization).toBe("Bearer lovable_test_token");
    expect(headers["X-Connection-Api-Key"]).toBe("client_key");
    expect(headers["X-Connection-Id"]).toBe("std_01ks89na5gfj8ar9b3vtc8qg92");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("sends X-Connection-Api-Key when explicit GOOGLE_MAPS_SERVER_KEY is provided", () => {
    process.env.LOVABLE_API_KEY = "lovable_test_token";
    process.env.GOOGLE_MAPS_SERVER_KEY = "unrestricted_server_key";

    const headers = authHeaders();
    expect(headers.Authorization).toBe("Bearer lovable_test_token");
    expect(headers["X-Connection-Api-Key"]).toBe("unrestricted_server_key");
  });

  it("falls back to GOOGLE_MAPS_API_KEY when LOVABLE_API_KEY is unset", () => {
    process.env.GOOGLE_MAPS_API_KEY = "standalone_key";

    const headers = authHeaders();
    expect(headers.Authorization).toBeUndefined();
    expect(headers["X-Connection-Api-Key"]).toBe("standalone_key");
  });
});

describe("maps.server direct Google Maps and failover", () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    delete process.env.LOVABLE_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    delete process.env.GOOGLE_MAPS_BACKUP_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  it("prioritizes direct Google Maps Platform call using GOOGLE_MAPS_SERVER_KEY", async () => {
    process.env.GOOGLE_MAPS_SERVER_KEY = "direct_server_key";
    process.env.LOVABLE_API_KEY = "lovable_gateway_key";

    const calledUrls: string[] = [];
    const calledHeaders: Record<string, string>[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      calledUrls.push(url);
      calledHeaders.push((init?.headers as Record<string, string>) || {});
      return new Response(JSON.stringify({ suggestions: [] }), { status: 200 });
    }) as typeof fetch;

    const { placesAutocomplete } = await import("../maps.server");
    const results = await placesAutocomplete("Solomou");

    expect(results).toEqual([]);
    expect(calledUrls).toHaveLength(1);
    expect(calledUrls[0]).toBe("https://places.googleapis.com/v1/places:autocomplete");
    expect(calledHeaders[0]["X-Goog-Api-Key"]).toBe("direct_server_key");
  });

  it("fails over to GOOGLE_MAPS_BACKUP_KEY when primary returns 403", async () => {
    process.env.GOOGLE_MAPS_SERVER_KEY = "primary_failing_key";
    process.env.GOOGLE_MAPS_BACKUP_KEY = "backup_working_key";

    const keyAttempts: string[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = (init?.headers as Record<string, string>) || {};
      const key = headers["X-Goog-Api-Key"];
      keyAttempts.push(key);

      if (key === "primary_failing_key") {
        return new Response("Permission denied", { status: 403 });
      }
      return new Response(
        JSON.stringify({
          suggestions: [
            {
              placePrediction: {
                placeId: "cy_solomou_1",
                text: { text: "Solomou Square Bus Station" },
              },
            },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const { placesAutocomplete } = await import("../maps.server");
    const results = await placesAutocomplete("Solomou");

    expect(results).toHaveLength(1);
    expect(results[0].placeId).toBe("cy_solomou_1");
    expect(keyAttempts).toEqual(["primary_failing_key", "backup_working_key"]);
  });

  it("falls back to Lovable gateway if all direct keys return 403/429", async () => {
    process.env.GOOGLE_MAPS_SERVER_KEY = "exhausted_key";
    process.env.LOVABLE_API_KEY = "lovable_fallback_token";

    const endpoints: string[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      endpoints.push(url);
      if (url.includes("places.googleapis.com")) {
        return new Response("Quota exceeded", { status: 429 });
      }
      return new Response(JSON.stringify({ suggestions: [] }), { status: 200 });
    }) as typeof fetch;

    const { placesAutocomplete } = await import("../maps.server");
    await placesAutocomplete("Eleftheria");

    expect(endpoints).toEqual([
      "https://places.googleapis.com/v1/places:autocomplete",
      "https://connector-gateway.lovable.dev/google_maps/places/v1/places:autocomplete",
    ]);
  });
});
