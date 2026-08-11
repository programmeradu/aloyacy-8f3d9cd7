import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchParkAndRide } from "@/lib/pnr";
import { API_BASE } from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

const args = {
  from: { lat: 35.17, lng: 33.36, label: "Home" },
  to: { lat: 35.02, lng: 33.9, label: "Larnaca" },
  busOnlyDurationSec: 3600,
  busOnlyAccessWalkM: 300,
};

describe("fetchParkAndRide", () => {
  it("POSTs the args to the park-and-ride endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("null", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchParkAndRide(args);

    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/public/park-and-ride`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(args),
    });
  });

  it("returns the parsed suggestion on success", async () => {
    const suggestion = {
      hub: { id: "h1", label: "Hub", lat: 35, lng: 33 },
      driveSec: 600,
      driveMeters: 5000,
      bus: { firstRoute: "1", boardName: "Hub Stop", durationSec: 1200, arrivalUnix: 100 },
      totalSec: 1800,
      busOnlySec: 3600,
      savingsSec: 1800,
      reason: "faster",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(suggestion), { status: 200 })));

    await expect(fetchParkAndRide(args)).resolves.toEqual(suggestion);
  });

  it("returns null when the response is not ok, instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 500 })));

    await expect(fetchParkAndRide(args)).resolves.toBeNull();
  });

  it("returns null when fetch throws a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(fetchParkAndRide(args)).resolves.toBeNull();
  });

  it("passes through null busOnly fields unchanged", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("null", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const nullArgs = { ...args, busOnlyDurationSec: null, busOnlyAccessWalkM: null };

    await fetchParkAndRide(nullArgs);

    const call = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(call.body as string)).toEqual(nullArgs);
  });
});
