import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import {
  detectCard,
  enhanceText,
  sharpness,
  toGray,
  warpQuad,
  whiteShare,
  type Gray,
  type Rect,
} from "./card-detect";
import {
  maskDigits,
  uidFromBarcode,
  uidFromLine,
  uidFromQr,
  validCategory,
  validDate,
  validName,
  validUid,
} from "./fields";

function load(name: string) {
  const png = PNG.sync.read(readFileSync(join(__dirname, "__fixtures__", name)));
  return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
}

/** The scanner's working crop: guide padded 28%, scaled to 360 px wide. */
function work(img: { data: Uint8ClampedArray; width: number; height: number }, g: Rect) {
  const pad = 0.28;
  const rx = Math.max(0, Math.round(g.x - g.w * pad));
  const ry = Math.max(0, Math.round(g.y - g.h * pad));
  const rw = Math.min(img.width - rx, Math.round(g.w * (1 + 2 * pad)));
  const rh = Math.min(img.height - ry, Math.round(g.h * (1 + 2 * pad)));
  const k = 360 / rw;
  const W = 360;
  const H = Math.round(rh * k);
  const full = toGray(img.data, img.width, img.height);
  const out = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      out[y * W + x] = full.data[Math.floor(ry + y / k) * img.width + Math.floor(rx + x / k)];
  const gray: Gray = { data: out, width: W, height: H };
  return {
    gray,
    guide: { x: (g.x - rx) * k, y: (g.y - ry) * k, w: g.w * k, h: g.h * k },
    k,
    rx,
    ry,
  };
}

const GUIDE: Rect = { x: 352, y: 140, w: 576, h: 576 / 1.586 };

describe("card detection", () => {
  it("finds the Motion card outline on a plaid blanket", () => {
    const img = load("scene_front.png");
    const w = work(img, GUIDE);
    const det = detectCard(w.gray, w.guide);
    expect(det).not.toBeNull();
    expect(Math.abs(det!.ratio - 1.586)).toBeLessThan(0.15);
    // Flattened card is mostly white and sharp.
    const q = det!.quad.map((p) => ({ x: p.x / w.k + w.rx, y: p.y / w.k + w.ry })) as never;
    const flat = warpQuad(img, q, 500, 315);
    const g = toGray(flat, 500, 315);
    expect(whiteShare(g)).toBeGreaterThan(0.28);
    expect(sharpness(g)).toBeGreaterThan(40);
  });
  it("finds the card on dark and light plaid, front and back", () => {
    for (const f of ["card_dark_plaid.png", "card_light_plaid.png", "back_light_plaid.png"]) {
      const img = load(f);
      const w = work(img, GUIDE);
      const det = detectCard(w.gray, w.guide);
      expect(det, f).not.toBeNull();
      expect(Math.abs(det!.ratio - 1.586), f).toBeLessThan(0.15);
    }
  });
  // Photos of a real Motion card held in a hand over a sherpa throw and a
  // tartan blanket, low light (half size, holder photo pixelated out). The
  // back has a bold text block and a coloured band that must not count as
  // a stripe through the card. The guide may sit a little off the card.
  it("finds a real Motion card held in hand, front and back", () => {
    const guides: Record<string, Rect> = {
      "real_front.png": { x: 80, y: 140, w: 381, h: 240 },
      "real_back.png": { x: 55, y: 119, w: 407, h: 257 },
    };
    for (const [f, g0] of Object.entries(guides)) {
      const img = load(f);
      for (const dx of [-15, 0, 15])
        for (const dy of [-12, 0, 12])
          for (const sc of [0.95, 1, 1.05]) {
            const g = {
              x: g0.x + dx + (g0.w * (1 - sc)) / 2,
              y: g0.y + dy + (g0.h * (1 - sc)) / 2,
              w: g0.w * sc,
              h: g0.h * sc,
            };
            const w = work(img, g);
            const det = detectCard(w.gray, w.guide);
            expect(det, `${f} ${dx},${dy} x${sc}`).not.toBeNull();
            expect(Math.abs(det!.ratio - 1.586), f).toBeLessThan(0.15);
          }
      const w = work(img, g0);
      const det = detectCard(w.gray, w.guide)!;
      const q = det.quad.map((p) => ({ x: p.x / w.k + w.rx, y: p.y / w.k + w.ry })) as never;
      const flat = toGray(warpQuad(img, q, 1000, 631), 1000, 631);
      expect(whiteShare(flat), f).toBeGreaterThan(0.28);
    }
  });
  // Samuel's real bug: the old scanner read "SST SY SUIS" off a blanket. No
  // fabric on its own may ever form a card, wherever the guide sits on it.
  it("never finds a card in plaid, tartan, tilted stripes or knit alone", () => {
    const fabrics = [
      "plaid.png",
      "plaid_light.png",
      "plaid_fine.png",
      "plaid_tilted.png",
      "knit.png",
    ];
    for (const f of fabrics) {
      const img = load(f);
      for (const dy of [-100, -50, 0, 50, 100])
        for (const dx of [-120, -40, 0, 40, 120])
          for (const sc of [0.8, 1, 1.2]) {
            const g = { x: GUIDE.x + dx, y: GUIDE.y + dy, w: GUIDE.w * sc, h: GUIDE.h * sc };
            const w = work(img, g);
            expect(detectCard(w.gray, w.guide), `${f} ${dx},${dy} x${sc}`).toBeNull();
          }
    }
  });
});

