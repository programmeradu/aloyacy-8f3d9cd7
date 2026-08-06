import { describe, it, expect, vi, afterEach } from "vitest";
import { Route } from "@/routes/api/public/kapnos";
import { getHandler } from "./handler";

const POST = getHandler(Route, "POST");
vi.mock("@/lib/kapnos.functions", () => ({ suggestKapnos: vi.fn(async () => null) }));

afterEach(() => vi.restoreAllMocks());

const body = (b: unknown) =>
  new Request("http://x/api/public/kapnos", { method: "POST", body: JSON.stringify(b) });

describe("POST /api/public/kapnos", () => {
  it("accepts a valid body", async () => {
    const res = await POST({
      request: body({ from: { lat: 34.9, lng: 33.6 }, to: { lat: 34.95, lng: 33.65 } }),
    });
    expect(res.status).toBe(200);
  });

  it("rejects a non-numeric point with issues", async () => {
    const res = await POST({
      request: body({ from: { lat: "x", lng: 33.6 }, to: { lat: 34.95, lng: 33.65 } }),
    });
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toBe("invalid_request");
  });
});
