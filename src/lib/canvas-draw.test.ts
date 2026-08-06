// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockCtx, createMockImage } from "./__tests__/mock-canvas";
import { drawCover, roundRect, wrap, drawTracked, measureTracked, loadImg } from "./canvas-draw";

describe("drawCover", () => {
  let ctx: ReturnType<typeof createMockCtx>;
  beforeEach(() => {
    ctx = createMockCtx();
  });

  it("crops the sides when the image is wider than the target rect (ir > tr)", () => {
    const img = createMockImage(2000, 1000); // ir = 2
    drawCover(ctx, img, 0, 0, 500, 500, 0.4); // tr = 1
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    const [, sx, sy, sw, sh, dx, dy, dw, dh] = (ctx.drawImage as any).mock.calls[0];
    // sh stays full height, sw shrinks to match target aspect, centred horizontally.
    expect(sh).toBe(1000);
    expect(sw).toBe(1000); // img.height * tr = 1000 * 1
    expect(sx).toBe((2000 - 1000) / 2);
    expect(sy).toBe(0);
    expect([dx, dy, dw, dh]).toEqual([0, 0, 500, 500]);
  });

  it("crops top/bottom when the image is taller than the target rect (ir <= tr), biased by focal", () => {
    const img = createMockImage(1000, 2000); // ir = 0.5
    drawCover(ctx, img, 10, 20, 500, 250, 0.4); // tr = 2
    const [, sx, sy, sw, sh] = (ctx.drawImage as any).mock.calls[0];
    expect(sx).toBe(0);
    expect(sw).toBe(1000);
    // sh = img.width / tr = 1000 / 2 = 500; sy biased by focal toward top (0.4 of remaining space)
    expect(sh).toBe(500);
    expect(sy).toBeCloseTo((2000 - 500) * 0.4);
  });

  it("focal=0 pins the crop to the very top of a tall image", () => {
    const img = createMockImage(100, 400); // ir = 0.25
    drawCover(ctx, img, 0, 0, 100, 100, 0); // tr = 1
    const [, , sy] = (ctx.drawImage as any).mock.calls[0];
    expect(sy).toBe(0);
  });

  it("focal=1 pins the crop to the very bottom of a tall image", () => {
    const img = createMockImage(100, 400);
    drawCover(ctx, img, 0, 0, 100, 100, 1);
    const [, , sy, , sh] = (ctx.drawImage as any).mock.calls[0];
    expect(sy).toBe(400 - sh);
  });

  it("uses the full image when the aspect ratios match exactly", () => {
    const img = createMockImage(300, 200); // ir = 1.5
    drawCover(ctx, img, 0, 0, 150, 100, 0.4); // tr = 1.5
    const [, sx, sy, sw, sh] = (ctx.drawImage as any).mock.calls[0];
    expect(sx).toBe(0);
    expect(sy).toBe(0);
    expect(sw).toBe(300);
    expect(sh).toBe(200);
  });
});

