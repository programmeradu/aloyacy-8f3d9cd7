// Heavy engines for the scanner, loaded lazily only when it opens and served
// from this site (/ocr/...), so after the first use they work offline (the
// service worker caches /ocr/ and Tesseract keeps its language data in
// IndexedDB).
import type { Worker as TesseractWorker } from "tesseract.js";

let workerP: Promise<TesseractWorker> | null = null;

export function getOcr(): Promise<TesseractWorker> {
  if (!workerP) {
    workerP = (async () => {
      const T = await import("tesseract.js");
      const w = await T.createWorker("eng", 1, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr/core",
        langPath: "/ocr/lang",
        workerBlobURL: false,
      });
      return w;
    })().catch((e) => {
      workerP = null;
      throw e;
    });
  }
  return workerP;
}

export async function disposeOcr() {
  const p = workerP;
  workerP = null;
  if (p) (await p.catch(() => null))?.terminate().catch(() => {});
}

export type OcrLine = { text: string; conf: number };

/** OCR one region as a single line (PSM 7) or sparse text (PSM 11). */
export async function readRegion(
  canvas: HTMLCanvasElement,
  opts: { whitelist: string; psm: "7" | "11" | "6" },
): Promise<OcrLine> {
  const w = await getOcr();
  await w.setParameters({
    tessedit_char_whitelist: opts.whitelist,
    tessedit_pageseg_mode: opts.psm as never,
    preserve_interword_spaces: "1",
  });
  const { data } = await w.recognize(canvas);
  return { text: (data?.text ?? "").trim(), conf: Math.round(data?.confidence ?? 0) };
}

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
let qrP: Promise<Detector | null> | null = null;

/** Native BarcodeDetector where it exists, else the zxing-wasm ponyfill. */
export function getQr(): Promise<Detector | null> {
  if (!qrP) {
    qrP = (async () => {
      const Native = (globalThis as unknown as { BarcodeDetector?: new (o: unknown) => Detector })
        .BarcodeDetector;
      if (Native) {
        try {
          return new Native({ formats: ["qr_code"] });
        } catch {
          /* fall through to the ponyfill */
        }
      }
      const mod = await import("barcode-detector/ponyfill");
      mod.setZXingModuleOverrides({
        locateFile: (path: string, prefix: string) =>
          path.endsWith(".wasm") ? "/ocr/zxing_reader.wasm" : prefix + path,
      });
      return new mod.BarcodeDetector({ formats: ["qr_code"] }) as unknown as Detector;
    })().catch(() => null);
  }
  return qrP;
}
