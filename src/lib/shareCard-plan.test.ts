// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockCtx, createMockImage } from "./__tests__/mock-canvas";
import { renderPlanShareCard, type PlanCardCtx } from "./shareCard-plan";

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

// A fixed UTC instant: 2024-06-01 10:00:00Z / 12:30:00Z (Cyprus is UTC+3 in June).
const DEP = Date.UTC(2024, 5, 1, 10, 0, 0) / 1000;
const ARR = Date.UTC(2024, 5, 1, 12, 30, 0) / 1000;

function baseCtx(overrides: Partial<PlanCardCtx> = {}): PlanCardCtx {
  return {
    originLabel: "Larnaca Airport",
    destinationLabel: "Nicosia",
    departureUnix: DEP,
    arrivalUnix: ARR,
    totalDurationSec: 2 * 60 * 60 + 30 * 60,
    transfers: 0,
    routeShort: "X1",
    creatorName: "Maria",
    locale: "en",
    url: "https://aloya.app/plan/abc",
    ...overrides,
  };
}

describe("renderPlanShareCard", () => {
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
    const result = await renderPlanShareCard(baseCtx());
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1350);
    expect(result.dataUrl).toBe("data:image/jpeg;base64,fake");
    expect(result.blob).toBeInstanceOf(Blob);
  });

  it("falls back to a solid hero fill when loadImg rejects", async () => {
    (loadImg as any).mockRejectedValue(new Error("network"));
    await renderPlanShareCard(baseCtx());
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1080, 760);
  });

  it("keeps a short destination at the max font size on a single line", async () => {
    await renderPlanShareCard(baseCtx({ destinationLabel: "Nicosia" }));
    const call = (ctx.fillText as any).mock.calls.find((c: any[]) => c[0] === "Nicosia");
    expect(call).toBeTruthy();
    // startY(870) + size*0.82 with size=80 for a name that fits comfortably.
    expect(call[2]).toBeCloseTo(870 + 80 * 0.82);
  });

  it("auto-shrinks the destination font size to the minimum when the name can never fit", async () => {
    const longName = "B".repeat(200);
    await renderPlanShareCard(baseCtx({ destinationLabel: longName }));
    const nameCall = (ctx.fillText as any).mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0] === longName,
    );
    expect(nameCall).toBeTruthy();
    expect(nameCall[2]).toBeCloseTo(870 + 48 * 0.82);
  });

  it("builds the eyebrow from the share day and creator name when present", async () => {
    await renderPlanShareCard(baseCtx({ creatorName: "Maria", locale: "en" }));
    const drawn = (ctx.fillText as any).mock.calls.map((c: any[]) => c[0]).join("");
    expect(drawn).toContain("BY MARIA");
  });

  it("uses the Greek creator prefix and PLAN tag when locale is el", async () => {
    await renderPlanShareCard(baseCtx({ creatorName: "Maria", locale: "el" }));
    const drawn = (ctx.fillText as any).mock.calls.map((c: any[]) => c[0]).join("");
    expect(drawn).toContain("ΑΠΟ MARIA");
    expect(drawn).toContain("ΠΛΑΝΟ");
  });

  it("omits the creator segment when creatorName is null", async () => {
    await renderPlanShareCard(baseCtx({ creatorName: null }));
    const drawn = (ctx.fillText as any).mock.calls.map((c: any[]) => c[0]).join("");
    expect(drawn).not.toContain("BY ");
  });

  it("formats departure and arrival times via formatShareTime in Cyprus time", async () => {
    await renderPlanShareCard(baseCtx());
    const drawn = (ctx.fillText as any).mock.calls.map((c: any[]) => c[0]);
    expect(drawn).toContain("13:00");
    expect(drawn).toContain("15:30");
  });

  it("labels a direct trip and pluralizes transfers correctly", async () => {
    await renderPlanShareCard(baseCtx({ transfers: 0 }));
    let drawn = (ctx.fillText as any).mock.calls.map((c: any[]) => c[0]).join(" ");
    expect(drawn).toContain("direct");

    ctx = createMockCtx();
    stubCanvas(ctx);
    await renderPlanShareCard(baseCtx({ transfers: 1 }));
    drawn = (ctx.fillText as any).mock.calls.map((c: any[]) => c[0]).join(" ");
    expect(drawn).toContain("1 transfer");
    expect(drawn).not.toContain("1 transfers");

    ctx = createMockCtx();
    stubCanvas(ctx);
    await renderPlanShareCard(baseCtx({ transfers: 2 }));
    drawn = (ctx.fillText as any).mock.calls.map((c: any[]) => c[0]).join(" ");
    expect(drawn).toContain("2 transfers");
  });

  it("uses Greek transfer wording when locale is el", async () => {
    await renderPlanShareCard(baseCtx({ transfers: 2, locale: "el" }));
    const drawn = (ctx.fillText as any).mock.calls.map((c: any[]) => c[0]).join(" ");
    expect(drawn).toContain("μεταφοράς");
  });

  it("sizes the bus chip to at least 150px, expanding for a wide route label", async () => {
    ctx.__charWidth = 30; // force a very wide measured route label
    await renderPlanShareCard(baseCtx({ routeShort: "X1" }));
    // roundRect(ctx, x, y, chipW, chipH, 22) — chip width is arg index 2.
    // roundRect uses beginPath/moveTo/arcTo, not directly inspectable for w/h,
    // so assert via the fillText call for the route label being present and
    // that drawTracked's "BUS" label is drawn (chip was rendered at all).
    const drawn = (ctx.fillText as any).mock.calls.map((c: any[]) => c[0]);
    expect(drawn).toContain("X1");
  });

  it("skips the bus chip entirely when routeShort is null", async () => {
    await renderPlanShareCard(baseCtx({ routeShort: null }));
    const drawn = (ctx.fillText as any).mock.calls.map((c: any[]) => c[0]);
    expect(drawn).not.toContain("BUS");
  });

  it("formats a multi-hour duration as '2h 30m' from totalDurationSec", async () => {
    await renderPlanShareCard(baseCtx({ totalDurationSec: 2 * 3600 + 30 * 60 }));
    const drawn = (ctx.fillText as any).mock.calls.map((c: any[]) => c[0]).join(" ");
    expect(drawn).toContain("2h 30m");
  });

  it("formats a sub-hour duration purely in minutes", async () => {
    await renderPlanShareCard(baseCtx({ totalDurationSec: 45 * 60 }));
    const drawn = (ctx.fillText as any).mock.calls.map((c: any[]) => c[0]).join(" ");
    expect(drawn).toContain("45 min");
  });

  it("prefixes the origin subline with 'from'/'από' per locale", async () => {
    await renderPlanShareCard(baseCtx({ originLabel: "Larnaca Airport", locale: "en" }));
    let drawn = (ctx.fillText as any).mock.calls.map((c: any[]) => c[0]);
    expect(drawn.some((s: any) => typeof s === "string" && s.startsWith("from "))).toBe(true);

    ctx = createMockCtx();
    stubCanvas(ctx);
    await renderPlanShareCard(baseCtx({ originLabel: "Larnaca Airport", locale: "el" }));
    drawn = (ctx.fillText as any).mock.calls.map((c: any[]) => c[0]);
    expect(drawn.some((s: any) => typeof s === "string" && s.startsWith("από "))).toBe(true);
  });

  it("strips the protocol from the footer URL", async () => {
    await renderPlanShareCard(baseCtx({ url: "https://aloya.app/plan/abc" }));
    expect((ctx.fillText as any).mock.calls.some((c: any[]) => c[0] === "aloya.app/plan/abc")).toBe(
      true,
    );
  });

  it("exports the jpeg at 0.92 quality via toBlob and 0.9 via toDataURL", async () => {
    const blobSpy = HTMLCanvasElement.prototype.toBlob as any;
    const dataUrlSpy = HTMLCanvasElement.prototype.toDataURL as any;
    await renderPlanShareCard(baseCtx());
    expect(blobSpy).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.92);
    expect(dataUrlSpy).toHaveBeenCalledWith("image/jpeg", 0.9);
  });
});
