import { describe, it, expect, vi, afterEach } from "vitest";
import { Route } from "@/routes/api/public/bolt-scooter";
import { getHandler } from "./handler";

const POST = getHandler(Route, "POST");
vi.mock("@/lib/bolt-scooter.functions", () => ({ suggestBoltScooter: vi.fn(async () => null) }));

afterEach(() => vi.restoreAllMocks());

const body = (b: unknown) =>
  new Request("http://x/api/public/bolt-scooter", { method: "POST", body: JSON.stringify(b) });

describe("POST /api/public/bolt-scooter", () => {
  it("accepts a valid body", async () => {
    const res = await POST({
      request: body({ from: { lat: 35.17, lng: 33.36 }, to: { lat: 35.18, lng: 33.37 } }),
    });
    expect(res.status).toBe(200);
  });

  it("rejects a missing field with issues", async () => {
    const res = await POST({ request: body({ from: { lat: 35.17, lng: 33.36 } }) });
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toBe("invalid_request");
    expect(j.issues.some((i: { path: string }) => i.path === "to")).toBe(true);
  });
});
