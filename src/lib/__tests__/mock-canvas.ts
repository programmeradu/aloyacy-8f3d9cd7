// Minimal, spy-friendly stand-in for CanvasRenderingContext2D. jsdom doesn't
// implement an actual 2D rendering backend, so every share-card / canvas-draw
// test that needs to exercise real drawing math runs against this fake — it
// tracks calls without pretending to rasterize anything.
import { vi } from "vitest";

export function createMockCtx() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake ctx is built incrementally and cast at the end
  const ctx: any = {
    // State the code reads back.
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    textBaseline: "alphabetic",
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",

    // Drawing ops — no-op spies.
    fillRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arcTo: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    clip: vi.fn(),

    // measureText: width approximated deterministically as
    // charCount * 10, tunable per-test via ctx.__charWidth.
    __charWidth: 10,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `this` is the partially-built fake ctx
    measureText: vi.fn(function (this: any, s: string) {
      return { width: s.length * this.__charWidth } as TextMetrics;
    }),

    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
  };
  ctx.measureText = ctx.measureText.bind(ctx);
  return ctx as CanvasRenderingContext2D & { __charWidth: number };
}

/** A fake HTMLImageElement good enough for drawCover's aspect-ratio math. */
export function createMockImage(width: number, height: number): HTMLImageElement {
  return { width, height } as HTMLImageElement;
}
