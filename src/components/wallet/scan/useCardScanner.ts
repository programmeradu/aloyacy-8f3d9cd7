// Camera + detection loop for the Motion card scanner.
//
// Every ~120 ms: crop the area around the on-screen guide from the video,
// detect the card outline (card-detect.ts). Only when a card-shaped outline
// holds still for 3 frames do we take a full-resolution still, warp it flat,
// check it is sharp, glare-free and mostly white (a Motion card), then decode
// the QR and OCR fixed regions. Values are voted across stills (fields.ts).
import { useCallback, useEffect, useRef, useState } from "react";
import {
  detectCard,
  glareShare,
  quadDrift,
  sharpness,
  toGray,
  warpQuad,
  whiteShare,
  type Quad,
  type Rect,
} from "./card-detect";
import { Voter, uidFromQr, validDate, validName, validUid, type FieldKey } from "./fields";
import { disposeOcr, getOcr, getQr, readRegion } from "./engines";

export type Side = "front" | "back";
export type Phase =
  | "starting"
  | "searching"
  | "holding"
  | "reading"
  | "blurry"
  | "glare"
  | "notcard"
  | "done"
  | "error";

export type Fields = Partial<
  Record<FieldKey, { value: string; conf: number; source: "qr" | "ocr" }>
>;

const WORK_W = 360;
const OUT_W = 1000;
const OUT_H = Math.round(OUT_W / 1.586);
const STABLE_FRAMES = 3;

/** Regions on the flattened card (fractions of width/height). */
const ROI = {
  name: { x: 0.03, y: 0.32, w: 0.58, h: 0.13 },
  date: { x: 0.3, y: 0.63, w: 0.32, h: 0.13 },
  qr: { x: 0.55, y: 0.08, w: 0.43, h: 0.74 },
  uid: { x: 0.03, y: 0.45, w: 0.94, h: 0.52 },
};

function crop(
  src: HTMLCanvasElement,
  r: { x: number; y: number; w: number; h: number },
  scale = 2,
) {
  const c = document.createElement("canvas");
  c.width = Math.round(src.width * r.w * scale);
  c.height = Math.round(src.height * r.h * scale);
  const ctx = c.getContext("2d")!;
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
        void getQr();
      } catch (e) {
        setPhase("error");
        setError(e instanceof Error ? e.message : "Camera unavailable");
      }
    })();
    return () => {
      alive = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
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
        const small = toGray(px, OUT_W, OUT_H);
        if (whiteShare(small) < 0.28) {
          setPhase("notcard");
          return;
        }
        if (glareShare(small) > 0.05) {
          setPhase("glare");
          return;
        }
        if (sharpness(small) < 40) {
          setPhase("blurry");
          return;
        }
        setPhase("reading");
        attempts.current += 1;
        await readSide(flat);
      } finally {
        busy.current = false;
        if (alive) timer = window.setTimeout(frame, 60);
      }
    };

    const phaseDone = () => !!voter.current.accepted.number && sideDone("front");

    const sideDone = (sd: Side) => {
      const a = voter.current.accepted;
      if (sd === "back") return !!a.number;
      return (
        (!!a.holder && !!a.validUntil) || (attempts.current >= 10 && (!!a.holder || !!a.validUntil))
      );
    };

    const publish = () => setFields({ ...voter.current.accepted });

    async function readSide(card: HTMLCanvasElement) {
      const vt = voter.current;
      if (sideRef.current === "front") {
        // QR first: exact when present.
        if (!vt.accepted.number) {
          const det = await getQr();
          const hits = det ? await det.detect(crop(card, ROI.qr, 1)).catch(() => []) : [];
          const uid = hits.map((h) => uidFromQr(h.rawValue)).find(Boolean);
          if (uid) {
            vt.acceptQr(uid);
            buzz([12, 40, 12]);
            publish();
          }
        }
        if (!vt.accepted.holder) {
          const r = await readRegion(crop(card, ROI.name), {
            whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ '-",
            psm: "7",
          });
          const n = validName(r.text);
          if (n && vt.add("holder", n, r.conf)) buzz(12);
        }
        if (!vt.accepted.validUntil) {
          const r = await readRegion(crop(card, ROI.date), { whitelist: "0123456789/", psm: "7" });
          const d = validDate(r.text);
          if (d && vt.add("validUntil", d, r.conf)) buzz(12);
        }
        publish();
        if (sideDone("front")) {
          buzz([20, 60, 20]);
          if (!vt.accepted.number) setSide("back");
          else setPhase("done");
        }
      } else {
        const r = await readRegion(crop(card, ROI.uid, 1.6), {
          whitelist: "0123456789 ",
          psm: "11",
        });
        const u = validUid(r.text);
        if (u && vt.add("number", u, r.conf)) buzz([20, 60, 20]);
        publish();
        if (sideDone("back")) setPhase("done");
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
