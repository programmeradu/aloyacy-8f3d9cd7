// D1 photo write/read. Magic-bytes and size live in core; this is I/O.

import type { SupabaseClient } from "@/lib/db/compat";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  PHOTO_MAX_BYTES,
  PHOTO_RATE_LIMIT_SEC,
  STOP_PHOTO_BUCKET,
  decodePhotoBase64,
  isStopPhotoMime,
  looksLikePhoto,
  photoObjectPath,
  type StopPhoto,
  type StopPhotoMime,
} from "@aloya/core/stop-photo";

const db = supabaseAdmin as unknown as SupabaseClient;

type PhotoRow = {
  stop_id: string;
  path: string;
  taken_at: string;
};

function missingTable(message: string | undefined): boolean {
  return /stop_photos|does not exist|schema cache/i.test(message ?? "");
}

function publicUrl(path: string): string | null {
  const url = supabaseAdmin.storage.from(STOP_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
  return url || null;
}

function asPhoto(row: PhotoRow): StopPhoto | null {
  const url = publicUrl(row.path);
  if (!url) return null;
  return {
    stopId: row.stop_id,
    url,
    takenAt: Date.parse(row.taken_at) || 0,
  };
}

let bucketReady: Promise<void> | null = null;
function ensureBucket() {
  bucketReady ??= (async () => {
    const { data } = await supabaseAdmin.storage.getBucket(STOP_PHOTO_BUCKET);
    if (data) return;
    const { error } = await supabaseAdmin.storage.createBucket(STOP_PHOTO_BUCKET, {
      public: true,
    });
    if (error && !/exist/i.test(error.message)) {
      throw new Error(`create bucket ${STOP_PHOTO_BUCKET}: ${error.message}`);
    }
  })().catch((err) => {
    bucketReady = null;
    throw err;
  });
  return bucketReady;
}

export async function loadStopPhoto(stopId: string): Promise<StopPhoto | null> {
  const { data, error } = await db
    .from("stop_photos")
    .select("stop_id, path, taken_at")
    .eq("stop_id", stopId)
    .order("taken_at", { ascending: false })
    .limit(1);
  if (error) {
    if (missingTable(error.message)) return null;
    return null;
  }
  const row = (data as PhotoRow[] | null)?.[0];
  return row ? asPhoto(row) : null;
}

export async function uploadStopPhoto(input: {
  deviceId: string;
  stopId: string;
  mime: string;
  imageBase64: string;
}): Promise<
  { ok: true; photo: StopPhoto } | { ok: false; status: number; error: string }
> {
  if (!isStopPhotoMime(input.mime)) {
    return { ok: false, status: 400, error: "Unknown image type" };
  }
  const mime: StopPhotoMime = input.mime;
  const bytes = decodePhotoBase64(input.imageBase64);
  if (!bytes) return { ok: false, status: 400, error: "Bad image" };
  if (bytes.length > PHOTO_MAX_BYTES) {
    return { ok: false, status: 400, error: "Image too large" };
  }
  if (!looksLikePhoto(bytes, mime)) {
    return { ok: false, status: 400, error: "Not a photo" };
  }
  const cutoff = new Date(Date.now() - PHOTO_RATE_LIMIT_SEC * 1000).toISOString();
  const { data: recent, error: recentErr } = await db
    .from("stop_photos")
    .select("id")
    .eq("device_id", input.deviceId)
    .eq("stop_id", input.stopId)
    .gte("taken_at", cutoff)
    .limit(1);
  if (recentErr && missingTable(recentErr.message)) {
    return { ok: false, status: 503, error: "Not ready" };
  }
  if (recent && recent.length > 0) {
    return { ok: false, status: 429, error: "Try again in a minute" };
  }
  const id = crypto.randomUUID();
  const path = photoObjectPath(input.stopId, id, mime);
  if (!path) return { ok: false, status: 400, error: "Unknown stop" };
  try {
    await ensureBucket();
  } catch {
    return { ok: false, status: 503, error: "Not ready" };
  }
  const { error: upErr } = await supabaseAdmin.storage.from(STOP_PHOTO_BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: false,
    cacheControl: "86400",
  });
  if (upErr) return { ok: false, status: 500, error: "Could not save" };
  const { error: insertErr } = await db.from("stop_photos").insert({
    id,
    stop_id: input.stopId,
    device_id: input.deviceId,
    path,
    mime,
    bytes: bytes.length,
  });
  if (insertErr) {
    await supabaseAdmin.storage.from(STOP_PHOTO_BUCKET).remove([path]);
    if (missingTable(insertErr.message)) {
      return { ok: false, status: 503, error: "Not ready" };
    }
    return { ok: false, status: 500, error: "Could not save" };
  }
  const url = publicUrl(path);
  if (!url) return { ok: false, status: 500, error: "Could not save" };
  return { ok: true, photo: { stopId: input.stopId, url, takenAt: Date.now() } };
}
