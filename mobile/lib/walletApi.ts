// Native client for the /api/public/wallet aggregator.
//
// Mirrors the request/response contracts of the web server functions
// (`jccLogin`, `jccRefresh`, `jccSync`, `verifyMotionCard`,
// `getMotionCardOptions`) so any error mapping / result shape stays
// identical to what the web wallet already handles.

import { API_BASE } from "./api";
import type { MotionPassOption, MotionTxSnapshot } from "./motionPass";

type LoginRes =
  | { ok: true; tokens: { accessToken: string; refreshToken: string; expiresAt: number }; profile: { firstName: string; lastName: string; email: string } }
  | { ok: false; error: string };

type RefreshRes =
  | { ok: true; tokens: { accessToken: string; refreshToken: string; expiresAt: number } }
  | { ok: false; error: string };

type SyncRes =
  | { ok: true; balanceEur: number; passName: string; transactions: MotionTxSnapshot[]; syncedAt: number }
  | { ok: false; code: "expired" }
  | { ok: false; code: "card"; error: string }
  | { ok: false; code: "http"; error: string };

type VerifyRes =
  | { ok: true; balanceEur: number; cardType: string | null; syncedAt: number }
  | { ok: false; error: string };

type OptionsRes =
  | { ok: true; balanceEur: number; passes: MotionPassOption[]; syncedAt: number }
  | { ok: false; error: string };

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}/api/public/wallet`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

export function jccLogin(email: string, password: string): Promise<LoginRes> {
  return call<LoginRes>({ action: "login", email, password });
}
export function jccRefresh(accessToken: string, refreshToken: string): Promise<RefreshRes> {
  return call<RefreshRes>({ action: "refresh", accessToken, refreshToken });
}
export function jccSync(
  accessToken: string,
  cardUid: string,
  period: "Today" | "Yesterday" | "Last7" | "Last30" = "Last30",
): Promise<SyncRes> {
  return call<SyncRes>({ action: "sync", accessToken, cardUid, period });
}
export function verifyMotionCard(cardNumber: string): Promise<VerifyRes> {
  return call<VerifyRes>({ action: "verify", cardNumber });
}
export function getMotionCardOptions(cardNumber: string): Promise<OptionsRes> {
  return call<OptionsRes>({ action: "options", cardNumber });
}
