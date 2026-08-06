import { describe, it, expect, vi, afterEach } from "vitest";
import { Route } from "@/routes/api/public/places-autocomplete";
import { getHandler } from "./handler";

const POST = getHandler(Route, "POST");
vi.mock("@/lib/maps.functions", () => ({ autocompletePlaces: vi.fn(async () => []) }));

afterEach(() => vi.restoreAllMocks());

const body = (b: unknown) =>
  new Request("http://x/api/public/places-autocomplete", {
    method: "POST",
    body: JSON.stringify(b),
  });

describe("POST /api/public/places-autocomplete", () => {
  it("accepts a valid query", async () => {
    const res = await POST({ request: body({ query: "Limassol" }) });
    expect(res.status).toBe(200);
  });

  it("rejects an empty query with issues", async () => {
    const res = await POST({ request: body({ query: "" }) });
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toBe("invalid_request");
    expect(j.issues[0].path).toBe("query");
  });
});
