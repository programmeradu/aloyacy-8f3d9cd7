import { describe, expect, it, vi, beforeEach } from "vitest";
import { callServerFn } from "./server-fn";

const drivingRouteMock = vi.fn();
vi.mock("../maps.server", () => ({
  drivingRoute: (...args: unknown[]) => drivingRouteMock(...args),
}));

const { suggestTaxiQuote } = await import("../taxi-quote.functions");

const FROM = { lat: 35.17, lng: 33.36 };
const TO = { lat: 35.2, lng: 33.4 };
const DAY_UNIX = Math.floor(Date.UTC(2024, 5, 10, 12, 0, 0) / 1000);

describe("suggestTaxiQuote", () => {
  beforeEach(() => {
    drivingRouteMock.mockReset();
  });

  it("rejects a point outside Cyprus", async () => {
    await expect(
      callServerFn(suggestTaxiQuote, { from: { lat: 51.5, lng: -0.1 }, to: TO }),
    ).rejects.toThrow();
  });

  it("stays silent when the drive is missing", async () => {
    drivingRouteMock.mockResolvedValue(null);
    expect(
      await callServerFn(suggestTaxiQuote, { from: FROM, to: TO, atUnix: DAY_UNIX }),
    ).toBeNull();
  });

  it("quotes the regulated band from a measured drive, not a haversine", async () => {
    drivingRouteMock.mockResolvedValue({ durationSec: 400, distanceMeters: 2500 });
    const out = await callServerFn(suggestTaxiQuote, {
      from: FROM,
      to: TO,
      atUnix: DAY_UNIX,
    });
    expect(out?.driveMin).toBe(7);
    expect(out?.fareLow).toBe(5);
    expect(out?.fareHigh).toBe(6.5);
    expect(out?.tel).toBe("+35777777474");
    expect(drivingRouteMock).toHaveBeenCalledWith(FROM, TO);
  });
});
