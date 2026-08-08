import { describe, expect, it, beforeEach, vi } from "vitest";
import { callServerFn } from "./server-fn";
import { makeSupabaseMock, type TableResult, type QueryCall } from "./supabase-mock";

const state: { tables: Record<string, TableResult | ((calls: QueryCall[]) => TableResult)> } = {
  tables: {},
};

vi.mock("@/integrations/supabase/client.server", () => {
  return {
    get supabaseAdmin() {
      const { client } = makeSupabaseMock(state.tables);
      return client;
    },
  };
});

const generateGroupCode = vi.fn(() => "ABCD12");
const memberEtaMinutes = vi.fn(async () => 7);
vi.mock("../trip-groups.server", () => ({
  generateGroupCode: (...args: never[]) => generateGroupCode(...args),
  memberEtaMinutes: (...args: never[]) => memberEtaMinutes(...args),
}));

const { createTripGroup, pingGroupMember, leaveTripGroup, endTripGroup, joinTripGroup } =
  await import("../trip-groups.functions");

const DEST = { lat: 35.1, lng: 33.3 };
const ORIGIN = { lat: 35.2, lng: 33.4 };
const TOKEN = "11111111-1111-1111-1111-111111111111";

describe("createTripGroup", () => {
  beforeEach(() => {
    generateGroupCode.mockReturnValue("ABCD12");
    memberEtaMinutes.mockResolvedValue(7);
    state.tables = {
      trip_groups: { data: { id: "g1", code: "ABCD12" }, error: null },
      trip_group_members: { data: null, error: null },
    };
  });

  it("rejects an invalid destination at the validator boundary", async () => {
    await expect(
      callServerFn(createTripGroup, {
        destinationLabel: "Home",
        destination: { lat: 999, lng: 0 },
        hostName: "Ann",
      } as never),
    ).rejects.toThrow();
  });

  it("creates a group and joins the host without an origin", async () => {
    const out = await callServerFn(createTripGroup, {
      destinationLabel: "Home",
      destination: DEST,
      hostName: "Ann",
    });
    expect(out).toEqual({ code: "ABCD12", memberToken: expect.any(String) });
    expect(memberEtaMinutes).not.toHaveBeenCalled();
  });

  it("pre-computes the host ETA when an origin is given", async () => {
    const out = await callServerFn(createTripGroup, {
      destinationLabel: "Home",
      destination: DEST,
      hostName: "Ann",
      origin: ORIGIN,
      originLabel: "Work",
    });
    expect(memberEtaMinutes).toHaveBeenCalledWith(ORIGIN, DEST);
    expect(out.code).toBe("ABCD12");
  });

  it("retries on a unique-violation and eventually succeeds", async () => {
    let attempts = 0;
    state.tables = {
      trip_groups: () => {
        attempts++;
        if (attempts < 2) return { data: null, error: { code: "23505", message: "dup" } };
        return { data: { id: "g1", code: "ABCD12" }, error: null };
      },
      trip_group_members: { data: null, error: null },
    };
    const out = await callServerFn(createTripGroup, {
      destinationLabel: "Home",
      destination: DEST,
      hostName: "Ann",
    });
    expect(out.code).toBe("ABCD12");
    expect(attempts).toBe(2);
  });

  it("throws on a non-collision group insert error", async () => {
    state.tables = {
      trip_groups: { data: null, error: { message: "db down" } },
      trip_group_members: { data: null, error: null },
    };
    await expect(
      callServerFn(createTripGroup, {
        destinationLabel: "Home",
        destination: DEST,
        hostName: "Ann",
      }),
    ).rejects.toThrow("group create failed: db down");
  });

  it("throws when the host member insert fails", async () => {
    state.tables = {
      trip_groups: { data: { id: "g1", code: "ABCD12" }, error: null },
      trip_group_members: { data: null, error: { message: "member insert failed" } },
    };
    await expect(
      callServerFn(createTripGroup, {
        destinationLabel: "Home",
        destination: DEST,
        hostName: "Ann",
      }),
    ).rejects.toThrow("group host join failed");
  });
});

