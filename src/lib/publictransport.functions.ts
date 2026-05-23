// Public, unauthenticated endpoints exposed by the official Cyprus Public
// Transport top-up portal. Discovered from the real top-up flow at
// https://www.publictransport.com.cy/topup/page/topup-travel-card —
// no JCC login is required to read a Motion card's balance or list its
// eligible passes. We proxy server-side because the upstream returns
// `Access-Control-Allow-Origin: https://www.publictransport.com.cy` only.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const BASE = "https://www.publictransport.com.cy/api/services/app/WebService";
const HEADERS = {
  accept: "application/json, text/plain, */*",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  referer: "https://www.publictransport.com.cy/topup/page/topup-travel-card",
} as const;

const cardNumberInput = z.object({
  cardNumber: z.string().regex(/^\d{6,20}$/, "Card UID must be 6-20 digits"),
});

// ============================================================
// Verify card — confirms the card exists and returns live balance.
// Used both to validate on save and to refresh the balance later.
// ============================================================
export const verifyMotionCard = createServerFn({ method: "POST" })
  .inputValidator(cardNumberInput.parse)
  .handler(async ({ data }) => {
    const url = `${BASE}/VerifyCard?cardNumber=${encodeURIComponent(data.cardNumber)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { ...HEADERS, "content-length": "0" },
    });
    if (!res.ok) {
      return { ok: false as const, error: `Lookup failed (${res.status}).` };
    }
    const body = (await res.json()) as {
      result?: { balance?: number; cardType?: string | null; result?: string };
      success?: boolean;
    };
    const r = body.result;
    if (!body.success || !r || r.result !== "OK") {
      return { ok: false as const, error: "Card not recognized." };
    }
    return {
      ok: true as const,
      balanceEur: Number(r.balance ?? 0),
      cardType: r.cardType ?? null,
      syncedAt: Date.now(),
    };
  });

// ============================================================
// Get top-up options — returns balance plus the passes available
// to purchase for this specific card.
// ============================================================
export type MotionPassOption = {
  code: string;
  name: string;
  priceEur: number;
  validityDays: number | null;
  companyCode: string;
};

// The upstream serializes each pass as an array of single-property objects
// (e.g. `[{code:"..."},{companyCode:"..."},{name:"..."},{topUpList:{...}}]`).
// Flatten it into a normal record before reading fields.
function flattenEntry(entry: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const item of entry) {
    if (item && typeof item === "object") Object.assign(out, item);
  }
  return out;
}

export const getMotionCardOptions = createServerFn({ method: "POST" })
  .inputValidator(cardNumberInput.parse)
  .handler(async ({ data }) => {
    const url = `${BASE}/GetCardTopup?cardNumber=${encodeURIComponent(data.cardNumber)}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      return { ok: false as const, error: `Lookup failed (${res.status}).` };
    }
    const body = (await res.json()) as {
      result?: {
        balance?: number;
        cptPassList?: unknown[][];
        result?: string;
      };
      success?: boolean;
    };
    const r = body.result;
    if (!body.success || !r || r.result !== "OK") {
      return { ok: false as const, error: "No top-up options for this card." };
    }

    const passes: MotionPassOption[] = (r.cptPassList ?? []).flatMap((entry) => {
      const rec = flattenEntry(entry);
      const top = rec.topUpList as
        | { code?: string; name?: string; price?: string; validityPeriods?: string }
        | undefined;
      if (!top) return [];
      const days = top.validityPeriods ? parseInt(top.validityPeriods, 10) : NaN;
      return [
        {
          code: String(top.code ?? rec.code ?? ""),
          name: String(rec.name ?? top.name ?? ""),
          priceEur: Number(top.price ?? 0),
          validityDays: Number.isFinite(days) ? days : null,
          companyCode: String(rec.companyCode ?? ""),
        },
      ];
    });

    return {
      ok: true as const,
      balanceEur: Number(r.balance ?? 0),
      passes,
      syncedAt: Date.now(),
    };
  });
