// AsyncStorage-backed Motion-card store for the mobile app.
//
// Mirrors the shape used by packages/core's motion-pass (which is locked
// to localStorage on web). We keep a separate native implementation so
// the rest of the app can read/write through the same field names while
// data stays on-device until the user explicitly links a JCC account.
//
// Only the fields the mobile rider actually needs in Wave 4 are persisted.
// Top-up / transaction sync still goes through the server when the user
// links JCC — that lives behind the existing public endpoints.

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "aloya.motionpass.v1";

export type MotionPass = {
  number: string;
  holder?: string;
  tier?: string;
  validUntil?: string;
  balanceEur: number;
  balanceUpdatedAt: number;
  lastScanAt?: number;
};

const empty = (): MotionPass => ({
  number: "",
  holder: "",
  balanceEur: 0,
  balanceUpdatedAt: 0,
});

export async function readPass(): Promise<MotionPass> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<MotionPass>;
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
}

export async function writePass(next: MotionPass): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

export async function mergePass(patch: Partial<MotionPass>): Promise<MotionPass> {
  const current = await readPass();
  const merged: MotionPass = { ...current, ...patch };
  await writePass(merged);
  return merged;
}

export function formatCardNumber(num: string): string {
  const clean = num.replace(/\D/g, "");
  if (clean.length <= 10) {
    if (clean.length <= 2) return clean;
    if (clean.length <= 6) return `${clean.slice(0, 2)} ${clean.slice(2)}`;
    return `${clean.slice(0, 2)} ${clean.slice(2, 6)} ${clean.slice(6, 10)}`;
  }
  return clean.match(/.{1,4}/g)?.join(" ") ?? clean;
}

export function maskedNumber(num: string): string {
  const clean = num.replace(/\D/g, "");
  if (clean.length < 4) return "•••• •••• ••";
  const last4 = clean.slice(-4);
  return `•••• •••• ${last4.slice(0, 2)} ${last4.slice(2)}`;
}
