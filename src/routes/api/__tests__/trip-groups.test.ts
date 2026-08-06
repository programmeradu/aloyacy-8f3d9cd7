import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/trip-groups.functions", () => ({
  createTripGroup: vi.fn(async () => ({ code: "ABCD" })),
  endTripGroup: vi.fn(async () => ({ ok: true })),
  joinTripGroup: vi.fn(async () => ({ ok: true })),
  leaveTripGroup: vi.fn(async () => ({ ok: true })),
  pingGroupMember: vi.fn(async () => ({ ok: true })),
}));

import { Route } from "@/routes/api/public/trip-groups";
import { createTripGroup } from "@/lib/trip-groups.functions";
import { getHandler } from "./handler";

const POST = getHandler(Route, "POST");
function req(body: unknown) {
  return new Request("http://x/api/public/trip-groups", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/public/trip-groups", () => {
  it("dispatches a valid action to its handler", async () => {
    const res = await POST({
      request: req({ action: "create", payload: { destinationLabel: "x" } }),
    });
    expect(res.status).toBe(200);
    expect(createTripGroup).toHaveBeenCalled();
  });

  it("rejects an unknown action", async () => {
    const res = await POST({ request: req({ action: "nuke" }) });
    expect(res.status).toBe(400);
  });

  it("rejects a missing action", async () => {
    const res = await POST({ request: req({}) });
    expect(res.status).toBe(400);
  });
});
