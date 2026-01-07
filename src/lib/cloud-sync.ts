// Two-way cloud sync for rider data that should follow them across sessions
// and (once linked) across devices.
//
// Pull on auth-ready + tab focus. Push on local change (debounced). Conflicts
// resolved by last-write-wins on `updated_at`. The local copy in localStorage
// remains the source of truth for offline reads; the cloud copy is the durable
// mirror.

import { supabase } from "@/integrations/supabase/client";
import { readPass, writePass, type MotionPass } from "./motion-pass";

let lastPushedUserId: string | null = null;
let pushTimer: number | null = null;

// ── Motion card ───────────────────────────────────────────────────────────
type MotionRow = {
  user_id: string;
  card_number: string;
  holder: string | null;
  tier: string | null;
  valid_until: string | null;
  card_type: string | null;
  balance_eur: number;
  balance_updated_at: string | null;
  jcc_email: string | null;
  jcc_display_name: string | null;
  jcc_tokens_encrypted: string | null;
  jcc_linked_at: string | null;
  last_sync_at: string | null;
  pass_name: string | null;
  updated_at: string;
};

function passToRow(pass: MotionPass, userId: string): Omit<MotionRow, "updated_at"> {
  return {
    user_id: userId,
    card_number: pass.number,
    holder: pass.holder || null,
    tier: pass.tier || null,
    valid_until: pass.validUntil || null,
    card_type: pass.cardType || null,
    balance_eur: pass.balanceEur || 0,
    balance_updated_at: pass.balanceUpdatedAt
      ? new Date(pass.balanceUpdatedAt).toISOString()
      : null,
    jcc_email: pass.jcc?.email || null,
    jcc_display_name: pass.jcc?.displayName || null,
    // Tokens are sensitive — only sync after client-side encryption.
    // Until that's wired, leave null (linked account on this device only).
    jcc_tokens_encrypted: null,
    jcc_linked_at: pass.jcc?.linkedAt
      ? new Date(pass.jcc.linkedAt).toISOString()
      : null,
    last_sync_at: pass.lastSyncAt ? new Date(pass.lastSyncAt).toISOString() : null,
    pass_name: pass.passName || null,
  };
}

function rowToPass(row: MotionRow, current: MotionPass): MotionPass {
  const next: MotionPass = {
    ...current,
    number: row.card_number,
    holder: row.holder || current.holder || "",
    tier: row.tier || current.tier,
    validUntil: row.valid_until || current.validUntil,
    cardType: row.card_type ?? current.cardType,
    balanceEur: Number(row.balance_eur) || 0,
    balanceUpdatedAt: row.balance_updated_at
      ? new Date(row.balance_updated_at).getTime()
      : current.balanceUpdatedAt,
    lastSyncAt: row.last_sync_at
      ? new Date(row.last_sync_at).getTime()
      : current.lastSyncAt,
    passName: row.pass_name || current.passName,
  };
  return next;
}

async function pullMotionCard(userId: string): Promise<void> {
  const { data } = await supabase
    .from("motion_card")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  const local = readPass();
  if (!data) {
    // Cloud is empty — migrate the local card up if there is one.
    if (local.number && local.number.replace(/\D/g, "").length >= 6) {
      await pushMotionCard(userId);
    }
    return;
  }
  const row = data as MotionRow;
  const cloudUpdated = new Date(row.updated_at).getTime();
  // If local is fresher, skip pull (push will run separately).
  const localUpdated = Math.max(local.balanceUpdatedAt, local.lastSyncAt);
  if (localUpdated > cloudUpdated) return;
  writePass(rowToPass(row, local));
}

async function pushMotionCard(userId: string): Promise<void> {
  const local = readPass();
  if (!local.number || local.number.replace(/\D/g, "").length < 6) return;
  const row = passToRow(local, userId);
  const { error } = await supabase
    .from("motion_card")
    .upsert(row, { onConflict: "user_id" });
  if (error) console.warn("[cloud-sync] motion push:", error.message);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────
/** Initial pull for a freshly-signed-in user. Idempotent per user_id. */
export async function pullAll(userId: string): Promise<void> {
  if (lastPushedUserId === userId) return;
  lastPushedUserId = userId;
  await pullMotionCard(userId).catch((e) =>
    console.warn("[cloud-sync] pull motion:", (e as Error).message),
  );
}

/** Debounced push triggered by a local change. */
export function schedulePush(userId: string): void {
  if (typeof window === "undefined") return;
  if (pushTimer != null) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    void pushMotionCard(userId);
  }, 1500);
}

/** Wire all listeners that drive cloud sync. Returns a cleanup function. */
export function startCloudSync(userId: string): () => void {
  if (typeof window === "undefined") return () => {};

  void pullAll(userId);

  const onMotionChange = () => schedulePush(userId);
  window.addEventListener("aloya:motionpass", onMotionChange);

  const onFocus = () => void pullMotionCard(userId);
  window.addEventListener("focus", onFocus);

  return () => {
    window.removeEventListener("aloya:motionpass", onMotionChange);
    window.removeEventListener("focus", onFocus);
    if (pushTimer != null) {
      window.clearTimeout(pushTimer);
      pushTimer = null;
    }
  };
}
