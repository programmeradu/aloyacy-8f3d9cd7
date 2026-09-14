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

  it("prefers Lovable managed connection without client key when LOVABLE_API_KEY is present", () => {
    process.env.LOVABLE_API_KEY = "lovable_test_token";
    process.env.GOOGLE_MAPS_API_KEY = "restricted_browser_key";

    const headers = authHeaders();
    expect(headers.Authorization).toBe("Bearer lovable_test_token");
    // Crucial: do NOT send the browser-restricted GOOGLE_MAPS_API_KEY
    expect(headers["X-Connection-Api-Key"]).toBeUndefined();
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
