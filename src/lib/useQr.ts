import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Lazy SVG QR — renders client-side, no network. Returns null until ready.
export function useQrSvg(value: string, opts?: { margin?: number; color?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    if (!value) {
      setSvg(null);
      return;
    }
    let cancelled = false;
    QRCode.toString(value, {
      type: "svg",
      margin: opts?.margin ?? 1,
      errorCorrectionLevel: "M",
      color: { dark: opts?.color ?? "#1c1e1a", light: "#00000000" },
    })
      .then((s) => {
        if (!cancelled) setSvg(s);
      })
      .catch(() => {
        if (!cancelled) setSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, opts?.margin, opts?.color]);
  return svg;
}