describe("text prep", () => {
  it("turns faint grey print on white into black on white", () => {
    const W = 40;
    const H = 10;
    const d = new Uint8ClampedArray(W * H).fill(228);
    for (let x = 10; x < 30; x++) for (let y = 3; y < 7; y++) d[y * W + x] = 196;
    const out = enhanceText({ data: d, width: W, height: H });
    expect(out[5 * W + 20]).toBe(0);
    expect(out[0]).toBe(255);
  });
});

describe("field validation", () => {
  it("rejects texture noise and accepts real names", () => {
    expect(validName("SST SY SUIS")).toBeNull();
    expect(validName("SAMUEL ADU BEREKORANG")).toBe("SAMUEL ADU BEREKORANG");
    expect(validName("MOTION BUS CARD")).toBeNull();
    expect(validName("ELENI")).toBeNull();
  });
  it("accepts the real card's initial and hyphenated surname", () => {
    expect(validName("S ADU-BEREKORANG")).toBe("S ADU-BEREKORANG");
    expect(validName("s adu - berekorang")).toBe("S ADU-BEREKORANG");
    expect(validName("A B")).toBeNull();
    expect(validName("ADU-BRK")).toBeNull();
    expect(validName("S T SST")).toBeNull();
  });
  it("reads the category box", () => {
    expect(validCategory("18+ Standard")).toBe("18+ Standard");
    expect(validCategory("18 + Stqndard Standard")).toBe("18+ Standard");
    expect(validCategory("Student")).toBe("Student");
    expect(validCategory("ssss")).toBeNull();
  });
  it("accepts only plausible future dates", () => {
    const now = new Date("2026-10-30");
    expect(validDate("07/05/2036", now)).toBe("07/05/2036");
    expect(validDate("31/02/2030", now)).toBeNull();
    expect(validDate("01/01/2020", now)).toBeNull();
    expect(validDate("01/01/2050", now)).toBeNull();
    // A faint 0 read as 9 is repaired only when the date is impossible as read.
    expect(validDate("07/95/2036", now)).toBe("07/05/2036");
    expect(validDate("07/45/2036", now)).toBeNull();
  });
  it("reads UIDs and QR payloads", () => {
    expect(validUid("4112 3456 7890 12")).toBe("41123456789012");
    expect(validUid("12345")).toBeNull();
    expect(uidFromQr("MOTION:41123456789012")).toBe("41123456789012");
    expect(uidFromLine("UID: 11294169825993 12")).toBe("1129416982599312");
    expect(uidFromLine("ID 11294169825993")).toBe("11294169825993");
    expect(uidFromBarcode("1129416982599312")).toBe("1129416982599312");
    expect(uidFromBarcode("12345")).toBeNull();
  });
  it("masks all but the last four digits", () => {
    expect(maskDigits("4112 3456 7890 12")).toBe(
      "\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u202290 12",
    );
    expect(maskDigits("12")).toBe("12");
  });
});
