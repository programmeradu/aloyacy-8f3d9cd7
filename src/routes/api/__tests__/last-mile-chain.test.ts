import { describe, it, expect, vi, afterEach } from "vitest";
import { Route } from "@/routes/api/public/last-mile-chain";
import { getHandler } from "./handler";

const POST = getHandler(Route, "POST");
vi.mock("@/lib/last-mile-chain.functions", () => ({
  suggestLastMileChain: vi.fn(async () => null),
}));

afterEach(() => vi.restoreAllMocks());

const body = (b: unknown) =>
  new Request("http://x/api/public/last-mile-chain", { method: "POST", body: JSON.stringify(b) });

describe("POST /api/public/last-mile-chain", () => {
  it("accepts a valid body", async () => {
    const res = await POST({
      request: body({
        alight: { lat: 34.9, lng: 33.6 },
        destination: { lat: 34.95, lng: 33.65 },
      }),
    });
    expect(res.status).toBe(200);
  });

  it("rejects a missing destination with issues", async () => {
    const res = await POST({ request: body({ alight: { lat: 34.9, lng: 33.6 } }) });
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toBe("invalid_request");
    expect(j.issues.some((i: { path: string }) => i.path === "destination")).toBe(true);
  });
});
