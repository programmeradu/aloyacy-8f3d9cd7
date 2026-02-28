import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { IconClose } from "@/components/Icons";
import { readPass, writePass, formatCardNumber, type MotionPass } from "@/lib/motion-pass";

/* ============================================================
 * Card Scan Sheet — live camera + on-device OCR (Tesseract.js).
 *
 * Two-sided capture:
 *   • FRONT  → cardholder name + valid-until date
 *   • BACK   → 14–16 digit UID (anything shorter is rejected)
 *
 * The user picks a side; the scanner only looks for the fields that
 * live on that side, then auto-advances / auto-closes when done.
 * ============================================================ */

type Side = "front" | "back";

type Detected = {
  number?: string;
  holder?: string;
  validUntil?: string;
};

// UID is 14–16 consecutive digits (spaces tolerated between groups).
const UID_RE = /(?:\d[\s-]?){14,16}/;
const DATE_RE = /\b(\d{2}\/\d{2}\/\d{2,4})\b/;
const NAME_RE = /\b([A-Z]{2,}(?:\s+[A-Z]{2,}){1,3})\b/;

export function CardScanSheet({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<any>(null);
  const runningRef = useRef(true);
  const sideRef = useRef<Side>("front");
  const accRef = useRef<Detected>({});
  const hitsRef = useRef({ number: 0, holder: 0, validUntil: 0 });
  const [side, setSide] = useState<Side>("front");
  const [detected, setDetected] = useState<Detected>({});
  const [status, setStatus] = useState<"loading" | "scanning" | "locked" | "error">("loading");
  const [errMsg, setErrMsg] = useState<string>("");
  const frontDoneRef = useRef(false);
  const backDoneRef = useRef(false);

  function switchSide(next: Side) {
    sideRef.current = next;
    setSide(next);
    // reset per-side hit counters so we don't cross-contaminate
    hitsRef.current = { number: 0, holder: 0, validUntil: 0 };
  }

  function finishIfComplete() {
    if (!frontDoneRef.current || !backDoneRef.current) return;
    const acc = accRef.current;
    if (!acc.number) return;
    const current = readPass();
    const next: MotionPass = {
      ...current,
      number: formatCardNumber(acc.number),
      holder: acc.holder ?? current.holder,
      validUntil: acc.validUntil ?? current.validUntil,
    };
    writePass(next);
    setStatus("locked");
    toast.success("Card captured");
    setTimeout(() => onClose(), 800);
  }

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        const Tesseract = await import("tesseract.js");
        const worker = await Tesseract.createWorker("eng", 1, {
          workerPath: "https://unpkg.com/tesseract.js@v7.0.0/dist/worker.min.js",
          corePath: "https://unpkg.com/tesseract.js-core@v6.0.0",
          langPath: "https://tessdata.projectnaptha.com/4.0.0",
        });
        await worker.setParameters({
          tessedit_char_whitelist:
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 /:.-",
        });
        workerRef.current = worker;
        setStatus("scanning");
        loop();
      } catch (e: any) {
        setStatus("error");
        setErrMsg(e?.message ?? "Camera unavailable");
      }
    }

    async function loop() {
      while (runningRef.current) {
        await new Promise((r) => setTimeout(r, 900));
        if (!runningRef.current) break;
        const v = videoRef.current;
        const c = canvasRef.current;
        const w = workerRef.current;
        if (!v || !c || !w || v.readyState < 2) continue;
        const vw = v.videoWidth;
        const vh = v.videoHeight;
        if (!vw || !vh) continue;
        const cw = Math.min(vw, 900);
        const ch = Math.round(cw / 1.586);
        c.width = cw;
        c.height = ch;
        const ctx = c.getContext("2d");
        if (!ctx) continue;
        const sx = (vw - cw) / 2;
        const sy = (vh - ch) / 2;
        ctx.drawImage(v, sx, sy, cw, ch, 0, 0, cw, ch);
        try {
          const { data } = await w.recognize(c);
          const text: string = (data?.text ?? "").toUpperCase();
          const acc = accRef.current;
          const hits = hitsRef.current;
          const currentSide = sideRef.current;

          if (currentSide === "back") {
            // UID — must be 14–16 digits, contiguous (after stripping separators).
            const m = text.match(UID_RE);
            if (m) {
              const digits = m[0].replace(/\D/g, "");
              if (digits.length >= 14 && digits.length <= 16) {
                if (acc.number === digits) hits.number++;
                else { acc.number = digits; hits.number = 1; }
                if (hits.number >= 2 && !backDoneRef.current) {
                  backDoneRef.current = true;
                  if (!frontDoneRef.current) {
                    toast.success("Back captured — flip to the front");
                    switchSide("front");
                  } else {
                    finishIfComplete();
                  }
                }
              }
            }
          } else {
            // FRONT — name + date
            if (!acc.validUntil || hits.validUntil < 2) {
              const dateMatch = text.match(DATE_RE);
              if (dateMatch) {
                if (acc.validUntil === dateMatch[1]) hits.validUntil++;
                else { acc.validUntil = dateMatch[1]; hits.validUntil = 1; }
              }
            }
            if (!acc.holder || hits.holder < 2) {
              const cleaned = text
                .split("\n")
                .filter((l) => !/MOTION|VALID|CARD|BUS|CYPRUS|ΜΕΧΡΙ|ΙΣΧΥΕΙ/.test(l))
                .join("\n");
              const nameMatch = cleaned.match(NAME_RE);
              if (nameMatch) {
                const candidate = nameMatch[1].trim();
                if (acc.holder === candidate) hits.holder++;
                else { acc.holder = candidate; hits.holder = 1; }
              }
            }
            const nameOk = !!acc.holder && hits.holder >= 2;
            const dateOk = !!acc.validUntil && hits.validUntil >= 2;
            if ((nameOk || dateOk) && (nameOk && dateOk || hits.holder + hits.validUntil >= 4)) {
              if (!frontDoneRef.current) {
                frontDoneRef.current = true;
                if (!backDoneRef.current) {
                  toast.success("Front captured — flip to the back");
                  switchSide("back");
                } else {
                  finishIfComplete();
                }
              }
            }
          }
          setDetected({ ...acc });
        } catch {
          // ignore single-frame errors
        }
      }
    }

    start();
    return () => {
      runningRef.current = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (workerRef.current) workerRef.current.terminate().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (typeof document === "undefined") return null;

  const sideHint =
    side === "front"
      ? "Front · name & valid-until"
      : "Back · 14–16 digit UID";

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-ink/95 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between px-5 pt-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-limestone/70">
          Scan your card
        </p>
        <button
          onClick={() => { runningRef.current = false; onClose(); }}
          aria-label="Close scanner"
          className="flex size-10 items-center justify-center rounded-full bg-limestone/10 text-limestone ring-1 ring-limestone/20"
        >
          <IconClose className="size-4" />
        </button>
      </div>

      {/* Side toggle */}
      <div className="mx-5 mt-3 grid grid-cols-2 gap-1 rounded-full bg-limestone/10 p-1 ring-1 ring-limestone/15">
        {(["front", "back"] as const).map((s) => {
          const active = side === s;
          const done = s === "front" ? frontDoneRef.current : backDoneRef.current;
          return (
            <button
              key={s}
              onClick={() => switchSide(s)}
              className={`rounded-full px-3 py-2 font-mono text-[10px] uppercase tracking-[0.22em] transition ${
                active ? "bg-ochre text-ink" : "text-limestone/70"
              }`}
            >
              {s} {done ? "✓" : ""}
            </button>
          );
        })}
      </div>

      <div className="relative flex-1 mx-5 my-4 overflow-hidden rounded-[24px] ring-1 ring-limestone/20 bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 size-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-6">
          <div className="relative w-full max-w-[420px] aspect-[1.586/1]">
            {(["tl","tr","bl","br"] as const).map((p) => (
              <span
                key={p}
                className="absolute size-8 border-ochre"
                style={{
                  top: p.startsWith("t") ? 0 : "auto",
                  bottom: p.startsWith("b") ? 0 : "auto",
                  left: p.endsWith("l") ? 0 : "auto",
                  right: p.endsWith("r") ? 0 : "auto",
                  borderTopWidth: p.startsWith("t") ? 3 : 0,
                  borderBottomWidth: p.startsWith("b") ? 3 : 0,
                  borderLeftWidth: p.endsWith("l") ? 3 : 0,
                  borderRightWidth: p.endsWith("r") ? 3 : 0,
                  borderRadius: 6,
                }}
              />
            ))}
            {status === "scanning" && (
              <span
                className="absolute left-2 right-2 h-px bg-ochre/80 shadow-[0_0_12px_2px_var(--color-ochre)]"
                style={{ animation: "scanSweep 1.8s ease-in-out infinite" }}
              />
            )}
          </div>
        </div>

        <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-ink/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-limestone backdrop-blur">
          {status === "loading" && "Starting camera"}
          {status === "scanning" && sideHint}
          {status === "locked" && "Captured"}
          {status === "error" && (errMsg || "Camera unavailable")}
        </div>
      </div>

      <div className="px-5 pb-7 space-y-2">
        <FieldRow
          label="UID (back · 14–16 digits)"
          value={detected.number ? formatCardNumber(detected.number) : ""}
        />
        <FieldRow label="Name (front)" value={detected.holder ?? ""} />
        <FieldRow label="Valid until (front)" value={detected.validUntil ?? ""} />
        <p className="pt-3 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-limestone/50">
          Hold steady · entire card in frame
        </p>
      </div>

      <style>{`
        @keyframes scanSweep {
          0% { top: 4%; opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { top: 96%; opacity: 0; }
        }
      `}</style>
    </div>,
    document.body,
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  const has = value.length > 0;
  return (
    <div className="flex items-baseline justify-between gap-4 rounded-2xl bg-limestone/5 ring-1 ring-limestone/10 px-4 py-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-limestone/60">
        {label}
      </span>
      <span
        className={`font-mono text-[13px] truncate transition-colors ${
          has ? "text-ochre" : "text-limestone/30"
        }`}
      >
        {has ? value : "—"}
      </span>
    </div>
  );
}
