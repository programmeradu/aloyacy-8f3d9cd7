import { describe, expect, it } from "vitest";
import {
  STOP_ASK_COOLDOWN_MS,
  pickStopAsk,
  shouldOpenStopAsk,
} from "./stop-ask";

describe("shouldOpenStopAsk", () => {
  it("opens until a tap, then waits out the ride", () => {
    expect(STOP_ASK_COOLDOWN_MS).toBe(3 * 60 * 60 * 1000);
    expect(shouldOpenStopAsk(null, 1_000)).toBe(true);
    expect(shouldOpenStopAsk(1_000, 1_000 + 60_000)).toBe(false);
    expect(shouldOpenStopAsk(1_000, 1_000 + STOP_ASK_COOLDOWN_MS)).toBe(true);
  });
});

describe("pickStopAsk", () => {
  it("asks condition, then photo, then skip — never two at once", () => {
    expect(pickStopAsk({ condition: true, photo: true, skipReport: true })).toBe("condition");
    expect(pickStopAsk({ condition: false, photo: true, skipReport: true })).toBe("photo");
    expect(pickStopAsk({ condition: false, photo: false, skipReport: true })).toBe("skipReport");
    expect(pickStopAsk({ condition: false, photo: false, skipReport: false })).toBeNull();
  });
});
