// D1 photo of a stop. One image answers shelter, sign, seating, light.
// Latest photo is the one a rider sees. Unknown stays silent. Moderation
// is ops — we still store and show, because an empty stop is a worse lie
// than an unreviewed photo we can take down.

export const STOP_PHOTO_BUCKET = "stop-photos";
export const PHOTO_MAX_BYTES = 800_000;
export const PHOTO_MAX_B64 = 1_100_000;
export const PHOTO_MAX_EDGE = 1280;
export const PHOTO_RATE_LIMIT_SEC = 60;
export const PHOTO_MIMES = ["image/jpeg", "image/webp"] as const;

export type StopPhotoMime = (typeof PHOTO_MIMES)[number];

export type StopPhoto = {
  stopId: string;
  url: string;
  takenAt: number;
};

export function isStopPhotoMime(value: string): value is StopPhotoMime {
  return (PHOTO_MIMES as readonly string[]).includes(value);
}

/** Reject path traversal. GTFS ids are letters, digits, and a few marks. */
export function photoObjectPath(
  stopId: string,
  id: string,
  mime: StopPhotoMime,
): string | null {
  if (stopId.length < 1 || stopId.length > 128) return null;
  if (stopId.includes("..") || stopId.includes("/") || stopId.includes("\\")) return null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const ext = mime === "image/webp" ? "webp" : "jpg";
  return `${stopId}/${id}.${ext}`;
}

export function looksLikePhoto(bytes: Uint8Array, mime: StopPhotoMime): boolean {
  if (bytes.length < 12) return false;
  if (mime === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

export function decodePhotoBase64(input: string): Uint8Array | null {
  const comma = input.indexOf(",");
  const raw = input.startsWith("data:") && comma >= 0 ? input.slice(comma + 1) : input;
  if (raw.length < 64 || raw.length > PHOTO_MAX_B64) return null;
  if (!/^[A-Za-z0-9+/]+=*$/.test(raw)) return null;
  try {
    const bin = atob(raw);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function pickLatestPhoto(photos: StopPhoto[]): StopPhoto | null {
  if (photos.length === 0) return null;
  let best = photos[0]!;
  for (const p of photos) if (p.takenAt > best.takenAt) best = p;
  return best;
}

/** Photo is the last ask — after shelter, seating, walk, light, step, sign, timetable. */
export function shouldAskStopPhoto(nextAsk: string | null, hasPhoto: boolean): boolean {
  return nextAsk === null && !hasPhoto;
}

export function stopPhotoAsk(): string {
  return "A photo of this stop?";
}

export function stopPhotoTake(): string {
  return "Take photo";
}