describe("pingGroupMember", () => {
  beforeEach(() => {
    memberEtaMinutes.mockResolvedValue(5);
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
  });

  it("rejects a non-uuid member token", async () => {
    await expect(
      callServerFn(pingGroupMember, { memberToken: "nope", position: ORIGIN }),
    ).rejects.toThrow();
  });

  it("throws when member lookup errors", async () => {
    state.tables = { trip_group_members: { data: null, error: { message: "boom" } } };
    await expect(
      callServerFn(pingGroupMember, { memberToken: TOKEN, position: ORIGIN }),
    ).rejects.toThrow("member lookup failed");
  });

  it("throws when the member does not exist", async () => {
    state.tables = { trip_group_members: { data: null, error: null } };
    await expect(
      callServerFn(pingGroupMember, { memberToken: TOKEN, position: ORIGIN }),
    ).rejects.toThrow("member not found");
  });

  it("returns expired when the group's window has passed", async () => {
    state.tables = {
      trip_group_members: {
        data: {
          id: "m1",
          group_id: "g1",
          status: "active",
          trip_groups: {
            destination_lat: DEST.lat,
            destination_lng: DEST.lng,
            expires_at: "2020-01-01T00:00:00Z",
          },
        },
        error: null,
      },
    };
    const out = await callServerFn(pingGroupMember, { memberToken: TOKEN, position: ORIGIN });
    expect(out).toEqual({ ok: false, reason: "expired" });
  });

  it("updates the member's position and returns the ETA", async () => {
    state.tables = {
      trip_group_members: (calls) => {
        if (calls.some((c) => c.method === "update")) return { data: null, error: null };
        return {
          data: {
            id: "m1",
            group_id: "g1",
            status: "active",
            trip_groups: {
              destination_lat: DEST.lat,
              destination_lng: DEST.lng,
              expires_at: "2030-01-01T00:00:00Z",
            },
          },
          error: null,
        };
      },
    };
    const out = await callServerFn(pingGroupMember, { memberToken: TOKEN, position: ORIGIN });
    expect(out).toEqual({ ok: true, etaMinutes: 5 });
  });

  it("throws when the position update fails", async () => {
    state.tables = {
      trip_group_members: (calls) => {
        if (calls.some((c) => c.method === "update"))
          return { data: null, error: { message: "update failed" } };
        return {
          data: {
            id: "m1",
            group_id: "g1",
            status: "active",
            trip_groups: {
              destination_lat: DEST.lat,
              destination_lng: DEST.lng,
              expires_at: "2030-01-01T00:00:00Z",
            },
          },
          error: null,
        };
      },
    };
    await expect(
      callServerFn(pingGroupMember, { memberToken: TOKEN, position: ORIGIN }),
    ).rejects.toThrow("member update failed");
  });
});

describe("leaveTripGroup", () => {
  it("rejects a non-uuid token", async () => {
    await expect(callServerFn(leaveTripGroup, { memberToken: "bad" })).rejects.toThrow();
  });

  it("marks the member as left", async () => {
    state.tables = { trip_group_members: { data: null, error: null } };
    const out = await callServerFn(leaveTripGroup, { memberToken: TOKEN });
    expect(out).toEqual({ ok: true });
  });

  it("throws when the update errors", async () => {
    state.tables = { trip_group_members: { data: null, error: { message: "boom" } } };
    await expect(callServerFn(leaveTripGroup, { memberToken: TOKEN })).rejects.toThrow(
      "leave failed",
    );
  });
});

