/**
 * Per-device bearer tokens.
 *
 * The app identifies anonymous users by a random `deviceId` stored in
 * `localStorage`. That ID alone is not a secret — anyone who learns it
 * could fetch that device's trip history. To bind reads/writes to the
 * actual owner we issue a one-time random token, persist its SHA-256
 * hash keyed by `deviceId`, and require the raw token on every subsequent
 * call. First caller wins; later callers with the same `deviceId` but no
 * token are rejected.
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export type DeviceAuthResult =
  | { ok: true; token: string; created: boolean }
  | { ok: false; error: string };

/** Mint or return the existing token for a device. Only the first caller
 *  for a brand-new `deviceId` receives a token; later callers must already
 *  hold it. */
export async function ensureDeviceToken(deviceId: string): Promise<DeviceAuthResult> {
  const { data: existing, error: readErr } = await supabaseAdmin
    .from("device_auth")
    .select("device_id")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (readErr) return { ok: false, error: readErr.message };
  if (existing) {
    // Token already issued. We never return the raw token a second time —
    // the legitimate device kept it in localStorage on first use.
    return { ok: false, error: "device already claimed" };
  }

  const token = randomBytes(32).toString("base64url");
  const { error: insertErr } = await supabaseAdmin
    .from("device_auth")
    .insert({ device_id: deviceId, token_hash: sha256Hex(token) });

  if (insertErr) {
    // Race: another caller just inserted. Treat as "already claimed".
    return { ok: false, error: "device already claimed" };
  }
  return { ok: true, token, created: true };
}

/** Verify the caller knows the token bound to `deviceId`. */
export async function verifyDeviceToken(
  deviceId: string,
  token: string | undefined | null,
): Promise<boolean> {
  if (!token) return false;
  const { data, error } = await supabaseAdmin
    .from("device_auth")
    .select("token_hash")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error || !data) return false;
  const provided = Buffer.from(sha256Hex(token), "hex");
  const stored = Buffer.from(data.token_hash, "hex");
  if (provided.length !== stored.length) return false;
  return timingSafeEqual(provided, stored);
}
