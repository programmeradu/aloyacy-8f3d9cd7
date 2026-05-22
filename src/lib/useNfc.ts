// Native NFC tap-to-read for the Motion card.
//
// Capability matrix:
//   - Android + Chrome/Edge ≥ 89: Web NFC (NDEFReader) is available.
//     scan() emits a `reading` event whose `serialNumber` is the chip UID
//     (lowercase hex, colon-separated). We strip that to the digits that
//     match what's printed on the card back.
//   - iOS Safari, Firefox, desktop: no Web NFC. Hook reports unsupported
//     and the UI falls back to manual entry.
//
// Web NFC only exposes the chip UID — it cannot decrypt the DESFire
// balance file (that's locked to JCC's validator keys). Balance still
// comes from the JCC sync.

import { useCallback, useEffect, useRef, useState } from "react";

type NfcStatus = "idle" | "scanning" | "success" | "error" | "unsupported";

// Minimal types — TS lib doesn't ship Web NFC.
type NdefReadingEvent = Event & {
  serialNumber?: string;
  message?: { records?: Array<{ recordType?: string; data?: ArrayBuffer }> };
};
type NdefReader = {
  scan: (opts?: { signal?: AbortSignal }) => Promise<void>;
  addEventListener: (
    type: "reading" | "readingerror",
    handler: (ev: NdefReadingEvent) => void,
  ) => void;
  removeEventListener: (
    type: "reading" | "readingerror",
    handler: (ev: NdefReadingEvent) => void,
  ) => void;
};

declare global {
  interface Window {
    NDEFReader?: new () => NdefReader;
  }
}

/**
 * Convert "04:a3:1f:..." chip serial into the printed UID (digits only).
 * Motion cards print the decimal UID (e.g. "11294169825993 12") which is
 * derived from the chip serial. For most users the bytes-as-hex form is what
 * NDEFReader returns; we keep both and let callers pick.
 */
function normalizeSerial(raw: string): { hex: string; digits: string } {
  const hex = raw.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  // Treat the hex as a big-endian integer and decimalize. UIDs are 7–10
  // bytes, fits comfortably in BigInt.
  let digits = "";
  try {
    digits = hex ? BigInt(`0x${hex}`).toString(10) : "";
  } catch {
    digits = "";
  }
  return { hex, digits };
}

export function useNfcScan() {
  const [status, setStatus] = useState<NfcStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastUid, setLastUid] = useState<{ hex: string; digits: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const supported =
    typeof window !== "undefined" && typeof window.NDEFReader === "function";

  useEffect(() => {
    if (!supported) setStatus("unsupported");
  }, [supported]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus((s) => (s === "scanning" ? "idle" : s));
  }, []);

  const scan = useCallback(async () => {
    if (!supported || !window.NDEFReader) {
      setStatus("unsupported");
      setError("Tap-to-scan needs Chrome on an NFC Android phone.");
      return null;
    }
    setError(null);
    setStatus("scanning");
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const reader = new window.NDEFReader();
      await reader.scan({ signal: ctrl.signal });

      const uid = await new Promise<{ hex: string; digits: string }>((resolve, reject) => {
        const onRead = (ev: NdefReadingEvent) => {
          const raw = ev.serialNumber ?? "";
          if (!raw) {
            reject(new Error("Card didn't return a serial."));
            return;
          }
          resolve(normalizeSerial(raw));
        };
        const onError = () => reject(new Error("Couldn't read that card. Try again."));
        reader.addEventListener("reading", onRead);
        reader.addEventListener("readingerror", onError);
        ctrl.signal.addEventListener("abort", () => reject(new Error("Cancelled.")));
      });

      setLastUid(uid);
      setStatus("success");
      ctrl.abort();
      return uid;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "NFC scan failed.";
      // Permission denial gives a specific, actionable hint.
      const friendly = /NotAllowed/i.test(msg)
        ? "NFC permission denied. Enable it in Site settings and try again."
        : /NotSupported/i.test(msg)
          ? "This phone doesn't expose NFC to the browser."
          : msg;
      setError(friendly);
      setStatus("error");
      return null;
    }
  }, [supported]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { supported, status, error, lastUid, scan, stop };
}
