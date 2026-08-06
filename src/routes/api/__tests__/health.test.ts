import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Route } from "@/routes/api/public/health";
import { getHandler } from "./handler";

const handler = getHandler(Route, "GET");

const OLD_ENV = { ...process.env };

function callHealth() {
  return handler({ request: new Request("https://app.aloya.cy/api/public/health") });
}

beforeEach(() => {
  process.env["CUSTOM_SUPABASE_URL"] = "https://db.example.com";
  process.env["CUSTOM_SUPABASE_ANON_KEY"] = "anon-key";
  delete process.env["GTFS_RELAY_URL"];
  delete process.env["GTFS_RELAY_TOKEN"];
});

afterEach(() => {
  process.env = { ...OLD_ENV };
  vi.unstubAllGlobals();
});

describe("GET /api/public/health", () => {
  it("reports ok when the database answers and no relay is configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );

    const res = await callHealth();
    const body = (await res.json()) as {
      status: string;
      checks: { name: string; ok: boolean; detail?: string }[];
    };

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body.status).toBe("ok");
    expect(body.checks.map((c) => c.name)).toEqual(["database", "gtfs-relay"]);
    expect(body.checks.find((c) => c.name === "gtfs-relay")?.detail).toBe("not configured");
  });

  it("returns 503 down when the database is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const res = await callHealth();
    const body = (await res.json()) as { status: string; checks: { name: string; ok: boolean }[] };

    expect(res.status).toBe(503);
    expect(body.status).toBe("down");
    expect(body.checks.find((c) => c.name === "database")?.ok).toBe(false);
  });

  it("treats a 5xx from PostgREST as unhealthy but 401 as alive", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    expect((await callHealth()).status).toBe(503);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 })),
    );
    expect((await callHealth()).status).toBe(200);
  });

  it("degrades — but stays 200 — when only the relay is down", async () => {
    process.env["GTFS_RELAY_URL"] = "https://relay.example.com/feed";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("relay.example.com")) return new Response(null, { status: 502 });
        return new Response(null, { status: 200 });
      }),
    );

    const res = await callHealth();
    const body = (await res.json()) as { status: string; checks: { name: string; ok: boolean }[] };

    expect(res.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.checks.find((c) => c.name === "gtfs-relay")?.ok).toBe(false);
  });

  it("sends the relay bearer token when one is configured", async () => {
    process.env["GTFS_RELAY_URL"] = "https://relay.example.com/feed";
    process.env["GTFS_RELAY_TOKEN"] = "secret-token";
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await callHealth();

    const relayCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("relay.example.com"));
    expect(relayCall).toBeDefined();
    const init = relayCall![1]!;
    expect(init.method).toBe("HEAD");
    expect((init.headers as Record<string, string>)["authorization"]).toBe("Bearer secret-token");
  });

  it("never leaks credentials in the payload", async () => {
    process.env["GTFS_RELAY_URL"] = "https://relay.example.com/feed";
    process.env["GTFS_RELAY_TOKEN"] = "secret-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );

    const text = await (await callHealth()).text();
    expect(text).not.toContain("secret-token");
    expect(text).not.toContain("anon-key");
  });
});