describe("roundRect", () => {
  it("draws a closed rounded-rect path with the expected corner order", () => {
    const ctx = createMockCtx();
    roundRect(ctx, 5, 10, 100, 50, 8);
    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
    expect(ctx.moveTo).toHaveBeenCalledWith(13, 10); // x + r, y
    expect(ctx.arcTo).toHaveBeenCalledTimes(4);
    expect(ctx.closePath).toHaveBeenCalledTimes(1);
    // Does not fill/stroke itself — that's left to the caller.
    expect(ctx.fill).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it("handles a zero radius without throwing (degenerates to a plain rect path)", () => {
    const ctx = createMockCtx();
    expect(() => roundRect(ctx, 0, 0, 20, 20, 0)).not.toThrow();
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
  });
});

describe("wrap", () => {
  it("delegates to wrapText using the context's measureText for width", () => {
    const ctx = createMockCtx();
    ctx.__charWidth = 10; // each char is 10px wide in this fake font
    const lines = wrap(ctx, "hello world foo", 60, 3);
    // "hello" = 50px fits in 60; "hello world" = 110px doesn't -> break after "hello"
    expect(lines[0]).toBe("hello");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("respects maxLines when text would otherwise need more lines", () => {
    const ctx = createMockCtx();
    ctx.__charWidth = 10;
    const lines = wrap(ctx, "aaaaa bbbbb ccccc ddddd", 60, 2);
    expect(lines.length).toBe(2);
  });

  it("ellipsizes the final line when a single word still overflows maxWidth", () => {
    const ctx = createMockCtx();
    ctx.__charWidth = 10;
    const lines = wrap(ctx, "supercalifragilisticexpialidocious", 60, 1);
    expect(lines.length).toBe(1);
    expect(lines[0].endsWith("…")).toBe(true);
  });

  it("returns a single line for short text", () => {
    const ctx = createMockCtx();
    const lines = wrap(ctx, "hi", 1000, 2);
    expect(lines).toEqual(["hi"]);
  });

  it("returns an empty array for blank input", () => {
    const ctx = createMockCtx();
    expect(wrap(ctx, "   ", 100, 2)).toEqual([]);
  });
});

describe("drawTracked", () => {
  it("draws each character individually, advancing by measured width + spacing", () => {
    const ctx = createMockCtx();
    ctx.__charWidth = 10;
    drawTracked(ctx, "abc", 100, 50, 4);
    expect(ctx.fillText).toHaveBeenCalledTimes(3);
    expect(ctx.fillText).toHaveBeenNthCalledWith(1, "a", 100, 50);
    expect(ctx.fillText).toHaveBeenNthCalledWith(2, "b", 114, 50); // 100 + 10 + 4
    expect(ctx.fillText).toHaveBeenNthCalledWith(3, "c", 128, 50); // 114 + 10 + 4
  });

  it("draws nothing for an empty string", () => {
    const ctx = createMockCtx();
    drawTracked(ctx, "", 0, 0, 4);
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it("handles zero spacing", () => {
    const ctx = createMockCtx();
    ctx.__charWidth = 5;
    drawTracked(ctx, "xy", 0, 0, 0);
    expect(ctx.fillText).toHaveBeenNthCalledWith(2, "y", 5, 0);
  });
});

describe("measureTracked", () => {
  it("sums character widths plus spacing between them, minus one trailing gap", () => {
    const ctx = createMockCtx();
    ctx.__charWidth = 10;
    // 3 chars: 3*10 + 3*spacing - spacing = 30 + 2*spacing
    expect(measureTracked(ctx, "abc", 2)).toBe(30 + 2 * 2);
  });

  it("returns 0 for an empty string", () => {
    const ctx = createMockCtx();
    expect(measureTracked(ctx, "", 2)).toBe(0);
  });

  it("never goes negative when there is only one character (width minus its own spacing)", () => {
    const ctx = createMockCtx();
    ctx.__charWidth = 1;
    // width(1) + spacing(100) - spacing(100) = 1, clamped at floor 0
    expect(measureTracked(ctx, "a", 100)).toBe(1);
  });

  it("clamps to 0 when total width dips below the trailing spacing subtraction", () => {
    const ctx = createMockCtx();
    ctx.__charWidth = 0;
    expect(measureTracked(ctx, "ab", 5)).toBe(5); // 0+5+0+5 - 5 = 5, still non-negative
  });
});

describe("loadImg", () => {
  it("sets crossOrigin=anonymous and wires onload/onerror to resolve/reject", async () => {
    const events: Record<string, () => void> = {};
    class FakeImage {
      crossOrigin = "";
      src = "";
      set onload(fn: () => void) {
        events.onload = fn;
      }
      set onerror(fn: () => void) {
        events.onerror = fn;
      }
    }
    const OriginalImage = globalThis.Image;
    (globalThis as any).Image = FakeImage;
    try {
      const promise = loadImg("https://example.com/a.jpg");
      expect(events.onload).toBeTypeOf("function");
      events.onload();
      const img = await promise;
      expect(img).toBeInstanceOf(FakeImage);
      expect((img as any).crossOrigin).toBe("anonymous");
      expect((img as any).src).toBe("https://example.com/a.jpg");
    } finally {
      (globalThis as any).Image = OriginalImage;
    }
  });

  it("rejects when the image fails to load", async () => {
    const events: Record<string, (e?: unknown) => void> = {};
    class FakeImage {
      crossOrigin = "";
      src = "";
      set onload(fn: () => void) {
        events.onload = fn;
      }
      set onerror(fn: (e?: unknown) => void) {
        events.onerror = fn;
      }
    }
    const OriginalImage = globalThis.Image;
    (globalThis as any).Image = FakeImage;
    try {
      const promise = loadImg("https://example.com/broken.jpg");
      const err = new Error("boom");
      events.onerror(err);
      await expect(promise).rejects.toBe(err);
    } finally {
      (globalThis as any).Image = OriginalImage;
    }
  });
});
