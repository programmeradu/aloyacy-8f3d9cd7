import { describe, it, expect } from "vitest";
import { Route } from "@/routes/api/public/gbfs[.]json";
import { getHandler } from "./handler";

const GET = getHandler(Route, "GET");
describe("GET /api/public/gbfs.json", () => {
  it("returns the GBFS discovery document (no input surface to validate)", async () => {
    const res = await GET({ request: new Request("http://x/api/public/gbfs.json") });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.version).toBe("2.3");
    expect(json.data.en.feeds.length).toBeGreaterThan(0);
  });
});