describe("endTripGroup", () => {
  it("throws when the caller is not the creator", async () => {
    state.tables = {
      trip_group_members: { data: { id: "m1", group_id: "g1", is_creator: false }, error: null },
    };
    await expect(callServerFn(endTripGroup, { memberToken: TOKEN })).rejects.toThrow(
      "only the host can end the group",
    );
  });

  it("throws when member lookup fails", async () => {
    state.tables = { trip_group_members: { data: null, error: { message: "boom" } } };
    await expect(callServerFn(endTripGroup, { memberToken: TOKEN })).rejects.toThrow(
      "member lookup failed",
    );
  });

  it("throws when member is not found", async () => {
    state.tables = { trip_group_members: { data: null, error: null } };
    await expect(callServerFn(endTripGroup, { memberToken: TOKEN })).rejects.toThrow(
      "member not found",
    );
  });

  it("ends the group when the caller is the creator", async () => {
    state.tables = {
      trip_group_members: { data: { id: "m1", group_id: "g1", is_creator: true }, error: null },
      trip_groups: { data: null, error: null },
    };
    const out = await callServerFn(endTripGroup, { memberToken: TOKEN });
    expect(out).toEqual({ ok: true });
  });

  it("throws when ending the group errors", async () => {
    state.tables = {
      trip_group_members: { data: { id: "m1", group_id: "g1", is_creator: true }, error: null },
      trip_groups: { data: null, error: { message: "boom" } },
    };
    await expect(callServerFn(endTripGroup, { memberToken: TOKEN })).rejects.toThrow("end failed");
  });
});

describe("joinTripGroup", () => {
  beforeEach(() => {
    memberEtaMinutes.mockResolvedValue(9);
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
  });

  it("rejects a too-short code", async () => {
    await expect(callServerFn(joinTripGroup, { code: "ab", displayName: "Bo" })).rejects.toThrow();
  });

  it("throws when the group lookup fails", async () => {
    state.tables = { trip_groups: { data: null, error: { message: "boom" } } };
    await expect(
      callServerFn(joinTripGroup, { code: "ABCD12", displayName: "Bo" }),
    ).rejects.toThrow("group lookup failed");
  });

  it("throws when the group does not exist", async () => {
    state.tables = { trip_groups: { data: null, error: null } };
    await expect(
      callServerFn(joinTripGroup, { code: "ABCD12", displayName: "Bo" }),
    ).rejects.toThrow("group not found");
  });

  it("throws when the group has ended", async () => {
    state.tables = {
      trip_groups: {
        data: {
          id: "g1",
          destination_lat: DEST.lat,
          destination_lng: DEST.lng,
          expires_at: "2020-01-01T00:00:00Z",
        },
        error: null,
      },
    };
    await expect(
      callServerFn(joinTripGroup, { code: "ABCD12", displayName: "Bo" }),
    ).rejects.toThrow("group has ended");
  });

  it("joins and computes an ETA when origin is given", async () => {
    state.tables = {
      trip_groups: {
        data: {
          id: "g1",
          destination_lat: DEST.lat,
          destination_lng: DEST.lng,
          expires_at: "2030-01-01T00:00:00Z",
        },
        error: null,
      },
      trip_group_members: { data: null, error: null },
    };
    const out = await callServerFn(joinTripGroup, {
      code: "abcd12",
      displayName: "Bo",
      origin: ORIGIN,
    });
    expect(out).toEqual({ memberToken: expect.any(String), etaMinutes: 9 });
    expect(memberEtaMinutes).toHaveBeenCalledWith(ORIGIN, { lat: DEST.lat, lng: DEST.lng });
  });

  it("throws when the member insert fails", async () => {
    state.tables = {
      trip_groups: {
        data: {
          id: "g1",
          destination_lat: DEST.lat,
          destination_lng: DEST.lng,
          expires_at: "2030-01-01T00:00:00Z",
        },
        error: null,
      },
      trip_group_members: { data: null, error: { message: "boom" } },
    };
    await expect(
      callServerFn(joinTripGroup, { code: "ABCD12", displayName: "Bo" }),
    ).rejects.toThrow("join failed");
  });
});
