// Local persistence for the user's Motion bus card.
// Phase 1: manual balance entry. Phase 2: optional JCC link that auto-syncs
// balance + transactions through our server proxy. Nothing leaves the device
// except the credentials you explicitly type into the Link sheet.

const KEY = "aloya.motionpass.v1";

export type MotionTxSnapshot = {
  id: string;
  at: string; // ISO datetime from JCC
  type: string; // Topup | EntryValidation | ValidationWithActivation | ...
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
  // Unix ms when the access token expires (decoded from JWT exp claim).
  expiresAt: number;
  linkedAt: number;
};

export type MotionPass = {
  // The 10-16 digit cardUID printed on the back of the card (JCC's
  // BusFare APIs accept up to 16 digits).
  number: string;
  // Holder's display name (optional, just for the front of the card).
  holder?: string;
  // Latest balance — either manually entered or synced from JCC.
  balanceEur: number;
  // Unix ms timestamp the balance was last updated.
  balanceUpdatedAt: number;
  // Manual top-up log (kept for offline use).
  topups: { id: string; amountEur: number; at: number }[];
  // Optional JCC account link. Present once the user has linked.
  jcc?: JccLink;
  // Snapshot of JCC transactions from the last sync.
  transactions: MotionTxSnapshot[];
  // Unix ms of the last successful sync.
  lastSyncAt: number;
  // Pass name (e.g. "30 DAYS Z01-03 (UDF) PERSONALIZED") if known.
  passName?: string;
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

export function readPass(): MotionPass {
  if (typeof window === "undefined") return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<MotionPass>;
    return {
      ...empty(),
      ...parsed,
      topups: parsed.topups ?? [],
      transactions: parsed.transactions ?? [],
    };
  } catch {
    return empty();
  }
}

export function writePass(pass: MotionPass) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(pass));
  window.dispatchEvent(new Event("aloya:motionpass"));
}

export function clearJccLink(pass: MotionPass): MotionPass {
  // Strip account-linked state but keep the card number and offline topups.
  const next: MotionPass = { ...pass, transactions: [], lastSyncAt: 0 };
  delete next.jcc;
  delete next.passName;
  return next;
}

export function formatCardNumber(num: string): string {
  const clean = num.replace(/\D/g, "");
  // Motion plastic shows 10 digits in 2+4+4 groups; longer UIDs from
  // 16-digit chip serials get grouped in fours.
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
