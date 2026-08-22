import { describe, expect, it } from "vitest";
import {
  WALKABLE_M,
  fmtMin,
  fmtTime,
  fmtWalk,
  prettyRoute,
  shortStop,
} from "../kapnos-format";

describe("fmtWalk", () => {
  it("rounds short walks to the nearest ten metres", () => {
    expect(fmtWalk(0)).toBe("0 m");
    expect(fmtWalk(114)).toBe("110 m");
    expect(fmtWalk(115)).toBe("120 m");
    expect(fmtWalk(949)).toBe("950 m");
  });

  it("switches to kilometres at the 950 m boundary", () => {
    expect(fmtWalk(950)).toBe("0.9 km");
    expect(fmtWalk(1_240)).toBe("1.2 km");
    expect(fmtWalk(12_345)).toBe("12.3 km");
  });
});

describe("fmtTime", () => {
  it("takes the HH:MM out of a local timestamp", () => {
    expect(fmtTime("2026-08-23 14:05:00")).toBe("14:05");
  });

  it("returns an empty string rather than throwing on odd input", () => {
    expect(fmtTime("2026-08-23")).toBe("");
    expect(fmtTime("")).toBe("");
  });
});

describe("fmtMin", () => {
  it("rounds to whole minutes", () => {
    expect(fmtMin(600)).toBe(10);
    expect(fmtMin(629)).toBe(10);
    expect(fmtMin(630)).toBe(11);
  });

  it("never reports a leg as zero minutes", () => {
    expect(fmtMin(1)).toBe(1);
    expect(fmtMin(0)).toBe(1);
  });
});

describe("prettyRoute", () => {
  it("title-cases each hop and joins with an arrow", () => {
    expect(prettyRoute("LARNACA > NICOSIA")).toBe("Larnaca → Nicosia");
    expect(prettyRoute("PAPHOS>LIMASSOL>LARNACA")).toBe("Paphos → Limassol → Larnaca");
  });

  it("passes a single segment through", () => {
    expect(prettyRoute("LARNACA")).toBe("Larnaca");
  });
});

describe("shortStop", () => {
  it("drops a leading stop code", () => {
    expect(shortStop("(A12) Finikoudes")).toBe("Finikoudes");
    expect(shortStop("(LCA1)  Airport Terminal ")).toBe("Airport Terminal");
  });

  it("leaves names without a code untouched", () => {
    expect(shortStop("Solomou Square")).toBe("Solomou Square");
  });
});

describe("WALKABLE_M", () => {
  it("is the documented 1.2 km connection limit", () => {
    expect(WALKABLE_M).toBe(1_200);
  });
});
