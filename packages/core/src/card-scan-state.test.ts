import { describe, it, expect } from "vitest";
import {
  ingestScanFields,
  initialScanState,
  resetHits,
  sideHint,
  skipScanSide,
  PROMOTE_AT,
  type ScanState,
} from "./card-scan-state";

function feed(state: ScanState, side: "front" | "back", fields: Record<string, string>, times = 1) {
  let out = ingestScanFields(state, side, fields);
  for (let i = 1; i < times; i++) out = ingestScanFields(out.state, side, fields);
  return out;
}

describe("card-scan-state", () => {
  it("starts empty", () => {
    const s = initialScanState();
    expect(s.acc).toEqual({});
    expect(s.frontDone).toBe(false);
    expect(s.backDone).toBe(false);
  });

  it("needs two consecutive readings to lock the card number", () => {
    const one = feed(initialScanState(), "back", { number: "1234567890123" });
    expect(one.state.backDone).toBe(false);
    expect(one.promoted).toBeNull();

    const two = ingestScanFields(one.state, "back", { number: "1234567890123" });
    expect(two.state.backDone).toBe(true);
    expect(two.promoted).toBe("back");
  });

  it("resets the counter when the number reading changes", () => {
    const a = feed(initialScanState(), "back", { number: "111" });
    const b = ingestScanFields(a.state, "back", { number: "222" });
    expect(b.state.hits.number).toBe(1);
    expect(b.state.acc.number).toBe("222");
    expect(b.state.backDone).toBe(false);
  });

  it("locks the front when holder and expiry both agree twice", () => {
    const out = feed(initialScanState(), "front", { holder: "A PAPADOPOULOU", validUntil: "12/27" }, PROMOTE_AT);
    expect(out.state.frontDone).toBe(true);
    expect(out.promoted).toBe("front");
  });

  it("locks the front on holder alone after enough observations", () => {
    const out = feed(initialScanState(), "front", { holder: "A PAPADOPOULOU" }, PROMOTE_AT * 2);
    expect(out.state.frontDone).toBe(true);
  });

  it("flips to the other side after a promotion and clears hits", () => {
    const front = feed(initialScanState(), "front", { holder: "X Y", validUntil: "01/30" }, PROMOTE_AT);
    expect(front.nextSide).toBe("back");
    expect(front.state.hits).toEqual({ number: 0, holder: 0, validUntil: 0 });
  });

  it("stays on the same side when the other one is already done", () => {
    const front = feed(initialScanState(), "front", { holder: "X Y", validUntil: "01/30" }, PROMOTE_AT);
    const back = feed(front.state, "back", { number: "999888777" }, PROMOTE_AT);
    expect(back.nextSide).toBe("back");
    expect(back.complete).toBe(true);
  });

  it("is not complete without a card number even when both sides are done", () => {
    const front = feed(initialScanState(), "front", { holder: "X Y", validUntil: "01/30" }, PROMOTE_AT);
    const skipped = skipScanSide(front.state, "back");
    expect(skipped.state.backDone).toBe(true);
    expect(skipped.complete).toBe(false);
  });

  it("skipping the front points the camera at the back", () => {
    const out = skipScanSide(initialScanState(), "front");
    expect(out.nextSide).toBe("back");
    expect(out.promoted).toBeNull();
  });

  it("ignores empty OCR results", () => {
    const out = feed(initialScanState(), "back", {}, 5);
    expect(out.state.acc.number).toBeUndefined();
    expect(out.state.backDone).toBe(false);
  });

  it("resetHits clears counters but keeps captured values", () => {
    const a = feed(initialScanState(), "back", { number: "555" });
    const r = resetHits(a.state);
    expect(r.acc.number).toBe("555");
    expect(r.hits.number).toBe(0);
  });

  it("gives side-specific hint copy without bullet glyphs", () => {
    expect(sideHint("front")).toContain("name");
    expect(sideHint("back")).toContain("digit");
    expect(sideHint("front")).not.toContain("·");
  });
});
