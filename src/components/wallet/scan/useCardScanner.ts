// Camera + detection loop for the Motion card scanner.
//
// Every ~120 ms: crop the area around the on-screen guide from the video,
// detect the card outline (card-detect.ts). Only when a card-shaped outline
// holds still for 3 frames do we take a full-resolution still, warp it flat,
// check it is sharp and mostly white (a Motion card), then read fixed regions.
// Values are voted across stills (fields.ts).
//
// The real Motion card (tuned on photos of one, Oct 2026): the front has no
// QR; it carries the name as initial + surname in faint grey thermal print,
// a green category box ("18+ Standard") and "Valid until" with the date. The
// back has the UID printed bold after "UID:" and the same number as a
// vertical 1D barcode at the right edge. So: front step (name, category,
// date), then a flip step (UID from the barcode, else OCR of the UID line).
//
// Privacy: frames live only in memory canvases that are reused every frame.
// The holder photo area is painted over on the flattened front before any
// reading, and no image is ever stored, uploaded or logged.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  detectCard,
  glareShare,
  quadDrift,
  enhanceText,
  quadWidth,
  thinInk,
  sharpness,
  toGray,
  warpQuad,
  whiteShare,
  type Quad,
  type Rect,
} from "./card-detect";
import {
  Voter,
  uidFromBarcode,
  uidFromLine,
  uidFromQr,
  validCategory,
  validDate,
  validName,
  type FieldKey,
  type FieldSource,
} from "./fields";
import { disposeOcr, getCodes, getOcr, readRegion } from "./engines";

export type Side = "front" | "back";
export type Phase =
  | "starting"
  | "searching"
  | "holding"
  | "reading"
  | "blurry"
  | "glare"
  | "notcard"
  | "flip"
  | "done"
  | "error";

export type Fields = Partial<
  Record<FieldKey, { value: string; conf: number; source: FieldSource }>
>;

const WORK_W = 360;
const OUT_W = 1000;
const OUT_H = Math.round(OUT_W / 1.586);
const STABLE_FRAMES = 3;

/** Regions on the flattened card (fractions of width/height), from the real card. */
const ROI = {
  name: { x: 0.14, y: 0.385, w: 0.5, h: 0.08 },
  category: { x: 0.29, y: 0.455, w: 0.33, h: 0.11 },
  date: { x: 0.41, y: 0.643, w: 0.195, h: 0.072 },
  /** Holder photo: painted over before anything reads the front. */
  photo: { x: 0.6, y: 0.17, w: 0.37, h: 0.62 },
  uid: { x: 0.4, y: 0.75, w: 0.57, h: 0.12 },
  /** Vertical 1D barcode at the right edge of the back. */
  barcode: { x: 0.83, y: 0.26, w: 0.16, h: 0.52 },
};
type Roi = { x: number; y: number; w: number; h: number };

type Prep = "plain" | "binary" | "thin";

/**
 * Grey crop of a region, scaled up. "binary" splits ink from card (contrast
 * stretch + Otsu), "thin" thins faint ink by a pixel; both for thermal print.
 */
function crop(src: HTMLCanvasElement, r: Roi, scale = 2, prep: Prep = "plain") {
  const c = document.createElement("canvas");
  c.width = Math.round(src.width * r.w * scale);
  c.height = Math.round(src.height * r.h * scale);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.filter = "grayscale(1) contrast(1.35)";
  ctx.drawImage(
    src,
    src.width * r.x,
    src.height * r.y,
    src.width * r.w,
    src.height * r.h,
    0,
    0,
    c.width,
    c.height,
  );
  ctx.filter = "none";
  if (prep !== "plain") {
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const g = toGray(img.data, c.width, c.height);
    const t = prep === "binary" ? enhanceText(g) : thinInk(g);
    for (let i = 0, j = 0; j < t.length; i += 4, j++) {
      img.data[i] = img.data[i + 1] = img.data[i + 2] = t[j];
    }
    ctx.putImageData(img, 0, 0);
  }
  return c;
}

