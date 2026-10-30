import { describe, expect, it } from "vitest";
import { parseSeats } from "@/lib/kapnos.functions";
import { seatLabel, seatPressure } from "@aloya/core/airport-board";

describe("Kapnos seat parsing", () => {
  it("treats a missing seat count as unknown, not sold out", () => {
    expect(parseSeats(undefined)).toBeNull();
    expect(parseSeats(null)).toBeNull();
    expect(parseSeats("")).toBeNull();
    expect(seatPressure(null)).toBe("open");
    expect(seatLabel(null)).toBe("Book");
  });
  it("keeps real counts, including a real zero", () => {
    expect(parseSeats("12")).toBe(12);
    expect(parseSeats(0)).toBe(0);
    expect(seatPressure(0)).toBe("sold");
    expect(seatPressure(5)).toBe("low");
  });
});
