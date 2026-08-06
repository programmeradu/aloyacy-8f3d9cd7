import { describe, it, expect, vi, afterEach } from "vitest";
import { Route } from "@/routes/api/public/place";
import { getHandler } from "./handler";

const POST = getHandler(Route, "POST");
vi.mock("@/lib/maps.functions", () => ({ getPlace: vi.fn(async () => ({ name: "Somewhere" })) }));

afterEach(() => vi.restoreAllMocks());

const body = (b: unknown) =>
  new Request("http://x/api/public/place", { method: "POST", body: JSON.stringify(b) });

describe("POST /api/public/place", () => {
  it("accepts a valid placeId", async () => {
    const res = await POST({ request: body({ placeId: "abc123" }) });
    expect(res.status).toBe(200);
  });

  it("rejects a missing placeId with issues", async () => {
    const res = await POST({ request: body({}) });
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toBe("invalid_request");
    expect(j.issues[0].path).toBe("placeId");
  });
});