/** The vertical barcode turned upright (bars standing) for the detector. */
function uprightBarcode(src: HTMLCanvasElement) {
  const r = ROI.barcode;
  const w = Math.round(src.width * r.w);
  const h = Math.round(src.height * r.h);
  const c = document.createElement("canvas");
  c.width = h * 2;
  c.height = w * 2;
  const ctx = c.getContext("2d")!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.drawImage(src, src.width * r.x, src.height * r.y, w, h, -h, -w, h * 2, w * 2);
  return c;
}

export function useCardScanner(opts: {
  /** The guide rectangle in CSS px relative to the video element box. */
  guide: Rect | null;
  enabled: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const guideRef = useRef<Rect | null>(opts.guide);
  guideRef.current = opts.guide;
  const sideRef = useRef<Side>("front");
  const voter = useRef(new Voter());
  const busy = useRef(false);
  const stable = useRef<{ quad: Quad; n: number } | null>(null);
  const attempts = useRef(0);
  const lockedOnce = useRef(false);
  const flipUntil = useRef(0);

  const [side, setSideState] = useState<Side>("front");
  const [phase, setPhase] = useState<Phase>("starting");
  const [quad, setQuad] = useState<Quad | null>(null);
  const [locked, setLocked] = useState(false);
  const [fields, setFields] = useState<Fields>({});
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({
    supported: false,
    on: false,
  });
  const [error, setError] = useState<string | null>(null);

  const setSide = useCallback((s: Side) => {
    sideRef.current = s;
    setSideState(s);
    stable.current = null;
    attempts.current = 0;
    lockedOnce.current = false;
    setLocked(false);
  }, []);

  const buzz = (p: number | number[]) => {
    try {
      navigator.vibrate?.(p);
    } catch {
      /* not supported */
    }
  };

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorch({ supported: true, on: next });
    } catch {
      setTorch({ supported: false, on: false });
    }
  }, [torch.on]);

  // Camera lifecycle: started when enabled, every track stopped on close.
  useEffect(() => {
    if (!opts.enabled) return;
    let alive = true;
    const videoEl = videoRef.current;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorch({ supported: !!caps.torch, on: false });
        setPhase("searching");
        // Warm the engines while the rider lines the card up.
        void getOcr().catch(() => {});
        void getCodes();
      } catch (e) {
        setPhase("error");
        setError(e instanceof Error ? e.message : "Camera unavailable");
      }
    })();
    return () => {
      alive = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoEl) videoEl.srcObject = null;
      void disposeOcr();
    };
  }, [opts.enabled]);

  // Detection loop.
  useEffect(() => {
    if (!opts.enabled) return;
    const work = document.createElement("canvas");
    const big = document.createElement("canvas");
    const flat = document.createElement("canvas");
    flat.width = OUT_W;
    flat.height = OUT_H;
    let timer = 0;
    let alive = true;

    const frame = async () => {
      if (!alive) return;
      const v = videoRef.current;
      const g = guideRef.current;
      if (!v || !g || v.readyState < 2 || !v.videoWidth || busy.current || phaseDone()) {
        timer = window.setTimeout(frame, 160);
        return;
      }
      // Map the CSS guide into video pixels (video is object-fit: cover).
      const box = v.getBoundingClientRect();
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      const s = Math.max(box.width / vw, box.height / vh);
      const offX = (box.width - vw * s) / 2;
      const offY = (box.height - vh * s) / 2;
      const gv = { x: (g.x - offX) / s, y: (g.y - offY) / s, w: g.w / s, h: g.h / s };
      const pad = 0.28;
      const rx = Math.max(0, gv.x - gv.w * pad);
      const ry = Math.max(0, gv.y - gv.h * pad);
      const rw = Math.min(vw - rx, gv.w * (1 + 2 * pad));
      const rh = Math.min(vh - ry, gv.h * (1 + 2 * pad));
      const k = WORK_W / rw;
      work.width = WORK_W;
      work.height = Math.round(rh * k);
      const wctx = work.getContext("2d", { willReadFrequently: true })!;
      wctx.drawImage(v, rx, ry, rw, rh, 0, 0, work.width, work.height);
      const img = wctx.getImageData(0, 0, work.width, work.height);
      const gray = toGray(img.data, img.width, img.height);
      const guideSmall = { x: (gv.x - rx) * k, y: (gv.y - ry) * k, w: gv.w * k, h: gv.h * k };
      const det = detectCard(gray, guideSmall);
      if (!det) {
        stable.current = null;
        setQuad(null);
        setLocked(false);
        setPhase((p) => (p === "reading" ? p : "searching"));
        timer = window.setTimeout(frame, 120);
        return;
      }
      // Card outline in CSS px for the overlay.
      const toCss = (p: { x: number; y: number }) => ({
        x: (p.x / k + rx) * s + offX,
        y: (p.y / k + ry) * s + offY,
      });
      setQuad(det.quad.map(toCss) as Quad);
      const prev = stable.current;
      if (prev && quadDrift(prev.quad, det.quad, guideSmall.w) < 0.03) {
        stable.current = { quad: det.quad, n: prev.n + 1 };
      } else {
        stable.current = { quad: det.quad, n: 1 };
      }
      if (stable.current.n < STABLE_FRAMES) {
        setPhase("holding");
        timer = window.setTimeout(frame, 110);
        return;
      }
      if (!lockedOnce.current) {
        lockedOnce.current = true;
        buzz(18);
      }
      setLocked(true);

      // Full-resolution still of the region, quad scaled to it, then flatten.
      busy.current = true;
      try {
        big.width = Math.round(rw);
        big.height = Math.round(rh);
        const bctx = big.getContext("2d", { willReadFrequently: true })!;
        bctx.drawImage(v, rx, ry, rw, rh, 0, 0, big.width, big.height);
        const src = bctx.getImageData(0, 0, big.width, big.height);
        const q = det.quad.map((p) => ({ x: p.x / k, y: p.y / k })) as Quad;
        const px = warpQuad(src, q, OUT_W, OUT_H);
        const fctx = flat.getContext("2d")!;
        fctx.putImageData(new ImageData(px, OUT_W, OUT_H), 0, 0);
        if (sideRef.current === "front") {
          // The holder photo never reaches any reader.
          const r = ROI.photo;
          fctx.fillStyle = "#fff";
          fctx.fillRect(OUT_W * r.x, OUT_H * r.y, OUT_W * r.w, OUT_H * r.h);
        }
        const small = toGray(px, OUT_W, OUT_H);
        if (whiteShare(small) < 0.28) {
          setPhase("notcard");
          return;
        }
        // Clipped pixels alone are not glare: a card's printed white (the QR
        // panel, a cream face under bright light) clips on most phone cameras.
        // So read anyway, and only ask for a tilt when a glary frame read nothing.
        const glary = glareShare(small) > 0.05;
        // The flat card is 1000 px wide; a card seen smaller than that is
        // upscaled and reads softer, so the bar drops with its real size.
        const native = quadWidth(q);
        const minSharp = 40 * Math.min(1, Math.pow(native / 700, 1.5));
        if (sharpness(small) < Math.max(12, minSharp)) {
          setPhase("blurry");
          return;
        }
        setPhase("reading");
        attempts.current += 1;
        const before = Object.values(voter.current.accepted).filter(Boolean).length;
        await readSide(flat);
        const after = Object.values(voter.current.accepted).filter(Boolean).length;
        if (glary && after === before && attempts.current >= 3 && !sideDone(sideRef.current))
          setPhase("glare");
      } finally {
        busy.current = false;
        if (alive) timer = window.setTimeout(frame, 60);
      }
    };

    const phaseDone = () =>
      (!!voter.current.accepted.number && sideDone("front")) || flipUntil.current > Date.now();

    const sideDone = (sd: Side) => {
      const a = voter.current.accepted;
      if (sd === "back") return !!a.number;
      // Category is a bonus: name and date are what the front is for.
      return (
        (!!a.holder && !!a.validUntil) || (attempts.current >= 10 && (!!a.holder || !!a.validUntil))
      );
    };

    const publish = () => setFields({ ...voter.current.accepted });

    const vote = (key: FieldKey, v: string | null, conf: number) => {
      if (v && voter.current.add(key, v, conf)) buzz(12);
    };

    async function readSide(card: HTMLCanvasElement) {
      const vt = voter.current;
      if (sideRef.current === "front") {
        // Optional: a QR on other card prints is exact when present.
        if (!vt.accepted.number && attempts.current % 3 === 1) {
          const det = await getCodes();
          const hits = det ? await det.detect(card).catch(() => []) : [];
          const uid = hits
            .filter((h) => !h.format || h.format === "qr_code")
            .map((h) => uidFromQr(h.rawValue))
            .find(Boolean);
          if (uid) vt.acceptExact(uid, "qr");
        }
        // Faint thermal print. Each field is read twice per frame in ways
        // that fail differently, so one frame where both agree is enough and
        // noise never agrees: the name plain and thresholded, the date
        // thinned at two scales (a faint 5 reads as 8 or 9 until thinned).
        for (const prep of ["plain", "binary"] as const) {
          if (vt.accepted.holder) break;
          const r = await readRegion(crop(card, ROI.name, 2, prep), {
            whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ '-",
            psm: "7",
          });
          vote("holder", validName(r.text), r.conf);
        }
        for (const sc of [1.5, 2]) {
          if (vt.accepted.validUntil) break;
          const r = await readRegion(crop(card, ROI.date, sc, "thin"), {
            whitelist: "0123456789/",
            psm: "7",
          });
          vote("validUntil", validDate(r.text), r.conf);
        }
        for (const sc of [2, 1.5]) {
          if (vt.accepted.category) break;
          const r = await readRegion(crop(card, ROI.category, sc), {
            whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+ ",
            psm: "7",
          });
          vote("category", validCategory(r.text), r.conf);
        }
        publish();
        if (sideDone("front")) {
          buzz([20, 60, 20]);
          if (!vt.accepted.number) {
            setSide("back");
            // Give the rider a moment to turn the card before reading again.
            flipUntil.current = Date.now() + 1600;
            setPhase("flip");
          } else setPhase("done");
        }
      } else {
        // The barcode is exact; the printed UID line is the fallback.
        const det = await getCodes();
        if (det) {
          for (const src of [uprightBarcode(card), card]) {
            const hits = await det.detect(src).catch(() => []);
            const uid = hits.map((h) => uidFromBarcode(h.rawValue)).find(Boolean);
            if (uid) {
              vt.acceptExact(uid, "barcode");
              break;
            }
          }
        }
        // The bold UID line read four ways (plain and thinned, three scales).
        // OCR slips differ between them, so a value two reads agree on is
        // the printed one; a doubled digit (17 digits) is thrown away.
        for (const [sc, prep] of [
          [1.5, "thin"],
          [1, "plain"],
          [2, "thin"],
          [1.5, "plain"],
        ] as const) {
          if (vt.accepted.number) break;
          const r = await readRegion(crop(card, ROI.uid, sc, prep), {
            whitelist: "0123456789UID: ",
            psm: "7",
          });
          vote("number", uidFromLine(r.text), r.conf);
        }
        publish();
        if (sideDone("back")) {
          buzz([20, 60, 20]);
          setPhase("done");
        }
      }
    }

    timer = window.setTimeout(frame, 300);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [opts.enabled, setSide]);

  return { videoRef, side, setSide, phase, quad, locked, fields, torch, toggleTorch, error };
}
