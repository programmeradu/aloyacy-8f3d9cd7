// Local persistence for the user's Motion bus card. Phase 1: manual entry.
// Nothing leaves the device. Phase 2 will fuse this with a server-side
// balance fetcher once we settle on the legal stance.

const KEY = "aloya.motionpass.v1";

export type MotionPass = {
  // The 10-digit card number printed on the front of the plastic card.
  number: string;
  // Holder's display name (optional, just for the front of the card).
  holder?: string;
  // Manual balance — last value the rider entered, in EUR.
  balanceEur: number;
  // Unix ms timestamp the balance was last entered.
  balanceUpdatedAt: number;
  // Manual top-up log.
  topups: { id: string; amountEur: number; at: number }[];
};

const empty = (): MotionPass => ({
  number: "",
  holder: "",
  balanceEur: 0,
  balanceUpdatedAt: 0,
  topups: [],
});

export function readPass(): MotionPass {
  if (typeof window === "undefined") return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<MotionPass>;
    return { ...empty(), ...parsed, topups: parsed.topups ?? [] };
  } catch {
    return empty();
  }
}

export function writePass(pass: MotionPass) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(pass));
  window.dispatchEvent(new Event("aloya:motionpass"));
}

export function formatCardNumber(num: string): string {
  const clean = num.replace(/\D/g, "");
  // Motion cards are printed in groups of 2 + 4 + 4 (10 digits total).
  if (clean.length <= 2) return clean;
  if (clean.length <= 6) return `${clean.slice(0, 2)} ${clean.slice(2)}`;
  return `${clean.slice(0, 2)} ${clean.slice(2, 6)} ${clean.slice(6, 10)}`;
}

export function maskedNumber(num: string): string {
  const clean = num.replace(/\D/g, "");
  if (clean.length < 4) return "•••• •••• ••";
  const last4 = clean.slice(-4);
  return `•••• •••• ${last4.slice(0, 2)} ${last4.slice(2)}`;
}
