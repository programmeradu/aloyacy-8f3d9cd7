// AsyncStorage-backed Motion-card store for the mobile app.
//
// Full parity with the web store in `packages/core/src/motion-pass.ts`:
// JCC link tokens, transactions, eligible passes, card metadata. The
// only differences are storage backend (AsyncStorage vs localStorage)
// and an in-memory subscriber list (vs a `window` custom event) so the
// UI can react to writes from any surface.

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "aloya.motionpass.v1";

export type MotionTxSnapshot = {
  id: string;
  at: string;
  type: string;
  typeName: string;
  priceEur: number;
  balanceEur: number;
  stopName: string;
  route: string;
  passName: string;
};

export type JccLink = {
  email: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  linkedAt: number;
};

export type MotionPassOption = {
  code: string;
  name: string;
  priceEur: number;
  validityDays: number | null;
  companyCode: string;
};

export type MotionPass = {
  number: string;
  holder?: string;
  tier?: string;
  validUntil?: string;
  balanceEur: number;
  balanceUpdatedAt: number;
  cardType?: string | null;
  topups: { id: string; amountEur: number; at: number }[];
  jcc?: JccLink;
  transactions: MotionTxSnapshot[];
  lastSyncAt: number;
  lastScanAt?: number;
  passName?: string;
  passes?: MotionPassOption[];
  passesUpdatedAt?: number;
};

const empty = (): MotionPass => ({
  number: "",
  holder: "",
  balanceEur: 0,
  balanceUpdatedAt: 0,
  topups: [],
  transactions: [],
  lastSyncAt: 0,
});

let cache: MotionPass | null = null;
const listeners = new Set<(p: MotionPass) => void>();

export async function readPass(): Promise<MotionPass> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      cache = empty();
      return cache;
    }
    const parsed = JSON.parse(raw) as Partial<MotionPass>;
    cache = {
      ...empty(),
      ...parsed,
      topups: parsed.topups ?? [],
      transactions: parsed.transactions ?? [],
    };
    return cache;
  } catch {
    cache = empty();
    return cache;
  }
}

export function readPassSync(): MotionPass {
  return cache ?? empty();
}

export async function writePass(next: MotionPass): Promise<void> {
  cache = next;
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  for (const l of listeners) l(next);
}

export function subscribePass(fn: (p: MotionPass) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function mergePass(patch: Partial<MotionPass>): Promise<MotionPass> {
  const current = await readPass();
  const merged: MotionPass = { ...current, ...patch };
  await writePass(merged);
  return merged;
}

export function clearJccLink(pass: MotionPass): MotionPass {
  const next: MotionPass = { ...pass, transactions: [], lastSyncAt: 0 };
  delete next.jcc;
  delete next.passName;
  return next;
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
