// Thin client for /api/public/wallet/ocr.
//
// The CardScanSheet captures a still through expo-camera, downscales it,
// and posts the base64 here. We keep the upload small (target ~700px wide,
// JPEG q=0.7) so each scan round-trips in well under a second on LTE.

import { API_BASE } from "./api";

export type ScannedFields = {
  number: string | null;
  holder: string | null;
  validUntil: string | null;
  confidence: number;
};

export type ScanError = { error: string };

export async function scanCardSide(opts: {
  side: "front" | "back";
  base64: string;
  mimeType?: "image/jpeg" | "image/png" | "image/webp";
}): Promise<ScannedFields | ScanError> {
  try {
    const res = await fetch(`${API_BASE}/api/public/wallet/ocr`, {
      method: "POST",
      headers: { "content-type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        side: opts.side,
        imageBase64: opts.base64,
        mimeType: opts.mimeType ?? "image/jpeg",
      }),
    });
    const body = (await res.json()) as ScannedFields | ScanError;
    if (!res.ok || "error" in body) {
      return { error: "error" in body ? body.error : `OCR ${res.status}` };
    }
    return body;
  } catch (e) {
    return { error: (e as Error).message ?? "Network error" };
  }
}
