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
  // Tier label printed on the card face (e.g. "18+ Standard", "65+", "Student").
  tier?: string;
  // Valid-until date as printed on the card (DD/MM/YYYY).
  validUntil?: string;
  balanceEur: number;
  balanceUpdatedAt: number;
  // Card type confirmed by the public verify endpoint (e.g. "Motion").
  cardType?: string | null;
  topups: { id: string; amountEur: number; at: number }[];
  jcc?: JccLink;
  transactions: MotionTxSnapshot[];
  lastSyncAt: number;
  passName?: string;
  // Eligible passes for this card (from the public top-up portal).
  // Optional — only set after a public sync has run.
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
