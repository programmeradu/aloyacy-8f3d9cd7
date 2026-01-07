// Two-way cloud sync for rider data that should follow them across sessions
// and (once linked) across devices.
//
// Pull on auth-ready + tab focus. Push on local change (debounced). Conflicts
// resolved by last-write-wins on `updated_at`. The local copy in localStorage
// remains the source of truth for offline reads; the cloud copy is the durable
// mirror.

import { supabase } from "@/integrations/supabase/client";
import { readPass, writePass, type MotionPass } from "./motion-pass";
import {
  listSavedPlaces,
  type SavedPlace,
} from "./trip-store";

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

// ── Saved places ──────────────────────────────────────────────────────────
// Local model is freeform (label + tone + pinned). Cloud model constrains
// `kind` to home/work/custom. We map any label matching /home|work/i to the
// corresponding cloud kind so the unique (user_id, kind) index works; all
// others land as "custom" keyed by the local id (stored in `address` as a
// stable marker — there's no dedicated client-id column).
function placeKind(p: SavedPlace): "home" | "work" | "custom" {
  const l = p.label.toLowerCase();
  if (l === "home") return "home";
  if (l === "work" || l === "office") return "work";
  return "custom";
}

async function pushSavedPlaces(userId: string): Promise<void> {
  const local = listSavedPlaces();
  if (!local.length) return;
  // Upsert each place by (user_id, kind) for home/work, otherwise by id.
  // We translate local UUID-ish id into the row id so re-syncs are stable.
  const rows = local.map((p) => ({
    id: /^[0-9a-f-]{36}$/i.test(p.id) ? p.id : undefined,
    user_id: userId,
    kind: placeKind(p),
    label: p.label.slice(0, 80),
    lat: p.lat,
    lng: p.lng,
    address: p.name,
  }));
  const { error } = await supabase.from("saved_places").upsert(rows);
  if (error) console.warn("[cloud-sync] saved push:", error.message);
}

async function pullSavedPlaces(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from("saved_places")
    .select("*")
    .eq("user_id", userId);
  if (error || !data) return;
  if (!data.length) {
    // Cloud empty — migrate local up if any.
    if (listSavedPlaces().length) await pushSavedPlaces(userId);
    return;
  }
  // Last-write-wins: trust cloud as authoritative for now; do not overwrite
  // local if every cloud row is older than the local mtime equivalent. We
  // don't store local mtimes per-place, so prefer cloud when it exists.
  const mapped: SavedPlace[] = data.map((r) => ({
    id: r.id,
    label: r.label,
    name: r.address || r.label,
    lat: r.lat,
    lng: r.lng,
    tone: r.kind === "home" ? "aegean" : r.kind === "work" ? "ochre" : "olive",
    pinned: r.kind === "home" || r.kind === "work",
    createdAt: new Date(r.created_at).getTime(),
  }));
  if (typeof window !== "undefined") {
    window.localStorage.setItem("aloya:saved-places", JSON.stringify(mapped));
    window.dispatchEvent(
      new CustomEvent("aloya:store", { detail: { key: "aloya:saved-places" } }),
    );
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────
/** Initial pull for a freshly-signed-in user. Idempotent per user_id. */
export async function pullAll(userId: string): Promise<void> {
  if (lastPushedUserId === userId) return;
  lastPushedUserId = userId;
  await Promise.all([
    pullMotionCard(userId).catch((e) =>
      console.warn("[cloud-sync] pull motion:", (e as Error).message),
    ),
    pullSavedPlaces(userId).catch((e) =>
      console.warn("[cloud-sync] pull saved:", (e as Error).message),
    ),
  ]);
}

let savedPushTimer: number | null = null;
/** Debounced push triggered by a local change. */
export function schedulePush(userId: string): void {
  if (typeof window === "undefined") return;
  if (pushTimer != null) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    void pushMotionCard(userId);
  }, 1500);
}

function scheduleSavedPush(userId: string): void {
  if (typeof window === "undefined") return;
  if (savedPushTimer != null) window.clearTimeout(savedPushTimer);
  savedPushTimer = window.setTimeout(() => {
    void pushSavedPlaces(userId);
  }, 1500);
}

/** Wire all listeners that drive cloud sync. Returns a cleanup function. */
export function startCloudSync(userId: string): () => void {
  if (typeof window === "undefined") return () => {};

  void pullAll(userId);

  const onMotionChange = () => schedulePush(userId);
  window.addEventListener("aloya:motionpass", onMotionChange);

  const onStoreChange = (e: Event) => {
    const detail = (e as CustomEvent<{ key: string }>).detail;
    if (!detail || detail.key === "aloya:saved-places") {
      scheduleSavedPush(userId);
    }
  };
  window.addEventListener("aloya:store", onStoreChange);

  const onFocus = () => {
    void pullMotionCard(userId);
    void pullSavedPlaces(userId);
  };
  window.addEventListener("focus", onFocus);

  return () => {
    window.removeEventListener("aloya:motionpass", onMotionChange);
    window.removeEventListener("aloya:store", onStoreChange);
    window.removeEventListener("focus", onFocus);
    if (pushTimer != null) {
      window.clearTimeout(pushTimer);
      pushTimer = null;
    }
    if (savedPushTimer != null) {
      window.clearTimeout(savedPushTimer);
      savedPushTimer = null;
    }
  };
}
