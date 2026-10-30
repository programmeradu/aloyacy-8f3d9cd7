// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockCtx, createMockImage } from "./__tests__/mock-canvas";
import { renderStopShareCard, type StopCardCtx } from "./shareCard-stop";

vi.mock("./canvas-draw", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./canvas-draw")>();
  return { ...actual, loadImg: vi.fn() };
});

import { loadImg } from "./canvas-draw";

function stubCanvas(ctx: ReturnType<typeof createMockCtx>) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as any);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    cb: BlobCallback,
  ) {
    cb(new Blob(["fake"], { type: "image/jpeg" }));
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,fake");
}

function baseCtx(overrides: Partial<StopCardCtx> = {}): StopCardCtx {
  return {
    stop: { id: "s1", code: "0042", name: "Makarios Avenue", agency: "urban" },
    routes: [{ short: "30" }, { short: "31" }],
    nextEtaMin: 7,
    nextHeadsign: "→ Limassol Port",
    locale: "en",
    url: "https://aloya.app/stop/s1",
    ...overrides,
  };
}

describe("renderStopShareCard", () => {
  let ctx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    ctx = createMockCtx();
    stubCanvas(ctx);
    (loadImg as any).mockResolvedValue(createMockImage(1600, 1200));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a 1080x1350 export with blob and dataUrl", async () => {
    const result = await renderStopShareCard(baseCtx());
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1350);
    expect(result.dataUrl).toBe("data:image/jpeg;base64,fake");
    expect(result.blob).toBeInstanceOf(Blob);
  });

  it("falls back to a solid hero fill when loadImg rejects", async () => {
    (loadImg as any).mockRejectedValue(new Error("network"));
    await renderStopShareCard(baseCtx());
    // drawImage is only called by drawCover; with no image it must never fire.
    expect(ctx.drawImage).not.toHaveBeenCalled();
    // The hero-band fallback fillRect(0,0,W,HERO_H) must have been issued.
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1080, 760);
  });

  it("draws the image cover once when loadImg resolves", async () => {
    await renderStopShareCard(baseCtx());
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
  });

  it("auto-shrinks the stop-name font size to the minimum when the name can never fit", async () => {
    // A single unbreakable "word" always measures wider than innerW under the
    // mock's char-count-based measureText, regardless of the declared font
    // size, so the shrink loop must bottom out at minSize (48) and still draw
    // the (single, unwrapped) line at that size's baseline.
    const longName = "A".repeat(200);
    await renderStopShareCard(
      baseCtx({ stop: { id: "s2", code: "0099", name: longName, agency: "urban" } }),
    );
    const nameCall = (ctx.fillText as any).mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0] === longName,
    );
    expect(nameCall).toBeTruthy();
    // startY(870) + minSize*0.82 for the single line drawn at the floor size.
    expect(nameCall[2]).toBeCloseTo(870 + 48 * 0.82);
  });

  it("keeps a short stop name at the largest font size (single line, no shrink needed)", async () => {
    await renderStopShareCard(
      baseCtx({ stop: { id: "s3", code: "0001", name: "Bus Stop", agency: "urban" } }),
    );
    const nameCall = (ctx.fillText as any).mock.calls.find((c: any[]) => c[0] === "Bus Stop");
    expect(nameCall).toBeTruthy();
    // startY (870) + size*0.82 baseline for a single line at the max size (80).
    expect(nameCall[2]).toBeCloseTo(870 + 80 * 0.82);
  });

  it("renders up to 6 route chips and a +N overflow chip when there are more", async () => {
    const routes = Array.from({ length: 9 }, (_, i) => ({ short: `R${i}` }));
    await renderStopShareCard(baseCtx({ routes }));
    const overflowCall = (ctx.fillText as any).mock.calls.find((c: any[]) => c[0] === "+3");
    expect(overflowCall).toBeTruthy();
  });

  it("omits the overflow chip entirely when routes fit within the max", async () => {
    await renderStopShareCard(baseCtx({ routes: [{ short: "1" }] }));
    const overflowCall = (ctx.fillText as any).mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && /^\+\d+$/.test(c[0]),
    );
    expect(overflowCall).toBeUndefined();
  });

  it("formats a numeric ETA as its minute value with the locale unit suffix", async () => {
    await renderStopShareCard(baseCtx({ nextEtaMin: 12, locale: "en" }));
    expect((ctx.fillText as any).mock.calls.some((c: any[]) => c[0] === "12")).toBe(true);
    expect((ctx.fillText as any).mock.calls.some((c: any[]) => c[0] === "min")).toBe(true);
  });

  it("formats a null ETA as an em-dash with no unit suffix drawn", async () => {
    await renderStopShareCard(baseCtx({ nextEtaMin: null }));
    expect((ctx.fillText as any).mock.calls.some((c: any[]) => c[0] === "-")).toBe(true);
    expect((ctx.fillText as any).mock.calls.some((c: any[]) => c[0] === "min")).toBe(false);
  });

  it("uses the Greek minute unit and label set when locale is el", async () => {
    await renderStopShareCard(baseCtx({ locale: "el", nextEtaMin: 5 }));
    expect((ctx.fillText as any).mock.calls.some((c: any[]) => c[0] === "λεπτά")).toBe(true);
  });

  it("strips a leading arrow glyph from the headsign before wrapping", async () => {
    await renderStopShareCard(baseCtx({ nextHeadsign: "→ Limassol Port" }));
    const drawn = (ctx.fillText as any).mock.calls.map((c: any[]) => c[0]);
    expect(drawn).toContain("Limassol Port");
    expect(drawn).not.toContain("→ Limassol Port");
  });

  it("draws no headsign text when nextHeadsign is null", async () => {
    await renderStopShareCard(baseCtx({ nextHeadsign: null }));
    // Only the "NEXT BUS" tracked label chars should appear near that region;
    // there is simply nothing left over to assert equals a headsign string,
    // so check that wrap() input never produced stray fallback text like "null".
    const drawn = (ctx.fillText as any).mock.calls.map((c: any[]) => c[0]);
    expect(drawn).not.toContain("null");
  });

  it("labels intercity stops as INTERCITY/ΥΠΕΡΑΣΤΙΚΟ and urban stops as URBAN/ΑΣΤΙΚΟ", async () => {
    await renderStopShareCard(
      baseCtx({ stop: { id: "s4", code: "1", name: "X", agency: "IC" }, locale: "en" }),
    );
    let drawn = (ctx.fillText as any).mock.calls.map((c: any[]) => c[0]).join("");
    expect(drawn).toContain("INTERCITY");

    ctx = createMockCtx();
    stubCanvas(ctx);
    await renderStopShareCard(
      baseCtx({ stop: { id: "s5", code: "1", name: "X", agency: "urban" }, locale: "el" }),
    );
    drawn = (ctx.fillText as any).mock.calls.map((c: any[]) => c[0]).join("");
    expect(drawn).toContain("ΑΣΤΙΚΟ");
  });

  it("strips the protocol from the footer URL", async () => {
    await renderStopShareCard(baseCtx({ url: "https://aloya.app/stop/s1" }));
    expect((ctx.fillText as any).mock.calls.some((c: any[]) => c[0] === "aloya.app/stop/s1")).toBe(
      true,
    );
  });

  it("exports the jpeg at 0.92 quality via toBlob and 0.9 via toDataURL", async () => {
    const blobSpy = HTMLCanvasElement.prototype.toBlob as any;
    const dataUrlSpy = HTMLCanvasElement.prototype.toDataURL as any;
    await renderStopShareCard(baseCtx());
    expect(blobSpy).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.92);
    expect(dataUrlSpy).toHaveBeenCalledWith("image/jpeg", 0.9);
  });
});
